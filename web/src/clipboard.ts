/**
 * Copying an asset preview to the clipboard.
 *
 * Browsers only accept a narrow set of types in `ClipboardItem`, and vector
 * formats are not among them — so an SVG has to be rasterised before it can be
 * pasted into Figma, Slack, or a doc. Where even PNG writes are unavailable we
 * fall back to putting the source on the clipboard as text, which is still the
 * useful thing to have for a vector asset.
 */

/** Longest edge of the rasterised PNG. Big enough to paste into a design tool. */
const RASTER_EDGE = 1024;

const canWriteImages = () =>
  typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);

/** Give an SVG explicit pixel dimensions so `<img>` reports an intrinsic size. */
function sizedSvg(source: string): { markup: string; width: number; height: number } {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.tagName !== 'svg' || doc.querySelector('parsererror')) throw new Error('not an svg');

  const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const viewW = box.length === 4 && box.every(Number.isFinite) ? box[2] : 0;
  const viewH = box.length === 4 && box.every(Number.isFinite) ? box[3] : 0;
  const declaredW = Number.parseFloat(svg.getAttribute('width') ?? '');
  const declaredH = Number.parseFloat(svg.getAttribute('height') ?? '');

  const w = viewW || declaredW || 512;
  const h = viewH || declaredH || 512;
  const scale = RASTER_EDGE / Math.max(w, h);
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));

  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  return { markup: new XMLSerializer().serializeToString(svg), width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('could not decode image'));
    image.src = src;
  });
}

function toPng(image: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/png');
  });
}

/** Fetch an artifact and return it as a PNG blob, rasterising vectors as needed. */
async function pngFor(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  const blob = await response.blob();
  const type = blob.type || response.headers.get('content-type') || '';

  if (type.includes('svg')) {
    const { markup, width, height } = sizedSvg(await blob.text());
    // A data URL keeps the SVG same-document, so the canvas is never tainted.
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    return toPng(await loadImage(src), width, height);
  }

  if (type === 'image/png') return blob;

  const bitmap = await createImageBitmap(blob);
  try {
    return await toPng(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/**
 * Put an artifact on the clipboard. Resolves with how it got there so the
 * caller can tell the user whether they have a picture or markup to paste.
 */
export async function copyArtifact(url: string): Promise<'image' | 'code'> {
  if (canWriteImages()) {
    try {
      // The ClipboardItem is built synchronously from a promise: Safari only
      // honours a write that starts inside the click that triggered it.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngFor(url) })]);
      return 'image';
    } catch {
      // Fall through and try to at least copy the source.
    }
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  const blob = await response.blob();
  const type = blob.type || response.headers.get('content-type') || '';
  if (!type.includes('svg') || !navigator.clipboard?.writeText) {
    throw new Error('clipboard images are not available in this browser');
  }
  await navigator.clipboard.writeText(await blob.text());
  return 'code';
}
