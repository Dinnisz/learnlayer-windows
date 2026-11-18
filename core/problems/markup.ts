// Port of `RenderedQuestion.markup` (LearnLayer/Problems/TranscriptionRenderer.swift @ ref 2026-11-04): the model's
// Markdown is never shown as marks. `**…**` is set bold, a pipe table becomes rows of cells (tab-separated), and the
// rule under its header is dropped. A `**` inside `$…$` is maths, not a mark.

export interface Markup {
  text: string;
  /** Bold stretches of `text`, as [start, end) in UTF-16 units. */
  bold: [number, number][];
  hasTable: boolean;
}

export function markup(source: string): Markup {
  // A table: lines that start with a pipe and have another one; the rule under its header is not a row.
  const lines: string[] = [];
  let hasTable = false;
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.slice(1).includes("|")) {
      lines.push(line);
      continue;
    }
    hasTable = true;
    let cells = trimmed.slice(1);
    if (cells.endsWith("|")) cells = cells.slice(0, -1);
    const row = cells.split("|").map((cell) => cell.trim());
    if (row.every((cell) => cell !== "" && /^[-:]+$/u.test(cell) && cell.includes("-"))) continue;
    lines.push(row.join("\t"));
  }
  const joined = lines.join("\n");
  // Bold marks outside `$…$`.
  let text = "";
  const bold: [number, number][] = [];
  let open: number | null = null;
  let inMath = false;
  for (let index = 0; index < joined.length; index++) {
    const ch = joined[index]!;
    if (ch === "$") inMath = !inMath;
    if (!inMath && ch === "*" && joined[index + 1] === "*") {
      const at = text.length;
      if (open !== null) {
        if (at > open) bold.push([open, at]);
        open = null;
      } else open = at;
      index += 1;
      continue;
    }
    text += ch;
  }
  return { text, bold, hasTable };
}
