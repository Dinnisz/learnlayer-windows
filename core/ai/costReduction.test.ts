// Port of LearnLayerTests/CostReductionTests.swift @ ref 2026-11-04, the cases not already in diskCache.test.ts: the
// images' digest reads their bytes (not their length), Anthropic's system prompt is cached, and a message carries its
// pictures. The solution and illustration keys are tested with their caches.

import { describe, expect, it } from "vitest";
import { imagesDigest } from "./diskCache";
import { systemContent, userContent } from "./modelClient";

describe("fewer paid tokens", () => {
  it("the question's image digest uses the content, not the length", async () => {
    const a = await imagesDigest([new Uint8Array([1, 2, 3])]);
    expect(await imagesDigest([new Uint8Array([1, 2, 3])])).toBe(a);
    expect(await imagesDigest([new Uint8Array([1, 2, 3, 0, 0, 0])])).not.toBe(a);
    expect(await imagesDigest([new Uint8Array([4, 5])])).not.toBe(a);
    expect(await imagesDigest([])).toBe("");
  });

  it("Anthropic's system prompt gets cache control, and other models a plain prompt", () => {
    const blocks = systemContent("STATIC", "anthropic/claude-sonnet-5.5") as { cache_control?: { type: string } }[];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.cache_control?.type).toBe("ephemeral");
    const plain = systemContent("STATIC", "openai/gpt-4") as string;
    expect(typeof plain).toBe("string");
    expect(plain).toContain("STATIC");
  });

  it("the user's content carries the images", () => {
    const payload = userContent("hi", [new Uint8Array([0xff, 0xd8])]) as {
      type: string;
      image_url?: { url: string };
    }[];
    expect(payload).toHaveLength(2);
    expect(payload[0]!.type).toBe("text");
    expect(payload[1]!.image_url?.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(userContent("only", [])).toBe("only");
  });
});
