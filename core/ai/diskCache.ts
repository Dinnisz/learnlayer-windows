// Port of LearnLayer/AI/ExplanationCache.swift (`DiskCache`), LearnLayer/AI/QuestionImageCache.swift (`digest`) and
// the cache key of LearnLayer/Problems/SolutionProvider.swift @ ref 2026-11-04.
//
// The keys are computed exactly as on the Mac (SHA-256 of the parts joined by U+001F, in lowercase hex), so a
// future shared answer cache (docs/shared-answer-cache.md) finds the same answer for the same question.

import { ModelRouting, type RoutingConfig, type SolverRoute } from "./modelRouting";

const UNIT_SEPARATOR = String.fromCharCode(0x1f);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** `DiskCache.key(for:)`: SHA-256 of the parts joined by U+001F, as lowercase hex. */
export function cacheKey(...parts: string[]): Promise<string> {
  return sha256Hex(new TextEncoder().encode(parts.join(UNIT_SEPARATOR)));
}

/** `QuestionImageCache.digest`: a stable digest of the JPEGs actually sent (content, not byte length). "" for none. */
export async function imagesDigest(images: readonly Uint8Array[]): Promise<string> {
  if (images.length === 0) return "";
  const hashes = await Promise.all(images.map(sha256Hex));
  return cacheKey(hashes.join("|"));
}

/** Hex hashes of each image joined by "|": which picture sets asked for a transcription (QuestionTranscription). */
export async function imagesFingerprint(images: readonly Uint8Array[]): Promise<string> {
  return (await Promise.all(images.map(sha256Hex))).join("|");
}

/**
 * The key of a saved solution: the prompt version, the routing (B's answers are its own), the route, the tutor's
 * language (switched, a saved answer in the other language is not reused), the question, the figure note and the pages
 * sent. `usesMock` keeps answers from the mock file apart (`SolutionProvider.cacheIdentity` @ 5701363).
 */
export function solutionCacheKey(options: {
  groupText: string;
  figureNote: string | null;
  imagesKey: string;
  route: SolverRoute;
  promptVersion: string;
  config: RoutingConfig;
  /** `TutorLanguage` ("pt", "en"), as the Mac's `rawValue`. */
  language: "pt" | "en";
  usesMock?: boolean;
}): Promise<string> {
  const routing = options.config === "cheapFirst" ? "-B" : "";
  const prefix = (options.usesMock ? "mock-" : "") + options.promptVersion + routing;
  return cacheKey(
    prefix + options.route + "-" + options.language,
    options.groupText,
    options.figureNote ?? "",
    options.imagesKey,
  );
}

/** Where the cache files live: `%APPDATA%\LearnLayer\<name>` through the native side, memory in tests. */
export interface DataFiles {
  read(name: string): Promise<string | null>;
  write(name: string, contents: string): Promise<void>;
}

interface Entry<Value> {
  script: Value;
  /** Seconds since 1 January 2001, as Swift's JSONEncoder writes a Date. */
  lastUsed: number;
}

const referenceDate = Date.UTC(2001, 0, 1);
const secondsSinceReference = (now: number) => (now - referenceDate) / 1000;

/**
 * Remembers recent answers so asking again is instant, and shares a request that is already on its way (a second
 * click, a reopened panel) instead of sending a second one.
 */
export class DiskCache<Value> {
  private entries: Map<string, Entry<Value>> | null = null;
  private loading: Promise<void> | null = null;
  private readonly inFlight = new Map<string, Promise<Value>>();
  private readonly fileName: string;
  private readonly maxEntries: number;
  private readonly files: DataFiles;
  private readonly now: () => number;

  constructor(fileName: string, maxEntries: number, files: DataFiles, now: () => number = Date.now) {
    this.fileName = fileName;
    this.maxEntries = maxEntries;
    this.files = files;
    this.now = now;
  }

  async cached(key: string): Promise<Value | null> {
    const entries = await this.load();
    const entry = entries.get(key);
    if (!entry) return null;
    entry.lastUsed = secondsSinceReference(this.now());
    return entry.script;
  }

  async script(key: string, fetch: () => Promise<Value>): Promise<Value> {
    const cached = await this.cached(key);
    if (cached !== null) return cached;
    const running = this.inFlight.get(key);
    if (running) return running;
    const request = fetch();
    this.inFlight.set(key, request);
    try {
      const value = await request;
      await this.store(value, key);
      return value;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /** Saves (or replaces) an answer, e.g. once a stronger model has confirmed it. */
  async store(value: Value, key: string): Promise<void> {
    const entries = await this.load();
    entries.set(key, { script: value, lastUsed: secondsSinceReference(this.now()) });
    if (entries.size > this.maxEntries) {
      const oldest = [...entries.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (const [oldKey] of oldest.slice(0, entries.size - this.maxEntries)) entries.delete(oldKey);
    }
    await this.save();
  }

  /** Forgets an answer that turned out not to be one to keep. */
  async remove(key: string): Promise<void> {
    const entries = await this.load();
    if (!entries.delete(key)) return;
    // Not `save()`: its merge would bring the entry back from the file.
    const onDisk = await this.readDisk();
    if (onDisk && onDisk.delete(key)) await this.files.write(this.fileName, JSON.stringify(Object.fromEntries(onDisk)));
  }

  private async readDisk(): Promise<Map<string, Entry<Value>> | null> {
    const text = await this.files.read(this.fileName).catch(() => null);
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as Record<string, Entry<Value>>;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
      return new Map(Object.entries(parsed));
    } catch {
      return null;
    }
  }

  private async load(): Promise<Map<string, Entry<Value>>> {
    if (this.entries) return this.entries;
    this.loading ??= this.readDisk().then((saved) => {
      this.entries ??= saved ?? new Map();
    });
    await this.loading;
    return this.entries!;
  }

  /** Merges with what is on disk first, so two copies of the app running at once don't erase each other's answers. */
  private async save(): Promise<void> {
    const entries = this.entries;
    if (!entries) return;
    const onDisk = await this.readDisk();
    if (onDisk) {
      for (const [key, theirs] of onDisk) {
        const mine = entries.get(key);
        if (!mine || theirs.lastUsed > mine.lastUsed) entries.set(key, theirs);
      }
    }
    await this.files.write(this.fileName, JSON.stringify(Object.fromEntries(entries))).catch(() => {});
  }
}

/** The routing that decides the saved key (`ModelRouting.config`), from the stored preference. */
export function routingConfig(stored: string | null): RoutingConfig {
  return ModelRouting.config(stored);
}
