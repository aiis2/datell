# Isolated Export Runtime Compatibility Design

## Context

Issue #7 moved in-app PDF, PNG, and Excel rendering from `file://` to a locked-down `export://` origin. The new boundary correctly blocks external scripts and network requests. Existing report tools, however, describe complete HTML that may include CDN tags for ECharts, ApexCharts, or VTable. Preview strips those tags and injects packaged runtimes; PDF and PNG already inline two runtimes, while Excel still stages raw HTML.

An Electron probe on `origin/master@9853553` reproduced the compatibility gap: a local external runtime loaded and created a table in a file renderer (`cdn: true, table: true`), while the isolated export renderer correctly blocked it (`cdn: false, table: false`).

## Goals

- Keep the export security boundary from Issue #7 unchanged: no arbitrary script/network exceptions.
- Make all three in-app export paths use the same trusted built-in runtime preparation.
- Inline ECharts and ApexCharts as before, and inline VTable only when the report references it.
- Strip known CDN tags after selecting the packaged runtime, so no duplicate or blocked requests remain.
- Keep the transformation deterministic and unit-testable without importing Electron or opening a window.

## Non-Goals

- Arbitrary third-party scripts remain unsupported in the locked-down in-app export renderer.
- User-downloaded HTML bundles and interactive preview network policy remain separate optimization cycles.
- This change does not alter chart data, table extraction, themes, layouts, or the final file dialogs.

## Chosen Architecture

### Pure runtime transformation

Create `src/main/exportRuntime.ts` with a small pure API:

```ts
inlineBuiltInRuntimes(html, { echarts, apexcharts, vtable }): string
```

The function replaces known CDN `<script src>` tags with a marker and injects the available built-in runtime blocks before `</head>` (or the existing body/document fallback). It escapes literal `</script>` sequences in vendor source before embedding them. It does not fetch, read files, or access Electron globals.

VTable is selected only when the original HTML contains a case-insensitive `VTable` reference or a VTable CDN tag. This avoids adding roughly 2 MB to ordinary chart/document exports while preserving table reports. ECharts/ApexCharts retain their existing unconditional injection behavior for backward compatibility.

### Main-process integration

`main.ts` continues to read packaged vendor files through its existing `readVendorJs` helper. `injectVendorLibs` delegates JavaScript assembly to the pure transformer while retaining trusted theme/layout CSS handling. `fs:exportExcel` calls `injectVendorLibs` before staging its export job, so its table extraction sees the same runtime environment as PDF/PNG. The existing export session CSP and request filter remain unchanged; no external URL is added to the allowlist.

### Ordering and failure behavior

- Strip CDN tags before adding inline blocks, preventing duplicate initialization.
- Preserve all user inline scripts and their relative order after the head-level runtime block.
- If a packaged runtime is unavailable, leave the marker and report rendering may fail visibly; never fall back to a network URL.
- If no head/body exists, prepend the runtime block as the existing export injector does.

## Verification Strategy

- Pure unit tests cover CDN replacement, ECharts/Apex/VTable selection, `</script>` escaping, fallback insertion points, missing-runtime behavior, and no arbitrary URL injection.
- Structural tests prove Excel invokes the trusted injector and that the injector reads packaged VTable rather than adding a network exception.
- Electron smoke loads inline built-in runtimes under the real export CSP and verifies ECharts, ApexCharts, VTable, and script-created table signals without network requests.
- A red compatibility probe on the mainline remains part of the PR evidence.
- Full existing tests, TypeScript, production build, audits, and Issue #7 isolation smoke remain required.

## Follow-Ups

- Add a safe viewer or self-contained asset policy for user-downloaded interactive HTML bundles.
- Audit preview network mediation separately.
