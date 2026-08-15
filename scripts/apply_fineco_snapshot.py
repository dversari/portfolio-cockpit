import json
from datetime import datetime, timezone
from pathlib import Path

P = Path('portfolio.json')
S = Path('fineco_sync.json')

if not P.exists() or not S.exists():
    raise SystemExit('missing portfolio.json or fineco_sync.json')

p = json.loads(P.read_text(encoding='utf-8'))
s = json.loads(S.read_text(encoding='utf-8'))
snaps = s.get('marketSnapshots') or {}

try:
    sync_dt = datetime.fromisoformat(str(s.get('asOf')).replace('Z', '+00:00'))
except Exception:
    raise SystemExit('invalid Fineco snapshot date')

now = datetime.now(timezone.utc)
age_days = (now.date() - sync_dt.astimezone(timezone.utc).date()).days
is_weekend = now.weekday() >= 5

# Fineco is authoritative only for a very recent weekend snapshot.
# On weekdays the normal market feeds remain primary.
if not is_weekend or age_days < 0 or age_days > 3 or not snaps:
    print('Fineco snapshot override not applicable')
    raise SystemExit(0)

matched = 0
value = 0.0
verified_cost = 0.0
for pos in p.get('positions', []):
    key = pos.get('isin') or pos.get('symbol')
    snap = snaps.get(key)
    if snap is None:
        # Some legacy positions did not carry ISIN in portfolio.json: try symbol match.
        for candidate in snaps.values():
            if candidate.get('symbol') == pos.get('symbol'):
                snap = candidate
                break
    if snap is None:
        continue

    px = float(snap['price'])
    val = float(snap['valueEUR'])
    cur = snap.get('currency') or pos.get('currency') or 'EUR'
    market_fx = float(snap.get('marketFx') or 1.0)
    # Fineco reports foreign exchange as foreign currency per EUR (e.g. EUR/USD 1.157).
    fx_to_eur = 1.0 if cur == 'EUR' else (1.0 / market_fx if market_fx else 1.0)

    pos.update({
        'price': px,
        'feedCurrency': cur,
        'fxToEUR': round(fx_to_eur, 8),
        'valueEUR': round(val, 2),
        'source': snap.get('source', 'Fineco snapshot'),
        'verified': True,
        'stale': False,
        'error': None,
        'lastGoodAsOf': s.get('asOf'),
    })
    if snap.get('isin'):
        pos['isin'] = snap['isin']
    matched += 1
    value += val
    verified_cost += float(pos.get('cost') or 0)

if matched != len(p.get('positions', [])):
    raise SystemExit(f'Fineco snapshot incomplete: matched {matched}/{len(p.get("positions", []))}')

p['liveValue'] = round(value, 2)
p['verifiedValue'] = round(value, 2)
p['verifiedCount'] = matched
p['unverifiedCount'] = 0
p['staleCount'] = 0
p['valuedCount'] = matched
p['verifiedCost'] = round(float(p.get('totalCost') or verified_cost), 2)
p['finecoSnapshot'] = {k: s.get(k) for k in ('asOf','totalCost','baselineValue','portfolioFineco','profitLoss','profitLossPct','positions')}
p['asOf'] = now.strftime('%Y-%m-%dT%H:%M:%SZ')

# Replace today's history point rather than creating artificial extra movement.
p.setdefault('history', [])
today = p['asOf'][:10]
point = {'date': today, 'value': round(value, 2), 'coverage': matched, 'stale': 0}
by_date = {x.get('date'): x for x in p['history'] if x.get('date')}
by_date[today] = point
p['history'] = [by_date[k] for k in sorted(by_date)][-730:]

P.write_text(json.dumps(p, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Fineco weekend snapshot applied: {matched} positions, EUR {value:,.2f}')
