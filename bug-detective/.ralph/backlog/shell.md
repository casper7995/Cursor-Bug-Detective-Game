# Shell experience push-to-90 backlog

The "shell" is everything *before* a minigame: app open, title splash, page-peel, case-file modal, desk 3D scene, prop hovers, evidence HUD, transitions into a minigame, return-to-desk after a minigame.

User priority: **smooth + slick, not fancy**. 90/100 = a player completing entry-to-first-minigame thinks "tight, polished" without anything jarring.

Order by leverage. Mark each item `[done]`, `[blocked]`, or leave open.

## High leverage

- [x] **SH-1 Case-file modal pacing** — `CASE_FILE_BODY_LINES` shrunk from a 165-char control dump to 3 punchy bullets ("Scan / Open four / Make the call"). Detailed controls live in `?howto=1` modal already. (+5) **[done iter-21]**
- [ ] **SH-2 Desk hit-routing inconsistency** — the lamp's invisible hit volume bleeds over the envelope at certain viewport sizes (deep-sentence and shell-review agents both saw clicks routed to the wrong prop). Likely `desktopDiorama.ts:475-481` invisible-mesh sizes. (+5)
- [ ] **SH-3 Hover-tooltip overlap with HUD** — orange tooltip pills (e.g. "monitor", "desk") overlap the top HUD overlay text. Pick a z-layer and stick to it. (+3)
- [x] **SH-4 Top-center prompt wraps + overlays code text** — shortened to "sweep the desk — trust the tooltip" (45 chars → 32). Single line at typical canvas width. (+2) **[done iter-21]**
- [ ] **SH-5 Desk chrome ?/× buttons collision in minigames** — `drawDeskChromeAi` puts buttons at top-right of every minigame at internal y=10; they collide with each minigame's title strip at y=26. Move chrome to y=4 or push titles to y=32. (+2)

## Medium leverage

- [ ] **SH-6 HUD evidence row reads as muted/empty** — MONITOR/ENVELOPE/AGENTS/LAMP slots use `_` placeholders on near-black. Players miss it as a tracker. Bump unfilled state contrast or animate when one is collected. (+2)
- [ ] **SH-7 Title splash → page-peel pacing** — page-peel is original but follows a generic title; consider a 1-frame mascot wink or a desk silhouette behind the title to set tone. (+1)
- [ ] **SH-8 Return-to-desk transition** — after a minigame the camera snaps back. Add a brief fade or zoom-out. (+1)

## Polish

- [ ] **SH-9 Smooth cursor on prop hover** — cursor changes to a "look" cue (eye? lens?) on hoverable props for tactile feel. (+1)
- [ ] **SH-10 Audio bed under the desk view** — soft ambient tone (typing/static) so silence between actions doesn't feel dead. (+1)
