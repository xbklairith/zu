// Package policy reads zu.policy.yaml and evaluates its rules against an IR.
// The Policy orders, ranks, collapses and omits; it never adds a node or an
// edge and never assigns a package to a box that is not in the code (0008).
package policy

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"slices"
	"strings"

	"go.yaml.in/yaml/v3"
)

// FileName is the Policy file, read from the root of the scanned tree.
const FileName = "zu.policy.yaml"

// Format is the version of the Policy file format this build reads (N4).
// The file carries no version key: unknown keys are errors, so a later
// format can add one without ambiguity.
const Format = "1"

// Policy is the parsed Policy file. Ids are Package Tree box ids, package
// ids or external module paths; an id also covers everything under it.
// JSON keys are the normalised form the hash covers (0004).
type Policy struct {
	Exclude   []string   `yaml:"exclude" json:"exclude,omitempty"`      // repo-relative file globs the scan skips
	Order     []string   `yaml:"order" json:"order,omitempty"`          // sibling boxes drawn first, in this order
	Levels    []Level    `yaml:"levels" json:"levels,omitempty"`        // ranks, inner first
	Cycles    bool       `yaml:"cycles" json:"cycles,omitempty"`        // flag cycles between sibling boxes
	Foreign   []string   `yaml:"foreign" json:"foreign,omitempty"`      // external prefixes collapsed to one oval
	Omit      []string   `yaml:"omit" json:"omit,omitempty"`            // nodes left off, with everything under them
	OmitEdges []Pair     `yaml:"omit-edges" json:"omitEdges,omitempty"` // dependencies left off
	EdgeKinds []EdgeKind `yaml:"edge-kinds" json:"edgeKinds,omitempty"` // dependencies the Levels rule exempts
	Proposals []Proposal `yaml:"proposals" json:"proposals,omitempty"`  // named regroupings, drawn only on request
}

// Level is one rank: the boxes that share it. In YAML an item is one id or
// a list of ids.
type Level []string

// Pair names every dependency from something under From to something under To.
type Pair struct {
	From string `yaml:"from" json:"from"`
	To   string `yaml:"to" json:"to"`
}

// EdgeKind re-labels the dependencies of a Pair. The only kind is
// "association", uml-viewer's way of exempting a dependency from the Levels rule.
type EdgeKind struct {
	From string `yaml:"from" json:"from"`
	To   string `yaml:"to" json:"to"`
	Kind string `yaml:"kind" json:"kind"`
}

// Proposal is a named regrouping of real boxes into layers, inner first.
type Proposal struct {
	Name   string   `yaml:"name" json:"name"`
	Layers []Layer  `yaml:"layers" json:"layers"`
	Omit   []string `yaml:"omit" json:"omit,omitempty"`
}

// Layer is one named component of a Proposal.
type Layer struct {
	Name    string   `yaml:"name" json:"name"`
	Members []string `yaml:"members" json:"members"`
}

// Association is the one EdgeKind a Policy may set.
const Association = "association"

// UnmarshalYAML accepts a single id or a list of ids.
func (l *Level) UnmarshalYAML(n *yaml.Node) error {
	switch n.Kind {
	case yaml.ScalarNode:
		var s string
		if err := n.Decode(&s); err != nil {
			return err
		}
		*l = Level{s}
		return nil
	case yaml.SequenceNode:
		var ss []string
		if err := n.Decode(&ss); err != nil {
			return err
		}
		*l = ss
		return nil
	}
	return fmt.Errorf("line %d: a level is an id or a list of ids", n.Line)
}

// Parse reads a Policy file. Unknown keys, malformed ids and globs, an id in
// two levels, any kind but "association" and a second YAML document are
// errors: a Policy that is half understood must not silently rank a
// repository. An empty file is the empty Policy.
func Parse(data []byte) (*Policy, error) {
	p := &Policy{}
	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)
	if err := dec.Decode(p); err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("%s: %w", FileName, err)
	}
	// A second document would be silently ignored, so it is an error.
	if err := dec.Decode(&yaml.Node{}); !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("%s: want one YAML document, found a second", FileName)
	}
	if err := p.validate(); err != nil {
		return nil, fmt.Errorf("%s: %w", FileName, err)
	}
	return p, nil
}

func (p *Policy) validate() error {
	for i, g := range p.Exclude {
		if err := checkGlob(g); err != nil {
			return fmt.Errorf("exclude[%d]: %w", i, err)
		}
	}
	lists := []struct {
		key string
		ids []string
	}{{"order", p.Order}, {"foreign", p.Foreign}, {"omit", p.Omit}}
	for _, l := range lists {
		for i, id := range l.ids {
			if err := checkID(id); err != nil {
				return fmt.Errorf("%s[%d]: %w", l.key, i, err)
			}
		}
	}
	seen := map[string]int{}
	for i, lv := range p.Levels {
		if len(lv) == 0 {
			return fmt.Errorf("levels[%d]: empty level", i)
		}
		for _, id := range lv {
			if err := checkID(id); err != nil {
				return fmt.Errorf("levels[%d]: %w", i, err)
			}
			if j, dup := seen[id]; dup {
				return fmt.Errorf("levels[%d]: %q is already in levels[%d]", i, id, j)
			}
			seen[id] = i
		}
	}
	for i, e := range p.OmitEdges {
		if err := checkPair(e.From, e.To); err != nil {
			return fmt.Errorf("omit-edges[%d]: %w", i, err)
		}
	}
	for i, e := range p.EdgeKinds {
		if err := checkPair(e.From, e.To); err != nil {
			return fmt.Errorf("edge-kinds[%d]: %w", i, err)
		}
		if e.Kind != Association {
			return fmt.Errorf("edge-kinds[%d]: kind %q: the only kind is %q", i, e.Kind, Association)
		}
	}
	names := map[string]bool{}
	for i, pr := range p.Proposals {
		if pr.Name == "" || names[pr.Name] {
			return fmt.Errorf("proposals[%d]: want a unique name", i)
		}
		names[pr.Name] = true
		if len(pr.Layers) == 0 {
			return fmt.Errorf("proposals[%d]: no layers", i)
		}
		for j, l := range pr.Layers {
			if l.Name == "" || len(l.Members) == 0 {
				return fmt.Errorf("proposals[%d].layers[%d]: want a name and members", i, j)
			}
			for _, id := range l.Members {
				if err := checkID(id); err != nil {
					return fmt.Errorf("proposals[%d].layers[%d]: %w", i, j, err)
				}
			}
		}
		for _, id := range pr.Omit {
			if err := checkID(id); err != nil {
				return fmt.Errorf("proposals[%d].omit: %w", i, err)
			}
		}
	}
	return nil
}

func checkPair(from, to string) error {
	if err := checkID(from); err != nil {
		return fmt.Errorf("from: %w", err)
	}
	if err := checkID(to); err != nil {
		return fmt.Errorf("to: %w", err)
	}
	return nil
}

// checkGlob accepts a repo-relative glob whose segments are "**" or valid
// path.Match patterns (Match, in glob.go, applies them).
func checkGlob(glob string) error {
	if glob == "" || strings.HasPrefix(glob, "/") {
		return fmt.Errorf("bad glob %q: want a repo-relative path pattern", glob)
	}
	for _, seg := range strings.Split(glob, "/") {
		if seg == "**" {
			continue
		}
		if _, err := path.Match(seg, ""); err != nil {
			return fmt.Errorf("bad glob %q: %w", glob, err)
		}
	}
	return nil
}

// collapseGlob replaces each run of "**" segments with one: "a/**/**/b"
// matches exactly what "a/**/b" does.
func collapseGlob(glob string) string {
	var out []string
	for _, s := range strings.Split(glob, "/") {
		if s == "**" && len(out) > 0 && out[len(out)-1] == "**" {
			continue
		}
		out = append(out, s)
	}
	return strings.Join(out, "/")
}

// checkID accepts an import path or node id: no spaces, no empty segment.
func checkID(id string) error {
	if id == "" || strings.ContainsAny(id, " \t\n") || strings.HasPrefix(id, "/") ||
		strings.HasSuffix(id, "/") || strings.Contains(id, "//") {
		return fmt.Errorf("bad id %q", id)
	}
	return nil
}

// Normalize returns p with every set sorted and deduplicated, and runs of
// "**" in exclude globs collapsed to one. Order, the sequence of levels and
// of proposals and their layers carry meaning and are kept.
func (p *Policy) Normalize() *Policy {
	n := &Policy{Foreign: set(p.Foreign), Omit: set(p.Omit), Cycles: p.Cycles}
	for _, g := range p.Exclude {
		n.Exclude = append(n.Exclude, collapseGlob(g))
	}
	n.Exclude = set(n.Exclude)
	for _, id := range p.Order {
		if !slices.Contains(n.Order, id) {
			n.Order = append(n.Order, id)
		}
	}
	for _, lv := range p.Levels {
		n.Levels = append(n.Levels, set(lv))
	}
	n.OmitEdges = slices.Clone(p.OmitEdges)
	slices.SortFunc(n.OmitEdges, func(a, b Pair) int {
		return strings.Compare(a.From+"\x00"+a.To, b.From+"\x00"+b.To)
	})
	n.OmitEdges = slices.Compact(n.OmitEdges)
	n.EdgeKinds = slices.Clone(p.EdgeKinds)
	slices.SortFunc(n.EdgeKinds, func(a, b EdgeKind) int {
		return strings.Compare(a.From+"\x00"+a.To+"\x00"+a.Kind, b.From+"\x00"+b.To+"\x00"+b.Kind)
	})
	n.EdgeKinds = slices.Compact(n.EdgeKinds)
	for _, pr := range p.Proposals {
		q := Proposal{Name: pr.Name, Omit: set(pr.Omit)}
		for _, l := range pr.Layers {
			q.Layers = append(q.Layers, Layer{Name: l.Name, Members: set(l.Members)})
		}
		n.Proposals = append(n.Proposals, q)
	}
	return n
}

func set(ids []string) []string {
	if len(ids) == 0 {
		return nil
	}
	out := slices.Clone(ids)
	slices.Sort(out)
	return slices.Compact(out)
}

// Hash is "sha256:" and the hex SHA-256 of the normalised Policy as JSON plus
// a newline. Comments, key order, list order within sets and duplicates do
// not change it (0004); the empty Policy hashes as scan.DefaultPolicyHash.
func (p *Policy) Hash() string {
	b, err := json.Marshal(p.Normalize())
	if err != nil {
		panic(err) // plain strings and bools cannot fail to marshal
	}
	sum := sha256.Sum256(append(b, '\n'))
	return "sha256:" + hex.EncodeToString(sum[:])
}

// Rules reports whether the Policy asks for any check: Levels or cycles.
func (p *Policy) Rules() bool {
	return len(p.Levels) > 0 || p.Cycles
}
