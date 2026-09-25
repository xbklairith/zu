import { describe, expect, it } from "vitest";
import golden from "../../internal/export/testdata/shop.view.golden.json";
import { fetchView, parseView, readEmbedded, type View } from "./data";

describe("parseView", () => {
  it("refuses a schema it does not know", () => {
    expect(() => parseView('{"schema":"2"}')).toThrow(/schema 2/);
  });
  it("accepts schema 1", () => {
    expect(parseView('{"schema":"1","nodes":[],"edges":[]}').schema).toBe("1");
  });
  it("parses the Go golden", () => {
    const v = parseView(JSON.stringify(golden));
    expect(v.nodes.some((n) => n.id === "example.com/shop/internal/store.Repo")).toBe(true);
  });
});

// A page whose zu-data element holds text.
const page = (text: string) => ({ getElementById: () => ({ textContent: text }) }) as unknown as Document;

describe("readEmbedded", () => {
  it("is null for the bare template", () => {
    expect(readEmbedded(page("{}"))).toBeNull();
  });
  it("returns the View zu scan -html inlined", () => {
    expect((readEmbedded(page(JSON.stringify(golden))) as View).schema).toBe("1");
  });
  it("says the View is live when zu serve sent the page (10)", () => {
    expect(readEmbedded(page('{"live":true}'))).toBe("live");
  });
});

describe("fetchView", () => {
  const answer = (status: number, body: string, gen?: string) => async (url: RequestInfo | URL, init?: RequestInit) => {
    expect([url, init?.cache]).toEqual(["view.json", "no-store"]);
    return new Response(body, { status, headers: gen ? { "Zu-Generation": gen } : {} });
  };
  it("reads the View zu serve sends, and its text (13)", async () => {
    const { view, text, gen } = await fetchView(answer(200, JSON.stringify(golden)));
    expect([view.nodes.length, text, gen]).toEqual([golden.nodes.length, JSON.stringify(golden), 0]);
  });
  it("reads the generation zu serve's watch had drawn when it sent the View (13)", async () => {
    expect((await fetchView(answer(200, JSON.stringify(golden), "7"))).gen).toBe(7);
  });
  it("says why zu serve could not build it", async () => {
    await expect(fetchView(answer(500, "zu.policy.yaml: line 3: bad level\n"))).rejects.toThrow(
      "zu serve: zu.policy.yaml: line 3: bad level",
    );
  });
  it("refuses a schema it does not know", async () => {
    await expect(fetchView(answer(200, '{"schema":"2"}'))).rejects.toThrow(/schema 2/);
  });
});
