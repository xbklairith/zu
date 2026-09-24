package export

import (
	"math"
	"slices"
	"sort"

	"zu/internal/cover"
	"zu/internal/scan"
)

// Metrics is the CRAP overlay (08): per drawn package the CRAP of its
// functions and methods, and per drawn function its own numbers.
type Metrics struct {
	Packages map[string]PackageMetrics `json:"packages"`
	Funcs    map[string]FuncMetrics    `json:"funcs"`
}

// PackageMetrics summarises a package's functions and methods. CRAP is
// absent when the profile has none of their files: the page draws that as
// the worst (decisions.md, "missing data counts as red").
type PackageMetrics struct {
	Funcs   int       `json:"funcs"`
	Missing int       `json:"missing,omitempty"` // functions whose files the profile lacks
	CRAP    *CRAPStat `json:"crap,omitempty"`
}

// CRAPStat is μ, max and population σ over function CRAP scores, each
// rounded to 0.1, as uml-viewer's class-crap (overlay.clj l.103).
type CRAPStat struct {
	Mu    float64 `json:"mu"`
	Max   float64 `json:"max"`
	Sigma float64 `json:"sigma"`
}

// FuncMetrics is one function: complexity (of the variants the profile
// has, the highest), statements and covered statements, and CRAP rounded
// to 0.1, absent when the profile lacks its files.
type FuncMetrics struct {
	CC      int      `json:"cc"`
	Stmts   int      `json:"stmts"`
	Covered int      `json:"covered"`
	CRAP    *float64 `json:"crap,omitempty"`
}

// AddMetrics joins the scan's measures with a coverprofile into v.Metrics.
// Only ids v draws are written; the profile's paths never are. It returns
// how many of the profile's blocks lie in a file the scan parsed but in none
// of its code: a profile of another revision has them, a matching one none.
func AddMetrics(v *View, ms scan.Measures, prof cover.Profile) (unmatched int) {
	drawn := map[string]bool{}
	for _, n := range v.Nodes {
		drawn[n.ID] = true
	}
	m := &Metrics{Packages: map[string]PackageMetrics{}, Funcs: map[string]FuncMetrics{}}
	scores := map[string][]float64{}
	ids := make([]string, 0, len(ms.Funcs))
	for id := range ms.Funcs {
		ids = append(ids, id)
	}
	slices.Sort(ids) // sums in a fixed order: the same View every run
	for _, id := range ids {
		me := ms.Funcs[id]
		if !drawn[me.Pkg] {
			continue
		}
		fm, crap, ok := funcMetrics(me, prof)
		pm := m.Packages[me.Pkg]
		pm.Funcs++
		if ok {
			scores[me.Pkg] = append(scores[me.Pkg], crap)
		} else {
			pm.Missing++
		}
		m.Packages[me.Pkg] = pm
		if drawn[id] {
			m.Funcs[id] = fm
		}
	}
	for pkg, xs := range scores {
		pm := m.Packages[pkg]
		pm.CRAP = stat(xs)
		m.Packages[pkg] = pm
	}
	v.Metrics = m
	return unmatchedBlocks(ms, prof)
}

// funcMetrics counts the statements of the blocks that start inside the
// function's spans. A function with no statements is fully covered. Its
// complexity is the highest among the spans the profile has, so a variant
// that did not run does not score the one that did. It reports false when
// the profile has none of the function's files.
func funcMetrics(me scan.Measure, prof cover.Profile) (FuncMetrics, float64, bool) {
	var fm FuncMetrics
	found := false
	for _, s := range me.Spans {
		blocks, ok := prof[me.Pkg+"/"+s.File]
		if !ok {
			continue
		}
		found = true
		fm.CC = max(fm.CC, s.CC)
		i, end := within(blocks, s)
		for ; i < end; i++ {
			fm.Stmts += blocks[i].Stmts
			if blocks[i].Hit {
				fm.Covered += blocks[i].Stmts
			}
		}
	}
	if !found {
		for _, s := range me.Spans {
			fm.CC = max(fm.CC, s.CC)
		}
		return fm, 0, false
	}
	cov := 1.0
	if fm.Stmts > 0 {
		cov = float64(fm.Covered) / float64(fm.Stmts)
	}
	crap := CRAP(fm.CC, cov)
	r := round1(crap)
	fm.CRAP = &r
	return fm, crap, true
}

// within is the range of blocks, sorted by start, that start inside s.
func within(blocks []cover.Block, s scan.Span) (int, int) {
	from := cover.Pos{Line: s.Start.Line, Col: s.Start.Col}
	to := cover.Pos{Line: s.End.Line, Col: s.End.Col}
	i := sort.Search(len(blocks), func(i int) bool { return !before(blocks[i].Start, from) })
	end := i
	for end < len(blocks) && !before(to, blocks[end].Start) {
		end++
	}
	return i, end
}

// unmatchedBlocks counts the blocks, in files the scan parsed, that start
// inside no function and no loose code (package-level literals, func _):
// what a profile of another revision has moved. Files the scan did not
// parse (Policy exclude, //go:build ignore, other packages) are not counted.
func unmatchedBlocks(ms scan.Measures, prof cover.Profile) int {
	spans := map[string][]scan.Span{} // file key → code spans in it
	for key, loose := range ms.Files {
		spans[key] = append(spans[key], loose...)
	}
	for _, me := range ms.Funcs {
		for _, s := range me.Spans {
			k := me.Pkg + "/" + s.File
			spans[k] = append(spans[k], s)
		}
	}
	n := 0
	for key, blocks := range prof {
		if _, parsed := ms.Files[key]; !parsed {
			continue
		}
		in := make([]bool, len(blocks))
		for _, s := range spans[key] {
			i, end := within(blocks, s)
			for ; i < end; i++ {
				in[i] = true
			}
		}
		for _, ok := range in {
			if !ok {
				n++
			}
		}
	}
	return n
}

// CRAP is cc²·(1−cov)³ + cc (Savoia and Evans; crap4clj's formula).
// The explicit conversion rounds the product, so no platform fuses it
// into the sum (FMA) and every machine writes the same View.
func CRAP(cc int, cov float64) float64 {
	c := float64(cc)
	return float64(c*c*math.Pow(1-cov, 3)) + c
}

func stat(xs []float64) *CRAPStat {
	var sum, top float64
	for _, x := range xs {
		sum += x
		top = max(top, x)
	}
	mu := sum / float64(len(xs))
	var sq float64
	for _, x := range xs {
		d := x - mu
		sq += float64(d * d) // no FMA, as in CRAP
	}
	return &CRAPStat{Mu: round1(mu), Max: round1(top), Sigma: round1(math.Sqrt(sq / float64(len(xs))))}
}

func round1(x float64) float64 { return math.Round(x*10) / 10 }

func before(a, b cover.Pos) bool { return a.Line < b.Line || a.Line == b.Line && a.Col < b.Col }
