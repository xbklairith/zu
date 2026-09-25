package export

import (
	"crypto/sha1" //nolint:gosec // G505: GitLab names a file by the SHA-1 of its path; not a security use
	"crypto/sha256"
	"encoding/hex"
	"math"
	"net/url"
	"strconv"

	"zu/internal/ir"
	"zu/internal/scan"
)

// HostFile is one file of the diff the host renders for base → head, as
// git diff -M gives it (gitref.Diff): keyed as the host keys it, by head's
// path, with base's path for a rename, and git's own hunks.
type HostFile struct {
	Path    string // head's path; "" for a file the change deleted
	OldPath string // base's path; "" for a file the change added
	Hunks   []Hunk
}

// key is the path the host names f's diff by: head's, or base's for a
// deleted file.
func (f *HostFile) key() string {
	if f.Path != "" {
		return f.Path
	}
	return f.OldPath
}

// DiffLinks sets, in the Change View v, the host links of B6 (14): each file
// with hunks to its diff on the host's compare page (Links.Files), and each
// changed declaration to its first changed line there (Links.Nodes). The
// lines come from files, the host's own diff, not from v's hunks, which pair
// files by path and so miss renames. It is all computed here, offline: zu
// asks the host nothing. Nothing is set unless both sides are clean commits
// on GitHub or GitLab and files is known.
//
// A declaration links to the first line its side of the diff changes within
// its span: from its first line to the end ms measured for a head function,
// else to the next declaration the View draws in its file. With no changed
// line there (a Move git sees as a rename, a change only in its doc
// comment), in a generated file or in a file the change deleted, both of
// which GitHub shows collapsed, it links to its file.
func DiffLinks(v *View, origin string, files []HostFile, ms scan.Measures) {
	if v.Base == nil || len(files) == 0 {
		return
	}
	cmpURL := CompareURL(origin, *v.Base, v.Head)
	if cmpURL == "" {
		return
	}
	host, _ := parseRemote(origin)
	at, ok := hosts[host]
	if !ok {
		return
	}
	byHead, byBase := map[string]*HostFile{}, map[string]*HostFile{}
	for i := range files {
		f := &files[i]
		if f.Path != "" {
			byHead[f.Path] = f
		}
		if f.OldPath != "" {
			byBase[f.OldPath] = f
		}
	}
	links := map[string]string{}
	for p := range v.Hunks {
		f := byHead[p]
		if g := byBase[p]; f == nil && g != nil && g.Path == "" {
			f = g // deleted: the host keys it by base's path
		}
		if f != nil {
			links[p] = at.file(cmpURL, f.key())
		}
	}
	nodes := map[string]string{}
	for i := range v.Nodes {
		n := &v.Nodes[i]
		if n.Kind != string(ir.KindType) && n.Kind != string(ir.KindFunction) || n.Status == "" && n.MovedFrom == "" {
			continue
		}
		removed := n.Status == "removed"
		f := byHead[n.Loc.Path]
		if removed {
			f = byBase[n.Loc.Path]
		}
		if f == nil {
			continue
		}
		nodes[n.ID] = at.file(cmpURL, f.key())
		if n.Generated || f.Path == "" {
			continue
		}
		if c, ok := firstChange(f.Hunks, n.Loc.Line, spanEnd(v, n, removed, ms)+1, removed); ok {
			nodes[n.ID] = at.line(cmpURL, f.key(), c)
		}
	}
	if v.Links == nil {
		v.Links = &Links{}
	}
	v.Links.Files, v.Links.Nodes = links, nodes
}

// spanEnd is the last line of n: of its measured span for a head function,
// else the line before the next declaration drawn in its file on its side.
func spanEnd(v *View, n *Node, removed bool, ms scan.Measures) int {
	if !removed {
		for _, sp := range ms.Funcs[n.ID].Spans {
			if sp.Path == n.Loc.Path && sp.Start.Line <= n.Loc.Line && n.Loc.Line <= sp.End.Line {
				return sp.End.Line
			}
		}
	}
	if next := nextDecl(v, n, removed); next != math.MaxInt {
		return next - 1
	}
	return math.MaxInt - 1
}

// anchors are one host's places on its compare page (14's research,
// 2026-09-25): a file's diff, and one changed line in it.
type anchors struct {
	file func(compare, path string) string
	line func(compare, path string, c change) string
}

// Hosted is whether origin is on a host zu links into by itself: GitHub or
// GitLab (a -link-template covers any other).
func Hosted(origin string) bool {
	host, _ := parseRemote(origin)
	_, ok := hosts[host]
	return ok
}

var hosts = map[string]anchors{
	// GitHub: "diff-" and the SHA-256 of the path, then R and the head line
	// or L and the base line. Seen on live compare pages.
	"github.com": {
		file: func(cmp, p string) string { return cmp + "#diff-" + sha256Hex(p) },
		line: func(cmp, p string, c change) string {
			if c.kind == '+' {
				return cmp + "#diff-" + sha256Hex(p) + "R" + strconv.Itoa(c.head)
			}
			return cmp + "#diff-" + sha256Hex(p) + "L" + strconv.Itoa(c.base)
		},
	},
	// GitLab: the SHA-1 of the path, or a line's id: "line_", its first 9
	// hex, then A and the head line of an added line or the base line of a
	// removed one (lib/gitlab/diff/line.rb id). ?file_path= draws that file
	// first. Seen on live compare and merge request pages.
	"gitlab.com": {
		file: func(cmp, p string) string { return cmp + "?file_path=" + url.QueryEscape(p) + "#" + sha1Hex(p) },
		line: func(cmp, p string, c change) string {
			id := "line_" + sha1Hex(p)[:9] + "_"
			if c.kind == '+' {
				id += "A" + strconv.Itoa(c.head)
			} else {
				id += strconv.Itoa(c.base)
			}
			return cmp + "?file_path=" + url.QueryEscape(p) + "#" + id
		},
	},
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func sha1Hex(s string) string {
	sum := sha1.Sum([]byte(s)) //nolint:gosec // G401: as the import says
	return hex.EncodeToString(sum[:])
}

// change is one changed line of a file's diff: '+' at head line head, or
// '-' at base line base. The other number is the next line on that side.
type change struct {
	kind       byte
	base, head int
}

// firstChange returns the first changed line of hs inside [line, until) on
// one side: base (a removed declaration, '-' lines only) or head (a '+' at
// or after line, or a '-' removed from after line). On head, lines that a
// '+' run replaces give that run's first line: the new text, not the old.
func firstChange(hs []Hunk, line, until int, base bool) (change, bool) {
	for _, h := range hs {
		cs := changes(h)
		for i, c := range cs {
			switch {
			case base && c.kind == '-' && c.base >= line && c.base < until,
				!base && c.kind == '+' && c.head >= line && c.head < until:
				return c, true
			case !base && c.kind == '-' && c.head > line && c.head < until:
				j := i
				for j < len(cs) && cs[j].kind == '-' && cs[j].head == c.head {
					j++
				}
				if j < len(cs) && cs[j].kind == '+' && cs[j].head == c.head {
					return cs[j], true
				}
				return c, true
			}
		}
	}
	return change{}, false
}

// changes lists the changed lines of h, each with its line on both sides.
// A side with no lines starts at the line before the hunk (unified diff).
func changes(h Hunk) []change {
	b, hd := h.BaseStart, h.HeadStart
	if h.BaseLines == 0 {
		b++
	}
	if h.HeadLines == 0 {
		hd++
	}
	var out []change
	for _, l := range h.Lines {
		if l == "" {
			continue
		}
		switch l[0] {
		case '-':
			out = append(out, change{'-', b, hd})
			b++
		case '+':
			out = append(out, change{'+', b, hd})
			hd++
		default:
			b, hd = b+1, hd+1
		}
	}
	return out
}

// nextDecl is the line of the next declaration after n in its file on n's
// side, among those the View draws, or MaxInt.
func nextDecl(v *View, n *Node, removed bool) int {
	next := math.MaxInt
	for i := range v.Nodes {
		o := &v.Nodes[i]
		if o.Loc.Path != n.Loc.Path || (o.Status == "removed") != removed || o.Kind == string(ir.KindPackage) {
			continue
		}
		if o.Loc.Line > n.Loc.Line {
			next = min(next, o.Loc.Line)
		}
	}
	return next
}
