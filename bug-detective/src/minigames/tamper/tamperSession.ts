/** Spot the Tampering — desk-mini session, restyled as a "Bugbot review". */

import type { MiniGameOutcome } from "../types";
import { CURSOR_AI } from "../../ui/cursorAiTheme";
import { RUNNER_DRAW } from "../runner/sim";
import {
  clientToDeskGame,
  DESK_SCRIM,
  drawDeskChromeAi,
  getDeskFullRect,
  hitDeskCloseButton,
} from "../desk/deskLayout";
import { hitDeskHelpButton, TutorialGate } from "../desk/tutorialGate";
import {
  buildTamperRound,
  namespacedSeed,
  scoreCall,
  scoreTamperRound,
  tamperEarnsDeskClue,
  tamperVerdictFeedbackLine,
} from "./round";
import {
  drawChatCard,
  drawDiffCard,
  drawInstructionCard,
  drawIntroCard,
  drawResultCard,
  drawTamperDiffHintGutter,
  drawTamperTutorialDiagram,
  spotPropAt,
  TAMPER_LAYOUT,
  type ChatHits,
  type TamperChatActionMode,
} from "./draw";
import {
  type CallVerdict,
  type TamperRound,
  type TamperSpot,
  TAMPER_CALLS_PER_ROUND,
  TAMPER_CLUE_MIN_RIGHT_VERDICTS,
} from "./types";
import { clueTokenForTamper } from "./clueTokens";
import {
  sfxTamperPanelHover,
  sfxTamperSpotMode,
  sfxTamperVerdict,
} from "../../audio/audio";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

const INTRO_DURATION_S = 1.5;
/** How-to before the read beat (dismiss on click/keys or time). */
const INSTRUCTIONS_MAX_S = 3.5;
/** Quiet beat to read ORIGINAL / TONIGHT before timers start. */
const READ_BEAT_S = 1.25;
/** Per-call limit: must scan ORIGINAL + TONIGHT + Bugbot’s row claim, then act. */
const CALL_DURATION_S = 4.25;
/** After Disagree → point: player already knows the real change; short tap window. */
const POINT_DURATION_S = 2.25;
/** Long enough to read "Caught a confident lie!" + score-bit. Reviewer iter-X
 * flagged 0.6s as "barely long enough to register the +500 catch". */
const VERDICT_FLASH_S = 1.2;
const RESULT_AUTOCLOSE_S = 3.2;
/** Click-to-skip on the result card is disabled for this window so the
 *  teach line ("Real change: …") gets read before dismissal. T-7 follow-up
 *  flagged by iter-36 reviewer. */
const RESULT_MIN_READ_S = 1.0;

export interface TamperSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  /** Anomaly's gameClueWords.tamper string. */
  readonly clueWord: string;
  readonly onExit: () => void;
}

type Hover = "approve" | "reject" | "suggestFix" | null;

type Phase =
  | { kind: "intro"; t: number }
  | { kind: "instructions"; t: number }
  | { kind: "read"; t: number }
  | {
      kind: "call";
      callIndex: number;
      t: number;
      hover: Hover;
    }
  | {
      kind: "disagree-point";
      callIndex: number;
      t: number;
    }
  | {
      kind: "verdict";
      callIndex: number;
      t: number;
      result: {
        delta: number;
        rightCall: boolean;
        caughtLie: boolean;
        confidentCatch: boolean;
      };
      verdict: CallVerdict;
    }
  | { kind: "result"; t: number };

export class TamperSession {
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly getOverlayViewport: () => { cssW: number; cssH: number };
  private readonly onExit: () => void;
  private readonly renderCtx: CanvasRenderingContext2D;
  private readonly clueWord: string;
  private readonly round: TamperRound;
  /** O(1) spot lookup — built once at round time, shared by chat/result render. */
  private readonly spotsById: ReadonlyMap<string, TamperSpot>;
  private readonly verdicts: CallVerdict[] = [];
  /** Remaining-time fraction (0..1) for each verdict, parallel to `verdicts`. */
  private readonly verdictTimeFracs: number[] = [];
  private phase: Phase = { kind: "intro", t: 0 };
  private outcome: MiniGameOutcome | null = null;
  /** Prevents double onExit / double outcome from result timeout + click. */
  private resultSheetDismissed = false;
  private pointerBound = false;
  /** Cached hit-rects from the most recent draw — re-used by pointer events. */
  private chatHits: ChatHits | null = null;
  /** Spot id under the cursor in TONIGHT during pick-mode (else null). */
  private hoveredPropId: string | null = null;
  /** Frozen at result-phase entry — score + variant list don't change after. */
  private resultMemo: {
    readonly score: ReturnType<typeof scoreTamperRound>;
    readonly tamperedVariants: readonly string[];
  } | null = null;
  private readonly gate = new TutorialGate({
    title: "Spot the difference",
    tagline: "Bugbot circles a prop each call — did it really change?",
    howToLines: [
      "Compare ORIGINAL ↔ TONIGHT. Bugbot circles one prop per call.",
      "Hit Yes if it really changed; No if it's clean.",
      "Faster taps score more — speed is the differentiator.",
      "Optional: when No, point to the real change for a bonus.",
      `Need ${String(TAMPER_CLUE_MIN_RIGHT_VERDICTS)} / 6 calls right to pin the lamp clue.`,
    ],
    drawDiagram: drawTamperTutorialDiagram,
    storageKey: "bd:miniTutorial:tamper",
  });

  constructor(opts: TamperSessionOpts) {
    this.overlayCtx = opts.overlayCtx;
    this.getOverlayViewport = opts.getOverlayViewport;
    this.onExit = opts.onExit;
    this.clueWord = opts.clueWord;
    const seed = namespacedSeed(0x9e3779b1, `tamper:${opts.clueWord}`);
    this.round = buildTamperRound(seed);
    this.spotsById = new Map(this.round.scene.spots.map((s) => [s.id, s]));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2d");
    this.renderCtx = ctx;
  }

  private gameFromClient(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    return clientToDeskGame(
      clientX,
      clientY,
      this.overlayCtx,
      this.getOverlayViewport,
    );
  }

  private currentCall(): {
    call: TamperRound["calls"][number];
    callIndex: number;
  } | null {
    if (this.phase.kind === "read") {
      return {
        call: this.round.calls[0] as TamperRound["calls"][number],
        callIndex: 0,
      };
    }
    if (
      this.phase.kind === "call" ||
      this.phase.kind === "disagree-point" ||
      this.phase.kind === "verdict"
    ) {
      return {
        call: this.round.calls[
          this.phase.callIndex
        ] as TamperRound["calls"][number],
        callIndex: this.phase.callIndex,
      };
    }
    return null;
  }

  private actionModeForPhase(): TamperChatActionMode {
    const k = this.phase.kind;
    if (k === "intro") return "idle";
    if (k === "instructions" || k === "result") return "hidden";
    if (k === "read") return "readBeat";
    if (k === "call") return "active";
    if (k === "disagree-point") return "pointPick";
    if (k === "verdict") return "verdict";
    return "active";
  }

  private diffHintLine(): string | null {
    if (this.phase.kind === "disagree-point") {
      return "Click the real changed prop in TONIGHT.";
    }
    if (this.phase.kind === "read" || this.phase.kind === "call") {
      return "Compare panels — judge Bugbot’s prop claim.";
    }
    if (this.phase.kind === "instructions") {
      return "Compare panels — get ready to judge each call.";
    }
    return null;
  }

  attachPointer(root: HTMLElement): void {
    if (this.pointerBound) return;
    this.pointerBound = true;
    const overlayRect = (): DOMRect =>
      this.overlayCtx.canvas.getBoundingClientRect();

    const handleGatePointer = (p: { x: number; y: number }): boolean => {
      if (!this.gate.isBlocking()) return false;
      return this.gate.handlePointer(p.x, p.y, W, H) !== null;
    };
    const routeTutorialPointer = (clientX: number, clientY: number): void => {
      const rect = overlayRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return;
      }
      handleGatePointer(this.gameFromClient(clientX, clientY));
    };

    const move = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      // Update prop-hover during pick-mode for the brighter highlight.
      if (this.phase.kind === "disagree-point") {
        const hit = spotPropAt(this.round.scene, p.x, p.y);
        this.hoveredPropId = hit?.spotId ?? null;
        return;
      }
      this.hoveredPropId = null;
      if (this.phase.kind !== "call") return;
      const hits = this.chatHits;
      if (!hits) return;
      let hover: Hover = null;
      if (inRect(p.x, p.y, hits.approve)) hover = "approve";
      else if (inRect(p.x, p.y, hits.reject)) hover = "reject";
      else if (inRect(p.x, p.y, hits.suggestFix)) hover = "suggestFix";
      if (this.phase.hover !== hover) {
        if (hover !== null) sfxTamperPanelHover();
        this.phase.hover = hover;
      }
    };
    const down = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      if (this.outcome) return;
      if (hitDeskCloseButton(p.x, p.y)) {
        this.onExit();
        return;
      }
      if (hitDeskHelpButton(p.x, p.y, W)) {
        this.gate.reopen();
        return;
      }
      if (handleGatePointer(p)) {
        return;
      }
      if (this.phase.kind === "result") {
        // Hold the teach line on screen for a minimum read window even
        // when the player clicks to skip — otherwise no-clue rounds dismiss
        // before the player sees what was tampered.
        if (this.phase.t >= RESULT_MIN_READ_S) {
          this.dismissResultSheet();
        }
        return;
      }
      if (this.phase.kind === "instructions") {
        this.phase = { kind: "read", t: 0 };
        return;
      }
      if (this.phase.kind === "call") {
        const hits = this.chatHits;
        if (!hits) return;
        if (inRect(p.x, p.y, hits.approve)) {
          this.commitVerdict({ kind: "agree" });
          return;
        }
        if (inRect(p.x, p.y, hits.reject)) {
          this.commitVerdict({ kind: "disagree" });
          return;
        }
        if (inRect(p.x, p.y, hits.suggestFix)) {
          sfxTamperSpotMode();
          this.phase = {
            kind: "disagree-point",
            callIndex: this.phase.callIndex,
            t: 0,
          };
          return;
        }
        return;
      }
      if (this.phase.kind === "disagree-point") {
        const hit = spotPropAt(this.round.scene, p.x, p.y);
        if (hit) {
          this.commitVerdict({ kind: "disagree-point", spotId: hit.spotId });
        } else {
          // Click outside any TONIGHT prop → fall back to plain disagree.
          this.commitVerdict({ kind: "disagree" });
        }
        return;
      }
    };
    const onDocPointerDown = (e: PointerEvent): void => {
      routeTutorialPointer(e.clientX, e.clientY);
    };
    const onDocMouseDown = (e: MouseEvent): void => {
      routeTutorialPointer(e.clientX, e.clientY);
    };
    const onDocClick = (e: MouseEvent): void => {
      routeTutorialPointer(e.clientX, e.clientY);
    };
    const onDocTouchStart = (e: TouchEvent): void => {
      const t = e.changedTouches[0] ?? e.touches[0];
      if (!t) return;
      routeTutorialPointer(t.clientX, t.clientY);
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerdown", down);
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("touchstart", onDocTouchStart, {
      capture: true,
      passive: true,
    });
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        if (this.gate.isBlocking()) {
          e.preventDefault();
          e.stopPropagation();
          this.gate.dismissFromKey();
          return;
        }
        if (this.phase.kind === "result") {
          e.preventDefault();
          e.stopPropagation();
          if (this.phase.t < RESULT_MIN_READ_S) {
            this.phase = { kind: "result", t: RESULT_MIN_READ_S };
          }
          this.dismissResultSheet();
          return;
        }
        this.onExit();
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        if (this.gate.isBlocking()) return;
        if (this.outcome) return;
        if (this.phase.kind === "instructions") {
          e.preventDefault();
          e.stopPropagation();
          this.phase = { kind: "read", t: 0 };
        }
      }
    };
    window.addEventListener("keydown", key, true);
    (this as unknown as { _cleanup?: () => void })._cleanup = (): void => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("mousedown", onDocMouseDown, true);
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("touchstart", onDocTouchStart, true);
      window.removeEventListener("keydown", key, true);
    };
  }

  private commitVerdict(v: CallVerdict): void {
    if (this.phase.kind !== "call" && this.phase.kind !== "disagree-point")
      return;
    const callIndex = this.phase.callIndex;
    const call = this.round.calls[callIndex];
    if (!call) return;
    // Compute how much call-time was left when the verdict landed. The point
    // sub-phase consumes its own short window; treat the time fraction as the
    // residual of the original CALL_DURATION_S since pickPhase entry.
    const phaseT = this.phase.t;
    const denom =
      this.phase.kind === "call" ? CALL_DURATION_S : POINT_DURATION_S;
    const timeFrac01 = Math.max(0, Math.min(1, 1 - phaseT / denom));
    this.verdicts.push(v);
    this.verdictTimeFracs.push(timeFrac01);
    const r = scoreCall(call, v, timeFrac01);
    sfxTamperVerdict(r);
    this.phase = { kind: "verdict", callIndex, t: 0, result: r, verdict: v };
  }

  private autoForwardFromCall(): void {
    if (this.phase.kind !== "call") return;
    this.commitVerdict({ kind: "agree" });
  }

  private autoForwardFromDisagreePoint(): void {
    if (this.phase.kind !== "disagree-point") return;
    this.commitVerdict({ kind: "disagree" });
  }

  private advanceAfterVerdict(): void {
    if (this.phase.kind !== "verdict") return;
    const next = this.phase.callIndex + 1;
    if (next >= TAMPER_CALLS_PER_ROUND) {
      this.enterResultPhase();
      return;
    }
    this.phase = { kind: "call", callIndex: next, t: 0, hover: null };
  }

  /** Freeze score + variant list once — both are pure functions of inputs that
   *  don't change during the result phase, so per-frame recompute was waste. */
  private enterResultPhase(): void {
    this.phase = { kind: "result", t: 0 };
    this.resultMemo = this.resultMemo ?? this.computeResultMemo();
  }

  private computeResultMemo(): NonNullable<typeof this.resultMemo> {
    const score = scoreTamperRound(
      this.round,
      this.verdicts,
      this.verdictTimeFracs,
    );
    const tamperedVariants = this.round.tamperedSpotIdsThisRound
      .map((id) => this.spotsById.get(id)?.tonightIfThisTampered)
      .filter((v): v is string => typeof v === "string");
    return { score, tamperedVariants };
  }

  /**
   * End of the result card: pin a cipher if thresholds met, else return to desk.
   * When a clue is earned, only set `outcome`; `main.ts` consumes it and then
   * tears down the overlay (Esc must not call onExit in that case).
   */
  private dismissResultSheet(): void {
    if (this.phase.kind !== "result") return;
    if (this.resultSheetDismissed) return;
    if (this.phase.t < RESULT_MIN_READ_S) return;
    this.resultSheetDismissed = true;
    const result = scoreTamperRound(
      this.round,
      this.verdicts,
      this.verdictTimeFracs,
    );
    if (tamperEarnsDeskClue(result)) {
      if (!this.outcome) {
        this.outcome = {
          clueToken: clueTokenForTamper(this.clueWord),
          score: result.score,
        };
      }
      return;
    }
    this.onExit();
  }

  step(dtSec: number): void {
    if (this.gate.isBlocking()) {
      this.draw();
      return;
    }
    switch (this.phase.kind) {
      case "intro": {
        this.phase = { kind: "intro", t: this.phase.t + dtSec };
        if (this.phase.t >= INTRO_DURATION_S) {
          this.phase = { kind: "instructions", t: 0 };
        }
        break;
      }
      case "instructions": {
        this.phase = {
          kind: "instructions",
          t: this.phase.t + dtSec,
        };
        if (this.phase.t >= INSTRUCTIONS_MAX_S) {
          this.phase = { kind: "read", t: 0 };
        }
        break;
      }
      case "read": {
        this.phase = { kind: "read", t: this.phase.t + dtSec };
        if (this.phase.t >= READ_BEAT_S) {
          this.phase = { kind: "call", callIndex: 0, t: 0, hover: null };
        }
        break;
      }
      case "call": {
        this.phase = {
          kind: "call",
          callIndex: this.phase.callIndex,
          t: this.phase.t + dtSec,
          hover: this.phase.hover,
        };
        if (this.phase.t >= CALL_DURATION_S) this.autoForwardFromCall();
        break;
      }
      case "disagree-point": {
        this.phase = {
          kind: "disagree-point",
          callIndex: this.phase.callIndex,
          t: this.phase.t + dtSec,
        };
        if (this.phase.t >= POINT_DURATION_S)
          this.autoForwardFromDisagreePoint();
        break;
      }
      case "verdict": {
        this.phase = {
          kind: "verdict",
          callIndex: this.phase.callIndex,
          t: this.phase.t + dtSec,
          result: this.phase.result,
          verdict: this.phase.verdict,
        };
        if (this.phase.t >= VERDICT_FLASH_S) this.advanceAfterVerdict();
        break;
      }
      case "result": {
        this.phase = { kind: "result", t: this.phase.t + dtSec };
        if (this.phase.t >= RESULT_AUTOCLOSE_S) this.dismissResultSheet();
        break;
      }
      default: {
        const _: never = this.phase;
        void _;
      }
    }
    this.draw();
  }

  private draw(): void {
    const ctx = this.renderCtx;
    // Light page background so cards have something to sit on.
    ctx.fillStyle = "#eceae3";
    ctx.fillRect(0, 0, W, H);

    // Title strip
    ctx.fillStyle = CURSOR_AI.ink;
    ctx.font = "700 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Spot the change", 18, 26);
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "11px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(`· ${this.round.scene.displayName} · Bugbot`, 118, 26);

    const cur = this.currentCall();
    // Reveal the tampered prop on every verdict (so a player who nailed it
    // confirms what they saw) and during the result card (so misses still
    // teach what to look for next round).
    const showRealTamper =
      this.phase.kind === "verdict" || this.phase.kind === "result";
    const pickingSpot = this.phase.kind === "disagree-point";
    // Falls back to the *first* call's tamper during intro/instructions —
    // the panels still render in those phases but no reveal is shown.
    const activeTamperedSpotId =
      cur?.call.tamperedSpotId ?? this.round.calls[0]!.tamperedSpotId;
    drawDiffCard(ctx, this.round.scene, {
      currentTamperedSpotId: activeTamperedSpotId,
      pointAtSpotId: cur?.call.bugbotPointsAtSpotId ?? null,
      showRealTamper,
      pickingSpot,
      hoveredSpotId: pickingSpot ? this.hoveredPropId : null,
    });
    const diffHint = this.diffHintLine();
    if (diffHint) {
      drawTamperDiffHintGutter(ctx, diffHint);
    }

    let secsLeft01 = 0;
    if (this.phase.kind === "call") {
      secsLeft01 = Math.max(0, 1 - this.phase.t / CALL_DURATION_S);
    } else if (this.phase.kind === "read") {
      secsLeft01 = 1;
    } else if (this.phase.kind === "disagree-point") {
      secsLeft01 = Math.max(0, 1 - this.phase.t / POINT_DURATION_S);
    } else if (this.phase.kind === "verdict") {
      secsLeft01 = 1;
    } else if (
      this.phase.kind === "instructions" ||
      this.phase.kind === "intro"
    ) {
      secsLeft01 = 1;
    }
    const hover = this.phase.kind === "call" ? this.phase.hover : null;
    this.chatHits = drawChatCard(
      ctx,
      cur?.call ?? null,
      this.round.scene,
      hover,
      secsLeft01,
      pickingSpot,
      this.actionModeForPhase(),
    );

    // Bottom strip — progress dots + verdict flash
    this.drawBottomStrip(ctx);

    // Phase overlays
    if (this.phase.kind === "intro") {
      drawIntroCard(
        ctx,
        W,
        H,
        this.round.scene,
        this.phase.t / INTRO_DURATION_S,
      );
    } else if (this.phase.kind === "instructions") {
      drawInstructionCard(ctx, W, H, this.phase.t / INSTRUCTIONS_MAX_S);
    } else if (this.phase.kind === "result") {
      // enterResultPhase() always populates resultMemo before kind="result";
      // the ?? branch only fires if a future code path skips the helper.
      const memo = this.resultMemo ?? this.computeResultMemo();
      drawResultCard(
        ctx,
        W,
        H,
        {
          score: memo.score.score,
          rightCalls: memo.score.rightCalls,
          rightVerdicts: memo.score.rightVerdicts,
          caughtLies: memo.score.caughtLies,
          avgTimeFrac01: memo.score.avgTimeFrac01,
          earnedClue: tamperEarnsDeskClue(memo.score),
          tamperedVariants: memo.tamperedVariants,
        },
        TAMPER_CALLS_PER_ROUND,
      );
    }

    drawDeskChromeAi(ctx);
    this.gate.draw(ctx, W, H);

    this.blit();
  }

  private drawBottomStrip(ctx: CanvasRenderingContext2D): void {
    const cur = this.currentCall();
    const stripY = H - 18;
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
    if (cur) {
      // Dots
      for (let i = 0; i < TAMPER_CALLS_PER_ROUND; i++) {
        const dx = TAMPER_LAYOUT.diffX + i * 12;
        ctx.fillStyle =
          i < cur.callIndex
            ? CURSOR_AI.green
            : i === cur.callIndex
              ? CURSOR_AI.accent
              : CURSOR_AI.border;
        ctx.beginPath();
        ctx.arc(dx, stripY, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = CURSOR_AI.inkMute;
      ctx.fillText(
        `call ${cur.callIndex + 1} / ${TAMPER_CALLS_PER_ROUND}`,
        TAMPER_LAYOUT.diffX + TAMPER_CALLS_PER_ROUND * 12 + 8,
        stripY + 3,
      );
    }
    if (this.phase.kind === "verdict") {
      const r = this.phase.result;
      const v = this.phase.verdict;
      const line = tamperVerdictFeedbackLine(v, r);
      const scoreBit = ` · ${formatScoreDelta(r)}`;
      ctx.fillStyle = r.rightCall ? CURSOR_AI.green : CURSOR_AI.red;
      ctx.font = "700 10px 'Cursor Gothic', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(
        `${line}${scoreBit}`,
        TAMPER_LAYOUT.chatX + TAMPER_LAYOUT.chatW,
        stripY + 3,
      );
      ctx.textAlign = "left";
    }
  }

  private blit(): void {
    const { cssW, cssH } = this.getOverlayViewport();
    const pr = getDeskFullRect(cssW, cssH);
    const octx = this.overlayCtx;
    const cw = octx.canvas.width;
    const ch = octx.canvas.height;
    const dpr = cw / Math.max(cssW, 1);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, cw, ch);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.fillStyle = DESK_SCRIM;
    octx.fillRect(0, 0, cssW, cssH);
    const scale = Math.min(pr.w / W, pr.h / H);
    const dw = W * scale;
    const dh = H * scale;
    const dx = pr.x + (pr.w - dw) / 2;
    const dy = pr.y + (pr.h - dh) / 2;
    octx.drawImage(this.renderCtx.canvas, dx, dy, dw, dh);
  }

  getOutcome(): MiniGameOutcome | null {
    return this.outcome;
  }

  dispose(): void {
    (this as unknown as { _cleanup?: () => void })._cleanup?.();
  }
}

function inRect(
  x: number,
  y: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function formatScoreDelta(r: { delta: number; rightCall: boolean }): string {
  if (!r.rightCall) return "—";
  return `+${r.delta}`;
}
