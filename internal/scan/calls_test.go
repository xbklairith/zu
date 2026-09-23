package scan

import (
	"reflect"
	"testing"

	"zu/internal/ir"
)

func TestResolveCalls(t *testing.T) {
	doc := scanTree(t, map[string]string{
		"go.mod": "module example.com/m\n\nrequire github.com/mattn/go-sqlite3 v1.0.0\n",
		"store/s.go": `package store

type Repo struct{ hook func() }

func Open() *Repo { return nil }

func (r *Repo) Get() { r.load(); r.hook(); r.Missing() }

func (r *Repo) load() {}
`,
		"store/vars.go": "package store\n\nvar Default = Open()\n",
		"app/app.go": `package app

import (
	"fmt"
	"example.com/m/store"
	sq "github.com/mattn/go-sqlite3"
	"github.com/mattn/go-sqlite3/driver"
	. "example.com/m/dot"
)

func Run() {
	store.Open()        // edge
	store.Open()        // same edge, second location
	_ = store.Repo(x)   // conversion: dropped
	store.Default.Get() // selector chain: unresolved
	store.Nope()        // unknown member: unresolved
	fmt.Println()       // stdlib: dropped
	sq.Open()           // external alias: dropped
	driver.Do()         // external guessed name: dropped
	helper()            // edge
	local(1)            // conversion via other-file type: dropped
	len("x")            // builtin: dropped
	Dotted()            // dot import: unresolved
	pkgVar.Do()         // other-file package var: unresolved
}
`,
		"app/helper.go": "package app\n\ntype local int\n\nfunc helper() {}\n\nvar pkgVar interface{ Do() }\n",
		"dot/d.go":      "package dot\n\nfunc Dotted() {}\n",
	})
	want := []edgeKey{
		{"example.com/m/app.Run", "example.com/m/app.helper", ir.EdgeCalls},
		{"example.com/m/app.Run", "example.com/m/store.Open", ir.EdgeCalls},
		{"example.com/m/store.Repo.Get", "example.com/m/store.Repo.load", ir.EdgeCalls},
	}
	if got := edgesOf(doc, ir.EdgeCalls); !reflect.DeepEqual(got, want) {
		t.Fatalf("calls\n got %+v\nwant %+v", got, want)
	}
	wantU := map[string]int{"example.com/m/app": 4, "example.com/m/store": 2}
	if !reflect.DeepEqual(doc.UnresolvedCalls, wantU) {
		t.Fatalf("UnresolvedCalls = %v, want %v", doc.UnresolvedCalls, wantU)
	}
	for _, e := range doc.Edges {
		if e.To == "example.com/m/store.Open" && len(e.Locations) != 2 {
			t.Fatalf("repeated call sites must merge into one edge: %+v", e.Locations)
		}
	}
}

func TestGuessName(t *testing.T) {
	cases := map[string]string{
		"github.com/mattn/go-sqlite3": "sqlite3",
		"gopkg.in/yaml.v3":            "yaml",
		"github.com/x/y/v2":           "y",
		"github.com/golang/protobuf":  "protobuf",
		"github.com/x/client-go":      "client",
	}
	for in, want := range cases {
		if got := guessName(in); got != want {
			t.Errorf("guessName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPredeclaredConversionsAreNotCalls(t *testing.T) {
	doc := scanTree(t, map[string]string{
		"go.mod": "module example.com/m\n",
		"p/p.go": "package p\n\nfunc F(b []byte) { _ = int(1); _ = string(b); _ = any(b); _ = float64(2); _ = rune(3); _ = uintptr(0) }\n",
	})
	if len(doc.UnresolvedCalls) != 0 {
		t.Fatalf("UnresolvedCalls = %v, want none", doc.UnresolvedCalls)
	}
}
