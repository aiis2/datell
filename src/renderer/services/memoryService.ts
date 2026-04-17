/**
 * Memory Service
 *
 * Provides short-term (session) and long-term (persistent) memory using
 * Markdown files stored in {DATA_DIR}/memory/.
 *
 * Design inspired by OpenClaw / mem0 memory pattern:
 * - Long-term memory: knowledge that persists across sessions (facts, preferences, key context)
 *   Managed exclusively by the Agent via consolidateSessionMemory() — fully rewritten each time
 *   to merge, de-duplicate and update facts from the just-completed conversation.
 * - Short-term memory: rolling session summaries, configurable how many rounds to keep.
 *   Each session adds a new timestamped summary block at the top; old blocks are pruned.
 *
 * The user can only VIEW these files in the Settings drawer (read-only), not edit them.
 */

import type { ChatMessage, ModelConfig } from '../types';

type MemoryType = 'long_term' | 'short_term';

function getElectronAPI(): any {
  return (window as any).electronAPI;
}

/** Read the full content of a memory file. Returns empty string if not available. */
export async function readMemory(type: MemoryType): Promise<string> {
  const api = getElectronAPI();
  if (!api?.memoryRead) return '';
  try {
    return await api.memoryRead(type);
  } catch {
    return '';
  }
}

/** Overwrite the entire content of a memory file. */
export async function writeMemory(type: MemoryType, content: string): Promise<void> {
  const api = getElectronAPI();
  if (!api?.memoryWrite) return;
  await api.memoryWrite(type, content);
}

/** Append a dated entry to a memory file. */
export async function appendMemory(type: MemoryType, entry: string): Promise<void> {
  const api = getElectronAPI();
  if (!api?.memoryAppend) return;
  await api.memoryAppend(type, entry);
}

/** Clear all content from a memory file. */
export async function clearMemory(type: MemoryType): Promise<void> {
  const api = getElectronAPI();
  if (!api?.memoryClear) return;
  await api.memoryClear(type);
}

/**
 * Build a memory context string to inject into the system prompt.
 * Returns an empty string if both memory stores are empty.
 */
export async function buildMemoryContext(): Promise<string> {
  const [longTerm, shortTerm] = await Promise.all([
    readMemory('long_term'),
    readMemory('short_term'),
  ]);

  const parts: string[] = [];
  if (longTerm.trim()) {
    parts.push(`## 长期记忆（持久知识与用户偏好）\n${longTerm.trim()}`);
  }
  if (shortTerm.trim()) {
    parts.push(`## 近期会话摘要（最近几轮的工作记录）\n${shortTerm.trim()}`);
  }

  if (parts.length === 0) return '';
  return `\n## 记忆上下文（请在回复时参考以下记忆内容）\n${parts.join('\n\n')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent-driven memory consolidation (called after each session ends)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prune the short-term memory file to keep only the latest `maxRounds` session blocks.
 * Each block starts with a "## 会话摘要 ..." heading line.
 */
function pruneShortTermByRounds(content: string, maxRounds: number): string {
  if (maxRounds <= 0) return '';
  // Split on section headings "## 会话摘要"
  const parts = content.split(/(?=^## 会话摘要)/m).filter((p) => p.trim());
  if (parts.length <= maxRounds) return content;
  return parts.slice(0, maxRounds).join('\n\n');
}

/**
 * Consolidate the completed session into long-term and short-term memory.
 *
 * Long-term: LLM rewrites the entire long-term memory file in a structured
 *   markdown format, merging existing facts with newly learned ones from this
 *   session (de-duplicated, better organised).
 *
 * Short-term: A concise summary of the current session is prepended to the
 *   short-term file. Old entries are pruned so only `maxShortTermRounds`
 *   session blocks are kept.
 *
 * This function runs fire-and-forget after a conversation ends; it never
 * blocks the UI and errors are silently logged.
 */
export async function consolidateSessionMemory(
  messages: ChatMessage[],
  model: ModelConfig,
  maxShortTermRounds = 5,
): Promise<void> {
  try {
    // Build a compact conversation transcript (role + first 2000 chars per message)
    const transcript = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => {
        const text = m.content.slice(0, 2000);
        const suffix = m.content.length > 2000 ? '...(截断)' : '';
        return `**${m.role === 'user' ? '用户' : '助手'}**: ${text}${suffix}`;
      })
      .join('\n\n');

    if (!transcript.trim()) return;

    const existingLongTerm = await readMemory('long_term');
    const existingShortTerm = await readMemory('short_term');

    const now = new Date().toLocaleString('zh-CN');

    // ── Step 1: rewrite long-term memory ──────────────────────────────────────
    const ltPrompt = `你是一个专业的记忆管理助手。你的任务是分析一段对话记录，结合已有的长期记忆，生成一份新的、完整的长期记忆文档。

## 已有长期记忆
${existingLongTerm.trim() || '（暂无）'}

## 本次对话记录
${transcript}

## 要求
请输出一份新的 Markdown 格式长期记忆文档，要求：
1. **完整重写**：不是追加，而是对已有记忆 + 本次新知识进行合并整理，去重，消除矛盾
2. **结构化分类**：按以下类别组织（只输出有内容的类别）：
   - ### 用户偏好与习惯（报表风格偏好、图表类型偏好、语言习惯等）
   - ### 数据与业务背景（用户的数据结构、业务指标定义、行业背景）
   - ### 已确认的技术事实（已验证有效的配置、工具使用规律）
   - ### 历史问题与解决方案（曾遇到的问题和对应解决方法）
3. **简洁清晰**：每条记忆用 bullet point，不超过两行，只保留有实际参考价值的内容
4. **去除过时信息**：如果新对话中有信息与旧记忆矛盾，以新信息为准
5. **只输出 Markdown 文档本身**，不要有任何解释性前言或结论

更新时间：${now}`;

    // ── Call LLM for long-term memory rewrite ────────────────────────────────
    const ltResult = await callMemoryLLM(model, ltPrompt);
    if (ltResult.trim()) {
      await writeMemory('long_term', `<!-- 最后更新: ${now} -->\n\n${ltResult.trim()}\n`);
    }

    // ── Step 2: prepend a session summary to short-term memory ───────────────
    const stPrompt = `你是一个专业的记忆管理助手。请将以下对话记录浓缩为一段简短的会话摘要（不超过200字），用中文写，以 bullet point 格式，只记录本次会话中完成了什么、用到了什么数据、生成了哪些报表，以及任何对下次会话有帮助的关键信息。不要包含通用废话，只写有实际参考价值的内容。

## 本次对话记录
${transcript}

只输出摘要内容本身，不要有前言或结语。`;

    const stSummary = await callMemoryLLM(model, stPrompt);
    if (stSummary.trim()) {
      const newBlock = `## 会话摘要 ${now}\n${stSummary.trim()}`;
      // Prepend new summary, then prune to maxShortTermRounds
      const combined = newBlock + (existingShortTerm.trim() ? '\n\n' + existingShortTerm.trim() : '');
      const pruned = pruneShortTermByRounds(combined, maxShortTermRounds);
      await writeMemory('short_term', pruned + '\n');
    }
  } catch (err) {
    console.warn('[memoryService] consolidateSessionMemory failed (non-fatal):', err);
  }
}

/**
 * Call the LLM once (non-streaming) to generate a memory consolidation result.
 * Uses a minimal single-turn request to avoid overhead.
 */
async function callMemoryLLM(model: ModelConfig, prompt: string): Promise<string> {
  const { streamChat } = await import('./llmService');

  const messages = [
    { role: 'user' as const, content: prompt },
  ];

  let result = '';

  try {
    const stream = streamChat(model, messages, [], undefined);
    for await (const event of stream) {
      if (event.type === 'text-delta') {
        result += event.content;
      }
    }
  } catch (err) {
    console.warn('[memoryService] callMemoryLLM error:', err);
  }

  return result;
}
