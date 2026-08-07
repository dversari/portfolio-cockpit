import json, math, re, time
from datetime import datetime, timezone
from pathlib import Path

import requests
import yfinance as yf
from bs4 import BeautifulSoup

P = Path('portfolio.json')
data = json.loads(P.read_text(encoding='utf-8'))
UA = {'User-Agent':'Mozilla/5.0 PortfolioCockpit/1.0'}

# Official/market-source mappings for instruments Yahoo does not cover well.
BTP_ISIN = {
    'BTP-23GN31 IT SI CUM': 'IT0005713547',  # secondary-market ISIN of BTP Italia SI
    'BTP-1ST38 2.95': 'IT0005321325',
    'BTP-1AP28 3.4': 'IT0005521981',
    'BTP-1AP31 0.9': 'IT0005422891',
    'BTP-1ST49 3.85': 'IT0005363111',
    'BTP-10MZ32 VAL CUM': 'IT0005696320',
    'BTP-1ST52 2.15': 'IT0005480980',
}
CERT_ISIN = {'LEVA FISSA SPACEX LONG 3X':'IT0005710873'}

def num_it(s):
    s = s.strip().replace('\xa0',' ').replace('€','').replace('%','')
    s = re.sub(r'[^0-9,.-]', '', s)
    if not s: raise ValueError('empty number')
    # Italian pages: dot thousands, comma decimals
    if ',' in s:
        s = s.replace('.','').replace(',','.')
    return float(s)

def last_close(symbol):
    t = yf.Ticker(symbol)
    h = t.history(period='7d', interval='1d', auto_adjust=False)
    if h is None or h.empty: raise RuntimeError('no Yahoo price')
    closes = [float(x) for x in h['Close'].dropna().tolist()]
    if not closes: raise RuntimeError('no Yahoo close')
    cur = None
    try: cur = t.fast_info.get('currency')
    except Exception: pass
    return closes[-1], (closes[-2] if len(closes)>1 else None), cur

def fx_to_eur(cur):
    cur=(cur or 'EUR').upper()
    if cur=='EUR': return 1.0
    sym={'USD':'USDEUR=X','GBP':'GBPEUR=X','CHF':'CHFEUR=X','JPY':'JPYEUR=X'}.get(cur)
    if not sym: raise RuntimeError(f'unsupported currency {cur}')
    return last_close(sym)[0]

def borsa_btp(isin):
    url=f'https://www.borsaitaliana.it/borsa/obbligazioni/mot/btp/dati-completi.html?isin={isin}'
    r=requests.get(url,headers=UA,timeout=20); r.raise_for_status()
    soup=BeautifulSoup(r.text,'html.parser')
    txt=' '.join(soup.stripped_strings)
    m=re.search(r'Prezzo Ultimo Contratto\s*\|?\s*([0-9]+(?:[.,][0-9]+)?)',txt,re.I)
    if not m:
        # fallback: headline often begins with current price
        m=re.search(r'\b([0-9]{2,3}[,.][0-9]{1,5})\s+[+-]?[0-9,.]+%',txt)
    if not m: raise RuntimeError('Borsa Italiana: prezzo non trovato')
    price=num_it(m.group(1))
    vm=re.search(r'Var %\s*\|?\s*([+-]?[0-9]+(?:[.,][0-9]+)?)',txt,re.I)
    change=(num_it(vm.group(1))/100.0 if vm else None)
    return price, change, url

def vorvel_cert(isin):
    # Current leveraged-certificates table. We take mid bid/ask; if only one side exists, use it.
    url='https://www.vorvel.eu/it/certificati/certificati-leva?order=ISINCODECERT&page=2&sort=asc'
    r=requests.get(url,headers=UA,timeout=20); r.raise_for_status()
    soup=BeautifulSoup(r.text,'html.parser')
    row=None
    for tr in soup.find_all('tr'):
        if isin in tr.get_text(' ',strip=True): row=tr; break
    if row is None: raise RuntimeError('Vorvel: ISIN non trovato')
    vals=[]
    for td in row.find_all(['td','th']):
        t=td.get_text(' ',strip=True)
        if re.fullmatch(r'[0-9]+(?:[.,][0-9]+)?',t):
            try: vals.append(num_it(t))
            except: pass
    # For this table the central small decimal values are bid/ask; filter out lots/volumes/dates.
    plausible=[x for x in vals if 0.01 <= x <= 1000]
    # For IT0005710873 current bid/ask are around single digits; choose the closest pair.
    pairs=[]
    for a,b in zip(plausible,plausible[1:]):
        if a>0 and b>0 and abs(a-b)/max(a,b)<0.25: pairs.append((a,b))
    if not pairs: raise RuntimeError('Vorvel: bid/ask non interpretabili')
    bid,ask=pairs[-1]
    return (bid+ask)/2.0, None, url

def apply_quote(p, price_native, cur='EUR', day_change=None, source=''):
    fx=fx_to_eur(cur)
    val=float(p['qty'])*float(price_native)*fx
    if not math.isfinite(val) or val<=0: raise RuntimeError('invalid value')
    # Sanity guard: catches pence/sterling, wrong ticker, wrong contract multiplier.
    c=float(p.get('cost') or 0)
    if c>0 and (val > c*8 or val < c/8):
        raise RuntimeError(f'quotazione incoerente con costo storico ({source})')
    p['price']=round(float(price_native),6)
    p['feedCurrency']=cur
    p['fxToEUR']=round(fx,8)
    p['valueEUR']=round(val,2)
    p['dayChangePct']=day_change
    p['source']=source
    p['verified']=True
    return val

verified_value=0.0; verified_cost=0.0; verified_count=0
for p in data['positions']:
    p.update({'verified':False,'error':None,'dayChangePct':None,'price':None,'valueEUR':None,'source':None})
    try:
        if p['name'] in BTP_ISIN:
            price,chg,url=borsa_btp(BTP_ISIN[p['name']])
            # BTP quote is percent of nominal, so convert nominal to units of 100.
            native_value=(float(p['qty'])/100.0)*price
            # apply_quote expects qty*price: use direct calculation here.
            val=native_value
            c=float(p.get('cost') or 0)
            if c>0 and (val>c*2 or val<c/2): raise RuntimeError('BTP quote incoerente')
            p.update({'price':round(price,5),'feedCurrency':'EUR','fxToEUR':1.0,'valueEUR':round(val,2),'dayChangePct':chg,'source':'Borsa Italiana MOT','verified':True,'isin':BTP_ISIN[p['name']]})
        elif p['name'] in CERT_ISIN:
            price,chg,url=vorvel_cert(CERT_ISIN[p['name']])
            val=apply_quote(p,price,'EUR',chg,'Vorvel')
            p['isin']=CERT_ISIN[p['name']]
        else:
            price,prev,feed_cur=last_close(p['symbol'])
            cur=(feed_cur or p.get('currency') or 'EUR').upper()
            # London feed frequently labels pence instruments as GBP. SFR.L is quoted in pence.
            if p['symbol']=='SFR.L':
                price/=100.0
                if prev is not None: prev/=100.0
                cur='GBP'
            elif cur in ('GBX','GBPENCE'):
                price/=100.0
                if prev is not None: prev/=100.0
                cur='GBP'
            chg=(round(price/prev-1,6) if prev and prev>0 else None)
            val=apply_quote(p,price,cur,chg,'Yahoo Finance')
        verified_value += val
        verified_cost += float(p['cost'])
        verified_count += 1
    except Exception as e:
        p['error']=str(e)[:160]
    time.sleep(0.08)

data['asOf']=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
data['verifiedValue']=round(verified_value,2)
data['verifiedCost']=round(verified_cost,2)
data['verifiedCount']=verified_count
data['unverifiedCount']=len(data['positions'])-verified_count
# Prefer a complete portfolio value only when all positions have prices.
data['liveValue']=round(verified_value,2) if verified_count==len(data['positions']) else None
data.setdefault('history',[])
data['history'].append({'date':data['asOf'][:10],'verifiedValue':data['verifiedValue'],'verifiedCount':verified_count})
by_date={x['date']:x for x in data['history']}
data['history']=[by_date[k] for k in sorted(by_date)][-730:]
P.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'priced {verified_count}/{len(data["positions"])}: EUR {verified_value:,.2f}')