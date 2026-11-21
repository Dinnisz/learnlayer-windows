import "../../styles/base.css";
import "../../dragScroll";
import { installSprings } from "../../styles/springs";
import "./pill.css";
import { mount } from "../../mount";
import { Pill } from "./Pill";

installSprings();

void mount(<Pill />);
