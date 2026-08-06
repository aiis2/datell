# Skills Install-From-URL Allowlist Design

## Mainline

This design starts from authoritative `origin/master@171537d` and addresses Issue #141.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`installSkillFromUrl` (IPC `skills:installFromUrl`) eventually calls `fetchContent(url)` for arbitrary renderer-supplied strings. After the GitHub-repo special case, a fall-through path accepts any URL (including `http://127.0.0.1`, link-local metadata hosts, `file://`, and non-GitHub HTTPS).

Product tests only cover the GitHub marketplace happy path. The IPC uses Electron `net.request`, so blocked-by-policy must happen in the pure installer before fetch.

## Invariant

Skill install URLs must be **HTTPS GitHub-family only**:

| Allowed shape | Purpose |
|---------------|---------|
| `https://github.com/<owner>/<repo>` optional `.git` / `#skillName` | Marketplace / repo install |
| `https://github.com/.../blob/...` | Rewritten to raw.githubusercontent.com |
| `https://raw.githubusercontent.com/<owner>/<repo>/...` | Direct skill JSON |

Refuse before any `fetchContent`:

- non-string / empty
- non-`https:` schemes (`http:`, `file:`, `ftp:`, …)
- hosts other than `github.com` and `raw.githubusercontent.com`
- credentials in URL userinfo if present (reject)
- after rewrite, fetch targets must still be raw.githubusercontent.com or github.com marketplace flow internals already constructed by the helper

Stable error, e.g. `Skill install URL must be an https GitHub or raw.githubusercontent.com URL`.

## Chosen Design

### Pure allowlist + normalize helper

1. Export `assertAllowedSkillInstallUrl(url: unknown): string` (or `normalizeSkillInstallUrl`) from `skillsInstallFromUrl.ts` (or tiny sibling module) that:
   - Trims string input.
   - Parses with `URL` (or careful regex); rejects invalid.
   - Requires protocol `https:`.
   - Requires hostname exactly `github.com` or `raw.githubusercontent.com` (case-insensitive).
   - Rejects username/password userinfo.
   - Optionally normalizes trailing slashes; returns canonical string for further processing.
2. Call it at the start of `installSkillFromUrl` on the user-supplied URL.
3. Keep existing github.com repo regex flow and blob→raw rewrite **after** allowlist (rewrite output is already raw.githubusercontent.com).
4. Fall-through direct JSON fetch only for allowlisted raw (or github blob rewritten to raw).

Internal marketplace fetches built as `` `https://raw.githubusercontent.com/${owner}/${repo}/main/...` `` remain fine (not user-controlled host).

### Alternatives Rejected

| Option | Why not |
|--------|---------|
| Block only private IP ranges | Incomplete (file://, evil public hosts still install malware skills) |
| Trust renderer URL validation | Not an integrity boundary |
| Allow any https host | Product does not need general skill CDN; increases supply-chain surface |
| Disable installFromUrl entirely | Breaks documented GitHub skill install |

## Verification Strategy

1. RED: `http://127.0.0.1/...` and `https://evil.example/...` currently reach `fetchContent` and can succeed with a cooperative mock.
2. GREEN: those return `{ ok: false, error: ... }` with **zero** fetch calls; GitHub marketplace install still succeeds.
3. Full CJS suite + both tsc projects.
