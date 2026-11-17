// A solid, surface or region the model described by its equations (premade `solid3d`), drawn in 3D with three.js
// from the pieces the app built (core/illustrations/solidBuilder.ts), as the Mac draws them with SceneKit
// (Figure3DGeneric.swift): the outside translucent white, the hole and the walls fainter, the region, the slice and the
// curves in the one blue, the axis a plain line. Drag to turn it; with reduced motion it stands still.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { BuiltSolid, GenericPiece } from "@core/illustrations/solidBuilder";
import { GenericSolidBuilder } from "@core/illustrations/solidBuilder";
import type { GenericSolid } from "@core/illustrations/solid";
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

/** The three.js objects of the pieces a step shows (not the travelling slices). */
function objects(built: BuiltSolid): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const part of built.pieces) {
    if (part.name === GenericSolidBuilder.sweep) continue;
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
      out.push(new THREE.Mesh(geometry, material(part.look)));
    }
    if (part.line.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(part.line.map((p) => new THREE.Vector3(...p)));
      out.push(new THREE.Line(geometry, material(part.look)));
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
}: {
  solid: GenericSolid;
  caption?: string;
  height?: number;
}) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = holder.current;
    const built = GenericSolidBuilder.build(solid);
    if (!element || !built) return;
    const width = element.clientWidth || 420;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    element.appendChild(renderer.domElement);
    const sceneRoot = new THREE.Scene();
    const figure = new THREE.Group();
    for (const object of objects(built)) figure.add(object);
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
    const draw = () => {
      figure.rotation.set(pitch, yaw, 0);
      renderer.render(sceneRoot, camera);
    };
    const tick = () => {
      // It turns slowly by itself until the student takes it.
      if (!dragging && !reduced && idle < 1) yaw += 0.003;
      draw();
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
