import json
from pathlib import Path

P=Path('portfolio.json'); A=Path('analytics.json')
p=json.loads(P.read_text(encoding='utf-8'))
a=json.loads(A.read_text(encoding='utf-8')) if A.exists() else {}

# v2: total patrimony (securities + free cash), so internal trades do not look like market losses/gains.
h=[x for x in sorted(p.get('history',[]),key=lambda z:z.get('date',''))
   if x.get('totalPatrimonyValue') is not None and x.get('effectiveConstantTotalValue') is not None and x.get('effectiveFxMethod')=='lookthrough-total-v2']

attr=a.setdefault('attribution',{})
attr.update({'marketEUR':None,'fxEUR':None,'totalChangeEUR':None,'incomeEUR':None,'externalFlowsEUR':None,'method':'effective-lookthrough-total-v2','points':len(h)})

if len(h)>=2:
    first,last=h[0],h[-1]
    total=float(last['totalPatrimonyValue'])-float(first['totalPatrimonyValue'])
    market=float(last['effectiveConstantTotalValue'])-float(first['effectiveConstantTotalValue'])
    fx=total-market
    attr.update({'marketEUR':round(market,2),'fxEUR':round(fx,2),'totalChangeEUR':round(total,2),'fromDate':first.get('date'),'toDate':last.get('date'),'reconciliationEUR':round(total-market-fx,2),'status':'mercato/cambio calcolati sul patrimonio totale (titoli + cash); compravendite interne neutralizzate. Income e flussi esterni verranno separati con Movimenti Fineco'})
else:
    attr.update({'fromDate':h[0].get('date') if h else None,'toDate':h[-1].get('date') if h else None,'status':'nuova baseline attribution sul patrimonio totale creata: serve un secondo punto giornaliero'})

A.write_text(json.dumps(a,ensure_ascii=False,indent=2),encoding='utf-8')
print('attribution',attr)
