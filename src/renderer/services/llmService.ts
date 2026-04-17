import type { ModelConfig, StreamEvent } from '../types';

/** OpenAI-style multimodal content part */
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface NormalizedMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentPart[];
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/* ================ Streaming Fetch Helper ================ */

let streamIdCounter = 0;

/**
 * Perform a streaming fetch. When running in Electron, routes through IPC
 * to bypass CORS. Falls back to browser fetch otherwise.
 */
async function* streamingFetch(
  url: string,
  options: { method: string; headers: Record<string, string>; body: string },
  signal?: AbortSignal
): AsyncGenerator<{ type: 'status'; status: number } | { type: 'chunk'; text: string } | { type: 'error'; text: string } | { type: 'done' }> {
  const api = window.electronAPI;
  if (api?.fetchStream) {
    // Electron IPC path (no CORS)
    const requestId = `stream-${++streamIdCounter}-${Date.now()}`;
    type StreamMsg = { type: string; status?: number; statusText?: string; text?: string };
    const queue: StreamMsg[] = [];
    let resolve: (() => void) | null = null;
    let finished = false;

    const cleanup = api.onFetchStreamData((rid: string, data: StreamMsg) => {
      if (rid !== requestId) return;
      queue.push(data);
      if (data.type === 'done' || data.type === 'error') finished = true;
      resolve?.();
    });

    const abortHandler = () => {
      api.fetchStreamAbort(requestId);
      finished = true;
      resolve?.();
    };
    signal?.addEventListener('abort', abortHandler);

    // Start the stream (fire and forget - data comes via events)
    api.fetchStream(requestId, url, options).catch(() => {
      finished = true;
      resolve?.();
    });

    try {
      while (true) {
        if (queue.length === 0 && !finished) {
          await new Promise<void>((r) => { resolve = r; });
          resolve = null;
        }

        while (queue.length > 0) {
          const msg = queue.shift()!;
          if (msg.type === 'status') {
            yield { type: 'status', status: msg.status! };
          } else if (msg.type === 'chunk') {
            yield { type: 'chunk', text: msg.text! };
          } else if (msg.type === 'error') {
            yield { type: 'error', text: msg.text || 'Fetch error' };
            return;
          } else if (msg.type === 'done') {
            yield { type: 'done' };
            return;
          }
        }

        if (finished && queue.length === 0) {
          yield { type: 'done' };
          return;
        }
      }
    } finally {
      cleanup();
      signal?.removeEventListener('abort', abortHandler);
    }
  } else {
    // Browser fallback.
    // In Vite dev mode (import.meta.env.DEV is tree-shaken to false in production
    // builds), route external HTTPS requests through the /dev-llm-proxy middleware
    // to avoid browser CORS restrictions when testing without Electron.
    let fetchUrl = url;
    const fetchHeaders = { ...options.headers };
    if (import.meta.env.DEV) {
      let parsedFetchUrl: URL | null = null;
      try { parsedFetchUrl = new URL(url); } catch { /* invalid url, leave as-is */ }
      if (parsedFetchUrl && parsedFetchUrl.protocol === 'https:' && parsedFetchUrl.hostname !== 'localhost') {
        fetchHeaders['x-dev-proxy-target'] = url;
        fetchUrl = '/dev-llm-proxy';
      }
    }
    const response = await fetch(fetchUrl, {
      method: options.method,
      headers: fetchHeaders,
      body: options.body,
      signal,
    });

    yield { type: 'status', status: response.status };

    if (!response.ok) {
      const text = await response.text();
      yield { type: 'error', text };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', text: 'No response body' }; return; }

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield { type: 'chunk', text: decoder.decode(value, { stream: true }) };
    }
    yield { type: 'done' };
  }
}

/**
 * Stream chat completions from an LLM provider.
 * Returns an async generator of StreamEvents.
 */
export async function* streamChat(
  config: ModelConfig,
  messages: NormalizedMessage[],
  tools?: ToolDef[],
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  // [DIAG] Log every streamChat call to help diagnose "returns 0" issue
  console.log('[streamChat] START provider=', config.provider, 'model=', config.modelId,
    'messages=', messages.length, 'tools=', tools?.length ?? 0,
    'lastRole=', messages[messages.length - 1]?.role,
    'lastContentLen=', (() => { const c = messages[messages.length - 1]?.content; return typeof c === 'string' ? c.length : Array.isArray(c) ? JSON.stringify(c).length : 0; })());
  // [DIAG] Check for obvious message format problems
  const sysMsg = messages.find(m => m.role === 'system');
  console.log('[streamChat] systemPrompt present=', !!sysMsg, 'len=', typeof sysMsg?.content === 'string' ? sysMsg.content.length : 0);
  if (messages.length > 1) {
    console.log('[streamChat] messages[1] role=', messages[1].role,
      'content-type=', typeof messages[1].content,
      'content-pre=', typeof messages[1].content === 'string' ? String(messages[1].content).substring(0, 80) : '(non-string)');
  }
  switch (config.provider) {
    case 'openai':
    case 'ollama':
    case 'openai-compatible':
    case 'openrouter':
      yield* streamOpenAI(config, messages, tools, signal);
      break;
    case 'anthropic':
    case 'anthropic-compatible':
      yield* streamAnthropic(config, messages, tools, signal);
      break;
    case 'google':
      yield* streamGoogle(config, messages, tools, signal);
      break;
    default:
      yield { type: 'error', message: `不支持的模型提供商: ${config.provider}` };
  }
}

/**
 * Sanitize HTTP error body detail. If the body begins with the system prompt
 * marker (API echoed the request body), replace with a short diagnostic hint
 * instead of exposing the full 10KB system prompt in the error message.
 */
function sanitizeErrorDetail(raw: string, status: number): string {
  // Marker includes ' ——' (em-dashes U+2014 U+2014) — unique to the system prompt
  // opening line. A legitimate error body from the API would never start this way.
  const ECHO_MARKER = '\u4f60\u662f ReAct Report Agent \u2014\u2014';
  // Strip non-letter prefix so markdown/quote prefixes don't hide the echo.
  const rawStripped = raw.replace(/^[^\p{L}]+/u, '');
  if (rawStripped.startsWith(ECHO_MARKER)) {
    return `API (${status}) \u8fd4\u56de\u4e86\u8bf7\u6c42\u5185\u5bb9\u800c\u975e\u9884\u671f\u7684\u6d41\u5f0f\u54cd\u5e94\u3002\n\u53ef\u80fd\u539f\u56e0\uff1a\n\u2022 \u6a21\u578b\u4e0d\u652f\u6301 Function Calling / tools \u53c2\u6570\n\u2022 \u7cfb\u7edf\u63d0\u793a\u8bcd\u8d85\u51fa\u4e86\u6a21\u578b\u4e0a\u4e0b\u6587\u9650\u5236\n\u2022 API Key \u6743\u9650\u4e0d\u8db3\uff08\u6d4b\u8bd5\u63a5\u53e3\u8f7b\u91cf\u8bf7\u6c42\u901a\u8fc7\uff0c\u4f46\u5b9e\u9645\u5bf9\u8bdd\u8bf7\u6c42\u88ab\u62d2\uff09\n\u2022 \u8bf7\u5c1d\u8bd5\u5207\u6362\u65e0\u5de5\u5177\u8c03\u7528\u7684\u666e\u901a\u6a21\u578b`;
  }
  return raw;
}

/* ================ OpenAI / Ollama (OpenAI-compatible) ================ */

async function* streamOpenAI(
  config: ModelConfig,
  messages: NormalizedMessage[],
  tools?: ToolDef[],
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  // For compatible providers, baseUrl already includes /v1 path
  // openrouter: user sets https://openrouter.ai/api/v1 (same as openai-compatible)
  const base = config.baseUrl.replace(/\/+$/, '');
  const baseUrl = (config.provider === 'openai-compatible' || config.provider === 'openrouter')
    ? base
    : `${base}/v1`;

  const body: Record<string, unknown> = {
    model: config.modelId,
    messages,
    stream: true,
  };

  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const trimmedKey = (config.apiKey || '').trim();
  if (trimmedKey) headers['Authorization'] = `Bearer ${trimmedKey}`;
  // OpenRouter requires these headers for routing and analytics
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://auto-report.app';
    headers['X-Title'] = '\u6570\u636e\u5206\u6790\u667a\u80fd\u4f53';
  }

  const toolCallBuffers: Record<number, { id: string; name: string; args: string }> = {};
  let sseBuffer = '';
  let httpErrorStatus = 0;
  let httpErrorBody = '';
  let sseLineCount = 0; // diagnostic: count valid SSE lines processed

  console.log('[llmService] streamOpenAI START url=', `${baseUrl}/chat/completions`,
    'model=', config.modelId, 'tools=', tools?.length ?? 0);

  for await (const event of streamingFetch(
    `${baseUrl}/chat/completions`,
    { method: 'POST', headers, body: JSON.stringify(body) },
    signal
  )) {
    if (event.type === 'status') {
      console.log('[llmService] HTTP status=', event.status);
      if (event.status >= 400) httpErrorStatus = event.status;
      continue;
    }

    // While collecting an HTTP error response body, accumulate chunks then stop
    if (httpErrorStatus > 0) {
      if (event.type === 'chunk') {
        if (httpErrorBody.length < 800) {
          console.log('[llmService] error body chunk:', JSON.stringify(event.text.substring(0, 200)));
        }
        httpErrorBody += event.text; continue; }
      // Electron IPC sends error body as { type: 'error', text } (not as chunks)
      if (event.type === 'error') { httpErrorBody = event.text || httpErrorBody; }
      // 'done' or 'error' — sanitize and emit the error then stop
      let detail = httpErrorBody.substring(0, 600);
      try { detail = JSON.parse(httpErrorBody)?.error?.message ?? detail; } catch { /* keep raw */ }
      yield { type: 'error', message: sanitizeErrorDetail(detail, httpErrorStatus) };
      return;
    }

    if (event.type === 'error') {
      console.log('[llmService] streamingFetch error event:', JSON.stringify(event.text?.substring(0, 200)));
      yield { type: 'error', message: `OpenAI API 错误: ${event.text}` };
      return;
    } else if (event.type === 'done') {
      console.log('[llmService] streamingFetch done, sseLineCount=', sseLineCount);
      break;
    } else if (event.type === 'chunk') {
      if (sseLineCount === 0 && sseBuffer.length < 300) {
        console.log('[llmService] first chunk (raw):', JSON.stringify(event.text.substring(0, 200)));
      }
      sseBuffer += event.text;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';

      // Track 'event:' field for current SSE message
      let currentSseEvent = '';
      for (const line of lines) {
        const trimmed = line.trim();
        // Track SSE event type (e.g. 'event: error')
        if (trimmed.startsWith('event:')) {
          currentSseEvent = trimmed.slice(6).trim();
          continue;
        }
        if (!trimmed || !trimmed.startsWith('data: ')) { if (!trimmed) currentSseEvent = ''; continue; }
        sseLineCount++;
        const dataStr = trimmed.slice(6);
        // [DIAG] Log first 5 SSE lines to see what the API is actually sending
        if (sseLineCount <= 5) {
          console.log(`[streamOpenAI] SSE line#${sseLineCount} (event=${currentSseEvent || 'message'}):`, JSON.stringify(dataStr.substring(0, 200)));
        }
        // Handle 'event: error' SSE — emit as error event rather than silently ignoring
        if (currentSseEvent === 'error') {
          let errMsg = dataStr;
          try { errMsg = JSON.parse(dataStr)?.message ?? dataStr; } catch { /* keep raw */ }
          console.error('[streamOpenAI] SSE event:error received:', errMsg.substring(0, 300));
          yield { type: 'error', message: `API 错误: ${errMsg.substring(0, 400)}` };
          return;
        }
        currentSseEvent = ''; // reset after consuming data line
        if (dataStr === '[DONE]') {
          console.log('[streamOpenAI] [DONE] received at sseLineCount=', sseLineCount, 'toolCallBuffers keys=', Object.keys(toolCallBuffers).length);
          break;
        } // break inner loop; tool calls emitted after the for-await ends

        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta;
          const finishReason = json.choices?.[0]?.finish_reason;
          // [DIAG] Log finish_reason to understand why model stopped
          if (finishReason && finishReason !== 'null') {
            console.log('[streamOpenAI] finish_reason=', finishReason, 'at sseLineCount=', sseLineCount);
          }
          if (!delta) {
            // [DIAG] Log entire non-delta event
            if (sseLineCount <= 10) console.log('[streamOpenAI] no delta, json=', JSON.stringify(json).substring(0, 200));
            continue;
          }

          if (delta.content) {
            if (sseLineCount <= 6) console.log('[streamOpenAI] delta.content=', JSON.stringify(delta.content.substring(0, 80)));
            yield { type: 'text-delta', content: delta.content };
          }

          const reasoning = delta.reasoning_content || delta.reasoning;
          if (typeof reasoning === 'string' && reasoning.length > 0) {
            yield { type: 'think-delta', content: reasoning };
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallBuffers[idx]) {
                toolCallBuffers[idx] = { id: tc.id || '', name: '', args: '' };
              }
              if (tc.id) toolCallBuffers[idx].id = tc.id;
              if (tc.function?.name) toolCallBuffers[idx].name += tc.function.name;
              if (tc.function?.arguments) toolCallBuffers[idx].args += tc.function.arguments;
            }
          }
        } catch { /* skip unparseable lines */ }
      }
    }
  }

  // If loop exited while still in error state (no explicit done/error event)
  if (httpErrorStatus > 0) {
    let detail = httpErrorBody.substring(0, 600);
    try { detail = JSON.parse(httpErrorBody)?.error?.message ?? detail; } catch { /* keep raw */ }
    yield { type: 'error', message: sanitizeErrorDetail(detail, httpErrorStatus) };
    return;
  }

  // Emit accumulated tool calls
  const tcEntries = Object.values(toolCallBuffers);
  console.log('[streamOpenAI] emitting', tcEntries.length, 'tool calls, sseLineCount=', sseLineCount);
  for (const tc of tcEntries) {
    console.log('[streamOpenAI] tool-call:', tc.name, 'id=', tc.id, 'args-len=', tc.args.length, 'args-preview=', tc.args.substring(0, 100));
    try {
      const args = JSON.parse(tc.args || '{}');
      yield { type: 'tool-call', id: tc.id, name: tc.name, args };
    } catch {
      console.warn('[streamOpenAI] failed to parse tool args for', tc.name, 'raw=', tc.args.substring(0, 200));
      yield { type: 'tool-call', id: tc.id, name: tc.name, args: {} };
    }
  }
  if (tcEntries.length === 0 && sseLineCount === 0) {
    console.warn('[streamOpenAI] WARNING: 0 SSE lines processed and 0 tool calls — model returned empty response');
  }
  yield { type: 'done' };
}

/* ================ Anthropic ================ */

async function* streamAnthropic(
  config: ModelConfig,
  messages: NormalizedMessage[],
  tools?: ToolDef[],
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  // Separate system from messages
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages
    .filter((m) => m.role !== 'system' && m.role !== 'tool')
    .map((m) => {
      // Convert OpenAI-style content parts to Anthropic format
      if (Array.isArray(m.content)) {
        const anthropicContent = m.content.map((part) => {
          if (part.type === 'text') return { type: 'text' as const, text: part.text };
          // image_url part → Anthropic base64 image
          const dataUrl = part.image_url.url;
          const commaIdx = dataUrl.indexOf(',');
          const header = dataUrl.slice(0, commaIdx);
          const data = dataUrl.slice(commaIdx + 1);
          const mediaType = (header.match(/:(.*?);/)?.[1] || 'image/jpeg') as string;
          return {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: mediaType, data },
          };
        });
        return { role: m.role as 'user' | 'assistant', content: anthropicContent };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content as string };
    });

  // Add tool results as user messages
  const toolResultMsgs = messages.filter((m) => m.role === 'tool');
  for (const tr of toolResultMsgs) {
    chatMessages.push({
      role: 'user',
      content: JSON.stringify([{ type: 'tool_result', tool_use_id: tr.tool_call_id, content: tr.content }]),
    });
  }

  const body: Record<string, unknown> = {
    model: config.modelId,
    max_tokens: 4096,
    messages: chatMessages,
    stream: true,
  };
  if (systemMsg) body.system = systemMsg.content;
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  // For compatible providers, baseUrl already includes full path
  const base = config.baseUrl.replace(/\/+$/, '');
  const apiUrl = config.provider === 'anthropic-compatible'
    ? `${base}/v1/messages`
    : `${base}/v1/messages`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': (config.apiKey || '').trim(),
    'anthropic-version': '2023-06-01',
  };
  // Only add dangerous-direct-browser-access for official Anthropic API
  if (config.provider === 'anthropic') {
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  // Some compatible services use Authorization header
  if (config.provider === 'anthropic-compatible') {
    headers['Authorization'] = `Bearer ${(config.apiKey || '').trim()}`;
  }

  let currentToolId = '';
  let currentToolName = '';
  let toolArgsBuffer = '';
  let sseBuffer = '';
  let httpErrorStatus = 0;
  let httpErrorBody = '';

  for await (const event of streamingFetch(
    apiUrl,
    { method: 'POST', headers, body: JSON.stringify(body) },
    signal
  )) {
    if (event.type === 'status') {
      if (event.status >= 400) httpErrorStatus = event.status;
      continue;
    }
    if (httpErrorStatus > 0) {
      if (event.type === 'chunk') { httpErrorBody += event.text; continue; }
      // Electron IPC sends error body as { type: 'error', text } (not as chunks)
      if (event.type === 'error') { httpErrorBody = event.text || httpErrorBody; }
      let detail = httpErrorBody.substring(0, 600);
      try { detail = JSON.parse(httpErrorBody)?.error?.message ?? detail; } catch { /* keep raw */ }
      yield { type: 'error', message: sanitizeErrorDetail(detail, httpErrorStatus) };
      return;
    }
    if (event.type === 'error') {
      yield { type: 'error', message: `Anthropic API 错误: ${event.text}` };
      return;
    } else if (event.type === 'done') {
      break;
    } else if (event.type === 'chunk') {
      sseBuffer += event.text;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);

        try {
          const json = JSON.parse(dataStr);

          if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
            currentToolId = json.content_block.id;
            currentToolName = json.content_block.name;
            toolArgsBuffer = '';
          } else if (json.type === 'content_block_start' && json.content_block?.type === 'thinking') {
            // Anthropic thinking block (if enabled by provider)
            if (json.content_block.thinking) {
              yield { type: 'think-delta', content: json.content_block.thinking };
            }
          } else if (json.type === 'content_block_delta') {
            if (json.delta?.type === 'text_delta') {
              yield { type: 'text-delta', content: json.delta.text };
            } else if (json.delta?.type === 'thinking_delta' && json.delta.thinking) {
              yield { type: 'think-delta', content: json.delta.thinking };
            } else if (json.delta?.type === 'input_json_delta') {
              toolArgsBuffer += json.delta.partial_json;
            }
          } else if (json.type === 'content_block_stop' && currentToolId) {
            try {
              const args = JSON.parse(toolArgsBuffer || '{}');
              yield { type: 'tool-call', id: currentToolId, name: currentToolName, args };
            } catch {
              yield { type: 'tool-call', id: currentToolId, name: currentToolName, args: {} };
            }
            currentToolId = '';
          } else if (json.type === 'message_stop') {
            yield { type: 'done' };
            return;
          }
        } catch { /* skip */ }
      }
    }
  }
  if (httpErrorStatus > 0) {
    let detail = httpErrorBody.substring(0, 600);
    try { detail = JSON.parse(httpErrorBody)?.error?.message ?? detail; } catch { /* keep raw */ }
    yield { type: 'error', message: sanitizeErrorDetail(detail, httpErrorStatus) };
    return;
  }
  yield { type: 'done' };
}

/* ================ Google Gemini ================ */

async function* streamGoogle(
  config: ModelConfig,
  messages: NormalizedMessage[],
  tools?: ToolDef[],
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  // Guard: messages must be an array, provider must be google
  if (!Array.isArray(messages)) {
    console.error('[streamGoogle] messages is not an array:', typeof messages);
    yield { type: 'error', message: 'streamGoogle: invalid messages argument' };
    return;
  }

  const systemMsg = messages.find((m) => m.role === 'system');
  // Skip tool messages (role:'tool') — Gemini uses a different format and they are
  // typically re-packaged below. Only send user/assistant turns.
  const contents = messages
    .filter((m) => m.role !== 'system' && m.role !== 'tool')
    .map((m) => {
      const role = m.role === 'assistant' ? 'model' : 'user';
      if (Array.isArray(m.content)) {
        const parts = m.content.map((part) => {
          if (part.type === 'text') return { text: part.text };
          // image_url → Gemini inline_data (null-safe)
          const dataUrl = part.image_url?.url;
          if (!dataUrl) return { text: '[image not available]' };
          const commaIdx = dataUrl.indexOf(',');
          const header = dataUrl.slice(0, commaIdx);
          const data = dataUrl.slice(commaIdx + 1);
          const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
          return { inline_data: { mime_type: mimeType, data } };
        });
        return { role, parts };
      }
      return { role, parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] };
    });

  const body: Record<string, unknown> = { contents };
  if (systemMsg) {
    const sysText = Array.isArray(systemMsg.content)
      ? systemMsg.content.filter((p) => p.type === 'text').map((p) => (p as { type: 'text'; text: string }).text).join('\n')
      : systemMsg.content as string;
    body.system_instruction = { parts: [{ text: sysText }] };
  }
  if (tools?.length) {
    body.tools = [{
      function_declarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    }];
  }

  const url = `${config.baseUrl}/v1beta/models/${config.modelId}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
  let sseBuffer = '';
  let httpErrorStatus = 0;
  let httpErrorBody = '';

  for await (const event of streamingFetch(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    signal
  )) {
    if (event.type === 'status') {
      if (event.status >= 400) httpErrorStatus = event.status;
      continue;
    }
    if (httpErrorStatus > 0) {
      if (event.type === 'chunk') { httpErrorBody += event.text; continue; }
      // Electron IPC sends error body as { type: 'error', text } (not as chunks)
      if (event.type === 'error') { httpErrorBody = event.text || httpErrorBody; }
      let detail = httpErrorBody.substring(0, 600);
      try { detail = JSON.parse(httpErrorBody)?.error?.message ?? detail; } catch { /* keep raw */ }
      yield { type: 'error', message: sanitizeErrorDetail(detail, httpErrorStatus) };
      return;
    }
    if (event.type === 'error') {
      yield { type: 'error', message: `Gemini API 错误: ${event.text}` };
      return;
    } else if (event.type === 'done') {
      break;
    } else if (event.type === 'chunk') {
      sseBuffer += event.text;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const parts = json.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.text) {
              yield { type: 'text-delta', content: part.text };
            }
            if (part.thought) {
              yield { type: 'think-delta', content: String(part.thought) };
            }
            if (part.functionCall) {
              yield {
                type: 'tool-call',
                id: `gemini-${Date.now()}`,
                name: part.functionCall.name,
                args: part.functionCall.args || {},
              };
            }
          }
        } catch { /* skip */ }
      }
    }
  }
  if (httpErrorStatus > 0) {
    let detail = httpErrorBody.substring(0, 600);
    try { detail = JSON.parse(httpErrorBody)?.error?.message ?? detail; } catch { /* keep raw */ }
    yield { type: 'error', message: sanitizeErrorDetail(detail, httpErrorStatus) };
    return;
  }
  yield { type: 'done' };
}

/**
 * Convert internal tool definitions to OpenAI-compatible JSON Schema format.
 */
/**
 * Convert a parameter type string to a valid JSON Schema type descriptor.
 * Handles array shorthands like 'string[]' → {type:'array',items:{type:'string'}}.
 */
function paramTypeToJsonSchema(typeStr: string): Record<string, unknown> {
  // Handle array shorthand: 'string[]', 'number[]', etc.
  const arrayMatch = typeStr.match(/^(\w+)\[\]$/);
  if (arrayMatch) {
    return { type: 'array', items: { type: arrayMatch[1] } };
  }
  return { type: typeStr };
}

export function toolsToJsonSchema(tools: Array<{ name: string; description: string; parameters: Array<{ name: string; type: string; description: string; required?: boolean }> }>): ToolDef[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        t.parameters.map((p) => [p.name, { ...paramTypeToJsonSchema(p.type), description: p.description }])
      ),
      required: t.parameters.filter((p) => p.required).map((p) => p.name),
    },
  }));
}
