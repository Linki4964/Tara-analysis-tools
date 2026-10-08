/**
 * Single source of truth for architecture-image colors.
 *
 * All colors are applied as inline SVG attributes so that PNG/SVG exports stay
 * self-contained (no external stylesheets or webfonts are needed).
 */
import type { ComponentCategory } from './types';
import { FONT_STACK } from './text';

export { FONT_STACK };

export interface CategoryStyle {
  /** component body fill */
  fill: string;
  /** component border */
  stroke: string;
  /** header band behind the component name */
  headerFill: string;
  /** text color on body */
  text: string;
}

export const CATEGORY_STYLE: Record<ComponentCategory, CategoryStyle> = {
  hardware: { fill: '#eff6ff', stroke: '#2563eb', headerFill: '#bfdbfe', text: '#1e3a8a' },
  software: { fill: '#faf5ff', stroke: '#7c3aed', headerFill: '#ddd6fe', text: '#4c1d95' },
  network: { fill: '#ecfeff', stroke: '#0891b2', headerFill: '#a5f3fc', text: '#155e75' },
  external: { fill: '#f0fdf4', stroke: '#16a34a', headerFill: '#bbf7d0', text: '#166534' },
  control: { fill: '#fdf2f8', stroke: '#db2777', headerFill: '#fbcfe8', text: '#9d174d' },
};

export const BOUNDARY_STYLE = {
  stroke: '#64748b',
  fill: '#f8fafc',
  dash: '8 5',
  text: '#475569',
};

export const ITEM_STYLE = {
  stroke: '#94a3b8',
  fill: 'rgba(255,255,255,0)',
  dash: '10 6',
  text: '#334155',
};

export const FLOW_COLOR = '#475569';
export const FLOW_SELECT_COLOR = '#2563eb';
export const SERVICE_FILL = '#ffffff';

export const FONT_FAMILY_ATTR = FONT_STACK;
