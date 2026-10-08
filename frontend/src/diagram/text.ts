/**
 * Text measurement & truncation helpers for the SVG renderer.
 *
 * SVG is exported to PNG, so we must NOT rely on webfonts. Text metrics are
 * measured against the same system font stack used by the renderer; a cheap
 * heuristic backs the canvas measurement when it is unavailable.
 */

export const FONT_STACK =
  "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Hiragino Sans GB', sans-serif";

let _ctx: CanvasRenderingContext2D | null = null;
let _ctxFailed = false;

function getCtx(): CanvasRenderingContext2D | null {
  if (_ctx || _ctxFailed) return _ctx;
  try {
    const canvas = window.document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      _ctxFailed = true;
      return null;
    }
    _ctx = ctx;
    return ctx;
  } catch {
    _ctxFailed = true;
    return null;
  }
}

/** Rough width estimate; CJK chars are ~1em wide, ASCII ~0.6em. */
function estimateWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    // Wide / CJK ranges plus full-width punctuation.
    const isWide =
      code > 0x2e7f || code === 0x2000 || (code >= 0xff00 && code <= 0xff60) || code === 0x3000;
    w += isWide ? px : px * 0.6;
  }
  return w;
}

export function measureText(text: string, px = 13): number {
  if (!text) return 0;
  const ctx = getCtx();
  if (ctx) {
    try {
      ctx.font = `${px}px ${FONT_STACK}`;
      return ctx.measureText(text).width;
    } catch {
      /* fall through to estimate */
    }
  }
  return estimateWidth(text, px);
}

/** Truncate `text` so its measured width stays within `maxPx` (appends …). */
export function truncateToWidth(text: string, maxPx: number, px = 13): string {
  if (!text || measureText(text, px) <= maxPx) return text;
  if (maxPx <= 0) return '';
  let lo = 0;
  let hi = text.length;
  // chars after which we append '…' which itself is ~1em
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureText(text.slice(0, mid), px) + px * 0.9 <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, Math.max(lo, 0)).replace(/\s+$/, '') + '…';
}
