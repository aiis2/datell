# Security Baseline Optimization Spec

## Issue

The remote default branch is `origin/master`; there is no `origin/main` ref in this repository. This optimization therefore targets `origin/master` as the current authoritative mainline until the repository creates or renames a `main` branch.

The current mainline has a security baseline gap:

- `npm audit --omit=dev --registry=https://registry.npmjs.org/` reports 17 production vulnerabilities.
- Several high-risk production dependencies are not referenced by application source but still ship in dependency metadata.
- User-controlled SQL, SVG markup, text file paths, and JavaScript sandbox code need explicit regression coverage around read-only and sandbox boundaries.

## Optimization Reason

Security fixes have high leverage because they reduce runtime risk without changing the product surface. The mainline currently depends on vulnerable packages and lacks durable tests for previously identified security-sensitive boundaries. Tightening those areas improves maintainability, release confidence, and future auditability.

## Plan

1. Add focused regression tests for:
   - read-only SQL guards for external datasources and embedded user DBs
   - SVG sanitization before previewing or persisting custom illustrations
   - JavaScript sandbox escape and normal `result = ...` execution behavior
   - file read authorization for renderer-initiated text reads
2. Implement small, reusable guard helpers and connect them to existing runtime paths.
3. Replace or remove vulnerable dependencies that are unused or have safer maintained equivalents.
4. Reconcile the Agent Skills publish metadata around the single installable skill surface.
5. Verify with:
   - all `tests/*.test.cjs`
   - `npx tsc --noEmit`
   - `npx tsc -p src/main/tsconfig.json`
   - `npm audit --registry=https://registry.npmjs.org/`
   - `npx vite build`

## Non-goals

- Do not rename repository branches or create a new remote `main` branch from automation.
- Do not change user-facing workflows beyond the security constraints needed to close the gaps.
- Do not run full platform packaging unless implementation touches packaging-only behavior.

## Acceptance Criteria

- Production and full npm audit both report zero vulnerabilities.
- Security regression tests fail on the current mainline and pass after the implementation.
- TypeScript and Vite production build pass.
- The implementation PR links this spec and the tracking issue.
