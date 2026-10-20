import { describe, expect, it } from "vitest";
import { follow, OFFLINE, type Stream, type Visibility } from "./live";

// A Stream the test drives: what /events would send.
function stream() {
  const on: Record<string, (e: { data?: unknown }) => void> = {};
  const s = {
    readyState: 1,
    closed: false,
    addEventListener: (type: string, fn: (e: { data?: unknown }) => void) => {
      on[type] = fn;
    },
    close: () => {
      s.closed = true;
    },
    send: (type: string, data?: string) => on[type]?.({ data }),
  };
  return s satisfies Stream;
}

const view = (tag: string) => JSON.stringify({ schema: "1", nodes: [], edges: [], tool: tag });

// latest answers view.json?latest from a list of [generation, body].
function latest(answers: [number, string][]) {
  const asked: number[] = [];
  const load = async () => {
    const [gen, body] = answers[Math.min(asked.length, answers.length - 1)];
    asked.push(gen);
    return new Response(body, { status: gen < 0 ? 500 : 200, headers: gen > 0 ? { "Zu-Generation": String(gen) } : {} });
  };
  return { load, asked };
}

// page is a document the test hides and shows.
function page() {
  const on: (() => void)[] = [];
  const d = {
    hidden: false,
    addEventListener: (_: "visibilitychange", fn: () => void) => void on.push(fn),
    removeEventListener: (_: "visibilitychange", fn: () => void) => void on.splice(on.indexOf(fn), 1),
    set: (hidden: boolean) => {
      d.hidden = hidden;
      for (const fn of [...on]) fn();
    },
    listeners: () => on.length,
  };
  return d satisfies Visibility;
}

const tick = () => new Promise((ok) => setTimeout(ok, 5));

function run(answers: [number, string][], first = { text: view("a"), gen: 0 }) {
  const streams: ReturnType<typeof stream>[] = [];
  const open = () => {
    streams.push(stream());
    return streams[streams.length - 1];
  };
  const l = latest(answers);
  const shown: string[] = [];
  const said: string[] = [];
  const reads = { n: 0 };
  const doc = page();
  const stop = follow(open, l.load, first, (v) => shown.push(v.tool), (t) => void said.push(t), doc, () => void reads.n++);
  return { s: streams[0], streams, doc, l, shown, said, reads, stop };
}

describe("follow", () => {
  it("draws a newer View", async () => {
    const r = run([[2, view("b")]]);
    r.s.send("view", "2");
    await tick();
    expect(r.shown).toEqual(["b"]);
  });
  it("does not draw again what it drew", async () => {
    const r = run([[1, view("a")]]);
    r.s.send("view", "1");
    await tick();
    expect([r.l.asked, r.shown]).toEqual([[1], []]);
  });
  it("does not fetch the generation the page loaded with", async () => {
    const r = run([[3, view("b")]], { text: view("a"), gen: 3 });
    r.s.send("open");
    r.s.send("view", "3");
    await tick();
    expect(r.l.asked).toEqual([]);
  });
  it("fetches once per generation", async () => {
    const r = run([[2, view("b")]]);
    r.s.send("view", "2");
    await tick();
    r.s.send("view", "2");
    await tick();
    expect(r.l.asked).toEqual([2]);
  });
  it("coalesces generations that arrive while it fetches", async () => {
    const r = run([[2, view("b")], [4, view("d")]]);
    r.s.send("view", "2");
    r.s.send("view", "3");
    r.s.send("view", "4");
    await tick();
    await tick();
    await tick();
    expect([r.l.asked, r.shown]).toEqual([[2, 4], ["b", "d"]]);
  });
  it("shows the notice zu serve sends, and clears it", () => {
    const r = run([[1, view("a")]]);
    r.s.send("notice", "a.go:3:1: expected declaration");
    r.s.send("notice", "");
    expect(r.said).toEqual(["a.go:3:1: expected declaration", ""]);
  });
  it("says so while zu serve is not answering, and forgets the generation it drew", async () => {
    const r = run([[2, view("b")], [1, view("c")]]);
    r.s.send("view", "2");
    await tick();
    r.s.readyState = 0; // reconnecting
    r.s.send("error");
    r.s.readyState = 1;
    r.s.send("open");
    r.s.send("view", "1"); // a restarted zu serve counts from 1 again
    await tick();
    expect([r.said, r.shown]).toEqual([[OFFLINE, ""], ["b", "c"]]);
  });
  it("is silent when zu serve does not watch", () => {
    const r = run([]);
    r.s.readyState = 2; // /events answered 404: EventSource gives up
    r.s.send("error");
    expect(r.said).toEqual([]);
  });
  it("clears what it said when zu serve comes back without a watch", () => {
    const r = run([]);
    r.s.readyState = 0;
    r.s.send("error");
    r.s.readyState = 2; // restarted with -poll 0: /events answers 404
    r.s.send("error");
    expect(r.said).toEqual([OFFLINE, ""]);
  });
  it("keeps the drawing when the View cannot be read", async () => {
    const r = run([[-1, "boom"]]);
    r.s.send("view", "2");
    await tick();
    await tick();
    expect([r.shown, r.said]).toEqual([[], ["zu serve: boom"]]);
  });
  it("closes the stream while the page is hidden, and fetches the latest View once shown", async () => {
    const r = run([[3, view("b")]], { text: view("a"), gen: 3 });
    r.s.send("view", "3");
    await tick();
    r.doc.set(true);
    expect([r.s.closed, r.streams.length]).toEqual([true, 1]);
    r.doc.set(false);
    expect(r.streams.length).toBe(2);
    r.streams[1].send("open");
    r.streams[1].send("view", "3"); // the generation it drew, or a restarted zu serve's
    await tick();
    expect([r.l.asked, r.shown]).toEqual([[3], ["b"]]);
  });
  // 19: a save can change a file the page shows and not the View.
  it("reads the files again for each rescan that publishes no View", () => {
    const r = run([]);
    r.s.send("open");
    r.s.send("source", "4"); // the page load read them: as new as this
    r.s.send("source", "5");
    r.s.send("source", "5");
    r.s.send("source", "6");
    expect(r.reads.n).toBe(2);
  });
  // A page load can draw a View the watch has not published yet. A save the
  // View does not show, before the watch's next poll, then publishes that
  // View, and no count moves.
  it("reads the files again for a newer generation whose View is the one drawn", async () => {
    const r = run([[2, view("a")]]);
    r.s.send("view", "2");
    await tick();
    expect([r.l.asked, r.shown, r.reads.n]).toEqual([[2], [], 1]);
  });
  it("reads the files again once after the stream dropped, and once after the page was hidden", () => {
    const r = run([]);
    r.s.send("source", "2");
    r.s.readyState = 0;
    r.s.send("error");
    r.s.readyState = 1;
    r.s.send("open");
    r.s.send("source", "2"); // the count it read at, or a restarted zu serve's
    r.s.send("source", "2");
    r.doc.set(true);
    r.doc.set(false);
    r.streams[1].send("open");
    r.streams[1].send("source", "2");
    expect(r.reads.n).toBe(2);
  });
  it("opens no second stream for a page shown twice", () => {
    const r = run([]);
    r.doc.set(false);
    expect(r.streams.length).toBe(1);
  });
  it("stops", () => {
    const r = run([]);
    r.stop();
    r.doc.set(true);
    r.doc.set(false);
    expect([r.s.closed, r.streams.length, r.doc.listeners()]).toEqual([true, 1, 0]);
  });
});
