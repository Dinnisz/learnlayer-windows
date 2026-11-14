// Port of LearnLayer/App/HomeRoute.swift @ ref 2026-11-04

/**
 * Where a link or a button can send the student. `learnlayer://…` links parse to one of these;
 * the pill, the tray menu and error banners use the same values. Each one is a section of the LearnLayer window.
 */
export const homeRoutes = ["memory", "documents", "account", "plan", "general", "permissions", "ai", "data"] as const;
export type HomeRoute = (typeof homeRoutes)[number];

export const homeRouteScheme = "learnlayer";

/** The Settings pages that five of the routes wrap (Settings/SettingsKit.swift). */
export const settingsSections = ["general", "plan", "ai", "permissions", "data"] as const;
export type SettingsSection = (typeof settingsSections)[number];

/** The three sidebar groups of the LearnLayer window. */
export const homeRouteGroups = ["study", "account", "settings"] as const;
export type HomeRouteGroup = (typeof homeRouteGroups)[number];

/** Key in the locale tables. */
export function groupTitleKey(group: HomeRouteGroup): string {
  switch (group) {
    case "study":
      return "Study";
    case "account":
      return "Account";
    case "settings":
      return "Settings";
  }
}

export function groupOf(route: HomeRoute): HomeRouteGroup {
  switch (route) {
    case "memory":
    case "documents":
      return "study";
    case "account":
    case "plan":
      return "account";
    case "general":
    case "permissions":
    case "ai":
    case "data":
      return "settings";
  }
}

export function routesIn(group: HomeRouteGroup): HomeRoute[] {
  return homeRoutes.filter((route) => groupOf(route) === group);
}

/** Key in the locale tables for the sidebar row. */
export function titleKey(route: HomeRoute): string {
  switch (route) {
    case "memory":
      return "Memory";
    case "documents":
      return "Documents";
    case "account":
      return "Account";
    case "plan":
      return "Plan & usage";
    case "general":
      return "General";
    case "permissions":
      return "Permissions";
    case "ai":
      return "AI";
    case "data":
      return "Data & Privacy";
  }
}

/** The SF Symbol the Mac draws; the interface maps it to a Segoe Fluent glyph. */
export function systemImage(route: HomeRoute): string {
  switch (route) {
    case "memory":
      return "point.3.connected.trianglepath.dotted";
    case "documents":
      return "folder";
    case "account":
      return "person.crop.circle";
    case "plan":
      return "chart.bar.xaxis";
    case "general":
      return "gearshape";
    case "permissions":
      return "hand.raised";
    case "ai":
      return "sparkles";
    case "data":
      return "lock.shield";
  }
}

/** The Settings page a route shows, for the five that wrap a Settings tab. */
export function settingsSection(route: HomeRoute): SettingsSection | null {
  return (settingsSections as readonly string[]).includes(route) ? (route as SettingsSection) : null;
}

/** The route that shows a Settings page; the inverse of `settingsSection`. */
export function routeForSection(section: SettingsSection): HomeRoute {
  return section;
}

/** Ctrl+1…Ctrl+8 follow the sidebar order (⌘1…⌘8 on the Mac). */
export function shortcutDigit(route: HomeRoute): number | null {
  const index = homeRoutes.indexOf(route);
  return index >= 0 && index < 9 ? index + 1 : null;
}

/** A launch argument or a saved id. Null when it names nothing we know. */
export function named(id: string): HomeRoute | null {
  const lowered = id.toLowerCase();
  switch (lowered) {
    case "today":
    case "brain":
    case "reviews":
      return "memory";
    case "topics":
    case "folders":
      return "documents";
    default:
      return (homeRoutes as readonly string[]).includes(lowered) ? (lowered as HomeRoute) : null;
  }
}

function aliased(id: string | null | undefined): HomeRoute | null {
  if (!id) return null;
  return named(id);
}

/** Saved names, including the old Today / Topics / Brain / Reviews sections. */
export function resolve(id: string | null | undefined): HomeRoute {
  return aliased(id) ?? "memory";
}

/** `learnlayer://settings/permissions`, `learnlayer://memory`, … */
export function urlFor(route: HomeRoute): string {
  switch (route) {
    case "general":
    case "permissions":
    case "ai":
    case "data":
    case "plan":
      return `${homeRouteScheme}://settings/${route}`;
    default:
      return `${homeRouteScheme}://${route}`;
  }
}

/**
 * Parses a link. Null for another scheme, an unknown place, or extra path parts.
 * `learnlayer://settings` alone is General. Old names still open the section that replaced them.
 */
export function parse(link: string): HomeRoute | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol.toLowerCase() !== `${homeRouteScheme}:`) return null;
  const host = url.hostname.toLowerCase();
  if (host === "") return null;
  const path = url.pathname
    .split("/")
    .filter((part) => part !== "")
    .map((part) => part.toLowerCase());
  if (host === "settings") {
    if (path.length > 1) return null;
    const name = path[0];
    if (name === undefined) return "general";
    const allowed: readonly string[] = ["general", "plan", "ai", "permissions", "data", "account"];
    return allowed.includes(name) ? (name as HomeRoute) : null;
  }
  if (path.length > 0) return null;
  const route = aliased(host);
  if (!route) return null;
  if (["general", "ai", "permissions", "data"].includes(route)) return null;
  return route;
}
