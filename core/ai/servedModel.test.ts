// Port of the served-model cases of LearnLayerTests/CostLedgerTests.swift @ 5701363: the model a reply names, a
// dated or variant id as the same model, a missing cost priced at the served model, and a stream closed before its
// usage estimated rather than free. (The Mac's usage log file has no Windows counterpart: the server keeps the spend.)
import { describe, expect, it } from "vitest";
import { ReportedUsage, ServedModel } from "./modelClient";

const haiku = "anthropic/claude-haiku-5.5";

describe("the served model", () => {
  it("is read from the reply", () => {
    const body =
      '{"id":"gen-1","model":"anthropic/claude-sonnet-5.5","provider":"Anthropic","usage":{"cost":0.0473465}}';
    expect(ReportedUsage.servedModel(body)).toBe("anthropic/claude-sonnet-5.5");
    expect(ReportedUsage.servedModel('{"usage":{}}')).toBeNull();
    expect(ReportedUsage.servedModel('{"model":"  "}')).toBeNull();
  });

  it("is the same model under a dated or variant id", () => {
    expect(ServedModel.differs(haiku, haiku)).toBe(false);
    expect(ServedModel.differs(haiku, "Anthropic/Claude-Haiku-5.5-20261001")).toBe(false);
    expect(ServedModel.differs(haiku, "anthropic/claude-haiku-5.5:batch")).toBe(false);
    expect(ServedModel.differs(haiku, null)).toBe(false);
    expect(ServedModel.differs(haiku, "anthropic/claude-sonnet-5.5")).toBe(true);
    expect(ServedModel.differs(haiku, "google/gemini-3.8-flash")).toBe(true);
  });

  it("prices a missing cost at the served model", () => {
    const sonnet = "anthropic/claude-sonnet-5.5";
    expect(ServedModel.pricing(haiku, sonnet)).toBe(sonnet);
    expect(ServedModel.pricing(haiku, haiku + "-20261001")).toBe(haiku);
    // An id the table does not know keeps the requested rate, not the Sonnet fallback.
    expect(ServedModel.pricing(haiku, "acme/new-model")).toBe(haiku);
  });

  it("estimates a stream closed before its usage, not free", () => {
    const body =
      '{"messages":[{"content":[{"type":"text","text":"Read"},{"type":"image_url","image_url":{"url":"data:image/png;base64,AAAA"}}]}]}';
    const usage = ReportedUsage.estimate(body, 450);
    expect(usage.estimated).toBe(true);
    expect(usage.promptTokens).toBe(1_250);
    expect(usage.completionTokens).toBe(150);
    expect(usage.billedTokens).toBe(1_400);
    // qwen3.8-flash: 1 250 × $0.15/M + 150 × $0.47/M.
    expect(Math.abs(usage.billed("qwen/qwen3.8-flash") - 0.000258)).toBeLessThan(1e-9);
    expect(ReportedUsage.estimate(null, 0).billedTokens).toBe(251);
  });
});
