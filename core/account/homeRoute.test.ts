// Port of LearnLayerTests/HomeRouteTests.swift @ ref 2026-11-04

import { describe, expect, it } from "vitest";
import {
  homeRoutes,
  parse,
  routeForSection,
  settingsSection,
  settingsSections,
  shortcutDigit,
  urlFor,
} from "./homeRoute";

describe("HomeRoute", () => {
  it("every route round-trips through its URL", () => {
    for (const route of homeRoutes) expect(parse(urlFor(route)), `${route} → ${urlFor(route)}`).toBe(route);
  });

  it("parses settings links", () => {
    expect(parse("learnlayer://settings/permissions")).toBe("permissions");
    expect(parse("learnlayer://settings/ai")).toBe("ai");
    expect(parse("learnlayer://settings/data")).toBe("data");
    expect(parse("learnlayer://settings/general")).toBe("general");
    expect(parse("learnlayer://settings/plan")).toBe("plan");
    expect(parse("learnlayer://settings")).toBe("general");
    expect(parse("learnlayer://settings/")).toBe("general");
  });

  it("parses the other places", () => {
    expect(parse("learnlayer://memory")).toBe("memory");
    expect(parse("learnlayer://documents")).toBe("documents");
    expect(parse("learnlayer://brain")).toBe("memory");
    expect(parse("learnlayer://topics")).toBe("documents");
    expect(parse("learnlayer://account")).toBe("account");
    expect(parse("learnlayer://today")).toBe("memory");
    expect(parse("learnlayer://reviews")).toBe("memory");
    expect(parse("learnlayer://plan")).toBe("plan");
  });

  it("the old folders name still works", () => {
    expect(parse("learnlayer://folders")).toBe("documents");
  });

  it("ignores case", () => {
    expect(parse("LearnLayer://Settings/Permissions")).toBe("permissions");
  });

  it("rejects what it does not know", () => {
    expect(parse("https://settings/permissions")).toBeNull();
    expect(parse("learnlayer://")).toBeNull();
    expect(parse("learnlayer://nowhere")).toBeNull();
    expect(parse("learnlayer://settings/nowhere")).toBeNull();
    expect(parse("learnlayer://settings/permissions/extra")).toBeNull();
    expect(parse("learnlayer://brain/extra")).toBeNull();
    // Settings pages are reached through settings/, not on their own.
    expect(parse("learnlayer://permissions")).toBeNull();
    expect(parse("learnlayer://ai")).toBeNull();
  });

  it("the routes are the eight of the plan", () => {
    expect(new Set(homeRoutes)).toEqual(
      new Set(["memory", "documents", "account", "plan", "general", "permissions", "ai", "data"]),
    );
  });

  it("every settings route matches a settings section", () => {
    for (const route of homeRoutes) {
      const section = settingsSection(route);
      if (section) expect(routeForSection(section)).toBe(route);
    }
    for (const section of settingsSections) expect(settingsSection(routeForSection(section))).toBe(section);
  });

  it("shortcut digits follow the sidebar order", () => {
    expect(homeRoutes.map(shortcutDigit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
