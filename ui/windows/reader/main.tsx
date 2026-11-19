import "katex/dist/katex.min.css";
import "../../styles/base.css";
import { installSprings } from "../../styles/springs";
import "./reader.css";
import "../../stage/stage.css";
import { useMemo } from "react";
import { mount } from "../../mount";
import type { ReaderDocument } from "../../reader/readerDocument";
import { Stage } from "../../stage/Stage";
import { ReaderWindow, type OpenedQuestion } from "./ReaderWindow";

installSprings();

/** The stage over the reader: one source per opened question, so the session is made once. */
function ReaderStage({
  document,
  opened,
  close,
}: {
  document: ReaderDocument;
  opened: OpenedQuestion;
  close: () => void;
}) {
  const source = useMemo(() => ({ kind: "pdf" as const, document, opened }), [document, opened]);
  return <Stage source={source} close={close} />;
}

void mount(
  <ReaderWindow
    renderOverlay={(document, opened, close) => (
      <ReaderStage
        key={`${opened.pageIndex}:${opened.question.label}`}
        document={document}
        opened={opened}
        close={close}
      />
    )}
  />,
);
