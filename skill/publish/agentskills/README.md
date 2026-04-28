# Datell Agent Skills

Datell Agent Skills publishes a report-focused Agent Skills repository with one installable skill and an optional visual-report MCP runtime.

[![skills.sh repository](https://img.shields.io/badge/skills.sh-repository-111827?logo=vercel&logoColor=white)](https://skills.sh/aiis2/frontend-design-report)
[![skills.sh skill](https://img.shields.io/badge/skills.sh-datell--visual--report--preview-1d4ed8?logo=vercel&logoColor=white)](https://skills.sh/aiis2/frontend-design-report/datell-visual-report-preview)
[![install with skills CLI](https://img.shields.io/badge/install-npx%20skills%20add%20aiis2%2Ffrontend--design--report%20--skill%20datell--visual--report--preview-0f766e)](https://skills.sh/aiis2/frontend-design-report/datell-visual-report-preview)
[![GitHub repository](https://img.shields.io/badge/GitHub-aiis2%2Ffrontend--design--report-181717?logo=github&logoColor=white)](https://github.com/aiis2/frontend-design-report)

## Install

Install the published skill from GitHub with the Agent Skills CLI:

```bash
npx skills add aiis2/frontend-design-report --skill datell-visual-report-preview
```

The repository also ships `.claude-plugin/marketplace.json` for hosts that support Claude-style marketplace imports.

The public listing is already live on skills.sh:

- `https://skills.sh/aiis2/frontend-design-report`
- `https://skills.sh/aiis2/frontend-design-report/datell-visual-report-preview`

Quick links:

- Open the repository page on skills.sh: `https://skills.sh/aiis2/frontend-design-report`
- Open the skill detail page on skills.sh: `https://skills.sh/aiis2/frontend-design-report/datell-visual-report-preview`
- Open the GitHub repository: `https://github.com/aiis2/frontend-design-report`

skills.sh does not require a separate manual submission flow for this repository at the moment. Once the GitHub repository is public, installable, and indexed, the listing page becomes the publish surface.

## What You Get

- One installable skill: `datell-visual-report-preview`
- Preferred runtime path: call `datell_generate_chart` when a compatible MCP host is available
- Standalone fallback path: generate self-contained HTML that preserves the Datell layout, card, and palette system
- No-MCP basic-report mode: generate a static, non-interactive HTML report without filter controls, event-bus hooks, or cross-card linkage
- Optional MCP package scope: visual-report runtime only

## Skill Layout

The skill follows the Agent Skills directory model: a `SKILL.md` entry point with focused reference files loaded on demand.

- `skills/datell-visual-report-preview/SKILL.md`
- `skills/datell-visual-report-preview/references/datell-knowledge-index.md`
- `skills/datell-visual-report-preview/references/datell-layout-catalog.md`
- `skills/datell-visual-report-preview/references/datell-palette-catalog.md`
- `skills/datell-visual-report-preview/references/datell-card-catalog.md`
- `skills/datell-visual-report-preview/references/visual-report-pattern.md`

Use these references when you need the full Datell layout, palette, and card inventory instead of a reduced example subset.

For no-MCP delivery planning, also use `references/datell-no-mcp-capability-matrix.md` to separate full catalog knowledge coverage from the static subset that can be rendered without interactive runtime support.

## Example Gallery

### Public U.S. Agriculture Example

![U.S. agriculture exports preview](skills/datell-visual-report-preview/assets/us-ag-exports-top8-2011-preview.png)

This public-facing example uses a foreign open dataset instead of an internal export. It demonstrates the exact no-MCP fallback contract with a static Datell-style report built from the top eight U.S. states by 2011 agriculture export value.

- Preview image: `skills/datell-visual-report-preview/assets/us-ag-exports-top8-2011-preview.png`
- Standalone HTML: `skills/datell-visual-report-preview/assets/us-ag-exports-top8-2011-basic-report.html`
- Example data: `skills/datell-visual-report-preview/assets/us-ag-exports-top8-2011.json`
- Public source: `https://raw.githubusercontent.com/plotly/datasets/master/2011_us_ag_exports.csv`

Layout style: `universal/dashboard-2col`

### European GDP Magazine Example

![European GDP magazine preview](skills/datell-visual-report-preview/assets/europe-gdp-top8-2014-preview.png)

This second public-facing example uses a different layout family and a richer static card mix. It demonstrates a no-MCP `universal/magazine-wide` composition with mini image cards, a ranked analytical chart, a metric narrative hero, and a compact comparison block built from the top eight European economies in the 2014 public GDP dataset.

- Preview image: `skills/datell-visual-report-preview/assets/europe-gdp-top8-2014-preview.png`
- Standalone HTML: `skills/datell-visual-report-preview/assets/europe-gdp-top8-2014-magazine-report.html`
- Example data: `skills/datell-visual-report-preview/assets/europe-gdp-top8-2014.json`
- Public source: `https://raw.githubusercontent.com/plotly/datasets/master/2014_world_gdp_with_codes.csv`

Layout style: `universal/magazine-wide`

### SaaS Subscription Health Example

![SaaS subscription health preview](skills/datell-visual-report-preview/assets/saas-subscription-health-ibm-telco-preview.png)

This third public-facing example shifts from macro and export data into a business-style subscription health view. It uses the IBM telco churn dataset as a recurring-revenue proxy and demonstrates a static no-MCP `universal/bento-grid` composition with risk-led KPI cards, a contract concentration board, a tenure-by-contract heat matrix, and side-by-side service and payment comparisons.

- Preview image: `skills/datell-visual-report-preview/assets/saas-subscription-health-ibm-telco-preview.png`
- Standalone HTML: `skills/datell-visual-report-preview/assets/saas-subscription-health-ibm-telco-bento-report.html`
- Example data: `skills/datell-visual-report-preview/assets/saas-subscription-health-ibm-telco.json`
- Public source: `https://raw.githubusercontent.com/plotly/datasets/master/telco-customer-churn-by-IBM.csv`

Layout style: `universal/bento-grid`

## Real-Data Validation Pack

The public repository now includes four validation packs: one normalized internal-origin export example and three public open-dataset examples.

### Normalized sales export example

- `skills/datell-visual-report-preview/assets/real-sales-december-2024.json`
- `skills/datell-visual-report-preview/assets/real-sales-december-2024-basic-report.html`

The input pack preserves 20 real December 2024 sales rows from an exported Datell report while translating labels to English for public publication. The HTML example shows the expected static basic-report result: KPI row, one primary chart area, one narrative block, and one scorecard table with no filter controls or linkage hooks.

### Public open-dataset examples

- `skills/datell-visual-report-preview/assets/us-ag-exports-top8-2011.json`
- `skills/datell-visual-report-preview/assets/us-ag-exports-top8-2011-basic-report.html`
- `skills/datell-visual-report-preview/assets/europe-gdp-top8-2014.json`
- `skills/datell-visual-report-preview/assets/europe-gdp-top8-2014-magazine-report.html`
- `skills/datell-visual-report-preview/assets/saas-subscription-health-ibm-telco.json`
- `skills/datell-visual-report-preview/assets/saas-subscription-health-ibm-telco-bento-report.html`

These examples use public datasets and keep the output English-only. The U.S. agriculture sample demonstrates a balanced dashboard-2col fallback, the European GDP sample demonstrates a magazine-wide fallback with richer structure cards and mini image tiles, and the SaaS subscription sample demonstrates a dark bento-grid fallback with a static churn matrix and business-risk scorecards.

## Card Coverage And No-MCP Scope

The skill mirrors the full current app-side card inventory in `references/datell-card-catalog.md`, but no-MCP delivery is intentionally capability-scoped rather than one-to-one with the in-app runtime.

- Full catalog knowledge coverage: the published card catalog mirrors the current app-side card IDs so the skill can reason from the whole library.
- Direct static no-MCP coverage: KPI cards, ranked and scorecard tables, comparison blocks, pivot-style summaries, insight cards, timeline and process blocks, image-embed cards, and other narrative structure cards.
- Static-equivalent coverage: advanced charts, finance widgets, maps, org or mind-map style structures, and other richer blocks can still be used when rendered as static SVG, semantic HTML, or a safe chart engine snapshot.
- Out of scope without MCP: `filter-*` controls and any event-bus, linkage, drilldown, or cross-card state behavior.

See `skills/datell-visual-report-preview/references/datell-no-mcp-capability-matrix.md` for the detailed support tiers.

## Local Validation

Install dependencies and run the repository checks:

```bash
npm install
npm run validate
```

This validates JSON files, repository layout, eval integrity, and the runnable MCP workspace.

## Support Policy

This repository currently ships only the report-preview skill and the matching visual-report MCP runtime.

Requests outside that surface, such as memory, RAG, or unrelated application runtime features, should be handled in a separate repository or design pass.

## Repository Layout

```text
.claude-plugin/
  marketplace.json
skills/
  datell-visual-report-preview/
    SKILL.md
    assets/real-sales-december-2024.json
    assets/real-sales-december-2024-basic-report.html
    assets/us-ag-exports-top8-2011.json
    assets/us-ag-exports-top8-2011-basic-report.html
    assets/us-ag-exports-top8-2011-preview.png
    assets/europe-gdp-top8-2014.json
    assets/europe-gdp-top8-2014-magazine-report.html
    assets/europe-gdp-top8-2014-preview.png
    assets/saas-subscription-health-ibm-telco.json
    assets/saas-subscription-health-ibm-telco-bento-report.html
    assets/saas-subscription-health-ibm-telco-preview.png
    evals/evals.json
    references/datell-chart-engine-playbook.md
    references/datell-card-catalog.md
    references/datell-design-system-playbook.md
    references/datell-knowledge-index.md
    references/datell-layout-catalog.md
    references/datell-no-mcp-capability-matrix.md
    references/datell-palette-catalog.md
    references/visual-report-pattern.md
mcp/
  package.json
  README.md
  tsconfig.json
  src/index.ts
  scripts/smoke.mjs
scripts/
  validate-evals.mjs
  validate-json.mjs
  validate-layout.mjs
```
