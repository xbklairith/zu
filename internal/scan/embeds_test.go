package scan

import (
	"reflect"
	"testing"

	"zu/internal/ir"
)

func TestResolveEmbeds(t *testing.T) {
	doc := scanTree(t, map[string]string{
		"go.mod":     "module example.com/m\n\nrequire github.com/x/lib v1.0.0\n",
		"store/s.go": "package store\n\ntype Repo struct{}\n\ntype Reader interface{ Read() }\n",
		"app/app.go": `package app

import (
	"io"
	"sync"
	"example.com/m/store"
	"github.com/x/lib"
)

type Base struct{}

type Service struct {
	Base
	*store.Repo
	lib.Client
	sync.Mutex
	store.Missing
	error
}

type RW interface {
	store.Reader
	io.Writer
	comparable
}
`,
	})
	want := []edgeKey{
		{"example.com/m/app.RW", "example.com/m/store.Reader", ir.EdgeEmbeds},
		{"example.com/m/app.Service", "example.com/m/app.Base", ir.EdgeEmbeds},
		{"example.com/m/app.Service", "example.com/m/store.Repo", ir.EdgeEmbeds},
		{"example.com/m/app.Service", "github.com/x/lib", ir.EdgeEmbeds},
	}
	if got := edgesOf(doc, ir.EdgeEmbeds); !reflect.DeepEqual(got, want) {
		t.Fatalf("embeds\n got %+v\nwant %+v", got, want)
	}
}
