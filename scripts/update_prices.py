import json, math, re, time
from datetime import datetime, timezone
from pathlib import Path

import requests
import yfinance as yf
from bs4 import BeautifulSoup

P = Path('portfolio.json')
SYNC = Path('fineco_sync.json')
data = json.loads(P.read_text(encoding='utf-8'))
sync = json.loads(SYNC.read_text(encoding='utf-8')) if SYNC.exists() else {}
UA = {'User-Agent':'Mozilla/5.0 PortfolioCockpit/1.0'}

# Merge latest Fineco structural changes (qty/cost/new positions), without using Fineco as primary market feed.
existing_isins={p.get('isin') for p in data.get('positions',[]) if p.get('isin')}
for add in sync.get('additions',[]):
    if add.get('isin') not in existing_isins:
        p=dict(add)
        p.setdefault('verified',False); p.setdefault('error',None); p.setdefault('dayChangePct',None)
        p.setdefault('price',p.get('finecoPrice')); p.setdefault('valueEUR',p.get('finecoValueEUR'))
        p.setdefault('feedCurrency',p.get('currency')); p.setdefault('fxToEUR',1.0)
        p.setdefault('source','Fineco structural sync')
        data.setdefault('positions',[]).append(p)
        existing_isins.add(add.get('isin'))

if sync:
    data['totalCost']=sync.get('totalCost',data.get('totalCost'))
    data['baselineValue']=sync.get('baselineValue',data.get('baselineValue'))
    data['finecoSnapshot']={k:sync.get(k) for k in ('asOf','totalCost','baselineValue','profitLoss','profitLossPct','positions')}

BTP_ISIN = {
    'BTP-23GN31 IT SI CUM': 'IT0005713547',
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
    if ',' in s: s = s.replace('.','').replace(',','.')
    return float(s)

def last_close(symbol, period='7d'):
    t = yf.Ticker(symbol)
    h = t.history(period=period, interval='1d', auto_adjust=False)
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
    txt=' '.join(BeautifulSoup(r.text,'html.parser').stripped_strings)
    m=re.search(r'Prezzo Ultimo Contratto\s*\|?\s*([0-9]+(?:[.,][0-9]+)?)',txt,re.I)
    if not m: m=re.search(r'\b([0-9]{2,3}[,.][0-9]{1,5})\s+[+-]?[0-9,.]+%',txt)
    if not m: raise RuntimeError('Borsa Italiana: prezzo non trovato')
    price=num_it(m.group(1))
    vm=re.search(r'Var %\s*\|?\s*([+-]?[0-9]+(?:[.,][0-9]+)?)',txt,re.I)
    return price, (num_it(vm.group(1))/100.0 if vm else None), 'Borsa Italiana MOT'

def btp_fallback(isin):
    url=f'https://btpanalisi.it/btp/{isin}'
    r=requests.get(url,headers=UA,timeout=20); r.raise_for_status()
    txt=' '.join(BeautifulSoup(r.text,'html.parser').stripped_strings)
    for pat in [r'oggi quota\s*([0-9]+(?:[.,][0-9]+)?)',r'Ultimo prezzo\s*([0-9]+(?:[.,][0-9]+)?)',r'Prezzo\s*([0-9]+(?:[.,][0-9]+)?)']:
        m=re.search(pat,txt,re.I)
        if m: return num_it(m.group(1)), None, 'BTP Analisi / Borsa Italiana'
    raise RuntimeError('fallback BTP: prezzo non trovato')

def vorvel_cert(isin):
    # Vorvel page can change markup; only accept a tight, plausible bid/ask pair.
    url='https://www.vorvel.eu/it/certificati/certificati-leva?order=ISINCODECERT&page=2&sort=asc'
    r=requests.get(url,headers=UA,timeout=20); r.raise_for_status()
    soup=BeautifulSoup(r.text,'html.parser')
    row=None
    for tr in soup.find_all('tr'):
        if isin in tr.get_text(' ',strip=True): row=tr; break
    if row is None: raise RuntimeError('Vorvel: ISIN non trovato')
    txt=row.get_text(' ',strip=True)
    raw=re.findall(r'(?<!\d)(\d{1,3}[,.]\d{1,4})(?!\d)',txt)
    vals=[]
    for s in raw:
        try:
            x=num_it(s)
            if 0.02 <= x <= 500: vals.append(x)
        except Exception: pass
    pairs=[]
    for a,b in zip(vals,vals[1:]):
        rel=abs(a-b)/max(a,b)
        if rel < 0.05 and min(a,b)>0.05: pairs.append((rel,a,b))
    if not pairs: raise RuntimeError('Vorvel: bid/ask non interpretabili')
    _,bid,ask=min(pairs,key=lambda x:x[0])
    return (bid+ask)/2.0, None, 'Vorvel mid bid/ask'

def apply_quote(p, price_native, cur='EUR', day_change=None, source=''):
    fx=fx_to_eur(cur)
    val=float(p['qty'])*float(price_native)*fx
    if not math.isfinite(val) or val<=0: raise RuntimeError('invalid value')
    c=float(p.get('cost') or 0)
    if c>0 and (val > c*8 or val < c/8): raise RuntimeError(f'quotazione incoerente con costo storico ({source})')
    p.update({'price':round(float(price_native),6),'feedCurrency':cur,'fxToEUR':round(fx,8),'valueEUR':round(val,2),'dayChangePct':day_change,'source':source,'verified':True,'stale':False})
    return val

def apply_fineco_fallback(p, reason):
    key=p.get('isin') or p.get('symbol')
    fb=sync.get('fallbacks',{}).get(key)
    if not fb and p.get('finecoValueEUR') is not None:
        fb={'price':p.get('finecoPrice'),'valueEUR':p.get('finecoValueEUR'),'currency':p.get('currency','EUR'),'source':'Fineco snapshot fallback'}
    if not fb: return None
    p.update({'price':fb.get('price'),'feedCurrency':fb.get('currency','EUR'),'fxToEUR':1.0,'valueEUR':fb.get('valueEUR'),'dayChangePct':None,'source':fb.get('source','Fineco snapshot fallback'),'verified':False,'stale':True,'error':reason})
    return float(p['valueEUR'])

verified_value=0.0; verified_cost=0.0; verified_count=0; portfolio_value=0.0; valued_count=0; stale_count=0
for p in data['positions']:
    p.update({'verified':False,'error':None,'dayChangePct':None,'price':None,'valueEUR':None,'source':None,'stale':False})
    val=None
    try:
        if p['name'] in BTP_ISIN:
            isin=BTP_ISIN[p['name']]
            try: price,chg,source=borsa_btp(isin)
            except Exception: price,chg,source=btp_fallback(isin)
            val=(float(p['qty'])/100.0)*price
            c=float(p.get('cost') or 0)
            if c>0 and (val>c*2 or val<c/2): raise RuntimeError('BTP quote incoerente')
            p.update({'price':round(price,5),'feedCurrency':'EUR','fxToEUR':1.0,'valueEUR':round(val,2),'dayChangePct':chg,'source':source,'verified':True,'stale':False,'isin':isin})
        elif p['name'] in CERT_ISIN:
            price,chg,source=vorvel_cert(CERT_ISIN[p['name']])
            val=apply_quote(p,price,'EUR',chg,source); p['isin']=CERT_ISIN[p['name']]
        else:
            price,prev,feed_cur=last_close(p['symbol'])
            cur=(feed_cur or p.get('feedPreferredCurrency') or p.get('currency') or 'EUR').upper()
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
        verified_value += val; verified_cost += float(p['cost']); verified_count += 1
    except Exception as e:
        reason=str(e)[:160]
        p['error']=reason
        val=apply_fineco_fallback(p,reason)
        if val is not None: stale_count += 1
    if val is not None:
        portfolio_value += val; valued_count += 1
    time.sleep(0.08)

# Benchmark / buy-the-dip metrics based on the core MSCI World ETF.
try:
    t=yf.Ticker('SWDA.MI')
    h=t.history(period='1y',interval='1d',auto_adjust=False)
    closes=[float(x) for x in h['Close'].dropna().tolist()]
    if closes:
        now=closes[-1]; high=max(closes); prev=closes[-2] if len(closes)>1 else None
        data['benchmark']={'name':'MSCI World (SWDA)','price':round(now,4),'high1y':round(high,4),'drawdown':round(now/high-1,6),'dayChange':round(now/prev-1,6) if prev else None}
except Exception as e:
    data['benchmark']={'name':'MSCI World (SWDA)','error':str(e)[:120]}

data['asOf']=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
data['verifiedValue']=round(verified_value,2)
data['verifiedCount']=verified_count
data['unverifiedCount']=len(data['positions'])-verified_count
data['staleCount']=stale_count
data['valuedCount']=valued_count
data['liveValue']=round(portfolio_value,2) if valued_count==len(data['positions']) else None
# If every position has either a fresh quote or a Fineco fallback, P/L must be against the entire cost base.
data['verifiedCost']=round(float(data.get('totalCost',verified_cost)),2) if data['liveValue'] is not None else round(verified_cost,2)
data.setdefault('history',[])
hist_value=data['liveValue'] if data['liveValue'] is not None else data['verifiedValue']
data['history'].append({'date':data['asOf'][:10],'value':round(hist_value,2),'coverage':verified_count,'stale':stale_count})
by_date={x['date']:x for x in data['history']}; data['history']=[by_date[k] for k in sorted(by_date)][-730:]
P.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'fresh {verified_count}/{len(data["positions"])}; valued {valued_count}/{len(data["positions"])}; EUR {portfolio_value:,.2f}; stale {stale_count}')