import json
from datetime import date, datetime, timedelta
from pathlib import Path

P=Path('portfolio.json'); A=Path('analytics.json')
p=json.loads(P.read_text(encoding='utf-8'))
a=json.loads(A.read_text(encoding='utf-8')) if A.exists() else {}

# Only use the new history based on total patrimony (securities + free cash).
# This prevents a sale from being misread as a negative portfolio return.
h=[]
for x in sorted(p.get('history',[]), key=lambda z:z.get('date','')):
    if x.get('totalPatrimonyValue') is None or x.get('effectiveFxMethod')!='lookthrough-total-v2':
        continue
    try:
        d=date.fromisoformat(str(x['date'])[:10])
        h.append((d,float(x['totalPatrimonyValue'])))
    except Exception:
        pass

r={
    'today':None,'1w':None,'1m':None,'ytd':None,'1y':None,'sinceStart':None,
    'twr':None,
    'twrStatus':'in attesa flussi Fineco; rendimenti semplici calcolati sul patrimonio totale'
}

def ret_between(start_value,end_value):
    return end_value/start_value-1 if start_value else None

def nearest_on_or_before(target):
    candidates=[z for z in h if z[0] <= target]
    return candidates[-1] if candidates else None

if len(h)>=2:
    end_d,end_v=h[-1]
    prev_d,prev_v=h[-2]
    r['today']=ret_between(prev_v,end_v)
    first_d,first_v=h[0]
    r['sinceStart']=ret_between(first_v,end_v)

    for key,days in [('1w',7),('1m',30),('1y',365)]:
        base=nearest_on_or_before(end_d-timedelta(days=days))
        if base and base[0] < end_d:
            r[key]=ret_between(base[1],end_v)

    ytd_candidates=[z for z in h if z[0].year==end_d.year]
    if len(ytd_candidates)>=2:
        r['ytd']=ret_between(ytd_candidates[0][1],end_v)
else:
    r['twrStatus']='nuova baseline sul patrimonio totale: serve un secondo punto giornaliero'

a['periodReturns']=r
A.write_text(json.dumps(a,ensure_ascii=False,indent=2),encoding='utf-8')
print('period returns',r)
