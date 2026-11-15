// After LearnLayerTests/NoteTextCodeRenderTests.swift @ ref 2026-11-04: an opened step note with a code block renders,
// its program kept line for line in its own block, the prose around it as text.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MathText } from "./Math";

describe("MathText with code", () => {
  test("an opened note with code renders, with the program kept line for line", () => {
    const note = "Percorre-se a lista:\n```python\ndef soma(xs):\n    return sum(xs)\n```\nE devolve-se o total.";
    const html = renderToStaticMarkup(<MathText text={note} />);
    expect(html).toContain('class="code-block"');
    expect(html).toContain("Percorre-se a lista:");
    expect(html).toContain("E devolve-se o total.");
    // The keyword in Dark+ blue, the indentation kept.
    expect(html).toContain('<span style="color:#569CD6">def</span>');
    expect(html.replace(/<[^>]+>/g, "")).toContain("def soma(xs):\n    return sum(xs)");
  });

  test("text without code stays as it was", () => {
    const html = renderToStaticMarkup(<MathText text="f(x) = 2x + 1\nf(3) = 7" />);
    expect(html).not.toContain("code-block");
  });
});
