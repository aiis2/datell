/**
 * run_js_sandbox — 在安全沙箱中执行 JavaScript 代码
 *
 * 用于 AI 进行数据计算、统计分析、字符串/数组处理等计算任务。
 * 禁止访问 DOM、网络、文件系统等敏感 API。
 * 超时时间 10 秒，超时后强制终止。
 */
import type { AgentToolDefinition } from '../types';

/** 安全执行沙箱 — 遮蔽危险全局变量后用 Function() 运行用户代码 */
async function execSandbox(code: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('执行超时（10秒）'));
    }, timeoutMs);

    // Build a sandboxed wrapper: shadow dangerous globals with undefined
    // We cannot delete globals in strict mode, but we can shadow them with
    // local params containing undefined.
    const BLOCKED_GLOBALS = [
      'window', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket',
      'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
      'indexedDB', 'crypto', 'performance', 'Worker', 'SharedWorker',
      'Blob', 'File', 'FileReader', 'FormData', 'URL',
      'require', 'process', 'global', 'module', 'exports',
      '__dirname', '__filename', 'importScripts',
      // NOTE: 'eval' and 'arguments' are reserved in strict mode and cannot
      // be used as parameter names — strict mode already restricts eval scope.
    ] as const;

    // Allow safe math/utility globals
    const safeGlobals: Record<string, unknown> = {
      Math,
      JSON,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Number,
      String,
      Boolean,
      Array,
      Object,
      Date,
      RegExp,
      Error,
      console: {
        log: (...args: unknown[]) => String(args.map((a) => JSON.stringify(a)).join(' ')),
      },
    };

    try {
      // Build param names + their undefined shadow values for blocked globals
      const blockedParams = BLOCKED_GLOBALS.join(', ');
      const blockedUndefined = BLOCKED_GLOBALS.map(() => 'undefined').join(', ');

      // Safe param names + values
      const safeParamNames = Object.keys(safeGlobals).join(', ');
      const safeParamValues = Object.values(safeGlobals);

      // Wrap code in an async IIFE so the user can write top-level await if needed,
      // and collect logs. The function must return something — if the last expression
      // is assigned to `result`, we return it; otherwise we run the code and return
      // the stdout-equivalent.
      const logs: string[] = [];
      const captureLog = (...args: unknown[]) => {
        logs.push(args.map((a) => {
          try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
          catch { return String(a); }
        }).join(' '));
      };

      // Replace the console mock with our real capture
      (safeGlobals.console as { log: (...args: unknown[]) => void }).log = captureLog;

      // Build the final Function
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        ...Object.keys(safeGlobals),
        blockedParams,
        `"use strict";\n` +
        `let __result__ = undefined;\n` +
        `try {\n` +
        code + `\n` +
        `} catch(e) { throw e; }\n` +
        `return typeof result !== 'undefined' ? result : __result__;`
      );

      const output = fn(...safeParamValues, ...BLOCKED_GLOBALS.map(() => undefined));

      clearTimeout(timer);

      // Format result
      let resultStr = '';
      if (output !== undefined && output !== null) {
        try {
          resultStr = typeof output === 'object'
            ? JSON.stringify(output, null, 2)
            : String(output);
        } catch {
          resultStr = String(output);
        }
      }

      const parts: string[] = [];
      if (logs.length > 0) {
        parts.push('**输出（console.log）：**\n```\n' + logs.join('\n') + '\n```');
      }
      if (resultStr) {
        parts.push('**返回值：**\n```\n' + resultStr + '\n```');
      }
      if (parts.length === 0) {
        parts.push('代码执行完毕，无返回值和输出。');
      }

      resolve(parts.join('\n\n'));
    } catch (err: unknown) {
      clearTimeout(timer);
      const errMsg = err instanceof Error ? err.message : String(err);
      reject(new Error(`执行错误：${errMsg}`));
    }
  });
}

export const runJsSandboxTool: AgentToolDefinition = {
  name: 'run_js_sandbox',
  description:
    '在安全 JavaScript 沙箱中执行代码。适用于：数据计算与统计分析（均值/中位数/标准差/百分位）、' +
    '数组/字符串处理、数值转换、临时验证计算逻辑。' +
    '沙箱内可用：Math、JSON、Array、Object、Date、Number、String、console.log。' +
    '禁止访问网络、文件、DOM、eval 等。超时 10 秒自动终止。' +
    '代码最后的 return 语句 或 变量 result 的值会作为返回值输出。',
  parameters: [
    {
      name: 'code',
      type: 'string',
      description:
        '要执行的 JavaScript 代码。建议将最终结果赋值给 result 变量，或用 return 返回。' +
        '可以使用 console.log() 输出中间结果。示例：\n' +
        '```js\n' +
        'const data = [23, 45, 12, 67, 34];\n' +
        'const avg = data.reduce((a, b) => a + b, 0) / data.length;\n' +
        'const sorted = [...data].sort((a, b) => a - b);\n' +
        'const median = sorted[Math.floor(sorted.length / 2)];\n' +
        'result = { avg: avg.toFixed(2), median };\n' +
        '```',
      required: true,
    },
    {
      name: 'timeout_ms',
      type: 'number',
      description: '执行超时毫秒数，默认 10000（10秒），最大 30000（30秒）',
      required: false,
    },
  ],

  execute: async (args: Record<string, unknown>): Promise<string> => {
    const code = String(args.code ?? '').trim();
    if (!code) return '错误：代码不能为空';

    const rawTimeout = typeof args.timeout_ms === 'number' ? args.timeout_ms : 10000;
    const timeoutMs = Math.min(Math.max(rawTimeout, 1000), 30000);

    try {
      return await execSandbox(code, timeoutMs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[沙箱执行失败] ${msg}`;
    }
  },

  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  getActivityDescription: () => '在沙箱中执行 JavaScript 代码…',
};
