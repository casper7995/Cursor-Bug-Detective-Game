---
name: Bug Detective zoom Space replay
overview: Fix inspect-zoom stuck UX (chain pointer to navigation, HUD exit control), switch runner jump to Space, and allow replay—daily runner after clear and optional return to desk from results without full restart.
todos:
  - id: desk-pointer-chain
    content: Refactor handleDeskPointerDown to exit zoom/flavor then route same click to monitor/mini/case-file
    status: completed
  - id: hud-inspect-exit
    content: Add clickable Exit (Esc) on inspect caption in hud.ts + onInspectExit wire in main.ts
    status: completed
  - id: runner-space-jump
    content: actions.ts RunnerJump use Space not Tab; update main/tutorial/gameInstructions runner copy only
    status: completed
  - id: replay-daily
    content: Allow enterRunner daily after monitorDailyClear; UX e.g. Shift+click monitor for daily practice, normal click endless
    status: completed
  - id: replay-results-desk
    content: GameState resumeInvestigatingFromResults + results panel Back to desk button + main.ts wiring
    status: completed
  - id: verify-all
    content: npm test + tsc; manual zoom chain, runner Space, daily replay, results return
    status: completed
isProject: false
---

# Bug Detective — inspect zoom, Space jump, replay

## A. Inspect zoom reliability + Esc control

**Problem:** In [bug-detective/src/main.ts](bug-detective/src/main.ts), `handleDeskPointerDown` calls `exitInspectZoom` then **returns** without processing the hit, so one click does not open monitor / minis / case file.

**Changes:**

- After clearing anomaly zoom / flavor inspect, **re-run** hit-test and `routeDeskInteractionTag` + switch so **one click** exits zoom and navigates.
- In [bug-detective/src/ui/hud.ts](bug-detective/src/ui/hud.ts), add a small **“Exit · Esc”** control (`pointer-events: auto`) and `onInspectExit` callback; wire from `main.ts` to match Esc / `MenuBack` during investigating (not runner / desk mini).

**Verify:** Zoom anomaly → one click on monitor starts runner; Esc and HUD control restore camera.

## B. Runner — Space to jump

**Changes:**

- [bug-detective/src/input/actions.ts](bug-detective/src/input/actions.ts): `RunnerJump` → `["Space", "ArrowUp", "KeyW"]` (remove `Tab` so Sentence mini keeps Tab).
- Copy only for **runner**: [bug-detective/src/main.ts](bug-detective/src/main.ts) status strings (~858–859), [bug-detective/src/ui/runnerTutorialGate.ts](bug-detective/src/ui/runnerTutorialGate.ts), [bug-detective/src/ui/gameInstructions.ts](bug-detective/src/ui/gameInstructions.ts). Do **not** change Sentence Tab autocomplete copy.

**Verify:** Vitest + tsc; Space jumps; Sentence Tab still commits.

## C. Replay

### C1 — Daily runner after clear

**Today:** [bug-detective/src/game/gameState.ts](bug-detective/src/game/gameState.ts) `enterRunner` returns false when `mode === "daily" && monitorDailyClear`. Routing sends monitor to endless only after clear.

**Changes:**

- Relax `enterRunner` so **daily** can run again while `monitorDailyClear` stays true (endless still unlocked).
- **UX:** Do not replace endless with daily on normal monitor click. **Default:** normal click → endless (current). **Shift+click** (or agreed modifier) on monitor → **daily practice**. Document in HUD/status.
- Re-clearing daily: `pinNotebookPage("runner", …)` may overwrite same slot (OK).

### C2 — Back to desk after results

**Today:** Only **play again** → `restartRound` (full diorama reset).

**Changes:**

- Add e.g. `GameState.resumeInvestigatingFromResults(now)` transitioning `results` → `investigating` with same **notebook**, **monitorDailyClear** preserved, **no** re-seed / `picked` unchanged.
- [bug-detective/src/ui/resultsPanel.ts](bug-detective/src/ui/resultsPanel.ts): secondary button **“Back to desk”**; `main.ts` hides results, restores investigating UI/camera/mascot as needed.
- **Play again** remains full reset.
- Product note: duplicate leaderboard submit same day — decide allow vs dedupe; comment or worker behavior.

**Verify:** After correct results, Back to desk → desk playable; daily replay modifier + endless default click.

## Implementation order

1. A (pointer chain + exit button)
2. B (Space jump)
3. C1 (daily replay + modifier)
4. C2 (results → desk)
5. Tests + manual pass

## Out of scope

- Sentence mini Tab theming (unchanged).
- Worker leaderboard policy beyond a short comment unless explicitly scoped.
