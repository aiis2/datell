import * as crypto from 'crypto';
import type { DatabaseService } from './database';

export interface RagCollection {
  id: string;
  name: string;
  description: string;
  type: 'local' | 'dify' | 'ragflow';
  embedding_model: string;
  api_url: string;
  api_key: string;
  dataset_id: string;
  created_at: number;
}

export interface RagDocument {
  id: string;
  collection_id: string;
  filename: string;
  size: number;
  chunk_count: number;
  created_at: number;
}

export interface SearchResult {
  id: string;
  document_id: string;
  filename: string;
  content: string;
  score: number;
}

// ── Text Chunking ──────────────────────────────────────────────────────────

export interface ChunkOptions {
  mode: 'auto' | 'custom';
  delimiter?: string;             // default '\n\n'
  maxLength?: number;             // default 512
  overlap?: number;               // default 64
  removeExtraWhitespace?: boolean;
  removeUrlsEmails?: boolean;
}

/** Chunk text with configurable options (Dify-style). */
export function chunkTextWithOptions(text: string, opts?: ChunkOptions): string[] {
  const mode = opts?.mode ?? 'auto';
  const delimiter = opts?.delimiter ?? '\n\n';
  const maxLength = opts?.maxLength ?? (mode === 'auto' ? 512 : 500);
  const overlap = opts?.overlap ?? (mode === 'auto' ? 64 : 50);

  // Preprocessing
  let processed = text;
  if (opts?.removeExtraWhitespace) {
    processed = processed
      .replace(/\t|\f|\u00a0|\u2003|\u3000/g, ' ')  // special whitespace → space
      .replace(/\n{3,}/g, '\n\n')                    // 3+ newlines → 2
      .replace(/[^\S\n]{2,}/g, ' ');                  // multiple spaces → one
  }
  if (opts?.removeUrlsEmails) {
    processed = processed
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
  }

  // Step 1: split by delimiter
  const segments = delimiter
    ? processed.split(delimiter).map((s) => s.trim()).filter((s) => s.length > 0)
    : [processed.trim()];

  // Step 2: enforce maxLength with overlap on each segment
  const finalChunks: string[] = [];
  for (const seg of segments) {
    if (seg.length <= maxLength) {
      if (seg.length > 10) finalChunks.push(seg);
    } else {
      let i = 0;
      while (i < seg.length) {
        const chunk = seg.slice(i, i + maxLength).trim();
        if (chunk.length > 10) finalChunks.push(chunk);
        i += maxLength - overlap;
        if (overlap >= maxLength) break; // safety
      }
    }
  }
  return finalChunks;
}

/** Legacy: simple character-based chunking (kept for backward compatibility). */
export function chunkText(text: string, size = 512, overlap = 64): string[] {
  return chunkTextWithOptions(text, { mode: 'auto', maxLength: size, overlap });
}

// ── Vector Math ──────────────────────────────────────────────────────────────

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ── Embedding via LLM API ──────────────────────────────────────────────────

export async function embedText(
  text: string,
  cfg: { baseUrl: string; apiKey: string; model?: string }
): Promise<Float32Array | null> {
  try {
    const baseUrl = cfg.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/v1/embeddings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model || 'text-embedding-ada-002', input: text }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data: Array<{ embedding: number[] }> };
    return new Float32Array(json.data[0].embedding);
  } catch {
    return null;
  }
}

// ── Collection CRUD ──────────────────────────────────────────────────────────

export function listCollections(db: DatabaseService): RagCollection[] {
  return db.getRagCollections() as RagCollection[];
}

export function createCollection(db: DatabaseService, data: Partial<RagCollection>): RagCollection {
  const col: RagCollection = {
    id: crypto.randomUUID(),
    name: data.name || '新知识库',
    description: data.description || '',
    type: (data.type as RagCollection['type']) || 'local',
    embedding_model: data.embedding_model || '',
    api_url: data.api_url || '',
    api_key: data.api_key || '',
    dataset_id: data.dataset_id || '',
    created_at: Date.now(),
  };
  db.insertRagCollection(col);
  return col;
}

export function deleteCollection(db: DatabaseService, id: string): void {
  db.deleteRagCollection(id);
}

// ── Document CRUD ────────────────────────────────────────────────────────────

export function listDocuments(db: DatabaseService, collectionId: string): RagDocument[] {
  return db.getRagDocuments(collectionId) as RagDocument[];
}

export async function addDocument(
  db: DatabaseService,
  collectionId: string,
  filename: string,
  text: string,
  embeddingCfg?: { baseUrl: string; apiKey: string; model?: string },
  chunkOpts?: ChunkOptions
): Promise<RagDocument> {
  const docId = crypto.randomUUID();
  const chunks = chunkTextWithOptions(text, chunkOpts);
  const doc: RagDocument = {
    id: docId,
    collection_id: collectionId,
    filename,
    size: text.length,
    chunk_count: chunks.length,
    created_at: Date.now(),
  };
  db.insertRagDocument(doc);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let embBuf: Buffer | null = null;
    if (embeddingCfg?.baseUrl) {
      const emb = await embedText(chunk, embeddingCfg);
      if (emb) embBuf = Buffer.from(emb.buffer);
    }
    db.insertRagChunk({
      id: crypto.randomUUID(),
      collection_id: collectionId,
      document_id: docId,
      content: chunk,
      embedding: embBuf,
      chunk_index: i,
      metadata: '{}',
      created_at: Date.now(),
    });
  }

  db.rebuildFTSIndex();
  return doc;
}

export function removeDocument(db: DatabaseService, id: string): void {
  db.deleteRagDocument(id);
}

// ── Search ───────────────────────────────────────────────────────────────────

export function searchFTS(
  db: DatabaseService,
  collectionId: string,
  query: string,
  topK = 5
): SearchResult[] {
  try {
    const rows = db.searchRagFTS(collectionId, query, topK) as Array<{ id: string; document_id: string; content: string; filename: string }>;
    return rows.map((r, i) => ({
      id: r.id,
      document_id: r.document_id,
      filename: r.filename,
      content: r.content,
      score: Math.max(0, 1 - i * 0.05),
    }));
  } catch {
    return [];
  }
}

export async function searchSemantic(
  db: DatabaseService,
  collectionId: string,
  query: string,
  embeddingCfg: { baseUrl: string; apiKey: string; model?: string },
  topK = 5
): Promise<SearchResult[]> {
  // Try semantic search; fall back to FTS if embedding fails
  const qEmb = await embedText(query, embeddingCfg);
  if (!qEmb) return searchFTS(db, collectionId, query, topK);

  const rows = db.getRagChunksWithEmbedding(collectionId) as Array<{
    id: string;
    document_id: string;
    content: string;
    embedding: Buffer;
  }>;

  if (rows.length === 0) return searchFTS(db, collectionId, query, topK);

  const scored = rows.map((r) => {
    const embArr = new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.length / 4);
    return { ...r, score: cosineSimilarity(qEmb, embArr) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((r) => ({
    id: r.id,
    document_id: r.document_id,
    filename: '',
    content: r.content,
    score: r.score,
  }));
}

// ── External APIs ────────────────────────────────────────────────────────────

export async function searchDify(params: {
  apiUrl: string;
  apiKey: string;
  datasetId: string;
  query: string;
  topK?: number;
}): Promise<SearchResult[]> {
  const { apiUrl, apiKey, datasetId, query, topK = 5 } = params;
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/datasets/${datasetId}/retrieve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, retrieval_model: { search_method: 'hybrid_search', top_k: topK } }),
    });
    if (!res.ok) return [];
    const json = await res.json() as { records?: Array<{ segment?: { id?: string; content?: string }; document?: { id?: string; name?: string }; score?: number }> };
    return (json.records || []).map((r, i) => ({
      id: r.segment?.id || String(i),
      document_id: r.document?.id || '',
      filename: r.document?.name || '',
      content: r.segment?.content || '',
      score: r.score ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function searchRagflow(params: {
  apiUrl: string;
  apiKey: string;
  kbId: string;
  query: string;
  topK?: number;
}): Promise<SearchResult[]> {
  const { apiUrl, apiKey, kbId, query, topK = 5 } = params;
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/v1/retrieval`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: query, kb_id: [kbId], top_n: topK }),
    });
    if (!res.ok) return [];
    const json = await res.json() as { data?: { chunks?: Array<{ chunk_id?: string; content?: string; doc_name?: string; similarity?: number }> } };
    return (json.data?.chunks || []).map((c, i) => ({
      id: c.chunk_id || String(i),
      document_id: '',
      filename: c.doc_name || '',
      content: c.content || '',
      score: c.similarity ?? 0,
    }));
  } catch {
    return [];
  }
}
