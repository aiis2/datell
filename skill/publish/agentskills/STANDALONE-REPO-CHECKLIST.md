# Standalone Repository Checklist

This note captures what still needs to be added before `skill/publish/agentskills/` can be split into a fully self-contained public repository.

## Already Self-Contained

- The publish tree already contains a skill entry point, eval definitions, reference playbooks, and marketplace metadata.
- The fallback path can generate standalone HTML without requiring the current workspace at runtime.
- The MCP-first decision tree is documented inside the publishable skill itself.

## Remaining Gaps

### 1. Host Integration Contract

The skill references optional host features such as a preloaded chart runtime, `window.__APEX_PALETTE__`, and `window.__REPORT_EVENT_BUS__`.

- publish a short host contract document describing which globals are optional
- define the required behavior when none of those globals exist
- keep the standalone HTML path as the default compatibility floor

### 2. Reusable Assets And Templates

The documentation is strong, but the extracted repository still does not ship reusable starter assets.

- add one or more starter HTML templates
- add a shared CSS token snippet or a small theme starter file
- add a minimal example output for ECharts and ApexCharts

### 3. Release And Versioning Strategy

The extracted repository needs its own release process.

- define version bump rules for skill-only changes versus MCP runtime changes
- publish tagged releases for marketplace consumers
- document how `.claude-plugin/marketplace.json` versioning should be updated

## Practical Recommendation

If the goal is to publish quickly with the least moving parts:

1. Publish this repository with the current standalone validation harness.
2. Keep the MCP runtime scoped to `datell_generate_chart` until the host contract expands.
3. Add host-contract and template assets before the first broader public rollout.

This keeps the first public package self-contained while preserving a narrow and explicit runtime surface.