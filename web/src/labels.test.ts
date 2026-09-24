import { describe, expect, it } from "vitest";
import { shorten } from "./labels";

describe("shorten", () => {
  it("drops the whole segments every sibling shares", () => {
    expect(shorten(["k8s.io/api", "k8s.io/apimachinery", "k8s.io/kubernetes/hack/tools"]))
      .toEqual(["api", "apimachinery", "kubernetes/hack/tools"]);
    expect(shorten(["github.com/a/x/p", "github.com/a/x/q"])).toEqual(["p", "q"]);
  });
  it("never cuts inside a segment", () => {
    expect(shorten(["k8s.io/api", "k8s.io2/api"])).toEqual(["k8s.io/api", "k8s.io2/api"]);
  });
  it("never empties a label: one that is all prefix keeps its last segment", () => {
    expect(shorten(["k8s.io/kubernetes", "k8s.io/kubernetes/hack"])).toEqual(["kubernetes", "kubernetes/hack"]);
    expect(shorten(["a", "a/b"])).toEqual(["a", "a/b"]);
  });
  it("keeps a label alone, and nothing, as they are", () => {
    expect(shorten(["k8s.io/api"])).toEqual(["k8s.io/api"]);
    expect(shorten([])).toEqual([]);
  });
});
