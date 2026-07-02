### Datell Desktop Release / Datell 桌面版发布

Datell is a polished local-first desktop app for AI-assisted data analysis and interactive report generation.
Datell 是一款打磨完善的本地优先桌面应用，专注于 AI 驱动的数据分析与交互式报表生成。

It brings agentic analysis, interactive dashboards, and export-ready deliverables into one streamlined workflow.
它把智能体分析、交互式仪表盘和可导出的成果整合进一条顺畅的工作流。

### What's New in {{VERSION}} / {{VERSION}} 更新亮点

- Agent can generate reusable report templates from uploaded screenshots / Agent 可根据上传截图生成可复用报表模板
- Screenshot-inspired blocks can be inserted into the currently selected template without overwriting it / 截图风格区块可追加到当前模板且不覆盖原模板
- Generated templates are saved into the user template library with Agent metadata and immediate preview / 生成模板会写入用户模板库，带 Agent 元数据并可立即预览
- Added a lightweight compile-and-test GitHub Actions workflow for faster validation / 新增轻量编译与测试 Actions，便于快速校验

### Downloads / 下载

| Platform | File | Notes |
|---|---|---|
| Windows x64 | `Datell-{{VERSION}}-win-x64-portable.exe` | Portable, no install needed / 免安装，双击可用 |
| macOS x64 | `Datell-{{VERSION}}-mac-x64.dmg` | Intel Mac |
| macOS arm64 | `Datell-{{VERSION}}-mac-arm64.dmg` | Apple Silicon (M1/M2/M3) |
| Linux x64 AppImage | `Datell-{{VERSION}}.AppImage` | Portable AppImage for most distros / 适用于大多数发行版 |
| Linux x64 deb | `datell_{{VERSION}}_amd64.deb` | Debian/Ubuntu package / 适用于 Debian 与 Ubuntu |

> **macOS first launch**: If blocked by Gatekeeper, right-click the app and choose "Open".
> **macOS 首次打开**：如果被系统拦截，请右键应用并选择“打开”。

---

### Key Features / 主要功能

- **ReAct AI Agent** — Transparent multi-step planning, tool use, and verification / 可见的多步骤规划、工具调用与验证
- **Interactive Reports** — Filter-aware KPI cards, linked charts, and export-ready HTML dashboards / 支持筛选联动的 KPI 卡片、图表与可导出的 HTML 仪表盘
- **Model Flexibility** — OpenAI, Claude, Gemini, DeepSeek, Ollama, and compatible APIs / 支持 OpenAI、Claude、Gemini、DeepSeek、Ollama 与兼容接口
- **Local-first Runtime** — Data, chats, and knowledge stay on-device by default / 数据、对话与知识默认留在本地
- **Rich Report Surface** — 170+ KPI cards, 40+ layouts, and multiple chart engines / 170+ KPI 卡片、40+ 布局与多图表引擎
- **Knowledge Context** — Built-in RAG, knowledge graph, and MCP extensions / 内置 RAG、知识图谱与 MCP 扩展

---

### Requirements / 系统要求

- **Windows**: Windows 10/11 x64
- **macOS**: macOS 12+ (Monterey or later), Intel or Apple Silicon
- **Linux**: Ubuntu 20.04+, Debian 10+, or compatible

---

### First Launch / 首次启动

First launch may take 10–20 seconds to initialize the local database.
首次启动需要 10–20 秒初始化本地数据库，请耐心等待。

---

**Source Code / 源码**: https://github.com/aiis2/datell
