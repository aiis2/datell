import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Conversation, ChatMessage, FileAttachment, ToolCallInfo } from '../types';
import { useConfigStore } from './configStore';
import { useSubagentStore } from './subagentStore';
import { runReactAgent } from '../services/reactAgent';
import { consolidateSessionMemory } from '../services/memoryService';
import { dbAPI, isElectron } from '../services/dbAPI';
import { useSuggestionsStore, parseSuggestionsFromMessage } from './suggestionsStore';
import { getLocale } from '../i18n';

const CHAT_STORAGE_KEY = 'auto-report-chats';

/* ── localStorage helpers (legacy / fallback) ── */

function loadChatsFromStorage(): { conversations: Conversation[]; activeConversationId: string | null } {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        conversations: data.conversations || [],
        activeConversationId: data.activeConversationId || null,
      };
    }
  } catch { /* ignore */ }
  return { conversations: [], activeConversationId: null };
}

/* ── DB row helpers ── */

function safeParseJSON<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function rowsToConversation(convRow: any, msgRows: any[]): Conversation {
  return {
    id: convRow.id,
    title: convRow.title,
    createdAt: convRow.created_at,
    updatedAt: convRow.updated_at,
    messages: msgRows.map((r) => ({
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      thinking: r.thinking ?? undefined,
      timestamp: r.created_at,
      attachments: safeParseJSON(r.attachments, []),
      toolCalls: safeParseJSON(r.tool_calls, []),
    })),
  };
}

async function loadAllConversations(): Promise<{ conversations: Conversation[]; activeConversationId: string | null }> {
  try {
    const convRows = await dbAPI.getConversations();
    const convs: Conversation[] = [];
    for (const row of convRows) {
      const msgRows = await dbAPI.getMessages(row.id);
      convs.push(rowsToConversation(row, msgRows));
    }
    const activeId = await dbAPI.getConfig('activeConversationId');
    return { conversations: convs, activeConversationId: activeId };
  } catch (e) {
    console.error('Failed to load from DB, falling back to localStorage', e);
    return loadChatsFromStorage();
  }
}

async function persistConversation(conv: Conversation): Promise<void> {
  try {
    await dbAPI.upsertConversation({
      id: conv.id,
      title: conv.title,
      created_at: conv.createdAt,
      updated_at: conv.updatedAt,
    });
  } catch (e) {
    console.error('Failed to persist conversation', e);
  }
}

async function persistMessage(convId: string, msg: ChatMessage): Promise<void> {
  try {
    await dbAPI.upsertMessage({
      id: msg.id,
      conversation_id: convId,
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking ?? null,
      created_at: msg.timestamp,
      attachments: JSON.stringify(msg.attachments ?? []),
      tool_calls: JSON.stringify(msg.toolCalls ?? []),
    });
  } catch (e) {
    console.error('Failed to persist message', e);
  }
}

async function migrateFromLocalStorage(): Promise<void> {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const conversations: Conversation[] = data.conversations || [];
    if (conversations.length === 0) return;
    for (const conv of conversations) {
      await dbAPI.upsertConversation({
        id: conv.id,
        title: conv.title,
        created_at: conv.createdAt,
        updated_at: conv.updatedAt,
      });
      for (const msg of conv.messages) {
        await dbAPI.upsertMessage({
          id: msg.id,
          conversation_id: conv.id,
          role: msg.role,
          content: msg.content,
          thinking: msg.thinking ?? null,
          created_at: msg.timestamp,
          attachments: JSON.stringify(msg.attachments ?? []),
          tool_calls: JSON.stringify(msg.toolCalls ?? []),
        });
      }
    }
    await dbAPI.setConfig('chatsMigrated', '1');
    console.log('[chatStore] Migrated', conversations.length, 'conversations from localStorage to DB');
  } catch (e) {
    console.error('Migration failed', e);
  }
}

/* ── Types ── */

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  /** True only when the ACTIVE conversation is currently streaming */
  isStreaming: boolean;
  /** IDs of ALL conversations currently streaming (including background ones) */
  streamingConversationIds: string[];
  isInitialized: boolean;
  /** Pending ask-user question (includes the originating conversation ID) */
  pendingQuestion: { callId: string; question: string; convId: string; options?: string[] } | null;
  /** Current agent turn progress — null when idle */
  agentTurnInfo: { convId: string; current: number; max: number; estimatedTokens: number } | null;
  /** Current agent status text (e.g. 正在准备…) — null when idle */
  agentStatusMessage: string | null;

  init: () => Promise<void>;
  createConversation: () => string;
  setActiveConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, newTitle: string) => void;
  sendMessage: (content: string, attachments: FileAttachment[]) => Promise<void>;
  regenerateResponse: () => Promise<void>;
  resendMessage: (userMsgId: string) => Promise<void>;
  stopStreaming: () => void;
  answerQuestion: (answer: string) => void;
}

/** Per-conversation abort controllers (supports multiple concurrent streams) */
const abortControllers = new Map<string, AbortController>();
/** Per-conversation ask-user resolvers */
const askUserResolvers = new Map<string, (answer: string) => void>();

async function runAgentWithModel(
  convId: string,
  assistantMsgId: string,
  messagesForAgent: ChatMessage[],
  set: (partial: ChatState | Partial<ChatState> | ((state: ChatState) => ChatState | Partial<ChatState>)) => void,
  get: () => ChatState,
): Promise<void> {
  const configState = useConfigStore.getState();
  const resolvedActiveModelId = configState.models.some((m) => m.id === configState.activeModelId)
    ? configState.activeModelId
    : (configState.models.find((m) => !m.locked)?.id || configState.models[0]?.id || '');

  if (resolvedActiveModelId && resolvedActiveModelId !== configState.activeModelId) {
    useConfigStore.getState().setActiveModel(resolvedActiveModelId);
  }

  const model = configState.models.find((m) => m.id === resolvedActiveModelId);
  const CLOUD_PROVIDERS = new Set(['openai', 'anthropic', 'google', 'openrouter']);
  const requiresApiKey = model ? CLOUD_PROVIDERS.has(model.provider) : true;
  const apiKey = model?.apiKey?.trim() || '';

  if (!model || (requiresApiKey && !apiKey)) {
    set((s) => ({
      isStreaming: false,
      conversations: s.conversations.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: '\u26a0\ufe0f \u8bf7\u5148\u5728\u8bbe\u7f6e\u4e2d\u914d\u7f6e\u6a21\u578b API Key\u3002' }
                  : m
              ),
            }
          : c
      ),
    }));
    return;
  }

  const ctrl = new AbortController();
  abortControllers.set(convId, ctrl);

  const onAskUser = (callId: string, question: string, _context?: string, options?: string[]): Promise<string> => {
    return new Promise((resolve) => {
      askUserResolvers.set(convId, resolve);
      set({ pendingQuestion: { callId, question, convId, options } });
    });
  };

  try {
    // Diagnostic: log the model being used so we can trace provider-specific errors
    console.log('[chatStore] runAgentWithModel: model=', model.id, 'provider=', model.provider, 'baseUrl=', model.baseUrl);
    const agentEvents = runReactAgent(messagesForAgent, model, ctrl.signal, onAskUser);

    for await (const event of agentEvents) {
      if (ctrl.signal.aborted) break;

      const updateAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId ? updater(m) : m
                  ),
                }
              : c
          ),
        }));
      };

      switch (event.type) {
        case 'text-delta': {
          // Some models (e.g. Qwen3.5) output a bare "0" as a minimal ack
          // after tool calls. Suppress it to keep the UI clean.
          const currentMsg = get().conversations
            .find((c) => c.id === convId)?.messages
            .find((m) => m.id === assistantMsgId);
          const hasToolCalls = (currentMsg?.toolCalls?.length ?? 0) > 0;
          if (hasToolCalls && event.content.trim() === '0' && !currentMsg?.content) {
            break; // skip trivial ack token
          }
          const updatedContent = (currentMsg?.content || '') + event.content;
          // Guard: detect if the model is echoing back the system prompt verbatim.
          // Only fire when the response STARTS with the system prompt marker — this
          // Only detect echo when the response STARTS with the system prompt marker,
          // allowing for any non-letter prefix (*, ", \u201C, >, <think> etc.) but NOT
          // arbitrary text starting with a letter/CJK character, which would be a
          // false positive for thinking models or models that reference their role.
          // Echo marker includes ' ——' (em-dash pair, U+2014 U+2014) which is UNIQUE to the
          // system prompt opening line. Legitimate model replies say '我是 ReAct Report Agent'
          // or '你好，我是...' — they NEVER start with '你是 ReAct Report Agent ——'.
          const SYSTEM_ECHO_MARKER = '\u4f60\u662f ReAct Report Agent \u2014\u2014';
          // Strip non-letter prefix (*, ", \u201C curly-quote, >, etc.) so a model that
          // echoes the prompt with a markdown prefix is still caught.
          const echoStripped = updatedContent.replace(/^[^\p{L}]+/u, '');
          if (
            !hasToolCalls &&
            echoStripped.startsWith(SYSTEM_ECHO_MARKER)
          ) {
            // Replace content with a helpful error — don't stream the system prompt to user
            const echoErrMsg = useConfigStore.getState().language === 'en-US'
              ? '⚠️ Model configuration error: the current model is echoing back the system prompt and cannot work properly.\n\n1. **API Key** — ensure the API key is correctly filled in and valid\n2. **Base URL** — ensure the endpoint URL format is correct (e.g. `https://api.openai.com`)\n3. **Model name** — ensure the ModelId matches the provider\'s supported model names\n4. Try switching to a different configured model in Settings'
              : '⚠️ 模型配置异常：当前模型将系统提示词原样返回，无法正常工作。\n\n请检查以下内容：\n1. **API Key** — 确认模型 API Key 已正确填写且有效\n2. **Base URL** — 确认接口地址格式正确（如 `https://api.openai.com`）\n3. **模型名称** — 确认 ModelId 与服务商支持的模型名称一致\n4. 可在设置中切换到其他已配置好的模型重试';
            updateAssistant((m) => ({
              ...m,
              content: echoErrMsg,
            }));
            return; // Stop processing this stream
          }
          updateAssistant((m) => ({ ...m, content: m.content + event.content }));
          break;
        }
        case 'think-delta':
          updateAssistant((m) => ({ ...m, thinking: (m.thinking || '') + event.content }));
          break;
        case 'tool-call': {
          const tc: ToolCallInfo = {
            id: event.id,
            name: event.name,
            args: event.args,
            status: 'running',
          };
          updateAssistant((m) => ({ ...m, toolCalls: [...(m.toolCalls || []), tc] }));
          break;
        }
        case 'tool-result':
          updateAssistant((m) => ({
            ...m,
            toolCalls: (m.toolCalls || []).map((tc) =>
              tc.id === event.callId ? { ...tc, result: event.result, status: 'done' as const } : tc
            ),
          }));
          break;
        case 'ask-user':
          updateAssistant((m) => ({
            ...m,
            toolCalls: (m.toolCalls || []).map((tc) =>
              tc.id === event.callId ? { ...tc, status: 'running' as const } : tc
            ),
          }));
          break;
        case 'turn-info':
          set({ agentTurnInfo: { convId, current: event.current, max: event.max, estimatedTokens: event.estimatedTokens } });
          break;
        case 'agent-status':
          set({ agentStatusMessage: event.message });
          break;
        case 'error':
          updateAssistant((m) => ({
            ...m,
            content: m.content + '\n\n\u26a0\ufe0f \u9519\u8bef: ' + (event.message || '\u672a\u77e5\u9519\u8bef'),
          }));
          break;
      }
    }
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const errType = err instanceof Error ? err.constructor.name : typeof err;
      // Log full error + stack for debugging (visible in Electron DevTools / renderer console)
      console.error(`[chatStore] runAgentWithModel catch [${errType}]:`, err);
      if (err instanceof Error && err.stack) {
        console.error('[chatStore] stack trace:', err.stack);
      }

      // If the error message contains the system prompt (echo scenario — some APIs return
      // the request body as the error body, which then propagates through an unexpected path),
      // show a friendly diagnostic instead of dumping 300 chars of system prompt to the user.
      const ECHO_MARKER = '\u4f60\u662f ReAct Report Agent \u2014\u2014';
      const rawMsgStripped = rawMsg.replace(/^[^\p{L}]+/u, '');
      const isEcho = rawMsgStripped.startsWith(ECHO_MARKER);

      const displayMsg = isEcho
        ? '\u26a0\ufe0f \u6a21\u578b\u914d\u7f6e\u5f02\u5e38\uff1aAPI \u8fd4\u56de\u4e86\u8bf7\u6c42\u5185\u5bb9\u800c\u975e\u9884\u671f\u7684\u54cd\u5e94\u3002\n\n\u53ef\u80fd\u539f\u56e0\uff1a\n\u2022 \u6a21\u578b\u4e0d\u652f\u6301 Function Calling/tools \u53c2\u6570\n\u2022 API Key \u6743\u9650\u4e0d\u8db3\uff08\u5bf9\u8bdd\u8bf7\u6c42\u88ab\u62d2\uff09\n\u2022 \u7cfb\u7edf\u63d0\u793a\u8bcd\u8d85\u51fa\u4e86\u6a21\u578b\u4e0a\u4e0b\u6587\u9650\u5236\n\u2022 \u8bf7\u5c1d\u8bd5\u5207\u6362\u65e0\u5de5\u5177\u8c03\u7528\u7684\u666e\u901a\u6a21\u578b'
        : `[${errType}] ${rawMsg.substring(0, 250)}`;

      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + '\n\n' + displayMsg }
                    : m
                ),
              }
            : c
        ),
      }));
    }
  } finally {
    // Persist the final assistant message to DB
    const finalState = get();
    const finalConv = finalState.conversations.find((c) => c.id === convId);
    const finalAssistant = finalConv?.messages.find((m) => m.id === assistantMsgId);
    if (finalAssistant) {
      // If the message has empty content (e.g. Qwen model's "0" ack was filtered)
      // but completed tool calls exist, inject a readable summary so the bubble
      // is never blank after restart.
      const hasCompletedTools = (finalAssistant.toolCalls ?? []).some(
        (tc) => tc.status === 'done'
      );
      const msgToSave =
        finalAssistant.content.trim() === '' && hasCompletedTools
          ? { ...finalAssistant, content: '操作完成。' }
          : finalAssistant;
      // Update in-memory store so UI reflects the same content
      if (msgToSave !== finalAssistant) {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId ? msgToSave : m
                  ),
                }
              : c
          ),
        }));
      }
      await persistMessage(convId, msgToSave);
    }
    if (finalConv) {
      await persistConversation({ ...finalConv, updatedAt: Date.now() });
    }

    // Parse AI suggestions from the final message and push to suggestionsStore (Tech-10)
    try {
      const finalContent = typeof finalAssistant?.content === 'string' ? finalAssistant.content : '';
      const suggestions = parseSuggestionsFromMessage(finalContent);
      if (suggestions.length > 0) {
        useSuggestionsStore.getState().setSuggestions(suggestions);
      }
    } catch {
      // non-critical, never block the main flow
    }

    // Capture abort state before cleanup
    const wasAborted = abortControllers.get(convId)?.signal.aborted ?? false;
    abortControllers.delete(convId);
    askUserResolvers.delete(convId);

    // Remove this conversation from the streaming set; update isStreaming for active conv
    set((s) => {
      const streamingConversationIds = s.streamingConversationIds.filter((id) => id !== convId);
      const isStreaming = s.activeConversationId
        ? streamingConversationIds.includes(s.activeConversationId)
        : false;
      // Clear pending question if it belonged to this conversation
      const pendingQuestion = s.pendingQuestion?.convId === convId ? null : s.pendingQuestion;
      const agentTurnInfo = s.agentTurnInfo?.convId === convId ? null : s.agentTurnInfo;
      return { isStreaming, streamingConversationIds, pendingQuestion, agentTurnInfo, agentStatusMessage: null };
    });

    // Fire-and-forget: let Agent consolidate session memory asynchronously.
    // Skip if the session was manually aborted by the user.
    if (!wasAborted) {
      const configState = useConfigStore.getState();
      const model = configState.models.find((m) => m.id === configState.activeModelId);
      const finalConvMessages = get().conversations.find((c) => c.id === convId)?.messages ?? [];
      const maxRounds = configState.memoryShortTermRounds ?? 5;
      if (model && finalConvMessages.length > 1) {
        consolidateSessionMemory(finalConvMessages, model, maxRounds).catch((e) => {
          console.warn('[chatStore] memory consolidation failed:', e);
        });
      }
    }
  }
}

/* ── Store ── */

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isStreaming: false,
  streamingConversationIds: [],
  isInitialized: false,
  pendingQuestion: null,
  agentTurnInfo: null,
  agentStatusMessage: null,

  init: async () => {
    if (get().isInitialized) return;
    if (!isElectron()) {
      const saved = loadChatsFromStorage();
      set({ ...saved, isInitialized: true });
      return;
    }
    try {
      const migrated = await dbAPI.getConfig('chatsMigrated');
      const existingConvs = await dbAPI.getConversations();
      if (!migrated && existingConvs.length === 0) {
        await migrateFromLocalStorage();
      }
      const { conversations, activeConversationId } = await loadAllConversations();
      set({ conversations, activeConversationId, isInitialized: true });
    } catch (e) {
      console.error('DB init failed', e);
      const saved = loadChatsFromStorage();
      set({ ...saved, isInitialized: true });
    }
  },

  createConversation: () => {
    const id = uuidv4();
    const now = Date.now();
    const conv: Conversation = {
      id,
      title: '\u65b0\u5bf9\u8bdd',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
    }));
    persistConversation(conv).catch(console.error);
    dbAPI.setConfig('activeConversationId', id).catch(console.error);
    return id;
  },

  setActiveConversation: (id) => {
    set((s) => ({
      activeConversationId: id,
      // Update isStreaming to reflect whether the new active conv is streaming
      isStreaming: s.streamingConversationIds.includes(id),
    }));
    dbAPI.setConfig('activeConversationId', id).catch(console.error);
  },

  deleteConversation: (id) => {
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id);
      const activeConversationId =
        s.activeConversationId === id
          ? (conversations[0]?.id ?? null)
          : s.activeConversationId;
      if (activeConversationId) {
        dbAPI.setConfig('activeConversationId', activeConversationId).catch(console.error);
      }
      return { conversations, activeConversationId };
    });
    dbAPI.deleteConversation(id).catch(console.error);
  },

  renameConversation: (id, newTitle) => {
    set((s) => {
      const conversations = s.conversations.map((c) =>
        c.id === id ? { ...c, title: newTitle } : c
      );
      return { conversations };
    });
    const conv = get().conversations.find((c) => c.id === id);
    if (conv) {
      persistConversation({ ...conv, title: newTitle, updatedAt: Date.now() }).catch(console.error);
    }
  },

  sendMessage: async (content, attachments) => {
    const state = get();
    let convId = state.activeConversationId;
    if (!convId) {
      convId = state.createConversation();
    }

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      thinking: '',
      toolCalls: [],
      timestamp: Date.now(),
    };

    const conv = state.conversations.find((c) => c.id === convId);
    const lang = useConfigStore.getState().language;
    const newTitle = conv && conv.messages.length === 0 ? (content.slice(0, 30) || getLocale(lang).sidebar.newConversationTitle) : undefined;
    // Clear previous subagent todos at the start of each new message
    useSubagentStore.getState().clearTodos();
    set((s) => ({
      isStreaming: true,
      streamingConversationIds: s.streamingConversationIds.includes(convId!)
        ? s.streamingConversationIds
        : [...s.streamingConversationIds, convId!],
      conversations: s.conversations.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, userMsg, assistantMsg],
              updatedAt: Date.now(),
              ...(newTitle ? { title: newTitle } : {}),
            }
          : c
      ),
    }));

    // Ensure conversation row exists in DB BEFORE inserting messages.
    // createConversation() uses fire-and-forget persistConversation(); if we
    // here we await it explicitly the FK constraint on messages is guaranteed.
    const convToSave = get().conversations.find((c) => c.id === convId);
    if (convToSave) {
      await persistConversation(convToSave);
    }
    // Also reliably persist the active conversation ID so it survives restart.
    await dbAPI.setConfig('activeConversationId', convId!).catch(console.error);

    await persistMessage(convId!, userMsg);
    if (newTitle) {
      await dbAPI.updateConversationTitle(convId!, newTitle);
    }

    const updatedConv = get().conversations.find((c) => c.id === convId);
    const messagesForAgent = updatedConv ? updatedConv.messages.slice(0, -1) : [userMsg];

    await runAgentWithModel(convId!, assistantMsg.id, messagesForAgent, set, get);
  },

  regenerateResponse: async () => {
    const state = get();
    const convId = state.activeConversationId;
    if (!convId || state.isStreaming) return;

    const conversation = state.conversations.find((c) => c.id === convId);
    if (!conversation || conversation.messages.length === 0) return;

    const lastMsg = conversation.messages[conversation.messages.length - 1];
    if (lastMsg.role !== 'assistant') return;

    // Clear previous subagent todos so the new run starts fresh
    useSubagentStore.getState().clearTodos();

    const messagesForAgent = conversation.messages.slice(0, -1);
    const newAssistantMsg: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      thinking: '',
      toolCalls: [],
      timestamp: Date.now(),
    };

    // Delete the old assistant message from DB to avoid ghost messages on restart
    const removedIds = conversation.messages.slice(messagesForAgent.length).map((m) => m.id);
    removedIds.forEach((id) => dbAPI.deleteMessage(id).catch(console.error));

    set((s) => ({
      isStreaming: true,
      streamingConversationIds: s.streamingConversationIds.includes(convId)
        ? s.streamingConversationIds
        : [...s.streamingConversationIds, convId],
      conversations: s.conversations.map((c) =>
        c.id === convId
          ? { ...c, messages: [...messagesForAgent, newAssistantMsg], updatedAt: Date.now() }
          : c
      ),
    }));

    await runAgentWithModel(convId, newAssistantMsg.id, messagesForAgent, set, get);
  },

  resendMessage: async (userMsgId: string) => {
    const state = get();
    const convId = state.activeConversationId;
    if (!convId || state.isStreaming) return;

    const conversation = state.conversations.find((c) => c.id === convId);
    if (!conversation) return;

    const msgIdx = conversation.messages.findIndex((m) => m.id === userMsgId);
    if (msgIdx === -1) return;

    const userMsg = conversation.messages[msgIdx];
    if (userMsg.role !== 'user') return;

    // Clear previous subagent todos so the new run starts fresh
    useSubagentStore.getState().clearTodos();

    const keptMessages = conversation.messages.slice(0, msgIdx + 1);
    const newAssistantMsg: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      thinking: '',
      toolCalls: [],
      timestamp: Date.now(),
    };

    // Delete all messages after the kept user message from DB (orphaned retries/responses)
    const removedResendIds = conversation.messages.slice(msgIdx + 1).map((m) => m.id);
    removedResendIds.forEach((id) => dbAPI.deleteMessage(id).catch(console.error));

    set((s) => ({
      isStreaming: true,
      streamingConversationIds: s.streamingConversationIds.includes(convId!)
        ? s.streamingConversationIds
        : [...s.streamingConversationIds, convId!],
      conversations: s.conversations.map((c) =>
        c.id === convId
          ? { ...c, messages: [...keptMessages, newAssistantMsg], updatedAt: Date.now() }
          : c
      ),
    }));

    await runAgentWithModel(convId, newAssistantMsg.id, keptMessages, set, get);
  },

  stopStreaming: () => {
    const { activeConversationId, pendingQuestion } = get();
    // If there's a pending AG2U question, resolve it with __ABORT__ so the agent loop unblocks
    if (activeConversationId && pendingQuestion?.convId === activeConversationId) {
      const resolver = askUserResolvers.get(activeConversationId);
      if (resolver) {
        resolver('__ABORT__');
        askUserResolvers.delete(activeConversationId);
      }
      set({ pendingQuestion: null });
    }
    if (activeConversationId) {
      abortControllers.get(activeConversationId)?.abort();
    }
    // isStreaming/streamingConversationIds will be cleaned up in runAgentWithModel's finally block
  },

  answerQuestion: (answer: string) => {
    const pendingQ = get().pendingQuestion;
    if (!pendingQ) return;
    const resolver = askUserResolvers.get(pendingQ.convId);
    if (resolver) {
      resolver(answer);
      askUserResolvers.delete(pendingQ.convId);
    }
    set({ pendingQuestion: null });
  },
}));
