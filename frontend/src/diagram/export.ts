/**
 * Export helpers for the vector whiteboard: SVG, PNG and JSON.
 *
 * PNG export rasterizes the in-page SVG at 2x. Everything is inline (attributes +
 * system font stack) so no external resources are fetched during rendering.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('style'); // drop DOM-only hiding; keep numeric width/height for the file
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Ensure numeric dimensions are present (render sets them; harden anyway).
  if (!clone.getAttribute('width')) clone.setAttribute('width', String(clone.viewBox.baseVal?.width ?? 800));
  if (!clone.getAttribute('height')) clone.setAttribute('height', String(clone.viewBox.baseVal?.height ?? 600));
  const xml = new XMLSerializer().serializeToString(clone);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
}

function safeFilename(base: string, ext: string): string {
  const safe = (base || 'architecture').replace(/[\\/:*?"<>|\s]+/g, '_');
  return `${safe}${ext}`;
}

export function exportSvgFile(svg: SVGSVGElement, filenameBase: string): void {
  const blob = new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, safeFilename(filenameBase, '.svg'));
}

export async function exportPngFile(svg: SVGSVGElement, filenameBase: string): Promise<void> {
  const xml = serializeSvg(svg);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG 渲染失败，无法导出 PNG'));
      img.src = url;
    });
    const rawW = svg.viewBox?.baseVal?.width ?? (Number(svg.getAttribute('width')) || 800);
    const rawH = svg.viewBox?.baseVal?.height ?? (Number(svg.getAttribute('height')) || 600);
    const scale = 2;
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rawW * scale));
    canvas.height = Math.max(1, Math.round(rawH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 不可用');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!pngBlob) throw new Error('PNG 编码失败');
    downloadBlob(pngBlob, safeFilename(filenameBase, '.png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function exportJson(data: unknown, filenameBase: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, safeFilename(filenameBase, '_diagram.json'));
}
