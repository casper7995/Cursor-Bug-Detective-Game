import { Input } from "../input";
import { clear, text } from "../render";
import type { Score } from "../score";
import type { CharacterKind } from "../types";
import { fetchLeaderboard, hasLeaderboardApi, postScore } from "../leaderboard";

function displayName(): string {
  try {
    const k = "cursor-crew:name";
    let n = localStorage.getItem(k);
    if (!n) {
      n = `cursor-${Math.floor(Math.random() * 9000 + 1000)}`;
      localStorage.setItem(k, n);
    }
    return n;
  } catch {
    return "anon";
  }
}

export function showEndScreen(
  ctx: CanvasRenderingContext2D,
  result: { score: Score; character: CharacterKind },
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const name = displayName();
  let board: Array<{ score: number; combo: number; name: string }> = [];
  let rank: number | null = null;
  let loaded = false;

  void (async () => {
    if (hasLeaderboardApi()) {
      const posted = await postScore(
        date,
        result.character,
        result.score.total,
        result.score.peakCombo,
        name,
      );
      rank = posted?.rank ?? null;
      board = await fetchLeaderboard(date, result.character);
    }
    loaded = true;
  })();

  Input.consumePress();
  return new Promise((resolve) => {
    function frame(): void {
      const w = window.innerWidth;
      const h = window.innerHeight;
      clear(ctx, w, h);
      text(ctx, "TIME!", w / 2, h / 2 - 100, { size: 36, align: "center" });
      text(ctx, `${result.character.toUpperCase()}`, w / 2, h / 2 - 60, {
        size: 14,
        align: "center",
        color: "#aaa",
      });
      text(ctx, `score  ${result.score.total}`, w / 2, h / 2 - 20, {
        size: 24,
        align: "center",
      });
      text(
        ctx,
        `peak combo  ×${result.score.peakCombo.toFixed(1)}`,
        w / 2,
        h / 2 + 14,
        {
          size: 14,
          align: "center",
          color: "#aaa",
        },
      );
      text(ctx, `kills  ${result.score.kills}`, w / 2, h / 2 + 34, {
        size: 14,
        align: "center",
        color: "#aaa",
      });
      if (rank != null) {
        text(ctx, `daily rank  #${rank}`, w / 2, h / 2 + 54, {
          size: 12,
          align: "center",
          color: "#7dd3fc",
        });
      }
      text(ctx, "click or press SPACE / ENTER to play again", w / 2, h - 100, {
        size: 12,
        align: "center",
        color: "#888",
      });

      if (loaded && board.length > 0) {
        text(ctx, "top 10 today", w - 160, 48, { size: 12, color: "#94a3b8" });
        for (let i = 0; i < Math.min(10, board.length); i++) {
          const row = board[i]!;
          text(
            ctx,
            `${i + 1}. ${row.name}  ${row.score}`,
            w - 160,
            68 + i * 18,
            {
              size: 11,
              color: "#cbd5e1",
            },
          );
        }
      } else if (hasLeaderboardApi() && !loaded) {
        text(ctx, "syncing leaderboard…", w - 160, 48, {
          size: 11,
          color: "#64748b",
        });
      }

      if (Input.isDown(" ") || Input.isDown("enter") || Input.consumePress()) {
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
