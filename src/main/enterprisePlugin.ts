/**
 * Enterprise Plugin Interface — src/main/enterprisePlugin.ts
 *
 * Defines the contract that an enterprise model plugin must implement.
 * The plugin is a compiled CommonJS `.js` file loaded at runtime via
 * require() from one of several candidate directories.
 *
 * The plugin itself is NOT part of the open-source codebase.
 * It lives in `plugins/enterprise-model.js` which is excluded via .gitignore.
 *
 * Priority search order (first match wins):
 *   1. <electron userData>/plugins/enterprise-model.js   (user-installed override)
 *   2. <app dir>/plugins/enterprise-model.js             (bundled with private build)
 *   3. <__dirname>/../../plugins/enterprise-model.js     (dev mode source tree)
 */

export interface EnterprisePlugin {
  /** Returns the Pro-tier enterprise API key string */
  getProKey(): string;
  /** Returns the Basic-tier enterprise API key string */
  getBasicKey(): string;
  /** The enterprise chat completions endpoint URL */
  entChatUrl: string;
  /** Optional metadata for diagnostics */
  pluginMeta?: {
    name: string;
    version: string;
    description?: string;
  };
}
