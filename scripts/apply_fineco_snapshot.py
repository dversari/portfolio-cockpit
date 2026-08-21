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
if not snaps:
    print('No Fineco market snapshot')
    raise SystemExit(0)

# Fineco is authoritative not only for valuations but also for structure.
# Apply explicit quantity/cost changes from the newest export before anchoring prices.
updates = s.get('positionUpdates') or []
if updates:
    by_isin = {str(x.get('isin') or ''): x for x in p.get('positions', [])}
    for u in updates:
        pos = by_isin.get(str(u.get('isin') or ''))
        if not pos:
            continue
        if u.get('qty') is not None:
            pos['qty'] = u['qty']
        if u.get('cost') is not None:
            pos['cost'] = u['cost']
        if u.get('name'):
            pos['name'] = u['name']

try:
    sync_dt = datetime.fromisoformat(str(s.get('asOf')).replace('Z', '+00:00'))
except Exception:
    raise SystemExit('invalid Fineco snapshot date')

now = datetime.now(timezone.utc)
sync_id = str(s.get('asOf'))
age_days = (now.date() - sync_dt.astimezone(timezone.utc).date()).days


def symbol_base(v):
    s0 = str(v or '').strip().upper().split('.')[0]
    if s0.startswith('1') and len(s0) > 2:
        s0 = s0[1:]
    return s0


def norm_name(v):
    return ' '.join(str(v or '').upper().replace(',', '.').split())


def find_snapshot(pos):
    for key in (pos.get('isin'), pos.get('symbol')):
        if key and key in snaps:
            return snaps[key]
    target = symbol_base(pos.get('symbol'))
    if target:
        for candidate in snaps.values():
            if symbol_base(candidate.get('symbol')) == target:
                return candidate
    target_name = norm_name(pos.get('name'))
    if target_name:
        for candidate in snaps.values():
            if norm_name(candidate.get('name')) == target_name:
                return candidate
    return None


matched = 0
portfolio_value = 0.0
verified_cost = 0.0
missing = []
new_anchor = False

for pos in p.get('positions', []):
    snap = find_snapshot(pos)
    if snap is None:
        missing.append(pos.get('name'))
        continue

    anchor = pos.get('finecoAnchor') or {}
    same_anchor = anchor.get('syncAsOf') == sync_id

    # A new Fineco export is the hard checkpoint. Capture the simultaneous market-feed
    # level only as a RELATIVE reference. From then on we apply market/FX returns to the
    # Fineco value instead of replacing Fineco with an absolute Yahoo/Borsa valuation.
    if not same_anchor:
        if age_days < 0 or age_days > 3:
            missing.append(f"{pos.get('name')} (snapshot too old to create anchor)")
            continue
        feed_price = pos.get('price')
        feed_fx = pos.get('fxToEUR') or 1.0
        try:
            feed_price = float(feed_price)
            feed_fx = float(feed_fx)
            if feed_price <= 0 or feed_fx <= 0:
                raise ValueError
        except Exception:
            # If the live feed is unavailable at checkpoint creation, use the Fineco
            # price as a neutral reference and wait for a valid future feed.
            feed_price = float(snap.get('price') or 1.0)
            cur = str(snap.get('currency') or pos.get('currency') or 'EUR').upper()
            mf = float(snap.get('marketFx') or 1.0)
            feed_fx = 1.0 if cur == 'EUR' else (1.0 / mf if mf else 1.0)

        anchor = {
            'syncAsOf': sync_id,
            'finecoValueEUR': float(snap['valueEUR']),
            'finecoPrice': float(snap['price']),
            'feedPrice': feed_price,
            'feedFxToEUR': feed_fx,
            'lastEstimatedValueEUR': float(snap['valueEUR']),
        }
        pos['finecoAnchor'] = anchor
        new_anchor = True

    current_price = pos.get('price')
    current_fx = pos.get('fxToEUR') or 1.0
    estimate = None

    # Only move away from the checkpoint when the market feed is actually usable.
    if pos.get('verified') and not pos.get('stale'):
        try:
            cp = float(current_price)
            cfx = float(current_fx)
            ap = float(anchor['feedPrice'])
            afx = float(anchor['feedFxToEUR'])
            if cp > 0 and cfx > 0 and ap > 0 and afx > 0:
                estimate = float(anchor['finecoValueEUR']) * (cp / ap) * (cfx / afx)
        except Exception:
            estimate = None

    if estimate is None:
        estimate = float(anchor.get('lastEstimatedValueEUR') or anchor['finecoValueEUR'])

    anchor['lastEstimatedValueEUR'] = round(estimate, 2)
    pos['finecoAnchor'] = anchor
    pos['valueEUR'] = round(estimate, 2)
    pos['source'] = (pos.get('source') or 'Market feed') + ' · ancorato Fineco'
    pos['error'] = None if pos.get('verified') else pos.get('error')
    if snap.get('isin'):
        pos['isin'] = snap['isin']

    matched += 1
    portfolio_value += estimate
    verified_cost += float(pos.get('cost') or 0)

if matched != len(p.get('positions', [])):
    raise SystemExit(f'Fineco anchor incomplete: matched {matched}/{len(p.get("positions", []))}; missing={missing}')

# On the first run of a new checkpoint the ratio is exactly 1 for every usable feed,
# so the portfolio equals Fineco cent-for-cent. Later runs evolve only by relative
# market/FX moves from that checkpoint.
p['totalCost'] = float(s.get('totalCost') or p.get('totalCost') or verified_cost)
p['liveValue'] = round(portfolio_value, 2)
p['verifiedValue'] = round(portfolio_value, 2)
p['verifiedCount'] = matched
p['unverifiedCount'] = 0
p['valuedCount'] = matched
p['verifiedCost'] = round(float(p.get('totalCost') or verified_cost), 2)
p['finecoSnapshot'] = {k: s.get(k) for k in ('asOf','totalCost','baselineValue','portfolioFineco','profitLoss','profitLossPct','positions')}
p['valuationMode'] = 'relative-to-latest-fineco-checkpoint'
p['finecoAnchorAsOf'] = sync_id

# Replace today's history point; no artificial extra points from repeated runs.
p.setdefault('history', [])
today = now.strftime('%Y-%m-%d')
point = {'date': today, 'value': round(portfolio_value, 2), 'coverage': matched, 'stale': p.get('staleCount', 0)}
by_date = {x.get('date'): x for x in p['history'] if x.get('date')}
by_date[today] = point
p['history'] = [by_date[k] for k in sorted(by_date)][-730:]

P.write_text(json.dumps(p, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Fineco-relative valuation: {matched} positions, EUR {portfolio_value:,.2f}; new_anchor={new_anchor}; checkpoint={sync_id}; structural_updates={len(updates)}')
