/** One sentence template per anomaly id. Used by the Sentence minigame. */

import { makeSeededRng } from "../../api/seedClient";
import type { AnomalyId } from "../../scene/anomalies";
import type { PickColor, SentenceSlot, SentenceTemplate } from "./types";

/** Each slot lists 1 blue (right), 3 purple (funny), 1 orange (mistake). */
interface SlotBank {
  readonly prefix: string;
  readonly blue: string;
  readonly purples: readonly string[];
  readonly orange: string;
  readonly suffix: string;
}

interface TemplateBank {
  readonly id: string;
  readonly slots: readonly SlotBank[];
}

const THREE_COLS: [PickColor, PickColor, PickColor] = [
  "blue",
  "purple",
  "orange",
];

/**
 * Shuffles display row order per slot using a sub-seed of `templateSeed` so
 * the row layout does not depend on how many `rng()` calls the purple pass
 * uses elsewhere.
 */
function shuffleRowOrder(
  templateSeed: number,
  slotIndex: number,
): [PickColor, PickColor, PickColor] {
  const mix = (templateSeed + (slotIndex + 1) * 0x9e3779b1) >>> 0;
  const rng = makeSeededRng(mix);
  const order: PickColor[] = [...THREE_COLS];
  for (let i = 2; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return [order[0]!, order[1]!, order[2]!];
}

/** Stable API for tests; matches `rowOrder` fields from `pickTemplate` for the same seed. */
export function getSuggestionRowOrder(
  templateSeed: number,
  slotIndex: number,
): [PickColor, PickColor, PickColor] {
  return shuffleRowOrder(templateSeed, slotIndex);
}

const TEMPLATE_BANKS: Record<AnomalyId, TemplateBank> = {
  "calendar-tomorrow": {
    id: "calendar-tomorrow",
    slots: [
      {
        prefix: "I checked the calendar and the date felt ",
        blue: "wrong",
        purples: ["spicy", "haunted", "extra"],
        orange: "fine",
        suffix: ".",
      },
      {
        prefix: "Specifically, the day square was for ",
        blue: "tomorrow",
        purples: ["payday", "leg day", "Bugbot's birthday"],
        orange: "today",
        suffix: ".",
      },
      {
        prefix: "Someone has been touching the ",
        blue: "calendar",
        purples: ["thermostat", "snacks", "stapler"],
        orange: "lamp",
        suffix: ", and not subtly.",
      },
      {
        prefix: "I pinned the page to the wall and wrote ",
        blue: "AHEAD OF SCHEDULE",
        purples: ["VERY ILLEGAL", "RUDE", "TIME COP STUFF"],
        orange: "looks normal",
        suffix: " across it.",
      },
      {
        prefix: "The meeting listed on that square was at ",
        blue: "a time that had not happened yet",
        purples: ["dawn", "lunch", "midnight"],
        orange: "the usual standup",
        suffix: ".",
      },
      {
        prefix: "I looked for a paper trail and found only ",
        blue: "a sticky with tomorrow's plan",
        purples: ["an HR flyer", "a cat meme", "a meeting link"],
        orange: "a clean desk",
        suffix: ".",
      },
      {
        prefix: "I checked the app sync, and the bug read ",
        blue: "offset by one",
        purples: ["cursed", "vibes only", "optimistic"],
        orange: "current",
        suffix: " — classic.",
      },
      {
        prefix: "I wrote: ",
        blue: "CALENDAR SUSPECT WINS",
        purples: ["RIP TIME", "OK COOL", "I QUIT DATES"],
        orange: "no notes",
        suffix: " in the margin.",
      },
    ],
  },
  "mug-name": {
    id: "mug-name",
    slots: [
      {
        prefix: "The coffee mug on the desk had a ",
        blue: "name",
        purples: ["confession", "haiku", "barcode"],
        orange: "smudge",
        suffix: " printed on it.",
      },
      {
        prefix: "It was, unmistakably, ",
        blue: "your name",
        purples: ["Linda from accounting", "the dog's name", "a typo"],
        orange: "no name",
        suffix: ".",
      },
      {
        prefix: "Someone left this for ",
        blue: "you",
        purples: ["the next sucker", "morale", "the cleaning crew"],
        orange: "anybody",
        suffix: ".",
      },
      {
        prefix: "I wrote in my notes: ",
        blue: "TARGETED",
        purples: ["RUDE", "BREWED WITH MALICE", "WHO DRINKS THIS"],
        orange: "uneventful",
        suffix: ".",
      },
      {
        prefix: "The handle was warm, like it had been ",
        blue: "used minutes ago",
        purples: ["microwaved", "argued with", "signed by a ghost"],
        orange: "sitting cold all day",
        suffix: ".",
      },
      {
        prefix: "The inside ring had a ",
        blue: "tiny ring stain",
        purples: ["love note", "QR code", "lipstick mark"],
        orange: "clean rim",
        suffix: " — too perfect.",
      },
      {
        prefix: "I cross-referenced the font: it matched ",
        blue: "the company brand",
        purples: ["Comic Sans", "wingdings", "hieroglyphs"],
        orange: "a random system font",
        suffix: ".",
      },
      {
        prefix: "I circled the clue: ",
        blue: "MAYBE IT'S FOR YOU",
        purples: ["DRINK ME", "FREE PIZZA", "HELLO"],
        orange: "nothing",
        suffix: ".",
      },
    ],
  },
  "clock-ccw": {
    id: "clock-ccw",
    slots: [
      {
        prefix: "The reagent tray's swirl was clearly ",
        blue: "backwards",
        purples: ["throwing shapes", "vibing", "unionising"],
        orange: "still",
        suffix: ".",
      },
      {
        prefix: "Time, in this room, was running ",
        blue: "in reverse",
        purples: ["ten minutes late", "uphill", "out"],
        orange: "as usual",
        suffix: ".",
      },
      {
        prefix: "I steadied myself and watched the ",
        blue: "clock",
        purples: ["mug", "coffee", "ceiling fan"],
        orange: "wallpaper",
        suffix: " for a beat.",
      },
      {
        prefix: "I underlined ",
        blue: "REVERSE",
        purples: ["ANTI-CLOCKWISE GOSSIP", "TIME RUDE", "BAD VIBES"],
        orange: "nothing",
        suffix: " three times.",
      },
      {
        prefix: "The second hand twitched, then did a ",
        blue: "full backward tick",
        purples: ["dance", "hiccup", "salute"],
        orange: "normal sweep",
        suffix: ".",
      },
      {
        prefix: "I matched the hand angle to a ",
        blue: "sweep across midnight",
        purples: ["pizza cut", "compass rose", "bad haircut"],
        orange: "3 o'clock on the dot",
        suffix: " — it didn't fit.",
      },
      {
        prefix: "The glass had a smudge shaped like a ",
        blue: "counter-clockwise hook",
        purples: ["lightning", "grin", "question mark"],
        orange: "clean streak",
        suffix: ".",
      },
      {
        prefix: "I stamped the report: ",
        blue: "TIME WENT THE WRONG WAY",
        purples: ["NO THANKS", "CLOCKY NO", "WEIRD REVERSE"],
        orange: "no stamp",
        suffix: ".",
      },
    ],
  },
  "monitor-reflection": {
    id: "monitor-reflection",
    slots: [
      {
        prefix: "I caught the monitor's ",
        blue: "reflection",
        purples: ["screensaver gossip", "mood", "dust"],
        orange: "brightness",
        suffix: " out of the corner of my eye.",
      },
      {
        prefix: "It showed a ",
        blue: "different room",
        purples: ["seagull", "buffet", "stranger waving"],
        orange: "blank screen",
        suffix: ".",
      },
      {
        prefix: "Whoever swapped the glass was ",
        blue: "in here",
        purples: ["showing off", "in a hurry", "bored"],
        orange: "imaginary",
        suffix: ".",
      },
      {
        prefix: "I jotted: ",
        blue: "GHOST ROOM IN GLASS",
        purples: ["MIRRORED VIBES", "BIG NOPE", "REAL ESTATE FRAUD"],
        orange: "all clear",
        suffix: ".",
      },
      {
        prefix: "The bezel had a ",
        blue: "fingerprint smear on the wrong side",
        purples: ["sticker", "fruit sticker", "hair"],
        orange: "clean edge",
        suffix: ".",
      },
      {
        prefix: "The taskbar in the reflection was ",
        blue: "from a different OS",
        purples: ["Linux with confidence", "CLI only", "games only"],
        orange: "identical",
        suffix: ".",
      },
      {
        prefix: "I angled the panel and saw ",
        blue: "the room's layout flip",
        purples: ["a cat", "my lunch", "nothing fun"],
        orange: "no change",
        suffix: ".",
      },
      {
        prefix: "I labeled the monitor: ",
        blue: "LIAR GLASS",
        purples: ["CUTE THO", "NO REFUNDS", "OK FINE"],
        orange: "fine",
        suffix: ".",
      },
    ],
  },
  "photo-self": {
    id: "photo-self",
    slots: [
      {
        prefix: "The case file photo's face looked ",
        blue: "familiar",
        purples: ["overworked", "very Tuesday", "unprepared"],
        orange: "irrelevant",
        suffix: ".",
      },
      {
        prefix: "It was, on closer look, ",
        blue: "your own face",
        purples: ["Cousin Trev", "the postman", "a bad sketch"],
        orange: "unrelated",
        suffix: ".",
      },
      {
        prefix: "I closed the file then ",
        blue: "opened it again",
        purples: ["screamed politely", "made tea", "called my mum"],
        orange: "did nothing",
        suffix: ".",
      },
      {
        prefix: "The note in the margin read ",
        blue: "THIS IS YOU",
        purples: ["LOVE, BUGBOT", "WAVE BACK", "GET OUT"],
        orange: "nothing",
        suffix: ".",
      },
      {
        prefix: "The ID badge in the photo ",
        blue: "matched mine",
        purples: ["said 'intern'", "was pixel soup", "was upside down"],
        orange: "was blank",
        suffix: ".",
      },
      {
        prefix: "The timestamp in the EXIF was ",
        blue: "tonight, before I took the case",
        purples: ["1999", "lunch o'clock", "bugbot o'clock"],
        orange: "missing",
        suffix: ".",
      },
      {
        prefix: "I zoomed: the background had ",
        blue: "this very desk",
        purples: ["a theme park", "a barn", "the moon"],
        orange: "a stock photo",
        suffix: ".",
      },
      {
        prefix: "I circled: ",
        blue: "PORTRAIT IS THE DETECTIVE",
        purples: ["HI MOM", "CUTE SUS", "RUDE PAPER"],
        orange: "boring",
        suffix: ".",
      },
    ],
  },
  "sticky-warning": {
    id: "sticky-warning",
    slots: [
      {
        prefix: "Inside the evidence envelope sat a ",
        blue: "warning",
        purples: ["recipe", "love note", "limerick"],
        orange: "blank slip",
        suffix: ".",
      },
      {
        prefix: "It read, in shaky pen, ",
        blue: "they're behind you",
        purples: ["bring snacks", "do not look up", "tag, you're it"],
        orange: "thank you",
        suffix: ".",
      },
      {
        prefix: "I checked over my shoulder, ",
        blue: "carefully",
        purples: ["dramatically", "with both eyes shut", "twice"],
        orange: "lazily",
        suffix: ".",
      },
      {
        prefix: "I underlined ",
        blue: "THREAT",
        purples: ["RUDE", "OMINOUS BUT POLITE", "WHO LEFT THIS"],
        orange: "all good",
        suffix: " and circled it.",
      },
      {
        prefix: "The sticky glue was ",
        blue: "still tacky",
        purples: ["maple syrup", "hope", "expired"],
        orange: "dry as dust",
        suffix: ".",
      },
      {
        prefix: "The handwriting matched ",
        blue: "the case file header",
        purples: ["Comic Sans", "a child's pen", "my left hand"],
        orange: "nobody's",
        suffix: ".",
      },
      {
        prefix: "I held it to the light: the paper was ",
        blue: "watermarked 'evidence'",
        purples: ["origami paper", "receipt paper", "napkin"],
        orange: "plain copy",
        suffix: ".",
      },
      {
        prefix: "I filed it under ",
        blue: "CREEPY BUT TRUE",
        purples: ["MAYBE JOKE", "HR WILL LOVE", "NOPE"],
        orange: "spam",
        suffix: ".",
      },
    ],
  },
  "pen-floating": {
    id: "pen-floating",
    slots: [
      {
        prefix: "The case file sheet was ",
        blue: "floating",
        purples: ["levitating dramatically", "doing yoga", "gloating"],
        orange: "lying flat",
        suffix: " above the desk.",
      },
      {
        prefix: "Nothing was holding it ",
        blue: "up",
        purples: ["anywhere", "morally", "to standards"],
        orange: "down",
        suffix: ".",
      },
      {
        prefix: "I waved my hand ",
        blue: "underneath",
        purples: ["over it threateningly", "in a circle", "to clap"],
        orange: "above it",
        suffix: " and felt nothing.",
      },
      {
        prefix: "I wrote ",
        blue: "GRAVITY: OFF",
        purples: ["MAGIC TRICK", "SPOOKY PAPER", "FILE IS HOVERING"],
        orange: "looks fine",
        suffix: " in the margin.",
      },
      {
        prefix: "The paper's edge cast a ",
        blue: "shadow on the desk that didn't line up",
        purples: ["heart", "emoji", "ghost"],
        orange: "normal shadow",
        suffix: ".",
      },
      {
        prefix: "I blew gently: the sheet ",
        blue: "didn't flutter",
        purples: ["applauded", "flew away", "yelled"],
        orange: "fell",
        suffix: " — wrong physics.",
      },
      {
        prefix: "The clip at the top was ",
        blue: "hovering in mid-air",
        purples: ["a banana clip", "stolen", "cosplaying"],
        orange: "on the paper",
        suffix: ".",
      },
      {
        prefix: "I tagged the anomaly: ",
        blue: "DESK ANTIGRAV",
        purples: ["SPOOKY", "CUTE LIFT", "NAH"],
        orange: "skip",
        suffix: ".",
      },
    ],
  },
  "steam-down": {
    id: "steam-down",
    slots: [
      {
        prefix: "Steam from the coffee was drifting ",
        blue: "downward",
        purples: ["to the floor like guilt", "with bad posture", "sideways"],
        orange: "upward",
        suffix: ".",
      },
      {
        prefix: "Coffee, normally, has steam that ",
        blue: "rises",
        purples: ["sings", "complains", "judges"],
        orange: "vanishes",
        suffix: ".",
      },
      {
        prefix: "I sniffed it ",
        blue: "carefully",
        purples: ["like a sommelier", "from across the room", "nervously"],
        orange: "casually",
        suffix: ".",
      },
      {
        prefix: "I wrote ",
        blue: "STEAM IS WRONG",
        purples: ["GHOST IN THE MUG", "BAD HEAT", "ANTI-STEAM"],
        orange: "smelled fine",
        suffix: " in capitals.",
      },
      {
        prefix: "The mug lip had condensate that ",
        blue: "clung upward",
        purples: ["sparkled", "hummed", "judged me"],
        orange: "dripped normally",
        suffix: " — wrong.",
      },
      {
        prefix: "I held a match near the plume: the draft ",
        blue: "pulled it toward the floor",
        purples: ["whistled", "applauded", "vanished"],
        orange: "lifted it up",
        suffix: " like usual.",
      },
      {
        prefix: "The beans smelled fine, but the thermodynamics was ",
        blue: "inverted",
        purples: ["gassy", "poetic", "canceled"],
        orange: "normal",
        suffix: ".",
      },
      {
        prefix: "I circled: ",
        blue: "HOT COLD BACKWARDS",
        purples: ["WEIRDO COFFEE", "NO TIPS", "OW"],
        orange: "ok",
        suffix: ".",
      },
    ],
  },
  "blank-book": {
    id: "blank-book",
    slots: [
      {
        prefix: "The case file printout was ",
        blue: "blank",
        purples: ["minimalist", "shy", "on strike"],
        orange: "full",
        suffix: ".",
      },
      {
        prefix: "Every line had been ",
        blue: "wiped",
        purples: ["embarrassed", "negotiated away", "stolen"],
        orange: "dotted",
        suffix: ".",
      },
      {
        prefix: "I held it up to the lamp ",
        blue: "looking for indents",
        purples: ["and squinted", "hopefully", "and hummed"],
        orange: "for warmth",
        suffix: ".",
      },
      {
        prefix: "I jotted ",
        blue: "EVIDENCE ERASED",
        purples: ["SHY PAGE", "PAPER WITH SECRETS", "LOUD QUIET"],
        orange: "page intact",
        suffix: ".",
      },
      {
        prefix: "I flipped the page: the other side was ",
        blue: "empty too, but the fold felt wrong",
        purples: ["a crossword", "a cat drawing", "a recipe"],
        orange: "blank but normal",
        suffix: ".",
      },
      {
        prefix: "I rubbed a pencil sideways: the paper was ",
        blue: "too smooth to hold a ghost letter",
        purples: ["sandpaper", "fuzzy", "damp"],
        orange: "rough with indent",
        suffix: ".",
      },
      {
        prefix: "I scanned it: the PDF export came back ",
        blue: "one blank page, zero text layer",
        purples: ["with memes", "in wingdings", "in emoji"],
        orange: "with full text",
        suffix: ".",
      },
      {
        prefix: "I filed: ",
        blue: "TEXT WAS TAKEN",
        purples: ["SPOOKY", "CUTE BLANK", "FINE I GUESS"],
        orange: "boring",
        suffix: ".",
      },
    ],
  },
  "keyboard-extra-key": {
    id: "keyboard-extra-key",
    slots: [
      {
        prefix: "On the keyboard sat a ",
        blue: "giant red key",
        purples: ["dramatic button", "plot device", "bad idea"],
        orange: "regular key",
        suffix: " that did not belong.",
      },
      {
        prefix: "It was, structurally, ",
        blue: "extra",
        purples: ["showy", "asking for trouble", "haunted"],
        orange: "stock",
        suffix: ".",
      },
      {
        prefix: "I leaned in and ",
        blue: "did not press it",
        purples: ["pressed it twice", "took a photo", "asked it questions"],
        orange: "rearranged WASD",
        suffix: ".",
      },
      {
        prefix: "I wrote ",
        blue: "ONE KEY TOO MANY",
        purples: ["RED MEANS BAD", "BIG OOF", "LAUNCH CODE?"],
        orange: "nothing weird",
        suffix: ".",
      },
      {
        prefix: "The keycap font didn't match: it read ",
        blue: "RUN",
        purples: ["EJECT", "BEANS", "HELLO"],
        orange: "Enter",
        suffix: " — rude.",
      },
      {
        prefix: "I lifted the board: the switch stem under it was ",
        blue: "not soldered, just... sitting there",
        purples: ["a spring", "a pebble", "a jelly bean"],
        orange: "properly mounted",
        suffix: ".",
      },
      {
        prefix: "The travel felt ",
        blue: "too deep for this chassis",
        purples: ["mushy", "clicky", "judgmental"],
        orange: "like the others",
        suffix: ".",
      },
      {
        prefix: "I tagged the board: ",
        blue: "EXTRA IO PORT",
        purples: ["DO NOT PRESS", "CUTE", "RUDE USB"],
        orange: "skip",
        suffix: ".",
      },
    ],
  },
};

/** Pick a deterministic concrete template (one purple per slot) for the day. */
export function pickTemplate(
  seed: number,
  anomalyId: AnomalyId,
): SentenceTemplate {
  const bank = TEMPLATE_BANKS[anomalyId];
  if (!bank) throw new Error(`no template bank for ${anomalyId}`);
  const rng = makeSeededRng(seed);
  const slots: SentenceSlot[] = bank.slots.map((s, slotIndex) => {
    const idx = Math.floor(rng() * s.purples.length);
    return {
      prefix: s.prefix,
      options: {
        blue: s.blue,
        purple: s.purples[idx % s.purples.length] as string,
        orange: s.orange,
      },
      rowOrder: shuffleRowOrder(seed, slotIndex),
      suffix: s.suffix,
    };
  });
  return { id: bank.id, slots };
}

export const TEMPLATE_IDS = Object.keys(TEMPLATE_BANKS) as readonly AnomalyId[];
