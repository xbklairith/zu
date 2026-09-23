package ir

import (
	"bytes"
	"strings"
	"testing"
)

func TestSchemaVersion(t *testing.T) {
	if SchemaVersion != "1" {
		t.Fatalf("SchemaVersion = %q, want %q", SchemaVersion, "1")
	}
}

func TestEncodeEmptyIRUsesEmptyCollections(t *testing.T) {
	var buf bytes.Buffer
	if err := Encode(&buf, &IR{Grouping: "tree", PolicyHash: "sha256:x"}); err != nil {
		t.Fatal(err)
	}
	want := `{
  "schemaVersion": "1",
  "ref": {
    "commit": "",
    "dirty": false
  },
  "grouping": "tree",
  "policyHash": "sha256:x",
  "nodes": [],
  "edges": [],
  "unresolvedCalls": {},
  "unresolvedImports": {},
  "parseErrors": [],
  "unsupported": {}
}
`
	if got := buf.String(); got != want {
		t.Fatalf("Encode mismatch\n--- got\n%s--- want\n%s", got, want)
	}
}

func TestEncodeSortsEverything(t *testing.T) {
	no, yes := false, true
	doc := &IR{
		Nodes: []Node{
			{ID: "m/b", Kind: KindPackage, Module: "m", Locations: []Location{{"b/x.go", 1}}},
			{ID: "m/a.T", Kind: KindType, Parent: "m/a", Exported: &yes, TypeKind: "struct",
				Locations: []Location{{"a/z.go", 3}, {"a/y.go", 9}, {"a/y.go", 2}}},
			{ID: "m/a.f", Kind: KindFunction, Parent: "m/a", Exported: &no, Locations: []Location{{"a/y.go", 5}}},
		},
		Edges: []Edge{
			{From: "m/b", To: "m/a", Kind: EdgeImports, Locations: []Location{{"b/x.go", 3}}},
			{From: "m/a.f", To: "m/a.g", Kind: EdgeCalls, Locations: []Location{{"a/y.go", 7}, {"a/y.go", 6}}},
			{From: "m/a", To: "x.org/lib", Kind: EdgeImports, Locations: []Location{{"a/y.go", 3}}},
		},
		ParseErrors:     []ParseError{{Path: "z.go", Message: "z"}, {Path: "a.go", Message: "a"}},
		UnresolvedCalls: map[string]int{"m/b": 2, "m/a": 1},
	}
	var buf bytes.Buffer
	if err := Encode(&buf, doc); err != nil {
		t.Fatal(err)
	}
	out := buf.String()

	assertOrder(t, out, `"id": "m/a.T"`, `"id": "m/a.f"`, `"id": "m/b"`)
	assertOrder(t, out, `"from": "m/a",`, `"from": "m/a.f"`, `"from": "m/b"`)
	assertOrder(t, out, `"path": "a/y.go",
          "line": 2`, `"path": "a/y.go",
          "line": 9`, `"path": "a/z.go"`)
	assertOrder(t, out, `"line": 6`, `"line": 7`)
	assertOrder(t, out, `"path": "a.go"`, `"path": "z.go"`)
	assertOrder(t, out, `"m/a": 1`, `"m/b": 2`)
	if !strings.Contains(out, `"exported": false`) {
		t.Errorf("exported:false must be written, got\n%s", out)
	}
	if strings.Contains(out, `"parent": ""`) || strings.Contains(out, `"typeKind": ""`) {
		t.Errorf("empty optional fields must be omitted, got\n%s", out)
	}
	assertOrder(t, out, `"id"`, `"kind"`, `"parent"`, `"exported"`, `"typeKind"`, `"locations"`)
}

func TestEncodeIsStableAcrossInputOrder(t *testing.T) {
	mk := func(rev bool) *IR {
		n := []Node{
			{ID: "a", Kind: KindPackage, Locations: []Location{{"a.go", 1}}},
			{ID: "b", Kind: KindPackage, Locations: []Location{{"b.go", 1}}},
		}
		if rev {
			n[0], n[1] = n[1], n[0]
		}
		return &IR{Nodes: n}
	}
	var x, y bytes.Buffer
	if err := Encode(&x, mk(false)); err != nil {
		t.Fatal(err)
	}
	if err := Encode(&y, mk(true)); err != nil {
		t.Fatal(err)
	}
	if x.String() != y.String() {
		t.Fatal("encoding depends on input order")
	}
}

func assertOrder(t *testing.T, s string, parts ...string) {
	t.Helper()
	at := -1
	for _, p := range parts {
		i := strings.Index(s[at+1:], p)
		if i < 0 {
			t.Fatalf("%q not found after offset %d in\n%s", p, at, s)
		}
		at += 1 + i
	}
}

func TestNodeShapeFollowsHash(t *testing.T) {
	doc := &IR{Nodes: []Node{
		{ID: "m/a", Kind: KindPackage, Hash: "p", Locations: []Location{{"a/a.go", 1}}},
		{ID: "m/a.f", Kind: KindFunction, Parent: "m/a", Hash: "h", Shape: "s", Locations: []Location{{"a/a.go", 3}}},
	}}
	var buf bytes.Buffer
	if err := Encode(&buf, doc); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	if !strings.Contains(out, "\"hash\": \"h\",\n      \"shape\": \"s\",\n      \"locations\"") {
		t.Errorf("shape must follow hash and precede locations, got\n%s", out)
	}
	if strings.Count(out, `"shape"`) != 1 {
		t.Errorf("a node without a shape must omit the key, got\n%s", out)
	}
}
