package policy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"zu/internal/ir"
)

// Suggest proposes Levels that hold for doc as it is (ADR 0008: policy init
// is a Levels suggestion, not a component map). The candidates are the
// module roots when there are several modules; otherwise the children of
// the first box under the root that has more than one. Each candidate's
// rank is the length of the longest import chain below it, so every import
// runs from an outer level to an inner one or stays within a level;
// candidates on a cycle share a level.
func Suggest(doc *ir.IR) []Level {
	module := map[string]string{}
	for _, n := range doc.Nodes {
		if n.Kind == ir.KindPackage {
			module[n.ID] = n.Module
		}
	}
	candidates := candidateBoxes(module)
	owner := func(pkg string) string { // the longest candidate pkg is under
		best := ""
		for _, c := range candidates {
			if under(pkg, c) && len(c) > len(best) {
				best = c
			}
		}
		return best
	}
	arcs := map[string][]string{}
	for _, c := range candidates {
		arcs[c] = nil
	}
	for _, e := range doc.Edges {
		if e.Kind != ir.EdgeImports || module[e.From] == "" || module[e.To] == "" {
			continue
		}
		if a, b := owner(e.From), owner(e.To); a != "" && b != "" && a != b {
			arcs[a] = append(arcs[a], b)
		}
	}
	comp := components(arcs)
	rank := map[int]int{}
	var depth func(c int) int
	depth = func(c int) int {
		if r, ok := rank[c]; ok {
			return r
		}
		rank[c] = 0
		for v, heads := range arcs {
			if comp[v] != c {
				continue
			}
			for _, w := range heads {
				if comp[w] != c {
					rank[c] = max(rank[c], depth(comp[w])+1)
				}
			}
		}
		return rank[c]
	}
	var levels []Level
	for _, c := range candidates {
		r := depth(comp[c])
		for len(levels) <= r {
			levels = append(levels, nil)
		}
		levels[r] = append(levels[r], c)
	}
	return slices.DeleteFunc(levels, func(l Level) bool { return len(l) == 0 })
}

// candidateBoxes lists, sorted, the boxes Suggest ranks.
func candidateBoxes(module map[string]string) []string {
	mods := map[string]bool{}
	for _, m := range module {
		mods[m] = true
	}
	if len(mods) > 1 {
		out := make([]string, 0, len(mods))
		for m := range mods {
			out = append(out, m)
		}
		slices.Sort(out)
		return out
	}
	var root string
	for m := range mods {
		root = m
	}
	for {
		kids := children(root, module)
		if len(kids) != 1 || module[root] != "" {
			return kids
		}
		root = kids[0]
	}
}

// children lists, sorted, the boxes one segment below box.
func children(box string, module map[string]string) []string {
	seen := map[string]bool{}
	for pkg := range module {
		if pkg == box || !under(pkg, box) {
			continue
		}
		rest := strings.TrimPrefix(pkg, box+"/")
		seg, _, _ := strings.Cut(rest, "/")
		seen[box+"/"+seg] = true
	}
	out := make([]string, 0, len(seen))
	for c := range seen {
		out = append(out, c)
	}
	slices.Sort(out)
	return out
}

// InitFile is the zu.policy.yaml that `zu policy init` writes: the
// suggested Levels, cycles off, and the other keys as commented hints.
func InitFile(levels []Level, commit string) []byte {
	var b bytes.Buffer
	from := "the working tree"
	if commit != "" {
		from = "commit " + commit
	}
	fmt.Fprintf(&b, "# %s, suggested by `zu policy init` from the imports of %s.\n", FileName, from)
	b.WriteString("# The Levels hold as written. Listed inner first: an import from an inner\n")
	b.WriteString("# level to an outer one is a violation. Edit them to state the layering you\n")
	b.WriteString("# intend, then run `zu check` (and `zu check -update-baseline` to accept\n")
	b.WriteString("# what exists today).\n")
	b.WriteString("# exclude: [\"**/*.pb.go\", \"**/zz_generated*.go\"]\n")
	b.WriteString("# foreign: [github.com/aws/aws-sdk-go-v2]\n")
	b.WriteString("# The first view sets aside packages under testdata, test(s), *testing, e2e,\n")
	b.WriteString("# example(s), sample-*, hack, tools, scripts and third_party, and fully\n")
	b.WriteString("# generated ones; demote adds id globs, and \"!id\" keeps a box drawn.\n")
	b.WriteString("# demote: [\"**/docs\", \"!example.com/m/tools\"]\n")
	b.WriteString("# budget: 15 # boxes the first view shows before folding the rest into +N\n")
	if len(levels) == 0 {
		b.WriteString("# No layering found: fewer than two boxes to rank.\nlevels: []\n")
	} else {
		b.WriteString("levels:\n")
		for _, l := range levels {
			fmt.Fprintf(&b, "  - %s\n", quoteAll(l))
		}
	}
	b.WriteString("cycles: false # true flags cycles between sibling boxes\n")
	return b.Bytes()
}

// quoteAll writes ids as a YAML flow sequence of double-quoted strings.
func quoteAll(ids []string) string {
	q := make([]string, len(ids))
	for i, id := range ids {
		s, _ := json.Marshal(id) // a JSON string is a YAML double-quoted scalar
		q[i] = string(s)
	}
	return "[" + strings.Join(q, ", ") + "]"
}
