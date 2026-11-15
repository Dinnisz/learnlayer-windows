// The steps on screen said one by one, each lit while it is said: what «Explica-me» falls back on when no lesson can
// be made (no session, offline), as the Mac's `readSteps` does, and the lesson the app plays with mocks.

import type { MascotLesson } from "./mascotLesson";

/** A lesson that walks the written solution: one beat per "Step N:" line of the work, its "Why" said after it. */
export function lessonFromWork(work: string | null): MascotLesson {
  const beats: MascotLesson["beats"] = [];
  let answer: string | null = null;
  for (const line of (work ?? "").split("\n")) {
    const step = /^Step (\d+): (.*)$/u.exec(line);
    if (step) {
      beats.push({ kind: "explain", say: step[2]!.trim(), show: [{ op: "highlight", step: Number(step[1]) }] });
      continue;
    }
    const why = /^ {2}Why: (.*)$/u.exec(line);
    const last = beats[beats.length - 1];
    if (why && last) last.say = `${last.say}. ${why[1]!.trim()}`.replace(/\.\.\s/gu, ". ");
    const said = /^Answer: (.*)$/u.exec(line);
    if (said) answer = said[1]!.trim();
  }
  return { beats, summary: answer ? { say: answer, key: null } : null };
}
