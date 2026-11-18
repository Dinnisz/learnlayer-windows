// Talking to the tutor on the stage (the Mac's VoiceTutorSession @ ref 2026-11-04): hold the talk key (or the
// microphone button), speak, let go. What was said is transcribed, a recorded opener is said at once ("Vamos ao ponto
// 2."), and the tutor's answer is spoken with its marks lit on the words they stand before.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { TutorLanguage } from "@core/problems/solutionRequest";
import type { QuestionSession } from "@core/problems/questionSession";
import { SpeechToText } from "@core/voice/speechToText";
import { VoiceLocale } from "@core/voice/speechPlan";
import {
  combineDirectives,
  pointingDirective,
  stepDetail,
  StepRequests,
  VoiceTutorOpener,
} from "@core/voice/voiceTutorOpener";
import { ConceptSlug, type MemoryStore } from "@core/memory/memory";
import { memoryStore } from "../memory/memory";
import { VoiceTutorPrompt, VoiceTutorRouting } from "@core/voice/voiceTutorPrompt";
import { VoiceTutorReplies, type DrawingCommand, type VoiceTutorReply } from "@core/voice/voiceTutorReply";
import { VoiceFormula } from "@core/voice/voiceFormula";
import { VoiceTutorGuard } from "@core/voice/voiceTutorGuard";
import { voiceSend, voiceTurn } from "@core/voice/voiceTurn";
import { workContext } from "@core/voice/workContext";
import { modelClient, usesMock } from "../ai/solver";
import { publishIsland } from "../island";
import { onTalkKey } from "../native";
import { Recorder } from "./recorder";
import { playOpener, speak, tutorLanguage } from "./speaker";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

export interface VoiceState {
  phase: VoicePhase;
  /** What the student said, once transcribed. */
  heard: string | null;
  /** The marks lit now, on the words being said. */
  lit: DrawingCommand[];
  /** The formula the answer is drawn on (`VoiceFormula.presentedFormula`), shown once its first mark lights. */
  formula: string | null;
  /** A one-time note ("the paid voice isn't available…"), a catalog key. */
  notice: string | null;
  /** The answer as text, shown while it would be said when no voice here can say it. */
  shown: string | null;
  level: number;
}

const idle: VoiceState = { phase: "idle", heard: null, lit: [], formula: null, notice: null, shown: null, level: 0 };

export const VoiceContext = createContext<VoiceState>(idle);
export const useVoiceState = () => useContext(VoiceContext);

/** The Mac's mock reply: one sentence and a circle on "a", for working without the API. */
const mockReply = '{"opening":null,"drawing":[{"op":"circle","term":"a"}],"spoken":"A letra [[0]]a é o coeficiente."}';

let memory: MemoryStore | null = null;
void memoryStore().then((store) => (memory = store));

/** One spoken turn about the open question: the system prompt, the message and the model, as the Mac asks them. */
async function reply(session: QuestionSession, transcript: string, signal: AbortSignal): Promise<VoiceTutorReply> {
  const part = session.part;
  const step = StepRequests.parse(transcript);
  const cards = part?.cards ?? [];
  const lines = cards.length > 0 ? cards.map((card) => card.title) : (part?.steps ?? []);
  const index = step ? StepRequests.index(step, lines.length) : null;
  // "Explica o ponto 1": the mascot, the underlines and the figure go to that step alone.
  session.stopGuide();
  if (index !== null) session.focusStepForVoice(index);
  if (usesMock()) return VoiceTutorReplies.decode(mockReply);
  const language = tutorLanguage();
  // The step asked about, and how the plan read from memory wants the explanation to point (`voiceDirective`).
  const hasFigure = session.solution?.figure != null;
  const plan = memory?.plan({
    question: session.question.groupText,
    kind: "exercise",
    area: ConceptSlug.area(session.routeSubject ?? ""),
    concept: ConceptSlug.make(session.question.groupText),
    utterance: session.question.groupText,
    usesVoice: true,
  });
  const directive = combineDirectives([
    index !== null ? stepDetail(index + 1, lines.length, lines[index]!, hasFigure) : null,
    pointingDirective(plan?.pointer ?? false, hasFigure, language.startsWith("en")),
  ]);
  const work = session.solution
    ? workContext({
        label: session.question.label,
        groupLabels: session.question.groupLabels,
        solution: session.solution,
        part,
        figureNote: session.figureNote,
      })
    : null;
  const user = VoiceTutorPrompt.user({
    transcript,
    question: session.statementText,
    page: "",
    subject: session.routeSubject,
    questionLabel: session.question.label,
    workContext: work,
    focus: { kind: "openItem" },
    directive,
  });
  const system = VoiceTutorPrompt.system(VoiceLocale.promptLanguage(TutorLanguage.locale(language)));
  const client = modelClient({ model: VoiceTutorRouting.modelID(session.route === "strong") });
  const answer = await voiceTurn(user, voiceSend(client, system, signal), language);
  // Checked against what is on screen (`VoiceTutorProvider.completed`): a curve of a function the steps never use is
  // not drawn; what looks invented is logged, never shown.
  const sources = [session.statementText, work ?? "", transcript].join("\n");
  const issues = VoiceTutorGuard.issues(answer.spoken, sources);
  if (issues.length > 0) console.info(`voice reply issues: ${issues.join("; ")}`);
  // Then, as the Mac's `completed`: unlit marks out, the formula that holds the symbol, and "fórmula" underlining it.
  const kept = VoiceTutorReplies.droppingUnlitMarks(VoiceTutorGuard.droppingUnusedPlots(answer, sources));
  const context = VoiceFormula.holdingTheSymbol(kept, session.statementText, "");
  return VoiceFormula.namingTheFormula(kept, `${transcript}\n${session.statementText}`, context);
}

/** Owns the voice of one stage: listening while the key is held, then the answer with its marks. */
export function useVoiceTutor(session: QuestionSession | null) {
  const [state, setState] = useState<VoiceState>(idle);
  const recorder = useRef<Recorder | null>(null);
  const turn = useRef<AbortController | null>(null);
  const variant = useRef(0);
  const levels = useRef<number[]>([]);

  const update = useCallback((change: Partial<VoiceState>) => {
    setState((current) => {
      const next = { ...current, ...change };
      if (change.level !== undefined) levels.current = [...levels.current.slice(-4), change.level];
      void publishIsland({
        listening: next.phase === "listening",
        speaking: next.phase === "speaking",
        levels: levels.current,
      });
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    turn.current?.abort();
    turn.current = null;
    void recorder.current?.stop();
    recorder.current = null;
    update({ ...idle });
  }, [update]);

  /** The key is held: listen (anything still being said stops). */
  const begin = useCallback(async () => {
    if (!session || recorder.current) return;
    turn.current?.abort();
    const next = new Recorder();
    recorder.current = next;
    update({ ...idle, phase: "listening" });
    if (!(await next.start((level) => update({ level })))) {
      // Working without the API (mocks), a turn goes on with no microphone: the mock hears «Explica-me».
      if (usesMock()) return;
      recorder.current = null;
      update({
        ...idle,
        notice: "LearnLayer needs the microphone. Allow it in System Settings › Privacy & Security › Microphone.",
      });
    }
  }, [session, update]);

  /** The key is let go: what was said is sent at once. */
  const end = useCallback(async () => {
    const listening = recorder.current;
    recorder.current = null;
    if (!session || !listening) return;
    const wav = await listening.stop();
    if (!wav && !usesMock()) {
      update({ ...idle });
      return;
    }
    const controller = new AbortController();
    turn.current = controller;
    update({ phase: "thinking", level: 0 });
    const language = tutorLanguage();
    try {
      const transcript = usesMock()
        ? "Explica-me"
        : await SpeechToText.transcribe(modelClient({ model: SpeechToText.model }), wav!, language, controller.signal);
      if (controller.signal.aborted) return;
      if (transcript === "") {
        update({ ...idle });
        return;
      }
      update({ heard: transcript });
      // The opener is said while the answer is written: recorded, so nothing is bought to say it.
      const line = VoiceTutorOpener.lineFor(transcript, session.question.text, variant.current++, language);
      const opener = line
        ? playOpener(VoiceTutorOpener.clipName(line, language), { signal: controller.signal })
        : Promise.resolve(false);
      const answer = await reply(session, transcript, controller.signal);
      const saidOpener = await opener;
      if (controller.signal.aborted) return;
      // The app already said its own opener: the model's is left out; else it is said first, in the same voice.
      const ready = VoiceTutorReplies.droppingUnlitMarks(
        saidOpener ? { ...answer, opening: null } : VoiceTutorReplies.speakingTheOpening(answer),
      );
      // The formula that holds the symbol explained, from the question, when the answer writes none.
      const question = session.statementText;
      const context = VoiceFormula.holdingTheSymbol(ready, question, "");
      update({
        phase: "speaking",
        formula: VoiceFormula.presentedFormula(ready.drawing, question, ready.spoken, context),
      });
      const result = await speak(ready.spoken, {
        signal: controller.signal,
        onLevel: (level) => update({ level }),
        onProgress: (through) => {
          const lit = VoiceTutorReplies.lit(ready, through).map((index) => ready.drawing[index]!);
          update({ lit });
        },
      });
      if (controller.signal.aborted) return;
      if (result.silent) {
        // No voice here for the language: the answer is read, for as long as it takes to read it.
        update({ shown: ready.spoken });
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(20_000, Math.max(3_000, ready.spoken.length * 60))),
        );
        if (controller.signal.aborted) return;
      }
      update({ ...idle, notice: result.notice });
    } catch {
      if (!controller.signal.aborted) update({ ...idle, notice: "Couldn’t reach LearnLayer. Try again." });
    }
  }, [session, update]);

  // The talk key, wherever the student is, while this stage is open.
  useEffect(() => {
    const stopListening = onTalkKey((held) => void (held ? begin() : end()));
    return () => void stopListening.then((unlisten) => unlisten());
  }, [begin, end]);

  useEffect(() => stop, [session, stop]);

  return { state, begin, end, stop };
}
