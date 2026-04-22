# Ralph-loop iteration prompt — Bug Detective

You are a single iteration of a ralph-loop driving Bug Detective to ship-ready.
You have full tool access in this repo. **Do exactly one unit of work this tick,
commit, and stop.**

## Source of truth

- Checklist: `bug-detective/RALPH_CHECKLIST.md` (every requirement + iteration log)
- Plan context: `/root/.claude/plans/i-want-you-to-peppy-hartmanis.md`
- Branch: `claude/test-fix-game-mechanics-R4FBe` (work ONLY here)

## What to do, in order

1. **Read** `bug-detective/RALPH_CHECKLIST.md` top-to-bottom.
2. If every checkbox is `[x]` and no `[?]` blockers remain:
   print **`ALL GREEN`** and exit. Do not touch anything.
3. Otherwise pick the **topmost unchecked item** (excluding items marked
   `[?]` which are blocked on a human decision).
4. **Investigate**: read the relevant files (plan file lists the hot zones),
   reproduce the issue if interactive (use `npm run dev` or write a small
   vitest case), form a minimal fix.
5. **Fix it** in the smallest possible diff. Do not:
   - refactor unrelated code
   - add defensive checks that don't guard a real failure
   - introduce new abstractions "for later"
   - skip hooks (`--no-verify`) or bypass signing
6. **Verify** with `npm test && npm run build`. For interactive items (UI
   smoothness, hover feel), also run `npm run dev` and describe what you
   observed in the commit message + log entry. If you cannot verify interactively
   (no browser), say so explicitly and mark the item as `[~]` (partial) with a
   note, not `[x]`.
7. **Tick the box** in `RALPH_CHECKLIST.md` (`[ ]` → `[x]`) and prepend a log
   entry to the iteration-log section at the bottom of that file, format:
   `- YYYY-MM-DD HH:MM — <short id> — <one-line summary>`.
8. **Commit** on the designated branch with a clear message:
   `polish: <what changed> (<checklist-item-id>)`. Do not amend.
9. **Push** with `git push -u origin claude/test-fix-game-mechanics-R4FBe`. On
   network failure, retry up to 4 times with exponential backoff (2/4/8/16s).
10. **Stop.** Do not pick another item. The next tick will do that.

## Blocked / ambiguous items

If an item needs a design call you cannot make confidently (e.g. "is this
riddle actually surprising?", "should the evidence label say X or Y?"):

- Add a new entry under the **Open questions** section at the top of
  `RALPH_CHECKLIST.md` — format:
  `- [?] <item id>: <question>. Options: (A) …, (B) …. Waiting on human.`
- Mark the checklist item itself as `[?]` so future ticks skip it.
- Log the skip, commit ONLY the checklist change, push, stop.

## What counts as "one unit of work"

- One checklist item ticked, OR
- One `[?]` question filed, OR
- One bug fix that was required to make a checklist item tickable.

If a single checklist item is unexpectedly large (more than ~2 files of
changes), split it: tick nothing, file a `[?]` asking for scope guidance,
stop.

## Non-negotiables

- No pushes to `main`/`master`. Only `claude/test-fix-game-mechanics-R4FBe`.
- No force-push.
- No PR creation (the user will do that).
- No new dependencies without a `[?]` question first.
- No edits outside `bug-detective/` or adjacent test files.
- No placeholder / TODO / "in a later pass" code — if you can't finish, file
  a `[?]` and stop.
- Never delete the iteration log entries.

## End of tick

Your final turn output should be, at minimum:
- the checklist item you worked on (by id/heading)
- the files you touched
- the commands you ran + their results (pass/fail)
- the commit SHA and push result
- or, if you exited early, the `ALL GREEN` string or the `[?]` you filed

Nothing else. Keep it scannable — the loop will run many times.
