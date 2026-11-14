import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../styles/base.css";
import "../../components/settings/settings.css";
import "./home.css";
import { LocalizationProvider, systemLanguage } from "../../i18n";
import { HomeWindow } from "./HomeWindow";

const language = systemLanguage();
document.documentElement.lang = language;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocalizationProvider language={language}>
      <HomeWindow />
    </LocalizationProvider>
  </StrictMode>,
);
