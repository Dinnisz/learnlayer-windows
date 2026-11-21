import "katex/dist/katex.min.css";
import "../../styles/base.css";
import "../../dragScroll";
import { installSprings } from "../../styles/springs";
import "../../stage/stage.css";
import "./overlay.css";
import { mount } from "../../mount";
import { OverlayWindow } from "./OverlayWindow";
import { AnimatedDemo, CircuitDemo } from "./CircuitDemo";
import { MorphDemo } from "./MorphDemo";

installSprings();

// `?demo=circuit`: the circuit schematics alone, for working on them in a browser.
const demo = new URLSearchParams(window.location.search).get("demo");
void mount(
  demo === "circuit" ? (
    <CircuitDemo />
  ) : demo === "animated" ? (
    <AnimatedDemo />
  ) : demo === "morph" ? (
    <MorphDemo />
  ) : (
    <OverlayWindow />
  ),
);
