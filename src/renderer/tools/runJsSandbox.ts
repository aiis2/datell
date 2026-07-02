/**
 * run_js_sandbox — 在安全沙箱中执行 JavaScript 代码
 *
 * 用于 AI 进行数据计算、统计分析、字符串/数组处理等计算任务。
 * 禁止访问 DOM、网络、文件系统等敏感 API。
 * 超时时间 10 秒，超时后强制终止。
 */
import type { AgentToolDefinition } from '../types';

const BLOCKED_GLOBALS = [
  'window', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'indexedDB', 'crypto', 'performance', 'Worker', 'SharedWorker',
  'Blob', 'File', 'FileReader', 'FormData', 'URL',
  'require', 'process', 'global', 'module', 'exports',
  '__dirname', '__filename', 'importScripts',
] as const;

const SANDBOX_FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(?:^|[^\w$])constructor\s*(?:[.(\[])/i, label: 'constructor 逃逸' },
  { pattern: /new\s+Function\s*\(/i, label: 'new Function()' },
  { pattern: /\bFunction\s*\(/i, label: 'Function()' },
  { pattern: /\beval\s*\(/i, label: 'eval()' },
  { pattern: /\b(?:globalThis|window|document|self|fetch|XMLHttpRequest|WebSocket|Worker|SharedWorker|importScripts|navigator|location|localStorage|sessionStorage|indexedDB|process|require|module|exports|global)\b/i, label: '受限全局对象' },
  { pattern: /\bwhile\s*\(\s*(?:true|1)\s*\)/i, label: '无限循环' },
  { pattern: /\bfor\s*\(\s*;\s*;\s*\)/i, label: '无限循环' },
];

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;

export function validateSandboxCode(code: string): string | null {
  for (const { pattern, label } of SANDBOX_FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return `代码包含禁止模式: ${label}`;
    }
  }
  return null;
}

function formatSandboxOutput(output: unknown, logs: string[]): string {
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
  return parts.join('\n\n');
}

function createSafeGlobals(logs: string[]): Record<string, unknown> {
  return {
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
      log: (...args: unknown[]) => {
        logs.push(args.map((a) => {
          try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
          catch { return String(a); }
        }).join(' '));
      },
    },
  };
}

async function execSandboxInline(code: string): Promise<string> {
  const logs: string[] = [];
  const safeGlobals = createSafeGlobals(logs);
  const blockedParams = BLOCKED_GLOBALS.join(', ');

  // eslint-disable-next-line no-new-func
  const fn = new AsyncFunction(
    ...Object.keys(safeGlobals),
    blockedParams,
    `"use strict";\n` +
    `let __result__ = undefined;\n` +
    `let result = undefined;\n` +
    `try {\n` +
    code + `\n` +
    `} catch(e) { throw e; }\n` +
    `return typeof result !== 'undefined' ? result : __result__;`
  );

  const output = await fn(...Object.values(safeGlobals), ...BLOCKED_GLOBALS.map(() => undefined));
  return formatSandboxOutput(output, logs);
}

function canUseBrowserWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined';
}

function buildSandboxWorkerSource(): string {
  return `
const BLOCKED_GLOBALS = ${JSON.stringify(BLOCKED_GLOBALS)};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function formatValue(value) {
  try {
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  } catch {
    return String(value);
  }
}

function formatOutput(output, logs) {
  let resultStr = '';
  if (output !== undefined && output !== null) {
    resultStr = formatValue(output);
  }
  const parts = [];
  if (logs.length > 0) {
    parts.push('**输出（console.log）：**\\n\`\`\`\\n' + logs.join('\\n') + '\\n\`\`\`');
  }
  if (resultStr) {
    parts.push('**返回值：**\\n\`\`\`\\n' + resultStr + '\\n\`\`\`');
  }
  if (parts.length === 0) {
    parts.push('代码执行完毕，无返回值和输出。');
  }
  return parts.join('\\n\\n');
}

self.onmessage = async (event) => {
  const code = String(event.data && event.data.code ? event.data.code : '');
  const logs = [];
  const safeGlobals = {
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
      log: (...args) => {
        logs.push(args.map(formatValue).join(' '));
      },
    },
  };

  for (const name of BLOCKED_GLOBALS) {
    try {
      Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false });
    } catch {}
  }

  try {
    const fn = new AsyncFunction(
      ...Object.keys(safeGlobals),
      '"use strict";\\nlet __result__ = undefined;\\nlet result = undefined;\\ntry {\\n' +
        code +
        '\\n} catch(e) { throw e; }\\nreturn typeof result !== "undefined" ? result : __result__;'
    );
    const output = await fn(...Object.values(safeGlobals));
    self.postMessage({ ok: true, value: formatOutput(output, logs) });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
`;
}

async function execSandboxInWorker(code: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const workerUrl = URL.createObjectURL(new Blob([buildSandboxWorkerSource()], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`执行超时（${Math.round(timeoutMs / 1000)}秒）`));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<{ ok: boolean; value?: string; error?: string }>) => {
      clearTimeout(timer);
      cleanup();
      if (event.data?.ok) {
        resolve(event.data.value ?? '');
      } else {
        reject(new Error(`执行错误：${event.data?.error ?? '未知错误'}`));
      }
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(`执行错误：${event.message}`));
    };
    worker.postMessage({ code });
  });
}

/** 安全执行沙箱 — 浏览器中用 Worker 隔离并强制终止超时任务 */
async function execSandbox(code: string, timeoutMs = 10000): Promise<string> {
  const forbidden = validateSandboxCode(code);
  if (forbidden) {
    throw new Error(forbidden);
  }

  if (canUseBrowserWorker()) {
    return execSandboxInWorker(code, timeoutMs);
  }

  return execSandboxInline(code);
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
