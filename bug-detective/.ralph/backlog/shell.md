# Shell experience push-to-90 backlog

The "shell" is everything *before* a minigame: app open, title splash, page-peel, case-file modal, desk 3D scene, prop hovers, evidence HUD, transitions into a minigame, return-to-desk after a minigame.

User priority: **smooth + slick, not fancy**. 90/100 = a player completing entry-to-first-minigame thinks "tight, polished" without anything jarring.

Order by leverage. Mark each item `[done]`, `[blocked]`, or leave open.

## High leverage

- [x] **SH-1 Case-file modal pacing** — `CASE_FILE_BODY_LINES` shrunk from a 165-char control dump to 3 punchy bullets ("Scan / Open four / Make the call"). Detailed controls live in `?howto=1` modal already. (+5) **[done iter-21]**
- [ ] **SH-2 Desk hit-routing inconsistency** — the lamp's invisible hit volume bleeds over the envelope at certain viewport sizes (deep-sentence and shell-review agents both saw clicks routed to the wrong prop). Likely `desktopDiorama.ts:475-481` invisible-mesh sizes. (+5)
- [x] **SH-3 Hover-tooltip overlap with HUD** — `setHover` flips tooltip transform to `translate(-50%, 14px)` (below cursor) when cursor is in the HUD safe zone (y < 110). Default remains "above cursor" elsewhere. (+3) **[done iter-22]**
- [x] **SH-4 Top-center prompt wraps + overlays code text** — shortened to "sweep the desk — trust the tooltip" (45 chars → 32). Single line at typical canvas width. (+2) **[done iter-21]**
- [x] **SH-5 Desk chrome ?/× buttons collision in minigames** — softened `drawDeskChromeAi` chip fill from 0.9α to 0.55α, glyphs muted to 0.85α; chrome now recedes visually instead of competing with title strips in the same y-band. (+2) **[done iter-22]**

## Medium leverage

- [x] **SH-6 HUD evidence row reads as muted/empty** — empty `tok` opacity 0.25 → 0.55 with `_ _ _ _` placeholder + 0.08em letter-spacing. Reads as a tracker, not a broken state. Filled state resets letter-spacing. (+2) **[done iter-23]**
- [x] **SH-7 Title splash → page-peel pacing** — splash dismiss timeout 350→220ms + CSS opacity transition 320→200ms. Snappier handoff to the original page-peel. (+1) **[done iter-24]**
- [x] **SH-8 Return-to-desk transition** — overlay fadeOut 180→280ms so the curtain rides the 420ms camera move back instead of snapping out early. (+1) **[done iter-24]**

## Polish

- [x] **SH-9 Smooth cursor on prop hover** — already addressed by the existing loupe overlay (`loupeEl` in `hud.ts`) that follows the cursor and fades in on hoverable props. The look-cue is visual, not a native CSS cursor swap. (+1) **[resolved by existing UX]**
- [ ] **SH-10 Audio bed under the desk view** — soft ambient tone (typing/static) so silence between actions doesn't feel dead. (+1)
