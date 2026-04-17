import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  thinking: string | null;
  created_at: number;
  attachments: string;
  tool_calls: string;
}

export interface ReportRow {
  id: string;
  title: string;
  html: string;
  created_at: number;
  conversation_id: string | null;
  is_template: number;
  template_name: string | null;
  template_description: string | null;
}

export interface WindowsIdentityRow {
  sid: string;
  username: string;
  domain: string;
  display_name: string;
  source: string;
  is_fallback: number;
  last_seen_at: number;
}

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        thinking TEXT,
        created_at INTEGER NOT NULL,
        attachments TEXT DEFAULT '[]',
        tool_calls TEXT DEFAULT '[]',
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        html TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        conversation_id TEXT,
        is_template INTEGER DEFAULT 0,
        template_name TEXT,
        template_description TEXT
      );

      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS windows_identity (
        sid TEXT NOT NULL DEFAULT '',
        username TEXT NOT NULL,
        domain TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'env',
        is_fallback INTEGER NOT NULL DEFAULT 0,
        last_seen_at INTEGER NOT NULL,
        PRIMARY KEY (sid, username, domain)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_reports_template ON reports(is_template);

      CREATE TABLE IF NOT EXISTS rag_collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        type TEXT NOT NULL DEFAULT 'local',
        embedding_model TEXT DEFAULT '',
        api_url TEXT DEFAULT '',
        api_key TEXT DEFAULT '',
        dataset_id TEXT DEFAULT '',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rag_documents (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        size INTEGER DEFAULT 0,
        chunk_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (collection_id) REFERENCES rag_collections(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS rag_chunks (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        chunk_index INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (collection_id) REFERENCES rag_collections(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES rag_documents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS kgraph_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'custom',
        label TEXT NOT NULL,
        properties TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        created_by TEXT DEFAULT 'user'
      );

      CREATE TABLE IF NOT EXISTS kgraph_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        properties TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (source_id) REFERENCES kgraph_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES kgraph_nodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_rag_docs_coll ON rag_documents(collection_id);
      CREATE INDEX IF NOT EXISTS idx_rag_chunks_coll ON rag_chunks(collection_id);
      CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_kgraph_edges_src ON kgraph_edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_kgraph_edges_tgt ON kgraph_edges(target_id);
    `);

    // FTS5 virtual table — created separately to gracefully handle SQLite builds without FTS5
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
          content,
          content='rag_chunks',
          content_rowid='rowid'
        );
      `);
    } catch {
      // FTS5 not available in this SQLite build — keyword search will fall back to LIKE
    }
  }

  /* ===== Conversations ===== */

  getConversations(): ConversationRow[] {
    return this.db
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
      .all() as ConversationRow[];
  }

  getMessages(conversationId: string): MessageRow[] {
    return this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as MessageRow[];
  }

  upsertConversation(conv: ConversationRow): void {
    // IMPORTANT: Use ON CONFLICT DO UPDATE (not INSERT OR REPLACE) because
    // INSERT OR REPLACE triggers DELETE + INSERT which fires ON DELETE CASCADE
    // on the messages table, wiping all messages for the conversation.
    this.db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at
    `).run(conv.id, conv.title, conv.created_at, conv.updated_at);
  }

  upsertMessage(msg: MessageRow): void {
    this.db.prepare(`
      INSERT INTO messages
        (id, conversation_id, role, content, thinking, created_at, attachments, tool_calls)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        thinking = excluded.thinking,
        attachments = excluded.attachments,
        tool_calls = excluded.tool_calls
    `).run(
      msg.id,
      msg.conversation_id,
      msg.role,
      msg.content,
      msg.thinking ?? null,
      msg.created_at,
      msg.attachments,
      msg.tool_calls,
    );
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  deleteMessage(id: string): void {
    this.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  }

  updateConversationTitle(id: string, title: string): void {
    this.db
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, Date.now(), id);
  }

  /* ===== Reports & Templates ===== */

  getReports(): ReportRow[] {
    return this.db
      .prepare('SELECT * FROM reports WHERE is_template = 0 ORDER BY created_at DESC')
      .all() as ReportRow[];
  }

  getTemplates(): ReportRow[] {
    return this.db
      .prepare('SELECT * FROM reports WHERE is_template = 1 ORDER BY created_at DESC')
      .all() as ReportRow[];
  }

  upsertReport(report: ReportRow): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO reports
        (id, title, html, created_at, conversation_id, is_template, template_name, template_description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.id,
      report.title,
      report.html,
      report.created_at,
      report.conversation_id ?? null,
      report.is_template,
      report.template_name ?? null,
      report.template_description ?? null,
    );
  }

  deleteReport(id: string): void {
    this.db.prepare('DELETE FROM reports WHERE id = ?').run(id);
  }

  getReportById(id: string): ReportRow | undefined {
    return this.db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow | undefined;
  }

  /* ===== Config (key-value) ===== */

  getConfig(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM app_config WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setConfig(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run(key, value);
  }

  getAllConfig(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM app_config').all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /* ===== Windows Identity ===== */

  upsertWindowsIdentity(row: WindowsIdentityRow): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO windows_identity
        (sid, username, domain, display_name, source, is_fallback, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.sid,
      row.username,
      row.domain,
      row.display_name,
      row.source,
      row.is_fallback,
      row.last_seen_at,
    );
  }

  getWindowsIdentity(): WindowsIdentityRow | undefined {
    return this.db
      .prepare('SELECT * FROM windows_identity ORDER BY last_seen_at DESC LIMIT 1')
      .get() as WindowsIdentityRow | undefined;
  }

  /* ===== Activation ===== */

  /** Store encrypted activation blob. Key = 'activation_data'. */
  setActivation(encryptedBlob: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)')
      .run('activation_data', encryptedBlob);
  }

  getActivation(): string | null {
    const row = this.db
      .prepare("SELECT value FROM app_config WHERE key = 'activation_data'")
      .get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  clearActivation(): void {
    this.db.prepare("DELETE FROM app_config WHERE key = 'activation_data'").run();
  }

  /* ===== RAG Collections ===== */

  getRagCollections(): unknown[] {
    return this.db.prepare('SELECT * FROM rag_collections ORDER BY created_at DESC').all();
  }

  insertRagCollection(c: { id: string; name: string; description: string; type: string; embedding_model: string; api_url: string; api_key: string; dataset_id: string; created_at: number }): void {
    this.db.prepare('INSERT INTO rag_collections (id,name,description,type,embedding_model,api_url,api_key,dataset_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(c.id, c.name, c.description, c.type, c.embedding_model, c.api_url, c.api_key, c.dataset_id, c.created_at);
  }

  updateRagCollection(id: string, patch: Partial<{ name: string; description: string; embedding_model: string; api_url: string; api_key: string; dataset_id: string }>): void {
    const fields = Object.keys(patch).map((k) => `${k} = ?`).join(', ');
    if (!fields) return;
    this.db.prepare(`UPDATE rag_collections SET ${fields} WHERE id = ?`).run(...Object.values(patch), id);
  }

  deleteRagCollection(id: string): void {
    this.db.prepare('DELETE FROM rag_collections WHERE id = ?').run(id);
  }

  /* ===== RAG Documents ===== */

  getRagDocuments(collectionId: string): unknown[] {
    return this.db.prepare('SELECT * FROM rag_documents WHERE collection_id = ? ORDER BY created_at DESC').all(collectionId);
  }

  insertRagDocument(d: { id: string; collection_id: string; filename: string; size: number; chunk_count: number; created_at: number }): void {
    this.db.prepare('INSERT INTO rag_documents (id,collection_id,filename,size,chunk_count,created_at) VALUES (?,?,?,?,?,?)')
      .run(d.id, d.collection_id, d.filename, d.size, d.chunk_count, d.created_at);
  }

  updateRagDocumentChunkCount(id: string, count: number): void {
    this.db.prepare('UPDATE rag_documents SET chunk_count = ? WHERE id = ?').run(count, id);
  }

  deleteRagDocument(id: string): void {
    this.db.prepare('DELETE FROM rag_documents WHERE id = ?').run(id);
  }

  /* ===== RAG Chunks ===== */

  insertRagChunk(c: { id: string; collection_id: string; document_id: string; content: string; embedding: Buffer | null; chunk_index: number; metadata: string; created_at: number }): void {
    this.db.prepare('INSERT INTO rag_chunks (id,collection_id,document_id,content,embedding,chunk_index,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(c.id, c.collection_id, c.document_id, c.content, c.embedding ?? null, c.chunk_index, c.metadata, c.created_at);
  }

  getRagChunksWithEmbedding(collectionId: string): unknown[] {
    return this.db.prepare('SELECT id, document_id, content, embedding FROM rag_chunks WHERE collection_id = ? AND embedding IS NOT NULL').all(collectionId);
  }

  getRagChunksForDoc(collectionId: string, documentId: string): unknown[] {
    return this.db.prepare(
      'SELECT id, chunk_index, content, created_at FROM rag_chunks WHERE collection_id = ? AND document_id = ? ORDER BY chunk_index ASC'
    ).all(collectionId, documentId);
  }

  updateRagChunk(id: string, content: string): void {
    this.db.prepare('UPDATE rag_chunks SET content = ? WHERE id = ?').run(content, id);
    // Rebuild FTS so search stays consistent
    try { this.db.exec("INSERT INTO rag_chunks_fts(rag_chunks_fts) VALUES('rebuild')"); } catch { /* ignore */ }
  }

  searchRagFTS(collectionId: string, query: string, topK: number): unknown[] {
    // Try FTS5 first; fall back to LIKE search if the virtual table doesn't exist
    try {
      return this.db.prepare(`
        SELECT rc.id, rc.document_id, rc.content, rd.filename
        FROM rag_chunks_fts
        JOIN rag_chunks rc ON rc.rowid = rag_chunks_fts.rowid
        JOIN rag_documents rd ON rd.id = rc.document_id
        WHERE rag_chunks_fts MATCH ?
          AND rc.collection_id = ?
        ORDER BY rank
        LIMIT ?
      `).all(query, collectionId, topK);
    } catch {
      return this.db.prepare(`
        SELECT rc.id, rc.document_id, rc.content, rd.filename
        FROM rag_chunks rc
        JOIN rag_documents rd ON rd.id = rc.document_id
        WHERE rc.collection_id = ?
          AND rc.content LIKE ?
        LIMIT ?
      `).all(collectionId, `%${query}%`, topK);
    }
  }

  rebuildFTSIndex(): void {
    try {
      this.db.exec("INSERT INTO rag_chunks_fts(rag_chunks_fts) VALUES('rebuild')");
    } catch { /* ignore if FTS5 not available */ }
  }

  /* ===== Knowledge Graph: Nodes ===== */

  getKgraphNodes(type?: string): unknown[] {
    if (type) return this.db.prepare('SELECT * FROM kgraph_nodes WHERE type = ? ORDER BY created_at DESC').all(type);
    return this.db.prepare('SELECT * FROM kgraph_nodes ORDER BY created_at DESC').all();
  }

  insertKgraphNode(n: { id: string; type: string; label: string; properties: string; created_at: number; created_by: string }): void {
    this.db.prepare('INSERT INTO kgraph_nodes (id,type,label,properties,created_at,created_by) VALUES (?,?,?,?,?,?)')
      .run(n.id, n.type, n.label, n.properties, n.created_at, n.created_by);
  }

  updateKgraphNode(id: string, label: string, properties: string): void {
    this.db.prepare('UPDATE kgraph_nodes SET label = ?, properties = ? WHERE id = ?').run(label, properties, id);
  }

  deleteKgraphNode(id: string): void {
    this.db.prepare('DELETE FROM kgraph_nodes WHERE id = ?').run(id);
  }

  /* ===== Knowledge Graph: Edges ===== */

  getKgraphEdges(nodeId?: string): unknown[] {
    if (nodeId) return this.db.prepare('SELECT * FROM kgraph_edges WHERE source_id = ? OR target_id = ? ORDER BY created_at DESC').all(nodeId, nodeId);
    return this.db.prepare('SELECT * FROM kgraph_edges ORDER BY created_at DESC').all();
  }

  insertKgraphEdge(e: { id: string; source_id: string; target_id: string; label: string; properties: string; created_at: number }): void {
    this.db.prepare('INSERT INTO kgraph_edges (id,source_id,target_id,label,properties,created_at) VALUES (?,?,?,?,?,?)')
      .run(e.id, e.source_id, e.target_id, e.label, e.properties, e.created_at);
  }

  deleteKgraphEdge(id: string): void {
    this.db.prepare('DELETE FROM kgraph_edges WHERE id = ?').run(id);
  }

  close(): void {
    this.db.close();
  }
}
