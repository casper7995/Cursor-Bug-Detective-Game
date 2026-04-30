# Iteration 13

**Date:** 2026-04-30
**Phase:** Phase 2 (gameplay surgery — conservative)
**Target:** errand (last validated 64; the deferred big item)
**Item:** E-1 — differentiate the three units

## What landed
- `EnemyArchetype` (in `errand/types.ts`) gained two optional fields:
  - `fixerDpsMul`: scalar applied to Fixer DPS against this enemy. Default 1.
  - `noFirewallLeakMul`: scalar applied to leak damage when no Firewall is in the lane. Default 1.
- New per-enemy values:
  - `phishingPacket.fixerDpsMul = 0.5` — slippery. Fixer DPS halved. Reviewer slow now buys real time.
  - `regressionBug.noFirewallLeakMul = 2` — heavy hitter. Firewall doubles in value (CAP/BASE damage halved -> with-Firewall vs no-Firewall is now 1×0.5 vs 2 = 4× total swing).
- Other archetypes (syntaxBug, ransomwareBlob, zeroDay) unchanged — Fixer-only baseline play still works on those.
- DPS apply path in `round.ts:486-489` reads `ENEMY_STATS[front.kind].fixerDpsMul ?? 1` per tick.
- Leak path in `round.ts:529-538` applies `noFirewallLeakMul` only when no Firewall is present (Firewall path keeps its existing `firewallLeakMul`).

## Why
Deep-errand reviewer flagged the dominant Fixer-spam strategy as the #1 gameplay-quality issue: every threat resolves to "fire Fixer at it." This is a conservative differentiation: only 2 enemy types changed, only 2 new properties added, and Fixer remains the default for baseline waves.

## Tests added (266 total)
1. **phishing takes half DPS from a Fixer** — pins the 0.5 mul against syntax baseline.
2. **regression leaks 2× harder with no Firewall** — pins the no-firewall vs with-firewall delta is 4× swing in HP loss.
3. **syntax bug DPS unchanged** — guards against the new code accidentally affecting baseline.

## Validation
- typecheck ✓
- vitest 266/266 ✓
- per-game review: deferred (Playwright MCP unavailable). Score holds at 64 until a reviewer can play the new balance.

## Risks (would surface in playtest)
- Phishing waves at 0.5 fixer mul + 0.26 speed may now overwhelm even active play if the player doesn't know to bring Reviewer. Will see in reviewer feedback whether to tighten to 0.7.
- Regression at 2× no-firewall leak is heavy; if regressions cluster at wave 3-4 the player could lose CAP fast without Firewall. Backlog has a future "balance review" if this proves harsh.
