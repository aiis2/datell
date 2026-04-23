---
name: datell-visual-report-preview-composer
description: Create or review Datell custom skills that should output a visual report preview by composing full HTML and delegating the final render to callTool("generate_chart", ...). Use this when the goal is to make a skill behave like an Agent-generated report instead of returning plain text.
compatibility: Requires the current Datell script-skill runtime where callTool(name, args) can invoke enabled built-in tools.
---

# Datell Visual Report Preview Composer

Use this skill when authoring, reviewing, or explaining a Datell custom skill whose main job is to create a visible report in the preview panel.

## Goal

Make a custom skill produce the same kind of visible result as an Agent report flow:

1. normalize skill arguments into chart-ready data
2. build a complete HTML document
3. call `await callTool("generate_chart", { html, title })`
4. let Datell route the report into the existing preview/history pipeline

## Required implementation pattern

1. Treat the skill as an orchestrator, not as the final renderer.
2. Build a full HTML document with title, viewport, chart container, and chart bootstrapping script.
3. Prefer ECharts for the baseline example unless the requirement explicitly needs another built-in report tool.
4. Return the awaited result of `callTool("generate_chart", ...)` so the user sees the normal report success message and preview update.

## Do

- sanitize user-facing strings before embedding them into HTML
- provide fallback demo data so the skill still renders a meaningful preview when arguments are omitted
- keep the HTML self-contained enough for the preview pipeline to render it reliably
- use built-in report tools for the final render step instead of inventing a parallel storage path

## Do not

- return raw HTML as plain text and expect the preview panel to open automatically
- recursively call another script-backed custom skill from within the skill
- skip the full HTML document structure required by `generate_chart`
- describe the skill as successful unless the built-in tool call succeeded

## Example pattern

```javascript
const title = String(args.title ?? 'Revenue Overview');
const html = `<!doctype html><html>...</html>`;
return await callTool('generate_chart', { html, title });
```

## Expected output behavior

When implemented correctly, the skill should:

- return the normal `generate_chart` success message
- add a new report into Datell history
- open the preview panel with the generated chart report

## Repository example

See `skill/examples/visual-report-smoke.skill.json` for the tracked reference implementation.
