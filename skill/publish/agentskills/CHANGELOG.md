# Changelog

All notable changes to this repository will be documented in this file.

The format is based on Keep a Changelog and this repository uses Semantic Versioning for tagged releases.

## [Unreleased]

### Added

- a normalized real-data validation pack for `datell-visual-report-preview`, including a public JSON input file and a matching static standalone HTML report example
- a public-release validation script that checks install command accuracy, MIT licensing, English-only publication, and the real-data example pack
- a public U.S. agriculture export example pack for README and skills.sh facing demos, including a public JSON subset, a static standalone HTML report, and a repository preview image
- a European GDP magazine-style example pack that exercises a second layout family, mini image cards, and richer no-MCP structure cards for README and skills.sh demos
- a SaaS subscription health example pack built from the IBM telco churn public dataset, with a dark bento-grid layout, a static risk matrix, and subscription-health scorecards
- a no-MCP capability matrix that separates full catalog knowledge coverage from static fallback support tiers
- a `frontend-design-report` alias skill so repository-name searches and installs can resolve to the same Datell report-generation workflow as the primary skill

### Changed

- switched the published repository license surface from Apache-2.0 to MIT across the repository package metadata, MCP package metadata, and skill frontmatter
- documented the live skills.sh listing and the real-data validation pack in the public README
- updated the public README to show a foreign example image, direct data links, and the current skills.sh publication model
- refreshed the README preview image as a full-page capture and added skills.sh badges plus direct install and discovery links
- expanded the README to show two layout styles and documented no-MCP support boundaries for the published card library
- added a text-first public example index to `SKILL.md` so the skills.sh detail page surfaces the published showcase set even though it does not render the repository README gallery
- expanded repository metadata and README install guidance so both the primary skill name and the repository-name alias expose the same capability surface

## [0.1.0] - 2026-04-24

### Added

- standalone repository workspace metadata for the Datell Agent Skills publish tree
- root validation scripts for JSON integrity, layout checks, eval integrity, and MCP smoke validation
- a runnable `@datell/mcp` stdio package for the `datell_generate_chart` visual report tool