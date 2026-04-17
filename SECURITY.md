# Datell — Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public GitHub issue.

Instead, report it via one of the following methods:

1. **GitHub Private Security Advisory**: [https://github.com/aiis2/datell/security/advisories/new](https://github.com/aiis2/datell/security/advisories/new)
2. **Email**: Open a GitHub issue with the title `[SECURITY]` and we will respond within 48 hours.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

We will acknowledge your report within **48 hours** and aim to release a patch within **14 days** for critical issues.

## Security Considerations

Datell is a **local-first** application:

- All data (chats, reports, database credentials) is stored locally in SQLite at `datellData/`.
- No telemetry or analytics data is sent to any server.
- API keys for AI providers are stored only in the local SQLite database.
- Network requests are limited to: configured AI model endpoints, configured database connections, and URLs explicitly fetched by the `web_fetch` tool.

## Responsible Disclosure

We follow a responsible disclosure policy. Security researchers who report valid vulnerabilities will be acknowledged in the release notes (with permission).
