// Port of LearnLayer/Problems/PrereadPlan.swift and LearnLayer/Anywhere/DocumentPreread.swift @ ref 2026-11-04.
//
// Reads a PDF's questions ahead of any click, so a click finds them ready. What is read and in what order is the
// plan's: the whole of a short test, else the pages in view and their neighbours, following them; pages in view
// first. On the Mac each question whose text layer can't be shown is also read from its picture (a paid call, capped
// per PDF); on Windows a PDF's question is shown as the page itself (pdf.js), so the reading ahead is the page's text
// and its questions, free. The cloud step stays as a hook (`readItem`) under the same budget (see docs/DECISOES.md).

import type { PageText } from "../pdf/page";
import { questionsOn, type ExamQuestion } from "../problems/questionDetector";

export type PrereadScope = "document" | "window";

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const keywordPatterns: [string, RegExp][] = [
  ["exame", /\bexames?\b/u],
  ["teste", /\btestes?\b/u],
  ["cotacao", /\bcotac(ao|oes)\b/u],
  ["val", /\bval\./u],
  ["duracao", /\bduracao\b/u],
  ["grupo", /\bgrupo\b/u],
  ["questao", /\bquest(ao|oes)\b/u],
];

export const PrereadPlan = {
  /** Longer than this and the PDF is never read whole: a book or a set of notes, not a test. */
  maxPages: 12,
  /** Pages on each side of the ones in view that are read when the PDF is not read whole. */
  neighbours: 1,
  /** Questions per page from which a short PDF is a test even with no keyword. */
  testDensity: 4,
  /** Distinct test words from which a short PDF is a test. */
  minKeywords: 2,
  /** Cloud calls and dollars one PDF may spend on reading ahead, per launch. */
  maxCalls: 40,
  maxCost: 0.05,

  /** The whole document only if it has at most `maxPages` pages and looks like a test; else the window in view. */
  scope(pageCount: number, pageTexts: readonly string[], questionCounts: readonly number[]): PrereadScope {
    if (pageCount <= 0 || pageCount > PrereadPlan.maxPages) return "window";
    return PrereadPlan.looksLikeTest(pageTexts, questionCounts, pageCount) ? "document" : "window";
  },

  /** A test's words (at least `minKeywords` of them), or many numbered questions per page. */
  looksLikeTest(pageTexts: readonly string[], questionCounts: readonly number[], pageCount: number): boolean {
    if (PrereadPlan.keywords(pageTexts.join("\n")).size >= PrereadPlan.minKeywords) return true;
    const questions = questionCounts.reduce((sum, count) => sum + count, 0);
    return pageCount > 0 && questions / pageCount >= PrereadPlan.testDensity;
  },

  /** The test words found in `text`, folded (no case, no accents), each counted once. */
  keywords(text: string): Set<string> {
    const folded = fold(text);
    return new Set(keywordPatterns.filter(([, pattern]) => pattern.test(folded)).map(([name]) => name));
  },

  /** The pages to read, in order: those in view, then outward from them, one step after then one before; the whole
   * document for "document", up to `neighbours` steps for "window". With none in view, the first page stands in. */
  order(pageCount: number, visible: readonly number[], scope: PrereadScope): number[] {
    if (pageCount <= 0) return [];
    const seen = new Set<number>();
    let out = visible.filter((page) => page >= 0 && page < pageCount && !seen.has(page) && seen.add(page));
    if (out.length === 0) {
      out = [0];
      seen.add(0);
    }
    const low = Math.min(...out);
    const high = Math.max(...out);
    const reach = scope === "document" ? pageCount : PrereadPlan.neighbours;
    for (let step = 1; step <= Math.max(reach, 1); step += 1) {
      for (const page of [high + step, low - step]) {
        if (page >= 0 && page < pageCount && !seen.has(page)) {
          seen.add(page);
          out.push(page);
        }
      }
    }
    return out;
  },

  /** Whether one more question may be read: the PDF's recorded calls, plus those on their way, under `maxCalls`, and
   * its recorded cost under `maxCost`. */
  allows(calls: number, inFlight: number, cost: number): boolean {
    return calls + inFlight < PrereadPlan.maxCalls && cost < PrereadPlan.maxCost;
  },
};

/** A PDF as the reading ahead sees it: its pages' text, read as they are asked for. */
export interface PrereadDocument {
  /** Identifies the file (its path), for what it has spent in this launch. */
  id: string;
  pageCount: number;
  page(index: number): Promise<PageText>;
}

export interface PrereadReport {
  scope: PrereadScope | null;
  pageCount: number;
  pages: number;
  questions: number;
  items: number;
  accepted: number;
  cloudCalls: number;
  cost: number;
  stoppedByBudget: boolean;
}

/** One question read from its picture ahead of a click: whether a reading was accepted, and what it cost. */
export type ReadItem = (
  question: ExamQuestion,
  page: PageText,
) => Promise<{ accepted: boolean; calls: number; cost: number } | null>;

/** What each PDF has spent reading ahead in this launch: a PDF read again goes on from what it already spent. */
const spends = new Map<string, { calls: number; cost: number }>();

export class DocumentPreread {
  /** Questions read at once. */
  static readonly width = 2;

  readonly report: PrereadReport = {
    scope: null,
    pageCount: 0,
    pages: 0,
    questions: 0,
    items: 0,
    accepted: 0,
    cloudCalls: 0,
    cost: 0,
    stoppedByBudget: false,
  };
  /** The questions found on each page read, for the click to take at once. */
  readonly questions = new Map<number, ExamQuestion[]>();
  private plan: number[] = [];
  private readonly started = new Set<number>();
  private visible: number[] = [];
  private running: Promise<void> | null = null;
  private cancelled = false;

  constructor(
    readonly document: PrereadDocument,
    private readonly readItem: ReadItem | null = null,
  ) {}

  /** Starts reading, from the pages in view; once only. */
  start(visible: readonly number[]): Promise<void> {
    if (this.running || this.report.scope !== null || this.cancelled) return this.running ?? Promise.resolve();
    this.visible = [...visible];
    this.running = this.survey().then(() => this.pump());
    return this.running;
  }

  /** The pages in view changed: those come next, and, when the PDF is not read whole, the window moves with them. */
  follow(visible: readonly number[]): Promise<void> {
    if (this.cancelled || visible.length === 0 || visible.join() === this.visible.join())
      return this.running ?? Promise.resolve();
    this.visible = [...visible];
    const scope = this.report.scope;
    if (scope === null) return this.running ?? Promise.resolve();
    this.plan = PrereadPlan.order(this.document.pageCount, visible, scope);
    if (this.running || !this.plan.some((page) => !this.started.has(page))) return this.running ?? Promise.resolve();
    this.running = this.pump();
    return this.running;
  }

  /** The PDF closed, or another came to the front: nothing more is started. */
  cancel(): void {
    this.cancelled = true;
  }

  /** Waits for the reading started now to end. */
  async finished(): Promise<PrereadReport> {
    while (this.running) await this.running;
    return this.report;
  }

  private async survey(): Promise<void> {
    const count = this.document.pageCount;
    let scope: PrereadScope = "window";
    // A long PDF is never read whole: its pages' text is not even looked at.
    if (count <= PrereadPlan.maxPages) {
      const pages = await Promise.all(Array.from({ length: count }, (_, index) => this.document.page(index)));
      scope = PrereadPlan.scope(
        count,
        pages.map((page) => page.text),
        pages.map((page) => this.found(page).length),
      );
    }
    this.report.scope = scope;
    this.report.pageCount = count;
    this.plan = PrereadPlan.order(count, this.visible, scope);
  }

  private found(page: PageText): ExamQuestion[] {
    let questions = this.questions.get(page.index);
    if (!questions) {
      questions = questionsOn(page);
      this.questions.set(page.index, questions);
    }
    return questions;
  }

  private async pump(): Promise<void> {
    const spend = spends.get(this.document.id) ?? { calls: 0, cost: 0 };
    spends.set(this.document.id, spend);
    const reads = new Set<Promise<void>>();
    try {
      for (let index = this.nextPage(); index !== null && !this.cancelled; index = this.nextPage()) {
        const page = await this.document.page(index);
        const questions = this.found(page);
        this.report.pages += 1;
        this.report.questions += questions.length;
        if (!this.readItem) continue;
        for (const question of questions) {
          if (reads.size >= DocumentPreread.width) await Promise.race(reads);
          if (this.cancelled) return;
          if (!PrereadPlan.allows(spend.calls, reads.size, spend.cost)) {
            this.report.stoppedByBudget = true;
            return;
          }
          const read: Promise<void> = this.readItem(question, page).then((outcome) => {
            if (!outcome) return;
            this.report.items += 1;
            if (outcome.accepted) this.report.accepted += 1;
            spend.calls += outcome.calls;
            spend.cost += outcome.cost;
            this.report.cloudCalls += outcome.calls;
            this.report.cost += outcome.cost;
          });
          const tracked = read.finally(() => reads.delete(tracked));
          reads.add(tracked);
        }
      }
    } finally {
      await Promise.all(reads);
      this.running = null;
      // Pages that came into view while the last ones were read.
      if (!this.cancelled && !this.report.stoppedByBudget && this.plan.some((page) => !this.started.has(page))) {
        this.running = this.pump();
      }
    }
  }

  private nextPage(): number | null {
    const page = this.plan.find((index) => !this.started.has(index));
    if (page === undefined) return null;
    this.started.add(page);
    return page;
  }

  /** Tests: forget what every PDF spent (a new launch). */
  static resetSpendsForTesting(): void {
    spends.clear();
  }
}
