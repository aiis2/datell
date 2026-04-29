# 1.0.2 打包版启动白屏排查

## 根因

- v1.0.2 将 Electron 主进程入口从 `dist-electron/main.js` 调整为 `dist-electron/main/main.js`。
- `src/main/main.ts` 中 `app://` 协议仍按 `path.join(__dirname, '../dist')` 解析渲染产物目录。
- 打包后 `__dirname` 变为应用包内的 `dist-electron/main`，因此协议会错误指向 `dist-electron/dist/index.html`，而真实文件位于应用根下的 `dist/index.html`。
- 结果是渲染页无法加载，主窗口不会进入 `ready-to-show`，10 秒 fallback 强制显示后看到的就是空白窗口。

## 影响范围

- Windows、macOS、Linux 都会受到同一类问题影响。
- 三个平台的 GitHub Actions workflow 都复用同一份 `package.json`、`src/main/tsconfig.json` 和 `src/main/main.ts` 启动逻辑，差异只在 `electron-builder` 的目标平台参数。

## 修复思路

- 不再依赖主进程产物所在目录层级推导 `dist`。
- 统一优先从应用根目录 `app.getAppPath()/dist` 查找渲染产物，再兼容旧的相对路径回退。

## 本次验证

- `node tests/main-dist-paths.test.cjs`
- `node tests/startup-smoke-helpers.test.cjs`
- `npx tsc -p src/main/tsconfig.json`
- `node scripts/verify-main-window.cjs`
- `node scripts/smoke-packaged-startup.cjs`