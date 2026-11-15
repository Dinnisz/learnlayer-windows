// Port of LearnLayer/Voice/SpeechPlaybackPlan.swift and the request half of LearnLayer/Voice/OpenRouterSpeech.swift
// (with SpeechSync.decodeTimestamps) @ ref 2026-11-04: which engine speaks, which ElevenLabs voice for which locale,
// the speech request's body, what it costs, and which system voice stands in.

import { AISettings } from "../ai/modelRouting";

export type SpeechEngine = "openRouter" | "system";

export const SpeechPlaybackPlan = {
  /** `premiumVoice` is the student's opt-in. Without it the computer speaks, whatever key is saved, and nothing is
   * billed. */
  engine(hasAPIKey: boolean, attemptFailed: boolean, premiumVoice = true): SpeechEngine {
    if (attemptFailed || !hasAPIKey || !premiumVoice) return "system";
    return "openRouter";
  },
};

export interface LocaleParts {
  language: string;
  script: string | null;
  region: string | null;
  canonical: string;
}

/** The speech locale for the student's languages: exact identifier first, then the same language elsewhere. */
export const SpeechLocaleMatch = {
  parts(identifier: string): LocaleParts {
    const pieces = identifier
      .replaceAll("_", "-")
      .split("-")
      .filter((piece) => piece !== "");
    const language = (pieces[0] ?? "").toLowerCase();
    let script: string | null = null;
    let region: string | null = null;
    if (pieces.length >= 2) {
      const second = pieces[1]!;
      if (second.length === 4) {
        script = second.toLowerCase();
        if (pieces.length >= 3 && pieces[2]!.length === 2) region = pieces[2]!.toUpperCase();
      } else if (second.length === 2) {
        region = second.toUpperCase();
      }
    }
    let canonical = language;
    if (script) canonical += "-" + script;
    if (region) canonical += "-" + region;
    return { language, script, region, canonical };
  },

  /** Supported identifiers, best first, for the first preferred language that has any match. */
  ranked(preferred: readonly string[], supported: readonly string[]): string[] {
    const available = supported.map((original) => ({ original, parts: SpeechLocaleMatch.parts(original) }));
    for (const preference of preferred) {
      const want = SpeechLocaleMatch.parts(preference);
      if (want.language === "") continue;
      const sameLanguage = available.filter((item) => item.parts.language === want.language);
      if (sameLanguage.length === 0) continue;
      const ordered: string[] = [];
      const add = (identifier: string) => {
        if (!ordered.includes(identifier)) ordered.push(identifier);
      };
      for (const item of sameLanguage) if (item.parts.canonical === want.canonical) add(item.original);
      if (want.script && want.region) {
        for (const item of sameLanguage) {
          if (item.parts.script === want.script && item.parts.region === want.region) add(item.original);
        }
      }
      if (want.script) for (const item of sameLanguage) if (item.parts.script === want.script) add(item.original);
      if (want.region) for (const item of sameLanguage) if (item.parts.region === want.region) add(item.original);
      for (const item of sameLanguage) add(item.original);
      return ordered;
    }
    return [];
  },

  /** The system's languages, then the current locale, without duplicates. */
  systemPreferred(languages: readonly string[], currentIdentifier: string): string[] {
    const seen = new Set<string>();
    return [...languages, currentIdentifier].filter((identifier) => {
      const key = SpeechLocaleMatch.parts(identifier).canonical;
      if (key === "" || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
};

const displayNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" });
  } catch {
    return null;
  }
})();

/** The student's regional variety: pt-PT rather than pt-BR, en-GB rather than en-US. */
export const VoiceLocale = {
  identifier(detectedLanguage: string | null, preferred: readonly string[]): string {
    const detected = detectedLanguage ? SpeechLocaleMatch.parts(detectedLanguage).language : "";
    const ranked = preferred.map((item) => SpeechLocaleMatch.parts(item)).filter((parts) => parts.language !== "");
    if (detected !== "") {
      const match = ranked.find((parts) => parts.language === detected);
      return match ? tag(match) : detected;
    }
    return ranked[0] ? tag(ranked[0]) : "en";
  },

  /** The name and the identifier, so the model cannot drop the country: "European Portuguese [pt-PT]". */
  promptLanguage(identifier: string): string {
    const shown = tag(SpeechLocaleMatch.parts(identifier));
    let name = shown;
    try {
      name = displayNames?.of(shown) ?? shown;
    } catch {
      name = shown;
    }
    return `${name} [${shown}]`;
  },

  /** An installed voice whose language and region match the preferred ones. */
  speechCode(
    detectedLanguage: string | null,
    preferred: readonly string[],
    available: readonly string[],
  ): string | null {
    const want = VoiceLocale.identifier(detectedLanguage, preferred);
    return SpeechLocaleMatch.ranked([want], available)[0] ?? null;
  },
};

function tag(parts: LocaleParts): string {
  if (parts.region !== null || parts.script !== null) return parts.canonical;
  return parts.language === "" ? "en" : parts.language;
}

/** Dollars per character for ElevenLabs voices on OpenRouter (the audio response carries no price). */
export const SpeechPrice = {
  /** Low latency. Half the full character rate. */
  defaultModel: "elevenlabs/eleven-v4-turbo",
  /** Cheaper and still half rate. */
  flashModel: "elevenlabs/eleven-flash-v2.5",
  fullDollarsPerCharacter: 40 / 1_000_000,
  halfDollarsPerCharacter: 20 / 1_000_000,
  loadedRates: new Map<string, number>(),

  isSpeechModel: (model: string) => model.toLowerCase().startsWith("elevenlabs/"),

  modelID(stored: string): string {
    const trimmed = stored.trim();
    return trimmed === "" ? SpeechPrice.defaultModel : trimmed;
  },

  /** What that model will accept. A longer string is cut before it is sent. */
  maxCharacters(model: string): number {
    const id = model.toLowerCase();
    if (id.includes("flash-v2.5") || id.includes("turbo-v2.5")) return 40_000;
    if (id.includes("flash-v2") || id.includes("turbo-v2")) return 30_000;
    if (id.includes("v3")) return 5_000;
    return 10_000;
  },

  /** The text actually sent: Unicode scalars, cut to what the model accepts. */
  billedText(text: string, model: string = SpeechPrice.defaultModel): string {
    return Array.from(text).slice(0, SpeechPrice.maxCharacters(model)).join("");
  },

  characters(text: string, model: string = SpeechPrice.defaultModel): number {
    return Array.from(SpeechPrice.billedText(text, model)).length;
  },

  estimateDollars(
    text: string,
    model: string = SpeechPrice.defaultModel,
    catalog?: ReadonlyMap<string, number>,
  ): number {
    const id = SpeechPrice.modelID(model);
    const rate = catalog?.get(id) ?? SpeechPrice.loadedRates.get(id) ?? SpeechPrice.dollarsPerCharacter(id);
    return SpeechPrice.characters(text, id) * rate;
  },

  /** Rates from OpenRouter's models list: `pricing.prompt` or `pricing.character`, per character, or per million
   * when the number is at least 1. Per-second models are skipped. */
  rates(modelsJSON: string): Map<string, number> {
    const rates = new Map<string, number>();
    let object: unknown;
    try {
      object = JSON.parse(modelsJSON);
    } catch {
      return rates;
    }
    const rows = (object as { data?: unknown } | null)?.data;
    if (!Array.isArray(rows)) return rates;
    for (const row of rows as Record<string, unknown>[]) {
      const id = row["id"];
      const pricing = row["pricing"] as Record<string, unknown> | undefined;
      if (typeof id !== "string" || id === "" || !pricing) continue;
      const raw = pricing["character"] ?? pricing["prompt"];
      const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
      if (!(value > 0) || !Number.isFinite(value)) continue;
      rates.set(id, value >= 1 ? value / 1_000_000 : value);
    }
    return rates;
  },

  store(catalog: ReadonlyMap<string, number>): void {
    if (catalog.size === 0) return;
    SpeechPrice.loadedRates = new Map(catalog);
  },

  dollarsPerCharacter(model: string): number {
    const id = model.toLowerCase();
    const half = [
      "eleven-v4-turbo",
      "eleven-flash-v2.5",
      "eleven-flash-v2",
      "eleven-turbo-v2.5",
      "eleven-turbo-v2",
      "eleven-v3-conversational",
    ].some((name) => id.includes(name));
    return half ? SpeechPrice.halfDollarsPerCharacter : SpeechPrice.fullDollarsPerCharacter;
  },
};

export interface VoiceSettings {
  stability?: number | null;
  similarityBoost?: number | null;
  style?: number | null;
  useSpeakerBoost?: boolean | null;
  speed?: number | null;
}

export interface SpeechAlignment {
  /** Seconds, one per UTF-16 unit of the spoken text. */
  startTimes: number[];
  endTimes: number[];
}

/** The speech body, built without a request so tests can read it. */
export const OpenRouterSpeechRequest = {
  /** Only Flash v2.5 and Turbo v2.5 accept `language_code` (v4 returns 400); the ISO 639-1 language. */
  languageCode(locale: string | null, model: string): string | null {
    const id = model.toLowerCase();
    if (!id.includes("flash-v2.5") && !id.includes("turbo-v2.5")) return null;
    const language = SpeechLocaleMatch.parts((locale ?? "").trim()).language;
    return language.length === 2 ? language : null;
  },

  errorText(body: string): string {
    try {
      const object = JSON.parse(body) as Record<string, unknown>;
      const error = object["error"] as Record<string, unknown> | undefined;
      if (typeof error?.["message"] === "string" && error["message"] !== "") return error["message"].slice(0, 500);
      if (typeof object["message"] === "string" && object["message"] !== "") return object["message"].slice(0, 500);
    } catch {
      // Not JSON: the text itself.
    }
    return body.trim().slice(0, 500);
  },

  json(options: {
    model: string;
    input: string;
    voice: string;
    responseFormat: string;
    languageCode: string | null;
    voiceSettings: VoiceSettings | null;
  }): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model,
      input: options.input,
      voice: options.voice,
      response_format: options.responseFormat,
    };
    const eleven: Record<string, unknown> = {};
    const language = OpenRouterSpeechRequest.languageCode(options.languageCode, options.model);
    if (language) eleven["language_code"] = language;
    const settings = voiceSettingsJSON(options.voiceSettings, options.model);
    if (settings) eleven["voice_settings"] = settings;
    if (Object.keys(eleven).length > 0) body["provider"] = { options: { elevenlabs: eleven } };
    return body;
  },

  /** Raw MP3, or `audio_base64` plus alignment when the body is the timestamps JSON; null for an error. */
  payload(
    body: Uint8Array,
    status: number,
    spoken: string,
  ): { audio: Uint8Array; alignment: SpeechAlignment | null } | null {
    if (status < 200 || status >= 300 || body.length === 0) return null;
    if (body[0] === 0x7b) return decodeTimestamps(new TextDecoder().decode(body), spoken);
    return { audio: body, alignment: null };
  },
};

function voiceSettingsJSON(settings: VoiceSettings | null, model: string): Record<string, unknown> | null {
  if (!settings) return null;
  const payload: Record<string, unknown> = {};
  if (settings.stability != null) payload["stability"] = settings.stability;
  if (settings.similarityBoost != null) payload["similarity_boost"] = settings.similarityBoost;
  if (settings.style != null) payload["style"] = settings.style;
  if (settings.useSpeakerBoost != null) payload["use_speaker_boost"] = settings.useSpeakerBoost;
  const rejectsSpeed = model.toLowerCase().includes("eleven-v4");
  if (settings.speed != null && !rejectsSpeed) payload["speed"] = settings.speed;
  return Object.keys(payload).length === 0 ? null : payload;
}

/** Character times, one per UTF-16 unit of what was spoken; null when they don't line up with it. */
export function alignment(
  characters: readonly string[],
  starts: readonly number[],
  ends: readonly number[],
  spoken: string,
): SpeechAlignment | null {
  if (characters.length !== starts.length || characters.length !== ends.length || characters.length === 0) return null;
  const startTimes: number[] = [];
  const endTimes: number[] = [];
  for (let index = 0; index < characters.length; index += 1) {
    if (!Number.isFinite(starts[index]) || !Number.isFinite(ends[index])) return null;
    const units = Math.max(1, characters[index]!.length);
    for (let unit = 0; unit < units; unit += 1) {
      startTimes.push(starts[index]!);
      endTimes.push(ends[index]!);
    }
  }
  return startTimes.length === spoken.length ? { startTimes, endTimes } : null;
}

function decodeTimestamps(
  text: string,
  spoken: string,
): { audio: Uint8Array; alignment: SpeechAlignment | null } | null {
  let object: Record<string, unknown>;
  try {
    object = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  const encoded = object["audio_base64"];
  if (typeof encoded !== "string") return null;
  let audio: Uint8Array;
  try {
    audio = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
  if (audio.length === 0) return null;
  const read = (value: unknown): SpeechAlignment | null => {
    const piece = value as Record<string, unknown> | null;
    const characters = piece?.["characters"];
    const starts = piece?.["character_start_times_seconds"];
    const ends = piece?.["character_end_times_seconds"];
    if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) return null;
    if (!characters.every((item) => typeof item === "string")) return null;
    if (![...starts, ...ends].every((item) => typeof item === "number")) return null;
    return alignment(characters as string[], starts as number[], ends as number[], spoken);
  };
  return { audio, alignment: read(object["alignment"]) ?? read(object["normalized_alignment"]) };
}

export interface SpeechSelection {
  model: string;
  voice: string;
  /** Sent only when the model accepts it. */
  languageCode: string | null;
}

/** Which ElevenLabs voice for this locale: Portugal and Brazil get different library voices; any other locale keeps
 * the configured one ("river" by default). A voice the student typed in Settings is kept for every locale. */
export const SpeechVoicePlan = {
  /** ElevenLabs library voice "Joana": European Portuguese, warm and steady. */
  europeanPortugueseVoice: "nJ5NFqyKb8kn9JBPmo6i",
  /** ElevenLabs library voice "Amanda Kelly": Brazilian Portuguese. */
  brazilianPortugueseVoice: "oi8rgjIfLgJRsQ6rbZh3",

  selection(locale: string, storedVoice: string, model: string): SpeechSelection {
    const stored = storedVoice.trim();
    const id = SpeechPrice.modelID(model);
    const custom = stored !== "" && stored !== AISettings.defaultSpeechVoiceID;
    const parts = SpeechLocaleMatch.parts(locale);
    // A bare "pt" is European: the app's Portuguese is pt-PT.
    if (!custom && parts.language === "pt" && (parts.region === "PT" || parts.region === null)) {
      return { model: SpeechPrice.flashModel, voice: SpeechVoicePlan.europeanPortugueseVoice, languageCode: "pt" };
    }
    if (!custom && parts.language === "pt" && parts.region === "BR") {
      return { model: SpeechPrice.flashModel, voice: SpeechVoicePlan.brazilianPortugueseVoice, languageCode: "pt" };
    }
    return {
      model: id,
      voice: stored === "" ? AISettings.defaultSpeechVoiceID : stored,
      languageCode: OpenRouterSpeechRequest.languageCode(locale, id),
    };
  },
};

/** An installed system voice. */
export interface SystemVoiceChoice {
  name: string;
  language: string;
  identifier: string;
}

/** The system voice that stands in: pt-PT is "Joana" when installed, else any Portugal voice; pt-BR never a Portugal
 * voice. On Windows the Portuguese voice is "Helia" (pt-PT); no voice of another region is taken for pt-PT. */
export const SystemVoicePlan = {
  pick(locale: string, available: readonly SystemVoiceChoice[]): SystemVoiceChoice | null {
    const want = SpeechLocaleMatch.parts(locale);
    if (want.language === "") return null;
    const sameLanguage = available.filter(
      (voice) => SpeechLocaleMatch.parts(voice.language).language === want.language,
    );
    const regional = sameLanguage.filter((voice) => SpeechLocaleMatch.parts(voice.language).region === want.region);
    const pool = regional.length > 0 ? regional : sameLanguage;
    const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (want.language === "pt" && want.region === "PT") {
      const joana = pool.find((voice) => fold(voice.name) === "joana");
      if (joana) return joana;
      return pool.find((voice) => SpeechLocaleMatch.parts(voice.language).region === "PT") ?? null;
    }
    if (want.language === "pt" && want.region === "BR") {
      return pool.find((voice) => SpeechLocaleMatch.parts(voice.language).region === "BR") ?? null;
    }
    return pool[0] ?? null;
  },
};
