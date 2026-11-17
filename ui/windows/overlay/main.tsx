import "katex/dist/katex.min.css";
import "../../styles/base.css";
import "../../stage/stage.css";
import "./overlay.css";
import { mount } from "../../mount";
import { OverlayWindow } from "./OverlayWindow";
import { CircuitDemo } from "./CircuitDemo";

// `?demo=circuit`: the circuit schematics alone, for working on them in a browser.
const demo = new URLSearchParams(window.location.search).get("demo");
void mount(demo === "circuit" ? <CircuitDemo /> : <OverlayWindow />);
