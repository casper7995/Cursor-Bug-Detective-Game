# Cursor Crew — Design Spec

**Project:** Vibe Jam 2026 entry  
**Date:** 2026-04-17  
**Deadline:** 2026-05-01 13:37 UTC (~2 weekends)  
**Author:** caspe + AI

## 1. Concept

A 120-second top-down arena game. The player picks one of five **system cursors** as their character and racks up combo kills against waves of hostile UI elements (404 errors, popups, cookie banners, loading spinners, unread notifications). Three bots play alongside the human in every match, each as a different cursor character, so the arena always feels populated. Daily global leaderboard per character.

**Working title:** Cursor Crew. Final name TBD; must avoid Cursor's trademarked logo or product name.

## 2. Why this wins (jam-specific success criteria)

- **Replay loop** — sub-2-minute matches + per-character leaderboards drive Most Played / Most Playtime sub-prizes.
- **Jury appeal** — recognizable mascot, charming non-violent combat, juicy feel.
- **Virality** — screenshot-able score, "best with hand cursor: 18,420" tweet loop.
- **Sponsor adjacency** — cursor-as-character without using Cursor IP. Sponsor-amplification upside without trademark risk.
- **Rule compliance** — vanilla web, instant load (<50 KB bundle), no signup, jam widget snippet day 1, brand-new code.

## 3. Game design

### 3.1 Match flow

- **Single screen.** Player lands on a character-pick row (5 cursors). Click → match starts immediately. No menus.
- **120 seconds** per match. One arena map for v1.
- **Spawn curve:** linear ramp on enemy spawn rate and enemy speed across the match. Last 30 seconds visibly chaotic.
- **Mini-boss event at 60 seconds:** Captcha Wheel spawns. Surviving it = score bonus + brief calm window before final wave.
- **End screen:** score, peak combo multiplier, daily rank, **Share Screenshot** + **Play Again** (default-focused → spacebar restarts).

### 3.2 Scoring

- **Score = sum of (kill_value × combo_multiplier).**
- **Kill values per enemy:** 404 Walker = 10, Cookie Banner = 30, Loading Spinner = 20, Unread Notification = 15, Popup Ad = 25, Captcha Wheel mini-boss = 500.
- **Combo multiplier:** starts at 1.0, +0.1 per kill, **resets to 1.0 on taking damage**. No upper cap in v1.
- **Character-specialty bonuses (multiplicative on top of base × combo):**
  - Crosshair: ×1.5 on snipes that traveled >60% screen distance before hit
  - I-beam: ×1.25 on melee kills made while combo multiplier is ≥1.5
  - Hand: ×1.25 when a thrown enemy lands a kill on another enemy
  - Spinner: ×1.25 on each kill within a single spin that takes 3+ enemies
  - Arrow: ×1.1 always-on (all-rounder bonus)

### 3.3 Characters (v1 roster of 5)

| Character | Move speed | Attack | Niche |
|---|---|---|---|
| Arrow | 1.0× | medium-range arrow shot, 1 dmg | balanced default |
| I-beam | 1.4× | short vertical sword swipe, 1 dmg | melee combo specialist |
| Hand | 1.0× | grab + throw enemy as projectile, 1 dmg + collateral | crowd control |
| Spinner | 0.7× | spin-in-place AoE damage, 1 dmg/tick | wave-clear |
| Crosshair | 0.6× | high-damage long-range snipe (3 dmg), slow fire rate | precision/risk |

All sprites drawn in canvas, no image assets. Roughly 32×32 pixels; vector-style.

### 3.4 Enemies (v1 roster of 5)

| Enemy | HP | Behavior |
|---|---|---|
| 404 Walker | 1 | slow chase; on death, splits into two 0.5-speed walkers (visual gag) |
| Cookie Banner | 3 | moves in a horizontal line; physically blocks the player until destroyed |
| Loading Spinner | 2 | orbits player at distance; harder to hit; low contact damage |
| Unread Notification | 1 | fast suicide-rusher; explodes on contact for 1 dmg |
| Popup Ad | 2 | spawns mid-screen randomly; if not killed in 5s, spawns 2 more popups |

**Mini-boss:** Captcha Wheel — spawns at 60s, center of arena. Has 9 HP. Visually a spinning wheel of "select all images with traffic lights" tiles. Slowly fires single damage projectiles outward in 8 directions every 2 seconds. On death: +500 score, brief 2-second calm window before final wave begins. If not killed within 20 seconds, despawns and forfeits the bonus.

### 3.5 Bots

3 bots per match, one per non-player character. Simple AI:

- Find nearest enemy.
- If in attack range → attack.
- Else move toward enemy.
- If incoming projectile within 2 tiles → strafe perpendicular.

Bots show on the end-screen scoreboard. They make the game look populated in screenshots and create a competitive in-match score even when no humans are online — critical when judges visit an empty lobby.

### 3.6 Explicitly NOT in v1

- Power-ups, unlocks, currency, cosmetics
- Map variety
- Story / cutscenes / tutorial
- Account system / login
- Mobile-first input (test it works on touch, but desktop is primary)
- Background music (SFX only)
- Asset images (everything drawn in code)

## 4. Technical architecture

### 4.1 Stack

- **Build:** Vite + TypeScript
- **Engine:** plain HTML5 Canvas, vanilla TS, no game framework
- **Hosting:** Cloudflare Pages (free, edge CDN, instant deploy from git)
- **Persistence (Track 1):** Cloudflare Worker + KV for daily leaderboard
- **Audio:** [sfxr.me](https://sfxr.me/) generated SFX, inlined as base64
- **Multiplayer (Track 2 only, optional):** PartyKit (Cloudflare Durable Objects)
- **Bundle target:** <50 KB gzipped → instant load → passes jam rule decisively

### 4.2 Module layout

```
/src
  game.ts        - main loop, state machine
  characters.ts  - 5 cursor types: draw + behavior
  enemies.ts     - 5 enemy types + mini-boss: draw + behavior
  spawner.ts     - wave logic, difficulty curve, mini-boss trigger
  bots.ts        - 3 bots, AI behavior
  score.ts       - combo multiplier, end screen
  leaderboard.ts - fetch + post to Worker
  audio.ts       - SFX
  vibejam.ts     - required jam widget snippet
/worker
  index.ts       - daily seed + leaderboard endpoints
index.html       - canvas + jam widget snippet
```

### 4.3 Daily leaderboard

- Cloudflare Worker exposes:
  - `GET /seed/:date` → deterministic enemy spawn seed for the day
  - `GET /leaderboard/:date/:character` → top 100 scores
  - `POST /score` → `{ date, character, score, combo_peak, name }`
- KV namespace: one key per `date:character`, value = JSON sorted scores.
- Anti-cheat: Worker validates score is below a hard cap; not bulletproof, but jam-acceptable.

### 4.4 Multiplayer (Track 2 stretch only)

- PartyKit room per arena. Up to 4 humans per room, bots fill remaining slots.
- Authoritative server tick at 30 Hz; clients interpolate.
- If room is empty for >30s, returns to single-player + bots.
- **Drop the entire feature if Saturday of Weekend 2 isn't going well.** It is upside, not a dependency.

## 5. Scope plan

### Weekend 1 — Ship the playable

**Saturday:**
- Vite + TS scaffold
- Canvas, game loop, input
- Arrow character: draw, move, shoot
- 404 Walker enemy
- Basic combat: hit detection, damage, death
- Score counter

**Sunday:**
- 4 more characters (I-beam, Hand, Spinner, Crosshair)
- 4 more enemies (Cookie Banner, Loading Spinner, Notification, Popup Ad)
- Captcha mini-boss event
- Spawn curve / 120s timer
- End screen
- Character pick screen
- **Add jam widget snippet (rule 02 — disqualification risk if missed)**
- **Deploy to Cloudflare Pages, submit to vibej.am/2026 form**

Exit criteria: a complete, replayable, deployed game with a public URL.

### Weekend 2 — Polish + stretch

**Saturday:**
- Bots (AI behavior)
- Daily leaderboard (Worker + KV)
- Game feel pass: screen shake, hit-stop, particles, SFX
- Character-specialty score bonuses

**Sunday:**
- Final polish
- Optional: PartyKit multiplayer (only if Saturday wraps clean)
- Optional: portal integration (free webring traffic)
- Final deploy + share on X

Exit criteria: leaderboard live, juice in, game feels good.

## 6. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Combat doesn't feel good | Medium | Borrow well-known juice patterns (screen shake on hit, 50ms hit-stop, particle burst, low-pitch SFX). Time-box feel iteration. |
| Multiplayer netcode blows up | High **if attempted** | Track 2 is optional. Don't start until everything else ships. |
| Bot AI feels dumb | Medium | Simple rules are fine for 3 bots in a 120s match; do not over-engineer. |
| **Jam widget forgotten = disqualification** | Medium | Add it on Sunday of Weekend 1 as part of the deploy step. Verify on submitted page. |
| Bundle too large | Low | No image assets; vanilla canvas. Vite default output is well under target. |
| KV write rate limited | Very low | Daily leaderboard writes ~once per match end; well under free-tier limits. |
| Trademark / brand issues | Low | Use system cursors (public-domain UI), avoid Cursor-the-product logo, name carefully. |
| Mobile broken | Medium | Test once on phone; if input isn't usable, ship desktop-first and note it. Not worth fighting. |

## 7. Out of scope

- Three.js / WebGL
- Image asset pipeline
- User accounts
- Background music
- Multiple arena maps
- Cosmetics, unlocks, currency
- Tutorial / story content

## 8. References

- Vibe Jam 2026 rules: <https://vibej.am/2026/>
- Press release: <https://vibej.am/2026/press>
- 2025 Gold winner (reference for tone/scope): <https://great-taxi-assignment.netlify.app/?ref=vibejam>
- PartyKit (multiplayer stretch): <https://www.partykit.io/>
- Cloudflare Pages: <https://pages.cloudflare.com/>
