# Datell 社区推广发帖草稿

---

## 1. Hacker News — Show HN

**标题：**
> Show HN: Datell – Local-first AI data analyst that turns raw data into interactive reports (Electron, ReAct)

**正文：**
```
I built Datell – an open-source, local-first desktop app that acts as a real AI data 
analyst. You describe what you want to explore in plain language, and the agent 
autonomously queries your database, cleans data, and generates a fully interactive 
HTML report with live ECharts/ApexCharts, filter linkage, and DuckDB re-querying.

Everything runs on-device (SQLite, local ONNX embeddings). No cloud sync, no API calls 
leaving your machine (except to your chosen LLM provider).

Key features:
- ReAct (Reasoning + Acting) agent with visible reasoning chain  
- 172 KPI card components + 43 layout templates
- Connects to MySQL/PostgreSQL/Presto with SSH tunnel support
- Knowledge base (RAG): local vector store, Dify, Ragflow
- MCP (Model Context Protocol) tool integration
- Works with OpenAI, Anthropic, Gemini, Ollama, or any OpenAI-compatible endpoint
- Export to HTML, Excel, PDF, or slide deck
- Windows portable build (no install), macOS DMG, Linux AppImage

GitHub: https://github.com/aiis2/datell
```

---

## 2. Reddit — r/selfhosted

**标题：**
> Datell – open-source local-first AI data analyst desktop app (no cloud, no subscriptions)

**正文：**
```
Hey r/selfhosted! I've been working on **Datell** – a fully local desktop app that 
uses AI agents to analyze your data and generate interactive reports.

**Why it's relevant here:**
- 100% local: all data stays on your machine (SQLite)
- Local embedding with ONNX models (no OpenAI embeddings needed)
- Bring your own LLM: OpenAI, Anthropic, Ollama local models, DeepSeek, etc.
- Windows portable .exe — no installation required
- Apache 2.0 license

**What it does:**
Upload CSV/Excel or connect to MySQL/PostgreSQL. Describe your analysis in natural 
language. The app generates a fully interactive HTML dashboard with charts, KPI cards, 
filter controls, and dynamic SQL re-binding via DuckDB.

**GitHub:** https://github.com/aiis2/datell

Happy to answer questions! Screenshots in the README.
```

---

## 3. Reddit — r/MachineLearning / r/LocalLLaMA

**标题：**
> Datell: ReAct agent for local data analysis with Ollama support – generates interactive HTML reports

**正文：**
```
I made **Datell**, a desktop application that implements a full ReAct (Reasoning + 
Acting) loop for data analysis tasks.

**Architecture highlights:**
- Multi-agent collaboration: parallel sub-agents, serial pipelines, aggregation nodes
- Full thinking chain / chain-of-thought display (supports reasoning models like o3)
- MCP (Model Context Protocol) tool integration — connect any HTTP/SSE MCP server
- Local RAG with ONNX embeddings (runs completely offline)
- Knowledge graph via Kuzu embedded DB

**Works with Ollama** for fully local inference: Qwen, Llama, Mistral, etc.

The agent can read databases (MySQL/PostgreSQL/Presto), generate SQL, analyze results, 
and output a production-quality interactive HTML report. The reasoning process is 
transparent — every Think → Plan → Execute → Verify step is visible.

GitHub: https://github.com/aiis2/datell
```

---

## 4. Reddit — r/datascience / r/businessintelligence

**标题：**
> I built an AI data analyst that auto-generates interactive reports from natural language – open source

**正文：**
```
**Datell** is an open-source desktop tool where you describe what analysis you want in 
plain English, and the AI agent automatically:

1. Queries your database (MySQL, PostgreSQL, Presto) or parses your CSV/Excel
2. Cleans and analyzes the data
3. Generates a fully interactive HTML report with charts and KPI cards

**What makes reports actually useful:**
- Dynamic ECharts / ApexCharts (not static images)
- Filter controls with real-time DuckDB SQL re-binding
- 43 industry-specific layout templates (Finance, Sales, HR, Marketing, Medical)
- 172 KPI card components (trend indicators, sparklines, gauges, etc.)
- Export to Excel, PDF, or slide deck

It's like having a junior analyst that never sleeps and never complains about 
doing the same report 50 different ways.

GitHub: https://github.com/aiis2/datell
Apache 2.0 | Local-first | Windows/macOS/Linux
```

---

## 5. V2EX 发帖

**节点：** \`程序员\` / \`分享创造\`

**标题：**
> 开源了一个本地优先的 AI 数据分析桌面应用 Datell，一句话生成可交互报表

**正文：**
```
做了一个 Electron 桌面应用，想跟大家分享一下。

**Datell** 是一个基于 ReAct 架构的本地数据分析平台。核心理念是：上传数据/连数据库，
用自然语言描述你要分析什么，AI Agent 自动完成分析并生成带交互图表的 HTML 报表。

**不同于普通的"ChatBI"的地方：**
- 真正的 Agent，不是简单问答：Agent 会展示完整推理链（思考→规划→执行→验证），支持多步骤进度面板
- 报表是可交互的 HTML 大屏：ECharts/ApexCharts 动态图表，筛选器联动，DuckDB 实时 SQL 重查询
- 172 个 KPI 卡片组件，43 套布局模板，60+ 套调色板，20+ 套报告预设
- 支持多数据库：MySQL/MariaDB/Apache Doris、PostgreSQL、Presto，内置 SSH 隧道
- 本地 RAG：ONNX 本地 Embedding，完全离线可用
- MCP 工具集成、自定义 YAML 技能
- 支持 OpenAI / Anthropic / Gemini / Ollama / DeepSeek / 硅基流动等几乎所有模型
- 全量本地 SQLite，数据不离机，隐私有保障
- Windows 绿色便携版，无需安装

项目地址：https://github.com/aiis2/datell
Apache 2.0 开源，欢迎 Star 和提 Issue。

有兴趣的同学可以看看，README 里有截图说明。
```

---

## 6. 少数派 / 即刻 / 微博

**标题：**
> 开源了一个 AI 数据分析桌面应用——Datell，让 AI 替你写报表

**正文（短版）：**
Datell 是一个本地优先的 AI 数据分析桌面应用。上传 Excel / CSV 或连接数据库，用自然语言描述需求，AI 自动生成带交互图表的专业报表。

核心亮点：
✅ 真正的 ReAct Agent（思考→规划→执行→验证全链路可见）
✅ 可交互 HTML 报表（ECharts/ApexCharts + DuckDB 筛选器联动）
✅ 172 个 KPI 卡片 + 43 套布局 + 60+ 配色方案
✅ 支持连接 MySQL / PostgreSQL / Presto
✅ 本地 RAG（ONNX 离线 Embedding）+ MCP 工具
✅ 支持 OpenAI / Claude / Gemini / Ollama / DeepSeek 等全系列模型
✅ 数据完全本地，不上云
✅ Windows 绿色便携版

GitHub: https://github.com/aiis2/datell
Apache 2.0 开源 ⭐

---

## 7. Product Hunt 发布草稿

**Name:** Datell

**Tagline:** 
> Local-first AI data analyst — from raw data to interactive reports in one message

**Description:**
```
Datell is an open-source Electron desktop app that acts as a real AI data analyst.

Unlike basic "ChatBI" tools, Datell uses a full ReAct (Reasoning + Acting) loop: the 
agent thinks, plans, executes, and verifies — with every step visible. Upload your CSV/
Excel or connect to MySQL/PostgreSQL/Presto, describe what you want to explore, and 
Datell generates a production-quality interactive HTML dashboard.

🔑 Key Features:
• 172 KPI card components with sparklines, gauges, and trend indicators
• 43 industry layout templates (Finance, Sales, HR, Marketing, Medical, Logistics)  
• Dynamic ECharts / ApexCharts with filter linkage and DuckDB SQL re-binding
• Export to HTML, Excel, PDF, or slide deck
• Local RAG with ONNX embeddings (fully offline)
• MCP tool integration + custom YAML skills
• Works with OpenAI, Anthropic, Gemini, Ollama local models, DeepSeek, and more
• 100% local — all data stays on your machine

📦 Available for Windows (portable .exe), macOS (DMG), and Linux (AppImage).
Apache 2.0 open source.
```

**Website:** https://github.com/aiis2/datell

**Topics:** Productivity, Artificial Intelligence, Data & Analytics, Open Source, Developer Tools

---

## 8. Awesome List 投稿

目标列表推荐：
- [awesome-electron](https://github.com/sindresorhus/awesome-electron) — 适合投稿
- [awesome-ai-tools](https://github.com/mahseema/awesome-ai-tools)
- [awesome-data-visualization](https://github.com/fasouto/awesome-dataviz)
- [awesome-llm](https://github.com/Hannibal046/Awesome-LLM) — 列出本地 LLM 工具
- [awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted)

**投稿格式示例（awesome-electron）：**
```
- [Datell](https://github.com/aiis2/datell) - Local-first AI data analyst that generates 
  interactive HTML reports from natural language using the ReAct agent architecture.
```
