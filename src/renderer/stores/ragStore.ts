import { create } from 'zustand';

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

export interface RagSearchResult {
  id: string;
  document_id: string;
  filename: string;
  content: string;
  score: number;
}

export interface ChunkOptions {
  mode: 'auto' | 'custom';
  delimiter?: string;
  maxLength?: number;
  overlap?: number;
  removeExtraWhitespace?: boolean;
  removeUrlsEmails?: boolean;
}

export interface RagChunk {
  id: string;
  chunk_index: number;
  content: string;
  created_at: number;
}

interface RagState {
  collections: RagCollection[];
  documents: RagDocument[];
  activeCollectionId: string | null;
  chunks: RagChunk[];
  chunksDocumentId: string | null;
  loading: boolean;
  error: string | null;

  setActiveCollection: (id: string | null) => void;
  loadCollections: () => Promise<void>;
  createCollection: (data: Partial<RagCollection>) => Promise<RagCollection>;
  deleteCollection: (id: string) => Promise<void>;
  loadDocuments: (collectionId: string) => Promise<void>;
  addDocument: (collectionId: string, filePath: string, modelCfg?: { baseUrl: string; apiKey: string; model?: string }, chunkOpts?: ChunkOptions) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  loadChunks: (collectionId: string, documentId: string) => Promise<void>;
  updateChunk: (id: string, content: string) => Promise<void>;
  searchFts: (collectionId: string, query: string, topK?: number) => Promise<RagSearchResult[]>;
  searchSemantic: (collectionId: string, query: string, cfg: { baseUrl: string; apiKey: string; model?: string }, topK?: number) => Promise<RagSearchResult[]>;
}

const api = () => (window as any).electronAPI;

export const useRagStore = create<RagState>((set, get) => ({
  collections: [],
  documents: [],
  activeCollectionId: null,
  chunks: [],
  chunksDocumentId: null,
  loading: false,
  error: null,

  setActiveCollection: (id) => {
    set({ activeCollectionId: id });
    if (id) get().loadDocuments(id);
  },

  loadCollections: async () => {
    set({ loading: true, error: null });
    try {
      const cols = await api().ragCollectionsList();
      set({ collections: cols, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createCollection: async (data) => {
    const col = await api().ragCollectionsCreate(data);
    set((s) => ({ collections: [col, ...s.collections] }));
    return col as RagCollection;
  },

  deleteCollection: async (id) => {
    await api().ragCollectionsDelete(id);
    set((s) => ({
      collections: s.collections.filter((c) => c.id !== id),
      activeCollectionId: s.activeCollectionId === id ? null : s.activeCollectionId,
      documents: s.activeCollectionId === id ? [] : s.documents,
    }));
  },

  loadDocuments: async (collectionId) => {
    set({ loading: true });
    try {
      const docs = await api().ragDocumentsList(collectionId);
      set({ documents: docs, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addDocument: async (collectionId, filePath, modelCfg, chunkOpts) => {
    set({ loading: true });
    try {
      await api().ragDocumentsAdd(collectionId, filePath, modelCfg, chunkOpts);
      await get().loadDocuments(collectionId);
    } finally {
      set({ loading: false });
    }
  },

  updateChunk: async (id, content) => {
    await api().ragChunksUpdate(id, content);
    // Refresh chunks list if we have an active document
    const { activeCollectionId, chunksDocumentId } = get();
    if (activeCollectionId && chunksDocumentId) {
      await get().loadChunks(activeCollectionId, chunksDocumentId);
    }
  },

  removeDocument: async (id) => {
    await api().ragDocumentsRemove(id);
    const { activeCollectionId } = get();
    if (activeCollectionId) await get().loadDocuments(activeCollectionId);
    else set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }));
  },

  loadChunks: async (collectionId, documentId) => {
    set({ loading: true });
    try {
      const chunks = await api().ragChunksList(collectionId, documentId);
      set({ chunks: chunks as RagChunk[], chunksDocumentId: documentId, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  searchFts: async (collectionId, query, topK) => {
    return await api().ragSearchFts(collectionId, query, topK);
  },

  searchSemantic: async (collectionId, query, cfg, topK) => {
    return await api().ragSearchSemantic(collectionId, query, cfg, topK);
  },
}));
