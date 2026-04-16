/**
 * TaskGraphSvg — SVG workflow diagram showing serial/parallel task topology
 *
 * Visual design:
 *  - Serial steps: stacked vertically, connected with thin dashed lines (no arrowheads)
 *  - Parallel groups: fork bar -> horizontal columns -> join bar
 *  - Status animations:
 *      pending  = hollow gray circle
 *      running  = spinning arc + pulsing node border
 *      done     = filled green circle + white checkmark
 *      error    = filled red circle + white x mark
 */
import React from 'react';
import type { AgentTodo } from '../stores/subagentStore';

export interface TaskGraphSvgProps {
  todos: AgentTodo[];
}

interface GraphGroup {
  groupKey: string | null;
  items: AgentTodo[];
  isParallel: boolean;
}

// Layout constants
const NODE_W = 168;
const NODE_H = 30;
const H_GAP = 12;
const V_GAP = 22;
const FORK_H = 16;
const CANVAS_PAD_X = 16;
const CANVAS_PAD_Y = 14;
const DOT_CX_OFFSET = 11;

function groupTodos(todos: AgentTodo[]): GraphGroup[] {
  const groups: GraphGroup[] = [];
  const visited = new Set<string>();
  for (const t of todos) {
    if (visited.has(t.id)) continue;
    if (t.parallelGroup) {
      const siblings = todos.filter((x) => x.parallelGroup === t.parallelGroup);
      siblings.forEach((x) => visited.add(x.id));
      groups.push({ groupKey: t.parallelGroup, items: siblings, isParallel: true });
    } else {
      visited.add(t.id);
      groups.push({ groupKey: null, items: [t], isParallel: false });
    }
  }
  return groups;
}

function statusColors(status: AgentTodo['status']) {
  switch (status) {
    case 'done':    return { fill: '#f0fdf4', stroke: '#22c55e', text: '#15803d' };
    case 'error':   return { fill: '#fff1f2', stroke: '#f43f5e', text: '#be123c' };
    case 'running': return { fill: '#eff6ff', stroke: '#3b82f6', text: '#1d4ed8' };
    default:        return { fill: '#f8fafc', stroke: '#e2e8f0', text: '#64748b' };
  }
}

function SpinningArc({ cx, cy }: { cx: number; cy: number }) {
  const r = 5.5;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.3;
  const gap = circ - dash;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#bfdbfe" strokeWidth="1.5" />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeDasharray={`${dash.toFixed(2)} ${gap.toFixed(2)}`}
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`-90 ${cx} ${cy}`}
          to={`270 ${cx} ${cy}`}
          dur="0.85s"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx={cx} cy={cy} r={1.8} fill="#3b82f6" opacity="0.7" />
    </g>
  );
}

function StatusIndicator({ status, cx, cy }: { status: AgentTodo['status']; cx: number; cy: number }) {
  if (status === 'running') return <SpinningArc cx={cx} cy={cy} />;

  if (status === 'done') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={5.5} fill="#22c55e" />
        <path
          d={`M${cx - 3},${cy + 0.5}l2.2,2.2l4.4,-4.4`}
          stroke="white" strokeWidth="1.4" fill="none"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </g>
    );
  }

  if (status === 'error') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={5.5} fill="#f43f5e" />
        <path
          d={`M${cx - 2.8},${cy - 2.8}l5.6,5.6M${cx + 2.8},${cy - 2.8}l-5.6,5.6`}
          stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"
        />
      </g>
    );
  }

  return <circle cx={cx} cy={cy} r={5.5} fill="none" stroke="#cbd5e1" strokeWidth="1.5" />;
}

export const TaskGraphSvg: React.FC<TaskGraphSvgProps> = ({ todos }) => {
  if (todos.length === 0) return null;

  const groups = groupTodos(todos);

  interface NodeLayout { x: number; y: number; w: number; h: number; todo: AgentTodo; }
  interface RowLayout {
    nodes: NodeLayout[];
    rowY: number; rowH: number; isParallel: boolean;
    forkX?: number; forkY?: number; joinY?: number; parallelLabel?: string;
  }

  const rows: RowLayout[] = [];
  let curY = CANVAS_PAD_Y;

  for (const group of groups) {
    if (!group.isParallel || group.items.length === 1) {
      const node: NodeLayout = { x: CANVAS_PAD_X, y: curY, w: NODE_W, h: NODE_H, todo: group.items[0] };
      rows.push({ nodes: [node], rowY: curY, rowH: NODE_H, isParallel: false });
      curY += NODE_H + V_GAP;
    } else {
      const n = group.items.length;
      const totalW = n * NODE_W + (n - 1) * H_GAP;
      const forkY = curY;
      curY += FORK_H;
      const nodes: NodeLayout[] = group.items.map((t, i) => ({
        x: CANVAS_PAD_X + i * (NODE_W + H_GAP), y: curY, w: NODE_W, h: NODE_H, todo: t,
      }));
      curY += NODE_H;
      const joinY = curY;
      curY += FORK_H + V_GAP;
      rows.push({
        nodes, rowY: forkY, rowH: FORK_H + NODE_H + FORK_H, isParallel: true,
        forkX: CANVAS_PAD_X + totalW / 2, forkY, joinY,
        parallelLabel: `并行x${n}`,
      });
    }
  }

  const canvasH = Math.max(curY - V_GAP + CANVAS_PAD_Y, CANVAS_PAD_Y * 2 + NODE_H);
  const canvasW = Math.max(
    NODE_W + CANVAS_PAD_X * 2,
    ...rows.map((r) => r.nodes[r.nodes.length - 1].x + r.nodes[r.nodes.length - 1].w + CANVAS_PAD_X + 50)
  );

  // Serial connection lines between rows
  const connLines: React.ReactElement[] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const cur = rows[i];
    const nxt = rows[i + 1];
    const curCX = cur.nodes.length === 1 ? cur.nodes[0].x + cur.nodes[0].w / 2 : (cur.forkX ?? CANVAS_PAD_X + NODE_W / 2);
    const nxtCX = nxt.nodes.length === 1 ? nxt.nodes[0].x + nxt.nodes[0].w / 2 : (nxt.forkX ?? CANVAS_PAD_X + NODE_W / 2);
    const fromY = cur.isParallel ? (cur.joinY ?? 0) + FORK_H : cur.rowY + NODE_H;
    const toY = nxt.isParallel ? (nxt.forkY ?? 0) : nxt.rowY;
    if (toY - fromY > 2) {
      connLines.push(
        <line key={`conn-${i}`} x1={curCX} y1={fromY} x2={nxtCX} y2={toY}
          stroke="#cbd5e1" strokeWidth="1.2" strokeDasharray="3 3" />
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      width={canvasW}
      height={canvasH}
      className="overflow-visible"
      style={{ maxWidth: '100%', height: 'auto' }}
    >
      {connLines}
      {rows.map((row, ri) => (
        <g key={ri}>
          {row.isParallel && (
            <>
              <line
                x1={row.nodes[0].x + row.nodes[0].w / 2} y1={(row.forkY ?? 0) + FORK_H / 2}
                x2={row.nodes[row.nodes.length - 1].x + row.nodes[row.nodes.length - 1].w / 2} y2={(row.forkY ?? 0) + FORK_H / 2}
                stroke="#93c5fd" strokeWidth="2" strokeLinecap="round"
              />
              {row.nodes.map((n, ni) => (
                <line key={`fd-${ni}`}
                  x1={n.x + n.w / 2} y1={(row.forkY ?? 0) + FORK_H / 2}
                  x2={n.x + n.w / 2} y2={n.y}
                  stroke="#93c5fd" strokeWidth="1.2"
                />
              ))}
              {row.nodes.map((n, ni) => (
                <line key={`jr-${ni}`}
                  x1={n.x + n.w / 2} y1={n.y + n.h}
                  x2={n.x + n.w / 2} y2={(row.joinY ?? 0) + FORK_H / 2}
                  stroke="#93c5fd" strokeWidth="1.2"
                />
              ))}
              <line
                x1={row.nodes[0].x + row.nodes[0].w / 2} y1={(row.joinY ?? 0) + FORK_H / 2}
                x2={row.nodes[row.nodes.length - 1].x + row.nodes[row.nodes.length - 1].w / 2} y2={(row.joinY ?? 0) + FORK_H / 2}
                stroke="#93c5fd" strokeWidth="2" strokeLinecap="round"
              />
              {row.parallelLabel && (() => {
                const lx = row.nodes[row.nodes.length - 1].x + row.nodes[row.nodes.length - 1].w + 6;
                const ly = (row.forkY ?? 0) + FORK_H / 2;
                return (
                  <g>
                    <rect x={lx} y={ly - 8} width={36} height={16} rx={4} fill="#dbeafe" stroke="#93c5fd" strokeWidth="0.8" />
                    <text x={lx + 18} y={ly + 0.5} fontSize="8.5" fill="#1d4ed8" textAnchor="middle" dominantBaseline="middle">
                      {row.parallelLabel}
                    </text>
                  </g>
                );
              })()}
            </>
          )}

          {row.nodes.map((n, ni) => {
            const colors = statusColors(n.todo.status);
            const dotCX = n.x + DOT_CX_OFFSET;
            const dotCY = n.y + n.h / 2;
            const labelX = dotCX + DOT_CX_OFFSET + 1;
            const maxLabelW = n.w - labelX + n.x - 6;
            const maxChars = Math.max(6, Math.floor(maxLabelW / 5.9));
            const labelText = n.todo.label.length > maxChars
              ? n.todo.label.slice(0, maxChars - 1) + '\u2026'
              : n.todo.label;

            return (
              <g key={`node-${ri}-${ni}`}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={5} ry={5}
                  fill={colors.fill} stroke={colors.stroke}
                  strokeWidth={n.todo.status === 'running' ? 1.5 : 1}
                />
                {n.todo.status === 'running' && (
                  <rect x={n.x - 1} y={n.y - 1} width={n.w + 2} height={n.h + 2} rx={6} ry={6}
                    fill="none" stroke="#60a5fa" strokeWidth="2">
                    <animate attributeName="opacity" values="0.1;0.55;0.1" dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="stroke-width" values="1;3;1" dur="1.6s" repeatCount="indefinite" />
                  </rect>
                )}
                <StatusIndicator status={n.todo.status} cx={dotCX} cy={dotCY} />
                <clipPath id={`clip-${ri}-${ni}`}>
                  <rect x={labelX} y={n.y + 2} width={maxLabelW} height={n.h - 4} />
                </clipPath>
                <text x={labelX} y={dotCY + 0.5} fontSize="10" fill={colors.text}
                  dominantBaseline="middle" clipPath={`url(#clip-${ri}-${ni})`}>
                  {labelText}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
};
