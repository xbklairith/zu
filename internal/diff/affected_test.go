package diff

import (
	"reflect"
	"testing"
)

func TestAffected(t *testing.T) {
	head := doc([]string{"p api h", "p orders h", "p money h", "p billing h", "p lone h", "x ext.com/x"},
		"i api orders", "i orders money", "i billing money", "i money ext.com/x", "i lone ext.com/x")
	got := Affected(head, []string{"money"})
	want := []Hop{{"money", 0}, {"billing", 1}, {"orders", 1}, {"api", 2}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Affected = %+v\nwant       %+v", got, want)
	}
}

func TestAffectedCycleAndShortestHop(t *testing.T) {
	head := doc([]string{"p a h", "p b h", "p c h"}, "i a b", "i b a", "i c a", "i c b")
	got := Affected(head, []string{"b"})
	want := []Hop{{"b", 0}, {"a", 1}, {"c", 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Affected = %+v, want %+v", got, want)
	}
}

func TestAffectedAddedPackageAndExternals(t *testing.T) {
	head := doc([]string{"p new h", "p user h", "x ext.com/x"}, "i user new", "i new ext.com/x")
	got := Affected(head, []string{"new", "ext.com/x"})
	want := []Hop{{"new", 0}, {"user", 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Affected = %+v, want %+v (externals never appear)", got, want)
	}
}

func TestAffectedNothingChanged(t *testing.T) {
	head := doc([]string{"p a h"})
	if got := Affected(head, nil); len(got) != 0 {
		t.Fatalf("Affected = %+v, want empty", got)
	}
}
