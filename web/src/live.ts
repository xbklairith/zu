// The page's side of zu serve's watch (13): /events says a newer View exists,
// or a notice for the reader; the page fetches view.json?latest and draws it
// in place, keeping its view state. Every View it draws came from zu.
import { parseView, type View } from "./data";

// Stream is what follow needs of an EventSource.
export type Stream = {
  readonly readyState: number; // 0 reconnecting, 1 open, 2 closed for good
  addEventListener(type: "open" | "error" | "view" | "notice", fn: (e: { data?: unknown }) => void): void;
  close(): void;
};

// Visibility is what follow needs of the document.
export type Visibility = {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", fn: () => void): void;
  removeEventListener(type: "visibilitychange", fn: () => void): void;
};

export const OFFLINE = "zu serve is not answering: the drawing may be out of date";

const CLOSED = 2;

// follow draws each newer View the stream open returns announces, fetched
// with load, and says each notice. first is the View on the page: its text,
// and the generation the watch had published when zu serve sent it. A View
// whose text is the one drawn is not drawn again; generations that arrive
// while a fetch runs cost one more fetch, not one each. A View the page
// cannot read keeps the drawing and is said instead. While doc is hidden
// the stream is closed, so hidden tabs hold none of the browser's few
// connections to zu serve; shown again, a new stream fetches the latest
// View once, and its text decides whether to draw. It returns a function
// that stops.
export function follow(
  open: () => Stream,
  load: () => Promise<Response>,
  first: { text: string; gen: number },
  show: (v: View) => void,
  say: (text: string) => void,
  doc: Visibility,
): () => void {
  let text = first.text;
  // The page load rescans, so its View is at least as new as first.gen's: a
  // stream that names first.gen asks for no fetch, which could step back.
  let drawn = first.gen;
  let wanted = 0;
  let busy = false;
  let lost = false; // the stream dropped; it reconnects on its own
  let src: Stream | null = null; // null while the page is hidden
  let paused = false; // the page was hidden since the stream last opened
  const pull = async () => {
    busy = true;
    try {
      while (wanted > drawn) {
        const r = await load();
        const body = await r.text();
        if (!r.ok) throw new Error(`zu serve: ${body.trim() || r.status}`);
        drawn = Number(r.headers.get("Zu-Generation")) || wanted;
        if (body !== text) {
          show(parseView(body));
          text = body;
        }
      }
    } catch (e) {
      drawn = wanted;
      say(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  };
  const connect = () => {
    const s = open();
    s.addEventListener("view", (e) => {
      wanted = Number(e.data) || 0;
      if (!busy && wanted > drawn) void pull();
    });
    s.addEventListener("notice", (e) => say(String(e.data ?? "")));
    // zu serve sends its generation and notice on each connect. One that
    // restarted counts from 1 again, so after a drop the drawn generation
    // means nothing: the next one fetches, and its text decides whether to
    // draw.
    s.addEventListener("open", () => {
      if (lost) drawn = 0;
      lost = false;
      say("");
    });
    s.addEventListener("error", () => {
      if (s.readyState === CLOSED) {
        // zu serve answered, without a stream: it runs without a watch.
        if (lost) say("");
        lost = false;
        return;
      }
      lost = true;
      say(OFFLINE);
    });
    return s;
  };
  const visible = () => {
    if (doc.hidden) {
      src?.close();
      src = null;
      paused = true;
      return;
    }
    if (src) return;
    // What changed while hidden is unknown, and zu serve may have restarted
    // and counted from 1 again: fetch the latest View once.
    if (paused) drawn = 0;
    paused = false;
    src = connect();
  };
  if (!doc.hidden) src = connect();
  doc.addEventListener("visibilitychange", visible);
  return () => {
    doc.removeEventListener("visibilitychange", visible);
    src?.close();
  };
}
