# Datell Knowledge Index

Use this index when the installable skill needs to stay aligned with the current Datell report builder instead of a trimmed-down demo subset.

## What This Index Covers

- Built-in layout IDs from the current report design manifest.
- Built-in palette IDs from the current Datell palette preset registry.
- Built-in card component IDs from the current Datell card catalog.
- The no-MCP standalone contract for generating a static basic report without interactivity or linkage.

## How To Use It

1. Choose one layout ID from [datell-layout-catalog.md](datell-layout-catalog.md).
2. Choose one palette ID from [datell-palette-catalog.md](datell-palette-catalog.md).
3. Choose the card component IDs from [datell-card-catalog.md](datell-card-catalog.md).
4. Translate those choices into the Datell shell described in [visual-report-pattern.md](visual-report-pattern.md).
5. If MCP is unavailable, follow the static fallback rules in [visual-report-pattern.md](visual-report-pattern.md) and do not emit filter controls, event-bus hooks, or cross-card linkage.

## Selection Order

Always keep the same ordering discipline as the Datell app:

1. Layout first.
2. Palette second.
3. Card selection third.
4. Chart engine after the shell is already decided.

## Mapping Notes

- Layout IDs and palette IDs should be used verbatim.
- Card catalog IDs are the app-side picker IDs. The standalone HTML still uses the Datell report shell and card classes from [visual-report-pattern.md](visual-report-pattern.md).
- Chart component IDs represent chart archetypes that should live inside the shared `chart-card` plus `chart-container` shell.
- Filter component IDs are part of the current app catalog, but they are intentionally out of bounds for the no-MCP basic-report fallback.

## Detailed Catalogs

- [datell-layout-catalog.md](datell-layout-catalog.md)
- [datell-palette-catalog.md](datell-palette-catalog.md)
- [datell-card-catalog.md](datell-card-catalog.md)
