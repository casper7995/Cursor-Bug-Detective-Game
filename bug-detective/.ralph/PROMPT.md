# Ralph Loop — All minigames to 90/100

You are running an iterative loop. Each loop iteration: pick the lowest-scoring game, execute its top backlog item, validate via tests + a real-gameplay review, update state, continue.

## Goal

All 4 minigames score **≥90/100** on the rubric at `.ralph/rubric.md`, validated by a Playwright-driven gameplay review.

## Hard rules

1. **Working directory:** `/Users/caspe/conductor/workspaces/cursor-crew/main/bug-detective`. cd here at the start of every iteration.
2. **State of truth:** `.ralph/scores.json`. Read it at iteration start, write it before exit.
3. **Backlogs:** `.ralph/backlog/<game>.md` lists prioritized items. Mark `[done]`, `[blocked]`, or leave open.
4. **Validation must be real gameplay.** Use the Agent tool with `general-purpose` and the eval template at `.ralph/eval/_template.md` (substituting the game name). The reviewer MUST play in Playwright and report `validated: true` or your iteration is void.
5. **Never regress.** If a game's new score < previous score, revert the change (`git diff` + `git checkout -- <files>`), mark item blocked, log it.
6. **Phase order:** Phase 1 (shared infra) before Phase 2 (per-game gameplay surgery) before Phase 3 (polish). Set `phase_1_complete: true` only after all P1 items in `.ralph/backlog/_phase1_shared.md` are done AND tests pass.
7. **Stop conditions:**
   - All 4 games ≥90 → output `<promise>ALL_MINIGAMES_AT_90</promise>` and exit.
   - Hard blocker (build broken, dev server unfixable, etc.) → write `.ralph/BLOCKED.md`, emit `<promise>RALPH_BLOCKED</promise>`, exit.
   - **No iteration cap.** Run until the goal is genuinely met. Do not invent reasons to stop.

## Per-iteration procedure

```
1. cd to the bug-detective dir.
2. Read .ralph/scores.json. Increment `iteration`.
3. If all games ≥90 → emit promise and exit.
4. (no iteration cap; user removed it.)
5. Pick target:
   - If phase_1_complete is false → next open Phase 1 item from _phase1_shared.md
   - Else → game with lowest current score; pick its top open backlog item
6. Implement the item:
   - Read the cited files (line refs in the backlog)
   - Make minimal, principled edits (per CLAUDE.md: elegant, no fallbacks)
   - Run: npx tsc --noEmit  (must pass)
   - Run: npx vitest run  (must pass)
7. If typecheck or tests fail:
   - Fix the regression OR revert (git checkout -- <file>) and mark item [blocked]
   - Continue to next iteration.
8. If item was Phase 1 (shared infra):
   - Mark [done] in backlog file.
   - If all P1 items done, set phase_1_complete: true in scores.json.
   - No per-game review needed for Phase 1 alone — review at the next per-game iteration.
9. If item was per-game (Phase 2 or 3):
   - Spawn an Agent with subagent_type "general-purpose" using the eval template
   - Pass the agent: game name, iteration number, the item just executed, the rubric path
   - Wait for the JSON output
   - If validated: false → revert the change, log validation failure, continue
   - If validated: true:
     - Update scores.json: history[].push, current = total
     - If new < previous → revert change, mark item [blocked]
     - Else → mark [done] in backlog, update notes
10. Append log to .ralph/logs/iter-<NN>.md: target chosen, item, files touched, before/after scores, screenshots.
11. Loop.
```

## Self-reference

Each iteration sees previous work via:
- `.ralph/scores.json` (history)
- `.ralph/backlog/*.md` (which items are [done])
- `.ralph/logs/iter-*.md` (per-iteration record)
- `git diff` (uncommitted changes from this run)
- `git log --oneline` (committed progress)

**Commit at the end of every successful per-game iteration** with a one-line message: `tamper iter-12: fix bugbot claim wrap (68→74)`.

## When stuck

If the same item is [blocked] 3 iterations in a row, escalate: write a `.ralph/BLOCKED.md` listing what's blocked and why, emit `<promise>RALPH_BLOCKED</promise>`, and exit. Don't burn iterations on an unsolvable item.

## When the dev server won't boot

Reviewers depend on `npm run dev` working. If you (or a reviewer) report the dev server failed to start or kept crashing:
1. Check `.ralph/logs/` for prior dev-server failures.
2. Try `npm install` once, retry once.
3. If still broken: write `.ralph/BLOCKED.md`, emit blocked promise, exit.

## Quality gates (run at every key stage)

These are non-negotiable. The "key stages" are: after each Phase 1 item lands; after each per-game implementation lands (before reviewer); after each successful per-game review.

1. **`/simplify` gate**: after implementation lands and before commit, invoke the `simplify` skill on the changed files. Address its findings (or note why ignored).
2. **Reviewer hygiene**: when a per-game reviewer finishes, instruct it (or do it yourself) to **close all Playwright tabs / Chrome processes** so the next reviewer can boot cleanly. Add `mcp__playwright__browser_close` to the reviewer's mandate, and after a reviewer run end any leftover dev-server background processes.
3. **Commit gate**: after a successful per-game iteration (validated, not regressed), git-commit the changes with a one-line message: `<game> iter-NN: <item> (before→after)`. No commit if regressed/blocked. Phase 1 items also commit, with message `phase-1 iter-NN: <item>`.
4. **Asset cleanup gate**: at the end of each iteration, delete the Playwright screenshots/assets the reviewer wrote (`/tmp/minigame-review/<game>/iter-NN/` and `~/.playwright-mcp/...` and `~/minigame-review/...`). Keep the textual JSON output stored in `.ralph/logs/iter-NN.md` instead. Free disk + keep the workspace tidy.

If `/simplify` finds regressions or `git commit` fails — pause, fix, then re-validate before continuing.

## Output discipline

Every iteration ends with either:
- A short progress summary in chat (game, item, before→after, validated y/n) AND a tool call that lets the harness loop, OR
- A `<promise>...</promise>` tag if a stop condition was hit.

Do **not** chat about the plan; act.
