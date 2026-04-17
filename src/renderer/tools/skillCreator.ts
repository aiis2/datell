import { v4 as uuidv4 } from 'uuid';
import type { AgentToolDefinition, DynamicToolDef, ToolParameter } from '../types';

/**
 * skill_creator tool — allows the AI agent to define and install new custom skills at runtime.
 *
 * The created skill is stored in configStore.dynamicToolDefs and becomes immediately available
 * for subsequent tool calls within the same session (after the next getAllTools() invocation).
 *
 * Security note: This tool uses `new AsyncFunction()` to execute user-defined code inside
 * the Electron renderer process. This is an intentional capability of the desktop app —
 * the user is explicitly asking the AI to create and run custom logic on their machine.
 */
export const skillCreatorTool: AgentToolDefinition = {
  name: 'skill_creator',
  description:
    '创建一个新的自定义技能（工具）并将其安装到系统中。安装后，新技能将在后续的对话中作为可用工具使用。' +
    '参数 implementation_code 是一个 JavaScript 异步函数体，接收 `args` 对象作为参数，需要返回字符串结果。' +
    '示例：const { value } = args; return `处理结果：${value}`;',
  parameters: [
    {
      name: 'skill_name',
      type: 'string',
      description: '技能的唯一名称（英文+下划线，如 calculate_tax），用作工具调用的函数名',
      required: true,
    },
    {
      name: 'skill_description',
      type: 'string',
      description: '技能的详细描述，说明该工具做什么、何时使用',
      required: true,
    },
    {
      name: 'parameters_json',
      type: 'string',
      description: 'JSON 数组，定义技能的输入参数，格式：[{"name":"param1","type":"string","description":"...","required":true}]',
      required: true,
    },
    {
      name: 'implementation_code',
      type: 'string',
      description: 'JavaScript 异步函数体，接收 args 对象，返回字符串。例：const {x, y} = args; return String(parseFloat(x) + parseFloat(y));',
      required: true,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const skillName = String(args.skill_name || '').trim();
    const skillDescription = String(args.skill_description || '').trim();
    const parametersJson = String(args.parameters_json || '[]').trim();
    const implementationCode = String(args.implementation_code || '').trim();

    if (!skillName) return '错误：skill_name 不能为空';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(skillName)) {
      return '错误：skill_name 只能包含英文字母、数字和下划线，且不能以数字开头';
    }
    if (!implementationCode) return '错误：implementation_code 不能为空';

    // Parse parameters
    let parameters: ToolParameter[];
    try {
      const parsed = JSON.parse(parametersJson);
      if (!Array.isArray(parsed)) throw new Error('不是数组');
      parameters = parsed as ToolParameter[];
    } catch (err) {
      return `错误：parameters_json 解析失败 - ${err instanceof Error ? err.message : String(err)}`;
    }

    // Validate implementation code by attempting to compile it
    try {
      // eslint-disable-next-line no-new-func
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;
      new AsyncFunction('args', implementationCode);
    } catch (err) {
      return `错误：implementation_code 语法错误 - ${err instanceof Error ? err.message : String(err)}`;
    }

    // Store in configStore (lazy import to avoid circular deps)
    const { useConfigStore } = await import('../stores/configStore');
    const store = useConfigStore.getState();

    // Check for duplicate names
    const existing = store.dynamicToolDefs.find((t) => t.name === skillName);
    if (existing) {
      // Update existing
      store.removeDynamicTool(existing.id);
    }

    const newTool: DynamicToolDef = {
      id: uuidv4(),
      name: skillName,
      description: skillDescription,
      parameters,
      code: implementationCode,
      createdAt: Date.now(),
    };

    store.addDynamicTool(newTool);

    return (
      `✅ 技能"${skillName}"已成功安装！\n\n` +
      `- 名称：${skillName}\n` +
      `- 描述：${skillDescription}\n` +
      `- 参数数量：${parameters.length}\n\n` +
      `该技能已保存，可在后续对话中通过工具调用使用。`
    );
  },
  isConcurrencySafe: () => false,
  isDestructive: () => true,
  validateInput: (args) => {
    const code = String(args.implementation_code ?? '');
    // Block dangerous APIs that could compromise the Electron renderer security boundary
    const dangerous = [
      { pattern: /\brequire\s*\(/, label: 'require()' },
      { pattern: /\bimport\s*\(/, label: 'import()' },
      { pattern: /process\.env\b/, label: 'process.env' },
      { pattern: /child_process/, label: 'child_process' },
      { pattern: /window\.electronAPI\b/, label: 'window.electronAPI' },
      { pattern: /eval\s*\(/, label: 'eval()' },
      { pattern: /new\s+Function\s*\(/, label: 'new Function()' },
    ];
    for (const { pattern, label } of dangerous) {
      if (pattern.test(code)) {
        return {
          valid: false,
          error: `安全拒绝：技能代码中包含禁止的模式 "${label}"。出于安全考虑，动态技能不允许访问系统级 API。`,
        };
      }
    }
    return { valid: true };
  },
  getActivityDescription: (args) => {
    const name = String(args.skill_name ?? '技能');
    return `安装技能: ${name}`;
  },
};
