// A solid, surface or region the model described by its equations (premade `solid3d`), drawn in 3D with three.js
// from the pieces the app built (core/illustrations/solidBuilder.ts), as the Mac draws them with SceneKit
// (Figure3DGeneric.swift): the outside translucent white, the hole and the walls fainter, the region, the slice and the
// curves in the one blue, the axis a plain line. Drag to turn it; with reduced motion it stands still.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { BuiltSolid, GenericPiece } from "@core/illustrations/solidBuilder";
import { GenericSolidBuilder } from "@core/illustrations/solidBuilder";
import type { GenericSolid } from "@core/illustrations/solid";
import { solidPartOpacity, sweepOpacity, sweepSeconds, type StepFigureHooks } from "@core/illustrations/figureSteps";
import "./figures.css";

const accent = 0x0a84ff;

function material(look: GenericPiece["look"]): THREE.Material {
  switch (look) {
    case "surface":
      return new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    case "inner":
      return new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    case "accentFace":
      return new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    case "accentLine":
      return new THREE.LineBasicMaterial({ color: accent });
    case "line":
      return new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  }
}

/** The three.js objects of the pieces, each named after its piece; the travelling slices start hidden (a step that
 * writes the volume's integral sends them along [a, b]). */
function objects(built: BuiltSolid): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const named = (object: THREE.Object3D, name: string) => {
    object.name = name;
    object.userData.opacity = ((object as THREE.Mesh).material as THREE.Material & { opacity: number }).opacity;
    if (name === GenericSolidBuilder.sweep) object.visible = false;
    return object;
  };
  for (const part of built.pieces) {
    if (part.mesh) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          part.mesh.positions.flatMap((p) => p.map((value) => (Number.isFinite(value) ? value : 0))),
          3,
        ),
      );
      geometry.setIndex(part.mesh.indices);
      geometry.computeVertexNormals();
      out.push(named(new THREE.Mesh(geometry, material(part.look)), part.name));
    }
    if (part.line.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(part.line.map((p) => new THREE.Vector3(...p)));
      out.push(named(new THREE.Line(geometry, material(part.look)), part.name));
    }
  }
  for (const axis of built.axes) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...axis.start),
      new THREE.Vector3(...axis.end),
    ]);
    out.push(
      new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })),
    );
  }
  return out;
}

export function SolidView({
  solid,
  caption,
  height = 300,
  highlight = null,
  assembleStep = null,
}: {
  solid: GenericSolid;
  caption?: string;
  height?: number;
  /** The parts the step in focus works with (Figure3DSteps, or the card's figureHighlight): they stand out, the others
   * dim; "sweep" sends the slice along [a, b]. */
  highlight?: string | null;
  /** How many parts are shown, in assembly order (the card's assembleStep); null shows them all. */
  assembleStep?: number | null;
}) {
  const holder = useRef<HTMLDivElement>(null);
  /** The step's hooks and when they changed (the slice travels from then; set on mount by the effect below). */
  const hooks = useRef<{ value: StepFigureHooks; since: number }>({
    value: { highlight, assembleStep },
    since: 0,
  });
  useEffect(() => {
    hooks.current = { value: { highlight, assembleStep }, since: performance.now() };
  }, [highlight, assembleStep]);

  useEffect(() => {
    const element = holder.current;
    const built = GenericSolidBuilder.build(solid);
    if (!element || !built) return;
    const order = GenericSolidBuilder.order(built);
    const width = element.clientWidth || 420;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    element.appendChild(renderer.domElement);
    const sceneRoot = new THREE.Scene();
    const figure = new THREE.Group();
    const parts = objects(built);
    for (const object of parts) figure.add(object);
    sceneRoot.add(figure);
    sceneRoot.add(new THREE.AmbientLight(0xffffff, 1.4));
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    light.position.set(3, 5, 6);
    sceneRoot.add(light);
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 1.6, 9);
    camera.lookAt(0, 0, 0);
    // A three-quarter view, as the Mac opens it.
    let yaw = -0.6;
    let pitch = 0.35;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dragging = false;
    let last = { x: 0, y: 0 };
    let frame = 0;
    let idle = 0;
    let previous = performance.now();
    const named = parts.filter((object) => object.name !== "");
    const slices = named.filter((object) => object.name === GenericSolidBuilder.sweep);
    // Each part's share of its drawn opacity, eased toward the step's (0.35 s; at once with reduced motion).
    const shown = new Map<THREE.Object3D, number>(named.map((object) => [object, slices.includes(object) ? 0 : 1]));
    const paint = (object: THREE.Object3D, share: number) => {
      const material = (object as THREE.Mesh).material as THREE.Material & { opacity: number };
      material.transparent = true;
      material.opacity = ((object.userData.opacity as number | undefined) ?? 1) * share;
      object.visible = share > 0.01;
    };
    const draw = (now: number) => {
      const { value, since } = hooks.current;
      const elapsed = (now - since) / 1000;
      const ease = reduced ? 1 : Math.min(1, (now - previous) / 350);
      previous = now;
      for (const object of named) {
        let target = solidPartOpacity(object.name, order, value);
        if (target === null) {
          if (object.name === GenericSolidBuilder.sweep) {
            // The slice's own timing; it is painted as computed, not eased.
            const share = sweepOpacity(slices.indexOf(object), slices.length, elapsed, reduced);
            shown.set(object, share);
            paint(object, share);
            continue;
          }
          // The solid fills in behind the travelling slice.
          target = reduced ? 1 : 0.15 + 0.85 * Math.min(1, elapsed / sweepSeconds);
          shown.set(object, target);
          paint(object, target);
          continue;
        }
        const current = shown.get(object) ?? 1;
        const next = current + (target - current) * ease;
        shown.set(object, next);
        paint(object, next);
      }
      figure.rotation.set(pitch, yaw, 0);
      renderer.render(sceneRoot, camera);
    };
    const tick = (now: number) => {
      // It turns slowly by itself until the student takes it.
      if (!dragging && !reduced && idle < 1) yaw += 0.003;
      draw(now);
      frame = requestAnimationFrame(tick);
    };
    const down = (event: PointerEvent) => {
      dragging = true;
      idle = 1;
      last = { x: event.clientX, y: event.clientY };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      yaw += (event.clientX - last.x) * 0.01;
      pitch = Math.max(-1.2, Math.min(1.2, pitch + (event.clientY - last.y) * 0.01));
      last = { x: event.clientX, y: event.clientY };
    };
    const up = () => {
      dragging = false;
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      figure.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      element.removeChild(renderer.domElement);
    };
  }, [solid, height]);

  return (
    <figure className="solid-figure">
      <div ref={holder} className="solid-canvas" style={{ height }} role="img" aria-label={caption ?? "3D"} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
