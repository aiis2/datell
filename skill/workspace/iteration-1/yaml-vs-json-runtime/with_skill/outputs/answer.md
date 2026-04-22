## Runtime reality

- Datell 当前运行时的自定义技能结论是：运行时格式以 JSON 为准，不是 YAML。目录技能加载器只读取技能目录中的 .json 文件，不会扫描 YAML 文件或直接把 SKILL.md 当成本地技能执行。[src/main/main.ts](src/main/main.ts#L1529) [src/main/main.ts](src/main/main.ts#L1530)
- 现在其实有两条自定义技能链路。第一条是目录技能，存放在 getDataDir() 解析出来的运行时数据目录下的 skills 子目录；第二条是 AI 通过 skill_creator 创建的动态技能，持久化在 app-config 里的 dynamicToolDefs，不是文件型 YAML 技能。[src/main/dataDir.ts](src/main/dataDir.ts#L13) [src/main/dataDir.ts](src/main/dataDir.ts#L30) [src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L391) [src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L493) [src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L568) [src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L612)
- GitHub 仓库安装链路也不是“原生跑 SKILL.md”。当前实现会先尝试读取 .claude-plugin/marketplace.json 或仓库根 skill.json；如果命中 marketplace.json，再去抓 SKILL.md，把它包装成一个返回说明文本的 JSON 工具，再落到本地 skills 目录里。[src/main/main.ts](src/main/main.ts#L1575) [src/main/main.ts](src/main/main.ts#L1619) [src/main/main.ts](src/main/main.ts#L1641) [src/main/main.ts](src/main/main.ts#L1644) [src/main/main.ts](src/main/main.ts#L1663)
- 实际运行目录不是仓库里的 autoReportData/skills。主进程先用 getDataDir() 计算 DATA_DIR，开发态默认是当前工作目录下的 datellData，打包态默认是可执行文件同级 datellData，并且都可以被 data-settings.json 覆盖；目录技能路径就是这个 DATA_DIR 下的 skills。[src/main/dataDir.ts](src/main/dataDir.ts#L13) [src/main/dataDir.ts](src/main/dataDir.ts#L30) [src/main/main.ts](src/main/main.ts#L127) [src/main/main.ts](src/main/main.ts#L1530) [src/main/main.ts](src/main/main.ts#L1570)
- 渲染进程启动时会把外部目录技能加载进 externalSkills，再和 dynamicToolDefs 一起并入真实可调用工具集合。所以 Datell 当前运行时是“JSON 目录技能 + app-config 动态技能”双轨，不是 YAML 技能系统。[src/renderer/App.tsx](src/renderer/App.tsx#L74) [src/renderer/App.tsx](src/renderer/App.tsx#L83) [src/renderer/tools/index.ts](src/renderer/tools/index.ts#L42) [src/renderer/tools/index.ts](src/renderer/tools/index.ts#L85)

## Evidence

- [src/main/dataDir.ts](src/main/dataDir.ts#L13)：getDataDir() 定义了真实数据根目录来源。
- [src/main/dataDir.ts](src/main/dataDir.ts#L30)：开发态默认返回当前工作目录下的 datellData，生产态返回可执行文件同级的 datellData。
- [src/main/main.ts](src/main/main.ts#L127)：主进程把 DATA_DIR 直接绑定到 getDataDir()。
- [src/main/main.ts](src/main/main.ts#L1529) [src/main/main.ts](src/main/main.ts#L1530)：skills:list 只扫描 DATA_DIR/skills 下的 .json 文件。
- [src/main/main.ts](src/main/main.ts#L1569) [src/main/main.ts](src/main/main.ts#L1570)：skills:openDir 打开的也是 DATA_DIR/skills。
- [src/main/main.ts](src/main/main.ts#L1575) [src/main/main.ts](src/main/main.ts#L1619) [src/main/main.ts](src/main/main.ts#L1641) [src/main/main.ts](src/main/main.ts#L1644) [src/main/main.ts](src/main/main.ts#L1663)：URL 安装支持 skill.json 和 marketplace.json；SKILL.md 只是被抓取后包装成 JSON 工具，不是原生运行格式。
- [src/main/preload.ts](src/main/preload.ts#L144) [src/main/preload.ts](src/main/preload.ts#L145) [src/main/preload.ts](src/main/preload.ts#L147)：渲染进程暴露的仍是 skills:list、skills:openDir、skills:installFromUrl 这套目录技能 IPC。
- [src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L391) [src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L568) [src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L612)：dynamicToolDefs 会进入 app-config 并在启动时恢复。
- [src/renderer/tools/skillCreator.ts](src/renderer/tools/skillCreator.ts#L7) [src/renderer/tools/skillCreator.ts](src/renderer/tools/skillCreator.ts#L82) [src/renderer/tools/skillCreator.ts](src/renderer/tools/skillCreator.ts#L97)：skill_creator 明确把新技能写入 dynamicToolDefs。
- [README.md](README.md#L202) [README.md](README.md#L483)：README 当前对 Datell 内部运行时技能的描述是 JSON 目录技能。
- [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L35) [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L36) [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L70)：技术方案前半部分已经明确运行时目录是 datellData/skills，不是 autoReportData/skills。
- [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L998) [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L1011) [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L1430)：同一份文档后半部分又进入外部发布轨道，那里说的 SKILL.md + YAML 是外部生态格式，不是 Datell 内部运行时格式。

## Plan impact

- 如果你现在要写 Datell 仓库文档、打包方案或安装说明，正确说法应该是：Datell 内部运行时技能是 JSON 体系，来源是 dynamicToolDefs 和 datellData/skills/*.json；YAML 只属于外部 SKILL.md 发布轨道。
- 文档最容易写错的地方，就是把外部发布章节里的 SKILL.md + YAML 直接抄成“Datell 当前自定义技能格式”。这会把“外部分发格式”误写成“内部运行时格式”。[docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L1011) [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L1430)
- 第二个高频误写点，是把仓库里的 autoReportData/skills 当成真实运行目录。代码里没有用这个目录做技能加载；真实入口始终是 getDataDir()/skills。[src/main/dataDir.ts](src/main/dataDir.ts#L13) [src/main/main.ts](src/main/main.ts#L1530)
- 第三个容易误导的说法，是“Datell 已原生支持 skills.sh”。当前代码只做了兼容导入，把 SKILL.md 包成 JSON instruction tool；这不是原生 prompt-skill 运行时。[src/main/main.ts](src/main/main.ts#L1644) [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L998)

## Recommended fix

- 最小修正文案应该只补一条明确边界说明：Datell 当前运行时技能格式为 JSON，内部来源只有两类，app-config.dynamicToolDefs 与 getDataDir()/skills/*.json；SKILL.md + YAML 仅用于外部生态发布或兼容导入，不是 Datell 本地运行时格式。
- 同时把所有“运行目录”描述统一成 getDataDir()/skills，并在第一次出现时直接注明：默认不是 autoReportData/skills，而是 datellData/skills，且可被 data-settings.json 覆盖。
- 如果要再补一句防误解说明，建议写成：GitHub 仓库导入支持 marketplace.json 和 skill.json；其中 SKILL.md 只会被转换成 JSON instruction tool，本地仍按 JSON 技能落盘。
