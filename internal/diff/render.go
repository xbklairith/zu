package diff

import (
	"fmt"
	"io"
	"strings"
)

// markdownBudget is the most bytes WriteMarkdown writes: GitHub rejects
// comments longer than 65,536 characters.
const markdownBudget = 65536

// mermaidLimit is the most packages the Mermaid diagram draws.
const mermaidLimit = 30

// WriteText writes s as plain text for a terminal.
func WriteText(w io.Writer, s *Summary) error {
	var b strings.Builder
	b.WriteString("zu · structural change\n")
	b.WriteString(refLine(s) + "\n")
	if s.Violations != nil {
		b.WriteString("\n" + violationsBlock(s.Violations, false, len(s.Violations.New)) + "\n")
	}
	if !s.Changed {
		b.WriteString("no structural change\n")
	} else {
		b.WriteString(countsLine(s) + "\n")
		if len(s.Packages) > 0 {
			b.WriteString("\nPackages (bottom-up):\n")
			for _, r := range s.Packages {
				fmt.Fprintf(&b, "  %s %s  +%d ~%d −%d  hops %d\n", mark(r.Status), r.ID, r.Added, r.Modified, r.Removed, r.Hops)
			}
		}
		if len(s.Imports) > 0 {
			b.WriteString("\nDependencies:\n")
			for _, e := range s.Imports {
				b.WriteString("  " + importLine(e, false) + "\n")
			}
		}
		if len(s.Moves) > 0 {
			b.WriteString("\nMoves:\n")
			for _, m := range s.Moves {
				fmt.Fprintf(&b, "  %s → %s (%s)\n", m.From, m.To, m.Kind)
			}
		}
		b.WriteString("\n" + affectedLine(s) + "\n")
		b.WriteString(edgeCountsLine(s) + "\n")
	}
	b.WriteString(parseErrorsLine(s) + "\n")
	b.WriteString(NotCompared + "\n")
	_, err := io.WriteString(w, b.String())
	return err
}

// WriteMarkdown writes s as Markdown for an MR comment, within 65,536 bytes:
// the package table is cut first, then the lists, each ending with
// "…and N more".
func WriteMarkdown(w io.Writer, s *Summary) error {
	footer := "\n" + NotCompared + "\n"
	budget := markdownBudget - len(footer)
	all := max(len(s.Imports), len(s.Moves), newCount(s))
	body := markdownBody(s, len(s.Packages), all)
	if len(body) > budget {
		// Largest table that fits with every list whole, else no table and
		// the longest lists that fit.
		t := largest(len(s.Packages), func(n int) bool { return len(markdownBody(s, n, all)) <= budget })
		if t >= 0 {
			body = markdownBody(s, t, all)
		} else {
			l := max(largest(all, func(n int) bool { return len(markdownBody(s, 0, n)) <= budget }), 0)
			body = markdownBody(s, 0, l)
		}
	}
	_, err := io.WriteString(w, body+footer)
	return err
}

// largest is the largest n in [0, hi] with fits(n), or -1 if none; fits must
// be monotone (true up to some n, false after).
func largest(hi int, fits func(int) bool) int {
	lo, best := 0, -1
	for lo <= hi {
		mid := (lo + hi) / 2
		if fits(mid) {
			best, lo = mid, mid+1
		} else {
			hi = mid - 1
		}
	}
	return best
}

// markdownBody renders everything but the footer, with at most rows table
// rows and items entries per list.
func markdownBody(s *Summary, rows, items int) string {
	var b strings.Builder
	b.WriteString("### zu · structural change\n\n")
	b.WriteString(refLine(s) + "\n\n")
	if s.Violations != nil {
		b.WriteString(violationsBlock(s.Violations, true, items) + "\n")
	}
	if !s.Changed {
		b.WriteString("no structural change\n\n")
		b.WriteString(parseErrorsLine(s) + "\n")
		return b.String()
	}
	b.WriteString(countsLine(s) + "\n\n")
	if len(s.Packages) > 0 {
		b.WriteString("| Package | Change | + ~ − | Hops |\n|---|---|---|---|\n")
		for _, r := range s.Packages[:min(rows, len(s.Packages))] {
			fmt.Fprintf(&b, "| `%s` | %s | +%d ~%d −%d | %d |\n", cell(r.ID), r.Status, r.Added, r.Modified, r.Removed, r.Hops)
		}
		more(&b, len(s.Packages)-rows)
		b.WriteString("\n")
	}
	if len(s.Imports) > 0 {
		b.WriteString("**Dependencies**\n\n")
		for _, e := range s.Imports[:min(items, len(s.Imports))] {
			b.WriteString("- " + importLine(e, true) + "\n")
		}
		more(&b, len(s.Imports)-items)
		b.WriteString("\n")
	}
	if len(s.Moves) > 0 {
		b.WriteString("**Moves**\n\n")
		for _, m := range s.Moves[:min(items, len(s.Moves))] {
			fmt.Fprintf(&b, "- `%s` → `%s` (%s)\n", m.From, m.To, m.Kind)
		}
		more(&b, len(s.Moves)-items)
		b.WriteString("\n")
	}
	b.WriteString(affectedLine(s) + "\n\n")
	b.WriteString(edgeCountsLine(s) + "\n\n")
	b.WriteString(mermaid(s) + "\n")
	b.WriteString(parseErrorsLine(s) + "\n")
	return b.String()
}

func more(b *strings.Builder, n int) {
	if n > 0 {
		fmt.Fprintf(b, "…and %d more\n", n)
	}
}

// mermaid draws the changed packages and their direct importers (dimmed),
// with head's imports between them. Node ids are generated so no package id
// can break the syntax; labels are quoted.
func mermaid(s *Summary) string {
	var ids []string
	seen := map[string]bool{}
	add := func(id string) {
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	for _, r := range s.Packages {
		add(r.ID)
	}
	changed := len(ids)
	for _, h := range s.Affected {
		if h.Hops == 1 {
			add(h.Package)
		}
	}
	if len(ids) > mermaidLimit {
		return fmt.Sprintf("_Diagram omitted: %d packages (limit %d)._\n", len(ids), mermaidLimit)
	}
	node := map[string]string{}
	var b strings.Builder
	b.WriteString("```mermaid\nflowchart BT\n")
	for i, id := range ids {
		node[id] = fmt.Sprintf("n%d", i+1)
		fmt.Fprintf(&b, "  %s[\"%s\"]\n", node[id], strings.ReplaceAll(id, `"`, "#quot;"))
	}
	for _, e := range s.imports {
		fmt.Fprintf(&b, "  %s --> %s\n", node[e.From], node[e.To])
	}
	b.WriteString("  classDef dim opacity:0.5\n")
	for _, id := range ids[changed:] {
		fmt.Fprintf(&b, "  class %s dim\n", node[id])
	}
	b.WriteString("```\n")
	return b.String()
}

func refLine(s *Summary) string {
	head := short(s.Head.Commit)
	if s.Head.Dirty {
		head += " (worktree)"
	}
	return fmt.Sprintf("base %s (merge-base) → head %s", short(s.Base.Commit), head)
}

func short(commit string) string {
	if len(commit) > 12 {
		return commit[:12]
	}
	if commit == "" {
		return "worktree"
	}
	return commit
}

func countsLine(s *Summary) string {
	var a, m, r int
	for _, p := range s.Packages {
		a, m, r = a+p.Added, m+p.Modified, r+p.Removed
	}
	return fmt.Sprintf("%s changed: +%d ~%d −%d declarations, %s, %s",
		plural(len(s.Packages), "package"), a, m, r,
		plural(len(s.Imports), "dependency change"), plural(len(s.Moves), "move"))
}

func plural(n int, noun string) string {
	if n == 1 {
		return "1 " + noun
	}
	return fmt.Sprintf("%d %ss", n, noun)
}

func importLine(e EdgeChange, md bool) string {
	q := func(id string) string {
		if md {
			return "`" + id + "`"
		}
		return id
	}
	switch e.Status {
	case Reversed:
		return fmt.Sprintf("⇄ %s → %s (reversed)", q(e.From), q(e.To))
	case Removed:
		return fmt.Sprintf("− %s → %s", q(e.From), q(e.To))
	}
	return fmt.Sprintf("+ %s → %s", q(e.From), q(e.To))
}

// affectedLine is "Affected: N packages (c changed, k at 1 hop, …)".
func affectedLine(s *Summary) string {
	var parts []string
	for i := 0; i < len(s.Affected); {
		h := s.Affected[i].Hops
		j := i
		for j < len(s.Affected) && s.Affected[j].Hops == h {
			j++
		}
		switch h {
		case 0:
			parts = append(parts, fmt.Sprintf("%d changed", j-i))
		case 1:
			parts = append(parts, fmt.Sprintf("%d at 1 hop", j-i))
		default:
			parts = append(parts, fmt.Sprintf("%d at %d hops", j-i, h))
		}
		i = j
	}
	line := "Affected: " + plural(len(s.Affected), "package")
	if len(parts) > 0 {
		line += " (" + strings.Join(parts, ", ") + ")"
	}
	return line
}

func edgeCountsLine(s *Summary) string {
	c, e := s.EdgeCounts["calls"], s.EdgeCounts["embeds"]
	return fmt.Sprintf("Calls: +%d −%d · Embeds: +%d −%d", c.Added, c.Removed, e.Added, e.Removed)
}

func parseErrorsLine(s *Summary) string {
	return fmt.Sprintf("Parse errors: base %d, head %d", len(s.ParseErrors.Base), len(s.ParseErrors.Head))
}

func mark(st Status) string {
	switch st {
	case Added:
		return "+"
	case Removed:
		return "−"
	}
	return "~"
}

// cell escapes a table cell.
func cell(s string) string { return strings.ReplaceAll(s, "|", `\|`) }
