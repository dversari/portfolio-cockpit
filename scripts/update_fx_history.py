import json, math
from pathlib import Path
import yfinance as yf

P=Path('portfolio.json')
data=json.loads(P.read_text(encoding='utf-8'))
positions=data.get('positions',[])

# Effective economic currency look-through. Hedged EUR funds stay EUR.
ETF_FX={
'SWDA.MI':{'USD':.72,'JPY':.055,'GBP':.035,'CAD':.03,'EUR':.105,'CHF':.025,'AUD':.02,'OTHER':.01},
'IWVL.MI':{'USD':.62,'JPY':.08,'GBP':.06,'EUR':.14,'CAD':.035,'CHF':.025,'AUD':.02,'OTHER':.02},
'IWMO.MI':{'USD':.70,'JPY':.06,'GBP':.04,'EUR':.11,'CAD':.03,'CHF':.025,'AUD':.02,'OTHER':.015},
'WDSD.DE':{'USD':.60,'JPY':.10,'GBP':.06,'EUR':.12,'CAD':.045,'AUD':.035,'CHF':.01,'OTHER':.03},
'XMME.MI':{'CNY':.24,'TWD':.20,'INR':.18,'KRW':.10,'BRL':.05,'SAR':.04,'ZAR':.03,'MXN':.03,'USD':.05,'OTHER':.08},
'RBOT.MI':{'USD':.55,'JPY':.15,'EUR':.15,'TWD':.05,'GBP':.025,'CHF':.025,'OTHER':.05},
'NCLR.MI':{'USD':.48,'CAD':.24,'EUR':.09,'GBP':.05,'JPY':.04,'AUD':.04,'OTHER':.06},
'AIPO.MI':{'USD':.75,'EUR':.10,'TWD':.05,'JPY':.03,'GBP':.02,'OTHER':.05},
'AGGH.MI':{'EUR':1.0},'IBCX.MI':{'EUR':1.0},'SEGA.MI':{'EUR':1.0},'XEON.MI':{'EUR':1.0},
'CATB.MI':{'USD':.80,'EUR':.10,'GBP':.05,'OTHER':.05},'CMOD.MI':{'USD':1.0},'XAD5.DE':{'USD':1.0},'HNX3.MI':{'KRW':1.0}
}

FX_SYMBOL={
'USD':'USDEUR=X','GBP':'GBPEUR=X','JPY':'JPYEUR=X','CAD':'CADEUR=X','CHF':'CHFEUR=X','AUD':'AUDEUR=X',
'CNY':'CNYEUR=X','TWD':'TWDEUR=X','INR':'INREUR=X','KRW':'KRWEUR=X','BRL':'BRLEUR=X','SAR':'SAREUR=X',
'ZAR':'ZAREUR=X','MXN':'MXNEUR=X'
}

def fx_rate(cur):
    if cur in ('EUR','OTHER'): return 1.0
    sym=FX_SYMBOL.get(cur)
    if not sym:return 1.0
    try:
        h=yf.Ticker(sym).history(period='5d',interval='1d',auto_adjust=False)
        if h is not None and not h.empty:
            v=float(h['Close'].dropna().iloc[-1])
            if math.isfinite(v) and v>0:return v
    except Exception:pass
    return None

# Keep legacy explicit-currency baseline for backward compatibility.
base=data.setdefault('fxBase',{})
for p in positions:
    cur=(p.get('feedCurrency') or p.get('currency') or 'EUR').upper()
    fx=float(p.get('fxToEUR') or 1.0)
    if cur=='EUR':base['EUR']=1.0
    elif cur not in base and math.isfinite(fx) and fx>0:base[cur]=fx

constant_fx_value=0.0; valued=0
for p in positions:
    if p.get('valueEUR') is None:continue
    try:
        cur=(p.get('feedCurrency') or p.get('currency') or 'EUR').upper()
        current_fx=float(p.get('fxToEUR') or 1.0);base_fx=float(base.get(cur,current_fx));eur=float(p['valueEUR'])
        native_value=eur/current_fx if current_fx else eur
        constant_fx_value+=native_value*base_fx;valued+=1
    except Exception:pass

# New effective look-through FX baseline. This series deliberately starts fresh.
needed={'EUR'}
for p in positions:
    m=ETF_FX.get(p.get('symbol'))
    if m:needed.update(m.keys())
    else:needed.add((p.get('feedCurrency') or p.get('currency') or 'EUR').upper())
current_rates={c:fx_rate(c) for c in needed}
eff_base=data.setdefault('effectiveFxBase',{})
for c,r in current_rates.items():
    if r is not None and c not in eff_base:eff_base[c]=r
if 'EUR' not in eff_base:eff_base['EUR']=1.0
if 'OTHER' not in eff_base:eff_base['OTHER']=1.0

effective_constant=0.0;eff_valued=0
for p in positions:
    if p.get('valueEUR') is None:continue
    eur=float(p['valueEUR']);m=ETF_FX.get(p.get('symbol'))
    if not m:
        c=(p.get('feedCurrency') or p.get('currency') or 'EUR').upper();m={c:1.0}
    factor=0.0;ws=0.0;ok=True
    for c,w in m.items():
        cur=current_rates.get(c,1.0 if c in ('EUR','OTHER') else None);b=eff_base.get(c)
        if cur is None or b is None or not b:ok=False;break
        factor+=float(w)*(float(cur)/float(b));ws+=float(w)
    if ok and ws>0 and factor>0:
        # Normalize mappings whose rounded weights do not sum exactly to 1.
        factor/=ws
        effective_constant+=eur/factor;eff_valued+=1

if valued==len(positions) and valued:
    data['constantFxValue']=round(constant_fx_value,2)
    data['fxEffectEUR']=round((data.get('liveValue') or data.get('verifiedValue') or 0)-constant_fx_value,2)
    data['fxBaseAsOf']=data.get('fxBaseAsOf') or data.get('asOf')

if eff_valued==len(positions) and eff_valued:
    live=float(data.get('liveValue') or data.get('verifiedValue') or 0)
    data['effectiveConstantFxValue']=round(effective_constant,2)
    data['effectiveFxEffectEUR']=round(live-effective_constant,2)
    data['effectiveFxBaseAsOf']=data.get('effectiveFxBaseAsOf') or data.get('asOf')
    today=(data.get('asOf') or '')[:10]
    hist=data.setdefault('history',[])
    row=next((x for x in hist if x.get('date')==today),None)
    if row is None:
        row={'date':today,'value':round(live,2)};hist.append(row)
    row['constantFxValue']=round(constant_fx_value,2) if valued==len(positions) else row.get('constantFxValue')
    # Only compare effective points created with this methodology.
    row['effectiveConstantFxValue']=round(effective_constant,2)
    row['effectiveFxMethod']='lookthrough-v1'

P.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print('effective constant FX',data.get('effectiveConstantFxValue'),'baseline',data.get('effectiveFxBaseAsOf'))
