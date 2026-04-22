## Runtime reality
- 给 Datell 一个 GitHub 仓库根地址时，它先把 URL 识别成 owner/repo 形式，并且固定只去 main 分支取文件；默认分支不是 main、或者技能不在仓库根约定位置时，当前实现就不会原生识别。[src/main/main.ts](src/main/main.ts#L1609-L1619)
- 它的处理顺序是先找 .claude-plugin/marketplace.json，再回退到仓库根目录的 skill.json。只要 marketplace.json 存在，就优先走这条分支。[src/main/main.ts](src/main/main.ts#L1619-L1666)
- 如果命中 marketplace.json，Datell 只会从 plugins 数组里选第一个插件，或者用 URL 里的 #技能名 选一个插件；随后只取该插件 skills 数组里的第一个目录，再去抓那个目录下的 SKILL.md。[src/main/main.ts](src/main/main.ts#L1623-L1642)
- 读到 SKILL.md 以后，Datell 不会像原生 skills.sh 那样把它当作一等 prompt skill 运行，而是把整份 Markdown 包成一个单工具 JSON 技能。这个工具执行时只是返回 SKILL.md 文本，然后被保存到 datellData/skills/ 下，后续按目录技能加载。[src/main/main.ts](src/main/main.ts#L1598-L1659) [src/main/dataDir.ts](src/main/dataDir.ts#L10-L33) [src/main/main.ts](src/main/main.ts#L1529-L1568) [src/renderer/App.tsx](src/renderer/App.tsx#L75-L87) [src/renderer/tools/index.ts](src/renderer/tools/index.ts#L48-L83)
- 仓库导入和应用内 AI 动态技能是两条并行链路。GitHub 导入落到 datellData/skills/*.json；而 skill_creator 创建的技能写入 dynamicToolDefs，随 app-config 持久化并在重启后恢复。[src/renderer/tools/skillCreator.ts](src/renderer/tools/skillCreator.ts#L75-L95) [src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L391-L408) [src/renderer/stores/configStore.ts](src/renderer/stores/configStore.ts#L558-L612)

## Evidence
- 真实运行时目录由 [src/main/dataDir.ts](src/main/dataDir.ts#L10-L33) 决定，默认是 datellData/skills，不是仓库里的 autoReportData/skills。
- 目录技能加载器只扫描 [src/main/main.ts](src/main/main.ts#L1529-L1568) 里的 datellData/skills/*.json。
- GitHub 仓库安装逻辑完整在 [src/main/main.ts](src/main/main.ts#L1575-L1669)：先 marketplace.json，后 skill.json，SKILL.md 被包装成返回说明文本的单工具。
- 渲染进程通过 [src/main/preload.ts](src/main/preload.ts#L141-L149) 暴露 skillsInstallFromUrl 和 skillsList，再由 [src/renderer/App.tsx](src/renderer/App.tsx#L75-L87) 在启动时加载外部技能。
- 外部目录技能真正进入运行时并执行 code 的地方在 [src/renderer/tools/index.ts](src/renderer/tools/index.ts#L48-L83)，执行模型是 AsyncFunction 加黑名单拦截，不是强沙箱。
- README 的现状描述在 [README.md](README.md#L202-L202) 只写了兼容 skill.json；而计划文档在 [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L998-L1000) 已经更准确地说明了 marketplace.json 加 SKILL.md 包装导入这条兼容链路，并明确这不等于原生 skills.sh 支持。

## Plan impact
- 如果你现在给 Datell 一个 GitHub 技能仓库地址，它本质上是在做“兼容导入”，不是“原生运行 skills.sh 仓库”。skill.json 会被当成 Datell 自己的目录技能 JSON 保存；marketplace.json 会被当成一个索引文件，用来找到目标 SKILL.md；而 SKILL.md 只会被包成 instruction tool，不会被原生解释执行。[src/main/main.ts](src/main/main.ts#L1619-L1666)
- 所以，任何把当前能力描述成“Datell 已支持 skills.sh 仓库直接安装和运行”的方案都高估了现状。更准确的说法是：Datell 当前支持 skill.json 兼容导入，以及 marketplace.json 指向的 SKILL.md 文本包装导入。[docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L998-L1000)
- 和原生 skills.sh 支持相比，当前至少还差四块：一是原生 SKILL.md 语义执行；二是通用仓库发现能力，当前只硬编码 main 分支和第一个插件或第一个 skills 路径；三是把仓库元数据、版本、资源、依赖、MCP 连接等当成一等对象保存；四是更像原生运行时的隔离执行边界，而不是当前 renderer 里的 AsyncFunction 兼容层。[src/main/main.ts](src/main/main.ts#L1609-L1669) [src/renderer/tools/index.ts](src/renderer/tools/index.ts#L34-L83)

## Recommended fix
- 最小的正确修正，是把文档和产品表述统一成“GitHub 技能仓库兼容导入”，不要写成“原生 skills.sh 支持”；并明确三种现状：直接导入 skill.json、读取 marketplace.json 后抓 SKILL.md、SKILL.md 目前只会被包装成 instruction tool。
- 如果要做最小可落地的原生补齐，不要改写现有的 legacy skills:list、skills:openDir、skills:installFromUrl，而是新增独立的 native installer 或 registry 通道，先补默认分支发现、多个插件或多个 skills 路径支持、原始 SKILL.md 与仓库元数据持久化，再让 agent runtime 真正消费 SKILL.md，而不是只返回文本。[docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L35-L36) [docs/plan/tech-17-skills-packaging-plan.md](docs/plan/tech-17-skills-packaging-plan.md#L514-L514)
