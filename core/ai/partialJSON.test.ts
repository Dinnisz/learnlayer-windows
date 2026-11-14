// Port of LearnLayerTests/PartialJSONTests.swift @ ref 2026-11-04
// (the cases that decode a `ProblemSolution` are in core/problems/problemSolution.test.ts)

import { describe, expect, it } from "vitest";
import { PartialJSON, SolutionJSON, streamedPart, streamedReplyEvent, ToolCallMarkup } from "./partialJSON";

describe("PartialJSON", () => {
  it("complete object is unchanged", () => {
    const json = '{"a":1,"b":[true,null]}';
    expect(PartialJSON.repaired(json)).toBe(json);
  });

  it("cuts after the last complete value", () => {
    expect(PartialJSON.repaired('{"a": 1, "b":')).toBe('{"a": 1}');
    expect(PartialJSON.repaired('{"a": 1,')).toBe('{"a": 1}');
    expect(PartialJSON.repaired('["x", 2, ')).toBe('["x", 2]');
  });

  it("drops an unfinished string", () => {
    expect(["{}", '{"a":}']).toContain(PartialJSON.repaired('{"a": "hel'));
    const value = PartialJSON.value('{"a": "hel') as Record<string, unknown> | undefined;
    expect(value?.a).toBeUndefined();
  });

  it("keeps escaped quotes inside a complete string", () => {
    const complete = String.raw`{"quote": "he said \"hi\"", "n": 2}`;
    expect(PartialJSON.repaired(complete)).toBe(complete);
    const value = PartialJSON.value(complete) as Record<string, unknown>;
    expect(value.quote).toBe('he said "hi"');
    // A number still arriving is left out, never cut short.
    expect(PartialJSON.repaired(String.raw`{"quote": "he said \"hi\"", "n": 2`)).toBe(
      String.raw`{"quote": "he said \"hi\""}`,
    );
  });

  it("unfinished escape does not cut the string short", () => {
    expect(PartialJSON.repaired('{"a": "hello\\')).toBe("{}");
  });

  it("nested containers close", () => {
    const prefix = '{"parts":[{"label":"1","answer":{"text":"ok"}}';
    expect(PartialJSON.repaired(prefix)).toBe('{"parts":[{"label":"1","answer":{"text":"ok"}}]}');
    expect(streamedPart(prefix, "1")?.answerText).toBe("ok");
  });

  it("nothing before the first container", () => {
    expect(PartialJSON.repaired("   ")).toBeNull();
    expect(PartialJSON.repaired("not json")).toBeNull();
  });
});

describe("StreamedReply", () => {
  it("JSON is forwarded while it streams", () => {
    expect(streamedReplyEvent('{"a":')).toEqual({ kind: "forward" });
    expect(streamedReplyEvent('{"subject":"Physics","parts":[]}')).toEqual({ kind: "forward" });
    expect(ToolCallMarkup.looksLikeToolCall('{"note":"not an <invoke>"}')).toBe(false);
  });

  it("tool call is held until it can be read", () => {
    expect(streamedReplyEvent("<inv")).toEqual({ kind: "hold" });
    expect(streamedReplyEvent('<invoke name="respond"><parameter name="subject">Phy')).toEqual({ kind: "hold" });
  });

  it("finished tool call with no object is rejected", () => {
    expect(streamedReplyEvent('<invoke name="respond"></invoke>')).toEqual({ kind: "reject" });
    expect(ToolCallMarkup.jsonObject('<invoke name="respond"></invoke>')).toBeNull();
  });

  it("parameters become one JSON object", () => {
    const xml = [
      '<invoke name="respond">',
      '<parameter name="subject">see {fig}</parameter>',
      '<parameter name="parts">[{"label":"1.1","answer":{"text":"2 m/s"}}]</parameter>',
      "</invoke>",
    ].join("\n");
    const event = streamedReplyEvent(xml);
    expect(event.kind).toBe("json");
    const solution = JSON.parse((event as { json: string }).json);
    expect(solution.subject).toBe("see {fig}");
    expect(solution.parts[0].answer.text).toBe("2 m/s");
  });

  it("wrapped object is the solution itself", () => {
    const xml =
      '<INVOKE name="respond"><parameter name="response">{"subject":"Math","parts":[{"label":"2","answer":{"text":"B"}}]}</parameter></INVOKE>';
    const solution = JSON.parse(ToolCallMarkup.jsonObject(xml) ?? "null");
    expect(solution.subject).toBe("Math");
    expect(solution.parts[0].answer.text).toBe("B");
  });

  it("entities and CDATA in a parameter are read", () => {
    const entity =
      '<invoke name="r"><parameter name="json">{&quot;parts&quot;:[],&quot;subject&quot;:&quot;A &amp;amp; B&quot;}</parameter></invoke>';
    expect(JSON.parse(ToolCallMarkup.jsonObject(entity) ?? "null")).toEqual({ parts: [], subject: "A &amp; B" });
    const cdata = '<invoke name="r"><parameter name="json"><![CDATA[ {"parts":[1]} ]]></parameter></invoke>';
    expect(ToolCallMarkup.jsonObject(cdata)).toBe('{"parts":[1]}');
  });
});

describe("SolutionJSON", () => {
  const cards = (text: string) =>
    (JSON.parse(SolutionJSON.repaired(text)).parts[0].cards as { title: string }[]).map((card) => card.title);

  it("a missing latex value keeps the other cards", () => {
    const json =
      '{"subject":"Biology","parts":[{"label":"1","answer":{"text":"(A) osmose"},"cards":[{"title":"Keep","latex":"H_2O"},{"title":"Broken","latex":},{"title":"Also","latex":"Na+"}]}]}';
    expect(cards(json)).toEqual(["Keep", "Broken", "Also"]);
    expect(JSON.parse(SolutionJSON.repaired(json)).parts[0].answer.text).toBe("(A) osmose");
  });

  it("an unparseable card is dropped", () => {
    const json =
      '{"subject":"BG","parts":[{"label":"11","answer":{"text":"(C) osmose"},"cards":[{"title":"Keep","latex":"H_2O"},{"title":"bad","latex":@@@},{"title":"Also","latex":"Na+"}]}]}';
    expect(cards(json)).toEqual(["Keep", "Also"]);
  });

  it("a trailing comma inside a card is still that card", () => {
    const json = '{"parts":[{"cards":[{"title":"Keep","latex":"x",},{"title":"Also"}]}]}';
    expect(cards(json)).toEqual(["Keep", "Also"]);
  });

  it("closes an array that slipped into the next key, and mismatched closers", () => {
    expect(JSON.parse(SolutionJSON.closingSlippedBrackets('{"steps":["a","b","answer":{"text":"2"}}'))).toEqual({
      steps: ["a", "b"],
      answer: { text: "2" },
    });
    expect(JSON.parse(SolutionJSON.closingSlippedBrackets('{"a":[1,2}}'))).toEqual({ a: [1, 2] });
    const valid = '{"a":[1,{"b":"x: y"}],"c":"[not] {touched}"}';
    expect(SolutionJSON.closingSlippedBrackets(valid)).toBe(valid);
  });
});

describe("StreamedPart", () => {
  it("a streamed string answer is shown", () => {
    expect(streamedPart('{"parts":[{"label":"1","answer":"ATP"}', "1")?.answerText).toBe("ATP");
  });

  it("reads evidence and paragraphs as they arrive, and knows a non-text answer", () => {
    const prefix =
      '{"parts":[{"label":"2","evidence":[{"quote":"o mar","source":"Texto A","point":"imagem"},{"quote":""}],"paragraphs":[{"text":"Primeiro."},{"text":"Seg';
    const part = streamedPart(prefix, "2");
    expect(part?.evidence).toEqual([{ quote: "o mar", source: "Texto A", point: "imagem", why: null }]);
    expect(part?.paragraphs).toEqual(["Primeiro."]);
    expect(part?.hasNoEvidence).toBe(false);
    // A literal still arriving is left out, like a number; once it has ended it counts.
    expect(streamedPart('{"parts":[{"label":"1","evidence":null', "1")?.hasNoEvidence).toBe(false);
    expect(streamedPart('{"parts":[{"label":"1","evidence":null,', "1")?.hasNoEvidence).toBe(true);
    expect(streamedPart('{"parts":[{"label":"1","cards":[]', "1")?.hasNoEvidence).toBe(true);
    expect(streamedPart('{"parts":[{"label":"9","answer":"x"}', "1")?.answerText).toBe("x");
    expect(streamedPart('{"subject":"M"', "1")).toBeNull();
  });
});
