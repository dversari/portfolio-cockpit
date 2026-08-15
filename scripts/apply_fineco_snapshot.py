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

def symbol_base(v):
    s = str(v or '').strip().upper().split('.')[0]
    if s.startswith('1') and len(s) > 2:
        s = s[1:]
    return s

def norm_name(v):
    return ' '.join(str(v or '').upper().replace(',', '.').split())

def find_snapshot(pos):
    # 1) exact ISIN/symbol key
    for key in (pos.get('isin'), pos.get('symbol')):
        if key and key in snaps:
            return snaps[key]
    # 2) same underlying symbol, regardless of venue/prefix
    target = symbol_base(pos.get('symbol'))
    if target:
        for candidate in snaps.values():
            if symbol_base(candidate.get('symbol')) == target:
                return candidate
    # 3) exact normalized Fineco name: important for MOT/BTP where legacy ISINs
    #    or symbols may differ but the position name is stable.
    target_name = norm_name(pos.get('name'))
    if target_name:
        for candidate in snaps.values():
            if norm_name(candidate.get('name')) == target_name:
                return candidate
    return None

matched = 0
value = 0.0
verified_cost = 0.0
missing = []
for pos in p.get('positions', []):
    snap = find_snapshot(pos)
    if snap is None:
        missing.append(pos.get('name'))
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
    raise SystemExit(f'Fineco snapshot incomplete: matched {matched}/{len(p.get("positions", []))}; missing={missing}')

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
