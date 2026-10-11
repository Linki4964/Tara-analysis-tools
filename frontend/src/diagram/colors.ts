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
  hardware: { fill: '#ffffff', stroke: '#111827', headerFill: '#ffffff', text: '#111827' },
  software: { fill: '#ffffff', stroke: '#111827', headerFill: '#ffffff', text: '#111827' },
  network: { fill: '#ffffff', stroke: '#111827', headerFill: '#ffffff', text: '#111827' },
  external: { fill: '#ffffff', stroke: '#111827', headerFill: '#ffffff', text: '#111827' },
  asset: { fill: '#ffffff', stroke: '#111827', headerFill: '#ffffff', text: '#111827' },
  control: { fill: '#ffffff', stroke: '#111827', headerFill: '#ffffff', text: '#111827' },
};

export const BOUNDARY_STYLE = {
  stroke: '#111827',
  fill: 'rgba(255,255,255,0)',
  dash: '8 5',
  text: '#111827',
};

export const ITEM_STYLE = {
  stroke: '#111827',
  fill: 'rgba(255,255,255,0)',
  dash: '10 6',
  text: '#111827',
};

export const FLOW_COLOR = '#111827';
export const FLOW_SELECT_COLOR = '#2563eb';
export const SERVICE_FILL = '#ffffff';

export const FONT_FAMILY_ATTR = FONT_STACK;
