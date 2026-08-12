import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Layout from "./Layout.vue";
import CurriculumExplorer from "./components/CurriculumExplorer.vue";
import ExerciseBlock from "./components/ExerciseBlock.vue";
import LearningProgressCenter from "./components/LearningProgressCenter.vue";
import LessonBoard from "./components/LessonBoard.vue";
import MermaidDiagram from "./components/MermaidDiagram.vue";
import PaperLibrary from "./components/PaperLibrary.vue";
import PaperDetail from "./components/PaperDetail.vue";
import PaperLessonMap from "./components/PaperLessonMap.vue";
import PencilFlow from "./components/PencilFlow.vue";
import PencilFormulaPlane from "./components/PencilFormulaPlane.vue";
import BenchmarkBarChart from "./components/BenchmarkBarChart.vue";
import BenchmarkLeaderboard from "./components/BenchmarkLeaderboard.vue";
import ModelRuntimeMap from "./components/ModelRuntimeMap.vue";
import PencilScene3D from "./components/PencilScene3D.vue";
import PencilVector from "./components/PencilVector.vue";
import TokenComputeTower from "./components/TokenComputeTower.vue";
import SupportDonation from "./components/SupportDonation.vue";
import "./custom.css";
import { installWikiPreview } from "./wiki-preview";
import { installProgressSidebar } from "./progress-sidebar";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("CurriculumExplorer", CurriculumExplorer);
    app.component("ExerciseBlock", ExerciseBlock);
    app.component("LearningProgressCenter", LearningProgressCenter);
    app.component("LessonBoard", LessonBoard);
    app.component("MermaidDiagram", MermaidDiagram);
    app.component("PaperLibrary", PaperLibrary);
    app.component("PaperDetail", PaperDetail);
    app.component("PaperLessonMap", PaperLessonMap);
    app.component("PencilFlow", PencilFlow);
    app.component("PencilFormulaPlane", PencilFormulaPlane);
    app.component("BenchmarkBarChart", BenchmarkBarChart);
    app.component("BenchmarkLeaderboard", BenchmarkLeaderboard);
    app.component("ModelRuntimeMap", ModelRuntimeMap);
    app.component("PencilScene3D", PencilScene3D);
    app.component("PencilVector", PencilVector);
    app.component("TokenComputeTower", TokenComputeTower);
    app.component("SupportDonation", SupportDonation);
    installProgressSidebar();
    installWikiPreview();
  }
} satisfies Theme;
