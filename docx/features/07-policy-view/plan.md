# 07 · Policy View — Plan

**Status:** approved 2026-09-24 (scrutinized, fixed, advisor sign-off). ADR 0008's banner wording is aligned (Deviation 7). Rulings at approval: every violation list, the Change View section included, puts Levels before cycle. zu fixes `zu diff`'s sort at the source before Task 1. A Proposal member typo makes `zu check` exit 3, like a Levels typo. `inOrder` sorts the rest of an ordered row by id.

**Drafted** 2026-09-24, revised after scrutiny (`scrutiny-07.md`: M1–M4, Nits 5–11) and the lead's rulings. 06 is on `main` with its acceptance recorded (34d128c), and every diff here is against that commit. From 06 the plan uses `internal/policy` (`RankOf`, `EdgeRules`, `Normalize`, `Rules`), `export.Mark` and `PolicyInfo`, `diff.ViolationDelta`, and the UI's `violating` and `pinFor` (`web/src/policy.ts`). What 06 does not provide is listed under "07 needs from 06".

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is the plan's verification record and is committed with it. It is 06's script unchanged. It extracts every code block from this file and applies it to a fresh copy of `main`, task by task, the way an implementer would: a `<!-- file: … -->` block is written whole, and a `diff` block goes through `patch -p1`. At each **Run** step it runs that step's first command: a step marked "Expected: FAIL" must exit non-zero and every other step must exit 0. It prints one line per step and exits 1 if any step misbehaves. From the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 docx/features/07-policy-view/replay.py docx/features/07-policy-view/plan.md "$S"
```

The replay needs Go, git, `patch`, Python 3, `npm ci` (Tasks 4–11 are UI tasks) and Playwright's three browsers (Task 11 runs 05's browser harness).

**Goal:** Draw what 06 parses and checks but does not draw:

- `order` among siblings;
- rank badges on boxes, with level 0 at the bottom (decisions.md l.22);
- Proposals, on request, under the "PROPOSAL — not instantiated in code" banner, with violations re-evaluated for them (ADR 0008);
- the Change View's "new violations first" section (decisions.md l.39);
- a red mark on a box that hides a violation, so violations stay red at every depth and every declutter stage (decisions.md l.41; 06's acceptance found the gap).

**Architecture:**
- **Go evaluates, the page draws.** Everything that applies a rule stays in Go: `policy.ForProposal` turns a Proposal into a Levels-only Policy, and `export.Mark` writes each Proposal's ranks and violations into the View. The page never evaluates a rule. It regroups and lays out.
- **A Proposal is a View transform.** `proposalView` returns a View whose packages hang under one box per layer (and an Unassigned box). The one seam is `cut.ts` `index`, which derives the box tree: it reads an optional `regroup` parent map. The whole 04/05 pipeline (scene, depth, declutter, selection, focus, search, hash) then draws a Proposal unchanged.
- **Ranks are laid out by the graph, not by ELK partitions.** Invisible step nodes between consecutive ranks of siblings make ELK's layered algorithm place higher ranks above lower ones (Deviation 1).
- **`order` is applied after layout.** ELK does not keep sibling order within a row, so `inOrder` re-places ordered rows from ELK's positions; edges follow because React Flow draws them from the nodes (Deviation 15).
- **The hidden-violation mark** is computed in `scene`, where the drawing's mapping from package to drawn node (`shown`, then declutter's `lift`) is known.

**Tech Stack:** Go 1.24; React 19, `@xyflow/react`, elkjs 0.12 and `vitest` as in 05. No new dependency.

**Source decisions:**
- ADR 0008: Proposals drawn on request, under a banner, violations re-evaluated; the Policy orders boxes and never invents them in the Package Tree.
- decisions.md l.22 (level 0 drawn at the bottom), l.39 (new violations first), l.41 (violations stay red).
- The glossary: Proposal ("a what-if, never the default picture"), Level.
- uml-viewer's primary source at commit 79cc1ef:
  - `hierarchy.clj` `sort-ids` l.57 (`order` first, then the rest by name); `rolled-level` l.112 (a box has the max level of what it holds); `remap-proposal-edges` l.431; `proposal-view` l.479 (one box per layer holding the real modules its members claim, and an Unassigned box);
  - `policy.clj` `proposal-notice` l.62 ("PROPOSAL — not instantiated in code"); `ranks-from-layers` l.184; `restamp-ranks` l.231 (a Proposal restamps Levels only);
  - `layout.clj` `place-classes` l.286–298 (rows by level, highest first; an unleveled box counts as level 0);
  - `draw.clj` l.650–655 (the banner in gold, size 16);
  - README l.308–337 (rank badges at the upper left; "a component inherits the max level of its elements").

**Out of Scope:**
- Importing `.go-arch-lint.yml` (decisions.md l.21: after v1).
- `zu check` or `zu diff` against a Proposal: a Proposal is a what-if and never fails a build.
- Cycles inside a Proposal (Deviation 3).
- A Proposal in the Change View (Deviation 12).
- Ranking the default picture by the first Proposal (Deviation 16).
- Editing the Policy from the page.

**07 needs from 06** (06 provides none of these; each is added here, with a test first):
1. `PolicyInfo.order` and `PolicyInfo.proposals` in the View. 06's View carries `policy: {hash, levels}` only (Task 2).
2. The Change View's violation delta. 06's `zu diff` prints it, but 06's View never carries it (`export.Change` reads only the affected and changed packages), with or without a lens. 07 adds it (Task 3).
3. A way to evaluate a Proposal: `policy.ForProposal` (Task 1). 06 validates and hashes `proposals` only, and accepts a member in two layers or one that matches no package; 07 rejects both (Task 1).
4. `Mark` writing `policy` for a Policy with only an `order` or only Proposals. 06's contract says the View's Policy fields are "all absent when the Policy has no rules"; 07 amends that (Deviation 6).
5. Ranks on boxes. 06 ranks packages only (Task 4).

---

## Deviations and decisions for review

1. **Step nodes, not ELK partitioning, put level 0 at the bottom.** 06 left `elk.partitioning` unverified. Measured in elkjs 0.12: it orders a flat graph, but inside compound nodes with `INCLUDE_CHILDREN`, which zu's nested boxes need, it is ignored. On zu's own View at depth 3, `zu/internal/version` (rank 0) was placed level with `zu/internal/export` (rank 4). Task 6 instead adds, in each container, an invisible zero-size node between each two consecutive ranks present among the siblings, with an edge from every higher-ranked sibling to it and from it to every lower-ranked one: O(n) edges, no partition option. Measured on zu's own View: no sibling of a higher rank is placed below one of a lower rank, for the tree and the Proposal, depths 1–4, stages `full`, `arrows` and `classes`, lines on and off. The reviewer's fuzz (150 random trees, 1,800 layouts) found none either. On hugo the steps cost about 100 ms at depth 2 (262 ms against 166 ms without ranks) and about 6% at depth 3 (2,569 ms against 2,431 ms; Task 12).
2. **An edge that climbs the ranks between the siblings under its lowest common container is left out of ELK's input.** Fed to ELK it would fight the steps between those siblings. The canvas still draws it red: React Flow draws `sc.edges`, not ELK's routes. An edge that climbs only deeper is kept: with rolled ranks, `m/a/lo → m/b/hi` and `m/b/lo → m/a/hi` join two siblings of one rank, and with the steps inside `m/a` and `m/b` they form a cycle in ELK's input. ELK breaks it by reversing a non-step edge; Task 6 tests that case, and the fuzz above covers it.
3. **A Proposal is checked for Levels only.** Cycles are arcs between Package Tree boxes, and a Proposal regroups the boxes. uml-viewer's `restamp-ranks` (l.231) restamps Levels only.
4. **A layer holds real subtrees, not a flat list.** uml-viewer's layers hold flat modules; zu hangs each package under the longest member of its layer that covers it, with the real segment boxes between, so depth and drill-in work inside a layer. A member label is its path without the module (`internal/ir`). A package covered by nested members of two layers takes the deeper member's layer (`RankOf`'s longest prefix). The same member in two layers is a parse error, as the same id in two Levels is, and a member that matches no package fails `Validate`, as a Levels id does (Task 1).
5. **Unranked counts as level 0**, as in uml-viewer's `place-classes` (l.295), so an unranked box is placed below every box ranked 1 or higher. It need not share a row with the rank-0 boxes: edges can push those lower. On hugo with `zu policy init`'s Levels, the unranked `github.com/gohugoio/hugo#pkg` sits below every sibling ranked above 0 at depths 2 and 3 (Task 12). This only affects layout; an unranked end is still never compared (decisions.md l.22).
6. **`policy` in the View for an `order`-only or Proposals-only Policy.** Amends 06's contract ("absent when the Policy has no rules"): such a View now carries `policy` with `levels: []`. The legend's red swatch and badge note are gated on what is actually drawn, so an `order`-only page shows neither. 04's and 06's goldens are unchanged.
7. **The banner reads "PROPOSAL — not instantiated in code: <name>"**, uml-viewer's text with its em dash (policy.clj l.62). ADR 0008 quotes it with a comma; the lead aligns the ADR at approval.
8. **`regroup` is a page-only View field.** zu never writes it; `proposalView` sets it and `cut.ts` `index` reads it. It keeps the Proposal a View, so no scene code forks.
9. **`order` matches exact ids.** An `order` entry sorts that box or package among its siblings; it does not reorder what is under it. A `#pkg` leaf takes its package's place.
10. **The hidden-violation mark covers both causes:** a violation inside a closed box (depth, collapse) and one lifted to a self-loop by declutter. Both map the violating import's ends the way the canvas does.
11. **The Change View's violations section opens the changed-packages column**, not the header, so the header stays one line. It uses `zu diff`'s wording.
12. **A Change View never draws a Proposal.** Its violations section is zu diff's, under zu.policy.yaml; a Proposal's red edges would contradict it. The select is hidden there, and `knownIds(view).proposal` is false, so a pasted `#p=` link is dropped (Task 9).
13. **Task 7 has no unit test.** Its components only render state the scene computes (Tasks 4 and 5 test that); Task 11 extends 05's browser harness to check them, and Task 10's wiring, in three engines.
14. **The hidden-violation test lives in `policy.test.ts`, not a scene or declutter test file.** It drives the real `scene` with `pinFor`, as 06 tested the red edges, and reproduces 06's acceptance case: depth 3, stages `arrows`, `elements` and `classes`, `ir/bad → cli` lifted to an `internal` self-loop. The mark is computed in `scene.ts`; `declutter.ts` is unchanged.
15. **`order` is applied after layout, by `inOrder`.** ELK keeps model order only where it costs no crossings: six unconnected siblings given as z, y, x, a, b, c were placed x, z, c, y, a, b, and `forceNodeModelOrder`, `considerModelOrder.components` and turning the greedy switch off changed nothing (the reviewer's measurements); `crossingMinimization.strategy: NONE` is rejected with `INCLUDE_CHILDREN`. 04 and 05 draw edges as React Flow `smoothstep` edges between node handles (`Canvas.tsx`), not ELK's bend points, so re-placing nodes moves their lines with them. `inOrder` touches only rows of siblings (vertical extents overlap) that hold an ordered node; those take the ordered ones first, in order, then the rest by id (`sort-ids`), from the row's left edge and `elk.spacing.nodeNode` apart. ELK spaces siblings at least that far apart, so a row never widens past its container.
16. **No ranks from the first Proposal.** uml-viewer's README (l.310–311): "If `:levels` is omitted and `:proposals` is set, rank follows the first proposal's component order." 07 does not do this: a Proposals-only Policy draws the Package Tree unranked until a Proposal is chosen. Ranking the default picture by a Proposal would make a what-if look like the rule, which the glossary rules out ("never the default picture"), and the badges would disagree with `zu check`, which checks no Proposal.

## The contract

**View** (schema `"1"`; every field optional and absent when not used, so 04's and 06's goldens are unchanged):

```json
{
  "policy": {
    "hash": "sha256:…",
    "levels": [["zu/internal/ir"], …],
    "order": ["zu/cmd"],
    "proposals": [{
      "name": "Hexagon",
      "layers": [{"name": "Domain", "members": ["zu/internal/ir"]}, …],
      "omit": ["zu/internal/scan/testdata"],
      "ranks": {"zu/internal/ir": 0, "zu/internal/cli": 2},
      "violations": [{"from": "zu/internal/ir/bad", "to": "zu/internal/cli"}]
    }]
  },
  "violations": {"new": [{"rule": "levels", "from": "…", "to": "…"}], "fixed": [], "known": 0}
}
```

- `policy` is written when the Policy has rules, an `order` or Proposals. `order` is the normalised list; `proposals` keep the Policy's sequence.
- `proposals[].layers[].members`: unique within a Proposal, and each must match a package (`Validate`).
- `proposals[].ranks`: the layer index (inner first) of every package the Proposal ranks after `omit`; `violations`: sorted `imports` pairs from a lower layer to a higher one, `edge-kinds` exemptions applied.
- `violations` (Change View only, when the Policy has rules): the same delta `zu diff -format json` writes.

**Page:**
- Box and container nodes carry the rolled `rank` as a badge at the upper left; higher ranks sit above lower ones.
- In a row of siblings that holds an ordered one, the ordered siblings come first, in `order`, then the rest by id.
- A drawn box that hides a violating import has a red border; selecting it lists the hidden pairs first, `levels` before `cycle`.
- A `proposal` select appears when the Policy has Proposals, except in a Change View. The URL hash adds `p=<name>`, after every other key. A Proposal draws under the banner, with its ranks and violations, and the legend names it.
- The Change View's column opens with "New violations (N)" or "No new violations", then "F fixed, K pre-existing".

---

# Tasks

### Task 1: `policy.ForProposal`: the Policy a Proposal is checked under

ADR 0008: a Proposal's "violations are re-evaluated for it". 06 parses, validates and hashes `proposals` but has no way to evaluate one. `ForProposal` derives a Policy from p: the layers, inner first, become the Levels; the Proposal's `omit` joins p's lens; `edge-kinds` still exempt; cycles are off (Deviation 3). `RankOf`, `Check` and `EdgeRules` then work unchanged, so the rule has one implementation.

Proposal members are held to the Levels' standard: parsing rejects a member listed in two layers of one Proposal (as it rejects an id in two Levels; the hash is unaffected), and `Validate` reports a member that matches no package, so `zu check` exits 3 on a typo in a Proposal as it does on one in the Levels (Deviation 4).

**Files:**
- Create: `internal/policy/proposal.go`, `internal/policy/proposal_test.go`
- Modify: `internal/policy/policy.go`, `internal/policy/levels.go`

**Steps:**

- [x] **Write the failing test**

<!-- file: internal/policy/proposal_test.go -->
```go
package policy

import (
	"slices"
	"strings"
	"testing"
)

const proposalSrc = `levels: [m/domain, m/app, m/cmd]
cycles: true
omit: [m/util]
edge-kinds: [{from: m/app, to: m/cmd, kind: association}]
proposals:
  - name: Flipped
    layers:
      - {name: Core, members: [m/app]}
      - {name: Edge, members: [m/domain, m/cmd]}
      - {name: Model, members: [m/domain/model]}
    omit: [m/cmd]
`

func TestForProposalRanksTheLayersInnerFirst(t *testing.T) {
	p := mustParse(t, proposalSrc)
	q, ok := p.ForProposal("Flipped")
	if !ok {
		t.Fatal("Flipped not found")
	}
	for id, want := range map[string]int{"m/app": 0, "m/domain": 1, "m/cmd": 1, "m/domain/model": 2} {
		if got, ok := q.RankOf(id); !ok || got != want {
			t.Errorf("RankOf(%q) = %d, %v; want %d", id, got, ok, want)
		}
	}
	if q.Cycles || !slices.Equal(q.Omit, []string{"m/cmd", "m/util"}) || len(q.EdgeKinds) != 1 {
		t.Errorf("ForProposal = %+v: want no cycles, both omits, the edge kinds", q)
	}
	if !q.Omitted("m/cmd/x") || q.Omitted("m/cmdx") || p.Omitted("m/cmd") {
		t.Error("Omitted covers the Proposal's omit by whole segments, and only there")
	}
	if _, ok := p.ForProposal("Nope"); ok {
		t.Error("an unknown Proposal is not found")
	}
}

func TestProposalViolationsAreReEvaluated(t *testing.T) {
	q, _ := mustParse(t, proposalSrc).ForProposal("Flipped")
	doc := layered("m/domain>m/app", "m/app>m/domain", "m/domain>m/domain/model", "m/app>m/cmd")
	got := q.Check(doc)
	want := []Violation{{RuleLevels, "m/app", "m/domain"}, {RuleLevels, "m/domain", "m/domain/model"}}
	if !slices.Equal(got, want) {
		t.Fatalf("Check = %v, want %v (m/cmd is omitted by the Proposal)", got, want)
	}
}

func TestParseRejectsAMemberInTwoLayers(t *testing.T) {
	_, err := Parse([]byte("proposals:\n  - name: P\n    layers:\n      - {name: A, members: [m/app]}\n      - {name: B, members: [m/cmd, m/app]}\n"))
	if err == nil || !strings.Contains(err.Error(), `proposals[0].layers[1]: "m/app" is already in layers[0]`) {
		t.Fatalf("Parse = %v", err)
	}
}

func TestValidateRejectsAProposalMemberThatMatchesNothing(t *testing.T) {
	p := mustParse(t, "levels: [m/domain]\nproposals: [{name: P, layers: [{name: A, members: [m/app]}, {name: B, members: [m/domian]}]}]\n")
	err := p.Validate(layered())
	if err == nil || !strings.Contains(err.Error(), `proposals[0].layers[1]: "m/domian" matches no package`) {
		t.Fatalf("Validate = %v", err)
	}
}
```

- [x] **Run:** `go test ./internal/policy` Expected: FAIL (`ForProposal` undefined)

- [x] **Implement**

<!-- file: internal/policy/proposal.go -->
```go
package policy

// ForProposal is the Policy a Proposal is drawn and checked under (ADR 0008:
// "violations are re-evaluated for it"): p's lens with the Proposal's omit
// added, and its layers, inner first, as the Levels. A package in two layers
// takes the deeper member's layer, as RankOf does. Cycles are not checked:
// they are arcs between Package Tree boxes, which a Proposal regroups
// (uml-viewer's restamp-ranks, policy.clj l.231, restamps Levels only).
func (p *Policy) ForProposal(name string) (*Policy, bool) {
	n := p.Normalize()
	for _, pr := range n.Proposals {
		if pr.Name != name {
			continue
		}
		q := &Policy{
			Foreign: n.Foreign, Omit: set(append(append([]string{}, n.Omit...), pr.Omit...)),
			OmitEdges: n.OmitEdges, EdgeKinds: n.EdgeKinds,
		}
		for _, l := range pr.Layers {
			q.Levels = append(q.Levels, Level(l.Members))
		}
		return q, true
	}
	return nil, false
}

// Omitted reports whether the Policy omits id: id lies under an omit entry.
func (p *Policy) Omitted(id string) bool {
	return underAny(id, p.Omit)
}
```

```diff
--- a/internal/policy/levels.go
+++ b/internal/policy/levels.go
@@ -92,23 +92,33 @@ func packageIDs(doc *ir.IR) map[string]bool {
 	return out
 }
 
-// Validate reports a Levels id that ranks no package of doc: almost always
-// a typo, and a rule that silently checks nothing.
+// Validate reports a Levels id or a Proposal member that ranks no package of
+// doc: almost always a typo, and a rule that silently checks nothing.
 func (p *Policy) Validate(doc *ir.IR) error {
 	pkgs := packageIDs(doc)
+	ranks := func(l string) bool {
+		for id := range pkgs {
+			if under(id, l) {
+				return true
+			}
+		}
+		return false
+	}
 	for i, lv := range p.Levels {
 		for _, l := range lv {
-			found := false
-			for id := range pkgs {
-				if under(id, l) {
-					found = true
-					break
-				}
-			}
-			if !found {
+			if !ranks(l) {
 				return fmt.Errorf("%s: levels[%d]: %q matches no package", FileName, i, l)
 			}
 		}
 	}
+	for i, pr := range p.Proposals {
+		for j, l := range pr.Layers {
+			for _, m := range l.Members {
+				if !ranks(m) {
+					return fmt.Errorf("%s: proposals[%d].layers[%d]: %q matches no package", FileName, i, j, m)
+				}
+			}
+		}
+	}
 	return nil
 }
--- a/internal/policy/policy.go
+++ b/internal/policy/policy.go
@@ -171,6 +171,7 @@ func (p *Policy) validate() error {
 		if len(pr.Layers) == 0 {
 			return fmt.Errorf("proposals[%d]: no layers", i)
 		}
+		in := map[string]int{}
 		for j, l := range pr.Layers {
 			if l.Name == "" || len(l.Members) == 0 {
 				return fmt.Errorf("proposals[%d].layers[%d]: want a name and members", i, j)
@@ -179,6 +180,10 @@ func (p *Policy) validate() error {
 				if err := checkID(id); err != nil {
 					return fmt.Errorf("proposals[%d].layers[%d]: %w", i, j, err)
 				}
+				if k, dup := in[id]; dup {
+					return fmt.Errorf("proposals[%d].layers[%d]: %q is already in layers[%d]", i, j, id, k)
+				}
+				in[id] = j
 			}
 		}
 		for _, id := range pr.Omit {
```

- [x] **Run:** `go test ./internal/policy` Expected: PASS

### Task 2: The View carries `order` and the Proposals

06's `PolicyInfo` has only `hash` and `levels`, and `Mark` returns early unless the Policy has rules (`Rules()`: Levels or cycles). 07 needs two more fields, both optional so every 04 and 06 golden stays byte-identical:

- `order`: the normalised `order` list, drawn in Task 6;
- `proposals`: per Proposal its layers, its `omit`, the layer (rank) of every package it ranks, and its violating package imports, from `ForProposal` (Task 1). The UI never evaluates a rule.

`Mark` now also writes `policy` for a Policy with only an `order` or only Proposals (Deviation 6). `TestMarkWithoutRulesAddsNothing` (a `foreign`-only Policy) still holds.

**Files:**
- Modify: `internal/export/policy.go`, `internal/export/policy_test.go`

**Steps:**

- [x] **Write the failing test**

```diff
--- a/internal/export/policy_test.go
+++ b/internal/export/policy_test.go
@@ -71,3 +71,39 @@ func TestMarkWithoutRulesAddsNothing(t *testing.T) {
 		t.Fatal("a Policy with no rules must leave the View (and 04's goldens) unchanged")
 	}
 }
+
+func TestMarkCarriesOrderAndProposals(t *testing.T) {
+	doc := shopIR(t)
+	pol, err := policy.Parse([]byte(`order: [example.com/shop/internal/store, example.com/shop/internal]
+proposals:
+  - name: Store first
+    layers:
+      - {name: Store, members: [example.com/shop/internal/store]}
+      - {name: Rest, members: [example.com/shop/internal]}
+    omit: [example.com/shop/tools]
+`))
+	if err != nil {
+		t.Fatal(err)
+	}
+	v, err := Project(pol.Apply(doc), nil, nil)
+	if err != nil {
+		t.Fatal(err)
+	}
+	Mark(v, pol, doc)
+	got, _ := json.Marshal(v.Policy)
+	want := `{"hash":"` + pol.Hash() + `","levels":[],` +
+		`"order":["example.com/shop/internal/store","example.com/shop/internal"],` +
+		`"proposals":[{"name":"Store first",` +
+		`"layers":[{"name":"Store","members":["example.com/shop/internal/store"]},{"name":"Rest","members":["example.com/shop/internal"]}],` +
+		`"omit":["example.com/shop/tools"],` +
+		`"ranks":{"example.com/shop/internal/checkout":1,"example.com/shop/internal/money":1,"example.com/shop/internal/store":0},` +
+		`"violations":[{"from":"example.com/shop/internal/store","to":"example.com/shop/internal/money"}]}]}`
+	if string(got) != want {
+		t.Fatalf("Policy =\n%s\nwant\n%s", got, want)
+	}
+	for _, e := range v.Edges {
+		if e.Violation != "" {
+			t.Errorf("a Policy without rules marks no edge: %+v", e)
+		}
+	}
+}
```

- [x] **Run:** `go test ./internal/export` Expected: FAIL (`Policy = null`)

- [x] **Implement**

```diff
--- a/internal/export/policy.go
+++ b/internal/export/policy.go
@@ -1,26 +1,45 @@
 package export
 
 import (
+	"cmp"
+	"slices"
+
 	"zu/internal/ir"
 	"zu/internal/policy"
 )
 
-// PolicyInfo is what the UI needs of the Policy: its hash and its Levels,
-// inner first.
+// PolicyInfo is what the UI needs of the Policy: its hash, its Levels inner
+// first, the sibling order and the Proposals (07).
 type PolicyInfo struct {
-	Hash   string     `json:"hash"`
-	Levels [][]string `json:"levels"`
+	Hash      string         `json:"hash"`
+	Levels    [][]string     `json:"levels"`
+	Order     []string       `json:"order,omitempty"`
+	Proposals []ProposalInfo `json:"proposals,omitempty"`
+}
+
+// ProposalInfo is one Proposal as the UI draws it: its layers inner first,
+// the ids it omits, the layer (rank) of every package it ranks and the
+// package imports that break its layering. Unranked, unomitted packages are
+// drawn as Unassigned.
+type ProposalInfo struct {
+	Name       string         `json:"name"`
+	Layers     []policy.Layer `json:"layers"`
+	Omit       []string       `json:"omit,omitempty"`
+	Ranks      map[string]int `json:"ranks"`
+	Violations []policy.Pair  `json:"violations"`
 }
 
-// Mark adds the Policy's rules to a View built from pol.Apply(doc): the
-// rank of every ranked package and the rule each violating import breaks.
-// A Policy without rules adds nothing, so a View without rules is 04's.
+// Mark adds the Policy to a View built from pol.Apply(doc): the rank of
+// every ranked package, the rule each violating import breaks, the order
+// and the Proposals. A Policy with none of these adds nothing, so a View
+// without them is 04's.
 func Mark(v *View, pol *policy.Policy, doc *ir.IR) {
-	if !pol.Rules() {
+	norm := pol.Normalize()
+	if !pol.Rules() && len(norm.Order) == 0 && len(norm.Proposals) == 0 {
 		return
 	}
-	v.Policy = &PolicyInfo{Hash: pol.Hash(), Levels: [][]string{}}
-	for _, l := range pol.Normalize().Levels {
+	v.Policy = &PolicyInfo{Hash: pol.Hash(), Levels: [][]string{}, Order: norm.Order}
+	for _, l := range norm.Levels {
 		v.Policy.Levels = append(v.Policy.Levels, l)
 	}
 	for i := range v.Nodes {
@@ -39,4 +58,27 @@ func Mark(v *View, pol *policy.Policy, doc *ir.IR) {
 			e.Violation = rules[policy.Pair{From: e.From, To: e.To}]
 		}
 	}
+	for _, pr := range norm.Proposals {
+		v.Policy.Proposals = append(v.Policy.Proposals, proposalInfo(v, pol, pr, doc))
+	}
+}
+
+func proposalInfo(v *View, pol *policy.Policy, pr policy.Proposal, doc *ir.IR) ProposalInfo {
+	q, _ := pol.ForProposal(pr.Name)
+	info := ProposalInfo{Name: pr.Name, Layers: pr.Layers, Omit: pr.Omit, Ranks: map[string]int{}, Violations: []policy.Pair{}}
+	for _, n := range v.Nodes {
+		if n.Kind != string(ir.KindPackage) || q.Omitted(n.ID) {
+			continue
+		}
+		if r, ok := q.RankOf(n.ID); ok {
+			info.Ranks[n.ID] = r
+		}
+	}
+	for p := range q.EdgeRules(doc) {
+		info.Violations = append(info.Violations, p)
+	}
+	slices.SortFunc(info.Violations, func(a, b policy.Pair) int {
+		return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To))
+	})
+	return info
 }
```

- [x] **Run:** `go test ./internal/export ./internal/cli` Expected: PASS

### Task 3: The Change View carries the violation delta

06's `zu diff` prints the violation delta (`Summary.Violations`, `cli/diff.go`), but 06's View never carries it: `export.Change` reads only the Summary's affected and changed packages. 07 adds an optional top-level `violations` (`diff.ViolationDelta`: `new`, `fixed`, `known`) to the View, taken from the Summary zu diff printed. `writeChangeHTML` re-summarises the lensed IRs when the Policy has a lens, so the delta is read before that. Task 10 draws it.

**Files:**
- Modify: `internal/export/view.go`, `internal/cli/html.go`, `internal/cli/policy_html_test.go`

**Steps:**

- [x] **Write the failing test**, without and with a lens

```diff
--- a/internal/cli/policy_html_test.go
+++ b/internal/cli/policy_html_test.go
@@ -62,3 +62,34 @@ func TestDiffHTMLDrawsTheLensAndTheViolations(t *testing.T) {
 			strings.Contains(s, `"violation":"levels"`), !strings.Contains(s, "example.com/m/gone"))
 	}
 }
+
+// 07: the View carries zu diff's violation delta, for the Change View's "new
+// violations first", with or without a lens (06's View never carried it).
+func TestDiffHTMLCarriesTheViolationDelta(t *testing.T) {
+	withUI(t)
+	needGit(t)
+	for _, extra := range []string{"", "omit: [example.com/m/gone]\n"} {
+		dir := repo(t, map[string]string{
+			"go.mod":        "module example.com/m\n",
+			"a/a.go":        "package a\n",
+			"gone/gone.go":  "package gone\n",
+			policy.FileName: "levels: [example.com/m/b, example.com/m/a]\n" + extra,
+		})
+		git(t, dir, "init", "-q", "-b", "main")
+		git(t, dir, "add", "-A")
+		git(t, dir, "commit", "-q", "-m", "base")
+		git(t, dir, "checkout", "-q", "-b", "feat")
+		writeFile(t, dir, "b/b.go", "package b\n\nimport _ \"example.com/m/a\"\n")
+		git(t, dir, "add", "-A")
+		git(t, dir, "commit", "-q", "-m", "add b")
+		t.Chdir(dir)
+		out := filepath.Join(t.TempDir(), "change.html")
+		if code, _, errOut := run("diff", "main", "-html", out); code != ExitViolation {
+			t.Fatalf("lens %v: exit %d: %s", extra != "", code, errOut)
+		}
+		want := `"violations":{"new":[{"rule":"levels","from":"example.com/m/b","to":"example.com/m/a"}],"fixed":[],"known":0}`
+		if !strings.Contains(readFile(t, out), want) {
+			t.Errorf("lens %v: Change View lacks %s", extra != "", want)
+		}
+	}
+}
```

- [x] **Run:** `go test ./internal/cli -run TestDiffHTMLCarriesTheViolationDelta` Expected: FAIL (`lens false: Change View lacks "violations"…`)

- [x] **Implement**

```diff
--- a/internal/cli/html.go
+++ b/internal/cli/html.go
@@ -120,6 +120,7 @@ type changeSides struct {
 // head, and at the host's compare page when both sides are clean commits.
 func writeChangeHTML(ctx context.Context, c changeSides, sum *diff.Summary, o *htmlOptions, stderr io.Writer) error {
 	base, head := c.base, c.head
+	violations := sum.Violations
 	if c.pol.Lens() {
 		// The View draws both sides as the Policy does, so its changed list
 		// must come from the same IRs; the printed Summary stays whole.
@@ -131,6 +132,7 @@ func writeChangeHTML(ctx context.Context, c changeSides, sum *diff.Summary, o *h
 		return err
 	}
 	export.Mark(v, c.pol, c.head)
+	v.Violations = violations
 	for _, t := range []scan.Tree{c.baseTree, c.headTree} {
 		if ct, ok := t.(*gitref.CommitTree); ok && ct.Err() != nil {
 			return ct.Err()
--- a/internal/export/view.go
+++ b/internal/export/view.go
@@ -4,6 +4,7 @@ import (
 	"cmp"
 	"slices"
 
+	"zu/internal/diff"
 	"zu/internal/ir"
 )
 
@@ -26,7 +27,10 @@ type View struct {
 	Honesty Honesty           `json:"honesty"`
 	Changed []string          `json:"changed,omitempty"` // Change View: changed packages, bottom-up
 	Hunks   map[string][]Hunk `json:"hunks,omitempty"`   // Change View: line diffs of changed files
-	Policy  *PolicyInfo       `json:"policy,omitempty"`  // only when the Policy has rules
+	Policy  *PolicyInfo       `json:"policy,omitempty"`  // only when the Policy has rules, an order or Proposals
+	// Violations is the Change View's new, fixed and known violations (07),
+	// from the whole Summary zu diff printed.
+	Violations *diff.ViolationDelta `json:"violations,omitempty"`
 }
 
 // Node is an IR node reduced to what a view draws.
```

- [x] **Run:** `go test ./internal/...` Expected: PASS; 04's and 06's goldens unchanged

### Task 4: Boxes carry their rank

06 puts `rank` on package nodes only. A drawn box is usually a Package Tree segment, so 07 rolls ranks up: a box has the highest rank of the packages under it (uml-viewer `hierarchy.clj` `rolled-level`, l.112; README l.337, "A component inherits the max level of its elements"). A `#pkg` leaf is its own package. The scene puts the rank on box and container nodes; Tasks 6 and 7 lay out and draw it.

This task also adds every 07 View field to `data.ts` (`policy.order`, `policy.proposals`, `violations`) and the page-only `regroup` that Task 8 fills.

**Files:**
- Modify: `web/src/data.ts`, `web/src/policy.ts`, `web/src/scene.ts`, `web/src/policy.test.ts`

**Steps:**

- [x] **Write the failing test**

```diff
--- a/web/src/policy.test.ts
+++ b/web/src/policy.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from "vitest";
-import { pinFor, violating } from "./policy";
+import { pinFor, rolledRanks, violating } from "./policy";
 import { scene } from "./scene";
 import { DEFAULT_STATE } from "./state";
 import { edge, pkgs, view } from "./testkit";
@@ -42,3 +42,29 @@ describe("violations through 05's pin hook", () => {
     expect(sc.edges.some((e) => e.pinned)).toBe(false);
   });
 });
+
+// 07: ranks as 06's View carries them (packages only); boxes roll them up.
+const ranked = {
+  ...v,
+  nodes: [
+    ...v.nodes.map((n) => ({ ...n, rank: n.id.startsWith("m/core") ? 0 : 1 })),
+    ...pkgs(["m/api", "m/util"], "m"),
+  ],
+};
+
+describe("rank badges (07)", () => {
+  it("gives a box the highest rank under it, and unranked boxes none", () => {
+    const r = rolledRanks(ranked);
+    expect([r.get("m"), r.get("m/api"), r.get("m/core"), r.get("m/core/a"), r.get("m/util")]).toEqual([1, 1, 0, 0, undefined]);
+  });
+
+  it("puts the rank on drawn boxes and containers", () => {
+    const sc = scene(ranked, { ...DEFAULT_STATE, depth: 2 }, { pin: pinFor(ranked) });
+    const rank = Object.fromEntries(sc.nodes.map((n) => [n.id, n.rank]));
+    expect(rank).toEqual({ m: 1, "m/api": 1, "m/core": 0, "m/util": undefined });
+    const open = scene(ranked, { ...DEFAULT_STATE, depth: 3 }, { pin: pinFor(ranked) });
+    expect(open.nodes.filter((n) => n.id.startsWith("m/api")).map((n) => [n.id, n.rank])).toEqual([
+      ["m/api", 1], ["m/api#pkg", undefined], ["m/api/h", 1], ["m/api/r", 1],
+    ]);
+  });
+});
```

- [x] **Run:** `cd web && npx vitest run src/policy.test.ts` Expected: FAIL (`rolledRanks is not a function`)

- [x] **Implement**

```diff
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -9,16 +9,29 @@ export type ViewNode = {
 };
 export type ViewEdge = {
   from: string; to: string; kind: "imports" | "calls" | "embeds"; count: number; loc: Loc; status?: string;
-  violation?: "levels" | "cycle"; // 06: the Policy rule this import breaks
+  violation?: Violation["rule"]; // 06: the Policy rule this import breaks
 };
 export type Ref = { commit: string; dirty: boolean };
 export type Hunk = { baseStart: number; baseLines: number; headStart: number; headLines: number; lines: string[] };
+export type Violation = { rule: "levels" | "cycle"; from: string; to: string };
+// Proposal is one of the Policy's Proposals as internal/export writes it (07):
+// layers inner first, the ids it omits, each ranked package's layer and the
+// package imports that break its layering.
+export type Proposal = {
+  name: string; layers: { name: string; members: string[] }[]; omit?: string[];
+  ranks: Record<string, number>; violations: { from: string; to: string }[];
+};
 export type View = {
   schema: string; kind: "project" | "change"; tool: string; head: Ref; base?: Ref; changed?: string[];
   modules: string[]; nodes: ViewNode[]; edges: ViewEdge[]; sources: Record<string, string>;
   links?: { blob: string; compare?: string };
   hunks?: Record<string, Hunk[]>;
-  policy?: { hash: string; levels: string[][] }; // 06: only when the Policy has rules
+  // 06: only when the Policy has rules; 07: or an order or Proposals.
+  policy?: { hash: string; levels: string[][]; order?: string[]; proposals?: Proposal[] };
+  violations?: { new: Violation[]; fixed: Violation[]; known: number }; // 07: Change View only
+  // 07, never written by zu: the box tree a Proposal draws (proposal.ts). cut.ts
+  // index reads parent instead of package ids, and scene.ts labels from label.
+  regroup?: { parent: Record<string, string>; label: Record<string, string> };
   honesty: {
     parseErrors: { path: string; message: string }[]; unresolvedCalls: number;
     unresolvedImports: number; unsupported: Record<string, number>;
--- a/web/src/policy.ts
+++ b/web/src/policy.ts
@@ -2,6 +2,7 @@
 // red when any edge inside it breaks a rule (decisions.md, Levels rule: "a
 // bundled edge is red if any pair inside it is"); internal/export marks the
 // edges, so the UI evaluates no rule itself.
+import { index } from "./cut";
 import type { View } from "./data";
 import { NO_PINS, type Pin } from "./declutter";
 
@@ -9,3 +10,21 @@ export const violating: Pin = (b) => b.members.some((e) => e.violation !== undef
 
 // pinFor is the pin a page passes to scene: none without a Policy.
 export const pinFor = (view: View): Pin => (view.policy ? violating : NO_PINS);
+
+const rolled = new WeakMap<View, Map<string, number>>();
+
+// rolledRanks is every box's rank: a package's own, and for a box the highest
+// rank among the packages under it (uml-viewer hierarchy.clj rolled-level,
+// l.112; README: "a component inherits the max level of its elements").
+export function rolledRanks(view: View): Map<string, number> {
+  const hit = rolled.get(view);
+  if (hit) return hit;
+  const { parent, pkgs } = index(view);
+  const out = new Map<string, number>();
+  for (const p of pkgs) {
+    if (p.rank === undefined) continue;
+    for (let b = p.id; b !== ""; b = parent.get(b) ?? "") out.set(b, Math.max(out.get(b) ?? 0, p.rank));
+  }
+  rolled.set(view, out);
+  return out;
+}
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -4,6 +4,7 @@ import type { View } from "./data";
 import { autoDepth, childrenOf, cmp, cut, declsOf, index, isBox, leafOf, OUTSIDE, packagesIn, PKG } from "./cut";
 import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
 import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
+import { rolledRanks } from "./policy";
 import { withinHops } from "./select";
 import type { Known, Stage, ViewState } from "./state";
 
@@ -16,6 +17,7 @@ export type SceneNode = {
   mark?: Mark; // incoming/outgoing triangles, when lines are hidden
   change?: string; // the Change View class (change.ts nodeMark, or "has-change")
   rowMarks?: string[]; // the Change View class of each method row
+  rank?: number; // 07: the Policy rank of a box, rolled up (policy.ts rolledRanks)
 };
 export type SceneEdge = {
   id: string; from: string; to: string; pairs: number; members: Bundle["members"];
@@ -118,6 +120,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     return c.decls ? "decl" : "box";
   };
 
+  const ranks = rolledRanks(view);
   const nodes: SceneNode[] = [...ids].sort(cmp).map((id) => {
     const parent = up(id);
     const n: SceneNode = {
@@ -132,6 +135,10 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     else if (n.shape === "box" && !folds.has(id) && !id.endsWith(PKG) && childrenOf(view, id).length > 0) n.toggle = "expand";
     const m = d.lines ? undefined : d.marks.get(id);
     if (m) n.mark = m;
+    // A "#pkg" leaf is its own package; any other box rolls up what it holds.
+    const r = n.shape !== "box" && n.shape !== "container" ? undefined
+      : id.endsWith(PKG) ? node.get(id.slice(0, -PKG.length))?.rank : ranks.get(id);
+    if (r !== undefined) n.rank = r;
     return n;
   });
   const row = view.kind === "change" ? markChanges(view, c.decls, nodes, d.rows, s.selected) : null;
```

- [x] **Run:** `cd web && npx tsc --noEmit && npx vitest run` Expected: tsc clean; every vitest file passes

### Task 5: A violation hidden inside a box marks the box

06's acceptance found it: at the root with depth 3, the declutter stages `arrows`, `elements` and `classes` lift `ir/bad → cli` to a `zu/internal → zu/internal` self-loop, and 05 Deviation 1 drops self-loops, so the violation vanishes. The same happens without declutter when both ends sit inside one closed box (`bundlesOver` drops an edge inside one leaf). Either way decisions.md's "violations stay red" breaks.

The scene now maps every violating import's ends the way the drawing does (the leaf, then `shown`, then declutter's `lift`). When both land on one drawn node, that node gets `hidden`: the violating edges it holds, `levels` first, then `cycle`, each sorted by `from` and `to`. One bad import can close many cycle arcs (zu's own acceptance: 1 levels, 17 cycle), and the levels one is the one to read first. Task 7 draws the mark red, like 04's `has-change`, and the panel lists them.

The test drives the real `scene` with 06's `pinFor`, as 06 tested red edges, and reproduces 06's acceptance case at depth 3 in every stage that lifts: `arrows`, `triangles`, `elements` and `classes` (Deviation 14).

**Files:**
- Modify: `web/src/scene.ts`, `web/src/policy.test.ts`

**Steps:**

- [x] **Write the failing test**

```diff
--- a/web/src/policy.test.ts
+++ b/web/src/policy.test.ts
@@ -68,3 +68,37 @@ describe("rank badges (07)", () => {
     ]);
   });
 });
+
+// 06 acceptance: at the root, ir/bad → cli lifts to a zu/internal self-loop,
+// which 05 Deviation 1 drops, and the violation vanished.
+const bad = {
+  ...view(pkgs(["m/cmd", "m/internal/cli", "m/internal/ir", "m/internal/ir/bad"], "m"), [
+    edge("m/cmd", "m/internal/cli"),
+    { ...edge("m/internal/cli", "m/internal/ir"), violation: "cycle" as const },
+    { ...edge("m/internal/ir/bad", "m/internal/cli"), violation: "levels" as const },
+  ]),
+  policy: { hash: "sha256:p", levels: [["m/internal/ir"], ["m/internal/cli"]] },
+};
+
+describe("violations hidden inside a box (07)", () => {
+  const hidden = (depth: number, stage: (typeof DEFAULT_STATE)["stage"]) =>
+    scene(bad, { ...DEFAULT_STATE, depth, stage }, { pin: pinFor(bad) }).nodes
+      .filter((n) => n.hidden)
+      .map((n) => [n.id, n.hidden!.map((e) => `${e.violation} ${e.from}→${e.to}`)]);
+  // Levels first: the cycle arcs of one bad import can outnumber it.
+  const both = [["m/internal", ["levels m/internal/ir/bad→m/internal/cli", "cycle m/internal/cli→m/internal/ir"]]];
+
+  it("marks the box when both ends are inside it at this depth", () => {
+    expect(hidden(2, "full")).toEqual(both);
+  });
+
+  it("marks the container when declutter lifts the violation to a self-loop", () => {
+    for (const stage of ["arrows", "triangles", "elements", "classes"] as const) {
+      expect(hidden(3, stage), stage).toEqual(both);
+    }
+  });
+
+  it("marks nothing while the violation is drawn as a red edge", () => {
+    expect(hidden(3, "full")).toEqual([]);
+  });
+});
```

- [x] **Run:** `cd web && npx vitest run src/policy.test.ts` Expected: FAIL (two tests: `hidden` is never set)

- [x] **Implement**

```diff
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -1,6 +1,6 @@
 // scene is the one pure function the canvas draws: View + ViewState → nodes and edges.
 import { nodeMark, unchangedCount } from "./change";
-import type { View } from "./data";
+import type { View, ViewEdge } from "./data";
 import { autoDepth, childrenOf, cmp, cut, declsOf, index, isBox, leafOf, OUTSIDE, packagesIn, PKG } from "./cut";
 import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
 import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
@@ -18,6 +18,7 @@ export type SceneNode = {
   change?: string; // the Change View class (change.ts nodeMark, or "has-change")
   rowMarks?: string[]; // the Change View class of each method row
   rank?: number; // 07: the Policy rank of a box, rolled up (policy.ts rolledRanks)
+  hidden?: ViewEdge[]; // 07: violating imports with both ends inside this node, so no line shows them
 };
 export type SceneEdge = {
   id: string; from: string; to: string; pairs: number; members: Bundle["members"];
@@ -141,6 +142,11 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     if (r !== undefined) n.rank = r;
     return n;
   });
+  if (!c.decls) markHidden(view, nodes, (id) => {
+    const l = toLeaf(id);
+    const at = l === OUTSIDE ? null : d.lift(shown(l));
+    return at !== null && ids.has(at) ? at : null;
+  });
   const row = view.kind === "change" ? markChanges(view, c.decls, nodes, d.rows, s.selected) : null;
   if (row !== null) {
     selected = row.selected;
@@ -165,6 +171,24 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   };
 }
 
+// markHidden marks each drawn node that holds both ends of a violating import
+// (07). Such an import has no line: bundlesOver drops an edge inside one leaf,
+// and declutter a bundle it lifts to a self-loop (05 Deviation 1). The mark
+// keeps "violations stay red" true at every depth and stage. Levels come
+// first: one bad import can close many cycle arcs.
+function markHidden(view: View, nodes: SceneNode[], drawn: (pkg: string) => string | null) {
+  const byId = new Map(nodes.map((n) => [n.id, n]));
+  for (const e of view.edges) {
+    if (e.violation === undefined || e.kind !== "imports") continue;
+    const at = drawn(e.from);
+    if (at === null || at !== drawn(e.to)) continue;
+    const n = byId.get(at)!;
+    (n.hidden ??= []).push(e);
+  }
+  const first = (e: ViewEdge) => (e.violation === "levels" ? 0 : 1);
+  for (const n of nodes) n.hidden?.sort((a, b) => first(a) - first(b) || cmp(a.from, b.from) || cmp(a.to, b.to));
+}
+
 // markChanges is 04 Part B's Change View marking (Q4), unchanged: each node
 // gets its Change View class, and every changed package drawn as a box opens
 // onto its changed declarations with a "+N unchanged" chip. A box that folds
```

- [x] **Run:** `cd web && npx tsc --noEmit && npx vitest run` Expected: PASS

### Task 6: Level 0 at the bottom, and `order`

decisions.md's Levels rule says "level 0 drawn at the bottom"; uml-viewer's `layout.clj` `place-classes` (l.286–298) groups boxes by level, highest first, and counts an unleveled box as level 0. `order` puts listed siblings first, then the rest by name (`hierarchy.clj` `sort-ids`, l.57).

- **Order:** the scene gives a box its index in `order` (exact id; a `#pkg` leaf is its package), and `elkGraph` sorts each container's children by it. That alone does not reach the drawing: ELK keeps model order only where it costs no crossings. Six unconnected siblings given as z, y, x, a, b, c came out x, z, c, y, a, b, and no ordering option changed that (Deviation 15). So `inOrder`, after layout, re-places each row of siblings that holds an ordered node: the ordered ones in order, then the rest by id (`sort-ids`), from the row's left edge, `elk.spacing.nodeNode` apart. Rows without an ordered node keep ELK's placement. Lines follow, because 04 and 05 draw edges as React Flow `smoothstep` edges between the nodes' handles (`Canvas.tsx`), never ELK's routes. The page applies it where it reads ELK's result (`App.tsx`).
- **Levels:** 06 left ELK partitioning unverified, and zu cannot use it (Deviation 1): in elkjs 0.12 it orders a flat graph, but inside compound nodes with `INCLUDE_CHILDREN`, which zu needs, it is ignored. On zu's own View at depth 3, `version` (rank 0) landed level with `export` (rank 4). So `elkGraph` orders ranks itself. In every container, between each two ranks present among the siblings it adds an invisible zero-size step node, with edges from each sibling of the higher rank to it and from it to each of the lower: O(n) edges. A drawn edge that climbs the ranks between the siblings under its lowest common container is left out of ELK's input (Deviation 2), so it cannot fight those steps; the canvas still draws it. `positions` drops the steps.
- Nothing changes when no node is ranked or ordered, so every 04 and 05 layout stays as it was.

**Files:**
- Modify: `web/src/layout.ts`, `web/src/scene.ts`, `web/src/App.tsx`, `web/src/layout.test.ts`

**Steps:**

- [x] **Write the failing test.** It covers zu's own layering, where partitioning failed; an edge that climbs only inside two siblings of one rank (it stays in ELK's input and forms a cycle with their inner steps, which ELK breaks); and the six siblings above, on positions.

```diff
--- a/web/src/layout.test.ts
+++ b/web/src/layout.test.ts
@@ -3,9 +3,10 @@ import ELK from "elkjs/lib/elk.bundled.js";
 import type { ElkNode } from "elkjs/lib/elk-api";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
 import { parseView } from "./data";
-import { absolute, elkGraph, layout, sizeOf, superseding, Superseded, triangles, type Stoppable } from "./layout";
+import { absolute, elkGraph, inOrder, layout, orderOf, positions, sizeOf, superseding, Superseded, triangles, type Stoppable } from "./layout";
 import { scene } from "./scene";
 import { DEFAULT_STATE } from "./state";
+import { edge, pkgs, view } from "./testkit";
 
 const v = parseView(JSON.stringify(golden));
 const elk = new ELK();
@@ -38,6 +39,99 @@ describe("layout", () => {
   });
 });
 
+// 07: m/core is rank 0, m/api rank 1; m/core/u and m/x are unranked, which
+// uml-viewer draws as level 0 (layout.clj place-classes l.293).
+const levels = {
+  ...view(
+    [
+      ...pkgs(["m/api/h"], "m", { rank: 1 }),
+      ...pkgs(["m/core/a"], "m", { rank: 0 }),
+      ...pkgs(["m/core/u", "m/x"], "m"),
+    ],
+    [edge("m/api/h", "m/core/a"), { ...edge("m/core/a", "m/api/h"), violation: "levels" as const }],
+  ),
+  policy: { hash: "sha256:p", levels: [["m/core"], ["m/api"]], order: ["m/x", "m/core"] },
+};
+
+describe("levels and order (07)", () => {
+  it("draws level 0 at the bottom, inside containers too, whichever way edges point", async () => {
+    const a = await layout(scene(levels, { ...DEFAULT_STATE, depth: 3 }), elk);
+    const y = (id: string) => absolute(a, id)!.y;
+    expect(y("m/api")).toBeLessThan(y("m/core"));
+    expect(y("m/api/h")).toBeLessThan(y("m/core/a"));
+    expect(y("m/core/u")).toBe(y("m/core/a")); // unranked: level 0
+    expect(y("m/x")).toBeGreaterThan(y("m/api")); // unranked: level 0
+    expect(absolute(a, "m/x")!.x).toBeLessThan(absolute(a, "m/core")!.x); // order: [m/x, m/core]
+  });
+
+  it("steps between ranks, and leaves edges that climb the ranks out of the layout", () => {
+    const g = elkGraph(scene(levels, { ...DEFAULT_STATE, depth: 3 }));
+    const m = g.children![0];
+    expect(m.children!.map((c) => c.id)).toEqual(["m/x", "m/core", "m/api", "__rank:m:1"]);
+    expect(g.edges!.map((e) => e.id)).toEqual([
+      "m/api/h→m/core/a", "__rank:m:1→m/x", "__rank:m:1→m/core", "m/api→__rank:m:1",
+    ]);
+    expect(JSON.stringify(elkGraph(scene(v, DEFAULT_STATE)))).not.toContain("__rank");
+  });
+
+  it("never places a higher rank below a lower one on zu's own layering", async () => {
+    // zu's 06 acceptance layering at depth 3: eight siblings in zu/internal,
+    // edges between most of them, some pointing up. ELK partitioning put
+    // version (0) level with export (4); the steps must not.
+    const ranks: Record<string, number> = { cli: 5, diff: 3, export: 4, gitref: 2, ir: 0, policy: 2, scan: 1, version: 0 };
+    const ids = Object.keys(ranks).map((k) => `z/internal/${k}`);
+    const zu = view(ids.map((id) => ({ ...pkgs([id], "z")[0], rank: ranks[id.slice(11)] })), [
+      edge("z/internal/cli", "z/internal/export"), edge("z/internal/cli", "z/internal/version"),
+      edge("z/internal/export", "z/internal/diff"), edge("z/internal/diff", "z/internal/policy"),
+      edge("z/internal/policy", "z/internal/scan"), edge("z/internal/scan", "z/internal/ir"),
+      edge("z/internal/gitref", "z/internal/ir"), { ...edge("z/internal/ir", "z/internal/cli"), violation: "levels" },
+    ]);
+    const a = await layout(scene(zu, { ...DEFAULT_STATE, depth: 3 }), elk);
+    const y = (k: string) => absolute(a, `z/internal/${k}`)!.y;
+    for (const p of Object.keys(ranks)) for (const q of Object.keys(ranks)) {
+      if (ranks[p] > ranks[q]) expect(y(p), `${p} above ${q}`).toBeLessThan(y(q));
+    }
+    expect([...a.keys()].some((id) => id.startsWith("__rank"))).toBe(false);
+  });
+
+  it("keeps edges that climb only inside siblings of one rank, and still ranks inside them", async () => {
+    // m/a and m/b both roll up to rank 1, and each imports up into the other:
+    // the edges do not climb between m/a and m/b, so they stay in the input,
+    // where with the steps inside m/a and m/b they form a cycle ELK breaks.
+    const x = view(
+      [...pkgs(["m/a/hi", "m/b/hi"], "m", { rank: 1 }), ...pkgs(["m/a/lo", "m/b/lo"], "m", { rank: 0 })],
+      [{ ...edge("m/a/lo", "m/b/hi"), violation: "levels" }, { ...edge("m/b/lo", "m/a/hi"), violation: "levels" }],
+    );
+    const sc = scene(x, { ...DEFAULT_STATE, depth: 3 });
+    expect(elkGraph(sc).edges!.map((e) => e.id)).toEqual(expect.arrayContaining(["m/a/lo→m/b/hi", "m/b/lo→m/a/hi"]));
+    const a = await layout(sc, elk);
+    for (const p of ["m/a", "m/b"]) expect(absolute(a, `${p}/hi`)!.y, p).toBeLessThan(absolute(a, `${p}/lo`)!.y);
+  });
+
+  it("puts ordered siblings first in the input, in the Policy's order, then the rest by id", () => {
+    const m = elkGraph(scene(levels, { ...DEFAULT_STATE, depth: 2 })).children![0];
+    expect(m.children!.map((c) => c.id).filter((id) => !id.startsWith("__rank"))).toEqual(["m/x", "m/core", "m/api"]);
+  });
+
+  it("places ordered siblings first in their row, side by side from the row's left edge", async () => {
+    // ELK alone placed these six unconnected siblings x, z, c, y, a, b.
+    const ids = ["m/a", "m/b", "m/c", "m/x", "m/y", "m/z"];
+    const six = { ...view(pkgs(ids, "m"), []), policy: { hash: "sha256:p", levels: [], order: ["m/z", "m/y", "m/x"] } };
+    const sc = scene(six, { ...DEFAULT_STATE, depth: 2 });
+    const elkOnly = positions(await elk.layout(elkGraph(sc)));
+    const a = await layout(sc, elk);
+    const row = [...ids].sort((p, q) => a.get(p)!.x - a.get(q)!.x);
+    expect(row).toEqual(["m/z", "m/y", "m/x", "m/a", "m/b", "m/c"]);
+    expect(new Set(ids.map((id) => a.get(id)!.y)).size).toBe(1);
+    expect(a.get("m/z")!.x).toBe(Math.min(...ids.map((id) => elkOnly.get(id)!.x)));
+    for (let i = 1; i < row.length; i++) {
+      const [l, r] = [a.get(row[i - 1])!, a.get(row[i])!];
+      expect(r.x - (l.x + l.w), row[i]).toBe(24); // elk.spacing.nodeNode
+    }
+    expect(inOrder(elkOnly, orderOf(scene(v, DEFAULT_STATE)))).toBe(elkOnly); // no order: ELK's placement
+  });
+});
+
 // fake is an engine whose layouts finish when the test says so.
 function fakes() {
   const made: { stopped: boolean; jobs: { resolve: (g: ElkNode) => void; reject: (e: Error) => void }[] }[] = [];
```

- [x] **Run:** `cd web && npx vitest run src/layout.test.ts` Expected: FAIL

- [x] **Implement**

```diff
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -7,7 +7,7 @@ import type { View } from "./data";
 import { pageEngine } from "./engine";
 import { Header } from "./Header";
 import { keyAction } from "./keys";
-import { elkGraph, positions, Superseded, type Placed } from "./layout";
+import { elkGraph, inOrder, orderOf, positions, Superseded, type Placed } from "./layout";
 import { Panel } from "./Panel";
 import { pinFor } from "./policy";
 import { reveal } from "./search";
@@ -112,6 +112,9 @@ export function App({ view: whole }: { view: View }) {
   const engine = useMemo(pageEngine, []);
   useEffect(() => () => engine.dispose(), [engine]);
   const graph = useMemo(() => JSON.stringify(elkGraph(sc)), [sc]);
+  // The Policy's order is a property of the nodes in graph, so a layout of
+  // graph may read the order of any scene that produced it.
+  const order = useMemo(() => orderOf(sc), [sc]);
   const [placed, setPlaced] = useState<{ graph: string; at: Map<string, Placed> } | null>(null);
   const [failed, setFailed] = useState<string | null>(null);
   useEffect(() => {
@@ -121,7 +124,7 @@ export function App({ view: whole }: { view: View }) {
       (out) => {
         performance.mark("zu-layout-end");
         setFailed(null);
-        setPlaced({ graph, at: positions(out) });
+        setPlaced({ graph, at: inOrder(positions(out), order) });
       },
       (e: Error) => {
         if (!(e instanceof Superseded)) setFailed(e.message);
--- a/web/src/layout.ts
+++ b/web/src/layout.ts
@@ -3,6 +3,7 @@
 // View always lays out the same way. The engine is passed in: engine.ts for
 // the page, elk.bundled.js in unit tests.
 import type { ElkNode } from "elkjs/lib/elk-api";
+import { cmp } from "./cut";
 import type { Scene, SceneNode } from "./scene";
 
 export type Placed = { x: number; y: number; w: number; h: number; parent?: string };
@@ -18,18 +19,23 @@ export function sizeOf(n: SceneNode): { w: number; h: number } {
   return { w: Math.min(280, Math.max(90, text * 7.5 + 24)), h: 40 + ROW * n.methods.length };
 }
 
+const GAP = 24; // elk.spacing.nodeNode
+
 const rootOptions = {
   "elk.algorithm": "layered",
   "elk.direction": "DOWN",
   "elk.randomSeed": "1",
   "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
   "elk.hierarchyHandling": "INCLUDE_CHILDREN",
-  "elk.spacing.nodeNode": "24",
+  "elk.spacing.nodeNode": String(GAP),
   "elk.layered.spacing.nodeNodeBetweenLayers": "48",
 };
 
 // elkGraph is the layout input: containers as compound nodes wide enough for
 // their label, leaves sized by sizeOf, and the edges only when lines are drawn.
+// Siblings in the Policy's order come first; inOrder places them. When any
+// node has a rank, level 0 is drawn at the bottom (decisions.md, Levels rule):
+// see ranked below.
 export function elkGraph(sc: Scene): ElkNode {
   const byParent = new Map<string, SceneNode[]>();
   for (const n of sc.nodes) {
@@ -37,6 +43,9 @@ export function elkGraph(sc: Scene): ElkNode {
     if (l) l.push(n);
     else byParent.set(n.parent, [n]);
   }
+  const last = Number.MAX_SAFE_INTEGER;
+  for (const l of byParent.values()) l.sort((a, b) => (a.order ?? last) - (b.order ?? last));
+  const rank = sc.nodes.some((n) => n.rank !== undefined) ? ranked(sc, byParent) : null;
   const build = (n: SceneNode): ElkNode => {
     if (n.shape !== "container") {
       const { w, h } = sizeOf(n);
@@ -49,15 +58,63 @@ export function elkGraph(sc: Scene): ElkNode {
         "elk.nodeSize.constraints": "MINIMUM_SIZE",
         "elk.nodeSize.minimum": `(${Math.min(280, n.label.length * 7.5 + 24)}, 40)`,
       },
-      children: (byParent.get(n.id) ?? []).map(build),
+      children: [...(byParent.get(n.id) ?? []).map(build), ...(rank?.steps.get(n.id) ?? [])],
     };
   };
+  const edges = sc.lines ? sc.edges.filter((e) => rank?.keeps(e) ?? true) : [];
   return {
     id: "__root",
     layoutOptions: rootOptions,
-    children: (byParent.get("") ?? []).map(build),
-    edges: sc.lines ? sc.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })) : [],
+    children: [...(byParent.get("") ?? []).map(build), ...(rank?.steps.get("") ?? [])],
+    edges: [...edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })), ...(rank?.edges ?? [])],
+  };
+}
+
+export const STEP = "__rank:"; // the id prefix of ranked's invisible nodes
+
+// ranked puts siblings with a higher rank above those with a lower one, in
+// every container; unranked nodes count as level 0, as in uml-viewer
+// (layout.clj place-classes, l.293). ELK's own partitioning orders a flat
+// graph but is ignored inside compound nodes with INCLUDE_CHILDREN, which zu
+// needs (measured in elkjs 0.12), so between each two ranks present among
+// siblings ranked adds an invisible zero-size step node, with an edge from
+// every node of the higher rank to it and from it to every node of the lower:
+// O(n) edges. A drawn edge that climbs the ranks between the siblings under
+// its lowest common container (a violation, or an unranked importer) is left
+// out of the layout input, so it cannot fight those steps; the canvas still
+// draws it. An edge that climbs only deeper, inside siblings of one rank,
+// stays in, and ELK breaks the cycle it makes with the inner steps.
+function ranked(sc: Scene, byParent: ReadonlyMap<string, SceneNode[]>) {
+  const byId = new Map(sc.nodes.map((n) => [n.id, n]));
+  const level = (n: SceneNode) => n.rank ?? 0;
+  const steps = new Map<string, ElkNode[]>();
+  const edges: { id: string; sources: string[]; targets: string[] }[] = [];
+  for (const [parent, kids] of byParent) {
+    const levels = [...new Set(kids.map(level))].sort((a, b) => b - a);
+    for (let i = 0; i + 1 < levels.length; i++) {
+      const id = `${STEP}${parent}:${levels[i]}`;
+      steps.set(parent, [...(steps.get(parent) ?? []), { id, width: 0, height: 0 }]);
+      for (const k of kids) {
+        if (level(k) === levels[i]) edges.push({ id: `${k.id}→${id}`, sources: [k.id], targets: [id] });
+        if (level(k) === levels[i + 1]) edges.push({ id: `${id}→${k.id}`, sources: [id], targets: [k.id] });
+      }
+    }
+  }
+  // chain is a node and its containers, outermost first.
+  const chain = (id: string) => {
+    const out: SceneNode[] = [];
+    for (let n = byId.get(id); n; n = byId.get(n.parent)) out.unshift(n);
+    return out;
+  };
+  // keeps: the two sides of the edge under their lowest common container do
+  // not climb the ranks.
+  const keeps = (e: { from: string; to: string }) => {
+    const [a, b] = [chain(e.from), chain(e.to)];
+    let i = 0;
+    while (i < a.length && i < b.length && a[i] === b[i]) i++;
+    return i === a.length || i === b.length || level(a[i]) >= level(b[i]);
   };
+  return { steps, edges, keeps };
 }
 
 // positions flattens ELK's result; x and y are relative to the parent, as
@@ -66,6 +123,7 @@ export function positions(g: ElkNode): Map<string, Placed> {
   const out = new Map<string, Placed>();
   const walk = (n: ElkNode, parent?: string) => {
     for (const c of n.children ?? []) {
+      if (c.id.startsWith(STEP)) continue;
       out.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0, ...(parent ? { parent } : {}) });
       walk(c, c.id);
     }
@@ -74,7 +132,59 @@ export function positions(g: ElkNode): Map<string, Placed> {
   return out;
 }
 
-export const layout = async (sc: Scene, engine: Engine) => positions(await engine.layout(elkGraph(sc)));
+export const layout = async (sc: Scene, engine: Engine) => inOrder(positions(await engine.layout(elkGraph(sc))), orderOf(sc));
+
+// orderOf is each ordered node's index in the Policy's order.
+export const orderOf = (sc: Scene): ReadonlyMap<string, number> =>
+  new Map(sc.nodes.flatMap((n) => (n.order === undefined ? [] : [[n.id, n.order] as const])));
+
+// inOrder applies the Policy's order to placement (07). ELK keeps model order
+// only where it costs no crossings: six unconnected siblings given in the
+// order z, y, x, a, b, c came out x, z, c, y, a, b, whatever ordering options
+// were set. So each row of siblings that holds an ordered node is re-placed
+// left to right, the ordered ones in order, then the rest by id (hierarchy.clj
+// sort-ids, l.57), from the row's left edge and GAP apart. A row never widens:
+// ELK spaces siblings at least GAP apart. Lines follow, because React Flow
+// draws edges from the nodes' handles, not ELK's routes. Other rows keep
+// ELK's placement.
+export function inOrder(placed: Map<string, Placed>, order: ReadonlyMap<string, number>): Map<string, Placed> {
+  if (order.size === 0) return placed;
+  const byParent = new Map<string, string[]>();
+  for (const [id, p] of placed) {
+    const l = byParent.get(p.parent ?? "");
+    if (l) l.push(id);
+    else byParent.set(p.parent ?? "", [id]);
+  }
+  const out = new Map(placed);
+  const last = Number.MAX_SAFE_INTEGER;
+  for (const ids of byParent.values()) {
+    // rows: siblings whose vertical extents overlap share an ELK layer.
+    ids.sort((a, b) => placed.get(a)!.y - placed.get(b)!.y || cmp(a, b));
+    const rows: string[][] = [];
+    let bottom = -Infinity;
+    for (const id of ids) {
+      const p = placed.get(id)!;
+      if (rows.length && p.y < bottom) {
+        rows[rows.length - 1].push(id);
+        bottom = Math.max(bottom, p.y + p.h);
+      } else {
+        rows.push([id]);
+        bottom = p.y + p.h;
+      }
+    }
+    for (const row of rows) {
+      if (!row.some((id) => order.has(id))) continue;
+      let x = Math.min(...row.map((id) => placed.get(id)!.x));
+      row.sort((a, b) => (order.get(a) ?? last) - (order.get(b) ?? last) || cmp(a, b));
+      for (const id of row) {
+        const p = placed.get(id)!;
+        out.set(id, { ...p, x });
+        x += p.w + GAP;
+      }
+    }
+  }
+  return out;
+}
 
 // absolute is a node's position on the canvas: its own plus its parents'.
 export function absolute(placed: ReadonlyMap<string, Placed>, id: string): { x: number; y: number } | null {
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -19,6 +19,7 @@ export type SceneNode = {
   rowMarks?: string[]; // the Change View class of each method row
   rank?: number; // 07: the Policy rank of a box, rolled up (policy.ts rolledRanks)
   hidden?: ViewEdge[]; // 07: violating imports with both ends inside this node, so no line shows them
+  order?: number; // 07: the box's place in the Policy's order; layout.ts draws it before its siblings
 };
 export type SceneEdge = {
   id: string; from: string; to: string; pairs: number; members: Bundle["members"];
@@ -122,6 +123,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   };
 
   const ranks = rolledRanks(view);
+  const order = view.policy?.order ?? [];
   const nodes: SceneNode[] = [...ids].sort(cmp).map((id) => {
     const parent = up(id);
     const n: SceneNode = {
@@ -140,6 +142,8 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     const r = n.shape !== "box" && n.shape !== "container" ? undefined
       : id.endsWith(PKG) ? node.get(id.slice(0, -PKG.length))?.rank : ranks.get(id);
     if (r !== undefined) n.rank = r;
+    const o = order.indexOf(id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
+    if (o >= 0 && n.shape !== "decl") n.order = o;
     return n;
   });
   if (!c.decls) markHidden(view, nodes, (id) => {
```

- [x] **Run:** `cd web && npx tsc --noEmit && npx vitest run` Expected: PASS

### Task 7: Rank badges, the hidden-violation mark and its panel list

The badge sits at the upper left (uml-viewer README l.333, "Class boxes show the current view's rank (innermost 0) at the upper left"). A box with `hidden` violations gets the red `hides-violation` border, and when it is selected the panel lists each hidden pair first, every id a link. These are components; their logic is tested in Tasks 4 and 5, and Task 11's browser harness checks them in three engines.

**Files:**
- Modify: `web/src/Canvas.tsx`, `web/src/Panel.tsx`, `web/src/App.tsx`, `web/src/styles.css`

**Steps:**

- [x] **Implement**

```diff
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -265,6 +265,7 @@ export function App({ view: whole }: { view: View }) {
           id={state.selected}
           edge={edge}
           bundles={sc.bundles}
+          hidden={sc.nodes.find((n) => n.id === sc.selected)?.hidden}
           onReveal={jump}
           onClose={() => choose(null)}
         />
--- a/web/src/Canvas.tsx
+++ b/web/src/Canvas.tsx
@@ -72,15 +72,29 @@ function Toggle({ data }: { data: Data }) {
   );
 }
 
-// cls: the shape, the Change View mark (04 Part B), selection and dimming.
+// cls: the shape, the Change View mark (04 Part B), a violation hidden inside
+// (07), selection and dimming.
 const cls = (base: string, n: SceneNode, selected: boolean) =>
-  `node ${base}${n.change ? ` ${n.change}` : ""}${selected ? " selected" : ""}${n.dim ? " dim" : ""}`;
+  `node ${base}${n.change ? ` ${n.change}` : ""}${n.hidden ? " hides-violation" : ""}${n.rank !== undefined ? " ranked" : ""}` +
+  `${selected ? " selected" : ""}${n.dim ? " dim" : ""}`;
+
+// Rank is the Policy rank at the upper left (uml-viewer README: "Class boxes
+// show the current view's rank (innermost 0) at the upper left").
+function Rank({ node }: { node: SceneNode }) {
+  if (node.rank === undefined) return null;
+  return (
+    <span className="rank" title={`Level ${node.rank} (0 = innermost)`}>
+      {node.rank}
+    </span>
+  );
+}
 
 function BoxNode({ data, selected }: NodeProps<ZNode>) {
   const s = data.stats;
   return (
     <div className={cls("box", data.node, selected)} title={data.node.id}>
       <Ends />
+      <Rank node={data.node} />
       <Toggle data={data} />
       <div className="label">{data.node.label}</div>
       {s && (
@@ -98,6 +112,7 @@ function ContainerNode({ data, selected }: NodeProps<ZNode>) {
   return (
     <div className={cls("container", data.node, selected)} title={data.node.id}>
       <Ends />
+      <Rank node={data.node} />
       <Toggle data={data} />
       <div className="label">{data.node.label}</div>
       <Marks data={data} />
--- a/web/src/Panel.tsx
+++ b/web/src/Panel.tsx
@@ -1,6 +1,6 @@
 import { useEffect, useRef } from "react";
 import type { Bundle } from "./bundle";
-import type { Hunk, Loc, View, ViewNode } from "./data";
+import type { Hunk, Loc, View, ViewEdge, ViewNode } from "./data";
 import { calls, imports, targets, type Row } from "./facts";
 import { linkFor } from "./links";
 import type { SceneEdge } from "./scene";
@@ -15,6 +15,7 @@ type Props = {
   id: string | null;
   edge: SceneEdge | null;
   bundles: Bundle[]; // the scene's bundles: an aggregate's real targets come from them
+  hidden?: ViewEdge[]; // 07: violating imports inside the selected box, drawn as no line
   onReveal: (id: string) => void;
   onClose: () => void;
 };
@@ -161,7 +162,31 @@ function Members({ view, edge, onReveal }: { view: View; edge: SceneEdge; onReve
   );
 }
 
-export function Panel({ view, id, edge, bundles, onReveal, onClose }: Props) {
+// Hidden lists the violating imports a box holds (07): no line draws them, so
+// the box is marked red and they are listed here.
+function Hidden({ edges, onReveal }: { edges: ViewEdge[]; onReveal: (id: string) => void }) {
+  return (
+    <section className="hidden-violations">
+      <h3>Violations inside ({edges.length})</h3>
+      <ul className="rows">
+        {edges.map((e) => (
+          <li key={`${e.from}\n${e.to}`}>
+            <span className="muted">{e.violation} </span>
+            <button type="button" className="link" onClick={() => onReveal(e.from)}>
+              <code>{e.from}</code>
+            </button>
+            {" → "}
+            <button type="button" className="link" onClick={() => onReveal(e.to)}>
+              <code>{e.to}</code>
+            </button>
+          </li>
+        ))}
+      </ul>
+    </section>
+  );
+}
+
+export function Panel({ view, id, edge, bundles, hidden, onReveal, onClose }: Props) {
   const title = edge ? `${edge.from} → ${edge.to}` : (id ?? "");
   const node = id === null ? undefined : view.nodes.find((n) => n.id === (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id));
   let body: React.ReactNode;
@@ -218,6 +243,7 @@ export function Panel({ view, id, edge, bundles, onReveal, onClose }: Props) {
           ×
         </button>
       </header>
+      {!edge && hidden && <Hidden edges={hidden} onReveal={onReveal} />}
       {body}
     </aside>
   );
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -455,6 +455,27 @@ button.st-removed {
   cursor: pointer;
 }
 
+.node .rank {
+  position: absolute;
+  top: 3px;
+  left: 3px;
+  min-width: 14px;
+  padding: 0 3px;
+  border-radius: 3px;
+  background: var(--container);
+  color: var(--muted);
+  font-size: 10px;
+  line-height: 14px;
+  text-align: center;
+}
+.node.ranked .label {
+  padding-left: 18px;
+}
+.node.hides-violation {
+  border-color: var(--pin);
+  box-shadow: inset 0 0 0 1px var(--pin);
+}
+
 .node .marks {
   position: absolute;
   left: 0;
```

- [x] **Run:** `cd web && npx tsc --noEmit && npx vitest run && npx vite build && cd .. && go test ./web` Expected: PASS; the build writes `dist/index.html`


### Task 8: `proposalView`: a Proposal as a regrouped View

ADR 0008: a Proposal is "drawn only on request, under a 'PROPOSAL, not instantiated in code' banner, and violations are re-evaluated for it". uml-viewer's `proposal-view` (`hierarchy.clj` l.479) makes one box per layer holding the real modules its members claim, an "Unassigned" box for the rest, drops what the Proposal omits, and restamps ranks and violations (`policy.clj` `restamp-ranks`, l.231).

zu does this as a View transform, so the same `scene`, depth, toggles, declutter, badges, level layout and red edges all apply unchanged:

- The one seam is `cut.ts` `index`, which derives the box tree. A View may carry `regroup.parent` (box → parent box); `index` then links each package's chain up to a layer box instead of splitting its id. Only packages present are linked, so a regrouped View missing some packages draws no empty boxes.
- A ranked package hangs under the longest member of its layer that covers it, with the real boxes between them (Deviation 4). A layer box is `proposal:<index>`, labelled with the layer name; `proposal:unassigned` holds the unranked packages, labelled by their path in the module.
- Package ranks and import violations come from Task 2's `proposals` entry; 06's are cleared.
- `scene` and `breadcrumb` take a label from `regroup.label` first.

**Files:**
- Create: `web/src/proposal.ts`, `web/src/proposal.test.ts`
- Modify: `web/src/cut.ts`, `web/src/scene.ts`, `web/src/headline.ts`

**Steps:**

- [ ] **Write the failing test**

<!-- file: web/src/proposal.test.ts -->
```ts
import { describe, expect, it } from "vitest";
import { childrenOf } from "./cut";
import type { View } from "./data";
import { breadcrumb } from "./headline";
import { pinFor } from "./policy";
import { PROPOSAL_NOTICE, proposalView, UNASSIGNED } from "./proposal";
import { scene } from "./scene";
import { DEFAULT_STATE } from "./state";
import { decl, edge, pkgs, view } from "./testkit";

// The Package Tree: m/app and m/domain with sub-packages, m/tools and m/util.
// Under the Policy's Levels m/domain is inner; the Proposal "Flip" puts m/app
// inner, so m/app/api → m/domain/model is its violation and 06's is not.
const v: View = {
  ...view(
    [
      ...pkgs(["m/app/api", "m/app/svc", "m/domain", "m/domain/model", "m/tools/gen", "m/util"], "m"),
      decl("m/app/svc.Service", "m/app/svc"),
    ],
    [
      edge("m/app/api", "m/domain/model"),
      edge("m/app/svc", "m/app/api"),
      { ...edge("m/domain", "m/app/svc"), violation: "levels" },
      edge("m/tools/gen", "m/util"),
      edge("m/util", "m/domain"),
    ],
  ),
  policy: {
    hash: "sha256:p", levels: [["m/domain"], ["m/app"]],
    proposals: [{
      name: "Flip",
      layers: [{ name: "App", members: ["m/app"] }, { name: "Domain model", members: ["m/domain/model"] }],
      omit: ["m/tools"],
      ranks: { "m/app/api": 0, "m/app/svc": 0, "m/domain/model": 1 },
      violations: [{ from: "m/app/api", to: "m/domain/model" }],
    }],
  },
};

describe("proposalView (07)", () => {
  const p = proposalView(v, "Flip");

  it("roots the tree at one box per layer, then Unassigned, each holding real boxes", () => {
    expect(childrenOf(p, "")).toEqual(["proposal:0", "proposal:1", UNASSIGNED]);
    expect(childrenOf(p, "proposal:0")).toEqual(["m/app"]);
    expect(childrenOf(p, "m/app")).toEqual(["m/app/api", "m/app/svc"]);
    expect(childrenOf(p, "proposal:1")).toEqual(["m/domain/model"]);
    expect(childrenOf(p, UNASSIGNED)).toEqual(["m/domain", "m/util"]);
    // The Change View's subgraph keeps regroup but drops packages: no empty boxes.
    const sub = { ...p, nodes: p.nodes.filter((n) => n.id !== "m/util" && n.id !== "m/domain/model") };
    expect(childrenOf(sub, "")).toEqual(["proposal:0", UNASSIGNED]);
    expect(childrenOf(sub, UNASSIGNED)).toEqual(["m/domain"]);
  });

  it("drops what the Proposal omits, and re-marks ranks and violations from zu's evaluation", () => {
    expect(p.nodes.some((n) => n.id.startsWith("m/tools"))).toBe(false);
    expect(p.nodes.find((n) => n.id === "m/app/svc.Service")).toBeDefined();
    const rank = Object.fromEntries(p.nodes.filter((n) => n.kind === "package").map((n) => [n.id, n.rank]));
    expect(rank).toEqual({ "m/app/api": 0, "m/app/svc": 0, "m/domain": undefined, "m/domain/model": 1, "m/util": undefined });
    expect(p.edges.filter((e) => e.violation).map((e) => `${e.from}→${e.to}`)).toEqual(["m/app/api→m/domain/model"]);
  });

  it("draws the layers as labelled boxes with ranks, and its violation red", () => {
    const sc = scene(p, { ...DEFAULT_STATE, depth: 1 }, { pin: pinFor(p) });
    expect(sc.nodes.map((n) => [n.id, n.label, n.rank])).toEqual([
      ["proposal:0", "App", 0], ["proposal:1", "Domain model", 1], [UNASSIGNED, "Unassigned", undefined],
    ]);
    expect(sc.edges.filter((e) => e.pinned).map((e) => e.id)).toEqual(["proposal:0→proposal:1"]);
    const open = scene(p, { ...DEFAULT_STATE, depth: 2 }, { pin: pinFor(p) });
    expect(open.nodes.find((n) => n.id === "m/app")?.label).toBe("app");
    expect(breadcrumb(p, "m/app").map((c) => c.label)).toEqual(["root", "App", "app"]);
  });

  it("is the View itself for an unknown name, and names the banner as uml-viewer does", () => {
    expect(proposalView(v, "Nope")).toBe(v);
    expect(PROPOSAL_NOTICE).toBe("PROPOSAL — not instantiated in code");
  });
});
```

- [ ] **Run:** `cd web && npx vitest run src/proposal.test.ts` Expected: FAIL (`Cannot find module './proposal'`)

- [ ] **Implement**

<!-- file: web/src/proposal.ts -->
```ts
// 07: a Proposal drawn on request (ADR 0008): the real packages regrouped into
// one box per layer, inner first, and an Unassigned box, with the ranks and
// violations internal/export evaluated for the Proposal. The page draws the
// View this returns with the same scene, so depth, declutter, selection and
// badges all work; the page never evaluates a rule itself.
import type { View, ViewEdge, ViewNode } from "./data";

// PROPOSAL_NOTICE is uml-viewer's banner (policy.clj proposal-notice, l.62).
export const PROPOSAL_NOTICE = "PROPOSAL — not instantiated in code";
export const UNASSIGNED = "proposal:unassigned";
export const layerBox = (i: number) => `proposal:${i}`;

const under = (id: string, prefix: string) => id === prefix || id.startsWith(prefix + "/");

// relative is an id as drawn at the top of a layer: without its module path.
const relative = (id: string, module: string | undefined) =>
  module && id.startsWith(module + "/") ? id.slice(module.length + 1) : id;

const cache = new WeakMap<View, Map<string, View>>();

// proposalView is view regrouped by the Proposal named name, or view itself
// when it has no such Proposal. A ranked package hangs under the longest
// member of its layer that covers it, with the real boxes between them
// (hierarchy.clj proposal-view, l.479: layers hold the real modules their
// members claim); an unranked one sits in Unassigned. Omitted packages go,
// with their declarations and edges.
export function proposalView(view: View, name: string): View {
  const hit = cache.get(view)?.get(name);
  if (hit) return hit;
  const p = view.policy?.proposals?.find((x) => x.name === name);
  if (!p) return view;
  const omitted = (id: string) => (p.omit ?? []).some((o) => under(id, o));
  const parent: Record<string, string> = {};
  const label: Record<string, string> = { [UNASSIGNED]: "Unassigned" };
  p.layers.forEach((l, i) => (label[layerBox(i)] = l.name));
  const kept = new Set<string>();
  const used = new Set<string>();
  for (const n of view.nodes) {
    if (n.kind !== "package" || omitted(n.id)) continue;
    kept.add(n.id);
    const r = p.ranks[n.id];
    const root = r === undefined ? undefined
      : p.layers[r].members.filter((m) => under(n.id, m)).sort((a, b) => b.length - a.length)[0];
    if (root === undefined) {
      parent[n.id] = UNASSIGNED;
      label[n.id] = relative(n.id, n.module);
      used.add(UNASSIGNED);
      continue;
    }
    parent[root] = layerBox(r);
    label[root] = relative(root, n.module);
    used.add(layerBox(r));
    let up = root;
    for (const seg of n.id === root ? [] : n.id.slice(root.length + 1).split("/")) {
      parent[`${up}/${seg}`] = up;
      up = `${up}/${seg}`;
    }
  }
  for (const box of Object.keys(label)) if (box.startsWith("proposal:") && !used.has(box)) delete label[box];
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const pkgOf = (n: ViewNode): string | undefined => {
    let x: ViewNode | undefined = n;
    while (x && x.kind !== "package") x = x.parent ? byId.get(x.parent) : undefined;
    return x?.id;
  };
  const nodes: ViewNode[] = [];
  for (const n of view.nodes) {
    if (n.kind === "external") nodes.push(n);
    else if (n.kind === "package" && kept.has(n.id)) {
      const { rank: _, ...rest } = n;
      nodes.push(p.ranks[n.id] === undefined ? rest : { ...rest, rank: p.ranks[n.id] });
    } else if (n.kind !== "package" && kept.has(pkgOf(n) ?? "")) nodes.push(n);
  }
  const ids = new Set(nodes.map((n) => n.id));
  const bad = new Set(p.violations.map((e) => `${e.from}\n${e.to}`));
  const edges: ViewEdge[] = [];
  for (const e of view.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const { violation: _, ...rest } = e;
    edges.push(e.kind === "imports" && bad.has(`${e.from}\n${e.to}`) ? { ...rest, violation: "levels" } : rest);
  }
  const out: View = { ...view, nodes, edges, regroup: { parent, label } };
  if (!cache.has(view)) cache.set(view, new Map());
  cache.get(view)!.set(name, out);
  return out;
}
```

```diff
--- a/web/src/cut.ts
+++ b/web/src/cut.ts
@@ -30,7 +30,18 @@ export function index(view: View): Index {
     kids.get(up)!.add(box);
   };
   const pkgs = view.nodes.filter((n) => n.kind === "package").sort((a, b) => cmp(a.id, b.id));
-  for (const n of pkgs) {
+  // 07: a Proposal's View names every box's parent, up to a layer box at the
+  // top; only the chains of packages in this View are linked.
+  const rg = view.regroup;
+  for (const n of rg ? pkgs : []) {
+    pkg.add(n.id);
+    for (let box = n.id; box !== ""; ) {
+      const up = rg!.parent[box] ?? "";
+      link(box, up);
+      box = up;
+    }
+  }
+  for (const n of rg ? [] : pkgs) {
     const m = n.module ?? n.id;
     pkg.add(n.id);
     link(m, "");
--- a/web/src/headline.ts
+++ b/web/src/headline.ts
@@ -38,7 +38,9 @@ export function breadcrumb(view: View, focus: string): Crumb[] {
   for (const id of path) {
     const parent = crumbs[crumbs.length - 1].id;
     let label: string;
-    if (id.endsWith(PKG)) label = `${id.slice(id.lastIndexOf("/") + 1, -PKG.length)} (package)`;
+    const named = view.regroup?.label[id]; // 07: a Proposal's layer boxes and their tops
+    if (named !== undefined) label = named;
+    else if (id.endsWith(PKG)) label = `${id.slice(id.lastIndexOf("/") + 1, -PKG.length)} (package)`;
     else if (parent === "" || !id.startsWith(parent + "/")) label = id;
     else label = id.slice(parent.length + 1);
     crumbs.push({ id, label });
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -107,6 +107,8 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const base = s.focus.endsWith(PKG) ? s.focus.slice(0, -PKG.length) : s.focus;
   const externals = externalsOf(view, kept).length;
   const label = (id: string, parent: string): string => {
+    const named = view.regroup?.label[id]; // 07: a Proposal's layer boxes and their tops
+    if (named !== undefined) return named;
     if (id === OUTSIDE) return "outside";
     if (id === EXTERNALS) return `${externals} external modules`;
     if (id.endsWith(PKG)) return `${last(id.slice(0, -PKG.length))} (package)`;
```

- [ ] **Run:** `cd web && npx tsc --noEmit && npx vitest run` Expected: PASS; the 04 snapshots are unchanged (no View they draw has `regroup`)

### Task 9: The chosen Proposal is in the URL hash

`ViewState` gains `proposal` (default `null`: the glossary's "never the default picture"), written as `p` after every other key, so no 05 link changes. The focus, toggles and selection name boxes of the drawn tree, so the hash is read in two passes (`readHash`): the Proposal first, then the rest against `proposalView`. `propose` switches trees from the page root, as `drill(s, "")` does.

A Change View never draws a Proposal: its violations section is zu diff's, under zu.policy.yaml, and a Proposal's red edges would contradict it. `knownIds(view).proposal` is false for a Change View, so a pasted `#p=` link is dropped there.

**Files:**
- Modify: `web/src/state.ts`, `web/src/scene.ts`, `web/src/proposal.ts`, `web/src/useViewState.ts`, `web/src/state.test.ts`, `web/src/proposal.test.ts`

**Steps:**

- [ ] **Write the failing test**

```diff
--- a/web/src/proposal.test.ts
+++ b/web/src/proposal.test.ts
@@ -3,9 +3,9 @@ import { childrenOf } from "./cut";
 import type { View } from "./data";
 import { breadcrumb } from "./headline";
 import { pinFor } from "./policy";
-import { PROPOSAL_NOTICE, proposalView, UNASSIGNED } from "./proposal";
-import { scene } from "./scene";
-import { DEFAULT_STATE } from "./state";
+import { PROPOSAL_NOTICE, proposalView, readHash, UNASSIGNED } from "./proposal";
+import { knownIds, scene } from "./scene";
+import { DEFAULT_STATE, encodeHash, propose } from "./state";
 import { decl, edge, pkgs, view } from "./testkit";
 
 // The Package Tree: m/app and m/domain with sub-packages, m/tools and m/util.
@@ -46,7 +46,7 @@ describe("proposalView (07)", () => {
     expect(childrenOf(p, "m/app")).toEqual(["m/app/api", "m/app/svc"]);
     expect(childrenOf(p, "proposal:1")).toEqual(["m/domain/model"]);
     expect(childrenOf(p, UNASSIGNED)).toEqual(["m/domain", "m/util"]);
-    // The Change View's subgraph keeps regroup but drops packages: no empty boxes.
+    // Only packages present are linked: a regrouped View without some draws no empty boxes.
     const sub = { ...p, nodes: p.nodes.filter((n) => n.id !== "m/util" && n.id !== "m/domain/model") };
     expect(childrenOf(sub, "")).toEqual(["proposal:0", UNASSIGNED]);
     expect(childrenOf(sub, UNASSIGNED)).toEqual(["m/domain"]);
@@ -76,3 +76,28 @@ describe("proposalView (07)", () => {
     expect(PROPOSAL_NOTICE).toBe("PROPOSAL — not instantiated in code");
   });
 });
+
+describe("a Proposal in the URL hash (07)", () => {
+  it("is off by default and written as p", () => {
+    expect(DEFAULT_STATE.proposal).toBeNull();
+    expect(encodeHash({ ...DEFAULT_STATE, proposal: "Flip", focus: "proposal:0" })).toBe("#f=proposal%3A0&p=Flip");
+  });
+
+  it("reads the focus against the Proposal's tree, and drops an unknown Proposal", () => {
+    expect(readHash("#f=proposal%3A0&p=Flip", v)).toEqual({ ...DEFAULT_STATE, focus: "proposal:0", proposal: "Flip" });
+    expect(readHash("#f=proposal%3A0", v)).toEqual(DEFAULT_STATE);
+    expect(readHash("#f=m%2Fapp&p=Nope", v)).toEqual({ ...DEFAULT_STATE, focus: "m/app" });
+  });
+
+  it("is never read in a Change View, so a pasted link cannot draw one there", () => {
+    const change: View = { ...v, kind: "change", changed: ["m/app/api"] };
+    expect(knownIds(change).proposal?.("Flip")).toBe(false);
+    expect(readHash("#f=m%2Fapp&p=Flip", change)).toEqual({ ...DEFAULT_STATE, focus: "m/app" });
+  });
+
+  it("switching Proposal starts again at the page root", () => {
+    const s = { ...DEFAULT_STATE, focus: "m/app", selected: "m/app/api", toggled: ["m/app"] };
+    expect(propose(s, "Flip")).toEqual({ ...DEFAULT_STATE, proposal: "Flip" });
+    expect(propose({ ...s, proposal: "Flip" }, null)).toEqual(DEFAULT_STATE);
+  });
+});
--- a/web/src/state.test.ts
+++ b/web/src/state.test.ts
@@ -17,7 +17,7 @@ describe("URL hash", () => {
   });
   it("round-trips every field, with toggles sorted", () => {
     const s: ViewState = { focus: "m/a#pkg", depth: 3, toggled: ["m/b", "m/a"], selected: "m/a.T",
-      hops: 2, stage: "triangles", lines: false, minPairs: 4, externals: false };
+      hops: 2, stage: "triangles", lines: false, minPairs: 4, externals: false, proposal: null };
     const h = encodeHash(s);
     expect(h).toBe("#f=m%2Fa%23pkg&d=3&t=m%2Fa&t=m%2Fb&s=m%2Fa.T&h=2&x=triangles&l=0&w=4&e=0");
     expect(decodeHash(h, known)).toEqual({ ...s, toggled: ["m/a", "m/b"] });
```

- [ ] **Run:** `cd web && npx vitest run src/proposal.test.ts src/state.test.ts` Expected: FAIL (`readHash is not a function`)

- [ ] **Implement**

```diff
--- a/web/src/proposal.ts
+++ b/web/src/proposal.ts
@@ -4,6 +4,8 @@
 // View this returns with the same scene, so depth, declutter, selection and
 // badges all work; the page never evaluates a rule itself.
 import type { View, ViewEdge, ViewNode } from "./data";
+import { knownIds } from "./scene";
+import { decodeHash, type ViewState } from "./state";
 
 // PROPOSAL_NOTICE is uml-viewer's banner (policy.clj proposal-notice, l.62).
 export const PROPOSAL_NOTICE = "PROPOSAL — not instantiated in code";
@@ -84,3 +86,10 @@ export function proposalView(view: View, name: string): View {
   cache.get(view)!.set(name, out);
   return out;
 }
+
+// readHash decodes a hash in two passes: the Proposal first, then the focus,
+// toggles and selection against the tree that Proposal draws.
+export function readHash(hash: string, view: View): ViewState {
+  const s = decodeHash(hash, knownIds(view));
+  return s.proposal === null ? s : decodeHash(hash, knownIds(proposalView(view, s.proposal)));
+}
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -274,11 +274,14 @@ export function fitDepth(requested: Sized & { depth: number }, at: (depth: numbe
 }
 
 // knownIds says which ids a URL hash may name: boxes as a focus, boxes with
-// children as toggles, and anything scene() can anchor as a selection.
+// children as toggles, anything scene() can anchor as a selection, and a
+// Proposal outside a Change View: the Change View's violations are zu diff's,
+// under zu.policy.yaml, so it never draws a Proposal's.
 export const knownIds = (view: View): Known => ({
   box: (id) => id === "" || isBox(view, id),
   folder: (id) => !id.endsWith(PKG) && childrenOf(view, id).length > 0,
   node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS,
+  proposal: (name) => view.kind !== "change" && (view.policy?.proposals?.some((p) => p.name === name) ?? false),
 });
 
 // openFull says a Change View focus (from a link) lies outside the changed
--- a/web/src/state.ts
+++ b/web/src/state.ts
@@ -22,11 +22,12 @@ export type ViewState = {
   lines: boolean; // false = "Hide edges": triangles instead of lines, at any stage
   minPairs: number; // hide bundles with fewer package pairs (A6)
   externals: boolean; // draw external modules
+  proposal: string | null; // 07: the Proposal drawn instead of the Package Tree, by name
 };
 
 export const DEFAULT_STATE: ViewState = {
   focus: "", depth: null, toggled: [], selected: null, hops: null,
-  stage: "full", lines: true, minPairs: 1, externals: true,
+  stage: "full", lines: true, minPairs: 1, externals: true, proposal: null,
 };
 
 export const LIMITS = { depth: 32, hops: 9, minPairs: 999 };
@@ -44,13 +45,16 @@ export function encodeHash(s: ViewState): string {
   if (!s.lines) p.set("l", "0");
   if (s.minPairs !== 1) p.set("w", String(s.minPairs));
   if (!s.externals) p.set("e", "0");
+  if (s.proposal !== null) p.set("p", s.proposal);
   const q = p.toString();
   return q ? "#" + q : "";
 }
 
 // Known says which ids a hash may name: a focus, a toggle (a box with child
-// boxes) and a selection.
-export type Known = { box(id: string): boolean; folder(id: string): boolean; node(id: string): boolean };
+// boxes), a selection and (07) a Proposal.
+export type Known = {
+  box(id: string): boolean; folder(id: string): boolean; node(id: string): boolean; proposal?(name: string): boolean;
+};
 
 // decodeHash reads a hash from anywhere (a shared link is untrusted input):
 // unknown ids and out-of-range numbers fall back to the default, never throw.
@@ -65,6 +69,7 @@ export function decodeHash(hash: string, known: Known): ViewState {
   const focus = p.get("f") ?? "";
   const selected = p.get("s");
   const stage = p.get("x");
+  const proposal = p.get("p");
   return {
     focus: known.box(focus) ? focus : "",
     depth: int("d", LIMITS.depth),
@@ -75,6 +80,7 @@ export function decodeHash(hash: string, known: Known): ViewState {
     lines: p.get("l") !== "0",
     minPairs: int("w", LIMITS.minPairs) ?? 1,
     externals: p.get("e") !== "0",
+    proposal: proposal !== null && known.proposal?.(proposal) ? proposal : null,
   };
 }
 
@@ -102,6 +108,10 @@ export const nextStage = (s: Stage): Stage => STAGES[(STAGES.indexOf(s) + 1) % S
 export const drill = (s: ViewState, box: string): ViewState =>
   ({ ...s, focus: box, depth: null, toggled: [], selected: null, hops: null });
 
+// propose draws a Proposal (or, with null, the Package Tree again) from the
+// page root: the focus and selection name boxes of the other tree.
+export const propose = (s: ViewState, name: string | null): ViewState => ({ ...drill(s, ""), proposal: name });
+
 // up goes to the parent box and selects the box the reader came from.
 export const up = (s: ViewState, parent: string): ViewState => ({ ...drill(s, parent), selected: s.focus || null });
 
--- a/web/src/useViewState.ts
+++ b/web/src/useViewState.ts
@@ -1,21 +1,20 @@
 // The view state of the page, kept in the URL hash (Deviation 5): read once at
 // start, written after every change, and read again when the reader edits or
 // pastes a link (hashchange).
-import { useEffect, useMemo, useState } from "react";
+import { useEffect, useState } from "react";
 import type { View } from "./data";
-import { knownIds } from "./scene";
-import { decodeHash, storeHash, type ViewState } from "./state";
+import { readHash } from "./proposal";
+import { storeHash, type ViewState } from "./state";
 
 export function useViewState(view: View): [ViewState, (next: (s: ViewState) => ViewState) => void] {
-  const known = useMemo(() => knownIds(view), [view]);
-  const [state, setState] = useState(() => decodeHash(window.location.hash, known));
+  const [state, setState] = useState(() => readHash(window.location.hash, view));
   useEffect(() => {
     storeHash(window.location, window.history, state);
   }, [state]);
   useEffect(() => {
-    const onHash = () => setState(decodeHash(window.location.hash, known));
+    const onHash = () => setState(readHash(window.location.hash, view));
     window.addEventListener("hashchange", onHash);
     return () => window.removeEventListener("hashchange", onHash);
-  }, [known]);
+  }, [view]);
   return [state, setState];
 }
```

- [ ] **Run:** `cd web && npx tsc --noEmit && npx vitest run` Expected: PASS

### Task 10: The page: Proposal selector and banner, legend, new violations first

- **Toolbar:** a `proposal` select, shown only when the Policy has Proposals and the page is not a Change View: "none (Package Tree)" and each name.
- **App:** in a Project View, `proposed = proposalView(whole, state.proposal)` replaces `whole` wherever a tree is read (the scene's View, reveal, the header's breadcrumb, search, the panel). A Change View always draws `whole` (Task 9).
- **Banner:** while a Proposal is drawn, "PROPOSAL — not instantiated in code: <name>" in gold at the top of the canvas (`policy.clj` l.62; `draw.clj` l.650–655 draws it gold, size 16).
- **Legend:** the red swatch only when something can be red (Levels exist or an edge violates), the badge note only when something is ranked; an `order`-only Policy shows neither. The swatch names what red violates: "zu.policy.yaml (levels or cycle)", or while a Proposal is drawn, "Proposal <name>'s layers" (`redLegend`).
- **Change View:** the violations section opens the changed-packages column, above "Changed packages", worded as `zu diff` writes it (`internal/diff/violations.go` `violationsBlock`): "New violations (N)" with each pair linked, or "No new violations", then "F fixed, K pre-existing" (decisions.md, "Change reading order: new violations first").

**Files:**
- Modify: `web/src/App.tsx`, `web/src/Toolbar.tsx`, `web/src/headline.ts`, `web/src/styles.css`, `web/src/headline.test.ts`

**Steps:**

- [ ] **Write the failing test**

```diff
--- a/web/src/headline.test.ts
+++ b/web/src/headline.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import golden from "../../internal/export/testdata/shop.view.golden.json";
 import { parseView, type View } from "./data";
-import { breadcrumb, depthNote, honestyLine, title } from "./headline";
+import { breadcrumb, depthNote, honestyLine, redLegend, title, violationsNote } from "./headline";
 
 const v = parseView(JSON.stringify(golden));
 
@@ -39,3 +39,18 @@ describe("header", () => {
     expect(depthNote(70, 1)).toBe("70 boxes at depth 1. Double-click to open a box, Esc to go up. More than 60 boxes, drawn anyway.");
   });
 });
+
+describe("violationsNote (07)", () => {
+  const red = { rule: "levels" as const, from: "m/a", to: "m/b" };
+  it("words the Change View's section as zu diff does, new violations first", () => {
+    expect(violationsNote({ new: [red], fixed: [], known: 2 })).toEqual({ heading: "New violations (1)", tail: "0 fixed, 2 pre-existing" });
+    expect(violationsNote({ new: [], fixed: [red], known: 0 })).toEqual({ heading: "No new violations", tail: "1 fixed, 0 pre-existing" });
+  });
+});
+
+describe("redLegend (07)", () => {
+  it("names what red violates: zu.policy.yaml, or the Proposal drawn", () => {
+    expect(redLegend(null)).toBe("violates zu.policy.yaml (levels or cycle); a red box holds one");
+    expect(redLegend("Hexagon")).toBe("violates Proposal Hexagon's layers; a red box holds one");
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/headline.test.ts` Expected: FAIL (`violationsNote is not a function`)

- [ ] **Implement**

```diff
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -6,10 +6,12 @@ import { parentBox } from "./cut";
 import type { View } from "./data";
 import { pageEngine } from "./engine";
 import { Header } from "./Header";
+import { redLegend, violationsNote } from "./headline";
 import { keyAction } from "./keys";
 import { elkGraph, inOrder, orderOf, positions, Superseded, type Placed } from "./layout";
 import { Panel } from "./Panel";
 import { pinFor } from "./policy";
+import { PROPOSAL_NOTICE, proposalView } from "./proposal";
 import { reveal } from "./search";
 import { SearchBox } from "./SearchBox";
 import { DRAW_LIMIT, fitDepth, openFull, scene, type SceneNode } from "./scene";
@@ -19,7 +21,7 @@ import { useViewState } from "./useViewState";
 
 const PKG = "#pkg";
 
-function Legend({ change, policy }: { change: boolean; policy: boolean }) {
+function Legend({ change, policy, ranks, proposal }: { change: boolean; policy: boolean; ranks: boolean; proposal: string | null }) {
   return (
     <div className="legend" aria-label="Legend">
       {change && (
@@ -32,18 +34,48 @@ function Legend({ change, policy }: { change: boolean; policy: boolean }) {
           <span>edges: + added · − removed · ⇄ reversed · ± mixed</span>
         </>
       )}
-      {policy && <span className="swatch violation">violates zu.policy.yaml (levels or cycle)</span>}
+      {policy && <span className="swatch violation">{redLegend(proposal)}</span>}
+      {ranks && <span>n: Level, 0 = innermost, drawn at the bottom</span>}
     </div>
   );
 }
 
+// Violations is 07's section of the Change View, first as in zu diff
+// (decisions.md, "new violations first"): each new one links to its importer.
+function Violations({ d, onPick }: { d: NonNullable<View["violations"]>; onPick: (id: string) => void }) {
+  const note = violationsNote(d);
+  return (
+    <section className="violations" aria-label="Violations">
+      <h2>{note.heading}</h2>
+      {d.new.length > 0 && (
+        <ol>
+          {d.new.map((x) => (
+            <li key={`${x.rule}\n${x.from}\n${x.to}`}>
+              <span className="muted">{x.rule} </span>
+              <button type="button" className="link" title={x.from} onClick={() => onPick(x.from)}>
+                {x.from}
+              </button>
+              {" → "}
+              <button type="button" className="link" title={x.to} onClick={() => onPick(x.to)}>
+                {x.to}
+              </button>
+            </li>
+          ))}
+        </ol>
+      )}
+      <p className="muted">{note.tail}</p>
+    </section>
+  );
+}
+
 // ChangedList is U11: the changed packages in the Structural Summary's
-// bottom-up order, exactly as zu diff wrote them.
+// bottom-up order, exactly as zu diff wrote them, after the violations (07).
 function ChangedList({ view, onPick }: { view: View; onPick: (id: string) => void }) {
   const byId = new Map(view.nodes.map((n) => [n.id, n]));
   const ids = view.changed ?? [];
   return (
     <nav className="changed" aria-label="Changed packages">
+      {view.violations && <Violations d={view.violations} onPick={onPick} />}
       <h2>Changed packages ({ids.length})</h2>
       <ol>
         {ids.map((id) => {
@@ -65,11 +97,17 @@ function ChangedList({ view, onPick }: { view: View; onPick: (id: string) => voi
 export function App({ view: whole }: { view: View }) {
   const change = whole.kind === "change";
   const [state, update] = useViewState(whole);
+  // 07: a chosen Proposal replaces the Package Tree everywhere a tree is read.
+  // A Change View never has one (knownIds): its violations are zu diff's.
+  const proposed = useMemo(
+    () => (change || state.proposal === null ? whole : proposalView(whole, state.proposal)),
+    [whole, change, state.proposal],
+  );
   // The Change View opens on the changed subgraph (Q4); U10 toggles to all of
   // it. A link whose focus lies outside the subgraph opens all of it, at that
   // focus: from the start, and on a later hashchange.
   const [full, setFull] = useState(() => change && openFull(changedSubgraph(whole), state.focus));
-  const view = useMemo(() => (change && !full ? changedSubgraph(whole) : whole), [whole, change, full]);
+  const view = useMemo(() => (change && !full ? changedSubgraph(whole) : proposed), [whole, proposed, change, full]);
   useEffect(() => {
     if (change && !full && openFull(view, state.focus)) setFull(true);
   }, [change, full, view, state.focus]);
@@ -103,7 +141,7 @@ export function App({ view: whole }: { view: View }) {
   const jump = (id: string) => {
     setEdgeId(null);
     if (change && !full && !view.nodes.some((n) => n.id === id)) setFull(true);
-    update((s) => reveal(whole, id, s));
+    update((s) => reveal(proposed, id, s));
     setCenter((c) => ({ id, seq: (c?.seq ?? 0) + 1 }));
   };
 
@@ -172,13 +210,17 @@ export function App({ view: whole }: { view: View }) {
   const open = (n: SceneNode) => {
     if (n.shape === "box" || n.shape === "container") go(n.id);
   };
+  // The legend explains red only when something can be red, and badges only
+  // when something is ranked; an order-only Policy needs neither.
+  const rules = (proposed.policy?.levels.length ?? 0) > 0 || proposed.edges.some((e) => e.violation);
+  const ranks = sc.nodes.some((n) => n.rank !== undefined);
   const boxes = sc.nodes.filter((n) => n.shape === "box" || n.shape === "decl").length;
   const pkg = state.focus.endsWith(PKG) ? state.focus.slice(0, -PKG.length) : state.focus;
 
   return (
     <div className={`app${change ? " change" : ""}${change && !full ? " subgraph" : ""}`}>
       <Header
-        view={whole}
+        view={proposed}
         focus={state.focus}
         boxes={boxes}
         depth={sc.depth}
@@ -189,12 +231,22 @@ export function App({ view: whole }: { view: View }) {
         onToggle={flip}
       />
       <div className="bar">
-        <Toolbar state={state} depth={sc.depth} update={update} />
-        <SearchBox view={whole} input={searchBox} onOpen={setSearchOpen} onPick={jump} />
+        <Toolbar
+          state={state}
+          depth={sc.depth}
+          update={update}
+          proposals={change ? [] : (whole.policy?.proposals ?? []).map((p) => p.name)}
+        />
+        <SearchBox view={proposed} input={searchBox} onOpen={setSearchOpen} onPick={jump} />
       </div>
       {change && <ChangedList view={whole} onPick={pick} />}
       <main className="canvas">
-        {(change || whole.policy) && <Legend change={change} policy={whole.policy !== undefined} />}
+        {proposed !== whole && (
+          <div className="proposal-banner" role="status">
+            {PROPOSAL_NOTICE}: {state.proposal}
+          </div>
+        )}
+        {(change || rules || ranks) && <Legend change={change} policy={rules} ranks={ranks} proposal={proposed === whole ? null : state.proposal} />}
         {sc !== requested && (
           <div className="notice" id="zu-notice" role="status">
             Collapsed to depth {sc.depth}: depth {requested.depth} has{" "}
@@ -261,7 +313,7 @@ export function App({ view: whole }: { view: View }) {
       </main>
       {(state.selected !== null || edge !== null) && (
         <Panel
-          view={whole}
+          view={proposed}
           id={state.selected}
           edge={edge}
           bundles={sc.bundles}
--- a/web/src/Toolbar.tsx
+++ b/web/src/Toolbar.tsx
@@ -1,9 +1,12 @@
-import { deeper, LABELS, LIMITS, nextStage, shallower, type ViewState } from "./state";
+import { deeper, LABELS, LIMITS, nextStage, propose, shallower, type ViewState } from "./state";
 
-type Props = { state: ViewState; depth: number; update: (next: (s: ViewState) => ViewState) => void };
+type Props = {
+  state: ViewState; depth: number; update: (next: (s: ViewState) => ViewState) => void;
+  proposals: string[]; // 07: the Policy's Proposals, drawn only when chosen here
+};
 
 // Toolbar: one control per ViewState field; each calls one state change.
-export function Toolbar({ state, depth, update }: Props) {
+export function Toolbar({ state, depth, update, proposals }: Props) {
   return (
     <div className="toolbar" role="toolbar" aria-label="View">
       <span>
@@ -61,6 +64,19 @@ export function Toolbar({ state, depth, update }: Props) {
         <input type="checkbox" checked={state.externals} onChange={(e) => update((s) => ({ ...s, externals: e.target.checked }))} />{" "}
         externals
       </label>
+      {proposals.length > 0 && (
+        <label>
+          proposal{" "}
+          <select value={state.proposal ?? ""} onChange={(e) => update((s) => propose(s, e.target.value || null))}>
+            <option value="">none (Package Tree)</option>
+            {proposals.map((n) => (
+              <option key={n} value={n}>
+                {n}
+              </option>
+            ))}
+          </select>
+        </label>
+      )}
     </div>
   );
 }
--- a/web/src/headline.ts
+++ b/web/src/headline.ts
@@ -56,3 +56,17 @@ export function depthNote(boxes: number, depth: number, auto = true, from = dept
   const note = `${boxes} boxes at depth ${depth}${how}. Double-click to open a box, Esc to go up.`;
   return boxes > BOX_BUDGET ? `${note} More than ${BOX_BUDGET} boxes, drawn anyway.` : note;
 }
+
+// violationsNote words the Change View's violations section as zu diff's
+// violationsBlock does (internal/diff/violations.go): new first, then the rest.
+export function violationsNote(d: NonNullable<View["violations"]>): { heading: string; tail: string } {
+  return {
+    heading: d.new.length === 0 ? "No new violations" : `New violations (${d.new.length})`,
+    tail: `${d.fixed.length} fixed, ${d.known} pre-existing`,
+  };
+}
+
+// redLegend says what a red edge or box violates: the Policy's Levels and
+// cycles, or, while a Proposal is drawn, only that Proposal's layers.
+export const redLegend = (proposal: string | null): string =>
+  `violates ${proposal === null ? "zu.policy.yaml (levels or cycle)" : `Proposal ${proposal}'s layers`}; a red box holds one`;
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -17,6 +17,7 @@
   --add-bg: #dafbe1;
   --del-bg: #ffebe9;
   --pin: #cf222e; /* a pinned (violating) edge, 06 */
+  --proposal: #9a6700; /* the Proposal banner, gold as in uml-viewer (draw.clj l.650), 07 */
   font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
   color: var(--fg);
   background: var(--bg);
@@ -42,6 +43,7 @@
     --add-bg: #12361f;
     --del-bg: #3d1a1c;
     --pin: #ff7b72;
+    --proposal: #d29922;
   }
 }
 
@@ -373,6 +375,27 @@ button.st-removed {
   padding: 8px 12px;
   font-size: 12px;
 }
+.changed .violations {
+  margin-bottom: 12px;
+}
+.changed .violations h2 {
+  color: var(--pin);
+}
+.changed .violations p {
+  margin: 4px 0 0;
+}
+.proposal-banner {
+  position: absolute;
+  top: 8px;
+  left: 50%;
+  transform: translateX(-50%);
+  z-index: 5;
+  color: var(--proposal);
+  font-size: 16px;
+  font-weight: 600;
+  pointer-events: none;
+}
+
 .changed h2 {
   font-size: 12px;
   margin: 0 0 6px;
```

- [ ] **Run:** `cd web && npx tsc --noEmit && npx vitest run && npx vite build && cd .. && go test ./web` Expected: PASS


### Task 11: The browser harness covers 07

05's `web/e2e/accept.mjs` builds pages from the goldens and checks them in Chromium, Firefox and WebKit. The shop goldens carry no Policy, so 07 writes three pages inline, as `far.html` and `big.html` are:

- `policy.html`: packages ranked 2 (`m/cmd`), 1 (`m/internal/cli`) and 0 (`m/internal/ir`, `m/internal/ir/bad`), `m/util` unranked, one levels violation `ir/bad → cli`, and a Proposal "Hexagon". Checked: the badges top to bottom at depth 3; the red border on `m/internal` at depth 2 and at depth 3 in `arrows`, `triangles`, `elements` and `classes`, and on nothing in `full`; the panel's first hidden row; choosing Hexagon (hash `p=Hexagon`, the banner, the legend naming the Proposal), a reload keeping it, and "none" clearing both.
- `order.html`: Task 6's six siblings. Checked: they are drawn z, y, x, then the rest by id. Without `inOrder` in `App.tsx` this check fails (measured: `m/x m/z m/b m/c m/y m#pkg m/a`).
- `violations.html`: the shop Change View with a violation delta and a Proposal, opened at `#p=Hexagon`. Checked: the column opens with the violations section, and no banner or select appears.

The expected checks grow from 20 to 29 per engine. This makes Tasks 7 and 10 repeatable, which is what lets Task 7 go without a unit test (Deviation 13).

**Files:**
- Modify: `web/e2e/accept.mjs`

**Steps:**

- [ ] **Extend the harness**

```diff
--- a/web/e2e/accept.mjs
+++ b/web/e2e/accept.mjs
@@ -33,6 +33,30 @@ const ids = [];
 for (let g = 0; g < 24; g++) for (let i = 0; i < 5; i++) ids.push(`m/g${String(g).padStart(2, "0")}/p${i}`);
 const edges = ids.flatMap((id, n) => [1, 2, 3, 4, 5, 6].map((k) => imp(id, ids[(n + 5 * k) % ids.length])));
 write("big.html", page({ ...shop, modules: ["m"], nodes: [pkg("m", "m"), ...ids.map((id) => pkg(id, "m"))], edges, sources: {} }));
+// 07: a Policy View, as export.Mark writes it. Ranks: cmd 2, cli 1, ir and
+// ir/bad 0, util unranked; one levels violation, ir/bad → cli, which no line
+// draws once m/internal is closed.
+const ranked = [["m/cmd", 2], ["m/internal/cli", 1], ["m/internal/ir", 0], ["m/internal/ir/bad", 0], ["m/util"]];
+const hexagon = {
+  name: "Hexagon",
+  layers: [{ name: "Domain", members: ["m/internal/ir"] }, { name: "Entry", members: ["m/internal/cli", "m/cmd"] }],
+  ranks: { "m/cmd": 1, "m/internal/cli": 1, "m/internal/ir": 0, "m/internal/ir/bad": 0 },
+  violations: [{ from: "m/internal/ir/bad", to: "m/internal/cli" }],
+};
+const policy = { hash: "sha256:e2e", levels: [["m/internal/ir"], ["m/internal/cli"], ["m/cmd"]], proposals: [hexagon] };
+write("policy.html", page({
+  ...shop, modules: ["m"], sources: {}, policy,
+  nodes: [pkg("m", "m"), ...ranked.map(([id, rank]) => ({ ...pkg(id, "m"), ...(rank === undefined ? {} : { rank }) }))],
+  edges: [imp("m/cmd", "m/internal/cli"), imp("m/internal/cli", "m/internal/ir"), { ...imp("m/internal/ir/bad", "m/internal/cli"), violation: "levels" }, imp("m/cmd", "m/util")],
+}));
+// Six unconnected siblings that ELK alone places x, z, c, y, a, b; order asks z, y, x first.
+const six = ["m/a", "m/b", "m/c", "m/x", "m/y", "m/z"];
+write("order.html", page({ ...shop, modules: ["m"], sources: {}, nodes: [pkg("m", "m"), ...six.map((id) => pkg(id, "m"))], edges: [], policy: { hash: "sha256:e2e", levels: [], order: ["m/z", "m/y", "m/x"] } }));
+// A Change View with zu diff's violation delta, and a Proposal it must not draw.
+write("violations.html", page({
+  ...change, policy: { hash: "sha256:e2e", levels: [], proposals: [{ ...hexagon, ranks: {}, violations: [] }] },
+  violations: { new: [{ rule: "levels", from: "example.com/shop/internal/store", to: "example.com/shop/internal/money" }], fixed: [], known: 2 },
+}));
 
 const base = "file://" + dir + "/";
 const vp = (p) => p.locator(".react-flow__viewport").getAttribute("style");
@@ -110,6 +134,51 @@ async function run(b) {
   await p.getByRole("button", { name: "Draw depth 4 anyway" }).click();
   out.anyway = await p.locator("#zu-notice").count();
   await p.close();
+  // 07: the Policy View.
+  p = await b.newPage();
+  const at = async (h) => {
+    await p.goto(base + "policy.html" + h);
+    await p.reload();
+    await drawn(p);
+    await settle(p);
+  };
+  const nodes = () => p.evaluate(() => [...document.querySelectorAll(".react-flow__node")].map((n) => {
+    const r = n.getBoundingClientRect();
+    return { id: n.getAttribute("data-id"), x: r.x, y: r.y, rank: n.querySelector(".rank")?.textContent ?? null, red: !!n.querySelector(".hides-violation") };
+  }));
+  const reds = async () => (await nodes()).filter((n) => n.red).map((n) => n.id);
+  await at("#d=3");
+  out.ranks = (await nodes()).filter((n) => n.rank !== null).sort((a, b) => a.y - b.y || a.x - b.x).map((n) => `${n.id} ${n.rank}`);
+  await at("#d=2");
+  out.redBox = [`d=2: ${(await reds()).join(" ")}`];
+  for (const st of ["full", "arrows", "triangles", "elements", "classes"]) {
+    await at(`#d=3&x=${st}`);
+    out.redBox.push(`${st}: ${(await reds()).join(" ")}`);
+  }
+  await at("#d=2&s=m%2Finternal");
+  out.panel = await p.locator(".hidden-violations").innerText().then((t) => t.split("\n").slice(0, 2)).catch(() => null);
+  await at("");
+  await p.getByLabel(/^proposal/).selectOption("Hexagon");
+  await settle(p);
+  const banner = () => p.locator(".proposal-banner").innerText().catch(() => null);
+  out.proposal = [await hash(p), await banner(), await p.locator(".legend .violation").innerText()];
+  await p.reload();
+  await drawn(p);
+  await settle(p);
+  out.proposalReload = await banner();
+  await p.getByLabel(/^proposal/).selectOption("");
+  await settle(p);
+  out.proposalNone = [await hash(p), await p.locator(".proposal-banner").count()];
+  await p.goto(base + "order.html#d=2");
+  await drawn(p);
+  await settle(p);
+  out.order = (await nodes()).filter((n) => n.id !== "m").sort((a, b) => a.x - b.x).map((n) => n.id).join(" ");
+  await p.goto(base + "violations.html#p=Hexagon");
+  await drawn(p);
+  await settle(p);
+  out.violations = await p.locator("nav.changed .violations").innerText().then((t) => t.split("\n"));
+  out.changeNoProposal = [await p.locator(".proposal-banner").count(), await p.getByLabel(/^proposal/).count()];
+  await p.close();
   // Worker blocked by the CSP
   p = await b.newPage();
   await p.goto(base + "without.html");
@@ -141,6 +210,16 @@ const want = {
   anyway: 0,
   blocked: "Layout failed: layout worker failed: blocked",
   errors: [],
+  // 07
+  ranks: ["m 2", "m/cmd 2", "m/internal 1", "m/internal/cli 1", "m/internal/ir 0"],
+  redBox: ["d=2: m/internal", "full: ", "arrows: m/internal", "triangles: m/internal", "elements: m/internal", "classes: m/internal"],
+  panel: ["Violations inside (1)", "levels m/internal/ir/bad → m/internal/cli"],
+  proposal: ["#p=Hexagon", "PROPOSAL — not instantiated in code: Hexagon", "violates Proposal Hexagon's layers; a red box holds one"],
+  proposalReload: "PROPOSAL — not instantiated in code: Hexagon",
+  proposalNone: ["", 0],
+  order: "m/z m/y m/x m#pkg m/a m/b m/c",
+  violations: ["New violations (1)", "levels example.com/shop/internal/store → example.com/shop/internal/money", "", "0 fixed, 2 pre-existing"],
+  changeNoProposal: [0, 0],
 };
 
 const channel = process.env.ZU_E2E_CHANNEL;
```

- [ ] **Run:** `cd web && npx vite build && cd e2e && npm run accept` Expected: `chromium: ok (29/29 checks)`, and the same for firefox and webkit

### Task 12: Acceptance

- [ ] **1. Gates**
- [ ] **Run:** `test -z "$(gofmt -l .)" && go vet ./... && go test ./... && golangci-lint run ./... && cd web && npx tsc --noEmit && npx vitest run && npx vite build && cd e2e && npm run accept` Expected: all clean; the harness prints `ok (29/29 checks)` for chromium, firefox and webkit.
- [ ] **2. zu on itself**, in a scratch copy of the repository after Task 11 (`make build`, then run `bin/zu` from the copy). Write this `zu.policy.yaml`, 06's acceptance layering plus an `order` and a Proposal, and add 06's `internal/ir/bad/bad.go` importing `zu/internal/cli`:

    ```yaml
    order: [zu/cmd]
    levels:
      - [zu/internal/ir, zu/internal/version, zu/web]
      - zu/internal/scan
      - [zu/internal/policy, zu/internal/gitref]
      - zu/internal/diff
      - zu/internal/export
      - zu/internal/cli
      - zu/cmd
    cycles: true
    proposals:
      - name: Hexagon
        layers:
          - {name: Domain, members: [zu/internal/ir, zu/internal/policy, zu/internal/diff]}
          - {name: Adapters, members: [zu/internal/scan, zu/internal/gitref, zu/internal/export, zu/web]}
          - {name: Entry, members: [zu/internal/cli, zu/cmd]}
    ```

  - `zu scan . -html self.html` exits 0. The View's `policy.order` is `["zu/cmd"]`; Hexagon ranks 10 packages, leaves `zu/internal/version` Unassigned and has one violation, `zu/internal/ir/bad → zu/internal/cli`; 17 edges are red, as in 06. `zu check .` reports 18 new violations (1 levels, 17 cycle), as in 06's acceptance. 18 violations mark 17 edges: the ir/bad import is both the levels violation and a cycle arc, and levels wins.
  - In the browser: at depth 3 the `zu/internal` badges run top to bottom cli 5, export 4, diff 3, gitref 2, policy 2, scan 1, ir 0, version 0, with no inversion; at the root, depth 2, and depth 3 in the `arrows`, `triangles`, `elements` and `classes` stages, `zu/internal` has the red border, and its panel lists "Violations inside (17)" with `levels zu/internal/ir/bad → zu/internal/cli` first; at depth 3 `full` nothing has the border and the 17 red edges are drawn (in the lifting stages, 0).
  - `order: [zu/cmd]` has no visible effect here: `zu/cmd` is the only rank-6 box, alone in its row. Task 11's `order.html` shows the effect.
  - Choosing Hexagon draws Entry above Adapters above Domain above Unassigned, under the banner, with one red edge at every depth and stage, and the legend reads "violates Proposal Hexagon's layers"; the hash gains `p=Hexagon` and a reload keeps it; "none" clears both.
  - `zu diff master -html` on a branch that adds `internal/ir/bad` exits 1, and the column opens with "New violations (18)" (1 levels, 17 cycle), rows in zu diff's order (the first is `cycle zu/internal/cli → zu/internal/diff`). At `#p=Hexagon` neither the select nor the banner appears.
- [ ] **3. hugo v0.166.0** (`git -C .zu/corpus/hugo@v0.166.0 archive HEAD` into scratch) with `zu policy init`'s Levels (4 levels over 36 boxes; `zu check .` exits 0). Only the root package `github.com/gohugoio/hugo` and the externals are unranked. Measured with elk.bundled in Node, best of 3 after a warm-up, lines on:

  | depth, stage | scene nodes / edges | step nodes | layout with ranks | without ranks | siblings of a higher rank at or below a lower one |
  |---|---|---|---|---|---|
  | 2, full | 39 / 260 | 4 | 262 ms | 166 ms | 0 of 342 pairs |
  | 2, classes | 39 / 260 | 4 | 259 ms | 160 ms | 0 of 342 |
  | 3, full | 173 / 1,057 | 4 | 2,569 ms | 2,431 ms | 0 of 342 |
  | 3, classes | 22 / 155 | 3 | 149 ms | 110 ms | 0 of 80 |

  At depths 2 and 3 the unranked `github.com/gohugoio/hugo#pkg` sits below every sibling ranked above 0 (Deviation 5).

## Notes

- **Task count: 12**, within Quick mode's 15.
- **Verification of this plan** (2026-09-24): `replay.py` applied every code block in task order to a fresh `git archive` of `main` at 34d128c, with `web/node_modules` linked from 06's install and `web/e2e/node_modules` from the repository's (07 adds no dependency), and ran each task's red and green steps. The replayed tree was byte-identical to the implementation the diffs were cut from. After that, `gofmt -l`, `go vet ./...`, `go test ./...` and `golangci-lint run ./...` were clean, `tsc`, `vitest` and `vite build` passed, and the harness passed 29/29 in Chromium, Firefox and WebKit. Task 12 steps 2 and 3 were measured on this implementation (step 2's browser bullets in Chromium).
- **TDD:** every task but 7 and 11 writes its failing test first (CLAUDE.md). Task 7 renders state tested in Tasks 4 and 5; Task 11 is the browser check of Tasks 7 and 10 (Deviation 13). Removing `inOrder` from `App.tsx` makes the harness fail its `order` check in all three engines (measured).
- **Determinism:** `proposals[].violations` are sorted and `ranks` is a JSON object (Go writes map keys sorted), so the View stays byte-identical for the same commit and Policy. No 04 or 06 golden changes. `inOrder` is a pure function of ELK's positions and the scene.
- **The model never authors the graph:** a Proposal regroups nodes the parser emitted and adds only the layer and Unassigned boxes, which exist only on the page, under the banner, and never in the IR (ADR 0008). The step nodes are never drawn.
- **Performance:** the steps add at most one node per rank per container and one edge per ranked sibling (hugo: step 3); `inOrder` is O(n log n) over drawn nodes; `rolledRanks` and `proposalView` are cached per View.
- **Security:** no new input: the Policy is parsed and validated by 06, and Task 1 only tightens validation. Layer names and ids reach the page as JSON and are rendered as React text, never as HTML.
- **Stuck?** Stop and ask. Don't force through blockers.

## Progress

- [x] Task 1 · `policy.ForProposal` and member validation
- [x] Task 2 · View `order` and `proposals`
- [x] Task 3 · Change View violation delta
- [x] Task 4 · Rolled ranks on boxes
- [x] Task 5 · Hidden-violation mark
- [x] Task 6 · Level 0 at the bottom, and `order`
- [x] Task 7 · Badges, mark and panel list
- [ ] Task 8 · `proposalView`
- [ ] Task 9 · Proposal in the hash, never in a Change View
- [ ] Task 10 · Selector, banner, legend, new violations first
- [ ] Task 11 · The browser harness covers 07
- [ ] Task 12 · Acceptance
