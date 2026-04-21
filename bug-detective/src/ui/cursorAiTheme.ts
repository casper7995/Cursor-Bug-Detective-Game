/**
 * Cursor product-UI palette for the desk minigames.
 *
 * The runner deliberately keeps the warm/orange `CURSOR` brand palette
 * (`src/ui/cursorTheme.ts`) for its retro-arcade look. The three desk
 * minis switch to this lighter, near-white palette to match the
 * Cursor IDE's product chrome.
 */
export const CURSOR_AI = {
  /** Primary card surface — near-white. */
  surface: "#fdfdfa",
  /** Secondary surface (hover, sub-cards). */
  surfaceMute: "#f4f3ef",
  /** Default border on cards / pills. */
  border: "#dfdcd3",
  /** Selected / focused border. */
  borderStrong: "#b6b2a5",
  /** Primary text. */
  ink: "#1a1812",
  /** Secondary text (labels, status). */
  inkMute: "#5a554a",
  /** Subtle text (captions, placeholders). */
  inkSubtle: "#8b8678",
  /** Ghost-text overlay for autocomplete suggestions. */
  ghost: "rgba(20,18,11,0.32)",
  /** Cursor brand orange — used sparingly as accent. */
  accent: "#f54e00",
  accentMute: "rgba(245,78,0,0.12)",
  /** Recommended / "right" answer color (Cursor product blue). */
  blue: "#1f6feb",
  blueMute: "rgba(31,111,235,0.10)",
  /** Approve / success. */
  green: "#1f883d",
  greenMute: "rgba(31,136,61,0.12)",
  /** Reject / destructive. */
  red: "#cf222e",
  redMute: "rgba(207,34,46,0.12)",
  /** Funny / alternate suggestion. */
  purple: "#6e40c9",
  purpleMute: "rgba(110,64,201,0.12)",
  /** Soft drop-shadow color for elevated cards. */
  shadow: "rgba(20,18,11,0.18)",
  /** Outer scrim that the desk-mini overlay paints behind cards. */
  scrim: "rgba(6,5,4,0.86)",
} as const;
