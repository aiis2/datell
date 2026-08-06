# Skills Install-From-URL Allowlist Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse non-GitHub HTTPS skill install URLs before any network/file fetch.

**Architecture:** Pure `assertAllowedSkillInstallUrl` (or equivalent) at the top of `installSkillFromUrl`; keep marketplace + raw GitHub flows.

**Issue:** #141

---

### Task 1: Red tests

Create or extend tests (prefer `tests/skills-install-url-allowlist.test.cjs`):

1. Export/load allowlist helper from shipped module.
2. Reject: `http://127.0.0.1/...`, `http://169.254.169.254/...`, `file://...`, `ftp://...`, `https://evil.example/...`, empty, non-string — with stable error; mock `fetchContent` must **not** be called.
3. Allow (normalize/pass): `https://github.com/owner/repo`, `https://github.com/owner/repo#skill`, `https://raw.githubusercontent.com/owner/repo/main/skill.json`, blob URLs that rewrite to raw.
4. Existing marketplace install (`tests/skills-install-from-url.test.cjs`) still green after fix.

Commit: `test: reproduce skill install URL SSRF`

### Task 2: Implement

1. Add allowlist helper + wire `installSkillFromUrl`.
2. Keep error messages stable for product tests.

Commit: `fix: allowlist skill installFromUrl to GitHub HTTPS`

### Task 3: Verify

```bash
node --test tests/skills-install-url-allowlist.test.cjs
node --test tests/skills-install-from-url.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
