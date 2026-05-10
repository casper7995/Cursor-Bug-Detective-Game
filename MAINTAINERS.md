> Optional product and engineering notes for people shipping changes to Bug Detective.
> Players and contributors can ignore this file — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Product direction (Bug Detective)

- Keep the loop desk-led and exploratory (not only a speed trial for clues); the runner should take over full-screen arcade-style, use Mario-like run/jump on code-snippet platforms as the real floor (avoid a separate solid ground band), allow snippets to fade or expire so climbing stays urgent, keep scroll speed and gaps human-feasible, and steer visuals toward the game’s brand art direction; endless mode should ramp difficulty sharply and tie to leaderboards; the mascot should fall with believable gravity when unsupported (not hover in place on gaps); on the desk, mascot motion should feel like a small character (not floaty) and clue beats should read as a deliberate examine/detail zoom, not only framing props in the camera. In the runner, bind jump to **Space** (not Tab) as the primary key unless focus or platform conventions force otherwise.
- Minigames should stay replayable after failure or success, with explicit restart paths and clear success conditions so puzzle clues feel earned rather than handed out after confusing endings.
- Errand notebook minigame: three horizontal lanes; **Fixer / Reviewer / Firewall** with **Q / W / E** (sticky until changed); deploy with **Digit1–3 and Numpad1–3** (and lane clicks); clue gating before endless scoring; readable tutorial — fun and distinct rather than a heavy economy simulator.
- Ideation should favor accessible mechanics for non-technical adults; scoring, goals, and end states should be obvious before large implementation pushes.
- Opening: title/intro readable with time to read; case sheet animates smoothly onto the desk and stays available for rereading; mascot reveal as jump-in/walk rather than emerging from props; guidance for first-timers before free exploration.

## Technical notes

- App root: **`bug-detective/`** — run `npm install` and npm scripts only from there.
- Stack: Three.js + Vite + Vitest; leaderboard Worker under **`bug-detective/worker/`**. **`npm run verify`** runs unit tests, Playwright (chromium + firefox + webkit), production build, and the jam-widget check.
- Typical dev URLs: plain `npm run dev` uses Vite’s default (**often 5173**); Playwright in this repo aligns with **`127.0.0.1:5175`** (see `bug-detective/playwright.config.ts`).
- **`bug-detective/src/main.ts`** is the orchestration choke point — isolate parallel work under `src/minigames/` or other modules and coordinate edits with `src/game/gameState.ts`.
- Global UI should not rely only on `pointerdown` on `window`; prefer **document capture-phase** listeners for splash/title dismissal, high `z-index` dismiss layers above jam widgets, and **pointer** (`pointermove` / `pointerdown`) on canvas and HUD for desk play — mouse-only listeners can stall until the cursor moves.
- Inspect/prop zoom: obvious zoom-out affordance, **Esc**, bounded camera distance, auto-unzoom when changing location; prefer a small number of clear zoom levels.
- Mascot art: tilted translucent cube head with centered inner wedge silhouette, readable body silhouette, oval eyes and smile aligned with **`bug-detective/Cursor-Mascot-Reference.jpeg`**, consistent 3D desk and 2D runner silhouettes.
- Desk rays can land under tall props — feet targets use **`src/cursor/deskFootResolve.ts`** with **`mascotFootObstacles`** from `desktopDiorama.ts`, wired via `cursorTracker` in `main.ts` (see **`tests/deskFootResolve.test.ts`**).
