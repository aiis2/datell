import * as crypto from 'crypto';
import type { DatabaseService } from './database';

export interface KgraphNode {
  id: string;
  type: string;
  label: string;
  properties: string; // JSON string
  created_at: number;
  created_by: string;
}

export interface KgraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
  properties: string; // JSON string
  created_at: number;
}

export function listNodes(db: DatabaseService, filter?: { type?: string }): KgraphNode[] {
  return db.getKgraphNodes(filter?.type) as KgraphNode[];
}

export function createNode(
  db: DatabaseService,
  data: { type: string; label: string; properties?: Record<string, unknown>; created_by?: string }
): KgraphNode {
  const node: KgraphNode = {
    id: crypto.randomUUID(),
    type: data.type || 'custom',
    label: data.label,
    properties: JSON.stringify(data.properties ?? {}),
    created_at: Date.now(),
    created_by: data.created_by || 'user',
  };
  db.insertKgraphNode(node);
  return node;
}

export function updateNode(
  db: DatabaseService,
  id: string,
  patch: { label?: string; properties?: Record<string, unknown> }
): void {
  const existing = (db.getKgraphNodes() as KgraphNode[]).find((n) => n.id === id);
  if (!existing) return;
  db.updateKgraphNode(
    id,
    patch.label ?? existing.label,
    JSON.stringify(patch.properties ?? JSON.parse(existing.properties || '{}'))
  );
}

export function deleteNode(db: DatabaseService, id: string): void {
  db.deleteKgraphNode(id);
}

export function listEdges(db: DatabaseService, nodeId?: string): KgraphEdge[] {
  return db.getKgraphEdges(nodeId) as KgraphEdge[];
}

export function createEdge(
  db: DatabaseService,
  data: { source_id: string; target_id: string; label: string; properties?: Record<string, unknown> }
): KgraphEdge {
  const edge: KgraphEdge = {
    id: crypto.randomUUID(),
    source_id: data.source_id,
    target_id: data.target_id,
    label: data.label || '',
    properties: JSON.stringify(data.properties ?? {}),
    created_at: Date.now(),
  };
  db.insertKgraphEdge(edge);
  return edge;
}

export function deleteEdge(db: DatabaseService, id: string): void {
  db.deleteKgraphEdge(id);
}
