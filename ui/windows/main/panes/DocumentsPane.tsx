// The Documents section. The Mac's FoldersScreen (Brain/) draws sample folders (BrainSampleData, "Adding PDFs is not
// available in this prototype"); here the documents are the real ones: every PDF the student asked a question in, from
// `memory.json`, newest first or by name, with the door to the reader.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { MemoryStore } from "@core/memory/memory";
import {
  SettingsButton,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsSelect,
} from "../../../components/settings/SettingsKit";
import { useT } from "../../../i18n";
import { memoryStore } from "../../../memory/memory";
import { openReader } from "../../../native";

export interface DocumentSummary {
  name: string;
  questions: number;
  /** The last question asked in it, in Unix seconds (the memory's node stamps). */
  lastAskedAt: number;
}

/** The documents the memory knows: one per PDF a question was asked in. */
export function documentsIn(store: MemoryStore): DocumentSummary[] {
  const byName = new Map<string, DocumentSummary>();
  for (const node of store.liveNodes) {
    if (node.kind !== "question") continue;
    let name: string;
    try {
      name = String((JSON.parse(node.data) as { document?: unknown }).document ?? "");
    } catch {
      continue;
    }
    if (name === "") continue;
    // Questions saved before the fix were named «exam.pdf.pdf».
    name = name.replace(/(?:\.pdf)+$/i, ".pdf");
    const known = byName.get(name) ?? { name, questions: 0, lastAskedAt: 0 };
    known.questions += 1;
    known.lastAskedAt = Math.max(known.lastAskedAt, node.createdAt);
    byName.set(name, known);
  }
  return [...byName.values()];
}

export function DocumentsPane() {
  const t = useT();
  const [store, setStore] = useState<MemoryStore | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  useEffect(() => {
    void memoryStore().then(setStore);
  }, []);
  const version = useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => {}),
    () => store?.version ?? -1,
  );
  // `version` changes when the memory does: the list is read again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => (store ? documentsIn(store) : []), [store, version]);
  const folded = query.trim().toLowerCase();
  const shown = all
    .filter((document) => folded === "" || document.name.toLowerCase().includes(folded))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.lastAskedAt - a.lastAskedAt));

  return (
    <SettingsPage title={t("Documents")} subtitle={t("%lld documents", all.length)}>
      <SettingsGroup>
        <SettingsRow title={t("Open a PDF and click an equation or an exercise.")}>
          <SettingsButton kind="prominent" onClick={() => void openReader()}>
            {t("Open…")}
          </SettingsButton>
        </SettingsRow>
      </SettingsGroup>
      {all.length === 0 ? (
        <SettingsGroup>
          <SettingsRow
            title={t("No documents yet")}
            detail={t("Drop a PDF on this window. Questions you ask are kept in Memory.")}
          />
        </SettingsGroup>
      ) : (
        <>
          <div className="memory-toolbar">
            <input
              type="search"
              className="memory-search"
              placeholder={t("Search documents")}
              aria-label={t("Search documents")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <SettingsSelect<"recent" | "name">
              label={t("Recent")}
              value={sort}
              options={[
                { value: "recent", title: t("Recent") },
                { value: "name", title: t("Name") },
              ]}
              onChange={setSort}
            />
          </div>
          <SettingsGroup>
            {shown.length === 0 ? (
              <SettingsRow title={t("No document matches “%@”", query)} />
            ) : (
              shown.map((document) => (
                <SettingsRow
                  key={document.name}
                  symbol="doc"
                  title={document.name}
                  detail={`${t("%lld questions asked", document.questions)} · ${new Date(document.lastAskedAt * 1000).toLocaleDateString()}`}
                />
              ))
            )}
          </SettingsGroup>
        </>
      )}
    </SettingsPage>
  );
}
