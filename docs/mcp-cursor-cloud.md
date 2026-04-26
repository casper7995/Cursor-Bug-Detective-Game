# Cursor MCP: cloud agents vs local config (Supabase & Vercel)

This note is for human setup only. It does **not** belong in the repo as secrets. Never commit tokens, personal access tokens (PATs), or a copied `mcp.json` that contains them.

## Cloud agents vs `~/.cursor/mcp.json`

- **Local Cursor (desktop)**: You configure remote MCP servers in your **user** config, typically `~/.cursor/mcp.json`, or a project-level `.cursor/mcp.json` that stays **out of version control** if it holds secrets. Official Cursor context: [Model Context Protocol (MCP)](https://docs.cursor.com/en/context/mcp).
- **Cursor Cloud / remote agents**: Those environments have their own MCP allowlists and do **not** automatically read your laptop’s `~/.cursor/mcp.json`. You configure MCP for cloud agents in the product’s cloud/agent settings, or use the provider’s supported env-based patterns for automation—see each vendor’s current docs.
- This repo may ignore a future root `mcp.json` (see `.gitignore`) so a local file is not committed by mistake. Prefer `~/.cursor/mcp.json` for personal tools.

## Supabase hosted MCP (PAT + optional project scope)

Supabase’s hosted endpoint is `https://mcp.supabase.com/mcp`. In Cursor, use **streamable HTTP** and set:

- `type`: `http` (as required for remote HTTP transport in your Cursor version)
- `url`: `https://mcp.supabase.com/mcp` with optional **query** parameters (append to the URL, not as separate JSON comments—JSON has no comments)

Authoritative details, security notes, and parameter tables: [Model context protocol (MCP) | Supabase Docs](https://supabase.com/docs/guides/getting-started/mcp).

**Query parameters (documented by Supabase)** include, for example:

- `project_ref=<project-id>` — scope to one project (recommended); find the ID in project settings.
- `read_only=true` — use read-only DB role.
- `features=...` — limit tool groups (comma-separated).

Example shape (placeholders only):

```text
https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF&read_only=true
```

**PAT and headers**

- Create a **personal access token** under your Supabase account: **Dashboard → Account → Access Tokens** (path may evolve; use current UI).
- For **CI or non-interactive** use, Supabase documents passing a PAT as **`Authorization: Bearer <token>`** on the HTTP MCP connection.
- For **interactive** use, the hosted server can use dynamic registration; a PAT in headers is often used to **skip repeated OAuth** in the IDE.

**Manual auth / link**

- Use the **MCP** connection entry in the Supabase dashboard (your project) for a guided connection URL and copy/paste, per current Supabase UI.

**Env substitution (CI)**

- Supabase’s docs show `Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}` and `?project_ref=${SUPABASE_PROJECT_REF}` in examples for automation. **Cursor’s `mcp.json` may or may not expand** `${VAR}`—confirm in your Cursor version; if not, inject secrets via your environment or use your CI system’s secret store and generate the config at runtime. Never commit expanded tokens.

## Vercel official MCP: OAuth, not a repo PAT in headers

Vercel’s **official** remote MCP is **`https://mcp.vercel.com`**. Official documentation describes a **remote MCP with OAuth** (MCP Authorization + streamable HTTP), client allowlists, and setup with **URL only** (no documented static API token in `headers` for the hosted `mcp.vercel.com` product).

- Docs entry point: [Use Vercel’s MCP server](https://mcp.vercel.com/docs/headers) (Cursor section shows `mcp.json` with only `"url": "https://mcp.vercel.com"` and browser-based “Needs login”).
- If your client supports only OAuth for this host, add **no** fake `Authorization` header; complete sign-in in the UI when prompted.

**Redirect / “app redirect URL is invalid” (Cursor + Vercel OAuth)**

- This appears **on Vercel’s authorize page** before you finish sign-in. **Reconnecting, toggling the MCP, or “reactivating” the integration does not fix it** when the problem is a **bad or missing `redirect_uri` allowlist** for the OAuth client: each attempt still sends the same redirect Cursor cloud uses, and Vercel rejects it. That is a **Cursor cloud agent ↔ Vercel** product alignment issue, not a stuck token on your side.
- **Workarounds while broken:** use **Vercel MCP from desktop Cursor** (OAuth flow may work there, or fail differently), or run the agent **without** the Vercel MCP toggle. **File feedback to Cursor** (and follow threads below) if you need cloud + Vercel.

- That error is typically an **OAuth redirect URI / allowlist** mismatch between **Vercel’s OAuth app configuration** and **Cursor’s custom scheme** callback (e.g. `cursor://...`), not a bug in this repo. Track provider-side fixes and workarounds in Vercel’s and Cursor’s threads, for example:
  - [Vercel Community — Vercel MCP OAuth redirect URI issue with Cursor](https://community.vercel.com/t/vercel-mcp-oauth-redirect-uri-issue-with-cursor-the-app-redirect-url-is-invalid/39296)
  - [Cursor Forum — Vercel MCP OAuth fails (redirect URL invalid)](https://forum.cursor.com/t/vercel-mcp-oauth-fails-app-configuration-error-redirect-url-is-invalid/159005)

**Bearer / API token for Vercel MCP?**

- The **public hosted** Vercel MCP docs emphasize OAuth. Do **not** assume a Vercel “API token in `headers`” works for `mcp.vercel.com` unless Vercel publishes it; the supported pattern in their Cursor snippet is `url` + in-app login.

## Never commit tokens; rotate if exposed

- Do not paste PATs, OAuth client secrets, or `Authorization` values into the repo, issues, or plans.
- Prefer **CI secrets** (GitHub Actions secrets, Doppler, 1Password, etc.) and short-lived or narrowly scoped tokens.
- If a token ever appears in **chat logs, screen shares, or CI output**, **rotate** it in the provider dashboard (**Supabase**, **Vercel**, **Render**, etc.) and revoke the old credential.

## Related links

- [Cursor — MCP](https://docs.cursor.com/en/context/mcp)
- [Supabase — MCP](https://supabase.com/docs/guides/getting-started/mcp)
- [Vercel — MCP (headers / setup)](https://mcp.vercel.com/docs/headers)
