// The first view of a scene (11): all of it when its labels stay readable,
// else its top at a readable zoom, and the reader pans. fitView alone shrank
// hugo and kubernetes until box labels were about 3 px high.

export const LABEL_PX = 12; // .node font-size in styles.css
export const READABLE_PX = 11; // the smallest label the first view draws
export const FLOOR = READABLE_PX / LABEL_PX;
export const MAX_ZOOM = 1.2; // as Canvas centres a node: a small scene is not blown up
export const PAD = 24; // px between the scene and the canvas edge

// mapByDefault: below 900 px of window width the minimap would cover much of
// the canvas (on a phone, 4 to 8 boxes), so it starts hidden; its button in
// the controls shows it.
export const MAP_MIN_WIDTH = 900;
export const mapByDefault = (windowWidth: number): boolean => windowWidth >= MAP_MIN_WIDTH;

export type Rect = { x: number; y: number; w: number; h: number };
export type Viewport = { x: number; y: number; zoom: number };

// readableFit is the viewport that shows rects (absolute, in layout units) on
// a canvas of w × h px. When the whole scene fits at FLOOR or more, it is
// centred, as fitView would; whole says so. Otherwise the zoom is FLOOR and the
// top of the scene sits at the top of the canvas: the highest ranks, which
// depend on the rest, centred across it, but never so far that empty space
// shows beside the scene.
export function readableFit(rects: readonly Rect[], canvas: { w: number; h: number }): Viewport & { whole: boolean } {
  if (rects.length === 0) return { x: 0, y: 0, zoom: 1, whole: true };
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  const [w, h] = [right - left, bottom - top];
  const fit = Math.min(MAX_ZOOM, (canvas.w - 2 * PAD) / w, (canvas.h - 2 * PAD) / h);
  if (fit >= FLOOR) {
    return { x: canvas.w / 2 - ((left + right) / 2) * fit, y: canvas.h / 2 - ((top + bottom) / 2) * fit, zoom: fit, whole: true };
  }
  const zoom = FLOOR;
  let cx = (left + right) / 2;
  if (w * zoom > canvas.w - 2 * PAD) {
    // the first row: every rect that starts within one box height of the top.
    const row = rects.filter((r) => r.y < top + 40);
    const mid = (Math.min(...row.map((r) => r.x)) + Math.max(...row.map((r) => r.x + r.w))) / 2;
    const half = (canvas.w / 2 - PAD) / zoom;
    cx = Math.min(Math.max(mid, left + half), right - half);
  }
  return { x: canvas.w / 2 - cx * zoom, y: PAD - top * zoom, zoom, whole: false };
}
