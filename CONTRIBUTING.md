# Contributing to Datell

Thank you for your interest in contributing! This document outlines how to get involved.

---

## Ways to Contribute

- **Bug reports** — Open an issue using the bug report template
- **Feature requests** — Open an issue using the feature request template
- **Code contributions** — Fork the repo, make changes, and submit a pull request
- **Documentation** — Improve README, inline comments, or add examples
- **Translations** — Improve or add locale files under `src/renderer/i18n/locales/`

---

## Development Setup

**Prerequisites:** Node.js 20+, npm 9+, Git

```bash
git clone https://github.com/aiis2/datell.git
cd datell
npm install
npm run dev
```

The app launches via Electron with hot-reload enabled for the renderer process.

**Build a distributable package:**

```bash
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

---

## Code Style

- TypeScript strict mode is enabled — no implicit `any`
- Formatter: Prettier (config in `package.json`)
- Linter: ESLint — run `npm run lint` before submitting
- Components live in `src/renderer/components/`
- Main-process code lives in `src/main/`
- i18n strings go in `src/renderer/i18n/locales/en-US.ts` and `zh-CN.ts`

---

## Submitting a Pull Request

1. Fork the repository and create a branch from `master`
2. Make your changes with clear, focused commits
3. Run `npm run lint` and ensure there are no type errors (`npx tsc --noEmit`)
4. Open a pull request and describe what your change does and why
5. Link any related issues in the PR description

---

## Issue Guidelines

- Search existing issues before opening a new one
- Provide steps to reproduce for bug reports
- For feature requests, explain the use case, not just the implementation idea

---

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
