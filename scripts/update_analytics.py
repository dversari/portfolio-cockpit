import json, math
from datetime import datetime, timezone
from pathlib import Path
import yfinance as yf
P=Path('portfolio.json'); OUT=Path('analytics.json')
data=json.loads(P.read_text(encoding='utf-8')); positions=data.get('positions',[]); now=datetime.now(timezone.utc)
def pct_change(series,days=None,ytd=False):
    if series is None or len(series)<2:return None
    s=series.dropna(); end=float(s.iloc[-1])
    if ytd:
        y=s[s.index.year==s.index[-1].year]
        if len(y)<2:return None
        start=float(y.iloc[0])
    else:start=float(s.iloc[-1-min(days or len(s)-1,len(s)-1)])
    return end/start-1 if start else None
def hist(symbol,period='max'):
    try:
        h=yf.Ticker(symbol).history(period=period,interval='1d',auto_adjust=False)
        return None if h is None or h.empty else h['Close'].dropna()
    except Exception:return None
swda=hist('SWDA.MI','max'); bench={'name':'MSCI World (SWDA)'}
if swda is not None and len(swda):
    cur=float(swda.iloc[-1]);ath=float(swda.max());ad=swda.idxmax().date().isoformat()
    bench.update({'price':cur,'ath':ath,'athDate':ad,'drawdownATH':cur/ath-1 if ath else None,'daysSinceATH':(swda.index[-1].date()-swda.idxmax().date()).days,'returns':{'1w':pct_change(swda,5),'1m':pct_change(swda,21),'ytd':pct_change(swda,ytd=True),'1y':pct_change(swda,252)}})
catvals={}
for p in positions:
    v=float(p.get('valueEUR') or 0)
    if v>0:catvals[p.get('cat') or 'Altro']=catvals.get(p.get('cat') or 'Altro',0)+v
ptot=sum(catvals.values()) or 1; weights={k:v/ptot for k,v in catvals.items()}
proxy_map={'Core':'SWDA.MI','Semicore':'SWDA.MI','Speculativo':'SWDA.MI','Obbligazioni':'AGGH.MI','Commodities':'CMOD.MI','Liquidità':'XEON.MI'}
proxy_w={}
for cat,w in weights.items():
    sym=proxy_map.get(cat)
    if sym:proxy_w[sym]=proxy_w.get(sym,0)+w
s=sum(proxy_w.values()) or 1;proxy_w={k:v/s for k,v in proxy_w.items()};series={k:hist(k,'2y') for k in proxy_w};valid=[x for x in series.values() if x is not None and len(x)>2];composite={'name':'Benchmark composito proxy','weights':proxy_w,'returns':{}}
if valid:
    common=valid[0].index
    for x in valid[1:]:common=common.intersection(x.index)
    if len(common)>2:
        import pandas as pd
        rets=[]
        for i in range(1,len(common)):
            rr=ww=0
            for sym,w in proxy_w.items():
                ser=series.get(sym)
                if ser is not None and common[i] in ser.index and common[i-1] in ser.index:
                    a=float(ser.loc[common[i-1]]);b=float(ser.loc[common[i]])
                    if a:rr+=w*(b/a-1);ww+=w
            rets.append(rr/ww if ww else 0)
        idx=[100.0]
        for r in rets:idx.append(idx[-1]*(1+r))
        comp=pd.Series(idx,index=common[:len(idx)]);composite['returns']={'1w':pct_change(comp,5),'1m':pct_change(comp,21),'ytd':pct_change(comp,ytd=True),'1y':pct_change(comp,252)}
history=sorted(data.get('history',[]),key=lambda x:x.get('date',''));ph=[x for x in history if x.get('value')];periods={'today':None,'1w':None,'1m':None,'ytd':None,'1y':None,'sinceStart':None,'twr':None,'twrStatus':'in attesa flussi Fineco'}
if len(ph)>=2:
    vals=[float(x['value']) for x in ph];periods['sinceStart']=vals[-1]/vals[0]-1 if vals[0] else None
    def p_ret(n):return vals[-1]/vals[-1-min(n,len(vals)-1)]-1
    periods['1w']=p_ret(7);periods['1m']=p_ret(30);periods['1y']=p_ret(365);yh=[x for x in ph if str(x.get('date','')).startswith(str(now.year))]
    if len(yh)>=2:periods['ytd']=float(yh[-1]['value'])/float(yh[0]['value'])-1
num=den=0
for p in positions:
    v=p.get('valueEUR');r=p.get('dayChangePct')
    if v is not None and r is not None and 1+r!=0:
        prev=float(v)/(1+float(r));num+=float(v)-prev;den+=prev
periods['today']=num/den if den else None
risk={'vol30':None,'vol90':None,'betaWorld':None,'var95_1d':None,'status':'storico insufficiente'}
vals_sorted=sorted([(float(p.get('valueEUR') or 0),p.get('name')) for p in positions],reverse=True);concentration={'top5':sum(v for v,_ in vals_sorted[:5])/ptot,'top10':sum(v for v,_ in vals_sorted[:10])/ptot,'largest':{'name':vals_sorted[0][1],'weight':vals_sorted[0][0]/ptot} if vals_sorted else None}
# Effective economic currency exposure. ETF mappings are pragmatic look-through proxies and can be refined from issuer holdings.
ETF_FX={
'SWDA.MI':{'USD':.72,'JPY':.055,'GBP':.035,'CAD':.03,'EUR':.105,'CHF':.025,'AUD':.02,'OTHER':.01},
'IWVL.MI':{'USD':.62,'JPY':.08,'GBP':.06,'EUR':.14,'CAD':.035,'CHF':.025,'AUD':.02,'OTHER':.02},
'IWMO.MI':{'USD':.70,'JPY':.06,'GBP':.04,'EUR':.11,'CAD':.03,'CHF':.025,'AUD':.02,'OTHER':.015},
'WDSD.DE':{'USD':.60,'JPY':.10,'GBP':.06,'EUR':.12,'CAD':.045,'AUD':.035,'CHF':.01,'OTHER':.03},
'XMME.MI':{'CNY':.24,'TWD':.20,'INR':.18,'KRW':.10,'BRL':.05,'SAR':.04,'ZAR':.03,'MXN':.03,'USD':.05,'OTHER':.08},
'RBOT.MI':{'USD':.55,'JPY':.15,'EUR':.15,'TWD':.05,'GBP':.025,'CHF':.025,'OTHER':.05},
'NCLR.MI':{'USD':.48,'CAD':.24,'EUR':.09,'GBP':.05,'JPY':.04,'AUD':.04,'OTHER':.06},
'AIPO.MI':{'USD':.75,'EUR':.10,'TWD':.05,'JPY':.03,'GBP':.02,'OTHER':.05},
'AGGH.MI':{'EUR':1.0},'IBCX.MI':{'EUR':1.0},'SEGA.MI':{'EUR':1.0},'XEON.MI':{'EUR':1.0},'CATB.MI':{'USD':.80,'EUR':.10,'GBP':.05,'OTHER':.05},
'CMOD.MI':{'USD':1.0},'XAD5.DE':{'USD':1.0},'HNX3.MI':{'KRW':1.0}
}
cur_explicit={};cur_eff={};mapped=0
for p in positions:
    v=float(p.get('valueEUR') or 0);c=(p.get('feedCurrency') or p.get('currency') or 'EUR').upper();cur_explicit[c]=cur_explicit.get(c,0)+v
    m=ETF_FX.get(p.get('symbol'))
    if m:
        mapped+=v
        for cc,w in m.items():cur_eff[cc]=cur_eff.get(cc,0)+v*w
    else:cur_eff[c]=cur_eff.get(c,0)+v
currency={'explicit':{k:v/ptot for k,v in sorted(cur_explicit.items(),key=lambda z:-z[1])},'effective':{k:v/ptot for k,v in sorted(cur_eff.items(),key=lambda z:-z[1])},'lookThroughCoverage':mapped/ptot,'lookThroughStatus':'Esposizione economica stimata: look-through proxy per ETF; hedged EUR trattati EUR. Da affinare con holdings issuer.'}
stale=[p for p in positions if p.get('stale') and p.get('valueEUR') is not None];stale_val=sum(float(p.get('valueEUR') or 0) for p in stale);data_quality={'freshPositions':len(positions)-len(stale),'totalPositions':len(positions),'freshValuePct':1-stale_val/ptot,'staleValuePct':stale_val/ptot,'stale':[]}
for p in stale:
    age=None
    try:age=(now-datetime.fromisoformat(str(p.get('lastGoodAsOf')).replace('Z','+00:00'))).total_seconds()/3600
    except Exception:pass
    data_quality['stale'].append({'name':p.get('name'),'valueEUR':p.get('valueEUR'),'ageHours':age})
attribution={'marketEUR':None,'fxEUR':data.get('fxEffectEUR'),'incomeEUR':None,'externalFlowsEUR':None,'status':'parziale: mercato/cambio attivi; income e flussi richiedono Movimenti Fineco'};fx_hist=[x for x in ph if x.get('constantFxValue') is not None]
if fx_hist:attribution['marketEUR']=float(data.get('constantFxValue') or fx_hist[-1]['constantFxValue'])-float(fx_hist[0]['constantFxValue'])
income={'ytd':None,'next12m':None,'status':'in attesa import Movimenti Fineco'};events={'items':[],'status':'in attesa dati completi; scadenze BTP verranno integrate dal file Fineco'}
out={'asOf':now.strftime('%Y-%m-%dT%H:%M:%SZ'),'benchmark':bench,'compositeBenchmark':composite,'periodReturns':periods,'risk':risk,'concentration':concentration,'currencyExposure':currency,'dataQuality':data_quality,'attribution':attribution,'income':income,'events':events};OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8');print('analytics updated')