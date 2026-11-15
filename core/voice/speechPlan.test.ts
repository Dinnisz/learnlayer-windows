// VoiceTutorTests.swift, the speech cases: which engine speaks, the locale and voice chosen, the request's body, the
// price per character, and which system voice stands in.

import { describe, expect, it } from "vitest";
import { AISettings } from "../ai/modelRouting";
import {
  OpenRouterSpeechRequest,
  SpeechLocaleMatch,
  SpeechPlaybackPlan,
  SpeechPrice,
  SpeechVoicePlan,
  SystemVoicePlan,
  VoiceLocale,
} from "./speechPlan";

const elevenOf = (body: Record<string, unknown>) =>
  ((body["provider"] as Record<string, unknown> | undefined)?.["options"] as Record<string, unknown> | undefined)?.[
    "elevenlabs"
  ] as Record<string, unknown> | undefined;

describe("speech", () => {
  it("speaks with the paid voice only with a key and an attempt that worked", () => {
    expect(SpeechPlaybackPlan.engine(false, false)).toBe("system");
    expect(SpeechPlaybackPlan.engine(true, false)).toBe("openRouter");
    expect(SpeechPlaybackPlan.engine(true, true)).toBe("system");
    expect(SpeechPlaybackPlan.engine(false, true)).toBe("system");
    // Without the student's opt-in nothing is billed.
    expect(SpeechPlaybackPlan.engine(true, false, false)).toBe("system");
  });

  it("follows the language when the country is missing", () => {
    const supported = ["en-US", "pt-PT", "pt-BR", "ja-JP", "zh-Hans-CN", "zh-Hant-TW"];
    expect(SpeechLocaleMatch.ranked(["ja-JP"], supported)).toEqual(["ja-JP"]);
    expect(SpeechLocaleMatch.ranked(["pt_PT"], supported)).toEqual(["pt-PT", "pt-BR"]);
    expect(SpeechLocaleMatch.ranked(["pt-AO"], supported)).toEqual(["pt-PT", "pt-BR"]);
    expect(SpeechLocaleMatch.ranked(["zh-Hans"], supported)).toEqual(["zh-Hans-CN", "zh-Hant-TW"]);
    expect(SpeechLocaleMatch.ranked(["fr-FR", "en-GB"], supported)).toEqual(["en-US"]);
    expect(SpeechLocaleMatch.ranked(["mi-NZ"], supported)).toEqual([]);
    expect(SpeechLocaleMatch.systemPreferred(["pt-PT", "en-US"], "pt_PT")).toEqual(["pt-PT", "en-US"]);
  });

  it("estimates characters at OpenRouter's speech rate", () => {
    expect(SpeechPrice.estimateDollars("")).toBe(0);
    expect(SpeechPrice.characters("a b")).toBe(3);
    expect(SpeechPrice.characters("e" + String.fromCharCode(0x301))).toBe(2);
    const thousand = "a".repeat(1_000);
    expect(SpeechPrice.estimateDollars(thousand)).toBeCloseTo(0.02, 12);
    expect(SpeechPrice.estimateDollars(thousand, SpeechPrice.flashModel)).toBeCloseTo(0.02, 12);
    expect(SpeechPrice.estimateDollars(thousand, "elevenlabs/eleven-v4")).toBeCloseTo(0.04, 12);
    const over = "b".repeat(10_050);
    expect(SpeechPrice.characters(over)).toBe(10_000);
    expect(SpeechPrice.estimateDollars(over)).toBeCloseTo(0.2, 12);
    expect(SpeechPrice.maxCharacters(SpeechPrice.flashModel)).toBe(40_000);
    expect(SpeechPrice.characters(over, SpeechPrice.flashModel)).toBe(10_050);
    expect(SpeechPrice.maxCharacters("elevenlabs/eleven-v3")).toBe(5_000);
    expect(SpeechPrice.characters(over, "elevenlabs/eleven-v3")).toBe(5_000);
    const catalog = SpeechPrice.rates(
      JSON.stringify({
        data: [
          { id: "elevenlabs/eleven-v4", pricing: { prompt: "0.00001" } },
          { id: "elevenlabs/eleven-flash-v2.5", pricing: { character: "25" } },
          { id: "per-second", pricing: { completion: "0.01" } },
        ],
      }),
    );
    expect(catalog.get("per-second")).toBeUndefined();
    expect(SpeechPrice.estimateDollars(thousand, "elevenlabs/eleven-v4", catalog)).toBeCloseTo(0.01, 12);
    expect(catalog.get(SpeechPrice.flashModel)).toBeCloseTo(25 / 1_000_000, 15);
    expect(SpeechPrice.rates("nope").size).toBe(0);
  });

  it("builds the body OpenRouter takes, language code only where accepted", () => {
    const body = OpenRouterSpeechRequest.json({
      model: SpeechPrice.defaultModel,
      input: "Olá",
      voice: AISettings.defaultSpeechVoiceID,
      responseFormat: "mp3",
      languageCode: "pt-PT",
      voiceSettings: null,
    });
    expect(body).toEqual({ model: "elevenlabs/eleven-v4-turbo", input: "Olá", voice: "river", response_format: "mp3" });
    expect(OpenRouterSpeechRequest.languageCode("pt-PT", SpeechPrice.defaultModel)).toBeNull();
    expect(OpenRouterSpeechRequest.languageCode("pt-PT", SpeechPrice.flashModel)).toBe("pt");
    expect(OpenRouterSpeechRequest.languageCode(" en-GB ", SpeechPrice.flashModel)).toBe("en");
    const withSettings = OpenRouterSpeechRequest.json({
      model: SpeechPrice.defaultModel,
      input: "Hello",
      voice: "river",
      responseFormat: "pcm",
      languageCode: " en-GB ",
      voiceSettings: { stability: 0.5, similarityBoost: 0.8, style: null, useSpeakerBoost: true, speed: 1.1 },
    });
    const tuned = elevenOf(withSettings)!;
    expect(withSettings["response_format"]).toBe("pcm");
    expect(tuned["language_code"]).toBeUndefined();
    expect(tuned["voice_settings"]).toEqual({ stability: 0.5, similarity_boost: 0.8, use_speaker_boost: true });
    const regional = OpenRouterSpeechRequest.json({
      model: SpeechPrice.flashModel,
      input: "Olá",
      voice: "river",
      responseFormat: "mp3",
      languageCode: "pt-PT",
      voiceSettings: null,
    });
    expect(elevenOf(regional)!["language_code"]).toBe("pt");
    expect(OpenRouterSpeechRequest.errorText('{"error":{"code":400,"message":"language_code is not supported"}}')).toBe(
      "language_code is not supported",
    );
    const slower = OpenRouterSpeechRequest.json({
      model: "elevenlabs/eleven-flash-v2.5",
      input: "Hello",
      voice: "voice",
      responseFormat: "mp3",
      languageCode: null,
      voiceSettings: { speed: 0.9 },
    });
    expect((elevenOf(slower)!["voice_settings"] as Record<string, unknown>)["speed"]).toBe(0.9);
  });

  it("reads raw audio, or the timestamps JSON with its character times", () => {
    const bytes = (values: number[]) => new Uint8Array(values);
    expect(OpenRouterSpeechRequest.payload(bytes([0xff, 0xfb]), 200, "")?.audio).toEqual(bytes([0xff, 0xfb]));
    expect(OpenRouterSpeechRequest.payload(new TextEncoder().encode("{"), 200, "")).toBeNull();
    expect(OpenRouterSpeechRequest.payload(bytes([1, 2]), 401, "")).toBeNull();
    expect(OpenRouterSpeechRequest.payload(bytes([]), 200, "")).toBeNull();
    const timed = JSON.stringify({
      audio_base64: btoa("mp3"),
      normalized_alignment: {
        characters: ["a"],
        character_start_times_seconds: [1.5],
        character_end_times_seconds: [1.8],
      },
    });
    const payload = OpenRouterSpeechRequest.payload(new TextEncoder().encode(timed), 200, "a")!;
    expect(new TextDecoder().decode(payload.audio)).toBe("mp3");
    expect(payload.alignment?.endTimes).toEqual([1.8]);
  });

  it("chooses the regional variety, the voice and the system voice", () => {
    expect(VoiceLocale.identifier("pt", ["pt-PT", "en-GB"])).toBe("pt-PT");
    expect(VoiceLocale.identifier("pt", ["pt-BR"])).toBe("pt-BR");
    expect(VoiceLocale.identifier("en", ["en-GB", "pt-PT"])).toBe("en-GB");
    expect(VoiceLocale.identifier("es", ["es-MX", "en-US"])).toBe("es-MX");
    expect(VoiceLocale.identifier(null, ["pt-PT"])).toBe("pt-PT");
    expect(VoiceLocale.identifier("en", ["pt-PT"])).toBe("en");
    expect(VoiceLocale.promptLanguage("pt-PT")).toContain("pt-PT");
    expect(VoiceLocale.speechCode("pt", ["pt-PT"], ["pt-BR", "pt-PT", "en-US"])).toBe("pt-PT");
    expect(VoiceLocale.speechCode("en", ["en-GB"], ["en-US", "en-GB"])).toBe("en-GB");
    expect(VoiceLocale.speechCode("es", ["es-ES"], ["es-MX", "es-ES"])).toBe("es-ES");

    const portugal = SpeechVoicePlan.selection("pt-PT", "river", SpeechPrice.defaultModel);
    expect(portugal).toEqual({
      model: SpeechPrice.flashModel,
      voice: SpeechVoicePlan.europeanPortugueseVoice,
      languageCode: "pt",
    });
    const brazil = SpeechVoicePlan.selection("pt-BR", "", SpeechPrice.defaultModel);
    expect(brazil.voice).toBe(SpeechVoicePlan.brazilianPortugueseVoice);
    expect(brazil.languageCode).toBe("pt");
    const english = SpeechVoicePlan.selection("en-US", "river", SpeechPrice.defaultModel);
    expect(english).toEqual({
      model: SpeechPrice.defaultModel,
      voice: AISettings.defaultSpeechVoiceID,
      languageCode: null,
    });
    const chosen = SpeechVoicePlan.selection("pt-PT", "custom-voice", SpeechPrice.defaultModel);
    expect(chosen.voice).toBe("custom-voice");
    expect(chosen.model).toBe(SpeechPrice.defaultModel);

    const voices = [
      { name: "Luciana", language: "pt-BR", identifier: "pt-BR.Luciana" },
      { name: "Joana", language: "pt-PT", identifier: "pt-PT.Joana" },
      { name: "Samantha", language: "en-US", identifier: "en-US.Samantha" },
    ];
    expect(SystemVoicePlan.pick("pt-PT", voices)?.name).toBe("Joana");
    expect(SystemVoicePlan.pick("pt-BR", voices)?.name).toBe("Luciana");
    // Windows: "Microsoft Helia" is the Portugal voice; a Brazilian one never speaks pt-PT.
    const windows = [
      { name: "Microsoft Maria", language: "pt-BR", identifier: "maria" },
      { name: "Microsoft Helia", language: "pt-PT", identifier: "helia" },
    ];
    expect(SystemVoicePlan.pick("pt-PT", windows)?.name).toBe("Microsoft Helia");
    expect(SystemVoicePlan.pick("pt-PT", [windows[0]!])).toBeNull();
  });
});
