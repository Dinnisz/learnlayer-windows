import "katex/dist/katex.min.css";
import "../../styles/base.css";
import "./reader.css";
import "../../stage/stage.css";
import { mount } from "../../mount";
import { Stage } from "../../stage/Stage";
import { ReaderWindow } from "./ReaderWindow";

void mount(
  <ReaderWindow
    renderOverlay={(document, opened, close) => (
      <Stage key={`${opened.pageIndex}:${opened.question.label}`} document={document} opened={opened} close={close} />
    )}
  />,
);
