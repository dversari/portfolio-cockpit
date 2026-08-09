import json
from pathlib import Path

P=Path('portfolio.json'); A=Path('analytics.json')
p=json.loads(P.read_text(encoding='utf-8'))
a=json.loads(A.read_text(encoding='utf-8')) if A.exists() else {}

# Use only points created by the same effective look-through methodology.
h=[x for x in sorted(p.get('history',[]),key=lambda z:z.get('date',''))
   if x.get('value') is not None and x.get('effectiveConstantFxValue') is not None and x.get('effectiveFxMethod')=='lookthrough-v1']

attr=a.setdefault('attribution',{})
attr.update({
    'marketEUR':None,'fxEUR':None,'totalChangeEUR':None,
    'incomeEUR':None,'externalFlowsEUR':None,
    'method':'effective-lookthrough-v1',
    'points':len(h)
})

if len(h)>=2:
    first,last=h[0],h[-1]
    total=float(last['value'])-float(first['value'])
    market=float(last['effectiveConstantFxValue'])-float(first['effectiveConstantFxValue'])
    fx=total-market
    attr.update({
        'marketEUR':round(market,2),
        'fxEUR':round(fx,2),
        'totalChangeEUR':round(total,2),
        'fromDate':first.get('date'),
        'toDate':last.get('date'),
        'reconciliationEUR':round(total-market-fx,2),
        'status':'mercato/cambio calcolati con esposizione valutaria effettiva; income e flussi verranno separati dopo import Movimenti Fineco'
    })
else:
    attr['status']='baseline look-through creato: serve almeno un secondo punto giornaliero per separare mercato e cambio'

A.write_text(json.dumps(a,ensure_ascii=False,indent=2),encoding='utf-8')
print('attribution',attr)
