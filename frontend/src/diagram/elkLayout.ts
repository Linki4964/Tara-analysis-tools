import type { DrawShape } from './shapes';
import { resolveConnectors } from './shapes';

/** Arrange connectable shapes with ELK while preserving their sizes and styles. */
export async function arrangeWithElk(shapes: DrawShape[]): Promise<DrawShape[]> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();
  const nodes = shapes.filter((shape) =>
    shape.kind === 'rect' || shape.kind === 'dashedRect' || shape.kind === 'circle'
  );
  if (nodes.length < 2) return shapes;

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = shapes
    .filter((shape) => shape.kind === 'arrow' && shape.ca && shape.cb && nodeIds.has(shape.ca) && nodeIds.has(shape.cb))
    .map((shape) => ({ id: `elk-${shape.id}`, sources: [shape.ca!], targets: [shape.cb!] }));

  const result = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '70',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
      'elk.padding': '[top=50,left=50,bottom=50,right=50]',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: Math.max(24, node.w),
      height: Math.max(24, node.h),
    })),
    edges,
  });

  const positions = new Map(
    (result.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }])
  );
  const oldMinX = Math.min(...nodes.map((node) => node.x));
  const oldMinY = Math.min(...nodes.map((node) => node.y));
  const newMinX = Math.min(...Array.from(positions.values()).map((point) => point.x));
  const newMinY = Math.min(...Array.from(positions.values()).map((point) => point.y));
  const dx = oldMinX - newMinX;
  const dy = oldMinY - newMinY;

  const moved = shapes.map((shape) => {
    const point = positions.get(shape.id);
    return point ? { ...shape, x: point.x + dx, y: point.y + dy } : shape;
  });
  return resolveConnectors(moved);
}
