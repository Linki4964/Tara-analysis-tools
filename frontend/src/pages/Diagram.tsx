import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  NodeResizer,
  Position,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  BringToFront,
  ChevronDown,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Cpu,
  Database,
  Download,
  Eraser,
  Globe,
  Group,
  Hand,
  Lock,
  LockOpen,
  MessageSquare,
  MousePointer2,
  PenLine,
  Scissors,
  Send,
  SendToBack,
  Shield,
  Terminal,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { taraApi } from '../api/taraApi';

type AssetNodeType = 'hardware' | 'software' | 'data' | 'external' | 'boundary';

type AssetNodeData = {
  label: string;
  type: AssetNodeType;
  locked?: boolean;
  editing?: boolean;
  onRename?: (id: string, label: string) => void;
};

type Mode = 'select' | 'edit' | 'pan';

const NODE_TYPE_META: Record<AssetNodeType, { label: string; icon: typeof Cpu; cls: string }> = {
  hardware: { label: '硬件', icon: Cpu, cls: 'hardware' },
  software: { label: '软件', icon: Box, cls: 'software' },
  data: { label: '数据', icon: Database, cls: 'data' },
  external: { label: '外部实体', icon: Globe, cls: 'external' },
  boundary: { label: '系统边界', icon: Shield, cls: 'boundary' },
};

const PALETTE: Array<{ type: AssetNodeType; hint: string }> = [
  { type: 'hardware', hint: 'ECU、网关等物理组件' },
  { type: 'software', hint: '应用、固件、服务' },
  { type: 'data', hint: '数据资产' },
  { type: 'external', hint: '外部系统 / 人员' },
  { type: 'boundary', hint: '划定系统分析边界' },
];

const STORAGE_PREFIX = 'tara-diagram:';

function readSaved(key: string): { nodes?: Node<AssetNodeData>[]; edges?: Edge[] } | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as { nodes?: Node<AssetNodeData>[]; edges?: Edge[] };
  } catch {
    return null;
  }
}

function AssetNode({ id, data, selected }: NodeProps) {
  const d = data as AssetNodeData;
  const meta = NODE_TYPE_META[d.type] || NODE_TYPE_META.hardware;
  const Icon = meta.icon;
  return (
    <div className={`asset-node asset-node--${meta.cls}`}>
      <NodeResizer
        isVisible={!!selected}
        minWidth={120}
        minHeight={40}
        color="#2563eb"
        lineClassName="asset-node-resizer-line"
        handleClassName="asset-node-resizer-handle"
      />
      <Handle type="target" position={Position.Left} className="asset-node-handle" />
      <span className="asset-node-icon"><Icon size={18} /></span>
      {d.editing ? (
        <input
          className="asset-node-input"
          autoFocus
          defaultValue={d.label}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => d.onRename?.(id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') d.onRename?.(id, d.label);
          }}
        />
      ) : (
        <span className="asset-node-label">{d.label}</span>
      )}
      {d.locked && !d.editing && <Lock size={12} className="asset-node-lock" />}
      <Handle type="source" position={Position.Right} className="asset-node-handle" />
    </div>
  );
}

function GroupNode({ data, selected }: NodeProps) {
  const d = data as { label?: string };
  return (
    <div className={`group-node ${selected ? 'group-node--selected' : ''}`}>
      {d.label && <span className="group-node-label">{d.label}</span>}
    </div>
  );
}

const nodeTypes: NodeTypes = { asset: AssetNode, group: GroupNode };

type DiagramCanvasProps = {
  runId?: string | null;
  notify?: (msg: string) => void;
  onStats?: (nodeCount: number) => void;
  onBack?: () => void;
  onNext?: () => void;
};

function DiagramCanvas({ runId, notify, onStats, onBack, onNext }: DiagramCanvasProps) {
  const { screenToFlowPosition, deleteElements } = useReactFlow();

  const [projectName, setProjectName] = useState('');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
  const [chatText, setChatText] = useState('');
  const [agentOpen, setAgentOpen] = useState(true);
  const [toast, setToast] = useState('');
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const idCounter = useRef(0);

  const runKey = runId ? `${STORAGE_PREFIX}${runId}` : `${STORAGE_PREFIX}pending`;

  const isPan = mode === 'pan';
  const isEdit = mode === 'edit';

  function showToast(msg: string) {
    if (notify) notify(msg);
    else setToast(msg);
  }

  const commitRename = useCallback((id: string, label: string) => {
    const clean = label.trim();
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        const d = n.data as AssetNodeData;
        return { ...n, data: { ...d, label: clean || d.label, editing: false } };
      })
    );
  }, []);

  const startEditing = useCallback((id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (node && (node.data as AssetNodeData).locked) {
      showToast('节点已锁定，请先解锁');
      return;
    }
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data as AssetNodeData), editing: true } } : n))
    );
  }, [nodes]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true }, eds)),
    []
  );

  // Load project name
  useEffect(() => {
    if (!runId) return;
    taraApi.getRun(runId).then((res) => {
      if (res.run?.project_name) setProjectName(res.run.project_name);
    }).catch(() => {});
  }, [runId]);

  // Load diagram (project key first, else migrate the pending drawing)
  useEffect(() => {
    const normalize = (ns: Node<AssetNodeData>[] | undefined) =>
      (ns || []).map((n) => ({
        ...n,
        initialWidth: n.width ?? n.initialWidth ?? 200,
        initialHeight: n.height ?? n.initialHeight ?? 56,
        data: { ...(n.data as AssetNodeData), onRename: commitRename, editing: false },
      }));
    const saved = readSaved(runKey);
    if (saved && (saved.nodes?.length || saved.edges?.length)) {
      setNodes(normalize(saved.nodes));
      setEdges(saved.edges || []);
    } else if (runId) {
      const pending = readSaved(`${STORAGE_PREFIX}pending`);
      if (pending && pending.nodes?.length) {
        setNodes(normalize(pending.nodes));
        setEdges(pending.edges || []);
        try {
          window.localStorage.removeItem(`${STORAGE_PREFIX}pending`);
        } catch { /* ignore */ }
      }
    }
    setLoadedKey(runKey);
  }, [runKey, runId, commitRename]);

  // Persist diagram
  useEffect(() => {
    if (loadedKey === null) return;
    try {
      window.localStorage.setItem(loadedKey, JSON.stringify({ nodes, edges }));
    } catch { /* storage unavailable */ }
  }, [loadedKey, nodes, edges]);

  // Report node count to the parent (e.g. workspace step completion)
  useEffect(() => {
    onStats?.(nodes.length);
  }, [nodes, onStats]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function addNode(type: AssetNodeType) {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const jitter = (nodes.length % 5) * 24;
    const meta = NODE_TYPE_META[type];
    const node: Node<AssetNodeData> = {
      id: `node-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      type: 'asset',
      position: {
        x: Math.round(center.x - 100 + jitter),
        y: Math.round(center.y - 28 + jitter),
      },
      initialWidth: 200,
      initialHeight: 56,
      data: { label: meta.label, type, onRename: commitRename },
    };
    setNodes((nds) => [...nds, node]);
    showToast(`已添加「${meta.label}」节点`);
  }

  function handleDeleteSelected() {
    if (!selected.nodes.length && !selected.edges.length) {
      showToast('请先选中要删除的节点');
      return;
    }
    deleteElements({ nodes: selected.nodes, edges: selected.edges });
    setSelected({ nodes: [], edges: [] });
  }

  function handleClear() {
    if (!nodes.length && !edges.length) return;
    if (!window.confirm('确定要清空画布吗？此操作不可恢复。')) return;
    setNodes([]);
    setEdges([]);
    setSelected({ nodes: [], edges: [] });
  }

  function handleNodeDoubleClick(_: unknown, node: Node) {
    startEditing(node.id);
  }

  function handleNodeClick(_: unknown, node: Node) {
    if (isEdit) startEditing(node.id);
  }

  // ---- Right-click context menu actions ----

  function nextId(prefix: string) {
    idCounter.current += 1;
    return `${prefix}-${Date.now()}-${idCounter.current}`;
  }

  function openMenu(x: number, y: number, nodeId: string | null) {
    setMenu({ x, y, nodeId });
  }

  function closeMenu() {
    setMenu(null);
  }

  function actionTargets(nodeId: string | null): Node[] {
    if (!nodeId) return [];
    const sel = selected.nodes;
    if (sel.some((n) => n.id === nodeId)) return sel;
    const node = nodes.find((n) => n.id === nodeId);
    return node ? [node] : [];
  }

  function targetsUnlocked(list: Node[]) {
    return list.filter((n) => !(n.data as AssetNodeData).locked);
  }

  function cleanData(n: Node): Node {
    const d = n.data as AssetNodeData;
    return {
      ...n,
      parentId: undefined,
      selected: false,
      data: { label: d.label, type: d.type, locked: d.locked },
    };
  }

  function copySelection(nodeId: string | null) {
    const targets = actionTargets(nodeId);
    if (!targets.length) {
      showToast('请先选中要复制的节点');
      return;
    }
    const ids = new Set(targets.map((n) => n.id));
    clipboardRef.current = {
      nodes: targets.map(cleanData),
      edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e })),
    };
    showToast(`已复制 ${targets.length} 个节点`);
  }

  function cutSelection(nodeId: string | null) {
    const all = actionTargets(nodeId);
    if (!all.length) {
      showToast('请先选中要剪切的节点');
      return;
    }
    copySelection(nodeId);
    deleteTargets(nodeId);
  }

  function paste(nodeId: string | null) {
    const clip = clipboardRef.current;
    if (!clip || !clip.nodes.length) {
      showToast('剪贴板为空，请先复制节点');
      return;
    }
    const idMap = new Map<string, string>();
    clip.nodes.forEach((n) => idMap.set(n.id, nextId('node')));
    const pastedNodes: Node[] = clip.nodes.map((n) => {
      const newId = idMap.get(n.id)!;
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        selected: true,
        data: { ...(n.data as AssetNodeData), onRename: commitRename, editing: false },
      };
    });
    const pastedEdges: Edge[] = clip.edges
      .map((e) => ({
        ...e,
        id: nextId('edge'),
        source: idMap.get(e.source) || e.source,
        target: idMap.get(e.target) || e.target,
        animated: true,
        selected: false,
      }))
      .filter((e) => idMap.has(e.source) && idMap.has(e.target));
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...pastedNodes]);
    setEdges((eds) => [...eds, ...pastedEdges]);
    setSelected({ nodes: pastedNodes, edges: pastedEdges });
    showToast(`已粘贴 ${pastedNodes.length} 个节点`);
  }

  function duplicateSelection(nodeId: string | null) {
    const targets = actionTargets(nodeId);
    if (!targets.length) {
      showToast('请先选中要复制的节点');
      return;
    }
    const ids = new Set(targets.map((n) => n.id));
    const innerEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const idMap = new Map<string, string>();
    targets.forEach((n) => idMap.set(n.id, nextId('node')));
    const dups: Node[] = targets.map((n) => {
      const newId = idMap.get(n.id)!;
      const d = n.data as AssetNodeData;
      return {
        ...cleanData(n),
        id: newId,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        selected: true,
        data: { label: d.label, type: d.type, locked: d.locked, onRename: commitRename, editing: false },
      };
    });
    const dupEdges: Edge[] = innerEdges.map((e) => ({
      ...e,
      id: nextId('edge'),
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
      selected: false,
    }));
    setNodes((nds) => [...nds, ...dups]);
    setEdges((eds) => [...eds, ...dupEdges]);
    setSelected({ nodes: dups, edges: dupEdges });
    showToast(`已创建 ${dups.length} 个副本`);
  }

  function deleteTargets(nodeId: string | null) {
    const all = actionTargets(nodeId);
    if (!all.length) {
      showToast('请先选中要删除的节点');
      return;
    }
    const unlocked = targetsUnlocked(all);
    if (!unlocked.length) {
      showToast('所选节点均已锁定，无法删除');
      return;
    }
    const ids = new Set(unlocked.map((n) => n.id));
    // Deleting a group node also deletes its children
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const n of nodes) {
        if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
          ids.add(n.id);
          expanded = true;
        }
      }
    }
    const skipped = all.length !== unlocked.length;
    setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setSelected({ nodes: [], edges: [] });
    showToast(skipped ? `已删除 ${unlocked.length} 个节点（跳过锁定节点）` : `已删除 ${unlocked.length} 个节点`);
  }

  function bringToFront(nodeId: string | null) {
    const targets = actionTargets(nodeId);
    if (!targets.length) return;
    const targetIds = new Set(targets.map((n) => n.id));
    const maxZ = nodes.reduce((m, n) => Math.max(m, n.zIndex ?? 0), 0);
    setNodes((nds) => {
      const moved: Node[] = [];
      const rest: Node[] = [];
      for (const n of nds) {
        const isTarget = targetIds.has(n.id);
        if (isTarget) moved.push({ ...n, zIndex: maxZ + 1, selected: false });
        else rest.push(n);
      }
      // move targets to the END of the array so they render on top
      return [...rest, ...moved];
    });
    setSelected({ nodes: [], edges: [] });
    showToast('已移到最顶层');
  }

  function sendToBack(nodeId: string | null) {
    const targets = actionTargets(nodeId);
    if (!targets.length) return;
    const targetIds = new Set(targets.map((n) => n.id));
    const minZ = nodes.reduce((m, n) => Math.min(m, n.zIndex ?? 0), 0);
    setNodes((nds) => {
      const moved: Node[] = [];
      const rest: Node[] = [];
      for (const n of nds) {
        const isTarget = targetIds.has(n.id);
        if (isTarget) moved.push({ ...n, zIndex: minZ - 1, selected: false });
        else rest.push(n);
      }
      // move targets to the START of the array so they render on bottom
      return [...moved, ...rest];
    });
    setSelected({ nodes: [], edges: [] });
    showToast('已移到最底层');
  }

  function toggleLock(nodeId: string | null) {
    const targets = actionTargets(nodeId);
    if (!targets.length) return;
    const first = targets[0];
    const locked = !(first.data as AssetNodeData).locked;
    const ids = new Set(targets.map((n) => n.id));
    setNodes((nds) =>
      nds.map((n) =>
        ids.has(n.id)
          ? { ...n, draggable: locked ? false : undefined, data: { ...(n.data as AssetNodeData), locked } }
          : n
      )
    );
    showToast(locked ? `已锁定 ${targets.length} 个节点` : `已解锁 ${targets.length} 个节点`);
  }

  function groupSelected(nodeId: string | null) {
    const targets = actionTargets(nodeId).filter((n) => n.type !== 'group');
    if (targets.length < 1) {
      showToast('请选择要组合的节点');
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of targets) {
      const w = n.measured?.width ?? n.width ?? n.initialWidth ?? 200;
      const h = n.measured?.height ?? n.height ?? n.initialHeight ?? 56;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }
    const groupId = nextId('group');
    const targetIds = new Set(targets.map((n) => n.id));
    setNodes((nds) => [
      ...nds.map((n) =>
        targetIds.has(n.id)
          ? {
              ...n,
              parentId: groupId,
              position: { x: n.position.x - minX, y: n.position.y - minY },
              zIndex: undefined,
            }
          : n
      ),
      {
        id: groupId,
        type: 'group',
        position: { x: minX, y: minY },
        style: { width: Math.max(maxX - minX, 60), height: Math.max(maxY - minY, 40) },
        data: { label: '分组' },
        zIndex: -10,
        selectable: true,
      },
    ]);
    setSelected({ nodes: [], edges: [] });
    showToast(`已组合 ${targets.length} 个节点`);
  }

  function ungroupSelection(nodeId: string | null) {
    const group = nodes.find((n) => n.id === nodeId && n.type === 'group');
    if (!group) {
      showToast('请选择要取消组合的分组');
      return;
    }
    setNodes((nds) => [
      ...nds.filter((n) => n.id !== group.id && n.parentId !== group.id).map((n) => ({ ...n, selected: false })),
      ...nds
        .filter((n) => n.parentId === group.id)
        .map((n) => ({
          ...n,
          parentId: undefined,
          zIndex: undefined,
          position: { x: n.position.x + group.position.x, y: n.position.y + group.position.y },
        })),
    ]);
    setSelected({ nodes: [], edges: [] });
    showToast('已取消组合');
  }

  function handleExport() {
    const payload = {
      projectName,
      runId: runId || null,
      exportedAt: new Date().toISOString(),
      nodes,
      edges,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = window.document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(projectName || 'diagram').replace(/[^a-zA-Z0-9_-]/g, '_')}_diagram.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('结构图已导出 (JSON)');
  }

  const agentLog = [
    { text: '智能体已就绪', ok: true },
    { text: '等待用户绘制资产结构图…', ok: false },
    { text: `画布：${nodes.length} 个节点 · ${edges.length} 条连线`, ok: false },
    { text: nodes.length === 0 ? '提示：从右侧工具栏添加资产节点' : '提示：编辑模式下点击节点改名，双击改名，拖动把手连线', ok: false },
  ];

  let menuContent: ReactNode = null;
  if (menu) {
    const isGroupTarget = nodes.find((n) => n.id === menu.nodeId)?.type === 'group';
    const targetNode = menu.nodeId ? nodes.find((n) => n.id === menu.nodeId) : undefined;
    const targetLocked = Boolean(targetNode && (targetNode.data as AssetNodeData).locked);
    const canPaste = clipboardRef.current !== null && clipboardRef.current.nodes.length > 0;
    const menuX = Math.max(8, Math.min(menu.x, window.innerWidth - 200 - 8));
    const menuY = Math.max(8, Math.min(menu.y, window.innerHeight - 380 - 8));

    type Item = { key: string; label: string; icon: ReactNode; danger?: boolean; disabled?: boolean; sep?: boolean; onClick: () => void };
    const items: Item[] = [];
    if (menu.nodeId) {
      items.push(
        { key: 'copy', label: '复制', icon: <Copy size={15} />, onClick: () => { copySelection(menu.nodeId); closeMenu(); } },
        { key: 'cut', label: '剪切', icon: <Scissors size={15} />, onClick: () => { cutSelection(menu.nodeId); closeMenu(); } },
        { key: 'paste', label: '粘贴', icon: <ClipboardPaste size={15} />, disabled: !canPaste, onClick: () => { paste(menu.nodeId); closeMenu(); } },
        { key: 'duplicate', label: '创建副本', icon: <CopyPlus size={15} />, onClick: () => { duplicateSelection(menu.nodeId); closeMenu(); } },
        { key: 'delete', label: '删除', icon: <Trash2 size={15} />, danger: true, sep: true, onClick: () => { deleteTargets(menu.nodeId); closeMenu(); } },
        { key: 'front', label: '移到最顶层', icon: <BringToFront size={15} />, sep: true, onClick: () => { bringToFront(menu.nodeId); closeMenu(); } },
        { key: 'back', label: '移到最底层', icon: <SendToBack size={15} />, onClick: () => { sendToBack(menu.nodeId); closeMenu(); } },
        { key: 'lock', label: targetLocked ? '解锁' : '锁定', icon: targetLocked ? <LockOpen size={15} /> : <Lock size={15} />, sep: true, onClick: () => { toggleLock(menu.nodeId); closeMenu(); } },
      );
      if (isGroupTarget) {
        items.push({ key: 'ungroup', label: '取消组合', icon: <Ungroup size={15} />, onClick: () => { ungroupSelection(menu.nodeId); closeMenu(); } });
      } else {
        items.push({ key: 'group', label: '组合', icon: <Group size={15} />, onClick: () => { groupSelected(menu.nodeId); closeMenu(); } });
      }
    } else {
      items.push(
        { key: 'paste', label: '粘贴', icon: <ClipboardPaste size={15} />, disabled: !canPaste, onClick: () => { paste(null); closeMenu(); } },
      );
    }

    menuContent = (
      <>
        <div
          className="diagram-menu-backdrop"
          onClick={closeMenu}
          onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}
        />
        <div className="diagram-menu" style={{ left: menuX, top: menuY }}>
          {items.map((item) => (
            <Fragment key={item.key}>
              {item.sep && <div className="diagram-menu-separator" />}
              <button
                className={`diagram-menu-item ${item.danger ? 'diagram-menu-item--danger' : ''}`}
                type="button"
                disabled={item.disabled}
                onClick={item.onClick}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </Fragment>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className={`diagram-canvas diagram-canvas--${mode}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={setSelected}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          openMenu(event.clientX, event.clientY, node.id);
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          openMenu(event.clientX, event.clientY, null);
        }}
        panOnDrag={isPan}
        selectionOnDrag={!isEdit && !isPan}
        nodesDraggable={!isEdit && !isPan}
        nodesConnectable={!isPan}
        elementsSelectable={!isPan}
        fitView
        colorMode="light"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
        <Controls position="bottom-left" />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="diagram-empty-hint">
          <MousePointer2 size={30} />
          <p>从右侧工具栏点击节点类型，开始绘制资产结构图</p>
          <p className="diagram-empty-sub">拖动节点摆放位置 · 从节点右侧拖出连线表示数据流</p>
        </div>
      )}

      {onBack && (
        <button className="diagram-fab diagram-fab--back" type="button" onClick={onBack}>
          <ArrowLeft size={15} />
          <span>返回</span>
        </button>
      )}

      {onNext && (
        <button className="diagram-fab diagram-fab--next" type="button" onClick={onNext}>
          <span>下一步</span>
          <ArrowRight size={15} />
        </button>
      )}

      {/* Agent log floating panel (left) */}
      <aside className={`diagram-agentlog ${agentOpen ? '' : 'diagram-agentlog--collapsed'}`}>
        <div className="diagram-agentlog-head" onClick={() => setAgentOpen(!agentOpen)}>
          <Terminal size={14} />
          <span>智能体日志</span>
          <ChevronDown size={14} className={`diagram-agentlog-caret ${agentOpen ? '' : 'diagram-agentlog-caret--collapsed'}`} />
        </div>
        {agentOpen && (
          <div className="diagram-agentlog-body">
            {agentLog.map((line, i) => (
              <div className={`diagram-agentlog-line ${line.ok ? 'diagram-agentlog-line--ok' : ''}`} key={i}>
                <span className="diagram-agentlog-dot">{line.ok ? '●' : '○'}</span>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Right drawing toolbar */}
      <aside className="diagram-toolbar">
        <div className="diagram-toolbar-section">
          <h3 className="diagram-toolbar-title">模式</h3>
          <div className="diagram-mode-group">
            <button
              className={`diagram-mode-btn ${mode === 'select' ? 'diagram-mode-btn--active' : ''}`}
              type="button"
              title="选择：选择并移动节点"
              onClick={() => setMode('select')}
            >
              <MousePointer2 size={15} /> 选择
            </button>
            <button
              className={`diagram-mode-btn ${mode === 'edit' ? 'diagram-mode-btn--active' : ''}`}
              type="button"
              title="编辑：点击节点改名 / 拖动把手连线"
              onClick={() => setMode('edit')}
            >
              <PenLine size={15} /> 编辑
            </button>
            <button
              className={`diagram-mode-btn ${mode === 'pan' ? 'diagram-mode-btn--active' : ''}`}
              type="button"
              title="平移：拖动画布"
              onClick={() => setMode('pan')}
            >
              <Hand size={15} /> 平移
            </button>
          </div>
        </div>

        <div className="diagram-toolbar-section">
          <h3 className="diagram-toolbar-title">节点</h3>
          {PALETTE.map((item) => {
            const meta = NODE_TYPE_META[item.type];
            const Icon = meta.icon;
            return (
              <button key={item.type} className="diagram-palette-btn" type="button" title={item.hint} onClick={() => addNode(item.type)}>
                <span className={`diagram-palette-icon diagram-palette-icon--${meta.cls}`}><Icon size={16} /></span>
                <span className="diagram-palette-label">{meta.label}</span>
                <span className="diagram-palette-plus">+</span>
              </button>
            );
          })}
        </div>

        <div className="diagram-toolbar-section">
          <h3 className="diagram-toolbar-title">操作</h3>
          <button className="diagram-tool-btn" type="button" onClick={handleDeleteSelected} disabled={!selected.nodes.length && !selected.edges.length}>
            <Trash2 size={15} /> 删除选中
          </button>
          <button className="diagram-tool-btn" type="button" onClick={handleExport}>
            <Download size={15} /> 导出 JSON
          </button>
          <button className="diagram-tool-btn diagram-tool-btn--danger" type="button" onClick={handleClear}>
            <Eraser size={15} /> 清空画布
          </button>
        </div>

        <div className="diagram-toolbar-foot">
          {nodes.length} 节点 · {edges.length} 连线
        </div>
      </aside>

      {/* Bottom AI chat input bar (always visible) */}
      <div className="diagram-chat">
        <MessageSquare size={16} className="diagram-chat-icon" />
        <input
          className="diagram-chat-input"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          placeholder="向 AI 描述你的结构图…（功能开发中）"
          onKeyDown={(e) => { if (e.key === 'Enter') setChatText(''); }}
        />
        <button className="diagram-chat-send" type="button" disabled title="AI 功能开发中">
          <Send size={16} />
        </button>
      </div>

      {menuContent}

      {!notify && toast && <div className="toast toast--visible">{toast}</div>}
    </div>
  );
}

/** Embeddable diagram work area (ReactFlowProvider included). */
export function DiagramEmbed({ runId, notify, onStats, onBack, onNext }: DiagramCanvasProps) {
  return (
    <ReactFlowProvider>
      <DiagramCanvas runId={runId} notify={notify} onStats={onStats} onBack={onBack} onNext={onNext} />
    </ReactFlowProvider>
  );
}

export default function Diagram() {
  const navigate = useNavigate();
  const { runId } = useParams<{ runId: string }>();

  if (!runId) return null;

  return (
    <div className="diagram-page">
      <DiagramEmbed
        runId={runId}
        onBack={() => navigate('/projects')}
        onNext={() => navigate('/workspace', { state: { loadRunId: runId } })}
      />
    </div>
  );
}
