package export

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func template(t *testing.T) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/template.html")
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestRenderIsDeterministic(t *testing.T) {
	doc := shopIR(t)
	p, _ := ParsePattern("./...", RootModule(doc))
	var a, b bytes.Buffer
	for _, buf := range []*bytes.Buffer{&a, &b} {
		v, err := Project(shopIR(t), []Pattern{p}, fakeRead(map[string]bool{}))
		if err != nil {
			t.Fatal(err)
		}
		if err := Render(buf, template(t), v); err != nil {
			t.Fatal(err)
		}
	}
	if !bytes.Equal(a.Bytes(), b.Bytes()) {
		t.Error("two renders of the same IR differ")
	}
}

func TestRenderCannotBreakOutOfTheDataElement(t *testing.T) {
	v := newView("project", shopIR(t))
	v.Sources["x.go"] = "s := \"</script><script>alert(1)</script><!--\"\u2028"
	var out bytes.Buffer
	if err := Render(&out, template(t), v); err != nil {
		t.Fatal(err)
	}
	s := out.String()
	if strings.Count(s, "</script>") != 1 || strings.Contains(s, "<!--") || strings.Contains(s, "\u2028") {
		t.Errorf("source text escaped the data element:\n%s", s)
	}
}

func TestRenderNeedsExactlyOneMarker(t *testing.T) {
	v := newView("project", shopIR(t))
	for _, tmpl := range []string{"<html></html>", string(template(t)) + string(template(t))} {
		if err := Render(&bytes.Buffer{}, []byte(tmpl), v); err == nil {
			t.Errorf("accepted template %q", tmpl)
		}
	}
}
