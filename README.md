# LLMTrain

这是一个纯前端的大模型学习网站。

课程官网：[LLMTrain 大模型学习网站](https://chengzhang0528.github.io/LLMTrain/)

- `course/`：发布给学习者的 Markdown 课程源，VitePress 只从这里构建网站。
- `internal/`：生产规范、来源审计和训练代码，不发布到网站。
- `.vitepress/`：站点主题、校验脚本和构建配置。
- `worker/`：反馈服务代码。

```powershell
pnpm install
pnpm docs:dev
pnpm docs:check
pnpm docs:build
```
