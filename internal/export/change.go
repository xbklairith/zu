package export

import (
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"slices"

	"zu/internal/diff"
	"zu/internal/ir"
	"zu/internal/scan"
)

// Change builds the Change View of base → head: every package and external
// with its Change Status and Affected Set hop, the changed declarations of
// changed packages, and the source and line hunks of the files they are in.
// sum must be diff.Summarize(base, head) and delta diff.Compare(base, head).
// Unchanged declarations only count toward their package's decls, except a
// type kept as the parent of a changed method.
func Change(base, head *ir.IR, delta diff.Delta, sum *diff.Summary, baseTree, headTree scan.Tree) (*View, error) {
	status := map[string]string{}
	for _, c := range delta.Nodes {
		status[c.ID] = string(c.Status)
	}
	movedFrom, moveSource := map[string]string{}, map[string]bool{}
	for _, m := range delta.Moves {
		movedFrom[m.To], moveSource[m.From] = m.From, true
	}
	hop := map[string]int{}
	for _, h := range sum.Affected {
		hop[h.Package] = h.Hops
	}
	headByID, baseByID := nodesByID(head), nodesByID(base)
	headPkg, basePkg := packageOf(headByID), packageOf(baseByID)

	detail := map[string]bool{}
	v := newView("change", head)
	b := base.Ref
	v.Base = &b
	for _, r := range sum.Packages {
		detail[r.ID] = true
		v.Changed = append(v.Changed, r.ID)
	}
	for to := range movedFrom {
		detail[headPkg(to)] = true
	}

	decls, gen := map[string]int{}, map[string]int{}
	for i := range head.Nodes {
		if k := head.Nodes[i].Kind; k == ir.KindType || k == ir.KindFunction {
			decls[headPkg(head.Nodes[i].ID)]++
			if head.Nodes[i].Generated {
				gen[headPkg(head.Nodes[i].ID)]++
			}
		}
	}

	in := map[string]bool{}
	var changedFiles, baseFiles []string
	add := func(n *ir.Node, from *ir.IR) {
		vn := toNode(n)
		vn.Status, vn.MovedFrom = status[n.ID], movedFrom[n.ID]
		if n.Kind == ir.KindPackage {
			if h, ok := hop[n.ID]; ok {
				vn.Hop = &h
			}
			vn.Decls, vn.GenDecls, vn.Unresolved, vn.Detail = decls[n.ID], gen[n.ID], from.UnresolvedCalls[n.ID], detail[n.ID]
		}
		v.Nodes = append(v.Nodes, vn)
		in[n.ID] = true
	}
	isDecl := func(n *ir.Node) bool { return n.Kind == ir.KindType || n.Kind == ir.KindFunction }

	// Head: every package and external; changed declarations of detail packages.
	for i := range head.Nodes {
		n := &head.Nodes[i]
		if isDecl(n) {
			changed := status[n.ID] != "" || movedFrom[n.ID] != ""
			if !changed || !detail[headPkg(n.ID)] {
				continue
			}
			for _, l := range n.Locations {
				changedFiles = append(changedFiles, l.Path)
			}
		}
		add(n, head)
	}
	// Base: removed packages and externals, and the removed declarations of
	// detail packages. A Move's source is not drawn, but its text left base.
	for i := range base.Nodes {
		n := &base.Nodes[i]
		if moveSource[n.ID] {
			for _, l := range n.Locations {
				baseFiles = append(baseFiles, l.Path)
			}
			continue
		}
		if status[n.ID] != string(diff.Removed) || isDecl(n) && !detail[basePkg(n.ID)] {
			continue
		}
		if isDecl(n) {
			for _, l := range n.Locations {
				baseFiles = append(baseFiles, l.Path)
			}
		}
		add(n, base)
	}
	// A changed method needs its type to be drawn in, changed or not.
	for i := range v.Nodes {
		for p := v.Nodes[i].Parent; p != "" && !in[p]; {
			n := headByID[p]
			if n == nil {
				n = baseByID[p]
			}
			if n == nil || !isDecl(n) {
				break
			}
			add(n, head)
			p = n.Parent
		}
	}

	modules := map[string]bool{}
	for _, n := range v.Nodes {
		if n.Kind == string(ir.KindPackage) {
			modules[n.Module] = true
		}
	}
	for m := range modules {
		v.Modules = append(v.Modules, m)
	}

	type edgeKey struct{ kind, from, to string }
	edgeStatus := map[edgeKey]diff.Status{}
	for _, e := range delta.Edges {
		edgeStatus[edgeKey{string(e.Kind), e.From, e.To}] = e.Status
	}
	// Imports join packages and externals, which are all drawn; calls and
	// embeds are kept only between drawn declarations.
	keep := func(e *ir.Edge) bool { return in[e.From] && in[e.To] }
	for i := range head.Edges {
		if e := &head.Edges[i]; keep(e) {
			ve := toEdge(e)
			ve.Status = string(edgeStatus[edgeKey{string(e.Kind), e.From, e.To}])
			v.Edges = append(v.Edges, ve)
		}
	}
	for i := range base.Edges {
		e := &base.Edges[i]
		if edgeStatus[edgeKey{string(e.Kind), e.From, e.To}] == diff.Removed && keep(e) {
			ve := toEdge(e)
			ve.Status = string(diff.Removed)
			v.Edges = append(v.Edges, ve)
		}
	}

	files := map[string]bool{}
	for _, p := range changedFiles {
		files[p] = true
	}
	if err := addSources(v, files, headTree.ReadFile); err != nil {
		return nil, err
	}
	for _, p := range baseFiles {
		files[p] = true
	}
	hunks, err := hunksOf(files, baseTree, headTree)
	if err != nil {
		return nil, err
	}
	if len(hunks) > 0 {
		v.Hunks = hunks
	}
	sortView(v)
	return v, nil
}

// hunksOf diffs each file between the two trees. A file absent on one side
// is diffed against empty content; a file whose lines are equal is left out.
func hunksOf(files map[string]bool, baseTree, headTree scan.Tree) (map[string][]Hunk, error) {
	out := map[string][]Hunk{}
	if len(files) == 0 {
		return out, nil
	}
	read := func(t scan.Tree) (func(string) ([]byte, error), error) {
		list, _, err := t.Files()
		if err != nil {
			return nil, err
		}
		return func(p string) ([]byte, error) {
			if _, ok := slices.BinarySearch(list, p); !ok {
				return nil, nil
			}
			// A listed file deleted since (a checkout mid-rescan) reads as
			// empty too: the listing is the scan's, kept (16).
			b, err := t.ReadFile(p)
			if errors.Is(err, fs.ErrNotExist) {
				return nil, nil
			}
			return b, err
		}, nil
	}
	readBase, err := read(baseTree)
	if err != nil {
		return nil, fmt.Errorf("list base files: %w", err)
	}
	readHead, err := read(headTree)
	if err != nil {
		return nil, fmt.Errorf("list head files: %w", err)
	}
	for p := range files {
		if !filepath.IsLocal(filepath.FromSlash(p)) {
			return nil, fmt.Errorf("source path %q is outside the repository", p)
		}
		b, err := readBase(p)
		if err != nil {
			return nil, fmt.Errorf("read base %s: %w", p, err)
		}
		h, err := readHead(p)
		if err != nil {
			return nil, fmt.Errorf("read head %s: %w", p, err)
		}
		if hs := Hunks(b, h); len(hs) > 0 {
			out[p] = hs
		}
	}
	return out, nil
}

func nodesByID(doc *ir.IR) map[string]*ir.Node {
	m := make(map[string]*ir.Node, len(doc.Nodes))
	for i := range doc.Nodes {
		m[doc.Nodes[i].ID] = &doc.Nodes[i]
	}
	return m
}

// packageOf returns a function from a node id to its package id, walking
// method → type → package ("" when there is none).
func packageOf(byID map[string]*ir.Node) func(id string) string {
	return func(id string) string {
		for n := byID[id]; n != nil; n = byID[n.Parent] {
			if n.Kind == ir.KindPackage {
				return n.ID
			}
		}
		return ""
	}
}
