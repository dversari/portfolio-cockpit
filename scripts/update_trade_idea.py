import json
from pathlib import Path
import math
import yfinance as yf

P=Path('trade_ideas.json')
if not P.exists():
    raise SystemExit(0)

data=json.loads(P.read_text(encoding='utf-8'))
ideas=data.get('ideas') or []
if not ideas:
    P.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    raise SystemExit(0)

idea=ideas[0]
ticker=idea.get('ticker')
if not ticker:
    raise SystemExit(0)

t=yf.Ticker(ticker)
h=t.history(period='6mo',interval='1d',auto_adjust=False)
if h is None or h.empty:
    raise SystemExit(0)

close=h['Close'].dropna()
vol=h['Volume'].dropna()
if len(close)<30:
    raise SystemExit(0)

# RSI 14
chg=close.diff()
gain=chg.clip(lower=0).rolling(14).mean()
loss=(-chg.clip(upper=0)).rolling(14).mean()
rs=gain/loss.replace(0,float('nan'))
rsi=100-(100/(1+rs))

# MACD 12/26/9
ema12=close.ewm(span=12,adjust=False).mean()
ema26=close.ewm(span=26,adjust=False).mean()
macd=ema12-ema26
signal=macd.ewm(span=9,adjust=False).mean()
hist=macd-signal

ma20=close.rolling(20).mean()
ma50=close.rolling(50).mean()
ma200=close.rolling(200).mean() if len(close)>=200 else None

rv=None
if len(vol)>=21:
    avg20=vol.iloc[-21:-1].mean()
    if avg20 and math.isfinite(avg20): rv=float(vol.iloc[-1]/avg20)

last=float(close.iloc[-1])
tech={
    'price':round(last,4),
    'rsi14':round(float(rsi.iloc[-1]),2) if math.isfinite(float(rsi.iloc[-1])) else None,
    'macd':round(float(macd.iloc[-1]),4),
    'macdSignal':round(float(signal.iloc[-1]),4),
    'macdHist':round(float(hist.iloc[-1]),4),
    'ma20':round(float(ma20.iloc[-1]),4) if math.isfinite(float(ma20.iloc[-1])) else None,
    'ma50':round(float(ma50.iloc[-1]),4) if math.isfinite(float(ma50.iloc[-1])) else None,
    'ma200':round(float(ma200.iloc[-1]),4) if ma200 is not None and math.isfinite(float(ma200.iloc[-1])) else None,
    'relativeVolume20d':round(rv,2) if rv is not None else None,
}

score=0
if tech['rsi14'] is not None:
    if 35 <= tech['rsi14'] <= 60: score+=1
    elif tech['rsi14'] < 25: score-=1
if tech['macdHist']>0: score+=1
else: score-=1
if tech['ma20'] is not None and last>tech['ma20']: score+=1
if tech['ma50'] is not None and last>tech['ma50']: score+=1
if rv is not None and rv>1.5: score+=1
tech['signal']='favorevole' if score>=3 else ('contrario' if score<=0 else 'neutro')

# compact 3-month chart, max ~65 sessions
hs=t.history(period='3mo',interval='1d',auto_adjust=False)
chart=[]
if hs is not None and not hs.empty:
    for idx,row in hs.iterrows():
        c=row.get('Close')
        if c is None or not math.isfinite(float(c)): continue
        chart.append({'date':idx.strftime('%d/%m'),'close':round(float(c),4)})

idea['technical']=tech
idea['chart3m']=chart
P.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
