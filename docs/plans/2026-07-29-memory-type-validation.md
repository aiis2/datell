# Memory Type Path Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse non-allowlisted memory `type` values so IPC cannot read/write outside the memory directory.

**Architecture:** Pure helper in `src/main/memoryPaths.ts`; call from `main.ts` memory handlers.

**Issue:** #129

---

### Task 1: Red tests

Create `tests/memory-type-validation.test.cjs`:

1. Load shipped `resolveMemoryFilePath` (or equivalent) from `src/main/memoryPaths.ts`.
2. `long_term` / `short_term` resolve to `<dir>/long_term.md` and `<dir>/short_term.md`.
3. `../escape`, `../../x`, `foo/bar`, `''`, non-strings throw.
4. Resolved paths for valid types stay under the provided memory dir.

Commit: `test: reproduce memory type path escape`

### Task 2: Implement

1. Add `src/main/memoryPaths.ts` with allowlist + resolve.
2. Update `src/main/main.ts` memory handlers to use it.

Commit: `fix: validate memory type on IPC path resolve`

### Task 3: Verify

```bash
node --test tests/memory-type-validation.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
