package scan

import (
	"reflect"
	"testing"

	"zu/internal/ir"
)

func TestExtractDecls(t *testing.T) {
	src := `package p

import "fmt"

const C = 1

var V = func() int { return 1 }

type (
	Repo struct{ n int }
	reader interface{ Read() }
	List[T any] struct{ items []T }
	Alias = Repo
	ID int
	fn func()
)

func New() *Repo { return &Repo{} }

func (r Repo) Get() int { return r.n }

func (r *Repo) put() {}

func (l *List[T]) Len() int { return len(l.items) }

func (List[T]) Cap() int { return 0 }

func _() {}

func init() { fmt.Println() }
`
	f := extractOne(t, src)
	if f.Err != nil {
		t.Fatal(f.Err)
	}
	type d struct {
		Name, Recv string
		Kind       ir.NodeKind
		Exported   bool
		TypeKind   string
		Line       int
	}
	var got []d
	for _, x := range f.Decls {
		got = append(got, d{x.Name, x.Recv, x.Kind, x.Exported, x.TypeKind, x.Line})
	}
	want := []d{
		{"Repo", "", ir.KindType, true, ir.TypeStruct, 10},
		{"reader", "", ir.KindType, false, ir.TypeInterface, 11},
		{"List", "", ir.KindType, true, ir.TypeStruct, 12},
		{"Alias", "", ir.KindType, true, ir.TypeOther, 13},
		{"ID", "", ir.KindType, true, ir.TypeOther, 14},
		{"fn", "", ir.KindType, false, ir.TypeOther, 15},
		{"New", "", ir.KindFunction, true, "", 18},
		{"Get", "Repo", ir.KindFunction, true, "", 20},
		{"put", "Repo", ir.KindFunction, false, "", 22},
		{"Len", "List", ir.KindFunction, true, "", 24},
		{"Cap", "List", ir.KindFunction, true, "", 26},
		{"init", "", ir.KindFunction, false, "", 30},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("decls\n got %+v\nwant %+v", got, want)
	}
}
