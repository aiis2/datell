/**
 * run_js_sandbox - execute synchronous calculations in an isolated QuickJS VM.
 */
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import type { AgentToolDefinition } from '../types';

const SANDBOX_MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;
const SANDBOX_STACK_LIMIT_BYTES = 512 * 1024;

let quickJSModulePromise: Promise<QuickJSWASMModule> | null = null;

function loadQuickJS(): Promise<QuickJSWASMModule> {
  if (!quickJSModulePromise) {
    quickJSModulePromise = Promise.all([
      import('quickjs-emscripten-core'),
      import('@jitl/quickjs-wasmfile-release-sync'),
    ]).then(([core, variant]) => core.newQuickJSWASMModuleFromVariant(variant.default));
  }
  return quickJSModulePromise;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  } catch {
    return String(value);
  }
}

function formatSandboxOutput(output: unknown, logs: string[]): string {
  const parts: string[] = [];
  if (logs.length > 0) {
    parts.push('**输出（console.log）：**\n```\n' + logs.join('\n') + '\n```');
  }
  if (output !== undefined && output !== null) {
    parts.push('**返回值：**\n```\n' + formatValue(output) + '\n```');
  }
  if (parts.length === 0) {
    parts.push('代码执行完毕，无返回值和输出。');
  }
  return parts.join('\n\n');
}

function sandboxErrorMessage(error: unknown, timeoutMs: number): string {
  const dumped = error && typeof error === 'object'
    ? error as { name?: unknown; message?: unknown }
    : null;
  const name = dumped?.name ? String(dumped.name) : '';
  const message = dumped?.message ? String(dumped.message) : formatValue(error);
  if (/interrupt/i.test(`${name} ${message}`)) {
    return `执行超时（${Math.round(timeoutMs / 1000)}秒）`;
  }
  if (/out of memory|allocation failed/i.test(`${name} ${message}`)) {
    return '执行超出内存限制';
  }
  return message || name || '未知错误';
}

async function execSandbox(code: string, timeoutMs: number): Promise<string> {
  const quickJS = await loadQuickJS();
  const runtime = quickJS.newRuntime();
  const deadline = Date.now() + timeoutMs;
  runtime.setMemoryLimit(SANDBOX_MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(SANDBOX_STACK_LIMIT_BYTES);
  runtime.setInterruptHandler(() => Date.now() >= deadline);

  const context = runtime.newContext();
  const logs: string[] = [];

  try {
    const consoleHandle = context.newObject();
    try {
      const logHandle = context.newFunction('log', (...args) => {
        logs.push(args.map((arg) => formatValue(context.dump(arg))).join(' '));
      });
      try {
        context.setProp(consoleHandle, 'log', logHandle);
        context.setProp(context.global, 'console', consoleHandle);
      } finally {
        logHandle.dispose();
      }
    } finally {
      consoleHandle.dispose();
    }

    const wrappedCode = `(() => {\n"use strict";\nlet result;\n${code}\nreturn result;\n})()`;
    const evaluated = context.evalCode(wrappedCode, 'sandbox.js', { type: 'global', strict: true });
    if (evaluated.error) {
      const error = evaluated.error.consume((handle) => context.dump(handle));
      throw new Error(sandboxErrorMessage(error, timeoutMs));
    }

    const output = evaluated.value.consume((handle) => context.dump(handle));
    return formatSandboxOutput(output, logs);
  } finally {
    try {
      context.dispose();
    } finally {
      runtime.dispose();
    }
  }
}

export const runJsSandboxTool: AgentToolDefinition = {
  name: 'run_js_sandbox',
  description:
    '在隔离的 JavaScript 运行时中执行同步计算。适用于数据统计、数组/字符串处理、数值转换和临时计算验证。' +
    '可用标准 JavaScript 内置对象与 console.log；不提供网络、文件、DOM、Electron、Node.js 或模块加载能力。' +
    '代码最后的 return 语句或 result 变量值会作为返回值输出。',
  parameters: [
    {
      name: 'code',
      type: 'string',
      description:
        '要执行的同步 JavaScript 代码。建议将最终结果赋值给 result，或使用 return 返回。' +
        '可以使用 console.log() 输出中间结果。',
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `[沙箱执行失败] ${message}`;
    }
  },

  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  getActivityDescription: () => '在隔离运行时中执行 JavaScript 代码…',
};
