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

// zu serve's page (10) carries no View: it fetches view.json, which its CSP
// must allow, from the server that served it and nowhere else.
func TestLivePageFetchesItsViewFromItsOrigin(t *testing.T) {
	page, err := LivePage(template(t))
	if err != nil {
		t.Fatal(err)
	}
	s := string(page)
	for _, want := range []string{
		`<script id="zu-data" type="application/json">{"live":true}</script>`,
		`http-equiv="Content-Security-Policy" content="connect-src 'self'; default-src &#39;none&#39;; worker-src blob:"`,
		// No request for /favicon.ico, which the CSP would refuse and log (review, 2026-09-25).
		`<link rel="icon" href="data:,"></head>`,
	} {
		if !strings.Contains(s, want) {
			t.Errorf("live page lacks %s:\n%s", want, s)
		}
	}
}

func TestLivePageNeedsOneMarkerAndOneCSP(t *testing.T) {
	good := string(template(t))
	csp := `<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; worker-src blob:">`
	for name, tmpl := range map[string]string{
		"no marker": strings.Replace(good, marker, "", 1),
		"no CSP":    strings.Replace(good, csp, "", 1),
		"two CSPs":  strings.Replace(good, csp, csp+csp, 1),
	} {
		if _, err := LivePage([]byte(tmpl)); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

// Marshal writes the View as Render inlines it.
func TestMarshalIsWhatRenderInlines(t *testing.T) {
	v := newView("project", shopIR(t))
	v.Sources["x.go"] = "a < b"
	data, err := Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var page bytes.Buffer
	if err := Render(&page, template(t), v); err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(page.Bytes(), data) || !bytes.Contains(data, []byte(`a \u003c b`)) {
		t.Errorf("Marshal = %s", data)
	}
}
