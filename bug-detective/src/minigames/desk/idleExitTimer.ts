/**
 * Real-round idle watchdog: exits the mini after continuous inactivity.
 * Call `ping()` on every meaningful player input; `step()` each frame.
 */

export class IdleExitTimer {
  private readonly graceSec: number;
  private readonly onExit: () => void;
  private remaining: number;
  private exited = false;

  constructor(opts: { graceSec: number; onExit: () => void }) {
    this.graceSec = opts.graceSec;
    this.onExit = opts.onExit;
    this.remaining = opts.graceSec;
  }

  /** Reset the countdown to full grace (call on player input). */
  ping(): void {
    if (this.exited) return;
    this.remaining = this.graceSec;
  }

  step(dtSec: number): void {
    if (this.exited) return;
    this.remaining -= dtSec;
    if (this.remaining <= 0) {
      this.exited = true;
      this.onExit();
    }
  }

  remainingSec(): number {
    return Math.max(0, Math.ceil(this.remaining));
  }

  isExited(): boolean {
    return this.exited;
  }
}
