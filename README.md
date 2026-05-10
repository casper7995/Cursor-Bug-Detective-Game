# Bug Detective

**Bug Detective** is a browser game made for [Vibe Jam 2026](https://vibej.am/2026/): a lighthearted twist on debugging where *you* are a small cursor-shaped mascot hunting a fake “bug” hidden in a desk scene before the timer runs out.

## What you do

You land on one hand-built 3D desktop diorama—a monitor, mug, clues, sticky notes, and other props arranged like a messy workspace. Your job is to **spot what feels wrong**, **inspect the props** (hover and zoom-style looks at the suspicious bits), and **gather cipher-style clues** from a few themed minigames tied to desk objects (code runner, word puzzle, lane defense sketch, tamper-call rhythm). When you have enough evidence, you **pick the bug from three multiple-choice answers** and get a score for speed and how little you leaned on hints. The anomaly **rotates daily** from a shared seed, so everyone gets the same “case” for that day—handy for jam voting and leaderboards—while optional endless runs add a score-chasing arcade layer.

Under the hood it is a **single polished case loop** (~90 seconds of pressure once you are in), **procedural audio** (no shipped music files), and a **Cloudflare Worker** that serves the daily seed and optional leaderboard posts when configured.

## Tech (for builders)

Three.js + Vite + TypeScript; Vitest + Playwright for tests. See [`bug-detective/README.md`](bug-detective/README.md) for scripts, ports, and full stack detail.

## Repository map

- **Live game & local dev:** [`bug-detective/README.md`](bug-detective/README.md)
- **Deploy (Cloudflare Pages + Worker):** [`bug-detective/DEPLOY.md`](bug-detective/DEPLOY.md)
- **Jam hand-off / design notes:** [`bug-detective/HANDOFF.md`](bug-detective/HANDOFF.md)
- **Leaderboard worker API:** [`bug-detective/worker/README.md`](bug-detective/worker/README.md)

## Quick start

```bash
cd bug-detective
npm install
npm run dev
```

Details, **Playwright / `verify`**, and build notes: [`bug-detective/README.md`](bug-detective/README.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [LICENSE](LICENSE).

## Cross-browser audit

[`bug-detective/CROSS_BROWSER.md`](bug-detective/CROSS_BROWSER.md)

## Optional maintainer notes

Ship-direction context (not required to play or build): [`MAINTAINERS.md`](MAINTAINERS.md).
