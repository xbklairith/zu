package diff

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"zu/internal/ir"
)

func render(t *testing.T, s *Summary, md bool) string {
	t.Helper()
	var buf bytes.Buffer
	var err error
	if md {
		err = WriteMarkdown(&buf, s)
	} else {
		err = WriteText(&buf, s)
	}
	if err != nil {
		t.Fatal(err)
	}
	return buf.String()
}

func TestRenderGolden(t *testing.T) {
	base, head := shopPair(t)
	s := Summarize(base, head)
	golden(t, "shop.summary.txt", []byte(render(t, s, false)))
	golden(t, "shop.summary.md", []byte(render(t, s, true)))
}

func TestRenderNoChange(t *testing.T) {
	base := scanDir(t, shopCopy(t), strings.Repeat("c", 40))
	s := Summarize(base, base)
	for _, md := range []bool{false, true} {
		out := render(t, s, md)
		if !strings.Contains(out, "no structural change") || !strings.HasSuffix(out, NotCompared+"\n") {
			t.Errorf("md=%v:\n%s", md, out)
		}
	}
}

func TestRenderMermaid(t *testing.T) {
	base := doc([]string{`p m/a"x 1`, "p m/b 1", "p m/c 1", "p m/d 1"}, `i m/b m/a"x`, "i m/c m/b", "i m/d m/c")
	head := doc([]string{`p m/a"x 2`, "p m/b 1", "p m/c 1", "p m/d 1"}, `i m/b m/a"x`, "i m/c m/b", "i m/d m/c")
	out := render(t, Summarize(base, head), true)
	for _, want := range []string{"```mermaid", `n1["m/a#quot;x"]`, `n2["m/b"]`, "n2 --> n1", "classDef dim", "class n2 dim"} {
		if !strings.Contains(out, want) {
			t.Errorf("Mermaid lacks %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `"m/c"`) {
		t.Errorf("Mermaid must stop at one hop of importers:\n%s", out)
	}
}

func manyPackages(n int) *Summary {
	s := &Summary{SummaryVersion: SummaryVersion, Changed: true, NotCompared: NotCompared,
		EdgeCounts: map[string]Counts{"calls": {}, "embeds": {}}}
	for i := range n {
		id := fmt.Sprintf("example.com/very/long/module/path/for/package/number/%05d", i)
		s.Packages = append(s.Packages, PackageRow{ID: id, Status: Modified, Modified: 1})
		s.Imports = append(s.Imports, EdgeChange{From: id, To: "example.com/x", Kind: ir.EdgeImports, Status: Added})
		s.Affected = append(s.Affected, Hop{Package: id})
	}
	return s
}

func TestRenderMermaidOmittedAbove30(t *testing.T) {
	out := render(t, manyPackages(31), true)
	if strings.Contains(out, "```mermaid") || !strings.Contains(out, "_Diagram omitted: 31 packages (limit 30)._") {
		t.Fatalf("want the diagram omitted:\n%s", out)
	}
}

func TestRenderMarkdownBudget(t *testing.T) {
	out := render(t, manyPackages(5000), true)
	if len(out) > 65536 {
		t.Fatalf("Markdown is %d bytes, want at most 65536", len(out))
	}
	if !strings.Contains(out, "…and ") || !strings.HasSuffix(out, NotCompared+"\n") {
		t.Fatalf("want truncated lists and the footer; tail:\n%s", out[len(out)-500:])
	}
	if !strings.Contains(out, "Affected: 5000 packages") {
		t.Error("the Affected count must survive truncation")
	}
}

func TestRenderMarkdownEscapesPipes(t *testing.T) {
	base := doc([]string{"p m/a|b 1"})
	head := doc([]string{"p m/a|b 2"})
	out := render(t, Summarize(base, head), true)
	if !strings.Contains(out, `m/a\|b`) {
		t.Fatalf("pipe not escaped:\n%s", out)
	}
}
