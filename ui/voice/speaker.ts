// Port of the playing half of LearnLayer/Voice/TutorSpeaker.swift and VoiceTutorSession.narrate @ ref 2026-11-04.
//
// In Portuguese (Portugal), with the premium voice on (the default) and the student signed in, the tutor speaks with
// ElevenLabs' "Joana" through the LearnLayer API, sentence by sentence, each clip bought once (kept for the launch).
// Otherwise — premium voice off, English, no session, or the paid voice failing — Windows speaks: the Web Speech API
// of WebView2 with the system's voices, pt-PT only from a Portugal voice ("Microsoft Helia"), never a Brazilian one.
// Nothing is billed without the premium voice (CLAUDE.md §3.4).

import { TutorLanguage } from "@core/problems/solutionRequest";
import { NarrationSentences, SpokenText } from "@core/voice/spokenText";
import {
  OpenRouterSpeechRequest,
  SpeechPlaybackPlan,
  SpeechPrice,
  SpeechVoicePlan,
  SystemVoicePlan,
  type SpeechEngine,
} from "@core/voice/speechPlan";
import { hasCredentials, requestSpeech, usesMock } from "../ai/solver";

export const premiumVoiceKey = "premiumVoiceEnabled";

const readPreference = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** On unless the student turns it off (Settings › General), as on the Mac. */
export const premiumVoiceEnabled = () => readPreference(premiumVoiceKey) !== "0";

/** The tutor's language now (Settings › Language, else the system's). */
export const tutorLanguage = () => TutorLanguage.resolve(readPreference(TutorLanguage.settingKey), navigator.languages);

export interface SpeakOptions {
  /** How far the speech is, in UTF-16 units of the spoken text (for marks lit on their words). */
  onProgress?(throughUTF16: number, length: number): void;
  /** The voice's loudness now, 0…1, for the pill's waveform and the mascot. */
  onLevel?(level: number): void;
  signal?: AbortSignal;
}

export interface SpeakResult {
  engine: SpeechEngine;
  /** Said once when the paid voice was wanted and Windows had to speak instead. */
  notice: string | null;
  /** Nothing could say it (no voice for the language here): the caller paces the words itself. */
  silent?: boolean;
  /** The text as it was spoken, cleaned. */
  spoken: string;
}

/** Each premium clip bought once per launch: a sentence said again plays from here. */
const clips = new Map<string, Promise<Uint8Array | null>>();

function clip(sentence: string, signal?: AbortSignal): Promise<Uint8Array | null> {
  const selection = SpeechVoicePlan.selection("pt-PT", "", SpeechPrice.flashModel);
  const key = `${selection.model}|${selection.voice}|${sentence}`;
  let pending = clips.get(key);
  if (!pending) {
    const body = OpenRouterSpeechRequest.json({
      model: selection.model,
      input: SpeechPrice.billedText(sentence, selection.model),
      voice: selection.voice,
      responseFormat: "mp3",
      languageCode: selection.languageCode,
      voiceSettings: null,
    });
    pending = requestSpeech(body, signal)
      .then(({ status, bytes }) => OpenRouterSpeechRequest.payload(bytes, status, sentence)?.audio ?? null)
      .catch(() => null);
    clips.set(key, pending);
    // A failed clip is not kept: the next turn may get it.
    void pending.then((audio) => audio === null && clips.delete(key));
  }
  return pending;
}

let audioContext: AudioContext | null = null;

/** Plays MP3 (or any audio the page can decode), reporting its share played and its loudness. */
async function playAudio(
  bytes: Uint8Array,
  onFraction: (fraction: number) => void,
  onLevel: ((level: number) => void) | undefined,
  signal?: AbortSignal,
): Promise<boolean> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "audio/mpeg" }));
  const audio = new Audio(url);
  let analyser: AnalyserNode | null = null;
  try {
    audioContext ??= new AudioContext();
    const source = audioContext.createMediaElementSource(audio);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    if (audioContext.state === "suspended") await audioContext.resume();
  } catch {
    analyser = null;
  }
  const samples = new Uint8Array(analyser?.fftSize ?? 0);
  let frame = 0;
  const meter = () => {
    if (analyser && onLevel) {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
    }
    if (audio.duration > 0) onFraction(audio.currentTime / audio.duration);
    frame = requestAnimationFrame(meter);
  };
  try {
    return await new Promise<boolean>((resolve) => {
      const stop = () => {
        audio.pause();
        resolve(false);
      };
      signal?.addEventListener("abort", stop, { once: true });
      audio.addEventListener("ended", () => resolve(true), { once: true });
      audio.addEventListener("error", () => resolve(false), { once: true });
      audio.play().then(
        () => (frame = requestAnimationFrame(meter)),
        () => resolve(false),
      );
    });
  } finally {
    cancelAnimationFrame(frame);
    onLevel?.(0);
    URL.revokeObjectURL(url);
  }
}

/** The system voice for `locale`, chosen as the Mac chooses its own (`SystemVoicePlan`). */
async function systemVoice(locale: string): Promise<SpeechSynthesisVoice | null> {
  if (typeof speechSynthesis === "undefined") return null;
  let voices = speechSynthesis.getVoices();
  if (voices.length === 0) {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      speechSynthesis.addEventListener("voiceschanged", done, { once: true });
      setTimeout(done, 1000);
    });
    voices = speechSynthesis.getVoices();
  }
  const choice = SystemVoicePlan.pick(
    locale,
    voices.map((voice) => ({ name: voice.name, language: voice.lang, identifier: voice.voiceURI })),
  );
  return voices.find((voice) => voice.voiceURI === choice?.identifier) ?? null;
}

/** Windows speaks `text`; its word boundaries tell how far it is. */
async function speakWithSystem(text: string, locale: string, options: SpeakOptions): Promise<boolean> {
  if (typeof speechSynthesis === "undefined" || text === "") return false;
  const voice = await systemVoice(locale);
  // A Portuguese voice of the wrong country is never used for pt-PT: then there is no system voice for it.
  if (!voice && locale.startsWith("pt")) return false;
  return new Promise<boolean>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    let pulse = 0;
    utterance.onboundary = (event) => {
      options.onProgress?.(event.charIndex, text.length);
      pulse = 0.6;
      options.onLevel?.(pulse);
    };
    const decay = setInterval(() => {
      pulse = Math.max(0, pulse - 0.12);
      options.onLevel?.(pulse);
    }, 60);
    const finish = (said: boolean) => {
      clearInterval(decay);
      options.onLevel?.(0);
      resolve(said);
    };
    utterance.onend = () => {
      options.onProgress?.(text.length, text.length);
      finish(true);
    };
    utterance.onerror = () => finish(false);
    options.signal?.addEventListener(
      "abort",
      () => {
        speechSynthesis.cancel();
        finish(false);
      },
      { once: true },
    );
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  });
}

/**
 * Says `text` aloud and returns when it has been said (or at once when stopped). Premium: sentence by sentence, every
 * sentence's clip asked for at once, so the first plays as soon as it is in and the next is ready when one ends.
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<SpeakResult> {
  // Settings › General › Voice off: nothing is said, the text is shown for its reading time instead.
  if (readPreference("voiceEnabled") === "0")
    return { engine: "system", notice: null, spoken: SpokenText.forSpeech(text, SpeechPrice.flashModel), silent: true };
  const language = tutorLanguage();
  const locale = TutorLanguage.locale(language);
  const premiumWanted = premiumVoiceEnabled();
  const engine =
    language === "pt" && !usesMock()
      ? SpeechPlaybackPlan.engine(await hasCredentials(), false, premiumWanted)
      : "system";
  const spoken = SpokenText.forSpeech(text, SpeechPrice.flashModel);
  if (spoken === "") return { engine, notice: null, spoken };
  if (engine === "openRouter") {
    const sentences = NarrationSentences.split(spoken);
    const pending = sentences.map((sentence) => clip(sentence, options.signal));
    let before = 0;
    let played = true;
    for (let index = 0; index < sentences.length && played; index += 1) {
      const audio = await pending[index]!;
      if (options.signal?.aborted) return { engine, notice: null, spoken };
      if (!audio) {
        played = false;
        break;
      }
      const length = sentences[index]!.length;
      played = await playAudio(
        audio,
        (fraction) => options.onProgress?.(before + Math.floor(fraction * length), spoken.length),
        options.onLevel,
        options.signal,
      );
      before += length + 1;
    }
    if (played || options.signal?.aborted) return { engine, notice: null, spoken };
    // The paid voice failed: Windows says what is left, and the student is told once.
    const rest = spoken.slice(Math.min(before, spoken.length));
    const said = await speakWithSystem(rest === "" ? spoken : rest, locale, options);
    return {
      engine: "system",
      notice: "The paid voice isn’t available, so this Mac is speaking.",
      spoken,
      silent: !said,
    };
  }
  const said = await speakWithSystem(spoken, locale, options);
  return { engine, notice: null, spoken, silent: !said && !options.signal?.aborted };
}

/** A recorded opener line, played as it is (nothing bought): "Vamos lá ver isto." */
export async function playOpener(fileName: string, options: SpeakOptions = {}): Promise<boolean> {
  const extension = fileName.startsWith("opener-en-") ? "m4a" : "mp3";
  try {
    const response = await fetch(`/clips/opener/${fileName}.${extension}`);
    if (!response.ok) return false;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return playAudio(bytes, () => {}, options.onLevel, options.signal);
  } catch {
    return false;
  }
}

/** A recorded line of the app (an onboarding screen's), played as it is: nothing is bought. */
export async function playClip(path: string, options: SpeakOptions = {}): Promise<boolean> {
  try {
    const response = await fetch(`/${path}`);
    if (!response.ok) return false;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return playAudio(bytes, () => {}, options.onLevel, options.signal);
  } catch {
    return false;
  }
}

/** Stops whatever the system voice is saying. */
export function stopSpeaking(): void {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
