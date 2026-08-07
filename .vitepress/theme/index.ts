import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Layout from "./Layout.vue";
import MermaidDiagram from "./components/MermaidDiagram.vue";
import SupportDonation from "./components/SupportDonation.vue";
import "./custom.css";
import { installWikiPreview } from "./wiki-preview";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("MermaidDiagram", MermaidDiagram);
    app.component("SupportDonation", SupportDonation);
    installWikiPreview();
  }
} satisfies Theme;
