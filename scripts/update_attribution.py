import json
from datetime import date, timedelta
from pathlib import Path

P=Path('portfolio.json'); A=Path('analytics.json'); M=Path('fineco_movements.json')
p=json.loads(P.read_text(encoding='utf-8'))
a=json.loads(A.read_text(encoding='utf-8')) if A.exists() else {}
mov=json.loads(M.read_text(encoding='utf-8')) if M.exists() else {'items':[],'summary':{}}
items=mov.get('items',[]); summary=mov.get('summary',{})

def as_date(v):
    try:return date.fromisoformat(str(v)[:10])
    except:return None

def ext_flow(start,end):
    return round(sum(float(x.get('amountEUR') or 0) for x in items if x.get('type')=='external_flow' and as_date(x.get('date')) and start < as_date(x.get('date')) <= end),2)

def income_between(start,end):
    kinds={'dividend','dividend_tax','interest','interest_tax'}
    return round(sum(float(x.get('amountEUR') or 0) for x in items if x.get('type') in kinds and as_date(x.get('date')) and start <= as_date(x.get('date')) <= end),2)

# Income card is cumulative from the imported Fineco movement history, not from
# the (shorter) attribution baseline. Therefore it must not reset when a new
# market/FX baseline is created.
cumulative_income=round(float(summary.get('incomeNetEUR') or 0),2)

# Attribution: total patrimony (securities + free cash), so internal trades are neutral.
h=[x for x in sorted(p.get('history',[]),key=lambda z:z.get('date','')) if x.get('totalPatrimonyValue') is not None and x.get('effectiveConstantTotalValue') is not None and x.get('effectiveFxMethod')=='lookthrough-total-v2']
attr=a.setdefault('attribution',{})
attr.update({'marketEUR':None,'fxEUR':None,'totalChangeEUR':None,'incomeEUR':cumulative_income,'externalFlowsEUR':None,'method':'effective-lookthrough-total-v2','points':len(h)})
if len(h)>=2:
    first,last=h[0],h[-1]; fd=as_date(first.get('date')); td=as_date(last.get('date'))
    total=float(last['totalPatrimonyValue'])-float(first['totalPatrimonyValue'])
    flow=ext_flow(fd,td) if fd and td else 0.0
    # Market+FX explain patrimony movement net of external flows. Income is
    # already embedded in patrimony and is shown separately as a cumulative
    # informational figure from the full imported Fineco movement history.
    market=float(last['effectiveConstantTotalValue'])-float(first['effectiveConstantTotalValue'])-flow
    fx=(total-flow)-market
    attr.update({'marketEUR':round(market,2),'fxEUR':round(fx,2),'totalChangeEUR':round(total,2),'incomeEUR':cumulative_income,'externalFlowsEUR':flow,'fromDate':first.get('date'),'toDate':last.get('date'),'reconciliationEUR':round((total-flow)-market-fx,2),'status':'patrimonio totale; compravendite interne neutralizzate; reddito cumulato da Movimenti Fineco'})
else:
    attr.update({'fromDate':h[0].get('date') if h else None,'toDate':h[-1].get('date') if h else None,'status':'nuova baseline attribution sul patrimonio totale creata: serve un secondo punto giornaliero; reddito cumulato da Movimenti Fineco'})

# Income from imported Fineco movements.
a['income']={'ytd':cumulative_income,'dividendsGrossEUR':round(float(summary.get('dividendsGrossEUR') or 0),2),'dividendTaxesEUR':round(float(summary.get('dividendTaxesEUR') or 0),2),'interestGrossEUR':round(float(summary.get('interestGrossEUR') or 0),2),'interestTaxesEUR':round(float(summary.get('interestTaxesEUR') or 0),2),'next12m':None,'status':'Movimenti Fineco importati'}

# Period returns: total patrimony only. Do not show 1w/1m/YTD/1y until enough total-patrimony history exists.
ph=[]
for x in sorted(p.get('history',[]),key=lambda z:z.get('date','')):
    dt=as_date(x.get('date')); val=x.get('totalPatrimonyValue')
    if dt and val is not None: ph.append((dt,float(val)))
periods=a.setdefault('periodReturns',{})
for k in ('today','1w','1m','ytd','1y','sinceStart','twr'):periods[k]=None
periods['twrStatus']='storico patrimonio totale insufficiente'
if len(ph)>=2:
    factors=[]
    for (d0,v0),(d1,v1) in zip(ph,ph[1:]):
        f=ext_flow(d0,d1)
        if v0:factors.append((d1,(v1-f)/v0))
    def chained_since(start):
        fs=[f for dt,f in factors if dt>start]
        if not fs:return None
        out=1.0
        for f in fs:out*=f
        return out-1
    firstd,lastd=ph[0][0],ph[-1][0]
    if factors:periods['today']=factors[-1][1]-1
    periods['sinceStart']=chained_since(firstd-timedelta(days=1)); periods['twr']=periods['sinceStart']
    periods['twrStatus']='TWR su patrimonio totale; bonifici esterni neutralizzati da Movimenti Fineco'
    if firstd<=lastd-timedelta(days=7):periods['1w']=chained_since(lastd-timedelta(days=7))
    if firstd<=lastd-timedelta(days=30):periods['1m']=chained_since(lastd-timedelta(days=30))
    jan1=date(lastd.year,1,1)
    if firstd<=jan1:periods['ytd']=chained_since(jan1-timedelta(days=1))
    if firstd<=lastd-timedelta(days=365):periods['1y']=chained_since(lastd-timedelta(days=365))

A.write_text(json.dumps(a,ensure_ascii=False,indent=2),encoding='utf-8')
print('attribution',attr,'periods',periods)
