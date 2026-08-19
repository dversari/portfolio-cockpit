import json, math, re, time
from datetime import datetime, timezone
from pathlib import Path
import requests
import yfinance as yf
from bs4 import BeautifulSoup

P=Path('portfolio.json'); SYNC=Path('fineco_sync.json')
data=json.loads(P.read_text(encoding='utf-8'))
sync=json.loads(SYNC.read_text(encoding='utf-8')) if SYNC.exists() else {}
UA={'User-Agent':'Mozilla/5.0 PortfolioCockpit/1.0'}

def parse_dt(v):
    try: return datetime.fromisoformat(str(v).replace('Z','+00:00')).astimezone(timezone.utc)
    except Exception: return None
sync_dt=parse_dt(sync.get('asOf'))
snaps=sync.get('marketSnapshots') or {}

# Fineco is authoritative for structure (positions, quantities, costs).
existing={p.get('isin') for p in data.get('positions',[]) if p.get('isin')}
for add in sync.get('additions',[]):
    if add.get('isin') not in existing:
        q=dict(add); q.setdefault('verified',False); q.setdefault('error',None); q.setdefault('dayChangePct',None)
        q.setdefault('price',q.get('finecoPrice')); q.setdefault('valueEUR',q.get('finecoValueEUR'))
        q.setdefault('feedCurrency',q.get('currency')); q.setdefault('fxToEUR',1.0); q.setdefault('source','Fineco structural sync')
        data.setdefault('positions',[]).append(q); existing.add(add.get('isin'))
rem=sync.get('removals',[])
if rem:
    rs={str(x.get('symbol') or '').upper() for x in rem}; rn={str(x.get('name') or '').upper() for x in rem}
    data['positions']=[p for p in data.get('positions',[]) if str(p.get('symbol') or '').upper() not in rs and str(p.get('name') or '').upper() not in rn]
if sync:
    data['totalCost']=sync.get('totalCost',data.get('totalCost')); data['baselineValue']=sync.get('baselineValue',data.get('baselineValue'))
    data['finecoSnapshot']={k:sync.get(k) for k in ('asOf','totalCost','baselineValue','portfolioFineco','profitLoss','profitLossPct','positions')}

BTP_ISIN={'BTP-23GN31 IT SI CUM':'IT0005713539','BTP-1ST38 2.95':'IT0005321325','BTP-1ST38 2,95':'IT0005321325','BTP-1AP28 3.4':'IT0005521981','BTP-1AP28 3,4':'IT0005521981','BTP-1AP31 0.9':'IT0005422891','BTP-1AP31 0,9':'IT0005422891','BTP-1ST49 3.85':'IT0005363111','BTP-1ST49 3,85':'IT0005363111','BTP-10MZ32 VAL CUM':'IT0005696320','BTP-1ST52 2.15':'IT0005480980','BTP-1ST52 2,15':'IT0005480980'}
CERT_ISIN={'LEVA FISSA SPACEX LONG 3X':'IT0005710873'}

def num_it(s):
    s=str(s).strip().replace('\xa0',' ').replace('€','').replace('%',''); s=re.sub(r'[^0-9,.-]','',s)
    if not s: raise ValueError('empty number')
    if ',' in s: s=s.replace('.','').replace(',','.')
    return float(s)

def snap_for(p):
    if p.get('isin') in snaps: return snaps[p['isin']]
    sym=str(p.get('symbol') or '').upper().split('.')[0]
    for s in snaps.values():
        ss=str(s.get('symbol') or '').upper().split('.')[0]
        if ss.startswith('1') and len(ss)>2: ss=ss[1:]
        if sym.startswith('1') and len(sym)>2: sym=sym[1:]
        if sym and ss==sym: return s
    return None

def history_intraday(symbol):
    t=yf.Ticker(symbol)
    h=t.history(period='5d',interval='5m',auto_adjust=False,prepost=False)
    if h is None or h.empty: raise RuntimeError('no Yahoo intraday')
    cur=None
    try: cur=t.fast_info.get('currency')
    except Exception: pass
    rows=[]
    for idx,v in h['Close'].dropna().items():
        ts=idx.to_pydatetime()
        if ts.tzinfo is None: ts=ts.replace(tzinfo=timezone.utc)
        ts=ts.astimezone(timezone.utc)
        rows.append((ts,float(v)))
    if not rows: raise RuntimeError('no Yahoo intraday close')
    return rows,cur

def daily_change(symbol):
    try:
        h=yf.Ticker(symbol).history(period='7d',interval='1d',auto_adjust=False)
        c=[float(x) for x in h['Close'].dropna().tolist()]
        return round(c[-1]/c[-2]-1,6) if len(c)>1 and c[-2]>0 else None
    except Exception: return None

def normalize_price(symbol,price,cur):
    c=(cur or 'EUR').upper(); px=float(price)
    if symbol=='SFR.L' or c in ('GBX','GBPENCE'):
        px/=100.0; c='GBP'
    return px,c

def fx_series(cur):
    cur=(cur or 'EUR').upper()
    if cur=='EUR': return None
    sym={'USD':'USDEUR=X','GBP':'GBPEUR=X','CHF':'CHFEUR=X','JPY':'JPYEUR=X'}.get(cur)
    if not sym: raise RuntimeError(f'unsupported currency {cur}')
    rows,_=history_intraday(sym); return rows

def latest_after(rows,dt):
    a=[x for x in rows if dt is None or x[0]>dt]
    return (a[0],a[-1]) if a else (None,None)

def set_from_fineco(p,snap,reason='Fineco checkpoint'):
    cur=snap.get('currency') or p.get('currency') or 'EUR'; mfx=float(snap.get('marketFx') or 1)
    fx=1.0 if cur=='EUR' else (1.0/mfx if mfx else 1.0)
    p.update({'price':float(snap['price']),'feedCurrency':cur,'fxToEUR':round(fx,8),'valueEUR':round(float(snap['valueEUR']),2),'dayChangePct':None,'source':reason,'verified':True,'stale':False,'error':None,'lastGoodAsOf':sync.get('asOf'),'finecoAnchor':{'syncAsOf':sync.get('asOf'),'finecoValueEUR':float(snap['valueEUR']),'finecoPrice':float(snap['price'])}})
    return float(snap['valueEUR'])

def estimate_from_checkpoint(p,snap):
    rows,feed_cur=history_intraday(p['symbol'])
    norm=[]; norm_cur=None
    for ts,px in rows:
        q,nc=normalize_price(p['symbol'],px,feed_cur or p.get('currency')); norm.append((ts,q)); norm_cur=nc
    base,cur=latest_after(norm,sync_dt)
    if base is None or cur is None:
        return set_from_fineco(p,snap,'Fineco checkpoint · nessuna barra successiva')
    bts,bpx=base; cts,cpx=cur
    price_ratio=cpx/bpx if bpx>0 else 1.0
    fx_ratio=1.0; fx_now=1.0
    if norm_cur!='EUR':
        fr=fx_series(norm_cur); fb,fc=latest_after(fr,sync_dt)
        if fb and fc and fb[1]>0:
            fx_now=fc[1]; fx_ratio=fx_now/fb[1]
    val=float(snap['valueEUR'])*price_ratio*fx_ratio
    if not math.isfinite(val) or val<=0: raise RuntimeError('invalid anchored value')
    if abs(val/float(snap['valueEUR'])-1)>0.15: raise RuntimeError('anchored move >15%: rejected')
    chg=daily_change(p['symbol'])
    p.update({'price':round(cpx,6),'feedCurrency':norm_cur,'fxToEUR':round(fx_now,8),'valueEUR':round(val,2),'dayChangePct':chg,'source':'Yahoo 5m · variazione da checkpoint Fineco','verified':True,'stale':False,'error':None,'lastGoodAsOf':cts.strftime('%Y-%m-%dT%H:%M:%SZ'),'finecoAnchor':{'syncAsOf':sync.get('asOf'),'finecoValueEUR':float(snap['valueEUR']),'finecoPrice':float(snap['price']),'feedBasePrice':round(bpx,6),'feedBaseTimestamp':bts.strftime('%Y-%m-%dT%H:%M:%SZ'),'feedLatestPrice':round(cpx,6),'feedLatestTimestamp':cts.strftime('%Y-%m-%dT%H:%M:%SZ')}})
    return val

def absolute_yahoo(p):
    rows,cur=history_intraday(p['symbol']); ts,px=rows[-1]; px,cur=normalize_price(p['symbol'],px,cur or p.get('currency'))
    fx=1.0
    if cur!='EUR': fx=fx_series(cur)[-1][1]
    val=float(p['qty'])*px*fx
    p.update({'price':round(px,6),'feedCurrency':cur,'fxToEUR':round(fx,8),'valueEUR':round(val,2),'dayChangePct':daily_change(p['symbol']),'source':'Yahoo 5m','verified':True,'stale':False,'error':None,'lastGoodAsOf':ts.strftime('%Y-%m-%dT%H:%M:%SZ')})
    return val

verified_value=portfolio_value=verified_cost=0.0; verified_count=valued_count=stale_count=0
for p in data.get('positions',[]):
    snap=snap_for(p); val=None
    try:
        if snap and sync_dt:
            if p['name'] in BTP_ISIN or p['name'] in CERT_ISIN:
                val=set_from_fineco(p,snap,'Fineco checkpoint · timestamp feed non verificabile')
            else:
                val=estimate_from_checkpoint(p,snap)
        else:
            val=absolute_yahoo(p)
        verified_value+=val; verified_cost+=float(p.get('cost') or 0); verified_count+=1
    except Exception as e:
        if snap:
            val=set_from_fineco(p,snap,'Fineco checkpoint · feed scartato'); p['error']=str(e)[:160]; p['stale']=True; stale_count+=1
        else:
            p['verified']=False; p['error']=str(e)[:160]; val=p.get('valueEUR')
            if val is not None: stale_count+=1
    if val is not None: portfolio_value+=float(val); valued_count+=1
    time.sleep(0.05)

try:
    h=yf.Ticker('SWDA.MI').history(period='1y',interval='1d',auto_adjust=False); c=[float(x) for x in h['Close'].dropna().tolist()]
    if c:
        now=c[-1]; high=max(c); prev=c[-2] if len(c)>1 else None
        data['benchmark']={'name':'MSCI World (SWDA)','price':round(now,4),'high1y':round(high,4),'drawdown':round(now/high-1,6),'dayChange':round(now/prev-1,6) if prev else None}
except Exception as e: data['benchmark']={'name':'MSCI World (SWDA)','error':str(e)[:120]}

data['asOf']=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'); data['verifiedValue']=round(verified_value,2); data['verifiedCount']=verified_count
data['unverifiedCount']=len(data.get('positions',[]))-verified_count; data['staleCount']=stale_count; data['valuedCount']=valued_count
data['liveValue']=round(portfolio_value,2) if valued_count==len(data.get('positions',[])) else None
data['verifiedCost']=round(float(data.get('totalCost',verified_cost)),2) if data['liveValue'] is not None else round(verified_cost,2)
data.setdefault('history',[]); hv=data['liveValue'] if data['liveValue'] is not None else data['verifiedValue']; today=data['asOf'][:10]
by={x.get('date'):x for x in data['history'] if x.get('date')}; by[today]={'date':today,'value':round(hv,2),'coverage':verified_count,'stale':stale_count}; data['history']=[by[k] for k in sorted(by)][-730:]
P.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'fresh {verified_count}/{len(data.get("positions",[]))}; valued {valued_count}; EUR {portfolio_value:,.2f}; stale {stale_count}')
