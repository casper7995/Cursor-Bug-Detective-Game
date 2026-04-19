/** One sentence template per anomaly id. Used by the Sentence minigame. */

import { makeSeededRng } from "../../api/seedClient";
import type { AnomalyId } from "../../scene/anomalies";
import type { SentenceSlot, SentenceTemplate } from "./types";

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
    ],
  },
  "lamp-shadow-wrong": {
    id: "lamp-shadow-wrong",
    slots: [
      {
        prefix: "The lamp threw a ",
        blue: "shadow",
        purples: ["mood", "smell", "tantrum"],
        orange: "light",
        suffix: " across the desk.",
      },
      {
        prefix: "The shadow pointed ",
        blue: "the wrong way",
        purples: ["at my mug", "directly at me", "northward, suspiciously"],
        orange: "as expected",
        suffix: ".",
      },
      {
        prefix: "Light, last I checked, makes shadows ",
        blue: "fall away from it",
        purples: ["mind their business", "behave", "pay rent"],
        orange: "huddle near it",
        suffix: ".",
      },
      {
        prefix: "I scribbled ",
        blue: "PHYSICS BROKEN",
        purples: ["LAMP IS LYING", "SHADOW NEEDS NOTES", "REAL CRIME"],
        orange: "nothing weird",
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
    ],
  },
  "plant-glitching": {
    id: "plant-glitching",
    slots: [
      {
        prefix: "The plant in the corner was ",
        blue: "glitching",
        purples: ["doing the worm", "buffering", "vibrating with rage"],
        orange: "thriving",
        suffix: ".",
      },
      {
        prefix: "Its leaves snapped like ",
        blue: "bad geometry",
        purples: ["a tiny rave", "tiny applause", "sad clapping"],
        orange: "cardboard",
        suffix: ".",
      },
      {
        prefix: "I poked the pot ",
        blue: "and it lagged",
        purples: ["and it sneezed", "and it argued", "with a pen"],
        orange: "and watered it",
        suffix: ".",
      },
      {
        prefix: "I wrote ",
        blue: "RENDERING WRONG",
        purples: ["PLANT NEEDS PATCH", "HAUNTED FERN", "LEAFY CRIME"],
        orange: "fine plant",
        suffix: ".",
      },
    ],
  },
};

/** Pick a deterministic concrete template (one purple per slot) for the day. */
export function pickTemplate(seed: number, anomalyId: AnomalyId): SentenceTemplate {
  const bank = TEMPLATE_BANKS[anomalyId];
  if (!bank) throw new Error(`no template bank for ${anomalyId}`);
  const rng = makeSeededRng(seed);
  const slots: SentenceSlot[] = bank.slots.map((s) => {
    const idx = Math.floor(rng() * s.purples.length);
    return {
      prefix: s.prefix,
      options: {
        blue: s.blue,
        purple: s.purples[idx % s.purples.length] as string,
        orange: s.orange,
      },
      suffix: s.suffix,
    };
  });
  return { id: bank.id, slots };
}

export const TEMPLATE_IDS = Object.keys(TEMPLATE_BANKS) as readonly AnomalyId[];
