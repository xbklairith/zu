# 06 · Policy File — Plan

**Status:** approved 2026-09-24 (scrutinized, fixed, advisor sign-off). The doc amendments in Deviations 1, 7, 9 and 11 are applied.

**Status:** draft 2026-09-24, revised after scrutiny (`scrutiny-06.md`: B1, M1–M5, N1–N7) and the lead's rulings. 05 is on `main` with its acceptance recorded (8f43cb1), and every diff here is against that commit. From 05 the plan uses only the `pin` hook (`web/src/declutter.ts`, `SceneOptions.pin` in `web/src/scene.ts`) and `ViewState`.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is the plan's verification record and is committed with it. It extracts every code block from this file and applies it to a fresh copy of `main`, task by task, the way an implementer would: a `<!-- file: … -->` block is written whole, and a `diff` block goes through `patch -p1`. At each **Run** step it runs that step's first command: a step marked "Expected: FAIL" must exit non-zero and every other step must exit 0. It prints one line per step and exits 1 if any step misbehaves. From the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) \
  && python3 docx/features/06-policy/replay.py docx/features/06-policy/plan.md "$S"
```

`npm ci` is needed only for Task 12's UI step; the replay needs Go, git, `patch` and Python 3, and no network beyond `npm ci` and the Go module proxy for Task 1's dependency.

**Goal:** A committed `zu.policy.yaml` that zu reads on every scan and applies in three places:

- It excludes files and collapses, omits and ranks what is drawn.
- It checks Levels and cycles (A8). `zu check` fails only on violations not already in `zu.baseline.json`. `zu diff` reports new violations first and exits 1 on them (B7, B9).
- The HTML export draws violating edges red.

**Architecture:**
- A new package, `internal/policy`, owns the Policy:
  - parsing, with strict keys and the normalised hash (ADR 0004);
  - exclude globs;
  - `Apply`, a lens over an IR: omit, omit-edges, foreign collapse;
  - rule evaluation: Levels and cycles;
  - the Baseline;
  - the `policy init` suggestion.
- `zu scan`, `zu check` and `zu policy init` read the Policy file at the root of the tree they scan, through the same `scan.Tree`, so disk, worktree and commit scans agree (`parity_test.go`). `zu scan -ref X` uses X's own Policy.
- `zu diff` reads `zu.policy.yaml` once, from head (from the working tree under `-worktree`), and scans both sides under it: both IRs carry head's `policyHash` (ADR 0004 as amended, Deviation 7).
- The Policy and the Baseline are read by name, not from the scan's file list. A symlink is followed only to a regular file inside the tree, and each file is capped at 1 MiB (`scan.ReadSmall`, Task 2).
- The Policy changes the IR in only two ways: which files are read (`exclude`) and the recorded `policyHash`. Everything else is evaluated on `pol.Apply(doc)` by `check`, `diff` and `export`. The IR stays the parser's output (CLAUDE.md: "the model never authors the graph").
- The UI marks a bundle red through 05's `pin` hook when any edge inside it violates. It adds nothing to the scene engine.

**Tech Stack:** Go 1.24; `go.yaml.in/yaml/v3` v3.0.5 (new dependency, see Task 1); React 19 and `vitest` as in 05.

**Source decisions:**
- ADR 0004: the hash covers the parsed rules; diff uses head's Policy for both sides. Its "a mismatch stops" clause is dropped (Deviation 7).
- ADR 0008: the Policy never invents boxes; `policy init` suggests Levels.
- `docx/core/decisions.md` lines 21–25 and 37.
- The glossary: Policy, Level, Baseline.
- uml-viewer's primary source at commit 79cc1ef, `src/uml_viewer/domain/policy.clj`:
  - `level-ranks` l.175: index = rank, smaller = inner;
  - `rank-of` l.196: exact id, else the longest prefix;
  - `violating-dependency?` l.213: dependency kind only, both ends ranked, `rf < rt`;
  - `merge-edges` l.238: a bundle is violating if any edge in it is;
  - `collapse-graph` l.252: foreign prefixes;
  - `apply-edge-kinds` l.279: an override to a non-dependency kind clears `violating`; omit-edges;
  - `examples/uml-viewer.policy.edn`.

**Out of Scope (feature 07 and later):**
- Drawing Proposals under the "PROPOSAL, not instantiated in code" banner, and re-evaluating violations for a Proposal. 06 parses and validates `proposals` and includes them in the hash, so adding the drawing later will not change any `policyHash`.
- Drawing with `order`, rank badges, and ELK layer partitioning so that level 0 sits at the bottom. 06 parses `order`, and the View carries `rank`. ELK partitioning has not been verified with elkjs, so it does not belong in 06.
- A "new violations" section in the Change View header. 06 puts it first in all three `zu diff` writers, and the Change View draws the violating edges red.
- `zu policy suggest` beyond Levels; importing `.go-arch-lint.yml` (decisions.md l.21: after v1).
- Rules other than Levels and cycles, such as forbidden imports or fan-in limits.

---

## Deviations from settled answers (approved 2026-09-24 with the plan)

1. **Level ids may be any Package Tree box or package, not only top-level segments** (decisions.md l.22 says "on top-level tree segments").
   - uml-viewer's code accepts this, but its intent does not: `group-nses` groups by any id and `rank-of` (l.196) takes the longest ranked prefix, while the `level-ranks` docstring (l.175) says "Top-level segment -> rank" and every `:levels` entry in `examples/uml-viewer.policy.edn` is a top segment. So this goes beyond uml-viewer, on purpose.
   - In Go, "top-level" would be the module root's children. For most repos that is just `internal`, `cmd` and `pkg`, which is too coarse to express anything.
   - An id ranks itself and everything under it, and the longest ranked prefix wins.
   - "A component inherits the max level of its elements" (README) is not needed: zu ranks packages, and a bundle is marked through its member edges (Task 12).
   - **Doc amendments, applied by the lead at approval (not a task step):** decisions.md l.22 ("on top-level tree segments" → any Package Tree box or package; the longest ranked prefix wins), the glossary's "Level", and a note in ADR 0008.
2. **Levels are evaluated on package `imports` edges only.**
   - These are Go's `:dependency`: every cross-package call or embed implies an import of that package.
   - `edge-kinds: association` exempts a pair, as in l.279.
   - uml-viewer matches an edge-kinds pair exactly. zu matches by prefix, because a zu id is a whole import path and one rule for a subtree is what a Go repo needs.
3. **Unlisted externals stay** (uml-viewer's `collapse-graph` drops them, l.252). 04 already draws them: one oval each, or one aggregate above 20 (04 Deviation 2). Dropping them would hide real dependencies.
   - Foreign collapse gives the merged node an id that is a prefix of real module paths, such as `github.com/aws`, and `KindExternal`.
   - This does not break ADR 0008 ("never invents boxes"): it is never a Package Tree box, it only replaces externals the parser emitted, and it exists only in the lens.
   - **Reviewer check:** make sure this reading of 0008 is acceptable.
4. **Cycles are opt-in (`cycles: true`)**, and they are box cycles.
   - Go forbids import cycles between packages, so A8's cycles live between sibling Package Tree boxes.
   - Each import is lifted to the two children of its ends' lowest common box. Tarjan runs per parent box, and every arc inside a cycle is a violation.
   - Opt-in because a legacy repo's first `check` must not fail on a rule nobody asked for.
5. *Withdrawn after scrutiny (M3).* `-update-baseline` only ever removes entries, as decisions.md l.23 and the glossary say. With no Baseline it creates one and lists every violation it accepts; a Baseline written under another Policy stops `zu check` with exit 3 (see the Contract).
6. **`zu diff` exits 1 on new violations when head's Policy has rules** (decisions.md l.25 "1 stays reserved for new violations"; B9). New = present in head under head's rules and absent in base under head's rules. `diff` does not read the Baseline: B7's "pre-existing" means present at base.
   - A Levels id that names no package in head is a warning on stderr, never exit 3 (scrutiny M1): an MR that deletes or renames a ranked package must still get its summary. `zu check` enforces it. `diff` exits 3 over the Policy only when it does not parse or validate on its own (bad keys, ids, globs, a second document).
7. **Head's Policy applies to both scans of `zu diff`, and the hash-mismatch stop is gone** (the lead's ruling; amends ADR 0004).
   - `zu diff` reads `zu.policy.yaml` once, from head's commit, or from the working tree under `-worktree`, and passes it to both scans. Both IRs carry head's hash, so there is nothing left to compare.
   - The MR that adds a Policy works, and so does an MR that edits it. Scanning base under head's `exclude` means a newly excluded directory is not reported as removed.
   - The "stop on mismatch" clause dates from Policy-driven grouping, which ADR 0008 removed.
   - `zu scan -ref X` still uses X's own Policy.
   - **ADR 0004 is amended by the lead at approval; it is not a task step here.**
8. **The Change View is drawn through the lens; the printed Summary is not.**
   - `zu diff -html` applies `omit`, `omit-edges` and `foreign` to both sides, and re-summarises only when the Policy has any of them (`Lens()`), so the View's `changed` list matches its nodes.
   - The text, Markdown and JSON Summary always describe the whole change: a reviewer must see an omitted package change.
9. **A cycle marks every arc of the cycle's strongly connected component.**
   - Measured on zu with one deliberate bad import (`zu/internal/ir/bad → zu/internal/cli`): 1 Levels violation and 13 cycle arcs, because `cli` reaches every package it depends on.
   - That matches decisions.md l.40 ("cycle edges red") and gives the Baseline one stable entry per arc. It is noisy for a repo with one big cycle: hugo with `cycles: true` has 189.
   - **Consequence:** once a repo has a box cycle, any import that adds a new arc between two boxes on it is a new violation and exits 1. `-update-baseline` will not accept it, because it only removes entries. The only way to accept it is to delete `zu.baseline.json` and re-create it, which lists every accepted violation in the MR. On hugo, 189 arcs guard much of the codebase. This is the choice most likely to get `cycles: true` "muted within a week" (requirements l.138). The mitigation is that cycles are opt-in.
   - **Accepted by the lead**, who adds the decisions.md line at approval.
10. **The Policy file has no `version:` key.** Unknown keys are errors, so a later format can add one without ambiguity. N4's format version is recorded in the binary instead: `policy.Format = "1"`, printed by `zu version` as `policy-format 1`.
11. **Plain `zu diff` exits 1 on new violations; the requirements' exit table says `check, diff --strict`.** zu has no `--strict` flag. decisions.md l.25 and B9 ("a configured rule") make exit 1 the default whenever head's Policy has rules; a repo without rules never sees it, and 03 as built reserves exit 1 without using it. The requirements' table should drop `--strict` at approval.

---

## The contract

**`zu.policy.yaml`** (all keys optional; unknown keys are errors):

```yaml
exclude: ["**/*.pb.go", "**/zz_generated*.go", "third_party/**"]  # file globs; ** = any segments
order: [zu/cmd, zu/internal]        # parsed and hashed; drawn in 07
levels:                             # inner first: rank 0 is innermost
  - [zu/internal/ir, zu/internal/version]
  - zu/internal/scan                # an item is an id or a list of ids
  - zu/internal/cli
cycles: true                        # flag cycles between sibling boxes
foreign: [github.com/aws]           # externals under a prefix → one node
omit: [zu/internal/scan/testdata]   # these and everything under them
omit-edges: [{from: zu/internal/cli, to: zu/internal/version}]
edge-kinds: [{from: zu/internal/scan, to: zu/internal/cli, kind: association}]
proposals:                          # parsed, validated and hashed; drawn in 07
  - name: Clean
    layers: [{name: Domain, members: [zu/internal/ir]}]
```

- A second YAML document (`---`) is an error.
- An id is an import path or a node id. It covers itself and everything below it by whole segments: `a/b` covers `a/b/c` and not `a/bc`.
- Exclude globs: `**` matches zero or more whole segments; any other segment is a `path.Match` pattern, so `*` never crosses a slash. A run of `**` is one `**`, in matching and in the hash. Matching is dynamic programming, O(glob segments × path segments), so no glob an MR adds can stall a scan.
- Test files, `vendor/` and `testdata/` are already skipped by the scan (`internal/scan/walk.go:62`). `exclude` adds generated and vendored code by glob. `go.mod` is always read, so excluding a directory never merges a nested module into its parent.
- `policyHash` = `"sha256:" + hex(sha256(json(Normalize()) + "\n"))`. Normalisation sorts and de-duplicates every set, keeps the sequence of `order`, `levels`, `proposals` and `layers`, and drops empty keys. The empty Policy hashes to exactly `scan.DefaultPolicyHash`, so every existing IR and golden file stays valid.

**Violation** (Go `policy.Violation`, JSON in the Baseline, the diff summary and the View):

```json
{"rule": "levels", "from": "zu/internal/ir", "to": "zu/internal/cli"}
{"rule": "cycle",  "from": "zu/internal/scan", "to": "zu/internal/cli"}
```

- `levels`: `from` and `to` are packages; an import from a lower rank (inner) to a higher one (outer).
- `cycle`: `from` and `to` are sibling boxes, the arc of a cycle. A package that is also a box stands for its `#pkg` leaf when its sibling is a box inside it.
- Violations are sorted by `rule`, `from`, `to` and unique.

**`zu.baseline.json`** (committed; written sorted, 2-space indented, trailing newline):

```json
{
  "schema": "1",
  "policyHash": "sha256:…",
  "violations": [{"rule": "levels", "from": "…", "to": "…"}]
}
```

**CLI:**
- `zu check [DIR] [-ref R] [-update-baseline] [-max-parse-errors N]`
  - Scans like `zu scan` and evaluates `pol.Check`. The Baseline is read through the same tree; `-update-baseline` writes `DIR/zu.baseline.json` and is refused with `-ref`.
  - `-update-baseline` only ever removes entries: it drops the fixed ones. With no Baseline it creates one from every current violation and lists each on stderr (`zu check: created zu.baseline.json, accepting N violations:`), so the MR that adds the file shows what it accepts.
  - Stdout: each new violation as `  <rule>  <from> → <to>`, then `zu check: N new, K known, F fixed`.
  - Exit codes, checked in this order:
    - 3: a bad invocation, an unreadable Policy, a Policy with no rules, or an unreadable Baseline;
    - 2: more than N parse failures (default 0), because a file that does not parse hides its imports;
    - 3: a Levels id that matches no package (`Validate`), or a Baseline written under another Policy: `Baseline was written under Policy X; delete zu.baseline.json and re-run with -update-baseline to accept N current violations`. This holds with or without `-update-baseline`, and the file is left as it is;
    - 1: new violations;
    - 0: none.
- `zu policy init [DIR]` writes a suggested `DIR/zu.policy.yaml` whose Levels hold as written.
  - It exits 3 if the file exists, and never overwrites it (`O_EXCL`).
  - `zu policy` with anything else exits 3 and prints the usage.
- `zu diff … [-format text|markdown|json]`: when head's Policy has rules, every format writes a violations section first: new violations, then `F fixed, K pre-existing`. JSON has `"violations": {"new": [], "fixed": [], "known": 0}` after `changed`.
  - Both sides are scanned under head's Policy (Deviation 7). The 03 stop `policy changed between base and head` is removed.
  - Exit 2 (head parse failures) wins over exit 1 (new violations).
  - A Levels id that names no package in head prints `zu diff: warning: …` on stderr and does not change the exit code. Exit 3 over the Policy only when it does not parse or validate.
  - `docx/features/03-diff-ci/output.md` is updated to match (Task 10).
- `zu version` adds a line `policy-format 1`.
- **Files read by name** (the Policy and the Baseline): a symlink is followed only to a regular file inside the tree; anything else reads as missing. Each is capped at 1 MiB (`scan.MaxSmallFile`); a larger file is an error. Source files have no size cap today, and 06 adds none.

**View** (schema `"1"`, optional fields, all absent when the Policy has no rules, so 04's goldens are unchanged):
- top level: `policy: {"hash": "…", "levels": [["zu/internal/ir"], …]}`;
- nodes: `rank` (packages only; the rank of the longest ranked prefix);
- edges: `violation` (`"levels"` or `"cycle"`).

---

# Tasks

### Task 1: Parse, validate, normalise and hash the Policy

`go.yaml.in/yaml/v3` is the YAML maintainers' continuation of `gopkg.in/yaml.v3`, which is archived. It has the same API, no transitive dependencies, and `Decoder.KnownFields(true)` for strict keys. The alternatives are:
- `sigs.k8s.io/yaml`, which goes through JSON and loses line numbers;
- `goccy/go-yaml`, which is larger and whose error text is less stable.

Pin v3.0.5, the newest release at the time of planning.

**Files:**
- Modify: `go.mod`, `go.sum`
- Create: `internal/policy/policy.go`, `internal/policy/policy_test.go`

**Steps:**

- [x] **Add the dependency**

   ```bash
   go get go.yaml.in/yaml/v3@v3.0.5
   ```

   Expected result (offline, apply these instead):

   ```diff
   --- a/go.mod
   +++ b/go.mod
   @@ -3,3 +3,5 @@
    go 1.24.5
    
    require golang.org/x/mod v0.33.0
   +
   +require go.yaml.in/yaml/v3 v3.0.5
   ```

   ```diff
   --- a/go.sum
   +++ b/go.sum
   @@ -1,2 +1,4 @@
   +go.yaml.in/yaml/v3 v3.0.5 h1:N6y/pJk8buWs9NY5ERU2HSMfm+IuD/OtfdAnq6kESPw=
   +go.yaml.in/yaml/v3 v3.0.5/go.mod h1:HVTZu1O7/Vkt2N+BFy8Zza+lnLsABggaTM2ZpNIGuKg=
    golang.org/x/mod v0.33.0 h1:tHFzIWbBifEmbwtGz65eaWyGiGZatSrT9prnU8DbVL8=
    golang.org/x/mod v0.33.0/go.mod h1:swjeQEj+6r7fODbD2cqrnje9PnziFuw4bmLbBZFrQ5w=
   ```

- [x] **Write the failing test**

   <!-- file: internal/policy/policy_test.go -->
   ```go
   package policy

   import (
   	"strings"
   	"testing"

   	"zu/internal/scan"
   )

   const full = `# zu's own Policy, abridged
   exclude: ["**/*.pb.go", "web/node_modules/**"]
   order: [zu/internal, zu/cmd]
   levels:
     - [zu/internal/ir, zu/internal/version]
     - zu/internal/scan
     - [zu/internal/cli]
   cycles: true
   foreign: [github.com/aws]
   omit: [zu/internal/scan/testdata]
   omit-edges:
     - {from: zu/internal/cli, to: zu/internal/version}
   edge-kinds:
     - {from: zu/internal/scan, to: zu/internal/cli, kind: association}
   proposals:
     - name: Clean
       layers:
         - {name: Domain, members: [zu/internal/ir]}
         - {name: Adapters, members: [zu/internal/cli, zu/internal/gitref]}
   `

   func TestParseReadsEveryKey(t *testing.T) {
   	p, err := Parse([]byte(full))
   	if err != nil {
   		t.Fatal(err)
   	}
   	if len(p.Exclude) != 2 || len(p.Order) != 2 || !p.Cycles || len(p.Foreign) != 1 ||
   		len(p.Omit) != 1 || len(p.OmitEdges) != 1 || len(p.EdgeKinds) != 1 || len(p.Proposals) != 1 {
   		t.Fatalf("parsed %+v", p)
   	}
   	if got := len(p.Levels); got != 3 || len(p.Levels[0]) != 2 || p.Levels[1][0] != "zu/internal/scan" {
   		t.Fatalf("levels = %v", p.Levels)
   	}
   	if !p.Rules() {
   		t.Error("levels and cycles are rules")
   	}
   }

   func TestParseRejects(t *testing.T) {
   	for _, tc := range []struct{ name, yaml, want string }{
   		{"unknown key", "layers: [a]\n", "field layers not found"},
   		{"id in two levels", "levels: [a, [b, a]]\n", `"a" is already in levels[0]`},
   		{"empty level", "levels: [[]]\n", "empty level"},
   		{"bad id", "omit: [\"a b\"]\n", `bad id "a b"`},
   		{"trailing slash", "order: [a/]\n", `bad id "a/"`},
   		{"kind", "edge-kinds: [{from: a, to: b, kind: uses}]\n", `kind "uses"`},
   		{"glob", "exclude: [\"a/[\"]\n", "exclude[0]"},
   		{"level shape", "levels: [{a: b}]\n", "a level is an id or a list"},
   		{"proposal name", "proposals: [{layers: [{name: x, members: [a]}]}]\n", "unique name"},
   		{"proposal layers", "proposals: [{name: p, layers: []}]\n", "no layers"},
   		{"second document", "cycles: true\n---\nlevels: [a]\n", "second"},
   	} {
   		t.Run(tc.name, func(t *testing.T) {
   			_, err := Parse([]byte(tc.yaml))
   			if err == nil || !strings.Contains(err.Error(), tc.want) {
   				t.Fatalf("err = %v, want it to contain %q", err, tc.want)
   			}
   			if !strings.HasPrefix(err.Error(), FileName+": ") {
   				t.Errorf("err %q does not name the file", err)
   			}
   		})
   	}
   }

   func TestEmptyPolicyIsTheDefault(t *testing.T) {
   	for _, src := range []string{"", "# nothing yet\n", "{}\n"} {
   		p, err := Parse([]byte(src))
   		if err != nil {
   			t.Fatal(err)
   		}
   		if got := p.Hash(); got != scan.DefaultPolicyHash {
   			t.Errorf("Hash(%q) = %s, want scan.DefaultPolicyHash %s", src, got, scan.DefaultPolicyHash)
   		}
   		if p.Rules() {
   			t.Errorf("%q has rules", src)
   		}
   	}
   }

   func TestHashIgnoresFormAndCatchesMeaning(t *testing.T) {
   	base := "levels: [[a, b], c]\nomit: [x, y]\n"
   	hash := func(s string) string {
   		t.Helper()
   		p, err := Parse([]byte(s))
   		if err != nil {
   			t.Fatal(err)
   		}
   		return p.Hash()
   	}
   	want := hash(base)
   	for _, same := range []string{
   		"# a comment\nomit: [y, x, x]\nlevels:\n  - [b, a]\n  - [c]\n", // comments, key order, set order, duplicates
   	} {
   		if got := hash(same); got != want {
   			t.Errorf("%q hashes differently from %q", same, base)
   		}
   	}
   	if hash("exclude: [\"a/**/**/b\"]\n") != hash("exclude: [\"a/**/b\"]\n") {
   		t.Error("a run of ** must hash like one **")
   	}
   	for _, other := range []string{
   		"levels: [c, [a, b]]\nomit: [x, y]\n", // level order is meaning
   		"levels: [[a, b], c]\nomit: [x]\n",
   		"levels: [[a, b], c]\nomit: [x, y]\ncycles: true\n",
   	} {
   		if got := hash(other); got == want {
   			t.Errorf("%q hashes like %q", other, base)
   		}
   	}
   }
   ```

- [x] **Run it:** `go test ./internal/policy`. Expected: FAIL (`undefined: Parse`).

- [x] **Implement**

   <!-- file: internal/policy/policy.go -->
   ```go
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
   ```

- [x] **Run it:** `go test ./internal/policy`. Expected: `ok`. `TestEmptyPolicyIsTheDefault` proves the empty Policy hashes to `scan.DefaultPolicyHash`. `TestParseRejects` covers a second YAML document, and `TestHashIgnoresFormAndCatchesMeaning` a run of `**`. `Format` is printed by `zu version` in Task 8.

### Task 2: Exclude globs, and reading the Policy safely from any tree

- `Match` is dynamic programming over (glob segment, path segment), so its cost is O(glob segments × path segments) however many `**` a glob has. The backtracking matcher it replaces took about 550 ms per file for 8 `**` on a 25-segment path (scrutiny M2), and a glob arrives in an MR.
- `Load` goes through a tree's `ReadFile`, so a commit scan reads the committed Policy. A commit tree must report a missing file the way the disk does, as `fs.ErrNotExist`, or "no Policy" would be indistinguishable from a broken read.
- The Policy and the Baseline are the only files zu reads by name rather than from `Files`, so `dirTree.ReadFile` (and `listTree`, which embeds it) now checks what it reads: `Lstat` the path; a symlink must satisfy `linkedFileInside`, and anything but a regular file or such a link is `fs.ErrNotExist` (scrutiny B1: `zu.policy.yaml -> ../secret.txt` was read, and its first bytes echoed in the YAML error). A commit tree already resolves links with `ResolveLinks`.
- `scan.ReadSmall` caps a by-name read at 1 MiB (`MaxSmallFile`). On disk it reads through `io.LimitReader`, one byte past the cap. A commit's blob is read whole by `git cat-file`, as every commit read is, and then checked. Source files keep what they have today, which is no cap.

**Files:**
- Create: `internal/policy/glob.go`, `internal/policy/glob_test.go`
- Modify: `internal/gitref/tree.go`, `internal/gitref/tree_test.go`, `internal/scan/tree.go`, `internal/scan/security_test.go`

**Steps:**

- [ ] **Write the failing tests**

   <!-- file: internal/policy/glob_test.go -->
   ```go
   package policy

   import (
   	"errors"
   	"io/fs"
   	"strings"
   	"testing"
   	"time"
   )

   func TestMatch(t *testing.T) {
   	for _, tc := range []struct {
   		glob, rel string
   		want      bool
   	}{
   		{"**/*.pb.go", "api/v1/user.pb.go", true},
   		{"**/*.pb.go", "user.pb.go", true}, // ** matches zero segments
   		{"**/*.pb.go", "api/v1/user.go", false},
   		{"*.pb.go", "api/user.pb.go", false}, // * never crosses a slash
   		{"gen/**", "gen/a/b.go", true},
   		{"gen/**", "gen", true},
   		{"gen/**", "general/b.go", false},
   		{"**/zz_generated*.go", "pkg/apis/zz_generated.deepcopy.go", true},
   		{"a/**/b/*.go", "a/x/y/b/c.go", true},
   		{"a/**/b/*.go", "a/b/c.go", true},
   		{"a/**/b/*.go", "a/b/x/c.go", false},
   		{"a/**/**/b.go", "a/b.go", true}, // a run of ** is one **
   		{"**", "any/depth/x.go", true},
   	} {
   		if got := Match(tc.glob, tc.rel); got != tc.want {
   			t.Errorf("Match(%q, %q) = %v, want %v", tc.glob, tc.rel, got, tc.want)
   		}
   	}
   }

   // Matching must not be exponential in the number of "**": the backtracking
   // matcher took about 550 ms per call for this glob and path.
   func TestMatchIsPolynomialInStars(t *testing.T) {
   	glob := strings.Repeat("**/", 8) + "nomatch.go"
   	rel := strings.Repeat("d/", 24) + "x.go" // 25 segments
   	start := time.Now()
   	for range 20 {
   		if Match(glob, rel) {
   			t.Fatal("matched")
   		}
   	}
   	if d := time.Since(start); d > time.Second {
   		t.Fatalf("20 matches took %v, want well under 1s", d)
   	}
   }

   func TestExcluded(t *testing.T) {
   	p, err := Parse([]byte("exclude: [\"**/*.pb.go\", \"third_party/**\"]\n"))
   	if err != nil {
   		t.Fatal(err)
   	}
   	for rel, want := range map[string]bool{
   		"api/user.pb.go": true, "third_party/x/y.go": true, "api/user.go": false,
   	} {
   		if got := p.Excluded(rel); got != want {
   			t.Errorf("Excluded(%q) = %v, want %v", rel, got, want)
   		}
   	}
   }

   func TestLoad(t *testing.T) {
   	missing := func(string) ([]byte, error) { return nil, fs.ErrNotExist }
   	p, err := Load(missing)
   	if err != nil || p.Rules() || len(p.Exclude) > 0 {
   		t.Fatalf("missing file: %+v, %v", p, err)
   	}
   	broken := func(string) ([]byte, error) { return nil, errors.New("disk on fire") }
   	if _, err := Load(broken); err == nil {
   		t.Error("a read error must not pass as no Policy")
   	}
   	bad := func(string) ([]byte, error) { return []byte("levls: []\n"), nil }
   	if _, err := Load(bad); err == nil {
   		t.Error("a malformed file must fail")
   	}
   	good := func(rel string) ([]byte, error) {
   		if rel != FileName {
   			t.Errorf("read %q, want %q", rel, FileName)
   		}
   		return []byte("cycles: true\n"), nil
   	}
   	if p, err := Load(good); err != nil || !p.Cycles {
   		t.Fatalf("good file: %+v, %v", p, err)
   	}
   }
   ```

   ```diff
   --- a/internal/gitref/tree_test.go
   +++ b/internal/gitref/tree_test.go
   @@ -2,6 +2,8 @@
    
    import (
    	"context"
   +	"errors"
   +	"io/fs"
    	"os"
    	"path/filepath"
    	"slices"
   @@ -137,3 +139,20 @@
    		t.Error("Resolve outside a repository must fail")
    	}
    }
   +
   +// A missing file reads as fs.ErrNotExist, as on disk, so a caller can tell
   +// "no Policy file at this commit" from a broken read.
   +func TestCommitTreeMissingFileIsNotExist(t *testing.T) {
   +	dir, commit := linkRepo(t)
   +	tree, err := OpenCommit(context.Background(), dir, commit)
   +	if err != nil {
   +		t.Fatal(err)
   +	}
   +	defer tree.Close()
   +	if _, err := tree.ReadFile("zu.policy.yaml"); !errors.Is(err, fs.ErrNotExist) {
   +		t.Fatalf("ReadFile(missing) = %v, want fs.ErrNotExist", err)
   +	}
   +	if _, err := tree.ReadFile("a/a.go"); err != nil {
   +		t.Fatalf("ReadFile(present) = %v", err)
   +	}
   +}
   ```

   ```diff
   --- a/internal/scan/security_test.go
   +++ b/internal/scan/security_test.go
   @@ -2,6 +2,8 @@
    
    import (
    	"bytes"
   +	"errors"
   +	"io/fs"
    	"os"
    	"os/exec"
    	"path/filepath"
   @@ -56,6 +58,51 @@
    	}
    }
    
   +// The Policy and the Baseline are read by name, not from Files: a planted
   +// link such as zu.policy.yaml -> ../secret.txt must not be followed out of
   +// the tree, and neither file may be read beyond MaxSmallFile.
   +func TestReadFileByNameStaysInTheTree(t *testing.T) {
   +	parent := t.TempDir()
   +	if err := os.WriteFile(filepath.Join(parent, "secret.txt"), []byte("SECRET\n"), 0o600); err != nil {
   +		t.Fatal(err)
   +	}
   +	root := filepath.Join(parent, "repo")
   +	if err := os.Mkdir(root, 0o755); err != nil {
   +		t.Fatal(err)
   +	}
   +	for rel, body := range map[string]string{
   +		"go.mod":   "module example.com/m\n",
   +		"big.json": strings.Repeat("x", MaxSmallFile+1),
   +	} {
   +		if err := os.WriteFile(filepath.Join(root, rel), []byte(body), 0o644); err != nil {
   +			t.Fatal(err)
   +		}
   +	}
   +	for link, target := range map[string]string{
   +		"zu.policy.yaml": "../secret.txt", // leaves the tree
   +		"in.mod":         "go.mod",        // stays inside
   +	} {
   +		if err := os.Symlink(target, filepath.Join(root, link)); err != nil {
   +			t.Skipf("symlinks unsupported: %v", err)
   +		}
   +	}
   +	list, err := ListTree(root, []string{"go.mod"})
   +	if err != nil {
   +		t.Fatal(err)
   +	}
   +	for name, tr := range map[string]Tree{"dir": dirOf(t, root), "list": list} {
   +		if data, err := tr.ReadFile("zu.policy.yaml"); !errors.Is(err, fs.ErrNotExist) {
   +			t.Errorf("%s: ReadFile through an escaping link = %q, %v; want fs.ErrNotExist", name, data, err)
   +		}
   +		if data, err := ReadSmall(tr, "in.mod"); err != nil || !strings.HasPrefix(string(data), "module") {
   +			t.Errorf("%s: in-tree link = %q, %v", name, data, err)
   +		}
   +		if _, err := ReadSmall(tr, "big.json"); err == nil || !strings.Contains(err.Error(), "larger than") {
   +			t.Errorf("%s: ReadSmall past the cap: %v", name, err)
   +		}
   +	}
   +}
   +
    // TestScanLinksNoNetworkCode guards REQ-042: the scanner cannot open a
    // connection if no networking package is linked into it.
    func TestScanLinksNoNetworkCode(t *testing.T) {
   ```

- [ ] **Run them:** `go test ./internal/policy ./internal/gitref ./internal/scan`. Expected: FAIL (`undefined: Match`; `ReadFile(missing) = …: no such file in the commit, want fs.ErrNotExist`; `undefined: ReadSmall` and `MaxSmallFile`).

- [ ] **Implement**

   <!-- file: internal/policy/glob.go -->
   ```go
   package policy

   import (
   	"errors"
   	"fmt"
   	"io/fs"
   	"path"
   	"strings"
   )

   // Match reports whether a repo-relative slash path matches glob. A "**"
   // segment matches zero or more whole segments; every other segment is a
   // path.Match pattern, so "*" never crosses a slash.
   func Match(glob, rel string) bool {
   	return matchSegs(strings.Split(collapseGlob(glob), "/"), strings.Split(rel, "/"))
   }

   // matchSegs is dynamic programming over (glob segment, path segment), so it
   // costs O(len(g) × len(p)) whatever the number of "**": a glob comes from an
   // MR and must not be able to stall a scan.
   func matchSegs(g, p []string) bool {
   	// next[j] reports whether g[i+1:] matches p[j:].
   	next := make([]bool, len(p)+1)
   	next[len(p)] = true
   	for i := len(g) - 1; i >= 0; i-- {
   		cur := make([]bool, len(p)+1)
   		for j := len(p); j >= 0; j-- {
   			switch {
   			case g[i] == "**": // zero segments, or one and still in **
   				cur[j] = next[j] || (j < len(p) && cur[j+1])
   			case j < len(p):
   				ok, _ := path.Match(g[i], p[j])
   				cur[j] = ok && next[j+1]
   			}
   		}
   		next = cur
   	}
   	return next[0]
   }

   // Excluded reports whether the scan skips the file at rel. Test files are
   // skipped whatever the Policy says; vendor and testdata directories are
   // pruned by the scan itself.
   func (p *Policy) Excluded(rel string) bool {
   	for _, g := range p.Exclude {
   		if Match(g, rel) {
   			return true
   		}
   	}
   	return false
   }

   // Load reads the Policy file through read (a tree's ReadFile). A missing
   // file is the empty Policy: the Package Tree with no rules.
   func Load(read func(rel string) ([]byte, error)) (*Policy, error) {
   	data, err := read(FileName)
   	if errors.Is(err, fs.ErrNotExist) {
   		return &Policy{}, nil
   	}
   	if err != nil {
   		return nil, fmt.Errorf("%s: %w", FileName, err)
   	}
   	return Parse(data)
   }
   ```

   ```diff
   --- a/internal/gitref/tree.go
   +++ b/internal/gitref/tree.go
   @@ -6,6 +6,7 @@
    	"errors"
    	"fmt"
    	"io"
   +	"io/fs"
    	"os"
    	"os/exec"
    	"slices"
   @@ -130,7 +131,7 @@
    func (t *CommitTree) ReadFile(rel string) ([]byte, error) {
    	target, ok := t.resolve(rel)
    	if !ok {
   -		return nil, fmt.Errorf("%s: no such file in the commit", rel)
   +		return nil, fmt.Errorf("%s: %w", rel, fs.ErrNotExist)
    	}
    	return t.blob(t.entries[target].oid)
    }
   ```

   ```diff
   --- a/internal/scan/tree.go
   +++ b/internal/scan/tree.go
   @@ -3,6 +3,7 @@
    import (
    	"errors"
    	"fmt"
   +	"io"
    	"io/fs"
    	"os"
    	"path"
   @@ -22,8 +23,10 @@
    	// are never followed. Problems with single entries go in errs; err
    	// means the tree is unusable.
    	Files() (files []string, errs []ir.ParseError, err error)
   -	// ReadFile returns the content of a path from Files, following the
   -	// symlink if it is one.
   +	// ReadFile returns the content of a path from Files, or of a file zu
   +	// looks up by name such as the Policy. A symlink is followed only to a
   +	// regular file inside the tree, as Files would list it; anything else
   +	// (a link leaving the tree, a directory, a device) is fs.ErrNotExist.
    	ReadFile(rel string) ([]byte, error)
    }
    
   @@ -144,9 +147,60 @@
    }
    
    func (d *dirTree) ReadFile(rel string) ([]byte, error) {
   -	return os.ReadFile(filepath.Join(d.root, filepath.FromSlash(rel))) // #nosec G304 -- rel comes from Files
   +	return d.readMax(rel, -1)
   +}
   +
   +// readMax reads rel, at most limit bytes when limit >= 0. rel must be a
   +// regular file or a symlink that linkedFileInside accepts: the Policy and
   +// the Baseline are read by name, not from Files, so a planted link must not
   +// reach outside the root.
   +func (d *dirTree) readMax(rel string, limit int64) ([]byte, error) {
   +	p := filepath.Join(d.root, filepath.FromSlash(rel))
   +	info, err := os.Lstat(p)
   +	if err != nil {
   +		return nil, err
   +	}
   +	switch {
   +	case info.Mode().IsRegular():
   +	case info.Mode()&fs.ModeSymlink != 0 && d.linkedFileInside(p):
   +	default:
   +		return nil, &fs.PathError{Op: "read", Path: rel, Err: fs.ErrNotExist}
   +	}
   +	f, err := os.Open(p) // #nosec G304 -- a regular file inside the root, checked above
   +	if err != nil {
   +		return nil, err
   +	}
   +	defer f.Close()
   +	var r io.Reader = f
   +	if limit >= 0 {
   +		r = io.LimitReader(f, limit)
   +	}
   +	return io.ReadAll(r)
    }
    
   +// MaxSmallFile caps the files zu reads whole by name, the Policy and the
   +// Baseline. Source files have no cap.
   +const MaxSmallFile = 1 << 20
   +
   +// ReadSmall reads rel from t and fails if it is larger than MaxSmallFile.
   +// On disk it reads at most one byte more than the cap; a commit's blob is
   +// read by git and then checked.
   +func ReadSmall(t Tree, rel string) ([]byte, error) {
   +	var data []byte
   +	var err error
   +	if d, ok := t.(interface {
   +		readMax(string, int64) ([]byte, error)
   +	}); ok {
   +		data, err = d.readMax(rel, MaxSmallFile+1)
   +	} else {
   +		data, err = t.ReadFile(rel)
   +	}
   +	if err == nil && len(data) > MaxSmallFile {
   +		return nil, fmt.Errorf("%s is larger than %d bytes", rel, MaxSmallFile)
   +	}
   +	return data, err
   +}
   +
    // linkedFileInside reports whether the symlink at p resolves to a regular
    // file inside the root.
    func (d *dirTree) linkedFileInside(p string) bool {
   ```

- [ ] **Run them:** `go test ./internal/policy ./internal/gitref ./internal/scan`. Expected: `ok` for all three. `TestMatchIsPolynomialInStars` runs 20 matches of the 8-`**` glob in microseconds, against a 1 s bound (the old matcher needed about 11 s). `TestReadFileByNameStaysInTheTree` covers both `DirTree` and `ListTree`.

### Task 3: The scan skips excluded files and records the hash

**Files:**
- Create: `internal/scan/exclude_test.go`
- Modify: `internal/scan/scan.go`, `internal/scan/walk.go`, `internal/scan/resolve_test.go`, `internal/scan/helpers_test.go`

**Steps:**

- [ ] **Write the failing test.** It uses the existing `testdata/shop` fixture: `tools/` is a nested module and `web/app.ts` is an unsupported file.

   <!-- file: internal/scan/exclude_test.go -->
   ```go
   package scan

   import (
   	"context"
   	"strings"
   	"testing"

   	"zu/internal/ir"
   )

   // The Policy's exclude globs drop files before parsing. go.mod files are
   // always read, so an excluded directory still fences off a nested module.
   func TestRunExcludesFilesAndStampsThePolicy(t *testing.T) {
   	root := fixture(t, "shop")
   	excluded := func(rel string) bool {
   		return strings.HasSuffix(rel, "zz_generated.go") || strings.HasPrefix(rel, "tools/") ||
   			strings.HasPrefix(rel, "web/")
   	}
   	doc, _, err := Run(context.Background(), Options{Tree: dirOf(t, root), Exclude: excluded, PolicyHash: "sha256:p"})
   	if err != nil {
   		t.Fatal(err)
   	}
   	if doc.PolicyHash != "sha256:p" {
   		t.Errorf("PolicyHash = %q, want the caller's", doc.PolicyHash)
   	}
   	for _, n := range doc.Nodes {
   		for _, l := range n.Locations {
   			if excluded(l.Path) {
   				t.Errorf("node %s located in excluded %s", n.ID, l.Path)
   			}
   		}
   		if n.ID == "example.com/shop/tools/gen" {
   			t.Error("the tools module's package was scanned")
   		}
   		if strings.HasPrefix(n.ID, "example.com/shop/tools") && n.Kind == ir.KindPackage {
   			t.Errorf("excluded nested module leaked into the root module as %s", n.ID)
   		}
   	}
   	if doc.Unsupported[".ts"] != 0 {
   		t.Errorf("excluded web/app.ts still counted: %v", doc.Unsupported)
   	}

   	plain, _, err := Run(context.Background(), Options{Tree: dirOf(t, root)})
   	if err != nil {
   		t.Fatal(err)
   	}
   	if plain.PolicyHash != DefaultPolicyHash {
   		t.Errorf("no policy: PolicyHash = %q, want DefaultPolicyHash", plain.PolicyHash)
   	}
   }
   ```

- [ ] **Run it:** `go test ./internal/scan -run Excludes`. Expected: FAIL (`unknown field Exclude`).

- [ ] **Implement**

   ```diff
   --- a/internal/scan/scan.go
   +++ b/internal/scan/scan.go
   @@ -3,6 +3,7 @@
    package scan
    
    import (
   +	"cmp"
    	"context"
    	"runtime"
    	"sync"
   @@ -18,6 +19,11 @@
    type Options struct {
    	Tree    Tree // what to scan: DirTree, or a commit read from git
    	Workers int  // parallel parsers; 0 means GOMAXPROCS
   +	// Exclude skips source files by repo-relative path (the Policy's
   +	// exclude globs). go.mod files are always read: they fence modules.
   +	Exclude func(rel string) bool
   +	// PolicyHash is recorded in the IR; "" means DefaultPolicyHash.
   +	PolicyHash string
    }
    
    // Stats summarise a scan for the one-line report.
   @@ -32,7 +38,7 @@
    // It fails only when the tree is unusable or ctx is cancelled; unparseable
    // files are recorded in the IR instead.
    func Run(ctx context.Context, opts Options) (*ir.IR, Stats, error) {
   -	w, err := walkTree(opts.Tree)
   +	w, err := walkTree(opts.Tree, opts.Exclude)
    	if err != nil {
    		return nil, Stats{}, err
    	}
   @@ -42,7 +48,7 @@
    	}
    	doc := assemble(w, facts)
    	doc.Grouping = "tree"
   -	doc.PolicyHash = DefaultPolicyHash
   +	doc.PolicyHash = cmp.Or(opts.PolicyHash, DefaultPolicyHash)
    
    	st := Stats{ParseErrors: len(doc.ParseErrors)}
    	for _, n := range doc.Nodes {
   ```

   ```diff
   --- a/internal/scan/walk.go
   +++ b/internal/scan/walk.go
   @@ -45,8 +45,9 @@
    }
    
    // walkTree lists the Go files to scan in t, discovers modules, and counts
   -// unsupported source files. The only error is an unusable tree.
   -func walkTree(t Tree) (*walkResult, error) {
   +// unsupported source files, skipping what exclude matches (nil: nothing)
   +// except go.mod. The only error is an unusable tree.
   +func walkTree(t Tree, exclude func(rel string) bool) (*walkResult, error) {
    	files, errs, err := t.Files()
    	if err != nil {
    		return nil, err
   @@ -55,6 +56,9 @@
    	var goFiles []string
    	for _, rel := range files {
    		name := path.Base(rel)
   +		if name != "go.mod" && exclude != nil && exclude(rel) {
   +			continue
   +		}
    		switch ext := path.Ext(name); {
    		case name == "go.mod":
    			w.readModule(t, rel)
   ```

   ```diff
   --- a/internal/scan/resolve_test.go
   +++ b/internal/scan/resolve_test.go
   @@ -12,7 +12,7 @@
    	t.Helper()
    	root := tree(t, files)
    	d := dirOf(t, root)
   -	w, err := walkTree(d)
   +	w, err := walkTree(d, nil)
    	if err != nil {
    		t.Fatal(err)
    	}
   ```

   ```diff
   --- a/internal/scan/helpers_test.go
   +++ b/internal/scan/helpers_test.go
   @@ -39,5 +39,5 @@
    	if err != nil {
    		return nil, err
    	}
   -	return walkTree(d)
   +	return walkTree(d, nil)
    }
   ```

- [ ] **Run:** `go test ./internal/scan`. Expected: `ok`. `shop.golden.json` and `parity_test.go` are unchanged, because no Policy means no exclusions and the default hash.

### Task 4: `zu scan` and `zu diff` read the Policy file

- The `scanTree` seam in `internal/cli/diff.go` scans a tree under a given Policy; `loadPolicy` reads a tree's Policy file through `scan.ReadSmall`.
- `scanSource` (in `scan.go`) is what `zu scan`, and later `zu check` and `zu policy init`, call: it loads the Policy at the source's own root and scans under it, so `zu scan -ref X` uses X's Policy.
- `zu diff` opens head first (the commit, or the working tree under `-worktree`), scans it with `scanSource`, and scans base under the Policy it returned (Deviation 7). The Policy is loaded once. The 03 hash-mismatch stop and its test, `TestDiffPolicyChanged`, are removed; `TestDiffScansBothSidesUnderHeadsPolicy` replaces them.

**Files:**
- Create: `internal/cli/policy_scan_test.go`
- Modify: `internal/cli/diff.go`, `internal/cli/scan.go`, `internal/cli/diff_test.go`, `internal/scan/selfscan_test.go`

**Steps:**

- [ ] **Write the failing tests**

   <!-- file: internal/cli/policy_scan_test.go -->
   ```go
   package cli

   import (
   	"os"
   	"path/filepath"
   	"strings"
   	"testing"

   	"zu/internal/policy"
   	"zu/internal/scan"
   )

   func TestScanReadsThePolicyFile(t *testing.T) {
   	dir := repo(t, map[string]string{
   		"go.mod":         "module example.com/m\n",
   		"a/a.go":         "package a\n",
   		"gen/gen.pb.go":  "package gen\n",
   		"zu.policy.yaml": "exclude: [\"**/*.pb.go\"]\ncycles: true\n",
   	})
   	if code, _, errOut := run("scan", dir); code != ExitOK {
   		t.Fatalf("exit %d: %s", code, errOut)
   	}
   	doc := readIR(t, filepath.Join(dir, ".zu", "ir", "worktree.json"))
   	for _, n := range doc.Nodes {
   		if n.ID == "example.com/m/gen" {
   			t.Error("excluded gen/gen.pb.go was scanned")
   		}
   	}
   	if doc.PolicyHash == scan.DefaultPolicyHash || !strings.HasPrefix(doc.PolicyHash, "sha256:") {
   		t.Errorf("PolicyHash = %q, want the file's hash", doc.PolicyHash)
   	}
   }

   func TestScanRejectsABadPolicyFile(t *testing.T) {
   	dir := repo(t, map[string]string{
   		"go.mod":         "module example.com/m\n",
   		"a/a.go":         "package a\n",
   		"zu.policy.yaml": "levles: [a]\n",
   	})
   	code, out, errOut := run("scan", dir)
   	if code != ExitBadInvocation || out != "" || !strings.Contains(errOut, "zu.policy.yaml") || !strings.Contains(errOut, "levles") {
   		t.Fatalf("exit %d, stdout %q, stderr %q", code, out, errOut)
   	}
   }

   // A Policy file that links out of the repository is not read: the scan
   // runs as if there were none, and nothing of the target reaches stderr.
   func TestScanDoesNotFollowAPolicyLinkOutOfTheRepo(t *testing.T) {
   	dir := repo(t, map[string]string{
   		"go.mod": "module example.com/m\n",
   		"a/a.go": "package a\n",
   	})
   	if err := os.WriteFile(filepath.Join(filepath.Dir(dir), "secret.txt"), []byte("SECRET_TOKEN\n"), 0o600); err != nil {
   		t.Fatal(err)
   	}
   	if err := os.Symlink("../secret.txt", filepath.Join(dir, policy.FileName)); err != nil {
   		t.Skipf("symlinks unsupported: %v", err)
   	}
   	code, _, errOut := run("scan", dir)
   	if code != ExitOK || strings.Contains(errOut, "SECRET") {
   		t.Fatalf("exit %d, stderr %q", code, errOut)
   	}
   	if doc := readIR(t, filepath.Join(dir, ".zu", "ir", "worktree.json")); doc.PolicyHash != scan.DefaultPolicyHash {
   		t.Errorf("PolicyHash = %q, want the default: the link is not a Policy", doc.PolicyHash)
   	}
   }
   ```

   ```diff
   --- a/internal/cli/diff_test.go
   +++ b/internal/cli/diff_test.go
   @@ -9,8 +9,7 @@
    	"testing"
    
    	"zu/internal/diff"
   -	"zu/internal/ir"
   -	"zu/internal/scan"
   +	"zu/internal/policy"
    )
    
    // diffRepo commits a two-package module on main, then branches feat and
   @@ -195,22 +194,43 @@
    	}
    }
    
   -func TestDiffPolicyChanged(t *testing.T) {
   -	diffRepo(t)
   -	old := scanTree
   -	t.Cleanup(func() { scanTree = old })
   -	calls := 0
   -	scanTree = func(ctx context.Context, tree scan.Tree) (*ir.IR, scan.Stats, error) {
   -		doc, stats, err := old(ctx, tree)
   -		if calls++; calls == 2 && err == nil {
   -			doc.PolicyHash = "sha256:other"
   -		}
   -		return doc, stats, err
   +// Head's Policy governs both sides (ADR 0004): the MR that adds a Policy is
   +// diffed like any other, and a package it excludes is excluded at base too,
   +// so excluding it is not a removal. Under -worktree the working tree's
   +// Policy governs.
   +func TestDiffScansBothSidesUnderHeadsPolicy(t *testing.T) {
   +	needGit(t)
   +	dir := repo(t, map[string]string{
   +		"go.mod":        "module example.com/m\n",
   +		"a/a.go":        "package a\n",
   +		"gen/gen.pb.go": "package gen\n\nfunc Old() {}\n",
   +	})
   +	git(t, dir, "init", "-q", "-b", "main")
   +	git(t, dir, "add", "-A")
   +	git(t, dir, "commit", "-q", "-m", "base")
   +	git(t, dir, "checkout", "-q", "-b", "feat")
   +	writeFile(t, dir, "gen/gen.pb.go", "package gen\n\nfunc New() {}\n")
   +	writeFile(t, dir, policy.FileName, "exclude: [\"**/*.pb.go\"]\n")
   +	git(t, dir, "add", "-A")
   +	git(t, dir, "commit", "-q", "-m", "add a Policy")
   +	t.Chdir(dir)
   +	code, out, errOut := run("diff", "main", "-format", "json")
   +	if code != ExitOK {
   +		t.Fatalf("the MR adding a Policy: exit %d, stderr %q", code, errOut)
    	}
   -	code, out, errOut := run("diff", "main")
   -	if code != ExitBadInvocation || out != "" || !strings.Contains(errOut, "policy changed") {
   -		t.Fatalf("exit %d, stdout %q, stderr %q", code, out, errOut)
   +	if s := summaryOf(t, out); s.Changed {
   +		t.Errorf("gen is excluded on both sides, want no change: %+v", s.Packages)
    	}
   +
   +	writeFile(t, dir, policy.FileName, "order: [example.com/m/a]\n") // no exclude
   +	code, out, errOut = run("diff", "main", "-worktree", "-format", "json")
   +	if code != ExitOK {
   +		t.Fatalf("-worktree: exit %d, stderr %q", code, errOut)
   +	}
   +	s := summaryOf(t, out)
   +	if len(s.Packages) != 1 || s.Packages[0].ID != "example.com/m/gen" || s.Packages[0].Status != "modified" {
   +		t.Errorf("under the working tree's Policy gen is scanned on both sides and modified: %+v", s.Packages)
   +	}
    }
    
    func TestDiffFromSubdirectory(t *testing.T) {
   ```

- [ ] **Run them:** `go test ./internal/cli -run Policy`. Expected: FAIL (the `.pb.go` package is scanned; `PolicyHash` is the default; the MR that adds a Policy exits 3 with "policy changed"). `TestScanDoesNotFollowAPolicyLinkOutOfTheRepo` already passes: it guards Task 2's fix end to end.

- [ ] **Implement**

   ```diff
   --- a/internal/cli/diff.go
   +++ b/internal/cli/diff.go
   @@ -11,14 +11,22 @@
    	"zu/internal/diff"
    	"zu/internal/gitref"
    	"zu/internal/ir"
   +	"zu/internal/policy"
    	"zu/internal/scan"
    )
    
   -// scanTree is a seam for tests: how zu diff scans one side.
   -var scanTree = func(ctx context.Context, tree scan.Tree) (*ir.IR, scan.Stats, error) {
   -	return scan.Run(ctx, scan.Options{Tree: tree})
   +// scanTree is a seam for tests: how zu scans one tree under a Policy, which
   +// decides the files skipped and the hash the IR records.
   +var scanTree = func(ctx context.Context, tree scan.Tree, pol *policy.Policy) (*ir.IR, scan.Stats, error) {
   +	return scan.Run(ctx, scan.Options{Tree: tree, Exclude: pol.Excluded, PolicyHash: pol.Hash()})
    }
    
   +// loadPolicy reads the Policy file at the root of tree, capped at
   +// scan.MaxSmallFile. A missing file is the empty Policy.
   +func loadPolicy(tree scan.Tree) (*policy.Policy, error) {
   +	return policy.Load(func(rel string) ([]byte, error) { return scan.ReadSmall(tree, rel) })
   +}
   +
    // runDiff implements `zu diff <base> [head] [-format text|markdown|json]
    // [-worktree [-include-ignored]] [-max-parse-errors N] [-html file
    // [-link-template T]]`: the Structural Summary of head against the
   @@ -80,10 +88,23 @@
    		return bad("%v", err)
    	}
    
   -	// One side at a time, so peak memory is two IRs, not two scans.
   -	// The trees stay open while -html needs to read changed files.
   -	baseDoc, baseTree, err := scanCommit(ctx, top, mb)
   +	// Head's Policy governs both sides (ADR 0004): scan head under its own
   +	// Policy file, then base under the same one, so a change to the Policy
   +	// never shows up as a change to the code. One side at a time, so peak
   +	// memory is two IRs, not two scans. The trees stay open while -html
   +	// needs to read changed files.
   +	head, err := openHead(ctx, top, headCommit, *worktree, *withIgnored)
    	if err != nil {
   +		return bad("head: %v", err)
   +	}
   +	defer head.close()
   +	headDoc, pol, _, err := scanSource(ctx, head)
   +	if err != nil {
   +		return bad("head: %v", err)
   +	}
   +	headDoc.Ref = *head.ref
   +	baseDoc, baseTree, err := scanCommit(ctx, top, mb, pol)
   +	if err != nil {
    		return bad("base %s: %v", mb[:min(12, len(mb))], err)
    	}
    	defer baseTree.Close()
   @@ -91,27 +112,9 @@
    		_ = baseTree.Close()
    	}
    	baseDoc.Ref = ir.Ref{Commit: mb}
   -	var headDoc *ir.IR
   -	var headTree scan.Tree
   -	if *worktree {
   -		headDoc, headTree, err = scanWorktree(ctx, top, headCommit, *withIgnored)
   -	} else {
   -		var t *gitref.CommitTree
   -		headDoc, t, err = scanCommit(ctx, top, headCommit)
   -		if err == nil {
   -			defer t.Close()
   -			headDoc.Ref, headTree = ir.Ref{Commit: headCommit}, t
   -		}
   -	}
   -	if err != nil {
   -		return bad("head: %v", err)
   -	}
    	if err := ctx.Err(); err != nil {
    		return bad("%v", err)
    	}
   -	if baseDoc.PolicyHash != headDoc.PolicyHash {
   -		return bad("policy changed between base and head; diff uses head's policy once the Policy feature lands")
   -	}
    
    	s := diff.Summarize(baseDoc, headDoc)
    	var buf bytes.Buffer
   @@ -132,7 +135,7 @@
    	fmt.Fprintf(stderr, "zu diff: %d packages changed, %d affected, parse errors base=%d head=%d\n",
    		len(s.Packages), len(s.Affected), len(baseDoc.ParseErrors), len(headDoc.ParseErrors))
    	if hopts.path != "" {
   -		c := changeSides{top: top, base: baseDoc, head: headDoc, baseTree: baseTree, headTree: headTree}
   +		c := changeSides{top: top, base: baseDoc, head: headDoc, baseTree: baseTree, headTree: head.tree}
    		if err := writeChangeHTML(ctx, c, s, &hopts, stderr); err != nil {
    			return bad("html: %v", err)
    		}
   @@ -145,14 +148,14 @@
    	return ExitOK
    }
    
   -// scanCommit scans one commit from git objects. On success the tree is left
   -// open for reading files, and the caller closes it.
   -func scanCommit(ctx context.Context, top, commit string) (*ir.IR, *gitref.CommitTree, error) {
   +// scanCommit scans one commit from git objects under pol. On success the
   +// tree is left open for reading files, and the caller closes it.
   +func scanCommit(ctx context.Context, top, commit string, pol *policy.Policy) (*ir.IR, *gitref.CommitTree, error) {
    	tree, err := openCommit(ctx, top, commit)
    	if err != nil {
    		return nil, nil, err
    	}
   -	doc, _, err := scanTree(ctx, tree)
   +	doc, _, err := scanTree(ctx, tree, pol)
    	if treeErr := tree.Err(); treeErr != nil {
    		err = treeErr // the cause; a scan error would only be its symptom
    	}
   @@ -163,27 +166,35 @@
    	return doc, tree, nil
    }
    
   -// scanWorktree scans the files the next commit would contain, labelled as
   -// zu scan labels them.
   -func scanWorktree(ctx context.Context, top, head string, withIgnored bool) (*ir.IR, scan.Tree, error) {
   +// openHead opens head's side: the commit or, with worktree, the files the
   +// next commit would contain, labelled as zu scan labels them.
   +func openHead(ctx context.Context, top, commit string, worktree, withIgnored bool) (*source, error) {
   +	if !worktree {
   +		tree, err := openCommit(ctx, top, commit)
   +		if err != nil {
   +			return nil, err
   +		}
   +		return &source{
   +			tree: tree, root: top, ref: &ir.Ref{Commit: commit},
   +			err: tree.Err, close: func() { _ = tree.Close() },
   +		}, nil
   +	}
    	l, err := gitWorktree(ctx, top, withIgnored)
    	if err != nil {
   -		return nil, nil, err
   +		return nil, err
    	}
    	if l == nil {
   -		return nil, nil, fmt.Errorf("%s is not a git working tree", top)
   +		return nil, fmt.Errorf("%s is not a git working tree", top)
    	}
    	tree, err := scan.ListTree(top, l.Files)
    	if err != nil {
   -		return nil, nil, err
   +		return nil, err
    	}
   -	doc, _, err := scanTree(ctx, tree)
   -	if err != nil {
   -		return nil, nil, err
   -	}
    	_, modified := gitHead(ctx, top)
   -	doc.Ref = ir.Ref{Commit: head, Dirty: modified || l.Extra}
   -	return doc, tree, nil
   +	return &source{
   +		tree: tree, root: top, ref: &ir.Ref{Commit: commit, Dirty: modified || l.Extra},
   +		err: func() error { return nil }, close: func() {},
   +	}, nil
    }
    
    // parsePositional parses flags anywhere among the positional arguments.
   ```

   ```diff
   --- a/internal/cli/scan.go
   +++ b/internal/cli/scan.go
   @@ -15,6 +15,7 @@
    
    	"zu/internal/gitref"
    	"zu/internal/ir"
   +	"zu/internal/policy"
    	"zu/internal/scan"
    )
    
   @@ -73,10 +74,7 @@
    		return ExitBadInvocation
    	}
    	defer src.close()
   -	doc, stats, err := scan.Run(ctx, scan.Options{Tree: src.tree})
   -	if treeErr := src.err(); treeErr != nil {
   -		err = treeErr // the cause; a scan error would only be its symptom
   -	}
   +	doc, _, stats, err := scanSource(ctx, src)
    	if err != nil {
    		fmt.Fprintf(stderr, "zu scan: %v\n", err)
    		return ExitBadInvocation
   @@ -176,6 +174,22 @@
    		tree: tree, root: top, ref: &ir.Ref{Commit: commit},
    		err: tree.Err, close: func() { _ = tree.Close() },
    	}, nil
   +}
   +
   +// scanSource scans src under the Policy file at its own root: a commit's
   +// committed Policy, or the working tree's. Only diff scans a tree under
   +// another tree's Policy (ADR 0004).
   +func scanSource(ctx context.Context, src *source) (*ir.IR, *policy.Policy, scan.Stats, error) {
   +	pol, err := loadPolicy(src.tree)
   +	var doc *ir.IR
   +	var stats scan.Stats
   +	if err == nil {
   +		doc, stats, err = scanTree(ctx, src.tree, pol)
   +	}
   +	if treeErr := src.err(); treeErr != nil {
   +		err = treeErr // the cause; a read or scan error would only be its symptom
   +	}
   +	return doc, pol, stats, err
    }
    
    // parseWithDir parses flags on both sides of the one optional dir argument.
   ```

   `runScan` now calls `scan.Run` through the seam, so the self-scan smoke test asserts a cross-package call that `runScan` still makes directly:

   ```diff
   --- a/internal/scan/selfscan_test.go
   +++ b/internal/scan/selfscan_test.go
   @@ -27,12 +27,12 @@
    	}
    	found := false
    	for _, e := range doc.Edges {
   -		if e.From == "zu/internal/cli.runScan" && e.To == "zu/internal/scan.Run" {
   +		if e.From == "zu/internal/cli.runScan" && e.To == "zu/internal/ir.Encode" {
    			found = true
    		}
    	}
    	if !found {
   -		t.Error("missing call edge runScan → scan.Run")
   +		t.Error("missing call edge runScan → ir.Encode")
    	}
    	if strings.Contains(string(encode(t, doc)), root) {
    		t.Fatal("IR contains the absolute root")
   ```

- [ ] **Run:** `go test ./internal/cli ./internal/scan`. Expected: `ok` for both.

### Task 5: `Apply`: omit, omit-edges and foreign collapse

**Files:**
- Create: `internal/policy/apply.go`, `internal/policy/apply_test.go`

**Steps:**

- [ ] **Write the failing test**

   <!-- file: internal/policy/apply_test.go -->
   ```go
   package policy

   import (
   	"slices"
   	"testing"

   	"zu/internal/ir"
   )

   func loc(path string, line int) []ir.Location { return []ir.Location{{Path: path, Line: line}} }

   // sample is a small repo: two packages, a declaration, two AWS modules and
   // one other external.
   func sample() *ir.IR {
   	return &ir.IR{
   		Nodes: []ir.Node{
   			{ID: "m/a", Kind: ir.KindPackage, Locations: loc("a/a.go", 1)},
   			{ID: "m/a.T", Kind: ir.KindType, Parent: "m/a", Locations: loc("a/a.go", 3)},
   			{ID: "m/gen", Kind: ir.KindPackage, Locations: loc("gen/g.go", 1)},
   			{ID: "github.com/aws/s3", Kind: ir.KindExternal, Locations: loc("a/a.go", 2)},
   			{ID: "github.com/aws/sqs", Kind: ir.KindExternal, Locations: loc("a/a.go", 4)},
   			{ID: "golang.org/x/sync", Kind: ir.KindExternal, Locations: loc("a/a.go", 5)},
   		},
   		Edges: []ir.Edge{
   			{From: "m/a", To: "github.com/aws/s3", Kind: ir.EdgeImports, Locations: loc("a/a.go", 2)},
   			{From: "m/a", To: "github.com/aws/sqs", Kind: ir.EdgeImports, Locations: loc("a/a.go", 4)},
   			{From: "m/a", To: "golang.org/x/sync", Kind: ir.EdgeImports, Locations: loc("a/a.go", 5)},
   			{From: "m/a", To: "m/gen", Kind: ir.EdgeImports, Locations: loc("a/a.go", 6)},
   			{From: "m/a.T", To: "m/gen", Kind: ir.EdgeCalls, Locations: loc("a/a.go", 7)},
   		},
   	}
   }

   func ids(doc *ir.IR) (nodes, edges []string) {
   	for _, n := range doc.Nodes {
   		nodes = append(nodes, n.ID)
   	}
   	for _, e := range doc.Edges {
   		edges = append(edges, e.From+">"+e.To+":"+string(e.Kind))
   	}
   	return nodes, edges
   }

   func TestApplyEmptyPolicyIsIdentity(t *testing.T) {
   	in := sample()
   	ir.Sort(in)
   	got := (&Policy{}).Apply(in)
   	n1, e1 := ids(in)
   	n2, e2 := ids(got)
   	if !slices.Equal(n1, n2) || !slices.Equal(e1, e2) {
   		t.Fatalf("empty Policy changed the graph:\n%v %v\n%v %v", n1, e1, n2, e2)
   	}
   }

   func TestApplyCollapsesForeignAndOmits(t *testing.T) {
   	in := sample()
   	p := &Policy{Foreign: []string{"github.com/aws"}, Omit: []string{"m/gen"}}
   	got := p.Apply(in)
   	nodes, edges := ids(got)
   	wantNodes := []string{"github.com/aws", "golang.org/x/sync", "m/a", "m/a.T"}
   	wantEdges := []string{"m/a>github.com/aws:imports", "m/a>golang.org/x/sync:imports"}
   	if !slices.Equal(nodes, wantNodes) || !slices.Equal(edges, wantEdges) {
   		t.Fatalf("got %v %v\nwant %v %v", nodes, edges, wantNodes, wantEdges)
   	}
   	for _, n := range got.Nodes {
   		if n.ID == "github.com/aws" && len(n.Locations) != 2 {
   			t.Errorf("collapsed node keeps both locations, got %v", n.Locations)
   		}
   	}
   	for _, e := range got.Edges {
   		if e.To == "github.com/aws" && len(e.Locations) != 2 {
   			t.Errorf("merged edge keeps both locations, got %v", e.Locations)
   		}
   	}
   	if len(in.Nodes) != 6 || in.Nodes[3].ID != "github.com/aws/s3" {
   		t.Error("Apply modified its input")
   	}
   }

   func TestApplyOmitsEdgesByPackage(t *testing.T) {
   	p := &Policy{OmitEdges: []Pair{{From: "m/a", To: "m/gen"}}}
   	_, edges := ids(p.Apply(sample()))
   	for _, e := range edges {
   		if e == "m/a>m/gen:imports" || e == "m/a.T>m/gen:calls" {
   			t.Errorf("omit-edges kept %s (a declaration follows its package)", e)
   		}
   	}
   	if len(edges) != 3 {
   		t.Errorf("edges = %v", edges)
   	}
   }

   func TestUnderIsSegmentWise(t *testing.T) {
   	if !under("a/b", "a") || !under("a", "a") || under("a/bc", "a/b") {
   		t.Error("under must compare whole path segments")
   	}
   }

   func TestApplyOmitsASegmentBox(t *testing.T) {
   	nodes, edges := ids((&Policy{Omit: []string{"m"}}).Apply(sample()))
   	if want := []string{"github.com/aws/s3", "github.com/aws/sqs", "golang.org/x/sync"}; !slices.Equal(nodes, want) || len(edges) != 0 {
   		t.Fatalf("omit m left %v %v", nodes, edges)
   	}
   }

   func TestLensIsWhatApplyCanChange(t *testing.T) {
   	if (&Policy{Levels: []Level{{"m"}}, Cycles: true, Order: []string{"m"}}).Lens() {
   		t.Error("rules and order change no graph")
   	}
   	for _, p := range []*Policy{{Omit: []string{"m"}}, {Foreign: []string{"x"}}, {OmitEdges: []Pair{{"a", "b"}}}} {
   		if !p.Lens() {
   			t.Errorf("%+v is a lens", p)
   		}
   	}
   }
   ```

- [ ] **Run it:** `go test ./internal/policy -run Apply`. Expected: FAIL (`p.Apply undefined`).

- [ ] **Implement.** `ir.Sort` sorts merged locations, so the output does not depend on merge order. `Lens` reports whether `Apply` can change a graph at all; Task 11 uses it.

   <!-- file: internal/policy/apply.go -->
   ```go
   package policy

   import (
   	"slices"
   	"strings"

   	"zu/internal/ir"
   )

   // under reports whether id is prefix or lies below it in the import-path
   // hierarchy: "a/b" is under "a", "a/bc" is not.
   func under(id, prefix string) bool {
   	return id == prefix || strings.HasPrefix(id, prefix+"/")
   }

   // underAny reports whether id is under one of prefixes.
   func underAny(id string, prefixes []string) bool {
   	return slices.ContainsFunc(prefixes, func(p string) bool { return under(id, p) })
   }

   // packageOf maps every node id to its package: a package or an external to
   // itself, a declaration to its package through Parent.
   func packageOf(doc *ir.IR) map[string]string {
   	parent := make(map[string]string, len(doc.Nodes))
   	for _, n := range doc.Nodes {
   		parent[n.ID] = n.Parent
   	}
   	out := make(map[string]string, len(doc.Nodes))
   	for _, n := range doc.Nodes {
   		id := n.ID
   		for parent[id] != "" {
   			id = parent[id]
   		}
   		out[n.ID] = id
   	}
   	return out
   }

   // foreignIDs maps each external node under a Foreign prefix to the longest
   // such prefix: the id of the one node it collapses into.
   func (p *Policy) foreignIDs(doc *ir.IR) map[string]string {
   	out := map[string]string{}
   	for _, n := range doc.Nodes {
   		if n.Kind != ir.KindExternal {
   			continue
   		}
   		for _, f := range p.Foreign {
   			if under(n.ID, f) && len(f) > len(out[n.ID]) {
   				out[n.ID] = f
   			}
   		}
   	}
   	return out
   }

   // Apply returns doc as the Policy draws and checks it: nodes under Omit gone
   // with their declarations and edges, edges matching OmitEdges gone, and
   // externals under a Foreign prefix merged into one external node whose id is
   // the longest such prefix. Unlisted externals stay (04 already groups them).
   // Merged nodes and edges keep every location; an edge that merging turns
   // into a self-loop is dropped. doc is not modified and nothing is invented.
   func (p *Policy) Apply(doc *ir.IR) *ir.IR {
   	pkg := packageOf(doc)
   	foreign := p.foreignIDs(doc)
   	rename := func(id string) string {
   		if f, ok := foreign[id]; ok {
   			return f
   		}
   		return id
   	}
   	omitted := func(id string) bool { return underAny(pkg[id], p.Omit) }

   	out := *doc
   	out.Nodes, out.Edges = nil, nil
   	nodeAt := map[string]int{}
   	for _, n := range doc.Nodes {
   		if omitted(n.ID) {
   			continue
   		}
   		n.ID = rename(n.ID)
   		if i, ok := nodeAt[n.ID]; ok {
   			out.Nodes[i].Locations = union(out.Nodes[i].Locations, n.Locations)
   			continue
   		}
   		n.Locations = slices.Clone(n.Locations)
   		nodeAt[n.ID] = len(out.Nodes)
   		out.Nodes = append(out.Nodes, n)
   	}
   	type key struct {
   		from, to string
   		kind     ir.EdgeKind
   	}
   	edgeAt := map[key]int{}
   	for _, e := range doc.Edges {
   		if omitted(e.From) || omitted(e.To) || p.omitsEdge(pkg[e.From], pkg[e.To]) {
   			continue
   		}
   		k := key{rename(e.From), rename(e.To), e.Kind}
   		if k.from == k.to {
   			continue
   		}
   		if i, ok := edgeAt[k]; ok {
   			out.Edges[i].Locations = union(out.Edges[i].Locations, e.Locations)
   			continue
   		}
   		edgeAt[k] = len(out.Edges)
   		out.Edges = append(out.Edges, ir.Edge{From: k.from, To: k.to, Kind: e.Kind, Locations: slices.Clone(e.Locations)})
   	}
   	ir.Sort(&out)
   	return &out
   }

   // Lens reports whether Apply can change a graph: whether the Policy omits
   // or collapses anything.
   func (p *Policy) Lens() bool {
   	return len(p.Omit)+len(p.OmitEdges)+len(p.Foreign) > 0
   }

   // omitsEdge reports whether an OmitEdges pair covers a dependency between
   // these packages.
   func (p *Policy) omitsEdge(fromPkg, toPkg string) bool {
   	return slices.ContainsFunc(p.OmitEdges, func(e Pair) bool {
   		return under(fromPkg, e.From) && under(toPkg, e.To)
   	})
   }

   // union is a followed by the locations of b it lacks.
   func union(a, b []ir.Location) []ir.Location {
   	for _, l := range b {
   		if !slices.Contains(a, l) {
   			a = append(a, l)
   		}
   	}
   	return a
   }
   ```

- [ ] **Run:** `go test ./internal/policy`. Expected: `ok`.

### Task 6: The rules: Levels and cycles

**Rules, from policy.clj at 79cc1ef:**
- `RankOf(id)` is the rank of the longest ranked id that `id` is under (`rank-of`, l.196).
- A Levels violation is a package `imports` edge whose two ends are both ranked, with `rank(from) < rank(to)`: an inner level depending on an outer one (`violating-dependency?`, l.213). Same rank is allowed; externals and unranked ends are never compared.
- An `edge-kinds` pair of kind `association` is not a dependency, so it is exempt (`apply-edge-kinds`, l.279; Deviation 2).
- Cycles, when `cycles: true`: each package import is lifted to the arc between the two children of the ends' lowest common box (Deviation 4). Module roots are siblings under the page root. Tarjan's algorithm runs per parent box, and every arc inside a strongly connected component is a violation (Deviation 9).
- `EdgeRules` maps each package import that breaks a rule to that rule. It is what the View marks red (Task 11). Levels wins over cycle.
- `Validate` rejects a Levels id that matches no package: it is a typo, and the rule would silently check nothing. `zu check` exits 3 on it; `zu diff` only warns (Deviation 6).
- `Check` and `EdgeRules` evaluate `p.Apply(doc)` (Task 5), never the raw IR.

**Files:**
- Create: `internal/policy/levels.go`, `internal/policy/levels_test.go`, `internal/policy/cycles.go`, `internal/policy/cycles_test.go`

**Steps:**

- [ ] **Write the failing tests**

   <!-- file: internal/policy/levels_test.go -->
   ```go
   package policy

   import (
   	"slices"
   	"strings"
   	"testing"

   	"zu/internal/ir"
   )

   // layered is a small layered repo: m/domain is inner, m/app outer, m/cmd
   // outermost; m/util is unranked and x.io/lib is external.
   func layered(imports ...string) *ir.IR {
   	doc := &ir.IR{}
   	for _, id := range []string{"m/domain", "m/domain/model", "m/app", "m/cmd", "m/util"} {
   		doc.Nodes = append(doc.Nodes, ir.Node{ID: id, Kind: ir.KindPackage, Module: "m"})
   	}
   	doc.Nodes = append(doc.Nodes,
   		ir.Node{ID: "m/app.Svc", Kind: ir.KindType, Parent: "m/app"},
   		ir.Node{ID: "x.io/lib", Kind: ir.KindExternal})
   	for _, e := range imports {
   		from, to, _ := strings.Cut(e, ">")
   		doc.Edges = append(doc.Edges, ir.Edge{From: from, To: to, Kind: ir.EdgeImports, Locations: loc("f.go", 1)})
   	}
   	return doc
   }

   func mustParse(t *testing.T, src string) *Policy {
   	t.Helper()
   	p, err := Parse([]byte(src))
   	if err != nil {
   		t.Fatal(err)
   	}
   	return p
   }

   func TestRankOfTakesTheLongestRankedPrefix(t *testing.T) {
   	p := mustParse(t, "levels: [[m/domain], m/app, m/domain/model]\n")
   	for id, want := range map[string]int{"m/domain": 0, "m/domain/x": 0, "m/domain/model": 2, "m/domain/model/v1": 2, "m/app": 1} {
   		if got, ok := p.RankOf(id); !ok || got != want {
   			t.Errorf("RankOf(%q) = %d, %v; want %d", id, got, ok, want)
   		}
   	}
   	if _, ok := p.RankOf("m/domainx"); ok {
   		t.Error("m/domainx is not under m/domain")
   	}
   }

   func TestLevelsFlagInnerToOuterImports(t *testing.T) {
   	p := mustParse(t, "levels: [m/domain, m/app, m/cmd]\n")
   	doc := layered(
   		"m/cmd>m/app", "m/app>m/domain", "m/domain/model>m/domain", // outer → inner and same rank: allowed
   		"m/domain>m/app", "m/domain/model>m/cmd", // inner → outer: violations
   		"m/util>m/cmd", "m/domain>m/util", "m/domain>x.io/lib", // unranked or external ends are not compared
   		"m/app.Svc>m/cmd", // a declaration's call is not an import
   	)
   	doc.Edges[len(doc.Edges)-1].Kind = ir.EdgeCalls
   	got := p.Check(doc)
   	want := []Violation{{RuleLevels, "m/domain", "m/app"}, {RuleLevels, "m/domain/model", "m/cmd"}}
   	if !slices.Equal(got, want) {
   		t.Fatalf("Check = %v, want %v", got, want)
   	}
   }

   func TestEdgeKindsAssociationExempts(t *testing.T) {
   	p := mustParse(t, "levels: [m/domain, m/app]\nedge-kinds: [{from: m/domain, to: m/app, kind: association}]\n")
   	if got := p.Check(layered("m/domain/model>m/app")); len(got) != 0 {
   		t.Fatalf("an association is not a dependency (policy.clj l.279), got %v", got)
   	}
   }

   func TestLevelsSeeThePolicyLens(t *testing.T) {
   	p := mustParse(t, "levels: [m/domain, m/app]\nomit-edges: [{from: m/domain, to: m/app}]\n")
   	if got := p.Check(layered("m/domain>m/app")); len(got) != 0 {
   		t.Fatalf("an omitted edge is not checked, got %v", got)
   	}
   }

   func TestValidateRejectsALevelThatRanksNothing(t *testing.T) {
   	p := mustParse(t, "levels: [m/domain, m/ap]\n")
   	err := p.Validate(layered())
   	if err == nil || !strings.Contains(err.Error(), `levels[1]: "m/ap" matches no package`) {
   		t.Fatalf("Validate = %v", err)
   	}
   	if err := mustParse(t, "levels: [m/domain, m]\n").Validate(layered()); err != nil {
   		t.Fatalf("a box id ranks the packages under it: %v", err)
   	}
   }
   ```

   <!-- file: internal/policy/cycles_test.go -->
   ```go
   package policy

   import (
   	"slices"
   	"strings"
   	"testing"

   	"zu/internal/ir"
   )

   // graph builds packages (id@module) and import edges (from>to).
   func graph(pkgs []string, imports ...string) *ir.IR {
   	doc := &ir.IR{}
   	for _, p := range pkgs {
   		id, mod, _ := strings.Cut(p, "@")
   		doc.Nodes = append(doc.Nodes, ir.Node{ID: id, Kind: ir.KindPackage, Module: mod})
   	}
   	for _, e := range imports {
   		from, to, _ := strings.Cut(e, ">")
   		doc.Edges = append(doc.Edges, ir.Edge{From: from, To: to, Kind: ir.EdgeImports})
   	}
   	return doc
   }

   func TestLiftIsTheLowestCommonBoxsChildren(t *testing.T) {
   	mod := map[string]string{"m/a/x": "m", "m/b/y": "m", "m/a": "m", "m/a/b/c": "m", "n/q": "n", "m": "m"}
   	for _, tc := range []struct{ from, to, parent, a, b string }{
   		{"m/a/x", "m/b/y", "m", "m/a", "m/b"},
   		{"m/a", "m/a/b/c", "m/a", "m/a", "m/a/b"}, // m/a stands for its #pkg leaf
   		{"m/a/b/c", "m/a", "m/a", "m/a/b", "m/a"},
   		{"m", "m/a/x", "m", "m", "m/a"},
   		{"m/a/x", "n/q", "", "m", "n"}, // modules are roots
   	} {
   		parent, a, b, ok := lift(tc.from, tc.to, mod)
   		if !ok || parent != tc.parent || a != tc.a || b != tc.b {
   			t.Errorf("lift(%s, %s) = %q %q %q %v, want %q %q %q", tc.from, tc.to, parent, a, b, ok, tc.parent, tc.a, tc.b)
   		}
   	}
   	if _, _, _, ok := lift("m/a/x", "m/a/x", mod); ok {
   		t.Error("a package does not form an arc with itself")
   	}
   }

   func TestCyclesBetweenSiblingBoxes(t *testing.T) {
   	doc := graph([]string{"m/a/x@m", "m/a/w@m", "m/b/y@m", "m/b/z@m", "m/c@m", "m/d@m", "m/d/e@m", "n/q@n", "n/r@n"},
   		"m/a/x>m/b/y", "m/b/z>m/a/w", // m/a ⇄ m/b
   		"m/c>m/a/x",              // into the cycle, not on it
   		"m/d>m/d/e", "m/d/e>m/d", // leaf ⇄ child box, under m/d
   		"n/q>m/c", "m/c>n/r", // module ⇄ module
   	)
   	got := mustParse(t, "cycles: true\n").Check(doc)
   	want := []Violation{
   		{RuleCycle, "m", "n"}, {RuleCycle, "m/a", "m/b"}, {RuleCycle, "m/b", "m/a"},
   		{RuleCycle, "m/d", "m/d/e"}, {RuleCycle, "m/d/e", "m/d"}, {RuleCycle, "n", "m"},
   	}
   	if !slices.Equal(got, want) {
   		t.Fatalf("Check =\n%v\nwant\n%v", got, want)
   	}
   	if got := (&Policy{}).Check(doc); len(got) != 0 {
   		t.Fatalf("cycles are opt-in, got %v", got)
   	}
   }

   func TestEdgeRulesMarkThePackageImportsToDrawRed(t *testing.T) {
   	doc := graph([]string{"m/a/x@m", "m/b/y@m", "m/b/z@m", "m/c@m"},
   		"m/a/x>m/b/y", "m/b/z>m/a/x", "m/c>m/a/x", "m/a/x>m/c")
   	p := mustParse(t, "levels: [m/a, m/c]\ncycles: true\n")
   	got := p.EdgeRules(doc)
   	want := map[Pair]string{
   		{"m/a/x", "m/b/y"}: RuleCycle, {"m/b/z", "m/a/x"}: RuleCycle, // m/a ⇄ m/b
   		{"m/a/x", "m/c"}: RuleLevels, // a Levels violation, also on the m/a ⇄ m/c cycle: levels wins
   		{"m/c", "m/a/x"}: RuleCycle,
   	}
   	if len(got) != len(want) {
   		t.Fatalf("EdgeRules = %v, want %v", got, want)
   	}
   	for k, r := range want {
   		if got[k] != r {
   			t.Errorf("EdgeRules[%v] = %q, want %q", k, got[k], r)
   		}
   	}
   }
   ```

- [ ] **Run them:** `go test ./internal/policy`. Expected: FAIL (`p.RankOf undefined`, `undefined: lift`).

- [ ] **Implement**

   <!-- file: internal/policy/levels.go -->
   ```go
   package policy

   import (
   	"cmp"
   	"fmt"
   	"slices"

   	"zu/internal/ir"
   )

   // Rule names, as a Violation records them.
   const (
   	RuleLevels = "levels"
   	RuleCycle  = "cycle"
   )

   // Violation is one broken rule. For RuleLevels From and To are packages;
   // for RuleCycle they are sibling Package Tree boxes on a cycle.
   type Violation struct {
   	Rule string `json:"rule"`
   	From string `json:"from"`
   	To   string `json:"to"`
   }

   // Compare orders violations by rule, from, to.
   func Compare(a, b Violation) int {
   	return cmp.Or(cmp.Compare(a.Rule, b.Rule), cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To))
   }

   // RankOf is the rank of the longest ranked id that id is under (policy.clj
   // rank-of, l.196). Rank 0 is the innermost level.
   func (p *Policy) RankOf(id string) (int, bool) {
   	rank, best := 0, -1
   	for i, lv := range p.Levels {
   		for _, l := range lv {
   			if under(id, l) && len(l) > best {
   				rank, best = i, len(l)
   			}
   		}
   	}
   	return rank, best >= 0
   }

   // Check evaluates the Policy's rules on doc as the Policy sees it (Apply)
   // and returns the violations sorted and unique.
   func (p *Policy) Check(doc *ir.IR) []Violation {
   	doc = p.Apply(doc)
   	vs := p.levelViolations(doc)
   	if p.Cycles {
   		vs = append(vs, p.cycleViolations(doc)...)
   	}
   	slices.SortFunc(vs, Compare)
   	return slices.Compact(vs)
   }

   // levelViolations flags every package import from a lower rank to a higher
   // one: an inner level depending on an outer one (policy.clj
   // violating-dependency?, l.213). Both ends must be ranked; same rank is
   // allowed; an association (edge-kinds) is not a dependency (l.279).
   func (p *Policy) levelViolations(doc *ir.IR) []Violation {
   	if len(p.Levels) == 0 {
   		return nil
   	}
   	pkgs := packageIDs(doc)
   	var vs []Violation
   	for _, e := range doc.Edges {
   		if e.Kind != ir.EdgeImports || !pkgs[e.From] || !pkgs[e.To] || p.association(e.From, e.To) {
   			continue
   		}
   		rf, okf := p.RankOf(e.From)
   		rt, okt := p.RankOf(e.To)
   		if okf && okt && rf < rt {
   			vs = append(vs, Violation{RuleLevels, e.From, e.To})
   		}
   	}
   	return vs
   }

   func (p *Policy) association(from, to string) bool {
   	return slices.ContainsFunc(p.EdgeKinds, func(k EdgeKind) bool {
   		return k.Kind == Association && under(from, k.From) && under(to, k.To)
   	})
   }

   func packageIDs(doc *ir.IR) map[string]bool {
   	out := map[string]bool{}
   	for _, n := range doc.Nodes {
   		if n.Kind == ir.KindPackage {
   			out[n.ID] = true
   		}
   	}
   	return out
   }

   // Validate reports a Levels id that ranks no package of doc: almost always
   // a typo, and a rule that silently checks nothing.
   func (p *Policy) Validate(doc *ir.IR) error {
   	pkgs := packageIDs(doc)
   	for i, lv := range p.Levels {
   		for _, l := range lv {
   			found := false
   			for id := range pkgs {
   				if under(id, l) {
   					found = true
   					break
   				}
   			}
   			if !found {
   				return fmt.Errorf("%s: levels[%d]: %q matches no package", FileName, i, l)
   			}
   		}
   	}
   	return nil
   }
   ```

   <!-- file: internal/policy/cycles.go -->
   ```go
   package policy

   import "zu/internal/ir"

   // boxes is the chain of Package Tree boxes from a package's module root down
   // to the package itself (ADR 0008): "m/a/b" in module "m" is m, m/a, m/a/b.
   func boxes(id, module string) []string {
   	chain := []string{module}
   	if id == module {
   		return chain
   	}
   	for i := len(module) + 1; i <= len(id); i++ {
   		if i == len(id) || id[i] == '/' {
   			chain = append(chain, id[:i])
   		}
   	}
   	return chain
   }

   // lift maps an import between two packages to an arc between the two
   // children of their lowest common box, and names that box ("" when the ends
   // are in different modules, whose roots are siblings). A package that is an
   // ancestor of the other end stands for its own #pkg leaf.
   func lift(from, to string, module map[string]string) (parent, a, b string, ok bool) {
   	if from == to {
   		return "", "", "", false
   	}
   	if module[from] != module[to] {
   		return "", module[from], module[to], true
   	}
   	cf, ct := boxes(from, module[from]), boxes(to, module[to])
   	k := 0
   	for k < len(cf) && k < len(ct) && cf[k] == ct[k] {
   		k++
   	}
   	a, b = cf[min(k, len(cf)-1)], ct[min(k, len(ct)-1)]
   	return cf[k-1], a, b, true
   }

   // cycleViolations lifts every package import to its sibling-box arc and
   // flags each arc that lies on a cycle among its siblings. Go forbids import
   // cycles between packages, so these are the cycles A8 can find.
   func (p *Policy) cycleViolations(doc *ir.IR) []Violation {
   	module := map[string]string{}
   	for _, n := range doc.Nodes {
   		if n.Kind == ir.KindPackage {
   			module[n.ID] = n.Module
   		}
   	}
   	out := map[string]map[string][]string{} // parent box → arc tails → heads
   	for _, e := range doc.Edges {
   		if e.Kind != ir.EdgeImports || module[e.From] == "" || module[e.To] == "" {
   			continue
   		}
   		parent, a, b, ok := lift(e.From, e.To, module)
   		if !ok {
   			continue
   		}
   		if out[parent] == nil {
   			out[parent] = map[string][]string{}
   		}
   		out[parent][a] = append(out[parent][a], b)
   	}
   	var vs []Violation
   	for _, arcs := range out {
   		comp := components(arcs)
   		for a, heads := range arcs {
   			for _, b := range heads {
   				if comp[a] == comp[b] {
   					vs = append(vs, Violation{RuleCycle, a, b})
   				}
   			}
   		}
   	}
   	return vs
   }

   // components is Tarjan's algorithm: node → strongly connected component
   // number, for every node on an arc. A node alone in its component has a
   // number no other node shares.
   func components(arcs map[string][]string) map[string]int {
   	index, low, comp := map[string]int{}, map[string]int{}, map[string]int{}
   	var stack []string
   	on := map[string]bool{}
   	var visit func(v string)
   	visit = func(v string) {
   		index[v], low[v] = len(index), len(index)
   		stack = append(stack, v)
   		on[v] = true
   		for _, w := range arcs[v] {
   			if _, seen := index[w]; !seen {
   				visit(w)
   				low[v] = min(low[v], low[w])
   			} else if on[w] {
   				low[v] = min(low[v], index[w])
   			}
   		}
   		if low[v] == index[v] {
   			n := len(comp) + 1
   			for {
   				w := stack[len(stack)-1]
   				stack = stack[:len(stack)-1]
   				on[w] = false
   				comp[w] = n
   				if w == v {
   					break
   				}
   			}
   		}
   	}
   	for v := range arcs {
   		if _, seen := index[v]; !seen {
   			visit(v)
   		}
   	}
   	return comp
   }

   // EdgeRules maps every package import of doc, as Apply sees it, that breaks
   // a rule to that rule: the edges drawn red. A Levels violation wins over a
   // cycle, since it names the edge itself rather than its boxes' arc.
   func (p *Policy) EdgeRules(doc *ir.IR) map[Pair]string {
   	out := map[Pair]string{}
   	if !p.Rules() {
   		return out
   	}
   	doc = p.Apply(doc)
   	onCycle := map[Violation]bool{}
   	if p.Cycles {
   		for _, v := range p.cycleViolations(doc) {
   			onCycle[v] = true
   		}
   	}
   	module := map[string]string{}
   	for _, n := range doc.Nodes {
   		if n.Kind == ir.KindPackage {
   			module[n.ID] = n.Module
   		}
   	}
   	for _, v := range p.levelViolations(doc) {
   		out[Pair{v.From, v.To}] = RuleLevels
   	}
   	for _, e := range doc.Edges {
   		if e.Kind != ir.EdgeImports || out[Pair{e.From, e.To}] != "" || module[e.From] == "" || module[e.To] == "" {
   			continue
   		}
   		if _, a, b, ok := lift(e.From, e.To, module); ok && onCycle[Violation{RuleCycle, a, b}] {
   			out[Pair{e.From, e.To}] = RuleCycle
   		}
   	}
   	return out
   }
   ```

- [ ] **Run:** `go test ./internal/policy`. Expected: `ok`.

### Task 7: The Baseline

**Files:**
- Create: `internal/policy/baseline.go`, `internal/policy/baseline_test.go`

**Steps:**

- [ ] **Write the failing test**

   <!-- file: internal/policy/baseline_test.go -->
   ```go
   package policy

   import (
   	"bytes"
   	"slices"
   	"strings"
   	"testing"
   )

   var (
   	vA = Violation{RuleLevels, "m/a", "m/b"}
   	vB = Violation{RuleCycle, "m/c", "m/d"}
   	vC = Violation{RuleLevels, "m/e", "m/f"}
   )

   func TestBaselineRoundTripsSorted(t *testing.T) {
   	b := &Baseline{PolicyHash: "sha256:p", Violations: []Violation{vC, vA, vB, vA}}
   	var buf bytes.Buffer
   	if err := b.Encode(&buf); err != nil {
   		t.Fatal(err)
   	}
   	want := `{
     "schema": "1",
     "policyHash": "sha256:p",
     "violations": [
       {
         "rule": "cycle",
         "from": "m/c",
         "to": "m/d"
       },
       {
         "rule": "levels",
         "from": "m/a",
         "to": "m/b"
       },
       {
         "rule": "levels",
         "from": "m/e",
         "to": "m/f"
       }
     ]
   }
   `
   	if buf.String() != want {
   		t.Fatalf("Encode =\n%s\nwant\n%s", buf.String(), want)
   	}
   	back, err := DecodeBaseline(buf.Bytes())
   	if err != nil || back.PolicyHash != "sha256:p" || !slices.Equal(back.Violations, []Violation{vB, vA, vC}) {
   		t.Fatalf("DecodeBaseline = %+v, %v", back, err)
   	}
   	var empty bytes.Buffer
   	if err := (&Baseline{PolicyHash: "sha256:p"}).Encode(&empty); err != nil || !strings.Contains(empty.String(), `"violations": []`) {
   		t.Fatalf("an empty Baseline lists [], got %s", empty.String())
   	}
   }

   func TestDecodeBaselineRejects(t *testing.T) {
   	for _, src := range []string{`{"schema":"2","policyHash":"x","violations":[]}`, `{"schema":"1","extra":1}`, `not json`} {
   		if _, err := DecodeBaseline([]byte(src)); err == nil || !strings.HasPrefix(err.Error(), BaselineFile+": ") {
   			t.Errorf("DecodeBaseline(%s) = %v, want an error naming the file", src, err)
   		}
   	}
   }

   func TestSplitAndUpdate(t *testing.T) {
   	base := &Baseline{PolicyHash: "sha256:p", Violations: []Violation{vA, vB}}
   	fresh, fixed := base.Split([]Violation{vA, vC})
   	if !slices.Equal(fresh, []Violation{vC}) || !slices.Equal(fixed, []Violation{vB}) {
   		t.Fatalf("Split = %v, %v", fresh, fixed)
   	}
   	if u, err := base.Update([]Violation{vA, vC}, "sha256:p"); err != nil || !slices.Equal(u.Violations, []Violation{vA}) {
   		t.Errorf("Update only removes fixed entries, got %v, %v", u, err)
   	}
   	var none *Baseline
   	if u, err := none.Update([]Violation{vC, vA}, "sha256:p"); err != nil || !slices.Equal(u.Violations, []Violation{vA, vC}) || u.PolicyHash != "sha256:p" {
   		t.Errorf("no Baseline: Update records everything, got %+v, %v", u, err)
   	}
   	if !base.Stale("sha256:q") || base.Stale("sha256:p") || none.Stale("sha256:q") {
   		t.Error("Stale compares the recorded Policy hash; no Baseline is never stale")
   	}
   	if u, err := base.Update([]Violation{vC}, "sha256:q"); err == nil || !strings.Contains(err.Error(), "sha256:p") {
   		t.Errorf("stale Baseline: Update must refuse, got %v, %v", u, err)
   	}
   	if fresh, _ := none.Split([]Violation{vA}); !slices.Equal(fresh, []Violation{vA}) {
   		t.Errorf("no Baseline: everything is new, got %v", fresh)
   	}
   }
   ```

- [ ] **Run it:** `go test ./internal/policy -run Baseline`. Expected: FAIL (`undefined: Baseline`).

- [ ] **Implement.** `Update` only ever removes entries. With no Baseline it records every current violation, and the caller lists them. A `Stale` Baseline, written under another Policy, is an error: re-recording it would accept new violations unseen.

   <!-- file: internal/policy/baseline.go -->
   ```go
   package policy

   import (
   	"bytes"
   	"encoding/json"
   	"fmt"
   	"io"
   	"slices"
   )

   // BaselineFile is the committed list of known violations, at the repo root.
   const BaselineFile = "zu.baseline.json"

   // Baseline records the violations a team has accepted, under the Policy
   // whose hash it names. check fails only on violations not in it.
   type Baseline struct {
   	Schema     string      `json:"schema"`
   	PolicyHash string      `json:"policyHash"`
   	Violations []Violation `json:"violations"`
   }

   // DecodeBaseline reads a Baseline strictly: unknown keys and another schema
   // are errors.
   func DecodeBaseline(data []byte) (*Baseline, error) {
   	dec := json.NewDecoder(bytes.NewReader(data))
   	dec.DisallowUnknownFields()
   	b := &Baseline{}
   	if err := dec.Decode(b); err != nil {
   		return nil, fmt.Errorf("%s: %w", BaselineFile, err)
   	}
   	if b.Schema != "1" {
   		return nil, fmt.Errorf("%s: schema %q, want \"1\"", BaselineFile, b.Schema)
   	}
   	return b, nil
   }

   // Encode writes b sorted and de-duplicated, two-space indented, with a
   // trailing newline, so the committed file changes only when its content does.
   func (b *Baseline) Encode(w io.Writer) error {
   	out := Baseline{Schema: "1", PolicyHash: b.PolicyHash, Violations: sorted(b.Violations)}
   	if out.Violations == nil {
   		out.Violations = []Violation{}
   	}
   	enc := json.NewEncoder(w)
   	enc.SetIndent("", "  ")
   	enc.SetEscapeHTML(false)
   	return enc.Encode(out)
   }

   // Split separates current violations into those the Baseline does not know
   // (fresh) and returns the Baseline entries no longer found (fixed). A nil
   // Baseline knows nothing.
   func (b *Baseline) Split(current []Violation) (fresh, fixed []Violation) {
   	var known []Violation
   	if b != nil {
   		known = b.Violations
   	}
   	for _, v := range sorted(current) {
   		if !slices.Contains(known, v) {
   			fresh = append(fresh, v)
   		}
   	}
   	for _, v := range sorted(known) {
   		if !slices.Contains(current, v) {
   			fixed = append(fixed, v)
   		}
   	}
   	return fresh, fixed
   }

   // Stale reports whether b was written under a Policy other than the one
   // whose hash is policyHash. A nil Baseline is never stale.
   func (b *Baseline) Stale(policyHash string) bool {
   	return b != nil && b.PolicyHash != policyHash
   }

   // Update is the Baseline -update-baseline writes. Entries are only ever
   // removed: under the same Policy it drops the fixed ones. With no Baseline
   // it records every current violation, which the caller lists. A stale
   // Baseline is an error, because re-recording it would accept new
   // violations unseen; it has to be deleted first.
   func (b *Baseline) Update(current []Violation, policyHash string) (*Baseline, error) {
   	if b == nil {
   		return &Baseline{Schema: "1", PolicyHash: policyHash, Violations: sorted(current)}, nil
   	}
   	if b.Stale(policyHash) {
   		return nil, fmt.Errorf("%s was written under Policy %s, not %s", BaselineFile, b.PolicyHash, policyHash)
   	}
   	var keep []Violation
   	for _, v := range b.Violations {
   		if slices.Contains(current, v) {
   			keep = append(keep, v)
   		}
   	}
   	return &Baseline{Schema: "1", PolicyHash: policyHash, Violations: sorted(keep)}, nil
   }

   func sorted(vs []Violation) []Violation {
   	out := slices.Clone(vs)
   	slices.SortFunc(out, Compare)
   	return slices.Compact(out)
   }
   ```

- [ ] **Run:** `go test ./internal/policy`. Expected: `ok`.

### Task 8: `zu check`

**Files:**
- Create: `internal/cli/check.go`, `internal/cli/check_test.go`
- Modify: `internal/cli/cli.go`, `internal/cli/cli_test.go` (`check` leaves `planned`; `zu version` prints `policy-format`)

**Steps:**

- [ ] **Write the failing test.** It needs no git: outside a repository `openSource` reads the directory.

   <!-- file: internal/cli/check_test.go -->
   ```go
   package cli

   import (
   	"os"
   	"path/filepath"
   	"strings"
   	"testing"

   	"zu/internal/policy"
   	"zu/internal/scan"
   )

   const layeredPolicy = "levels: [example.com/m/dom, example.com/m/app]\n"

   // layeredRepo has one Levels violation: dom (inner) imports app (outer).
   func layeredRepo(t *testing.T) string {
   	return repo(t, map[string]string{
   		"go.mod":        "module example.com/m\n",
   		"app/app.go":    "package app\n\nfunc A() {}\n",
   		"dom/dom.go":    "package dom\n\nimport \"example.com/m/app\"\n\nfunc D() { app.A() }\n",
   		policy.FileName: layeredPolicy,
   	})
   }

   func baselineOf(t *testing.T, dir string) *policy.Baseline {
   	t.Helper()
   	b, err := os.ReadFile(filepath.Join(dir, policy.BaselineFile))
   	if err != nil {
   		t.Fatal(err)
   	}
   	base, err := policy.DecodeBaseline(b)
   	if err != nil {
   		t.Fatal(err)
   	}
   	return base
   }

   func TestCheckFailsOnlyOnNewViolations(t *testing.T) {
   	dir := layeredRepo(t)
   	code, out, errOut := run("check", dir)
   	if code != ExitViolation || !strings.Contains(out, "levels  example.com/m/dom → example.com/m/app") {
   		t.Fatalf("no Baseline: exit %d, stdout %q, stderr %q", code, out, errOut)
   	}
   	if !strings.Contains(errOut, "-update-baseline") {
   		t.Errorf("stderr %q does not say how to accept them", errOut)
   	}

   	if code, _, errOut := run("check", "-update-baseline", dir); code != ExitOK || !strings.Contains(errOut, "accepting 1 violations:\n  levels  example.com/m/dom → example.com/m/app") {
   		t.Fatalf("-update-baseline creates the Baseline and lists what it accepts: exit %d, stderr %q", code, errOut)
   	}
   	if b := baselineOf(t, dir); len(b.Violations) != 1 || b.Violations[0].From != "example.com/m/dom" {
   		t.Fatalf("Baseline = %+v", b)
   	}
   	if code, out, _ := run("check", dir); code != ExitOK || !strings.Contains(out, "0 new, 1 known") {
   		t.Fatalf("known violation: exit %d, stdout %q", code, out)
   	}

   	writeFile(t, dir, "dom/sub/sub.go", "package sub\n\nimport _ \"example.com/m/app\"\n")
   	code, out, _ = run("check", dir)
   	if code != ExitViolation || !strings.Contains(out, "dom/sub → example.com/m/app") || strings.Contains(out, "m/dom → ") {
   		t.Fatalf("a new violation alone is listed: exit %d, stdout %q", code, out)
   	}
   	if code, _, _ := run("check", "-update-baseline", dir); code != ExitViolation {
   		t.Error("-update-baseline under the same Policy never accepts a new violation")
   	}
   }

   func TestCheckUpdateBaselineRemovesFixed(t *testing.T) {
   	dir := layeredRepo(t)
   	run("check", "-update-baseline", dir)
   	writeFile(t, dir, "dom/dom.go", "package dom\n")
   	code, out, _ := run("check", dir)
   	if code != ExitOK || !strings.Contains(out, "1 fixed") {
   		t.Fatalf("fixed: exit %d, stdout %q", code, out)
   	}
   	run("check", "-update-baseline", dir)
   	if b := baselineOf(t, dir); len(b.Violations) != 0 {
   		t.Fatalf("fixed entry kept: %+v", b)
   	}
   }

   // A Baseline written under another Policy stops check, with or without
   // -update-baseline, even when the edit changes no rule: entries are only
   // ever removed, so a Policy edit cannot slip a new violation in.
   func TestCheckStaleBaselineStops(t *testing.T) {
   	dir := layeredRepo(t)
   	run("check", "-update-baseline", dir)
   	before := baselineOf(t, dir)
   	writeFile(t, dir, "dom/sub/sub.go", "package sub\n\nimport _ \"example.com/m/app\"\n")
   	writeFile(t, dir, policy.FileName, layeredPolicy+"order: [example.com/m/dom]\n")
   	for _, args := range [][]string{{"check", dir}, {"check", "-update-baseline", dir}} {
   		code, _, errOut := run(args...)
   		if code != ExitBadInvocation || !strings.Contains(errOut, "delete "+policy.BaselineFile) || !strings.Contains(errOut, "accept 2 current violations") {
   			t.Fatalf("%v: exit %d, stderr %q", args, code, errOut)
   		}
   	}
   	if after := baselineOf(t, dir); after.PolicyHash != before.PolicyHash || len(after.Violations) != 1 {
   		t.Fatalf("a stale Baseline was rewritten: %+v", after)
   	}
   	if err := os.Remove(filepath.Join(dir, policy.BaselineFile)); err != nil {
   		t.Fatal(err)
   	}
   	if code, _, errOut := run("check", "-update-baseline", dir); code != ExitOK || !strings.Contains(errOut, "accepting 2 violations") {
   		t.Fatalf("re-created: exit %d, stderr %q", code, errOut)
   	}
   }

   func TestCheckBadInvocations(t *testing.T) {
   	for name, tc := range map[string]struct {
   		files map[string]string
   		args  []string
   		want  string
   	}{
   		"no rules":     {map[string]string{"go.mod": "module example.com/m\n", policy.FileName: "foreign: [x.io]\n"}, nil, "no rules"},
   		"no Policy":    {map[string]string{"go.mod": "module example.com/m\n"}, nil, "no rules"},
   		"level typo":   {map[string]string{"go.mod": "module example.com/m\n", "a/a.go": "package a\n", policy.FileName: "levels: [example.com/m/b]\n"}, nil, "matches no package"},
   		"ref + update": {map[string]string{"go.mod": "module example.com/m\n"}, []string{"-ref", "HEAD", "-update-baseline"}, "-update-baseline"},
   		"bad Baseline": {map[string]string{"go.mod": "module example.com/m\n", "a/a.go": "package a\n", policy.FileName: "cycles: true\n", policy.BaselineFile: "{}"}, nil, policy.BaselineFile},
   		"big Baseline": {map[string]string{"go.mod": "module example.com/m\n", "a/a.go": "package a\n", policy.FileName: "cycles: true\n", policy.BaselineFile: strings.Repeat(" ", scan.MaxSmallFile+1)}, nil, "larger than"},
   	} {
   		t.Run(name, func(t *testing.T) {
   			dir := repo(t, tc.files)
   			code, _, errOut := run(append([]string{"check", dir}, tc.args...)...)
   			if code != ExitBadInvocation || !strings.Contains(errOut, tc.want) {
   				t.Fatalf("exit %d, stderr %q, want 3 and %q", code, errOut, tc.want)
   			}
   		})
   	}
   }

   func TestCheckParseFailureWins(t *testing.T) {
   	dir := layeredRepo(t)
   	writeFile(t, dir, "bad/bad.go", "package bad\n\nfunc {\n")
   	if code, _, _ := run("check", dir); code != ExitParseFailure {
   		t.Fatalf("exit %d, want %d: a file that does not parse hides its imports", code, ExitParseFailure)
   	}
   }
   ```

   ```diff
   --- a/internal/cli/cli_test.go
   +++ b/internal/cli/cli_test.go
   @@ -6,6 +6,7 @@
    	"testing"
    
    	"zu/internal/ir"
   +	"zu/internal/policy"
    	"zu/internal/version"
    )
    
   @@ -24,6 +25,7 @@
    		"version " + version.Version,
    		"commit " + version.Commit,
    		"ir-schema " + ir.SchemaVersion,
   +		"policy-format " + policy.Format,
    	} {
    		if !strings.Contains(out, want) {
    			t.Errorf("output %q missing %q", out, want)
   @@ -67,7 +69,7 @@
    }
    
    func TestPlannedCommandsReportNotImplemented(t *testing.T) {
   -	for _, cmd := range []string{"serve", "check", "policy"} {
   +	for _, cmd := range []string{"serve", "policy"} {
    		code, _, errOut := run(cmd)
    		if code != ExitBadInvocation {
    			t.Errorf("%s: exit = %d, want %d", cmd, code, ExitBadInvocation)
   ```

- [ ] **Run it:** `go test ./internal/cli -run 'Check|Planned|Version'`. Expected: FAIL (`zu check: not implemented`; the version output lacks `policy-format`).

- [ ] **Implement**

   <!-- file: internal/cli/check.go -->
   ```go
   package cli

   import (
   	"bytes"
   	"errors"
   	"flag"
   	"fmt"
   	"io"
   	"io/fs"
   	"path/filepath"

   	"zu/internal/policy"
   	"zu/internal/scan"
   )

   // runCheck implements `zu check [dir] [-ref commit] [-update-baseline]
   // [-max-parse-errors N]`: evaluate the Policy's rules and fail only on
   // violations the Baseline does not know. Exit codes: 0 none new, 1 new
   // violations, 2 parse failures (a file that does not parse hides its
   // imports), 3 bad invocation or unusable Policy or Baseline.
   func runCheck(args []string, stdout, stderr io.Writer) int {
   	fset := flag.NewFlagSet("zu check", flag.ContinueOnError)
   	fset.SetOutput(stderr)
   	refName := fset.String("ref", "", "check `commit` from git objects instead of the working tree")
   	update := fset.Bool("update-baseline", false, "write "+policy.BaselineFile+": remove fixed entries, or create it from every current violation")
   	maxErrs := fset.Int("max-parse-errors", 0, "exit 2 when more than `N` files fail to parse")
   	dir, err := parseWithDir(fset, args)
   	if err != nil {
   		if !errors.Is(err, flag.ErrHelp) {
   			fmt.Fprintf(stderr, "zu check: %v\n", err)
   		}
   		return ExitBadInvocation
   	}
   	if *update && *refName != "" {
   		fmt.Fprintln(stderr, "zu check: -update-baseline writes the working tree's Baseline; it cannot be used with -ref")
   		return ExitBadInvocation
   	}
   	if *maxErrs < 0 {
   		fmt.Fprintln(stderr, "zu check: -max-parse-errors must be >= 0")
   		return ExitBadInvocation
   	}

   	ctx, stop := interruptContext()
   	defer stop()
   	src, err := openSource(ctx, dir, *refName, false)
   	if err != nil {
   		fmt.Fprintf(stderr, "zu check: %v\n", err)
   		return ExitBadInvocation
   	}
   	defer src.close()
   	doc, pol, stats, err := scanSource(ctx, src)
   	if err == nil && !pol.Rules() {
   		err = fmt.Errorf("%s has no rules: add levels or cycles: true", policy.FileName)
   	}
   	if err != nil {
   		fmt.Fprintf(stderr, "zu check: %v\n", err)
   		return ExitBadInvocation
   	}
   	// Before Validate: a file that does not parse can hide the package a
   	// level names, and it always hides its own imports.
   	if stats.ParseErrors > *maxErrs {
   		fmt.Fprintf(stderr, "zu check: %d files failed to parse; their imports are not checked\n", stats.ParseErrors)
   		return ExitParseFailure
   	}
   	err = pol.Validate(doc)
   	var base *policy.Baseline
   	if err == nil {
   		base, err = readBaseline(func(rel string) ([]byte, error) { return scan.ReadSmall(src.tree, rel) })
   	}
   	if err != nil {
   		fmt.Fprintf(stderr, "zu check: %v\n", err)
   		return ExitBadInvocation
   	}

   	current := pol.Check(doc)
   	hash := pol.Hash()
   	if base.Stale(hash) {
   		// Entries are only ever removed: accepting what a Policy change
   		// brings means deleting the Baseline, in the MR, visibly.
   		fmt.Fprintf(stderr, "zu check: Baseline was written under Policy %s; delete %s and re-run with -update-baseline to accept %d current violations\n",
   			base.PolicyHash, policy.BaselineFile, len(current))
   		return ExitBadInvocation
   	}
   	if *update {
   		created := base == nil
   		if base, err = base.Update(current, hash); err != nil {
   			fmt.Fprintf(stderr, "zu check: %v\n", err)
   			return ExitBadInvocation
   		}
   		var buf bytes.Buffer
   		if err := base.Encode(&buf); err != nil {
   			fmt.Fprintf(stderr, "zu check: %v\n", err)
   			return ExitBadInvocation
   		}
   		if err := writeAtomic(filepath.Join(src.root, policy.BaselineFile), buf.Bytes()); err != nil {
   			fmt.Fprintf(stderr, "zu check: write: %v\n", err)
   			return ExitBadInvocation
   		}
   		if created {
   			fmt.Fprintf(stderr, "zu check: created %s, accepting %d violations:\n", policy.BaselineFile, len(base.Violations))
   			writeViolations(stderr, base.Violations)
   		} else {
   			fmt.Fprintf(stderr, "zu check: wrote %s (%d violations)\n", policy.BaselineFile, len(base.Violations))
   		}
   	}

   	fresh, fixed := base.Split(current)
   	writeViolations(stdout, fresh)
   	fmt.Fprintf(stdout, "zu check: %d new, %d known, %d fixed\n", len(fresh), len(current)-len(fresh), len(fixed))
   	if len(fixed) > 0 && !*update {
   		fmt.Fprintf(stderr, "zu check: run zu check -update-baseline to drop %d fixed entries from %s\n", len(fixed), policy.BaselineFile)
   	}
   	if len(fresh) > 0 {
   		fmt.Fprintf(stderr, "zu check: %d new violations; fix them, or delete %s and run zu check -update-baseline to accept every current one\n",
   			len(fresh), policy.BaselineFile)
   		return ExitViolation
   	}
   	return ExitOK
   }

   // readBaseline reads the Baseline through the tree; a missing file is nil.
   func readBaseline(read func(string) ([]byte, error)) (*policy.Baseline, error) {
   	data, err := read(policy.BaselineFile)
   	if errors.Is(err, fs.ErrNotExist) {
   		return nil, nil
   	}
   	if err != nil {
   		return nil, fmt.Errorf("%s: %w", policy.BaselineFile, err)
   	}
   	return policy.DecodeBaseline(data)
   }

   // writeViolations lists violations one per line, sorted as given.
   func writeViolations(w io.Writer, vs []policy.Violation) {
   	for _, v := range vs {
   		fmt.Fprintf(w, "  %-6s  %s → %s\n", v.Rule, v.From, v.To)
   	}
   }
   ```

   ```diff
   --- a/internal/cli/cli.go
   +++ b/internal/cli/cli.go
   @@ -6,6 +6,7 @@
    	"io"
    
    	"zu/internal/ir"
   +	"zu/internal/policy"
    	"zu/internal/version"
    )
    
   @@ -23,14 +24,14 @@
      scan      parse the checkout (or a commit, with -ref) and write the IR
      serve     scan if needed, then serve the local web UI
      diff      summarise a change: head against its merge-base with base
   -  check     evaluate policy rules against the current IR
   -  policy    init or suggest a grouping policy
   -  version   print application, commit and IR schema versions
   +  check     evaluate the Policy's rules; fail on violations not in the Baseline
   +  policy    init: write a suggested zu.policy.yaml (never overwrites)
   +  version   print application, commit, IR schema and Policy format versions
    `
    
    // planned lists commands that are part of the CLI surface but not built yet.
    var planned = map[string]bool{
   -	"serve": true, "check": true, "policy": true,
   +	"serve": true, "policy": true,
    }
    
    // Run executes the command line args (without the program name) and returns
   @@ -45,13 +46,15 @@
    		fmt.Fprint(stdout, usage)
    		return ExitOK
    	case cmd == "version":
   -		fmt.Fprintf(stdout, "zu version %s\ncommit %s\nir-schema %s\n",
   -			version.Version, version.Commit, ir.SchemaVersion)
   +		fmt.Fprintf(stdout, "zu version %s\ncommit %s\nir-schema %s\npolicy-format %s\n",
   +			version.Version, version.Commit, ir.SchemaVersion, policy.Format)
    		return ExitOK
    	case cmd == "scan":
    		return runScan(args[1:], stdout, stderr)
    	case cmd == "diff":
    		return runDiff(args[1:], stdout, stderr)
   +	case cmd == "check":
   +		return runCheck(args[1:], stdout, stderr)
    	case planned[cmd]:
    		fmt.Fprintf(stderr, "zu %s: not implemented\n", cmd)
    		return ExitBadInvocation
   ```

- [ ] **Run:** `go test ./internal/cli`. Expected: `ok`.

### Task 9: `zu policy init`

The suggestion follows ADR 0008: Levels only, never a component map. The candidates are the module roots when there are several modules. Otherwise they are the children of the first box under the root that has more than one child, which for zu is `zu/cmd`, `zu/internal` and `zu/web`. A candidate's rank is the length of the longest import chain below it, and candidates on a cycle share a rank, so the file holds as written: `zu check` passes on the day it is written.

**Files:**
- Create: `internal/policy/suggest.go`, `internal/policy/suggest_test.go`, `internal/cli/policycmd.go`, `internal/cli/policy_test.go`
- Modify: `internal/cli/cli.go`, `internal/cli/cli_test.go` (`policy` leaves `planned`; the usage lines change)

**Steps:**

- [ ] **Write the failing tests**

   <!-- file: internal/policy/suggest_test.go -->
   ```go
   package policy

   import (
   	"slices"
   	"strings"
   	"testing"
   )

   func TestSuggestRanksModulesWhenThereAreSeveral(t *testing.T) {
   	doc := graph([]string{"m/a@m", "m/b@m", "n/c@n"}, "n/c>m/a")
   	if got := Suggest(doc); !slices.EqualFunc(got, []Level{{"m"}, {"n"}}, slices.Equal) {
   		t.Fatalf("Suggest = %v", got)
   	}
   }

   func TestSuggestRanksTheFirstBranchingBoxesByImports(t *testing.T) {
   	// m/internal is the only child of m, so the candidates are its children.
   	doc := graph([]string{
   		"m/internal/dom@m", "m/internal/dom/model@m", "m/internal/app@m", "m/internal/cli@m",
   		"m/internal/x@m", "m/internal/y@m",
   	},
   		"m/internal/app>m/internal/dom/model", "m/internal/cli>m/internal/app", "m/internal/cli>m/internal/dom",
   		"m/internal/x>m/internal/y", "m/internal/y>m/internal/x", "m/internal/x>m/internal/app", // x ⇄ y share a level
   	)
   	got := Suggest(doc)
   	want := []Level{
   		{"m/internal/dom"},
   		{"m/internal/app"},
   		{"m/internal/cli", "m/internal/x", "m/internal/y"},
   	}
   	if !slices.EqualFunc(got, want, slices.Equal) {
   		t.Fatalf("Suggest = %v, want %v", got, want)
   	}
   }

   func TestInitFileParsesAndHoldsAsWritten(t *testing.T) {
   	doc := graph([]string{"m/a@m", "m/b@m", "n/c@n"}, "m/a>m/b", "n/c>m/a")
   	levels := Suggest(doc)
   	src := InitFile(levels, "abc123")
   	p, err := Parse(src)
   	if err != nil {
   		t.Fatalf("%v\n%s", err, src)
   	}
   	if !slices.EqualFunc(levels, p.Levels, slices.Equal) {
   		t.Fatalf("levels %v round-tripped as %v", levels, p.Levels)
   	}
   	if err := p.Validate(doc); err != nil {
   		t.Fatal(err)
   	}
   	if vs := p.Check(doc); len(vs) != 0 {
   		t.Fatalf("the suggestion must hold as written, got %v", vs)
   	}
   	if !strings.Contains(string(src), "abc123") || !strings.Contains(string(src), "# exclude:") {
   		t.Errorf("header or exclude hint missing:\n%s", src)
   	}
   }

   func TestInitFileWithNoLayering(t *testing.T) {
   	p, err := Parse(InitFile(nil, ""))
   	if err != nil || p.Rules() {
   		t.Fatalf("no candidates: %+v, %v", p, err)
   	}
   }
   ```

   <!-- file: internal/cli/policy_test.go -->
   ```go
   package cli

   import (
   	"os"
   	"path/filepath"
   	"strings"
   	"testing"

   	"zu/internal/policy"
   )

   func TestPolicyInitWritesLevelsThatHold(t *testing.T) {
   	dir := repo(t, map[string]string{
   		"go.mod":     "module example.com/m\n",
   		"app/app.go": "package app\n",
   		"dom/dom.go": "package dom\n\nimport _ \"example.com/m/app\"\n",
   	})
   	if code, _, errOut := run("policy", "init", dir); code != ExitOK || !strings.Contains(errOut, "2 levels") {
   		t.Fatalf("exit %d, stderr %q", code, errOut)
   	}
   	b, err := os.ReadFile(filepath.Join(dir, policy.FileName))
   	if err != nil {
   		t.Fatal(err)
   	}
   	if !strings.Contains(string(b), "- [\"example.com/m/app\"]\n  - [\"example.com/m/dom\"]") {
   		t.Fatalf("levels not inner first:\n%s", b)
   	}
   	if code, out, errOut := run("check", dir); code != ExitOK || !strings.Contains(out, "0 new") {
   		t.Fatalf("the suggestion must pass check: exit %d, %q %q", code, out, errOut)
   	}
   }

   func TestPolicyInitNeverOverwrites(t *testing.T) {
   	dir := repo(t, map[string]string{"go.mod": "module example.com/m\n", policy.FileName: "# mine\n"})
   	code, _, errOut := run("policy", "init", dir)
   	if code != ExitBadInvocation || !strings.Contains(errOut, "already exists") {
   		t.Fatalf("exit %d, stderr %q", code, errOut)
   	}
   	if b, _ := os.ReadFile(filepath.Join(dir, policy.FileName)); string(b) != "# mine\n" {
   		t.Fatalf("overwritten: %q", b)
   	}
   }

   func TestPolicyNeedsASubcommand(t *testing.T) {
   	for _, args := range [][]string{{"policy"}, {"policy", "suggest"}} {
   		if code, _, errOut := run(args...); code != ExitBadInvocation || !strings.Contains(errOut, "zu policy init") {
   			t.Errorf("%v: exit %d, stderr %q", args, code, errOut)
   		}
   	}
   }
   ```

   ```diff
   --- a/internal/cli/cli_test.go
   +++ b/internal/cli/cli_test.go
   @@ -69,7 +69,7 @@
    }
    
    func TestPlannedCommandsReportNotImplemented(t *testing.T) {
   -	for _, cmd := range []string{"serve", "policy"} {
   +	for _, cmd := range []string{"serve"} {
    		code, _, errOut := run(cmd)
    		if code != ExitBadInvocation {
    			t.Errorf("%s: exit = %d, want %d", cmd, code, ExitBadInvocation)
   ```

- [ ] **Run them:** `go test ./internal/policy ./internal/cli -run 'Suggest|InitFile|Policy'`. Expected: FAIL (`undefined: Suggest`).

- [ ] **Implement**

   <!-- file: internal/policy/suggest.go -->
   ```go
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
   ```

   <!-- file: internal/cli/policycmd.go -->
   ```go
   package cli

   import (
   	"errors"
   	"flag"
   	"fmt"
   	"io"
   	"io/fs"
   	"os"
   	"path/filepath"

   	"zu/internal/policy"
   )

   // runPolicy implements `zu policy init [dir]`: write a suggested
   // zu.policy.yaml at dir. It never overwrites an existing file.
   func runPolicy(args []string, _, stderr io.Writer) int {
   	if len(args) == 0 || args[0] != "init" {
   		fmt.Fprintln(stderr, "usage: zu policy init [dir]")
   		return ExitBadInvocation
   	}
   	fset := flag.NewFlagSet("zu policy init", flag.ContinueOnError)
   	fset.SetOutput(stderr)
   	dir, err := parseWithDir(fset, args[1:])
   	if err != nil {
   		if !errors.Is(err, flag.ErrHelp) {
   			fmt.Fprintf(stderr, "zu policy init: %v\n", err)
   		}
   		return ExitBadInvocation
   	}
   	target := filepath.Join(dir, policy.FileName)
   	if _, err := os.Lstat(target); !errors.Is(err, fs.ErrNotExist) {
   		fmt.Fprintf(stderr, "zu policy init: %s already exists; zu never overwrites it\n", target)
   		return ExitBadInvocation
   	}

   	ctx, stop := interruptContext()
   	defer stop()
   	src, err := openSource(ctx, dir, "", false)
   	if err != nil {
   		fmt.Fprintf(stderr, "zu policy init: %v\n", err)
   		return ExitBadInvocation
   	}
   	defer src.close()
   	doc, _, _, err := scanSource(ctx, src)
   	if err != nil {
   		fmt.Fprintf(stderr, "zu policy init: %v\n", err)
   		return ExitBadInvocation
   	}
   	commit, dirty := gitHead(ctx, dir)
   	if dirty {
   		commit = "" // the working tree, not the commit
   	}
   	levels := policy.Suggest(doc)
   	// O_EXCL: a file created since the check above is still never replaced.
   	f, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644) // #nosec G304 -- the user's own directory
   	if err == nil {
   		_, err = f.Write(policy.InitFile(levels, commit))
   		err = errors.Join(err, f.Close())
   	}
   	if err != nil {
   		fmt.Fprintf(stderr, "zu policy init: write: %v\n", err)
   		return ExitBadInvocation
   	}
   	boxes := 0
   	for _, l := range levels {
   		boxes += len(l)
   	}
   	fmt.Fprintf(stderr, "zu policy init: wrote %s (%d levels, %d boxes)\n", target, len(levels), boxes)
   	return ExitOK
   }
   ```

   ```diff
   --- a/internal/cli/cli.go
   +++ b/internal/cli/cli.go
   @@ -31,7 +31,7 @@
    
    // planned lists commands that are part of the CLI surface but not built yet.
    var planned = map[string]bool{
   -	"serve": true, "policy": true,
   +	"serve": true,
    }
    
    // Run executes the command line args (without the program name) and returns
   @@ -55,6 +55,8 @@
    		return runDiff(args[1:], stdout, stderr)
    	case cmd == "check":
    		return runCheck(args[1:], stdout, stderr)
   +	case cmd == "policy":
   +		return runPolicy(args[1:], stdout, stderr)
    	case planned[cmd]:
    		fmt.Fprintf(stderr, "zu %s: not implemented\n", cmd)
    		return ExitBadInvocation
   ```

- [ ] **Run:** `go test ./internal/policy ./internal/cli`. Expected: `ok`.

### Task 10: `zu diff` reports new violations first and exits 1 on them (B7, B9)

**Files:**
- Create: `internal/diff/violations.go`, `internal/diff/violations_test.go`
- Modify: `internal/diff/summary.go`, `internal/diff/render.go`, `internal/cli/diff.go`, `internal/cli/diff_test.go`, `docx/features/03-diff-ci/output.md` (03's output contract)

**Steps:**

- [ ] **Write the failing tests.** 03's goldens (`internal/diff/testdata/shop.summary.*`) must stay byte-identical, because without rules there is no section.

   <!-- file: internal/diff/violations_test.go -->
   ```go
   package diff

   import (
   	"bytes"
   	"encoding/json"
   	"slices"
   	"strings"
   	"testing"

   	"zu/internal/policy"
   )

   var (
   	known = policy.Violation{Rule: policy.RuleLevels, From: "m/a", To: "m/b"}
   	fresh = policy.Violation{Rule: policy.RuleCycle, From: "m/c", To: "m/d"}
   	gone  = policy.Violation{Rule: policy.RuleLevels, From: "m/e", To: "m/f"}
   )

   func TestViolationsNewAreInHeadOnly(t *testing.T) {
   	d := Violations([]policy.Violation{known, gone}, []policy.Violation{fresh, known})
   	if !slices.Equal(d.New, []policy.Violation{fresh}) || !slices.Equal(d.Fixed, []policy.Violation{gone}) || d.Known != 1 {
   		t.Fatalf("Violations = %+v", d)
   	}
   	if e := Violations(nil, nil); e.New == nil || e.Fixed == nil {
   		t.Error("empty lists encode as [], not null")
   	}
   }

   func TestRenderPutsNewViolationsFirst(t *testing.T) {
   	base, head := shopPair(t)
   	s := Summarize(base, head)
   	s.Violations = Violations([]policy.Violation{known}, []policy.Violation{known, fresh})
   	for _, md := range []bool{false, true} {
   		out := render(t, s, md)
   		v, p := strings.Index(out, "New violations"), strings.Index(out, "Packages")
   		if md {
   			p = strings.Index(out, "| Package |")
   		}
   		if v < 0 || p < 0 || v > p {
   			t.Fatalf("md=%v: new violations must come before the packages:\n%s", md, out)
   		}
   		if !strings.Contains(out, "m/c") || strings.Contains(out, "m/a → m/b") || strings.Contains(out, "`m/a` → `m/b`") {
   			t.Errorf("md=%v: only new violations are listed:\n%s", md, out)
   		}
   		if !strings.Contains(out, "1 pre-existing") {
   			t.Errorf("md=%v: pre-existing count missing:\n%s", md, out)
   		}
   	}
   	var buf bytes.Buffer
   	if err := WriteJSON(&buf, s); err != nil {
   		t.Fatal(err)
   	}
   	var back struct {
   		Violations *ViolationDelta `json:"violations"`
   	}
   	if err := json.Unmarshal(buf.Bytes(), &back); err != nil || back.Violations == nil || len(back.Violations.New) != 1 {
   		t.Fatalf("JSON violations = %+v, %v", back.Violations, err)
   	}
   }

   func TestNoPolicyRulesNoViolationsSection(t *testing.T) {
   	base, head := shopPair(t)
   	s := Summarize(base, head)
   	var buf bytes.Buffer
   	if err := WriteJSON(&buf, s); err != nil {
   		t.Fatal(err)
   	}
   	if strings.Contains(buf.String(), `"violations"`) || strings.Contains(render(t, s, false), "violations") {
   		t.Fatal("without rules the summary is exactly 03's")
   	}
   }
   ```

   ```diff
   --- a/internal/cli/diff_test.go
   +++ b/internal/cli/diff_test.go
   @@ -343,3 +343,68 @@
    		t.Errorf("html not written before the parse-failure exit: %v", err)
    	}
    }
   +
   +// A change that adds a Levels violation exits 1 and lists it first; one
   +// already at base is pre-existing (B7, B9).
   +func TestDiffNewViolationExitsOne(t *testing.T) {
   +	needGit(t)
   +	dir := repo(t, map[string]string{
   +		"go.mod":        "module example.com/m\n",
   +		"a/a.go":        "package a\n",
   +		"b/b.go":        "package b\n\nimport _ \"example.com/m/a\"\n",
   +		policy.FileName: "levels: [example.com/m/b, example.com/m/a]\n", // b inner: b → a is known
   +	})
   +	git(t, dir, "init", "-q", "-b", "main")
   +	git(t, dir, "add", "-A")
   +	git(t, dir, "commit", "-q", "-m", "base")
   +	git(t, dir, "checkout", "-q", "-b", "feat")
   +	t.Chdir(dir)
   +	code, out, errOut := run("diff", "main")
   +	if code != ExitOK || !strings.Contains(out, "No new violations · 0 fixed, 1 pre-existing") {
   +		t.Fatalf("known only: exit %d, stdout %q, stderr %q", code, out, errOut)
   +	}
   +
   +	writeFile(t, dir, "b/c/c.go", "package c\n\nimport _ \"example.com/m/a\"\n")
   +	git(t, dir, "add", "-A")
   +	git(t, dir, "commit", "-q", "-m", "add c")
   +	code, out, errOut = run("diff", "main", "-format", "json")
   +	if code != ExitViolation || !strings.Contains(errOut, "1 new violations") {
   +		t.Fatalf("new violation: exit %d, stderr %q", code, errOut)
   +	}
   +	s := summaryOf(t, out)
   +	if s.Violations == nil || len(s.Violations.New) != 1 || s.Violations.New[0].From != "example.com/m/b/c" || s.Violations.Known != 1 {
   +		t.Fatalf("violations = %+v", s.Violations)
   +	}
   +}
   +
   +// A level naming a package the MR deletes is a warning, not a stop: check
   +// enforces it on the tree that has the stale name. The MR that also fixes
   +// the Policy passes cleanly, since head's Policy governs both sides.
   +func TestDiffWarnsWhenALevelNamesNoPackage(t *testing.T) {
   +	needGit(t)
   +	dir := repo(t, map[string]string{
   +		"go.mod":        "module example.com/m\n",
   +		"a/a.go":        "package a\n",
   +		"b/b.go":        "package b\n",
   +		"c/c.go":        "package c\n",
   +		policy.FileName: "levels: [example.com/m/a, example.com/m/b, example.com/m/c]\n",
   +	})
   +	git(t, dir, "init", "-q", "-b", "main")
   +	git(t, dir, "add", "-A")
   +	git(t, dir, "commit", "-q", "-m", "base")
   +	git(t, dir, "checkout", "-q", "-b", "feat")
   +	git(t, dir, "rm", "-q", "c/c.go")
   +	git(t, dir, "commit", "-q", "-m", "delete c")
   +	t.Chdir(dir)
   +	code, _, errOut := run("diff", "main")
   +	if code != ExitOK || !strings.Contains(errOut, "warning") || !strings.Contains(errOut, `"example.com/m/c"`) {
   +		t.Fatalf("deleted ranked package: exit %d, stderr %q", code, errOut)
   +	}
   +
   +	writeFile(t, dir, policy.FileName, "levels: [example.com/m/a, example.com/m/b]\n")
   +	git(t, dir, "commit", "-q", "-am", "drop c from the levels")
   +	code, _, errOut = run("diff", "main")
   +	if code != ExitOK || strings.Contains(errOut, "warning") {
   +		t.Fatalf("Policy fixed in the same MR: exit %d, stderr %q", code, errOut)
   +	}
   +}
   ```

   `TestDiffWarnsWhenALevelNamesNoPackage` is the scrutiny's M1 scenario: an MR deletes a ranked package (exit 0 with a warning), then also fixes the Policy (exit 0, no warning).

- [ ] **Run them:** `go test ./internal/diff ./internal/cli -run 'Violation|Level'`. Expected: FAIL (`undefined: Violations`).

- [ ] **Implement**

   <!-- file: internal/diff/violations.go -->
   ```go
   package diff

   import (
   	"fmt"
   	"strings"

   	"zu/internal/policy"
   )

   // ViolationDelta is how a change moved the Policy's violations (B7): New are
   // in head and not in base, Fixed in base and not in head, Known in both.
   type ViolationDelta struct {
   	New   []policy.Violation `json:"new"`
   	Fixed []policy.Violation `json:"fixed"`
   	Known int                `json:"known"`
   }

   // Violations compares base's and head's violations, both evaluated under
   // head's Policy (ADR 0004).
   func Violations(base, head []policy.Violation) *ViolationDelta {
   	fresh, fixed := (&policy.Baseline{Violations: base}).Split(head)
   	return &ViolationDelta{New: orEmpty(fresh), Fixed: orEmpty(fixed), Known: len(head) - len(fresh)}
   }

   // violationsBlock is the section every format writes first (decisions:
   // "new violations first"), with at most items new violations listed.
   func violationsBlock(d *ViolationDelta, md bool, items int) string {
   	var b strings.Builder
   	tail := fmt.Sprintf("%d fixed, %d pre-existing", len(d.Fixed), d.Known)
   	if len(d.New) == 0 {
   		b.WriteString("No new violations · " + tail + "\n")
   		return b.String()
   	}
   	if md {
   		fmt.Fprintf(&b, "**New violations (%d)**\n\n", len(d.New))
   	} else {
   		fmt.Fprintf(&b, "New violations (%d):\n", len(d.New))
   	}
   	for _, v := range d.New[:min(items, len(d.New))] {
   		if md {
   			fmt.Fprintf(&b, "- %s `%s` → `%s`\n", v.Rule, v.From, v.To)
   		} else {
   			fmt.Fprintf(&b, "  %-6s  %s → %s\n", v.Rule, v.From, v.To)
   		}
   	}
   	more(&b, len(d.New)-items)
   	if md {
   		b.WriteString("\n")
   	}
   	b.WriteString(tail + "\n")
   	return b.String()
   }

   func newCount(s *Summary) int {
   	if s.Violations == nil {
   		return 0
   	}
   	return len(s.Violations.New)
   }
   ```

   ```diff
   --- a/internal/diff/summary.go
   +++ b/internal/diff/summary.go
   @@ -23,7 +23,8 @@
    	Base           ir.Ref            `json:"base"`
    	Head           ir.Ref            `json:"head"`
    	Changed        bool              `json:"changed"`
   -	Packages       []PackageRow      `json:"packages"` // changed packages, bottom-up
   +	Violations     *ViolationDelta   `json:"violations,omitempty"` // only when the Policy has rules
   +	Packages       []PackageRow      `json:"packages"`             // changed packages, bottom-up
    	Imports        []EdgeChange      `json:"imports"`
    	EdgeCounts     map[string]Counts `json:"edgeCounts"` // "calls", "embeds"
    	Moves          []Move            `json:"moves"`
   ```

   ```diff
   --- a/internal/diff/render.go
   +++ b/internal/diff/render.go
   @@ -18,6 +18,9 @@
    	var b strings.Builder
    	b.WriteString("zu · structural change\n")
    	b.WriteString(refLine(s) + "\n")
   +	if s.Violations != nil {
   +		b.WriteString("\n" + violationsBlock(s.Violations, false, len(s.Violations.New)) + "\n")
   +	}
    	if !s.Changed {
    		b.WriteString("no structural change\n")
    	} else {
   @@ -55,7 +58,7 @@
    func WriteMarkdown(w io.Writer, s *Summary) error {
    	footer := "\n" + NotCompared + "\n"
    	budget := markdownBudget - len(footer)
   -	all := max(len(s.Imports), len(s.Moves))
   +	all := max(len(s.Imports), len(s.Moves), newCount(s))
    	body := markdownBody(s, len(s.Packages), all)
    	if len(body) > budget {
    		// Largest table that fits with every list whole, else no table and
   @@ -93,6 +96,9 @@
    	var b strings.Builder
    	b.WriteString("### zu · structural change\n\n")
    	b.WriteString(refLine(s) + "\n\n")
   +	if s.Violations != nil {
   +		b.WriteString(violationsBlock(s.Violations, true, items) + "\n")
   +	}
    	if !s.Changed {
    		b.WriteString("no structural change\n\n")
    		b.WriteString(parseErrorsLine(s) + "\n")
   ```

   ```diff
   --- a/internal/cli/diff.go
   +++ b/internal/cli/diff.go
   @@ -31,6 +31,8 @@
    // [-worktree [-include-ignored]] [-max-parse-errors N] [-html file
    // [-link-template T]]`: the Structural Summary of head against the
    // merge-base of base and head, and optionally the Change View export.
   +// Exit 2 when head fails to parse, else 1 when the change adds violations
   +// of the Policy's rules, else 0.
    func runDiff(args []string, stdout, stderr io.Writer) int {
    	fs := flag.NewFlagSet("zu diff", flag.ContinueOnError)
    	fs.SetOutput(stderr)
   @@ -115,8 +117,16 @@
    	if err := ctx.Err(); err != nil {
    		return bad("%v", err)
    	}
   +	// check enforces this; a diff must not fail an MR that deletes or
   +	// renames a package a level names.
   +	if err := pol.Validate(headDoc); err != nil {
   +		fmt.Fprintf(stderr, "zu diff: warning: %v (zu check fails on it)\n", err)
   +	}
    
    	s := diff.Summarize(baseDoc, headDoc)
   +	if pol.Rules() {
   +		s.Violations = diff.Violations(pol.Check(baseDoc), pol.Check(headDoc))
   +	}
    	var buf bytes.Buffer
    	switch *format {
    	case "markdown":
   @@ -145,6 +155,10 @@
    	if len(headDoc.ParseErrors) > *maxErrs {
    		return ExitParseFailure
    	}
   +	if s.Violations != nil && len(s.Violations.New) > 0 {
   +		fmt.Fprintf(stderr, "zu diff: %d new violations of %s (B9)\n", len(s.Violations.New), policy.FileName)
   +		return ExitViolation
   +	}
    	return ExitOK
    }
    
   ```

- [ ] **Update 03's output contract** (`output.md` is what CI jobs rely on): head's Policy for both sides, exit 1's meaning, exit 3 without "changed policy", the `violations` JSON field and its place after `changed`, and the Markdown section order.

   ```diff
   --- a/docx/features/03-diff-ci/output.md
   +++ b/docx/features/03-diff-ci/output.md
   @@ -23,7 +23,10 @@
    | `-max-parse-errors N` | exit 2 when head has more than N files that fail to parse (default 0) |
    
    Both sides are scanned from the repository top level, whatever the current
   -directory, so running from a subdirectory gives the same output. Nothing is written
   +directory, so running from a subdirectory gives the same output. Both are scanned
   +under head's `zu.policy.yaml` (under `-worktree`, the working tree's; ADR 0004): its
   +`exclude` applies to base too, and base's violations are evaluated under head's rules.
   +The MR that adds or edits the Policy is diffed like any other. Nothing is written
    to `.zu/`; the summary goes to stdout and one status line to stderr:
    
    ```
   @@ -35,9 +38,9 @@
    | Code | When |
    |---|---|
    | 0 | the summary was printed, whatever it contains |
   -| 1 | reserved for new rule violations (the Policy feature) |
   +| 1 | head's Policy has rules (`levels` or `cycles: true`) and the change adds violations: present in head, absent in base, both under head's rules. The summary was printed. Exit 2 wins over 1 |
    | 2 | the summary was printed, but head has more parse errors than `-max-parse-errors`. Base's parse errors already exist on the base branch: they are reported and never fail the MR |
   -| 3 | bad invocation: unknown or option-like ref, not a git repository, bad flag or format, `-include-ignored` without `-worktree`, `-worktree` with a head ref, no merge-base, changed policy, or Ctrl-C. Nothing is printed on stdout |
   +| 3 | bad invocation: unknown or option-like ref, not a git repository, bad flag or format, `-include-ignored` without `-worktree`, `-worktree` with a head ref, no merge-base, a `zu.policy.yaml` that does not parse or validate, or Ctrl-C. Nothing is printed on stdout. A Level that names no package in head is only a warning on stderr; `zu check` fails on it |
    
    ## The merge-base requirement
    
   @@ -76,6 +79,11 @@
      "base": {"commit": "<merge-base id>", "dirty": false},
      "head": {"commit": "<head id>", "dirty": false},
      "changed": true,
   +  "violations": {
   +    "new": [{"rule": "levels", "from": "example.com/shop/internal/money", "to": "example.com/shop"}],
   +    "fixed": [],
   +    "known": 0
   +  },
      "packages": [
        {"id": "example.com/shop/internal/store", "status": "modified",
         "added": 0, "modified": 3, "removed": 1, "hops": 0}
   @@ -101,6 +109,7 @@
    | `summaryVersion` | `"1"`. A tool should refuse a version it does not know |
    | `base`, `head` | the IR refs compared. `base.commit` is the merge-base. `head.dirty` is true under `-worktree` when a tracked file is modified or an untracked (or included ignored) file is read |
    | `changed` | false when nothing below differs |
   +| `violations` | present only when head's Policy has rules. `new`: violations in head and not in base; `fixed`: in base and not in head; `known`: how many are in both. Each violation is `{"rule", "from", "to"}`: `levels` names two packages, an import from an inner level to an outer one; `cycle` names two sibling Package Tree boxes, one arc of a cycle between them. Lists are sorted by (rule, from, to) and never `null` |
    | `packages` | one row per changed package, in reading order: bottom-up by imports (leaves first; one import cycle shares a rank), then by id. `status` is `added`, `modified` or `removed`; `added`/`modified`/`removed` count the package's declarations (types and functions, methods included) with that status, Moves excluded; `hops` is 0 |
    | `imports` | changed import edges, sorted by (from, to). `status` is `added`, `removed` or `reversed`; a reversed pair (`a→b` removed, `b→a` added) is one entry in head's direction |
    | `edgeCounts` | added and removed `calls` and `embeds` edges, as counts only |
   @@ -122,24 +131,26 @@
    
    1. `### zu · structural change`
    2. `base <12> (merge-base) → head <12>`, with ` (worktree)` after head when it is dirty
   -3. the counts line: packages, declarations `+added ~modified −removed`, dependency changes, moves
   -4. the package table: `Package | Change | + ~ − | Hops`, ids in code spans with `|` escaped
   -5. **Dependencies**: `+`, `−` and `⇄ … (reversed)` lines
   -6. **Moves**
   -7. `Affected: N packages (c changed, k at 1 hop, …)`, N being the whole Affected Set
   -8. `Calls: +a −r · Embeds: +a −r`
   -9. a Mermaid `flowchart BT` of the changed packages plus their direct importers
   +3. only when head's Policy has rules: **New violations (N)** with one ``- <rule> `from` → `to` `` line each, then
   +   `F fixed, K pre-existing`; or `No new violations · F fixed, K pre-existing`
   +4. the counts line: packages, declarations `+added ~modified −removed`, dependency changes, moves
   +5. the package table: `Package | Change | + ~ − | Hops`, ids in code spans with `|` escaped
   +6. **Dependencies**: `+`, `−` and `⇄ … (reversed)` lines
   +7. **Moves**
   +8. `Affected: N packages (c changed, k at 1 hop, …)`, N being the whole Affected Set
   +9. `Calls: +a −r · Embeds: +a −r`
   +10. a Mermaid `flowchart BT` of the changed packages plus their direct importers
       (dimmed with `classDef dim`) and head's imports between them. Node ids are
       generated (`n1`, `n2`, … in row order) and labels quoted, so no package id can
       break it. Above 30 packages it is replaced by
       `_Diagram omitted: N packages (limit 30)._`
   -10. `Parse errors: base a, head b`
   -11. the not-compared footer
   +11. `Parse errors: base a, head b`
   +12. the not-compared footer
    
    When the whole comment would exceed the budget, the package table is cut first, then
   -the lists, each ending with `…and N more`. The counts, the Affected line and the
   -footer are always kept. With no change, sections 3–9 are replaced by
   -`no structural change`.
   +the lists (the new violations among them), each ending with `…and N more`. The counts,
   +the Affected line and the footer are always kept. With no change, sections 4–10 are
   +replaced by `no structural change`; the violations section stays.
    
    ## Text
    
   ```

- [ ] **Run:** `go test ./internal/diff ./internal/cli`. Expected: `ok`, with no golden rewritten.

### Task 11: The View carries ranks and violations; the export draws through the lens

**Files:**
- Create: `internal/export/policy.go`, `internal/export/policy_test.go`, `internal/export/testdata/shop.policy.yaml`, `internal/cli/policy_html_test.go`
- Modify: `internal/export/view.go`, `internal/cli/html.go`, `internal/cli/scan.go`, `internal/cli/diff.go`

The fixture Policy lives in `internal/export/testdata/` and is read with `policy.Parse`, not `Load`. This is deliberate: `internal/scan/testdata/shop`, `shop.golden.json` and `parity_test.go` stay 01's, and 04's `shop.view.golden.json` and `shop.change.golden.json` stay byte-identical.

**Steps:**

- [ ] **Write the failing tests**

   <!-- file: internal/export/testdata/shop.policy.yaml -->
   ```yaml
   # The Policy the export tests mark the shop View with. It lives here, not in
   # ../scan/testdata/shop, so the scan fixture, its golden and parity stay 01's.
   levels:
     - example.com/shop/internal/store
     - example.com/shop/internal/money
   cycles: true
   foreign: [github.com/lib]
   ```

   <!-- file: internal/export/policy_test.go -->
   ```go
   package export

   import (
   	"encoding/json"
   	"os"
   	"strings"
   	"testing"

   	"zu/internal/policy"
   )

   func shopPolicy(t *testing.T) *policy.Policy {
   	t.Helper()
   	b, err := os.ReadFile("testdata/shop.policy.yaml")
   	if err != nil {
   		t.Fatal(err)
   	}
   	p, err := policy.Parse(b) // Parse, not Load: the fixture is not at a tree root
   	if err != nil {
   		t.Fatal(err)
   	}
   	return p
   }

   func TestMarkAddsRanksAndViolations(t *testing.T) {
   	doc, pol := shopIR(t), shopPolicy(t)
   	v, err := Project(pol.Apply(doc), nil, nil)
   	if err != nil {
   		t.Fatal(err)
   	}
   	Mark(v, pol, doc)
   	if v.Policy == nil || v.Policy.Hash != pol.Hash() || len(v.Policy.Levels) != 2 || v.Policy.Levels[1][0] != "example.com/shop/internal/money" {
   		t.Fatalf("Policy = %+v", v.Policy)
   	}
   	ranks := map[string]*int{}
   	for _, n := range v.Nodes {
   		ranks[n.ID] = n.Rank
   	}
   	if r := ranks["example.com/shop/internal/store"]; r == nil || *r != 0 {
   		t.Errorf("store rank = %v, want 0", r)
   	}
   	if r := ranks["example.com/shop/internal/money"]; r == nil || *r != 1 {
   		t.Errorf("money rank = %v, want 1", r)
   	}
   	if ranks["example.com/shop/internal/checkout"] != nil {
   		t.Error("an unranked package has no rank")
   	}
   	if _, ok := ranks["github.com/lib"]; !ok {
   		t.Errorf("foreign github.com/lib not collapsed: %v", ranks)
   	}
   	var red []string
   	for _, e := range v.Edges {
   		if e.Violation != "" {
   			red = append(red, e.From+">"+e.To+":"+e.Violation)
   		}
   	}
   	if want := "example.com/shop/internal/store>example.com/shop/internal/money:levels"; strings.Join(red, ",") != want {
   		t.Fatalf("violating edges = %v, want %s", red, want)
   	}
   }

   func TestMarkWithoutRulesAddsNothing(t *testing.T) {
   	doc := shopIR(t)
   	v, err := Project(doc, nil, nil)
   	if err != nil {
   		t.Fatal(err)
   	}
   	before, _ := json.Marshal(v)
   	Mark(v, &policy.Policy{Foreign: []string{"github.com/lib"}}, doc)
   	if after, _ := json.Marshal(v); string(before) != string(after) {
   		t.Fatal("a Policy with no rules must leave the View (and 04's goldens) unchanged")
   	}
   }
   ```

   <!-- file: internal/cli/policy_html_test.go -->
   ```go
   package cli

   import (
   	"path/filepath"
   	"strings"
   	"testing"

   	"zu/internal/policy"
   )

   func TestScanHTMLDrawsThePolicy(t *testing.T) {
   	withUI(t)
   	dir := layeredRepo(t)
   	writeFile(t, dir, policy.FileName, layeredPolicy+"omit: [example.com/m/gone]\n")
   	writeFile(t, dir, "gone/gone.go", "package gone\n")
   	out := filepath.Join(t.TempDir(), "out.html")
   	if code, _, errOut := run("scan", dir, "-html", out); code != ExitOK {
   		t.Fatalf("exit %d: %s", code, errOut)
   	}
   	s := readFile(t, out)
   	for _, want := range []string{
   		`"policy":{"hash":"sha256:`,
   		`"id":"example.com/m/dom","kind":"package","module":"example.com/m"`,
   		`"rank":0`,
   		`"violation":"levels"`,
   	} {
   		if !strings.Contains(s, want) {
   			t.Errorf("html lacks %s", want)
   		}
   	}
   	if strings.Contains(s, "example.com/m/gone") {
   		t.Error("an omitted package is drawn")
   	}
   }

   func TestDiffHTMLDrawsTheLensAndTheViolations(t *testing.T) {
   	withUI(t)
   	needGit(t)
   	dir := repo(t, map[string]string{
   		"go.mod":        "module example.com/m\n",
   		"a/a.go":        "package a\n",
   		"gone/gone.go":  "package gone\n",
   		policy.FileName: "levels: [example.com/m/b, example.com/m/a]\nomit: [example.com/m/gone]\n",
   	})
   	git(t, dir, "init", "-q", "-b", "main")
   	git(t, dir, "add", "-A")
   	git(t, dir, "commit", "-q", "-m", "base")
   	git(t, dir, "checkout", "-q", "-b", "feat")
   	writeFile(t, dir, "b/b.go", "package b\n\nimport _ \"example.com/m/a\"\n")
   	writeFile(t, dir, "gone/gone.go", "package gone\n\nfunc G() {}\n")
   	git(t, dir, "add", "-A")
   	git(t, dir, "commit", "-q", "-m", "add b")
   	t.Chdir(dir)
   	out := filepath.Join(t.TempDir(), "change.html")
   	code, _, errOut := run("diff", "main", "-html", out)
   	if code != ExitViolation {
   		t.Fatalf("exit %d: %s", code, errOut)
   	}
   	s := readFile(t, out)
   	if !strings.Contains(s, `"violation":"levels"`) || strings.Contains(s, "example.com/m/gone") {
   		t.Errorf("Change View: violation drawn %v, omitted package absent %v",
   			strings.Contains(s, `"violation":"levels"`), !strings.Contains(s, "example.com/m/gone"))
   	}
   }
   ```

- [ ] **Run them:** `go test ./internal/export ./internal/cli -run 'Mark|DrawsThe'`. Expected: FAIL (`undefined: Mark`).

- [ ] **Implement**

   <!-- file: internal/export/policy.go -->
   ```go
   package export

   import (
   	"zu/internal/ir"
   	"zu/internal/policy"
   )

   // PolicyInfo is what the UI needs of the Policy: its hash and its Levels,
   // inner first.
   type PolicyInfo struct {
   	Hash   string     `json:"hash"`
   	Levels [][]string `json:"levels"`
   }

   // Mark adds the Policy's rules to a View built from pol.Apply(doc): the
   // rank of every ranked package and the rule each violating import breaks.
   // A Policy without rules adds nothing, so a View without rules is 04's.
   func Mark(v *View, pol *policy.Policy, doc *ir.IR) {
   	if !pol.Rules() {
   		return
   	}
   	v.Policy = &PolicyInfo{Hash: pol.Hash(), Levels: [][]string{}}
   	for _, l := range pol.Normalize().Levels {
   		v.Policy.Levels = append(v.Policy.Levels, l)
   	}
   	for i := range v.Nodes {
   		n := &v.Nodes[i]
   		if n.Kind != string(ir.KindPackage) {
   			continue
   		}
   		if r, ok := pol.RankOf(n.ID); ok {
   			n.Rank = &r
   		}
   	}
   	rules := pol.EdgeRules(doc)
   	for i := range v.Edges {
   		e := &v.Edges[i]
   		if e.Kind == string(ir.EdgeImports) {
   			e.Violation = rules[policy.Pair{From: e.From, To: e.To}]
   		}
   	}
   }
   ```

   ```diff
   --- a/internal/export/view.go
   +++ b/internal/export/view.go
   @@ -26,6 +26,7 @@
    	Honesty Honesty           `json:"honesty"`
    	Changed []string          `json:"changed,omitempty"` // Change View: changed packages, bottom-up
    	Hunks   map[string][]Hunk `json:"hunks,omitempty"`   // Change View: line diffs of changed files
   +	Policy  *PolicyInfo       `json:"policy,omitempty"`  // only when the Policy has rules
    }
    
    // Node is an IR node reduced to what a view draws.
   @@ -44,6 +45,7 @@
    	Status     string      `json:"status,omitempty"`     // Change View only
    	MovedFrom  string      `json:"movedFrom,omitempty"`  // Change View: the Move's base id
    	Hop        *int        `json:"hop,omitempty"`        // Change View: distance in the Affected Set
   +	Rank       *int        `json:"rank,omitempty"`       // packages: the Policy Level, 0 = innermost
    }
    
    // Edge is an IR edge with its location count instead of every location.
   @@ -54,6 +56,8 @@
    	Count  int         `json:"count"`
    	Loc    ir.Location `json:"loc"`
    	Status string      `json:"status,omitempty"`
   +	// Violation is the rule this import breaks ("levels" or "cycle").
   +	Violation string `json:"violation,omitempty"`
    }
    
    // Honesty is what the view is not showing, always displayed in the header.
   ```

   ```diff
   --- a/internal/cli/html.go
   +++ b/internal/cli/html.go
   @@ -13,6 +13,7 @@
    	"zu/internal/export"
    	"zu/internal/gitref"
    	"zu/internal/ir"
   +	"zu/internal/policy"
    	"zu/internal/scan"
    	"zu/internal/version"
    	"zu/web"
   @@ -79,8 +80,9 @@
    }
    
    // writeHTML writes the Project View export of doc (already sorted by
   -// ir.Encode), reading source through the tree the scan read.
   -func writeHTML(ctx context.Context, src *source, doc *ir.IR, o *htmlOptions, stderr io.Writer) error {
   +// ir.Encode) as the Policy draws it, reading source through the tree the
   +// scan read.
   +func writeHTML(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy, o *htmlOptions, stderr io.Writer) error {
    	root := export.RootModule(doc)
    	pats := make([]export.Pattern, 0, len(o.include))
    	for _, s := range o.include {
   @@ -90,10 +92,11 @@
    		}
    		pats = append(pats, p)
    	}
   -	v, err := export.Project(doc, pats, src.tree.ReadFile)
   +	v, err := export.Project(pol.Apply(doc), pats, src.tree.ReadFile)
    	if err != nil {
    		return err
    	}
   +	export.Mark(v, pol, doc)
    	v.Tool = version.Version
    	prefix := "" // a -ref scan runs at the repository top
    	if src.ref == nil {
   @@ -110,15 +113,24 @@
    	top                string
    	base, head         *ir.IR
    	baseTree, headTree scan.Tree
   +	pol                *policy.Policy // head's, which the hash check proved is base's
    }
    
    // writeChangeHTML writes the Change View export of base → head. Links point at
    // head, and at the host's compare page when both sides are clean commits.
    func writeChangeHTML(ctx context.Context, c changeSides, sum *diff.Summary, o *htmlOptions, stderr io.Writer) error {
   -	v, err := export.Change(c.base, c.head, diff.Compare(c.base, c.head), sum, c.baseTree, c.headTree)
   +	base, head := c.base, c.head
   +	if c.pol.Lens() {
   +		// The View draws both sides as the Policy does, so its changed list
   +		// must come from the same IRs; the printed Summary stays whole.
   +		base, head = c.pol.Apply(base), c.pol.Apply(head)
   +		sum = diff.Summarize(base, head)
   +	}
   +	v, err := export.Change(base, head, diff.Compare(base, head), sum, c.baseTree, c.headTree)
    	if err != nil {
    		return err
    	}
   +	export.Mark(v, c.pol, c.head)
    	for _, t := range []scan.Tree{c.baseTree, c.headTree} {
    		if ct, ok := t.(*gitref.CommitTree); ok && ct.Err() != nil {
    			return ct.Err()
   ```

   ```diff
   --- a/internal/cli/scan.go
   +++ b/internal/cli/scan.go
   @@ -74,7 +74,7 @@
    		return ExitBadInvocation
    	}
    	defer src.close()
   -	doc, _, stats, err := scanSource(ctx, src)
   +	doc, pol, stats, err := scanSource(ctx, src)
    	if err != nil {
    		fmt.Fprintf(stderr, "zu scan: %v\n", err)
    		return ExitBadInvocation
   @@ -112,7 +112,7 @@
    		return ExitBadInvocation
    	}
    	if hopts.path != "" {
   -		if err := writeHTML(ctx, src, doc, &hopts, stderr); err != nil {
   +		if err := writeHTML(ctx, src, doc, pol, &hopts, stderr); err != nil {
    			fmt.Fprintf(stderr, "zu scan: html: %v\n", err)
    			return ExitBadInvocation
    		}
   ```

   ```diff
   --- a/internal/cli/diff.go
   +++ b/internal/cli/diff.go
   @@ -145,7 +145,7 @@
    	fmt.Fprintf(stderr, "zu diff: %d packages changed, %d affected, parse errors base=%d head=%d\n",
    		len(s.Packages), len(s.Affected), len(baseDoc.ParseErrors), len(headDoc.ParseErrors))
    	if hopts.path != "" {
   -		c := changeSides{top: top, base: baseDoc, head: headDoc, baseTree: baseTree, headTree: head.tree}
   +		c := changeSides{top: top, base: baseDoc, head: headDoc, baseTree: baseTree, headTree: head.tree, pol: pol}
    		if err := writeChangeHTML(ctx, c, s, &hopts, stderr); err != nil {
    			return bad("html: %v", err)
    		}
   ```

- [ ] **Run:** `go test ./internal/export ./internal/cli`. Expected: `ok`, with 04's goldens unchanged.

### Task 12: Violations drawn red through 05's `pin` hook

05 already draws a pinned bundle as a red line (`Canvas.tsx`, `.react-flow__edge.pinned`, `--pin`). With lines hidden, it draws red triangles (`declutter.ts` `Mark.inPinned` and `outPinned`). A pinned bundle is also kept below `minPairs` (`scene.ts`). 06 therefore adds the View fields, one pure `Pin`, the three `scene` calls in `App.tsx`, and a legend entry. It does not change 05's engine.

These diffs are against `main` at 8f43cb1. If 05's `App.tsx` changes before 06 starts, apply the same three `scene(…, { pin })` edits and the legend change to it.

**Files:**
- Create: `web/src/policy.ts`, `web/src/policy.test.ts`
- Modify: `web/src/data.ts`, `web/src/App.tsx`, `web/src/styles.css`

**Steps:**

- [ ] **Write the failing test**

   <!-- file: web/src/policy.test.ts -->
   ```ts
   import { describe, expect, it } from "vitest";
   import { pinFor, violating } from "./policy";
   import { scene } from "./scene";
   import { DEFAULT_STATE } from "./state";
   import { edge, pkgs, view } from "./testkit";

   // m/core is inner, m/api outer: core → api breaks Levels (06's View marks it).
   const v = {
     ...view(pkgs(["m/api/h", "m/api/r", "m/core/a", "m/core/b"], "m"), [
       edge("m/api/h", "m/core/a"),
       edge("m/api/r", "m/core/b"),
       { ...edge("m/core/b", "m/api/r"), violation: "levels" as const },
     ]),
     policy: { hash: "sha256:p", levels: [["m/core"], ["m/api"]] },
   };

   describe("violations through 05's pin hook", () => {
     it("pins a bundle when any edge inside it violates", () => {
       const [clean, red] = [edge("a", "b"), { ...edge("a", "b"), violation: "cycle" as const }];
       expect(violating({ from: "a", to: "b", pairs: 1, members: [clean] })).toBe(false);
       expect(violating({ from: "a", to: "b", pairs: 2, members: [clean, red] })).toBe(true);
     });

     it("draws the violating bundle red at every depth, and nothing else", () => {
       for (const depth of [2, 3]) {
         const sc = scene(v, { ...DEFAULT_STATE, depth }, { pin: pinFor(v) });
         const red = sc.edges.filter((e) => e.pinned).map((e) => e.id);
         expect(red).toEqual([depth === 2 ? "m/core→m/api" : "m/core/b→m/api/r"]);
       }
     });

     it("keeps a violation drawn below minPairs and as red triangles without lines", () => {
       const sc = scene(v, { ...DEFAULT_STATE, depth: 3, minPairs: 5 }, { pin: pinFor(v) });
       expect(sc.edges.map((e) => e.id)).toEqual(["m/core/b→m/api/r"]);
       const marks = scene(v, { ...DEFAULT_STATE, depth: 3, lines: false }, { pin: pinFor(v) });
       expect(marks.nodes.find((n) => n.id === "m/api/r")?.mark?.inPinned).toBe(true);
     });

     it("pins nothing without a Policy", () => {
       const { policy: _, ...plain } = v;
       const sc = scene(plain, { ...DEFAULT_STATE, depth: 3 }, { pin: pinFor(plain) });
       expect(sc.edges.some((e) => e.pinned)).toBe(false);
     });
   });
   ```

- [ ] **Run it:** `cd web && npx vitest run src/policy.test.ts`. Expected: FAIL (cannot resolve `./policy`).

- [ ] **Implement**

   ```diff
   --- a/web/src/data.ts
   +++ b/web/src/data.ts
   @@ -5,9 +5,11 @@
      id: string; kind: NodeKind; parent?: string; module?: string; exported?: boolean;
      typeKind?: string; generated?: boolean; loc: Loc; decls?: number; unresolved?: number;
      detail?: boolean; status?: string; movedFrom?: string; hop?: number;
   +  rank?: number; // 06: the package's Policy Level, 0 = innermost
    };
    export type ViewEdge = {
      from: string; to: string; kind: "imports" | "calls" | "embeds"; count: number; loc: Loc; status?: string;
   +  violation?: "levels" | "cycle"; // 06: the Policy rule this import breaks
    };
    export type Ref = { commit: string; dirty: boolean };
    export type Hunk = { baseStart: number; baseLines: number; headStart: number; headLines: number; lines: string[] };
   @@ -16,6 +18,7 @@
      modules: string[]; nodes: ViewNode[]; edges: ViewEdge[]; sources: Record<string, string>;
      links?: { blob: string; compare?: string };
      hunks?: Record<string, Hunk[]>;
   +  policy?: { hash: string; levels: string[][] }; // 06: only when the Policy has rules
      honesty: {
        parseErrors: { path: string; message: string }[]; unresolvedCalls: number;
        unresolvedImports: number; unsupported: Record<string, number>;
   ```

   <!-- file: web/src/policy.ts -->
   ```ts
   // 06: the Policy's violations, drawn red through 05's pin hook. A bundle is
   // red when any edge inside it breaks a rule (decisions.md, Levels rule: "a
   // bundled edge is red if any pair inside it is"); internal/export marks the
   // edges, so the UI evaluates no rule itself.
   import type { View } from "./data";
   import { NO_PINS, type Pin } from "./declutter";

   export const violating: Pin = (b) => b.members.some((e) => e.violation !== undefined);

   // pinFor is the pin a page passes to scene: none without a Policy.
   export const pinFor = (view: View): Pin => (view.policy ? violating : NO_PINS);
   ```

   ```diff
   --- a/web/src/App.tsx
   +++ b/web/src/App.tsx
   @@ -9,6 +9,7 @@
    import { keyAction } from "./keys";
    import { elkGraph, positions, Superseded, type Placed } from "./layout";
    import { Panel } from "./Panel";
   +import { pinFor } from "./policy";
    import { reveal } from "./search";
    import { SearchBox } from "./SearchBox";
    import { DRAW_LIMIT, fitDepth, openFull, scene, type SceneNode } from "./scene";
   @@ -18,15 +19,20 @@
    
    const PKG = "#pkg";
    
   -function Legend() {
   +function Legend({ change, policy }: { change: boolean; policy: boolean }) {
      return (
        <div className="legend" aria-label="Legend">
   -      <span className="swatch st-added">added</span>
   -      <span className="swatch st-removed">removed</span>
   -      <span className="swatch st-modified">modified</span>
   -      <span className="swatch st-moved">moved</span>
   -      <span className="swatch affected">affected</span>
   -      <span>edges: + added · − removed · ⇄ reversed · ± mixed</span>
   +      {change && (
   +        <>
   +          <span className="swatch st-added">added</span>
   +          <span className="swatch st-removed">removed</span>
   +          <span className="swatch st-modified">modified</span>
   +          <span className="swatch st-moved">moved</span>
   +          <span className="swatch affected">affected</span>
   +          <span>edges: + added · − removed · ⇄ reversed · ± mixed</span>
   +        </>
   +      )}
   +      {policy && <span className="swatch violation">violates zu.policy.yaml (levels or cycle)</span>}
        </div>
      );
    }
   @@ -71,7 +77,8 @@
      const searchBox = useRef<HTMLInputElement>(null);
      const [searchOpen, setSearchOpen] = useState(false);
      const [fit, setFit] = useState(0);
   -  const requested = useMemo(() => scene(view, state), [view, state]);
   +  const pin = useMemo(() => pinFor(whole), [whole]); // 06: violations stay red
   +  const requested = useMemo(() => scene(view, state, { pin }), [view, state, pin]);
      // A view over DRAW_LIMIT draws the deepest depth that fits and says so; only
      // when even depth 1 is too big does the reader choose (Deviation 8).
      // "Draw depth M anyway" holds for this graph only.
   @@ -79,9 +86,9 @@
      const [confirmed, setConfirmed] = useState<string | null>(null);
      const fitted = useMemo(() => {
        if (confirmed === wanted) return requested;
   -    const d = fitDepth(requested, (depth) => scene(view, { ...state, depth }));
   -    return d === null ? null : d === requested.depth ? requested : scene(view, { ...state, depth: d });
   -  }, [confirmed, wanted, requested, view, state]);
   +    const d = fitDepth(requested, (depth) => scene(view, { ...state, depth }, { pin }));
   +    return d === null ? null : d === requested.depth ? requested : scene(view, { ...state, depth: d }, { pin });
   +  }, [confirmed, wanted, requested, view, state, pin]);
      const sc = fitted ?? requested;
      const ask = fitted === null;
      // A selected bundle edge lives here, not in the hash: its id changes with depth.
   @@ -184,7 +191,7 @@
          </div>
          {change && <ChangedList view={whole} onPick={pick} />}
          <main className="canvas">
   -        {change && <Legend />}
   +        {(change || whole.policy) && <Legend change={change} policy={whole.policy !== undefined} />}
            {sc !== requested && (
              <div className="notice" id="zu-notice" role="status">
                Collapsed to depth {sc.depth}: depth {requested.depth} has{" "}
   ```

   ```diff
   --- a/web/src/styles.css
   +++ b/web/src/styles.css
   @@ -358,6 +358,10 @@
    .legend .swatch.affected {
      border-style: dashed;
      border-color: var(--accent);
   +}
   +.legend .swatch.violation {
   +  border-color: var(--pin);
   +  color: var(--pin);
    }
    
    .changed {
   ```

- [ ] **Run:** `cd web && npx tsc --noEmit && npx vitest run && npx vite build`, then `go test ./web`. Expected: tsc clean; every vitest file passes (18 files, 96 tests at 8f43cb1 with this task); the build writes `dist/index.html`; `web/embed_test.go` passes.

- [ ] **Browser check** (the UI's components are verified in the browser, as in 04 and 05). Open the `zu scan -html` file from Task 13, step 2. Check that:
  - the `ir/bad → cli` edge is red at every depth and in every declutter stage;
  - with "hide edges" on, it shows as red triangles;
  - the legend shows "violates zu.policy.yaml";
  - a View without a Policy shows no legend in the Project View.

### Task 13: Acceptance

- [ ] **1. Gates:** `make check` (or `gofmt -l .`, `go vet ./...`, `go test ./...`, `golangci-lint run ./...` and `cd web && npx tsc --noEmit && npx vitest run`). Expected: all clean.
- [ ] **2. zu on itself**, in a scratch copy of the repository after Task 12, 06's code included (copy the working tree; `git archive HEAD` only if Tasks 1–12 are committed). The counts below depend on that: without 06's `internal/policy` the cycle has fewer arcs.
  - `zu policy init .` writes `levels: [["zu/web"], ["zu/internal"], ["zu/cmd"]]`, and `zu check .` exits 0 with `0 new, 0 known, 0 fixed`. A second `zu policy init .` exits 3 and leaves the file alone.
  - Replace the file with the intended layering. `zu check .` exits 0 with `0 new, 0 known, 0 fixed`:

    ```yaml
    levels:
      - [zu/internal/ir, zu/internal/version, zu/web]
      - zu/internal/scan
      - [zu/internal/policy, zu/internal/gitref]
      - zu/internal/diff
      - zu/internal/export
      - zu/internal/cli
      - zu/cmd
    cycles: true
    ```
  - Add `internal/ir/bad/bad.go` importing `zu/internal/cli`. `zu check .` exits 1 with 18 new violations: 1 `levels` (`zu/internal/ir/bad → zu/internal/cli`) and 17 `cycle`.
  - `zu check -update-baseline .` exits 0, creates the Baseline with 18 sorted entries and lists all 18 on stderr. `zu check .` then exits 0 with `0 new, 18 known`.
  - Append `order: [zu/cmd]` to the Policy (a hash change with no rule change). `zu check .` and `zu check -update-baseline .` both exit 3 with "Baseline was written under Policy …", and the Baseline is unchanged.
  - Remove the `order` line again. `zu scan . -html self.html` marks 16 `"violation":"cycle"` edges and 1 `"violation":"levels"` edge: the import behind the `zu/internal/ir → zu/internal/cli` arc is the Levels edge, and Levels wins, so 18 violations mark 17 edges.
- [ ] **3. hugo v0.166.0** (`git -C .zu/corpus/hugo@v0.166.0 archive HEAD` into scratch):
  - `zu policy init .` writes 4 levels over 36 boxes, and `zu check .` exits 0.
  - With `cycles: true`, `zu check .` exits 1 with 189 new violations in about 0.2 s. `zu check -update-baseline .` creates the Baseline and lists all 189; `zu check .` then exits 0 with 189 known.
  - `zu scan . -html` writes 2.2 MB.
- [ ] **4. kubernetes v1.37.0** (the IR in `.zu/corpus/kubernetes.json`: 110,270 nodes and 118,110 edges): with the suggested Levels, `cycles: true` and `foreign: [github.com, golang.org/x]`, `Suggest` takes 39 ms, `Check` 171 ms (438 violations) and `EdgeRules` 178 ms.
- [ ] **5. `zu diff`:** covered end to end by `TestDiffScansBothSidesUnderHeadsPolicy`, `TestDiffNewViolationExitsOne`, `TestDiffWarnsWhenALevelNamesNoPackage` and `TestDiffHTMLDrawsTheLensAndTheViolations` (real git repos).

## Notes

- **Task count: 13**, within Quick mode's 15.
- **Verification of this plan** (2026-09-24): `replay.py` (see the top of this file) applied every code block in task order to a fresh `git archive` of `main` at 8f43cb1, after `npm ci`, and ran each task's red and green steps. After that, `gofmt -l`, `go vet ./...`, `go test ./...` and `golangci-lint run ./...` were clean, and `tsc`, `vitest` and `vite build` passed.
- **TDD:** every task writes its failing test first (CLAUDE.md). The UI's only new logic is `pinFor`, which is tested through 05's real `scene`.
- **Determinism:** every list the Policy writes is sorted: violations, the Baseline, `EdgeRules` through the sorted View, and `Suggest`. `Apply` ends in `ir.Sort`. The empty Policy hashes to `scan.DefaultPolicyHash`, so IRs written before 06 stay valid.
- **The IR stays the parser's:** only `exclude` and `policyHash` reach the IR. Everything else is a lens evaluated by `check`, `diff` and `export`.
- **Security:** YAML is decoded into typed structs with `KnownFields(true)`, and the Baseline with `DisallowUnknownFields`; the YAML library limits depth and alias expansion. The Policy and the Baseline are read only through in-tree links and capped at 1 MiB (Task 2). Globs are validated before use and matched in polynomial time. `policy init` creates the file with `O_EXCL`, and `-update-baseline` writes through a rename. No network, and no new process.
- **Stuck?** Stop and ask. Don't force through blockers.

## Progress

- [x] Task 1 · Parse, normalise and hash
- [ ] Task 2 · Exclude globs and safe by-name reads
- [ ] Task 3 · The scan skips excluded files
- [ ] Task 4 · `zu scan` and `zu diff` read the Policy
- [ ] Task 5 · `Apply`
- [ ] Task 6 · Levels and cycles
- [ ] Task 7 · Baseline
- [ ] Task 8 · `zu check`
- [ ] Task 9 · `zu policy init`
- [ ] Task 10 · `zu diff` B7/B9
- [ ] Task 11 · View fields and the lensed export
- [ ] Task 12 · UI: red violations via `pin`
- [ ] Task 13 · Acceptance

**Status:** Not Started
