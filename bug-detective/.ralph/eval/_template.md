# Per-game eval template

A reviewer subagent gets this template + the rubric. The agent **must** play the game in Playwright (or document why it could not), produce per-category scores summing to 0–100, and save screenshots.

## Inputs to the reviewer
- Repo root: `$REPO_ROOT` (parent of the `bug-detective/` folder)
- Read `bug-detective/.ralph/rubric.md` for the rubric
- Read `bug-detective/.ralph/scores.json` for the prior score
- Read `bug-detective/.ralph/backlog/<game>.md` for what was done this iteration
- Run dev server: `cd bug-detective && npm run dev`
- Use `mcp__playwright__*` tools to play

## Reviewer mandate
1. Boot dev server in background.
2. Navigate, enter the {GAME} minigame, play **at least 2 full rounds**.
3. Capture screenshots of: intro, instructions, mid-action, verdict/feedback, result, return to desk. Save under `/tmp/minigame-review/<game>/iter-NN/<state>.png`.
4. Score each rubric category with a number AND one sentence of justification.
5. Compute total. Apply the "category at 0 → cap 50" rule.
6. Report `validated: true` only if you played at least 2 rounds. Otherwise `validated: false` and the loop must re-run.

## Output format (STRICT — must be parseable)

```json
{
  "game": "<game>",
  "iteration": <n>,
  "validated": true,
  "scores": {
    "decision_quality": { "score": 12, "max": 15, "note": "..." },
    "skill_expression": { "score": 8, "max": 10, "note": "..." },
    "escalation": { "score": 7, "max": 10, "note": "..." },
    "per_action_feedback": { "score": 11, "max": 15, "note": "..." },
    "result_clarity": { "score": 8, "max": 10, "note": "..." },
    "no_clipping": { "score": 7, "max": 8, "note": "..." },
    "no_collisions": { "score": 5, "max": 6, "note": "..." },
    "consistent_hierarchy": { "score": 5, "max": 6, "note": "..." },
    "transitions": { "score": 4, "max": 5, "note": "..." },
    "animation": { "score": 3, "max": 5, "note": "..." },
    "pacing": { "score": 4, "max": 5, "note": "..." },
    "replayability": { "score": 4, "max": 5, "note": "..." }
  },
  "total": 78,
  "screenshots": ["intro.png", "mid.png", "result.png"],
  "remaining_blockers_to_90": [
    "specific change needed",
    "another specific change"
  ]
}
```

If `validated` is false, fill `notes` with why and total = previous score (no progress, no regression).
