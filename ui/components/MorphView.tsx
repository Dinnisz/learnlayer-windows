// Port of EquationMorphView (LearnLayer/Explanation/EquationMorph.swift @ ref 2026-11-04): `from` becoming `to` over
// `duration` seconds from `started`, or held at `frozen`. Each piece of both lines is typeset on its own with KaTeX and
// placed where the spacing of its row puts it; what stays slides, what goes is struck out or lifted away, what is new
// comes in (`EquationMorph.plan`). At the end, and with reduced motion (then a fade), it is the typeset line itself.
// The Mac also moves each piece onto the ink of the typeset line (`Ink.locate`); here the pieces keep the places the
// spacing gives them (docs/DECISOES.md).

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  EquationMorph,
  MorphPacing,
  MorphTiming,
  type MorphChange,
  type RowMorph,
} from "@core/explanation/equationMorph";
import { LatexText, withAccents } from "@core/math/latexText";
import { MathView, typesetInlineDisplay } from "./Math";
import "./morph.css";

/** A piece typeset and placed in the new line's frame (its top left at x, y). */
interface Placed {
  html: string;
  x: number;
  /** The piece's top. */
  y: number;
  width: number;
  height: number;
  /** From the piece's top down to its baseline. */
  baseline: number;
  strikes: boolean;
  /** Where KaTeX draws inside the piece's wrapper: the wrapper is placed this much up and left. */
  dx: number;
  dy: number;
}

interface Laid {
  before: Placed[][];
  after: Placed[][];
  width: number;
  height: number;
  /** The bottom of everything drawn: the new line's height, or lower where the old line's pieces reach further down. */
  extent: number;
  /** The formula's font size in pixels. */
  em: number;
}

interface Prepared {
  rows: RowMorph[];
  laid: Laid;
  stages: number;
}

interface Measured {
  html: string;
  dx: number;
  dy: number;
  width: number;
  height: number;
  baseline: number;
  em: number;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A piece's wrapper: a mark on the baseline, then the formula. */
const wrapped = (html: string) => `<span class="morph-baseline"></span>${html}`;

function measure(host: HTMLElement, latex: string): Measured | null {
  const html = typesetInlineDisplay(latex);
  if (html === null) return null;
  const wrapper = document.createElement("span");
  wrapper.className = "morph-piece morph-measure";
  wrapper.innerHTML = wrapped(html);
  host.appendChild(wrapper);
  try {
    const box = wrapper.getBoundingClientRect();
    const mark = wrapper.firstElementChild;
    const katexElement = wrapper.querySelector(".katex");
    // The formula's boxes, struts included: an inline formula's own box is only its line's height.
    const bases = [...wrapper.querySelectorAll(".katex-html > .katex-base, .katex-html > .base")].map((base) =>
      base.getBoundingClientRect(),
    );
    if (!mark || !katexElement || bases.length === 0) return null;
    const ink = {
      left: Math.min(...bases.map((rect) => rect.left)),
      top: Math.min(...bases.map((rect) => rect.top)),
      width: Math.max(...bases.map((rect) => rect.right)) - Math.min(...bases.map((rect) => rect.left)),
      height: Math.max(...bases.map((rect) => rect.bottom)) - Math.min(...bases.map((rect) => rect.top)),
    };
    if (!(ink.width > 0)) return null;
    return {
      html,
      dx: ink.left - box.left,
      dy: ink.top - box.top,
      width: ink.width,
      height: ink.height,
      baseline: mark.getBoundingClientRect().top - ink.top,
      em: parseFloat(getComputedStyle(katexElement).fontSize) || 20,
    };
  } finally {
    wrapper.remove();
  }
}

interface Side {
  rows: Placed[][];
  lefts: number[];
  baselines: number[];
  columns: (number | null)[];
  width: number;
  height: number;
  em: number;
}

/** A line's rows, each piece typeset and placed; null when they would not look like the typeset line. */
function side(host: HTMLElement, latex: string): Side | null {
  const rows = EquationMorph.rows(latex);
  if (!rows || rows.length === 0) return null;
  const whole = measure(host, latex);
  if (!whole) return null;
  const em = whole.em;
  const laidRows: Placed[][] = [];
  const widths: number[] = [];
  const columns: (number | null)[] = [];
  const ascents: number[] = [];
  const descents: number[] = [];
  for (const row of rows) {
    const set = rows.length === 1 ? whole : measure(host, row.latex);
    if (!set) return null;
    const sets: Measured[] = [];
    for (const token of row.tokens) {
      const piece = measure(host, token.latex);
      if (!piece) return null;
      sets.push(piece);
    }
    const pieceWidths = sets.map((piece) => piece.width);
    const fixed = row.tokens.map((token) => token.spaceBefore * em);
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    if (!EquationMorph.layoutAgrees(sum(pieceWidths) + sum(fixed), set.width)) return null;
    const lefts = EquationMorph.positions(
      pieceWidths,
      row.tokens.map((_, index) => EquationMorph.spaceWeight(row.tokens, index)),
      set.width,
      fixed,
    );
    // Placed on the row's baseline at y = 0.
    laidRows.push(
      sets.map((piece, index) => ({
        html: piece.html,
        x: lefts[index]!,
        y: -piece.baseline,
        width: piece.width,
        height: piece.height,
        baseline: piece.baseline,
        strikes: EquationMorph.strikes(row.tokens[index]!),
        dx: piece.dx,
        dy: piece.dy,
      })),
    );
    widths.push(set.width);
    columns.push(row.column === null ? null : row.column < lefts.length ? lefts[row.column]! : set.width);
    ascents.push(set.baseline);
    descents.push(set.height - set.baseline);
  }
  const block =
    rows.length === 1
      ? { lefts: [0], baselines: [whole.baseline], width: widths[0]! }
      : EquationMorph.blockLayout(widths, columns, ascents, descents, whole.height);
  // A block laid out row by row must come to the block's own width.
  if (block.width > whole.width * 1.08 || block.width < whole.width * 0.85) return null;
  return {
    rows: laidRows.map((row, index) =>
      row.map((placed) => ({ ...placed, x: placed.x + block.lefts[index]!, y: placed.y + block.baselines[index]! })),
    ),
    lefts: block.lefts,
    baselines: block.baselines,
    columns: columns.map((column, index) => (column === null ? null : column + block.lefts[index]!)),
    width: whole.width,
    height: whole.height,
    em,
  };
}

/** Whether the line is drawn as one typeset formula (not a table, words, or words with accents). */
function drawnAsOneFormula(latex: string): boolean {
  return (
    LatexText.tableRows(latex) === null &&
    !LatexText.isProse(latex) &&
    LatexText.accentedTextPieces(withAccents(latex)) === null
  );
}

const memo64 = new Map<string, Prepared | null>();

/** The plan and its layout for two lines, null when they crossfade. Worked out once per pair of lines. */
function prepare(host: HTMLElement, from: string, to: string): Prepared | null {
  const id = `${getComputedStyle(host).fontSize}|${from}|${to}`;
  const known = memo64.get(id);
  if (known !== undefined) return known;
  let result: Prepared | null = null;
  const plan = drawnAsOneFormula(from) && drawnAsOneFormula(to) ? EquationMorph.plan(from, to) : null;
  if (plan?.kind === "morph") {
    const old = side(host, from);
    const fresh = side(host, to);
    const anchor = plan.rows.find((row) => row.from !== null && row.to !== null);
    if (old && fresh && anchor && anchor.from! < old.rows.length && anchor.to! < fresh.rows.length) {
      const a = anchor.from!;
      const b = anchor.to!;
      const oldColumn = old.columns[a];
      const newColumn = fresh.columns[b];
      const twoBlocks = old.rows.length > 1 && fresh.rows.length > 1;
      const dx =
        twoBlocks && oldColumn != null && newColumn != null ? newColumn - oldColumn : fresh.lefts[b]! - old.lefts[a]!;
      const dy = fresh.baselines[b]! - old.baselines[a]!;
      const before = old.rows.map((row) => row.map((placed) => ({ ...placed, x: placed.x + dx, y: placed.y + dy })));
      const after = fresh.rows;
      const extent = [...before, ...after]
        .flat()
        .reduce((low, placed) => Math.max(low, placed.y + placed.height), fresh.height);
      result = {
        rows: plan.rows,
        laid: { before, after, width: fresh.width, height: fresh.height, extent, em: fresh.em },
        stages: Math.max(0, ...plan.rows.map((row) => row.stage)) + 1,
      };
    }
  }
  // Measured before KaTeX's fonts have come, the pieces are another width: measured again once they have.
  if (document.fonts.status === "loaded") {
    if (memo64.size > 64) memo64.clear();
    memo64.set(id, result);
  }
  return result;
}

interface Drawn {
  key: string;
  piece: Placed;
  x: number;
  y: number;
  opacity: number;
}

interface Strike {
  key: string;
  piece: Placed;
  lift: number;
  drawn: number;
  opacity: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** What is on screen `seconds` into the morph. */
function frame(prepared: Prepared, seconds: number, schedule: MorphPacing): { drawn: Drawn[]; strikes: Strike[] } {
  const { laid } = prepared;
  const em = laid.em;
  const drawn: Drawn[] = [];
  const strikes: Strike[] = [];
  const draw = (key: string, piece: Placed, x: number, y: number, opacity: number) => {
    if (opacity > 0) drawn.push({ key, piece, x, y, opacity });
  };
  const leaving = (key: string, placed: Placed, t: number) =>
    draw(key, placed, placed.x, placed.y + em * MorphTiming.lift(t), MorphTiming.outgoing(t));
  /** Rises into place; a row worked out from the one above drops into place from it instead. */
  const arriving = (key: string, placed: Placed, t: number, fromAbove = false) =>
    draw(key, placed, placed.x, placed.y + em * MorphTiming.rise(t) * (fromAbove ? -1 : 1), MorphTiming.incoming(t));

  /** A copy (`copy`) is of a row that stays: what goes from it is not drawn, and what is new drops in from above. */
  const change = (key: string, c: MorphChange, before: Placed[], after: Placed[], t: number, copy = false) => {
    const travel = MorphTiming.travel(t);
    const outgoing = copy ? 0 : MorphTiming.outgoing(t);
    // A copy shows as it comes away from the row it copies, never doubled over it.
    const separated = copy ? EquationMorph.span(travel, 0.45, 0.75) : 1;
    const arc = (amount: number) => Math.sin(Math.PI * travel) * em * amount;
    switch (c.kind) {
      case "keep": {
        // Stays put while the others go, then slides into its place before the new ones come.
        const a = before[c.from]!;
        const b = after[c.to]!;
        draw(key, a, lerp(a.x, b.x, travel), lerp(a.y, b.y, travel), separated);
        break;
      }
      case "move": {
        // Lifted over the pieces it passes.
        const a = before[c.from]!;
        const b = after[c.to]!;
        draw(key, a, lerp(a.x, b.x, travel), lerp(a.y, b.y, travel) - arc(0.45), separated);
        break;
      }
      case "gather": {
        // The factor's other copy travels into the one in front of the bracket, and is gone as it lands on it.
        const a = before[c.from]!;
        const b = after[c.into]!;
        const shown = MorphTiming.gathering(t);
        if (shown > 0) draw(key, a, lerp(a.x, b.x, travel), lerp(a.y, b.y, travel) - arc(0.45), shown * separated);
        break;
      }
      case "cancel": {
        if (outgoing <= 0) break;
        const a = before[c.from]!;
        const lift = em * MorphTiming.lift(t);
        if (a.strikes) {
          draw(key, a, a.x, a.y + lift, outgoing);
          strikes.push({ key, piece: a, lift, drawn: MorphTiming.strike(t), opacity: outgoing });
        } else leaving(key, a, t);
        break;
      }
      case "merge":
        // The old pieces leave where they are; the new one comes only once they are gone.
        if (outgoing > 0) c.from.forEach((a) => leaving(`${key}-${a}`, before[a]!, t));
        arriving(`${key}-in`, after[c.into]!, t, copy);
        break;
      case "combine": {
        // The terms close in on the place of what they come to, fading; then it comes in. From a row that stays, only
        // the result comes down: its terms stay where they are.
        const b = after[c.into]!;
        const shown = copy ? 0 : MorphTiming.outgoing(t);
        if (shown > 0) {
          const centre = b.x + b.width / 2;
          const close = MorphTiming.closeIn(t);
          c.from.forEach((index) => {
            const a = before[index]!;
            draw(`${key}-${index}`, a, lerp(a.x, centre - a.width / 2, close), lerp(a.y, b.y, close), shown);
          });
        }
        arriving(`${key}-in`, b, t, copy);
        break;
      }
      case "substitute": {
        if (outgoing > 0) c.from.forEach((a) => leaving(`${key}-${a}`, before[a]!, t));
        const b = after[c.into]!;
        const source = c.origin ? laid.before[c.origin.row]?.[c.origin.index] : undefined;
        if (source) {
          // The value lifts off where it was given and flies into the letter's place.
          const fly = MorphTiming.fly(t);
          const shown = MorphTiming.flying(t);
          if (shown > 0)
            draw(
              `${key}-in`,
              b,
              lerp(source.x, b.x, fly),
              lerp(source.y, b.y, fly) - Math.sin(Math.PI * fly) * em * 0.6,
              shown,
            );
        } else {
          // The value drops into the letter's place from above.
          draw(`${key}-in`, b, b.x, b.y - em * MorphTiming.rise(t), MorphTiming.incoming(t));
        }
        break;
      }
      case "appear":
        arriving(key, after[c.to]!, t, copy);
    }
  };

  prepared.rows.forEach((row, rowIndex) => {
    const t = schedule.stageTime(seconds, row.stage);
    if (row.from !== null && row.to !== null) {
      row.changes.forEach((c, index) =>
        change(`${rowIndex}-${index}`, c, laid.before[row.from!]!, laid.after[row.to!]!, t),
      );
    } else if (row.previous !== null && row.to !== null && row.previous < laid.after.length) {
      // The row above stays; a copy of it comes down and becomes this row. Nothing leaves a copy, so it starts where
      // the pieces start to travel.
      if (t > 0) {
        const copyTime = MorphTiming.travelStart + (1 - MorphTiming.travelStart) * t;
        row.changes.forEach((c, index) =>
          change(`${rowIndex}-${index}`, c, laid.after[row.previous!]!, laid.after[row.to!]!, copyTime, true),
        );
      }
    } else if (row.from !== null) {
      // A row with no row after it leaves whole: lifted and faded, nothing struck.
      laid.before[row.from]!.forEach((placed, index) => leaving(`${rowIndex}-${index}`, placed, t));
    } else if (row.to !== null) {
      laid.after[row.to]!.forEach((placed, index) => arriving(`${rowIndex}-${index}`, placed, t, row.stage > 0));
    }
  });
  return { drawn, strikes };
}

const Piece = memo(function Piece({ drawn }: { drawn: Drawn }) {
  const { piece } = drawn;
  return (
    <span
      className="morph-piece"
      style={{ left: drawn.x - piece.dx, top: drawn.y - piece.dy, opacity: drawn.opacity }}
      dangerouslySetInnerHTML={{ __html: wrapped(piece.html) }}
    />
  );
});

export interface MorphViewProps {
  from: string;
  to: string;
  /** Milliseconds since the epoch; by default, when the view first appears. */
  started?: number;
  /** One stage's seconds, when no `pacing` is given. */
  duration: number;
  /** When each row plays, in seconds from `started`; null plays them at the fixed rhythm of `duration`. */
  pacing?: MorphPacing | null;
  /** Share (0…1) of the whole morph held still. */
  frozen?: number | null;
  className?: string;
}

export function MorphView({
  from,
  to,
  started: given,
  duration,
  pacing = null,
  frozen = null,
  className,
}: MorphViewProps) {
  const host = useRef<HTMLSpanElement>(null);
  const reduce = useMemo(() => reducedMotion(), []);
  const [mounted] = useState(() => Date.now());
  const started = given ?? mounted;
  const [prepared, setPrepared] = useState<Prepared | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [fonts, setFonts] = useState(() => document.fonts.status === "loaded");

  useEffect(() => {
    if (fonts) return;
    let live = true;
    void document.fonts.ready.then(() => live && setFonts(true));
    return () => {
      live = false;
    };
  }, [fonts]);

  useLayoutEffect(() => {
    if (!host.current) return;
    setPrepared(reduce ? null : prepare(host.current, from, to));
    // Typesetting the pieces may have asked for a font only now: they are measured again once it has come.
    if (document.fonts.status !== "loaded") setFonts(false);
  }, [from, to, reduce, fonts]);

  // The rows' timing. A crossfade (or reduced motion) is one stage: the first row's.
  const schedule = useMemo(() => {
    const stages = reduce ? 1 : (prepared?.stages ?? 1);
    if (!pacing) return MorphPacing.even(duration, stages);
    if (stages <= 1) return new MorphPacing([0], [pacing.lengths[0] ?? duration]);
    return new MorphPacing(pacing.starts.slice(0, stages), pacing.lengths.slice(0, stages));
  }, [reduce, prepared, pacing, duration]);

  useEffect(() => {
    if (frozen !== null) return;
    let id = 0;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if ((time - started) / 1000 < schedule.total) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    // The end comes even where frames are not drawn (a hidden window): then it is the typeset line.
    const end = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, started + schedule.total * 1000 - Date.now()) + 30,
    );
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(end);
    };
  }, [started, schedule, frozen]);

  const seconds = frozen !== null ? Math.min(Math.max(frozen, 0), 1) * schedule.total : (now - started) / 1000;
  const label = latexToSpoken(to);
  if (seconds >= schedule.total && prepared !== undefined) return <MathView latex={to} display className={className} />;

  let content: ReactNode = null;
  if (prepared) {
    const { drawn, strikes } = frame(prepared, seconds, schedule);
    const { laid } = prepared;
    content = (
      <>
        {drawn.map((item) => (
          <Piece key={item.key} drawn={item} />
        ))}
        {strikes.length > 0 && (
          <svg className="morph-strikes" width={laid.width} height={laid.extent} aria-hidden="true">
            {strikes.map(({ key, piece, lift, drawn: share, opacity }) => {
              const y = piece.y + lift + piece.baseline - piece.height * 0.28;
              return (
                <path
                  key={key}
                  d={`M ${piece.x - 2} ${y + 2} L ${piece.x + piece.width + 2} ${y - 2}`}
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset={1 - share}
                  opacity={opacity}
                />
              );
            })}
          </svg>
        )}
      </>
    );
  } else if (prepared === null) {
    // One after the other: the old line is gone before the new one shows, never both at once.
    const t = schedule.stageTime(seconds, 0);
    const source = EquationMorph.lastRow(from);
    const shift = (amount: number) => (reduce ? undefined : `translateY(${amount * 1.21}em)`);
    content = (
      <span className="morph-cross">
        {source.trim() !== "" && MorphTiming.outgoing(t) > 0 && (
          <span style={{ opacity: MorphTiming.outgoing(t), transform: shift(MorphTiming.lift(t)) }}>
            <MathView latex={source} display />
          </span>
        )}
        <span style={{ opacity: MorphTiming.incoming(t), transform: shift(MorphTiming.rise(t)) }}>
          <MathView latex={to} display />
        </span>
      </span>
    );
  }
  return (
    <span className={`${className ?? ""} morph-host`} role="math" aria-label={label}>
      <span
        ref={host}
        className="morph-frame"
        style={prepared ? { width: prepared.laid.width, height: prepared.laid.extent } : undefined}
      >
        {content}
      </span>
    </span>
  );
}

const latexToSpoken = (latex: string) => LatexText.unicode(latex);
