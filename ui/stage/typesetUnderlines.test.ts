// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { quoteRects } from "./typesetUnderlines";

/** jsdom lays nothing out: each range's box says which words it holds (x = start, width = length). */
function stubLayout() {
  const picked: string[] = [];
  const box = (x: number, width: number, height: number) =>
    ({ x, y: 0, left: x, top: 0, width, height, right: x + width, bottom: height }) as DOMRect;
  Range.prototype.getClientRects = function (this: Range) {
    picked.push(this.toString());
    return [box(this.startOffset, this.endOffset - this.startOffset, 20)] as unknown as DOMRectList;
  };
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    picked.push(`[${this.className}]`);
    return box(0, 50, 30);
  });
  return picked;
}

function question(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

afterEach(() => vi.restoreAllMocks());

describe("quoteRects (RenderedQuestion.rects(ofQuote:))", () => {
  it("underlines only the quote's own letters", () => {
    const picked = stubLayout();
    const rects = quoteRects(question("<p>Um carro parte do repouso com v0 = 12 m/s.</p>"), "v0 = 12 m/s");
    expect(rects).toHaveLength(1);
    expect(picked).toEqual(["v0 = 12 m/s"]);
  });

  it("finds a quote across bold and plain words", () => {
    const picked = stubLayout();
    quoteRects(question("<p>partindo do <strong>repouso</strong> em t = 0</p>"), "do repouso em");
    expect(picked).toEqual(["do ", "repouso", " em"]);
  });

  it("never matches inside a longer number", () => {
    stubLayout();
    expect(quoteRects(question("<p>uma massa de 120 kg</p>"), "12")).toEqual([]);
  });

  it("underlines a whole formula a quote runs into", () => {
    const picked = stubLayout();
    const html =
      '<p>com <span class="katex"><annotation encoding="application/x-tex">R_1</annotation>R1</span> = 2 kΩ</p>';
    quoteRects(question(html), "R_1 = 2 kΩ");
    expect(picked).toEqual(["[katex]", " = 2 kΩ"]);
  });

  it("leaves out what is drawn over the question", () => {
    const picked = stubLayout();
    const rects = quoteRects(question('<p>a = 3</p><span data-underline-skip="">a = 3</span>'), "a = 3");
    expect(rects).toHaveLength(1);
    expect(picked).toEqual(["a = 3"]);
  });

  it("keeps blocks apart", () => {
    stubLayout();
    expect(quoteRects(question("<p>massa</p><p>de 2 kg</p>"), "massa de 2 kg")).toHaveLength(2);
  });
});
