import json, math, time
from datetime import datetime, timezone
from pathlib import Path
import yfinance as yf

P=Path('portfolio.json')
data=json.loads(P.read_text(encoding='utf-8'))

# FX: units of EUR received for 1 unit of source currency.
def last_close(symbol):
    t=yf.Ticker(symbol)
    h=t.history(period='7d', interval='1d', auto_adjust=False)
    if h is None or h.empty:
        raise RuntimeError('no price')
    closes=[float(x) for x in h['Close'].dropna().tolist()]
    if not closes:
        raise RuntimeError('no close')
    last=closes[-1]
    prev=closes[-2] if len(closes)>1 else None
    cur=None
    try:
        cur=t.fast_info.get('currency')
    except Exception:
        pass
    return last,prev,cur

def fx_to_eur(cur):
    cur=(cur or 'EUR').upper()
    if cur=='EUR': return 1.0
    if cur in ('GBP','GBX','GBPENCE','GBP.'): 
        px,_,_=last_close('GBPEUR=X'); return px
    if cur in ('GBP','GBPENCE'): return last_close('GBPEUR=X')[0]
    if cur=='USD': return last_close('USDEUR=X')[0]
    if cur=='CHF': return last_close('CHFEUR=X')[0]
    if cur=='JPY': return last_close('JPYEUR=X')[0]
    raise RuntimeError(f'unsupported currency {cur}')

verified_value=0.0
verified_cost=0.0
verified_count=0
for p in data['positions']:
    p['verified']=False
    p['error']=None
    p['dayChangePct']=None
    p['price']=None
    p['valueEUR']=None
    # BTP and private/certificate positions are intentionally not guessed.
    if p.get('bond') or p['symbol'].startswith('IT000'):
        p['error']='quotazione automatica non configurata'
        continue
    try:
        price,prev,feed_cur=last_close(p['symbol'])
        cur=(feed_cur or p.get('currency') or 'EUR').upper()
        # Yahoo commonly reports London prices in GBp (pence). If explicitly GBp/GBX, normalize to GBP.
        if cur in ('GBP','GBX') and p['symbol'].endswith('.L') and price>500:
            # Conservative heuristic for pence quotes; SFR.L is normally quoted in pence.
            price_native=price/100.0
            fx=fx_to_eur('GBP')
            if prev is not None: prev=prev/100.0
            cur='GBP'
        elif cur in ('GBX','GBPENCE'):
            price_native=price/100.0; fx=fx_to_eur('GBP')
            if prev is not None: prev=prev/100.0
            cur='GBP'
        else:
            price_native=price; fx=fx_to_eur(cur)
        val=float(p['qty'])*price_native*fx
        if not math.isfinite(val) or val<=0: raise RuntimeError('invalid value')
        p['price']=round(price_native,6)
        p['feedCurrency']=cur
        p['fxToEUR']=round(fx,8)
        p['valueEUR']=round(val,2)
        if prev and prev>0: p['dayChangePct']=round(price_native/prev-1,6)
        p['verified']=True
        verified_value+=val
        verified_cost+=float(p['cost'])
        verified_count+=1
    except Exception as e:
        p['error']=str(e)[:120]
    time.sleep(0.05)

data['asOf']=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
data['verifiedValue']=round(verified_value,2)
data['verifiedCost']=round(verified_cost,2)
data['verifiedCount']=verified_count
data['unverifiedCount']=len(data['positions'])-verified_count
data.setdefault('history',[])
data['history'].append({'date':data['asOf'][:10],'verifiedValue':data['verifiedValue'],'verifiedCount':verified_count})
# keep one record per date and max 730 days
by_date={x['date']:x for x in data['history']}
data['history']=[by_date[k] for k in sorted(by_date)][-730:]
P.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(f"verified {verified_count}/{len(data['positions'])}: EUR {verified_value:,.2f}")