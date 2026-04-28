# Changelog

All notable changes to this repository will be documented in this file.

The format is based on Keep a Changelog and this repository uses Semantic Versioning for tagged releases.

## [Unreleased]

### Added

- a normalized real-data validation pack for `datell-visual-report-preview`, including a public JSON input file and a matching static standalone HTML report example
- a public-release validation script that checks install command accuracy, MIT licensing, English-only publication, and the real-data example pack
- a public U.S. agriculture export example pack for README and skills.sh facing demos, including a public JSON subset, a static standalone HTML report, and a repository preview image

### Changed

- switched the published repository license surface from Apache-2.0 to MIT across the repository package metadata, MCP package metadata, and skill frontmatter
- documented the live skills.sh listing and the real-data validation pack in the public README
- updated the public README to show a foreign example image, direct data links, and the current skills.sh publication model

## [0.1.0] - 2026-04-24

### Added

- standalone repository workspace metadata for the Datell Agent Skills publish tree
- root validation scripts for JSON integrity, layout checks, eval integrity, and MCP smoke validation
- a runnable `@datell/mcp` stdio package for the `datell_generate_chart` visual report tool