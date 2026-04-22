**结论**

Datell 现在的“自定义技能”不是单一的 YAML 体系，当前运行时实际有两条链路，而且都不是 YAML。

1. AI 动态技能链路：由 [src/renderer/tools/skillCreator.ts](src/renderer/tools/skillCreator.ts#L7) 创建。这个工具的入参里直接要求 parameters_json 是 JSON 数组，[src/renderer/tools/skillCreator.ts](src/renderer/tools/skillCreator.ts#L34)。创建后的技能写进 dynamicToolDefs，[src/renderer/tools/skillCreator.ts](src/renderer/tools/skillCreator.ts#L97)，启动时再从配置恢复，[src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L391)，持久化则写入 app-config，[src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L573)。后端存储在 SQLite 的 app_config 表里，[src/main/database.ts](src/main/database.ts#L88) 和 [src/main/database.ts](src/main/database.ts#L287)。

2. 外部目录技能链路：主进程只扫描 skills 目录下的 .json 文件，[src/main/main.ts](src/main/main.ts#L1529) 和 [src/main/main.ts](src/main/main.ts#L1537)，URL 安装后也会保存成 .json，[src/main/main.ts](src/main/main.ts#L1605)。渲染端启动时会把这批目录技能加载进来，[src/renderer/App.tsx](src/renderer/App.tsx#L74) 和 [src/renderer/App.tsx](src/renderer/App.tsx#L81)。更关键的是，设置页里保留的 md 技能解析函数现在直接返回 null，[src/renderer/components/SettingsModal.tsx](src/renderer/components/SettingsModal.tsx#L682)，这基本可以视为“当前运行时没有 SKILL.md / YAML 技能加载链路”的直接证据。

实际运行目录由 [src/main/dataDir.ts](src/main/dataDir.ts#L1) 和 [src/main/main.ts](src/main/main.ts#L127) 决定，不是仓库里的示例数据目录。默认规则是：开发态用工作区根目录下的 datellData，打包态用 exe 同级的 datellData，[src/main/dataDir.ts](src/main/dataDir.ts#L30)。所以按当前仓库开发态的默认逻辑，目录技能路径是工作区根目录下的 datellData/skills，配置数据库路径是工作区根目录下的 datellData/app.db，[src/main/main.ts](src/main/main.ts#L129) 和 [src/main/main.ts](src/main/main.ts#L130)。

**文档最容易写错的地方**

1. 最容易错的是把当前自定义技能写成 YAML 或 SKILL.md。当前仓库里已经有这种误导性表述，[docs/distribution/community-posts.md](docs/distribution/community-posts.md#L142) 和 [docs/distribution/community-posts.md](docs/distribution/community-posts.md#L200) 都写了 custom YAML skills，但代码实际运行的是 dynamicToolDefs 加 datellData/skills/*.json 这两条链路。

2. 其次是把 registry/user/*.skill.json 当成已经落地的现状。[docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L237) 这里描述的是规划态目标，不是当前实现。当前代码仍然只读 datellData/skills/*.json，[src/main/main.ts](src/main/main.ts#L1537)。这份计划文档顶部其实已经把现状写对了，[docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L35) 和 [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L36)，但后文很容易漂移到未来结构。

3. 还有一种常见误写，是把“外部分发轨道”混同为“应用内运行格式”。[docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L1011) 里的 SKILL.md 加 YAML frontmatter，描述的是纯提示词技能的外部发布轨道；[docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L1430) 也是在做外部发布对比。它们不是 Datell 当前 Electron 运行时的自定义技能格式。
