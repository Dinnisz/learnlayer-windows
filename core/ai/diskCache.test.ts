import { describe, expect, it } from "vitest";
import { cacheKey, DiskCache, imagesDigest, solutionCacheKey, type DataFiles } from "./diskCache";

function memoryFiles(initial: Record<string, string> = {}): DataFiles & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    read: async (name) => files.get(name) ?? null,
    write: async (name, contents) => void files.set(name, contents),
  };
}

describe("cache keys", () => {
  it("are SHA-256 of the parts joined by U+001F, as on the Mac", async () => {
    const joined = new TextEncoder().encode("a" + String.fromCharCode(0x1f) + "b");
    const expected = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", joined)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(await cacheKey("a", "b")).toBe(expected);
    expect(await cacheKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("depend on the prompt version, the routing, the route, the question, the note and the pages", async () => {
    const base = {
      groupText: "1. Q",
      figureNote: null,
      imagesKey: "",
      route: "fast" as const,
      promptVersion: "33",
      config: "cheapFirst" as const,
    };
    const key = await solutionCacheKey(base);
    expect(key).toBe(await cacheKey("33-Bfast", "1. Q", "", ""));
    const variants = await Promise.all([
      solutionCacheKey({ ...base, promptVersion: "34" }),
      solutionCacheKey({ ...base, config: "current" }),
      solutionCacheKey({ ...base, route: "strong" }),
      solutionCacheKey({ ...base, groupText: "1. Q " }),
      solutionCacheKey({ ...base, figureNote: "note" }),
      solutionCacheKey({ ...base, imagesKey: "x" }),
      solutionCacheKey({ ...base, usesMock: true }),
    ]);
    expect(new Set([key, ...variants]).size).toBe(8);
  });

  it("an image digest follows the content, not the byte length", async () => {
    expect(await imagesDigest([])).toBe("");
    const a = await imagesDigest([new Uint8Array([1, 2, 3])]);
    expect(a).toHaveLength(64);
    expect(await imagesDigest([new Uint8Array([1, 2, 4])])).not.toBe(a);
    expect(await imagesDigest([new Uint8Array([1, 2, 3])])).toBe(a);
  });
});

describe("DiskCache", () => {
  it("keeps answers on disk, shares a request on its way, and keeps the most recent", async () => {
    let clock = Date.UTC(2026, 10, 15);
    const files = memoryFiles();
    const cache = new DiskCache<string>("solutions.json", 2, files, () => clock);
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "answer";
    };
    const [first, second] = await Promise.all([cache.script("k1", fetch), cache.script("k1", fetch)]);
    expect([first, second, calls]).toEqual(["answer", "answer", 1]);
    expect(await cache.script("k1", fetch)).toBe("answer");
    expect(calls).toBe(1);

    clock += 1000;
    await cache.store("two", "k2");
    clock += 1000;
    await cache.cached("k1");
    clock += 1000;
    await cache.store("three", "k3");
    const onDisk = JSON.parse(files.files.get("solutions.json")!) as Record<
      string,
      { script: string; lastUsed: number }
    >;
    // As on the Mac: the oldest entry (k2) leaves memory, but the merge with the file before writing brings it back,
    // so the file itself is not trimmed (noted in docs/PROGRESSO.md, «Reparos ao Mac»).
    expect(Object.keys(onDisk).sort()).toEqual(["k1", "k2", "k3"]);
    // Seconds since 1 January 2001, as Swift writes a Date.
    expect(onDisk.k3!.lastUsed).toBe((clock - Date.UTC(2001, 0, 1)) / 1000);

    const reopened = new DiskCache<string>("solutions.json", 2, files, () => clock);
    expect(await reopened.cached("k3")).toBe("three");
    await reopened.remove("k3");
    expect(await new DiskCache<string>("solutions.json", 2, files).cached("k3")).toBeNull();
  });

  it("merges with another copy's newer answers instead of erasing them", async () => {
    const files = memoryFiles();
    const mine = new DiskCache<string>("solutions.json", 10, files, () => 1000);
    const theirs = new DiskCache<string>("solutions.json", 10, files, () => 2000);
    await mine.store("mine", "a");
    await theirs.store("theirs", "b");
    await mine.store("mine again", "c");
    const onDisk = JSON.parse(files.files.get("solutions.json")!) as Record<string, unknown>;
    expect(Object.keys(onDisk).sort()).toEqual(["a", "b", "c"]);
  });

  it("an unreadable file is an empty cache", async () => {
    const cache = new DiskCache<string>("solutions.json", 10, memoryFiles({ "solutions.json": "{not json" }));
    expect(await cache.cached("x")).toBeNull();
  });
});
