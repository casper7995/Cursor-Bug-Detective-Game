# Security policy

If you discover a vulnerability in Bug Detective **or its Cloudflare Worker deployment**,
please report it responsibly so we can address it before public disclosure.

## How to report

- Prefer **[GitHub private security advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)** for this repository (**Security → Report a vulnerability**), if enabled.
- If advisories are not available, email the maintainer privately (do **not** open a public issue for undisclosed vulnerabilities).

Include:

- Description and impact
- Steps to reproduce (or proof-of-concept)
- Affected components (client, `bug-detective/worker/`, Pages build, etc.)

## Scope

In scope:

- Game client in `bug-detective/` (XSS, unsafe data handling, etc.)
- Leaderboard Worker in `bug-detective/worker/` (abuse, auth/CORS issues, data integrity)
- Build and deploy configuration that could expose secrets or allow supply-chain issues

Out of scope (examples):

- Denial-of-service against the static site without a clear security impact
- Issues requiring physical access to a user’s machine
- Third-party services unless the bug is in our integration code

## Safe harbor

We support good-faith security research. Do not access data that is not yours,
do not degrade production services, and give us reasonable time to fix before
public disclosure.

## After reporting

We aim to acknowledge reports promptly. Fixes may be released via normal `main`
commits and deploys; critical issues may be coordinated out of band.
