import { execFileSync } from "node:child_process";

/**
 * Map common Git remote forms to a concise https GitHub URL for Cursor cloud `repos[]`.
 * See https://cursor.com/docs — cloud agents need an explicit repo when the account default is wrong.
 */
export function normalizeGitRemoteToHttpsUrl(raw: string): string {
  const trimmed = raw.trim();
  const at = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (at) return `https://github.com/${at[1]}/${at[2]}`;
  const ssh = trimmed.match(
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i,
  );
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}`;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\.git$/i, "");
  }
  return trimmed;
}

function gitTopLevel(cwd: string): string | undefined {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/**
 * `remote.origin.url` for the worktree that contains `cwd` (e.g. `bug-detective/` in a monorepo).
 */
export function gitOriginUrlFromWorktree(cwd: string): string | undefined {
  const top = gitTopLevel(cwd) ?? cwd;
  try {
    const out = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd: top,
      encoding: "utf8",
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Target repo for Cursor cloud agents: env override, else the clone's `origin` (so runs match this checkout).
 */
export function resolveQaCloudRepoUrl(repoRoot: string): string | undefined {
  const fromEnv = process.env.CURSOR_QA_REPO_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\.git$/i, "");
  const raw = gitOriginUrlFromWorktree(repoRoot);
  if (!raw) return undefined;
  return normalizeGitRemoteToHttpsUrl(raw);
}
