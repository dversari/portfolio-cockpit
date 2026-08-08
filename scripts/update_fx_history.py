import json, math
from pathlib import Path

P=Path('portfolio.json')
data=json.loads(P.read_text(encoding='utf-8'))
positions=data.get('positions',[])

# Freeze the FX baseline the first time this feature runs.
base=data.setdefault('fxBase',{})
for p in positions:
    cur=(p.get('feedCurrency') or p.get('currency') or 'EUR').upper()
    fx=float(p.get('fxToEUR') or 1.0)
    if cur=='EUR':
        base['EUR']=1.0
    elif cur not in base and math.isfinite(fx) and fx>0:
        base[cur]=fx

constant_fx_value=0.0
valued=0
for p in positions:
    if p.get('valueEUR') is None:
        continue
    try:
        cur=(p.get('feedCurrency') or p.get('currency') or 'EUR').upper()
        current_fx=float(p.get('fxToEUR') or 1.0)
        base_fx=float(base.get(cur,current_fx))
        eur=float(p['valueEUR'])
        # Strip today's FX from the EUR value, then re-apply the frozen baseline FX.
        native_value=eur/current_fx if current_fx else eur
        constant_fx_value += native_value*base_fx
        valued += 1
    except Exception:
        pass

if valued==len(positions) and valued:
    data['constantFxValue']=round(constant_fx_value,2)
    data['fxEffectEUR']=round((data.get('liveValue') or data.get('verifiedValue') or 0)-constant_fx_value,2)
    data['fxBaseAsOf']=data.get('fxBaseAsOf') or data.get('asOf')
    today=(data.get('asOf') or '')[:10]
    hist=data.setdefault('history',[])
    found=False
    for row in hist:
        if row.get('date')==today:
            row['constantFxValue']=round(constant_fx_value,2)
            found=True
            break
    if not found:
        hist.append({'date':today,'value':round(data.get('liveValue') or data.get('verifiedValue') or 0,2),'constantFxValue':round(constant_fx_value,2)})

P.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print('constant FX',data.get('constantFxValue'),'base',base)
