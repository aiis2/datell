# Enterprise Plugins Directory

此目录包含企业专属插件，**不包含在开源仓库中**（已通过 `.gitignore` 排除）。

## 目录说明

```
plugins/
  enterprise-model.js   ← 企业内置模型插件（私有仓库维护）
  README.md             ← 本文档
```

## 企业模型插件接口

插件文件 `enterprise-model.js` 必须实现以下接口：

```js
module.exports = {
  /** 返回 Pro 级别企业模型的 API Key */
  getProKey() { return 'sk-...'; },
  /** 返回 Basic 级别企业模型的 API Key */
  getBasicKey() { return 'sk-...'; },
  /** 企业模型 Chat 完成接口地址 */
  entChatUrl: 'https://your-endpoint/v1/chat/completions',
  /** 可选的插件元信息 */
  pluginMeta: {
    name: 'enterprise-model',
    version: '1.0.0',
    description: '企业内置模型',
  },
};
```

## 插件加载路径（优先级由高到低）

1. `<userData>/plugins/enterprise-model.js` — 用户目录（适合生产/CI部署）
2. `<appPath>/plugins/enterprise-model.js` — 应用目录（适合内部打包版本）
3. `<项目根目录>/plugins/enterprise-model.js` — 开发环境源码树（当前目录）

## 开源模式

当未检测到插件文件时，应用自动进入开源模式：
- 企业内置模型 I/II 从模型选择器中隐藏
- 使用企业模型哨兵密钥的请求返回友好的错误提示
