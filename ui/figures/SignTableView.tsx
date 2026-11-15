// Port of LearnLayer/Problems/SignTableView.swift @ ref 2026-11-04: a sign or variation table as it is drawn on an
// exam: the x row on top, a rule under it, one row of signs per factor or derivative, and the function's arrows with
// its values at the points; a rule after the names. Only a table whose every sign checks out is shown (the session).

import { latexToUnicode } from "@core/math/latexText";
import { isUndefinedCell, type SignTable } from "@core/problems/signTable";
import "./figures.css";

/** Cells and names may come as LaTeX ("4-e^{3}"): written out in Unicode. */
export function readable(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "-") return "−";
  if (!trimmed.includes("\\") && !trimmed.includes("^") && !trimmed.includes("_")) {
    // A command that lost its backslash ("-pi/6") is still the symbol.
    return trimmed
      .replace(/-/g, "−")
      .replace(/(?<![A-Za-z])pi(?![A-Za-z])/g, "π")
      .replace(/(?<![A-Za-z])infty(?![A-Za-z])/g, "∞");
  }
  return latexToUnicode(trimmed);
}

export function SignTableView({ table, fontSize = 17 }: { table: SignTable; fontSize?: number }) {
  const header = table.points.flatMap((point, index) => (index === 0 ? [point.text] : ["", point.text]));
  const rows = [
    { name: table.variable, cells: header, kind: "header" as const },
    ...table.rows.map((row) => ({ name: row.name, cells: row.cells, kind: "signs" as const })),
    ...(table.variation
      ? [{ name: table.variation.name, cells: table.variation.cells, kind: "variation" as const }]
      : []),
  ];
  return (
    <table className="sign-table" style={{ fontSize }}>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={index}
            className={`sign-table-${row.kind}${index === 0 ? " ruled" : index < rows.length - 1 ? " faint-rule" : ""}`}
          >
            <th scope="row" style={{ minHeight: row.kind === "variation" ? fontSize * 3.2 : fontSize * 2 }}>
              {readable(row.name)}
            </th>
            {row.cells.map((cell, column) => {
              const interval = column % 2 === 1;
              const text = readable(cell);
              const className =
                row.kind === "variation"
                  ? interval
                    ? "sign-arrow"
                    : "sign-value"
                  : text === "+"
                    ? "sign-plus"
                    : text === "0" || isUndefinedCell(text)
                      ? "sign-zero"
                      : undefined;
              return (
                <td key={column} className={className} style={{ minWidth: interval ? fontSize * 2.8 : fontSize * 2.4 }}>
                  {text}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
