// Port of LearnLayer/Home/HomeWindowView.swift @ ref 2026-11-04

import { useEffect, useState } from "react";
import {
  groupOf,
  groupTitleKey,
  homeRouteGroups,
  homeRoutes,
  resolve,
  routesIn,
  shortcutDigit,
  systemImage,
  titleKey,
  type HomeRoute,
} from "@core/account/homeRoute";
import { Icon } from "../../components/Icon";
import { SettingsPage } from "../../components/settings/SettingsKit";
import { accountModel } from "../../account/accountStore";
import { useT } from "../../i18n";
import { appConfig, onDeepLink } from "../../native";
import { AccountPane } from "./panes/AccountPane";
import { PlanPane } from "./panes/PlanPane";
import { ConsentSheet, SignInSheet } from "./sheets/SignInSheet";

const routeKey = "homeRoute";

/** Which section the window shows, saved so it reopens where the student left it (HomeNavigator.swift). */
function useHomeRoute(): [HomeRoute, (route: HomeRoute) => void] {
  const [route, setRoute] = useState<HomeRoute>(() => resolve(localStorage.getItem(routeKey)));
  const select = (next: HomeRoute) => {
    localStorage.setItem(routeKey, next);
    setRoute(next);
  };
  return [route, select];
}

/** The LearnLayer window: a sidebar of eight sections in three groups and one pane. */
export function HomeWindow() {
  const [route, select] = useHomeRoute();

  // Ctrl+1…Ctrl+8 jump to a section in sidebar order (⌘1…⌘8 on the Mac).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
      const target = homeRoutes.find((candidate) => String(shortcutDigit(candidate)) === event.key);
      if (target) {
        event.preventDefault();
        select(target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `learnlayer://` links: finish a sign-in, refresh after a payment, or open a section.
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    void onDeepLink(async (link) => {
      const outcome = await (await accountModel()).handleLink(link);
      if (outcome.kind === "route") select(outcome.route);
      if (outcome.kind === "signedIn") select("plan");
    }).then((unlisten) => (cancelled ? unlisten() : (stop = unlisten)));
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="home">
      <HomeSidebar selection={route} onSelect={select} />
      <main className="home-detail" key={route}>
        <HomePane route={route} onNavigate={select} />
      </main>
      <SignInSheet />
      <ConsentSheet />
    </div>
  );
}

function HomeSidebar({ selection, onSelect }: { selection: HomeRoute; onSelect: (route: HomeRoute) => void }) {
  const t = useT();
  const [version, setVersion] = useState("");
  useEffect(() => {
    void appConfig().then((config) => setVersion(config.version));
  }, []);

  return (
    <nav className="home-sidebar" aria-label="LearnLayer">
      {homeRouteGroups.map((group) => (
        <section key={group} className="home-sidebar-group">
          <h2>{t(groupTitleKey(group))}</h2>
          {routesIn(group).map((route) => (
            <button
              key={route}
              type="button"
              className="home-sidebar-row"
              aria-current={selection === route ? "page" : undefined}
              onClick={() => onSelect(route)}
            >
              <Icon symbol={systemImage(route)} size={14} />
              <span className="home-sidebar-title">{t(titleKey(route))}</span>
              <kbd aria-hidden="true">Ctrl+{shortcutDigit(route)}</kbd>
            </button>
          ))}
        </section>
      ))}
      <footer className="home-sidebar-footer">
        <span>LearnLayer</span>
        <span className="home-sidebar-version">{version}</span>
      </footer>
    </nav>
  );
}

/** The panes arrive phase by phase; until then a section shows its title only. */
function HomePane({ route, onNavigate }: { route: HomeRoute; onNavigate: (route: HomeRoute) => void }) {
  const t = useT();
  if (route === "account") return <AccountPane onNavigate={onNavigate} />;
  if (route === "plan") return <PlanPane />;
  return (
    <SettingsPage title={t(titleKey(route))} subtitle="" data-group={groupOf(route)}>
      {null}
    </SettingsPage>
  );
}
