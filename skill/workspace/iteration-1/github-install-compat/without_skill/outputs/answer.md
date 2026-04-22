现在这条链路本质上是“把 GitHub 技能仓库转换成 Datell 目录技能”的兼容层，不是原生的 skills.sh 运行时。

**现在怎么处理**

1. 你给的是 GitHub 仓库根地址时，Datell 会走 [src/main/main.ts](src/main/main.ts#L1575) 里的安装逻辑。它只识别 owner/repo 这种仓库地址，并把原始内容地址固定到 main 分支。
2. 它会先尝试读取 .claude-plugin/marketplace.json。如果这个文件存在，就优先走这条路径，不会先看 skill.json。[src/main/main.ts](src/main/main.ts#L1608-L1661)
3. 在 marketplace 路径下，它只会装一个插件：默认取 plugins[0]，或者你在 URL 后面加 #技能名 来选中指定插件。然后它只取这个插件的第一个 skills 目录，或者退回到 skills/插件名，再去抓那个目录里的 SKILL.md。[src/main/main.ts](src/main/main.ts#L1620-L1642)
4. 抓到 SKILL.md 之后，Datell 不会按原生 prompt skill 语义执行它，而是把整份 Markdown 包成一个 Datell 外部技能 JSON，只生成一个工具，名字类似 插件名_instructions。这个工具执行时只是返回整份 SKILL.md 文本。[src/main/main.ts](src/main/main.ts#L1644-L1661)
5. 如果仓库里没有 .claude-plugin/marketplace.json，它才回退到根目录的 skill.json。但这里也不是“原生 skill.json 支持”，而是把这个 JSON 原样当成 Datell 自己的外部技能格式保存下来。[src/main/main.ts](src/main/main.ts#L1662-L1668)
6. 真正能被 Datell 识别并运行的 skill.json，必须长得像它自己的目录技能格式：顶层至少要有 name 和 tools，后续目录扫描时每个 tool 至少要有 name 和 code。[src/main/main.ts](src/main/main.ts#L1520-L1556) 所以 README 里说的“compatible skill.json payloads”更准确地说是“兼容 Datell 目录技能格式的 JSON”，不是任意 skills.sh 风格的 skill.json。[README.md](README.md#L200-L203)
7. 安装后的结果会被写到 datellData/skills 目录，应用启动时再扫这个目录并装进运行时。[src/main/dataDir.ts](src/main/dataDir.ts) [src/renderer/App.tsx](src/renderer/App.tsx) [src/renderer/tools/index.ts](src/renderer/tools/index.ts#L85-L108)

**和原生 skills.sh 还差什么**

1. 缺原生运行语义。现在对 SKILL.md 的处理只是“包成一个返回说明文本的工具”，不是把它当原生 skill 来解析、调度和组合。[src/main/main.ts](src/main/main.ts#L1644-L1661)
2. 缺完整仓库结构支持。当前只探测 main 分支、根目录 .claude-plugin/marketplace.json、根目录 skill.json，以及单个插件的一个 SKILL.md；没有更完整的仓库发现、批量安装、多技能安装、版本分支标签处理。
3. 缺统一包格式和生态映射。仓库自己的规划文档把“与 skill.json、.claude-plugin/marketplace.json、SKILL.md、skills.sh 仓库结构建立映射”明确列成未来的 Phase 5，不是当前能力。[docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L926-L938)
4. 缺发布和校验链路。文档里还列着 .datell-skill 包、签名与校验、evals/evals.json、benchmark/review 产物、authoring/eval loop 等未完成事项。[docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L926-L938)
5. 缺安全执行边界。外部目录技能最终还是在渲染进程里通过 AsyncFunction 执行，只做黑名单拦截；Worker、隔离上下文、超时、中止、结果大小限制都还只是规划项。[src/renderer/tools/index.ts](src/renderer/tools/index.ts#L27-L108) [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L918-L924)
6. 缺 Datell 内部能力的稳定桥接。规划里还明确要补 file-parser、kg-query 等 wrapper tool，说明外部技能仓库现在也还不能原生、稳定地调用 Datell 的附件、知识图谱等内部能力。[docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L918-L924)

一句话概括：现在 Datell 对 GitHub 技能仓库的支持，更接近“窄兼容导入器”，不是“原生 skills.sh 支持”。
