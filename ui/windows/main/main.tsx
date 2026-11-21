import "katex/dist/katex.min.css";
import "../../styles/base.css";
import "../../dragScroll";
import { installSprings } from "../../styles/springs";
import "../../components/settings/settings.css";
import "./home.css";
import "./account.css";
import "../../stage/stage.css";
import "../../onboarding/onboarding.css";
import { mount } from "../../mount";
import { HomeWindow } from "./HomeWindow";

installSprings();

void mount(<HomeWindow />);
