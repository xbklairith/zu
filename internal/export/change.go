package export

import (
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
	statusOf := func(e *ir.Edge) diff.Status { return edgeStatus[edgeKey{string(e.Kind), e.From, e.To}] }
	removed := func(e *ir.Edge) bool { return statusOf(e) == diff.Removed }

	// 18: the Screen's unchanged neighbours (decisions.md: one hop of
	// unchanged neighbours): each declaration of head one call or embed from
	// a drawn one, with its type, and every method of a type on the page, so
	// a type's Screen counts all its methods' calls. A Move's source is in no
	// tree the page draws, so an edge to it is left out.
	decl := map[string]bool{} // the declarations on the page
	for _, n := range v.Nodes {
		decl[n.ID] = n.Kind == string(ir.KindType) || n.Kind == string(ir.KindFunction)
	}
	near := map[string]*ir.Node{}
	on := func(id string) bool { return in[id] || near[id] != nil }
	pull := func(id string) {
		for n := headByID[id]; n != nil && isDecl(n) && !on(n.ID); n = headByID[n.Parent] {
			near[n.ID] = n
		}
	}
	calls := func(e *ir.Edge) bool { return e.Kind != ir.EdgeImports }
	for i := range head.Edges {
		if e := &head.Edges[i]; calls(e) && decl[e.From] != decl[e.To] {
			pull(e.From)
			pull(e.To)
		}
	}
	for i := range base.Edges {
		if e := &base.Edges[i]; calls(e) && removed(e) && decl[e.From] != decl[e.To] {
			pull(e.From)
			pull(e.To)
		}
	}
	for i := range head.Nodes {
		if n, p := &head.Nodes[i], headByID[head.Nodes[i].Parent]; isDecl(n) && p != nil && p.Kind == ir.KindType && on(p.ID) {
			pull(n.ID)
		}
	}
	for id := range near {
		decl[id] = true
	}

	// Imports join packages and externals, which are all drawn; calls and
	// embeds are kept only between drawn declarations, and (18) in Near
	// between declarations on the page. A call or embed with one end off the
	// page is counted on the other, as in a Project View (17).
	var nearEdges []Edge
	offIn, offOut := map[string]int{}, map[string]int{}
	put := func(e *ir.Edge, status diff.Status) {
		ve := toEdge(e)
		ve.Status = string(status)
		if in[e.From] && in[e.To] {
			v.Edges = append(v.Edges, ve)
		} else {
			nearEdges = append(nearEdges, ve)
		}
	}
	for i := range head.Edges {
		e := &head.Edges[i]
		switch {
		case on(e.From) && on(e.To):
			put(e, statusOf(e))
		case decl[e.From]:
			offOut[e.From] += len(e.Locations)
		case decl[e.To]:
			offIn[e.To] += len(e.Locations)
		}
	}
	for i := range base.Edges {
		if e := &base.Edges[i]; removed(e) && on(e.From) && on(e.To) {
			put(e, diff.Removed)
		}
	}
	if len(near) > 0 {
		v.Near = &Near{Nodes: []Node{}, Edges: []Edge{}}
		for _, n := range near {
			vn := toNode(n)
			vn.OffIn, vn.OffOut = offIn[n.ID], offOut[n.ID]
			v.Near.Nodes = append(v.Near.Nodes, vn)
		}
		v.Near.Edges = append(v.Near.Edges, nearEdges...)
	}
	for i := range v.Nodes {
		n := &v.Nodes[i]
		n.OffIn, n.OffOut = offIn[n.ID], offOut[n.ID]
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
	// 20: each tree's files are read once, for the hunks and the
	// declaration diffs; head's inlined ones are read already.
	bs, hs := newSide("base", baseTree), newSide("head", headTree)
	for p, text := range v.Sources {
		hs.keep(p, []byte(text), v.Syntax[p])
	}
	hunks, err := hunksOf(files, bs, hs)
	if err != nil {
		return nil, err
	}
	if len(hunks) > 0 {
		v.Hunks = hunks
	}
	dd, err := declDiffs(v, baseByID, headByID, bs, hs)
	if err != nil {
		return nil, err
	}
	if len(dd) > 0 {
		v.DeclDiffs = dd
	}
	sortView(v)
	return v, nil
}

// hunksOf diffs each file between the two sides, coloured (20). A file
// absent on one side is diffed against empty content; a file whose lines are
// equal is left out.
func hunksOf(files map[string]bool, bs, hs *side) (map[string][]Hunk, error) {
	out := map[string][]Hunk{}
	for p := range files {
		b, err := bs.file(p)
		if err != nil {
			return nil, err
		}
		h, err := hs.file(p)
		if err != nil {
			return nil, err
		}
		hunks := Hunks(b.text, h.text)
		if len(hunks) == 0 {
			continue
		}
		for i := range hunks {
			colour(&hunks[i], b.colour(), h.colour())
		}
		out[p] = hunks
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
