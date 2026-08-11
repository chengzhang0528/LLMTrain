import { defineConfig } from "vitepress";
import { primaryNav, sidebar } from "./course-data.mjs";
import { installPencilDiagrams } from "./markdown/pencil-diagrams.mjs";
import { installPaperLibrary } from "./markdown/paper-library.mjs";
import { installWikiLinks } from "./markdown/wiki-links.mjs";

const isGithubPages = process.env.GITHUB_PAGES === "true";

const rewrites = {
  "README.md": "index.md",
  "00-从这里开始/README.md": "00-从这里开始/index.md",
  "01-14天理论课/README.md": "01-14天理论课/index.md",
  "02-第3周实战/README.md": "02-第3周实战/index.md",
  "03-数学急救包/README.md": "03-数学急救包/index.md",
  "04-图解与数字漫画/README.md": "04-图解与数字漫画/index.md",
  "06-拓展知识库/README.md": "06-拓展知识库/index.md",
  "06-拓展知识库/幻觉与可靠性/README.md": "06-拓展知识库/幻觉与可靠性/index.md",
  "06-拓展知识库/模型后训练/README.md": "06-拓展知识库/模型后训练/index.md",
  "06-拓展知识库/实际模型项目/README.md": "06-拓展知识库/实际模型项目/index.md",
  "06-拓展知识库/模型评测与选型/README.md": "06-拓展知识库/模型评测与选型/index.md",
  "06-拓展知识库/多模态基础/README.md": "06-拓展知识库/多模态基础/index.md",
  "06-拓展知识库/软硬件瓶颈/README.md": "06-拓展知识库/软硬件瓶颈/index.md",
  "06-拓展知识库/推理控制与服务行为/README.md": "06-拓展知识库/推理控制与服务行为/index.md",
  "06-拓展知识库/小模型与蒸馏/README.md": "06-拓展知识库/小模型与蒸馏/index.md",
  "06-拓展知识库/论文研读/README.md": "06-拓展知识库/论文研读/index.md",
  "06-拓展知识库/论文研读/GLM深读/README.md": "06-拓展知识库/论文研读/GLM深读/index.md",
  "06-拓展知识库/论文研读/Kimi深读/README.md": "06-拓展知识库/论文研读/Kimi深读/index.md",
  "06-拓展知识库/论文研读/DeepSeek深读/README.md": "06-拓展知识库/论文研读/DeepSeek深读/index.md",
  "06-拓展知识库/论文研读/Qwen深读/README.md": "06-拓展知识库/论文研读/Qwen深读/index.md",
  "06-拓展知识库/在策略蒸馏深读/README.md": "06-拓展知识库/在策略蒸馏深读/index.md",
  "08-支持课程/README.md": "08-支持课程/index.md",
  "09-模型算法图解/README.md": "09-模型算法图解/index.md"
};

function tokenizeChinese(text: string): string[] {
  const normalized = text.toLocaleLowerCase("zh-CN");
  const words = [...new Intl.Segmenter("zh-CN", { granularity: "word" }).segment(normalized)]
    .filter((item) => item.isWordLike)
    .map((item) => item.segment);
  const hanCharacters = [...normalized].filter((character) => /\p{Script=Han}/u.test(character));
  return [...new Set([...words, ...hanCharacters])];
}

export default defineConfig({
  lang: "zh-CN",
  title: "LLMTrain",
  titleTemplate: ":title · LLMTrain",
  description: "从文本基础到小模型、蒸馏、部署与前沿架构的开放学习体系",
  base: isGithubPages ? "/LLMTrain/" : "/",
  srcDir: "course",
  cleanUrls: true,
  vite: {
    build: {
      // The local search index, Mermaid and Three.js are already lazy-loaded.
      // Keep a finite limit so unexpected growth still surfaces during builds.
      chunkSizeWarningLimit: 2200
    }
  },
  rewrites,
  srcExclude: [
    "**/.venv/**",
    "**/outputs/**"
  ],
  ignoreDeadLinks: false,
  markdown: {
    math: true,
    lineNumbers: true,
    config(md) {
      installWikiLinks(md);
      const defaultFence = md.renderer.rules.fence;
      md.renderer.rules.fence = (tokens, index, options, env, self) => {
        const token = tokens[index];
        if (token.info.trim() === "mermaid") {
          const encoded = Buffer.from(token.content, "utf8").toString("base64");
          return `<MermaidDiagram code="${encoded}" />`;
        }
        return defaultFence
          ? defaultFence(tokens, index, options, env, self)
          : self.renderToken(tokens, index, options);
      };
      installPencilDiagrams(md);
      installPaperLibrary(md);
    }
  },
  themeConfig: {
    logo: {
      light: "/mark-light.svg",
      dark: "/mark-dark.svg",
      alt: "LLMTrain"
    },
    siteTitle: "LLMTrain",
    nav: primaryNav,
    sidebar,
    outline: {
      level: [2, 3],
      label: "本页目录"
    },
    docFooter: {
      prev: "上一节",
      next: "下一节"
    },
    returnToTopLabel: "回到顶部",
    sidebarMenuLabel: "课程目录",
    darkModeSwitchLabel: "外观",
    lightModeSwitchTitle: "切换到浅色模式",
    darkModeSwitchTitle: "切换到深色模式",
    lastUpdatedText: "最后更新",
    search: {
      provider: "local",
      options: {
        miniSearch: {
          options: {
            tokenize: tokenizeChinese
          },
          searchOptions: {
            fuzzy: 0.15,
            prefix: true,
            boost: { title: 5, text: 2, titles: 2 }
          }
        },
        locales: {
          root: {
            translations: {
              button: {
                buttonText: "搜索",
                buttonAriaLabel: "搜索课程"
              },
              modal: {
                displayDetails: "显示详细列表",
                resetButtonTitle: "重置搜索",
                backButtonTitle: "关闭搜索",
                noResultsText: "没有找到相关内容",
                footer: {
                  selectText: "选择",
                  selectKeyAriaLabel: "回车",
                  navigateText: "移动",
                  navigateUpKeyAriaLabel: "上箭头",
                  navigateDownKeyAriaLabel: "下箭头",
                  closeText: "关闭",
                  closeKeyAriaLabel: "Esc"
                }
              }
            }
          }
        }
      }
    }
  },
  head: [
    ["meta", { name: "theme-color", content: "#126e63" }],
    ["meta", { name: "color-scheme", content: "light dark" }]
  ]
});
