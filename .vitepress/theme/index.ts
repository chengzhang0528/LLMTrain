import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Layout from "./Layout.vue";
import ExerciseBlock from "./components/ExerciseBlock.vue";
import MermaidDiagram from "./components/MermaidDiagram.vue";
import PencilFlow from "./components/PencilFlow.vue";
import PencilScene3D from "./components/PencilScene3D.vue";
import SupportDonation from "./components/SupportDonation.vue";
import "./custom.css";
import { installWikiPreview } from "./wiki-preview";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("ExerciseBlock", ExerciseBlock);
    app.component("MermaidDiagram", MermaidDiagram);
    app.component("PencilFlow", PencilFlow);
    app.component("PencilScene3D", PencilScene3D);
    app.component("SupportDonation", SupportDonation);
    installWikiPreview();
  }
} satisfies Theme;
