// The Memory section: the questions and concepts the student met, from `memory.json` (the Mac's BrainScreen draws
// sample data, BrainSampleData; CLAUDE.md asks for the real MemoryStore here). A map of concepts, sized by how often
// they came up, and a list by document. A question can be forgotten.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { MemoryNode, MemoryStore } from "@core/memory/memory";
import { SettingsButton, SettingsGroup, SettingsPage, SettingsRow } from "../../../components/settings/SettingsKit";
import { useT } from "../../../i18n";
import { memoryStore } from "../../../memory/memory";

interface Question {
  id: string;
  text: string;
  document: string;
  page: number;
  createdAt: number;
  concepts: string[];
}

interface Concept {
  id: string;
  name: string;
  area: string;
  questions: Question[];
}

const data = (node: MemoryNode): Record<string, unknown> => {
  try {
    return JSON.parse(node.data) as Record<string, unknown>;
  } catch {
    return {};
  }
};

function readMemory(store: MemoryStore): { questions: Question[]; concepts: Concept[] } {
  const nodes = store.liveNodes;
  const edges = store.liveEdges;
  const byID = new Map(nodes.map((node) => [node.id, node]));
  const questions: Question[] = nodes
    .filter((node) => node.kind === "question")
    .map((node) => {
      const fields = data(node);
      return {
        id: node.id,
        text: String(fields.text ?? ""),
        document: String(fields.document ?? ""),
        page: typeof fields.page === "number" ? fields.page : -1,
        createdAt: node.createdAt,
        concepts: edges.filter((edge) => edge.src === node.id && edge.type === "asked_about").map((edge) => edge.dst),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const concepts = new Map<string, Concept>();
  for (const question of questions) {
    for (const id of question.concepts) {
      const node = byID.get(id);
      if (!node) continue;
      const fields = data(node);
      const concept = concepts.get(id) ?? {
        id,
        name: String(fields.name ?? ""),
        area: String(fields.area ?? ""),
        questions: [],
      };
      concept.questions.push(question);
      concepts.set(id, concept);
    }
  }
  return { questions, concepts: [...concepts.values()].sort((a, b) => b.questions.length - a.questions.length) };
}

/** A calm, deterministic layout: concepts on a spiral, the most asked at the centre. */
function layout(concepts: Concept[], width: number, height: number) {
  const centre = { x: width / 2, y: height / 2 };
  const golden = Math.PI * (3 - Math.sqrt(5));
  const spread = Math.min(width, height) / 2 - 40;
  return concepts.map((concept, index) => {
    const radius = concepts.length <= 1 ? 0 : spread * Math.sqrt((index + 0.5) / concepts.length);
    const angle = index * golden;
    return {
      concept,
      x: centre.x + radius * Math.cos(angle),
      y: centre.y + radius * Math.sin(angle),
      r: 6 + Math.min(18, Math.sqrt(concept.questions.length) * 6),
    };
  });
}

export function MemoryPane() {
  const t = useT();
  const [store, setStore] = useState<MemoryStore | null>(null);
  const [presentation, setPresentation] = useState<"map" | "list">("map");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    void memoryStore().then(setStore);
  }, []);
  const version = useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => {}),
    () => store?.version ?? -1,
  );
  // `version` changes when the memory does: the map is read again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memory = useMemo(() => (store ? readMemory(store) : { questions: [], concepts: [] }), [store, version]);
  const folded = query.trim().toLowerCase();
  const questions = folded
    ? memory.questions.filter((question) => question.text.toLowerCase().includes(folded))
    : memory.questions;
  const concepts = folded
    ? memory.concepts.filter(
        (concept) =>
          concept.name.toLowerCase().includes(folded) || concept.questions.some((q) => questions.includes(q)),
      )
    : memory.concepts;
  const documents = new Map<string, Question[]>();
  for (const question of questions) {
    const key = question.document || "—";
    documents.set(key, [...(documents.get(key) ?? []), question]);
  }
  const chosen = concepts.find((concept) => concept.id === selected) ?? null;
  const placed = layout(concepts, 640, 380);

  return (
    <SettingsPage
      title={t("Memory")}
      subtitle={t(
        "%lld documents · %lld questions",
        [...documents.keys()].filter((name) => name !== "—").length,
        memory.questions.length,
      )}
    >
      <div className="memory-toolbar">
        <input
          type="search"
          className="memory-search"
          placeholder={t("Search memory")}
          aria-label={t("Search memory")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="memory-switch" role="tablist">
          {(["map", "list"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={presentation === mode}
              onClick={() => setPresentation(mode)}
            >
              {mode === "map" ? t("Map") : t("List")}
            </button>
          ))}
        </div>
      </div>
      {memory.questions.length === 0 ? (
        <SettingsGroup>
          <SettingsRow title={t("No questions yet.")} detail={t("Your memory starts with the first question.")} />
        </SettingsGroup>
      ) : questions.length === 0 ? (
        <SettingsGroup>
          <SettingsRow title={t("No question matches “%@”", query)} />
        </SettingsGroup>
      ) : presentation === "map" ? (
        <div className="memory-map-holder">
          <svg className="memory-map" viewBox="0 0 640 380" role="img" aria-label={t("Map")}>
            {placed.map(({ concept, x, y, r }) => (
              <g
                key={concept.id}
                className={`memory-node memory-area-${concept.area || "math"}${selected === concept.id ? " selected" : ""}`}
                onClick={() => setSelected(selected === concept.id ? null : concept.id)}
                role="button"
                tabIndex={0}
                aria-label={`${concept.name}, ${t("%lld questions", concept.questions.length)}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setSelected(concept.id);
                }}
              >
                <circle cx={x} cy={y} r={r} />
                <text x={x} y={y + r + 13} textAnchor="middle">
                  {concept.name.length > 22 ? concept.name.slice(0, 21) + "…" : concept.name}
                </text>
              </g>
            ))}
          </svg>
          <p className="memory-legend">{t("Size · questions")}</p>
          {chosen && (
            <SettingsGroup header={chosen.name}>
              {chosen.questions.map((question) => (
                <QuestionRow key={question.id} question={question} onForget={() => store?.delete(question.id)} />
              ))}
            </SettingsGroup>
          )}
        </div>
      ) : (
        [...documents.entries()].map(([name, list]) => (
          <SettingsGroup key={name} header={name === "—" ? t("Questions") : name}>
            {list.map((question) => (
              <QuestionRow key={question.id} question={question} onForget={() => store?.delete(question.id)} />
            ))}
          </SettingsGroup>
        ))
      )}
    </SettingsPage>
  );
}

function QuestionRow({ question, onForget }: { question: Question; onForget: () => void }) {
  const t = useT();
  const when = new Date(question.createdAt * 1000).toLocaleDateString();
  return (
    <SettingsRow
      title={question.text.length > 140 ? question.text.slice(0, 139) + "…" : question.text}
      detail={question.page >= 0 ? `${when} · p. ${question.page + 1}` : when}
    >
      <SettingsButton onClick={onForget}>{t("Forget")}</SettingsButton>
    </SettingsRow>
  );
}
