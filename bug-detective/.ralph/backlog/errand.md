# Errand push-to-90 backlog

User picked "Cursor Agents lane defense" as canonical name. Migrate user-facing strings; storage keys can stay as `errand` for back-compat.

Order by leverage. Mark each item `[done]`, `[blocked]`, or leave open.

## High leverage (the gameplay-critical surgery)

- [ ] **E-1 Differentiate the three units** — `round.ts:399-407` and `types.ts ENEMY_STATS`. Make threats unit-specific:
  - `phishingPacket` immune to Fixer DPS (needs Reviewer slow)
  - `regression` requires Firewall co-presence to take damage
  - `ransomware` speeds up under Reviewer (counter-incentive)
  Forces real choice — Fixer-spam currently dominates. (+10)
- [x] **E-2 Wire the dead `bossWarningLeadSec` config** — `types.ts:101` defines it but no consumer. Add ribbon flash + sfx 9s before boss spawn. (+3) **[done iter-3 — pulsing ribbon banner over playfield top]**
- [x] **E-3 Drop firstBossWave from 4 → 2** — `round.ts:99`. Clue locks at wave 3; with current value, 90% of players never meet a boss. (+3) **[done iter-3 — also changed cadence to first-then-every-3]**
- [x] **E-4 Per-action feedback layer** — added `feedbackFx` system in round.ts: kill (cyan ring + "+1" rise), leak (orange `-N` damage popup + impact ring), spend (focus cost popup); BASE meter shakes 1 frame on real HP loss. (+5) **[done iter-7]**

## Medium leverage

- [ ] **E-5 Replace binary clue-lock with fill-bar** — header widget "Evidence: 1/3 waves" animating up. Backend already has the data (`survivalNotebookLock`); just expose. (+3)
- [x] **E-6 Fix "HEAD READY" truncation** — shortened to "GO" which fits the available x-range. (+2) **[done iter-3]**
- [x] **E-7 Tutorial gate bullet wrap** — `wrapAndDraw` in tutorial gate + `estimateBulletsBlock` measures wrapped lines for layout. (+2) **[done iter-3]**
- [x] **E-8 Hold result card on click** — `DEFEAT_AUTOCLOSE_S` removed; existing click handler advances. (+2) **[done iter-3]**
- [x] **E-9 Naming migration** — dropped "> CURSOR AGENTS // DEFEND_DESK" panel heading; replaced with cyan WAVE pill. (+1) **[done iter-3]**

## Polish

- [x] **E-10 Footer hint clipping** — shortened to "1/2/3 deploy lane · click queue to promote · ESC exit". (+1) **[done iter-3]**
- [ ] **E-11 Tutorial Start button vs caption** — `draw.ts:805-811` caption sits under the orange Start pill. Layout-aware Y. (+1)
