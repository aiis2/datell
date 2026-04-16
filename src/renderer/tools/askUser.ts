import type { AgentToolDefinition } from '../types';

/**
 * AG2UI: ask_user tool.
 * When the model detects ambiguous or missing data, it calls this tool
 * to pause the ReAct loop and ask the user for clarification.
 *
 * The execute function here is a placeholder — the actual execution is
 * intercepted in reactAgent.ts before calling execute(), which instead emits
 * an 'ask-user' stream event and awaits a Promise resolved by the UI.
 */
export const askUserTool: AgentToolDefinition = {
  name: 'ask_user',
  description:
    '当数据存在关键歧义、缺失字段或需要用户确认时，向用户提问以获取澄清信息。' +
    '使用场景：① 日期范围不明确；② 数据中存在多种可能的度量口径；' +
    '③ 图表类型选择存在疑问；④ 关键指标定义不明。' +
    '每次只问一个最重要的问题，问题要简洁明了。',
  parameters: [
    {
      name: 'question',
      type: 'string',
      description: '要向用户提出的问题（中文，简洁，一句话）',
      required: true,
    },
    {
      name: 'context',
      type: 'string',
      description: '提问背景说明，帮助用户理解为什么需要这个信息（可选）',
      required: false,
    },
    {
      name: 'options',
      type: 'array',
      description: '可选的预设回答选项列表（中文），供用户快速选择（可选）。例如：["按月汇总","按季度汇总","按年汇总"]',
      required: false,
    },
  ],
  execute: async (args) => {
    // This should never be called directly — reactAgent intercepts it.
    return `用户回答: ${args.answer ?? '(未获取到回答)'}`;
  },
  isConcurrencySafe: () => false,
};
