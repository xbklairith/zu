# 12 · Grouping — Plan

**Status:** APPROVED 2026-09-25 (scrutiny-12 rulings applied, replay green on 145322e, advisor sign-off), with amendments A1–A2 below. History: Drafted 2026-09-25 for the lead's review; not approved. Revised 2026-09-25 for the lead's screenshot rulings L1–L6 (**Rulings on the screenshots**, below). Then built the lead's ruling (a) on the `plugin` conflict: the open root module's children are kept first (Task 7). Revised again 2026-09-25 for the lead's rulings on scrutiny-12 (B1, M1–M4, N1–N10; **Rulings on the scrutiny**, below). Two parts, 12a (Go: Tasks 1–3) and 12b (the page: Tasks 4–10), because the work has more than 8 tasks. 12a can ship alone: it adds package facts and Policy keys the page ignores until 12b. Drafted in a scratch copy and replayed green on a fresh `git archive` of `main` at 145322e (Replay record). The brief said to replay on an archive of a8cbbbb followed by 11's `replay.py`. 11 has since been committed to `main` (5a23176…145322e, with its amendments A1–A3), so an archive of 145322e is that same state. 12's diffs were rebased onto it; one hunk in `scene.ts` `connect` needed merging with 11's A2. Proposed doc amendments are under **Doc amendments**, as exact text; they are not task steps.

**Amendments at approval (apply during the named task; they win over the text below):**
- **A1 (Task 8, badges): `gen N%` shows from 50 %, not 20 %.** With M1 the 20 % bar badged 8 of kubernetes's 15 boxes; a badge on half the boxes is noise, not a signal. `GEN_MIN = 0.5`. On kubernetes only api, client-go (83 %) and apiextensions-apiserver (61 %) keep it. Change the test to "says cmd only of a command's directory or a box half commands, and gen from 50 %" and add a box at 30 % that has no badge. Wherever the text says "from 20 %" (the mapping table, L3, the requirements amendment, the contract's Badges line, Task 8's intro and the Prototype evidence row), zu writes "from 50 %".
- **A2 (Task 7 or 10, e2e): the `#closed` token needs a round trip in the browser.** The N10 test is unit-only, and the token puts a literal `#` inside the hash value that `history.replaceState` writes back. Add a `web/e2e/accept.mjs` check in all 3 engines: on a fixture with 2+ modules, close the open root module, read `location.hash`, reload, and assert the module is still closed. Also assert that an old link's `#t=<root module>` still opens it in place.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is 11's script unchanged. It applies every code block to a fresh copy of `main`, task by task:

- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. Run it from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 docx/features/12-grouping/replay.py docx/features/12-grouping/plan.md "$S"; rm -rf "$S"
```

It needs Go, git, `patch`, Python 3, npm and Node, `golangci-lint` (Task 10) and Playwright's three browsers (Task 9). Type-check with `npm run typecheck` (`tsc --noEmit`), never `tsc -b` (11's note: `-b` writes stale `.js` beside the sources).

**Goal:** make the first view of a large repository show its architecture and nothing else. After 11, hugo opens with 38 boxes in 17 rows and kubernetes with 39 boxes in 13 rows. Test, tool and generated packages stand beside the code at the same weight. kubernetes' own module (`cmd`, `pkg`, `plugin`) is one box among 38 staging modules. After this plan, measured at 1600 × 1000 in three engines (Prototype evidence):

- hugo opens with 15 boxes in 7 rows, plus "3 tests & tools · used by 5" and "+20 more";
- kubernetes opens with 15 boxes in 7 rows. The `kubernetes` module is opened in place at the top, holding `plugin` and `cmd` above `pkg`, with "258 tests & tools · used by 3" and "+2 more" (`build`, `cluster`). The staging modules are below it, with "183 tests & tools · used by 1" and "+18 more";
- the smallest text is 13.2 px on hugo and 12.6 px on kubernetes (12.5 px in firefox), both headers say "20 boxes folded", and both top rows read "entry points".

**Architecture:**
- **IR (Task 1).** A package node gets `main` (package main). The field is additive and optional, so `ir.SchemaVersion` stays "1", as 02 kept it. Nothing else is new in the IR: whether code is generated is already a per-declaration fact.
- **Policy (Task 2).** Two keys: `demote:` (id globs, and `!glob` for exceptions) and `budget:` (1–999). `Format` stays "1", as it did for 07's `proposals` and `edge-kinds`: a reader of an older build rejects an unknown key anyway. `Hash` leaves both keys out (Deviation 16). `Policy.Demoted(id, dir, generated)` returns "name", "generated" or "". The built-in list `Conventional` matches whole directory segments: `testdata`, `test`, `tests`, `*testing`, `e2e`, `example`, `examples`, `sample-*`, `hack`, `tools`, `scripts`, `third_party`. `zu policy init` documents both keys.
- **View (Task 3).** `export.Mark` sets `demoted` on every package, with or without a Policy file. It also copies `main` and the Policy's `budget`, and counts each package's `genDecls`, its declarations in generated files, from the IR's per-declaration `generated` flag. A package is generated, for `demoted`, when every declaration is. The View schema stays "1", because each field is optional.
- **`group.ts` (new, pure, Tasks 4–8).**
  - `strip`: in each sibling set, the boxes whose packages are all demoted (a changed package never is) become one Strip, `<parent>#demoted`.
  - `fold`: the Budget counts every box drawn in the view. The boxes past it fold into one Fold chip per sibling set, `<parent>#more`.
  - `capRows`: the row cap.
  - `badgesOf` and `holdsProgram`; `rankNote`, the Panel's line for a box whose row was merged.
  - `rollup` (with `factsOf`): one pass up the box tree per View (a `WeakMap`, like 11's `boxStats`), holding each box's packages, declarations, generated declarations, mains, whether any package changed, and its module. The fold's keys, `badgesOf`, `roleOf` and `holdsProgram` read it in O(1) (B1).
  - A group is one more leaf of the cut. `Cut.alias` maps each box it replaced to it, and `leafOf` honours the alias. Bundles, stats, tiers and the against count then follow unchanged: this is 11's fold seam.
- **`scene.ts`.** The order is:
  1. cut, with the root module opened in place;
  2. strip;
  3. at auto depth only, rank the sets (`siblingRanks`), then fold;
  4. 11's bundles, declutter and ranks, with groups at tier −1 (the bottom row);
  5. per sibling set not ranked by the Policy, `capRows` renumbers tiers into at most 7 rows, and each node keeps its own tier as `ownTier`;
  6. badges and `entry`.
- **`layout.ts`.** `levelIn` puts tier < 0 below every row, Policy sets included. `elkGraph` sorts a row by own tier, and `byOwnTier` re-places a merged row by own tier, higher first. A merged row is drawn as any row, with no rule between its ranks (L4); the Panel names a selected box's own rank.
- **`cut.ts`: `rootModule(view)`.** It is the module whose directory is the repository root, when there are two or more modules. At the page root (no focus, `home` passed, not a Change View, depth ≤ 1) it opens in place. `upTo` from inside it returns the page root.
- **UI.**
  - `ChipNode` draws both group kinds on one line with their toggle and a tooltip (`hint`); a click or the toggle opens one in place (N4).
  - An open Fold chip stays drawn as "fold N", with collapse.
  - The header adds ", N boxes folded" to its depth line (N9).
  - The Panel lists a group's members.
  - Search reveals a demoted package by opening its Strip.
  - Badges sit under the stats line.
  - The axis's top label reads "entry points" when every box in the top row holds a program.

**Tech Stack:** as 11. No new dependency.

**Source decisions:** the lead's rulings R1–R8 (from `docx/research/architecture-diagrams.md` §5); 11's Seams for 12; ADR 0008 (the Policy ranks, never invents boxes); decisions.md "violations stay red"; CLAUDE.md: "The model never authors the graph". Every group is computed from the parser's nodes and paths. A Strip or a Fold chip is a counted stand-in, like 04's "+N unchanged" and 11's outside box. It is not a box of the Package Tree and it names no architecture.

**Out of scope:** R7 (nothing, per the ruling). Named bands from groups on the axis (11's axis seam) beyond "entry points". A Change View home (unchanged since 11). Watch (13).

---

## Rulings as built

| Ruling | Built | Where |
|---|---|---|
| R1 level 1: modules or 11's home | 11's `home` unchanged; with ≥ 2 modules the page root draws them, the root module opened (R5) | `cut.ts` |
| R2 demote noise to a counted, expandable strip | built-in list + `demote:` + fully generated (every declaration in a generated file; View `genDecls`); one Strip per sibling set in its bottom row | Tasks 1–4 |
| R3 ≤ 7 rows, merged bottom-up (L4: no rule at the joins) | `capRows` + `byOwnTier`; the Panel's `rankNote` | Task 6 |
| R4 ~15 boxes, "+N" chip in its own row; order Policy-named, no-sibling-imports, decls, id; click expands (N4); changed always shows; Change View folds on head. L1, L2: entry points (no sibling imports it, holds a package main, uses a sibling), then hand-written decls, islands last; L5, N1: "+N more" | `fold`, Budget 15 per view; one chip per sibling set, in its bottom row, its names in the tooltip; `open()` toggles it; a selection inside it opens it (N3); changed boxes rank first; a Change View folds its head-side scene | Task 5 |
| R5 open the repo-root module in place; Esc/up; its children kept first (ruling (a)) | `rootModule`, `upTo`, `Keep.root` | Task 7 |
| R6 "entry points" top row; path-role badges (L3: `cmd` only on a command's directory or a box half commands; `gen N%` from 20 %) | `holdsProgram`, `badgesOf` (`cmd`, `internal`, `gen N%`), `GEN_MIN` | Task 8 |
| R7 nothing | — | — |
| R8 `demote:` (with `!`), `budget:`, validation, `policy init`; pinned boxes never fold | Tasks 2–3; Policy-ordered boxes rank first and are never folded | Tasks 2, 5 |
| G4: what the strip shows for imported demoted boxes (L5: one line) | "N tests & tools · used by K" (or "N generated", or "N tests, tools & generated" with the two counts in the tooltip), K = boxes that import into it, drawn or inside a closed Fold chip (M4); its lines draw on hover like any box's | Task 4 |

## Rulings on the screenshots (L1–L6), as built

1. **L1, hand-written decls.** The last keep key is the box's declarations that are not in generated files, `decls − genDecls` from the rollup (`scene.ts` `size`; M1), ties by id. Test: "weighs declarations by the hand-written share".
2. **L2, entry points and islands.** A box is kept before the rest only when no sibling imports it, it holds a package main and it uses at least one sibling (`fold`'s `entry`). An island, which no sibling uses and which uses none, folds before every other box. Both count only project sibling boxes: an import of an external or of a box in another set is not a sibling's (M2). Test: "keeps an entry point before bigger boxes, and folds islands first". On kubernetes this folds `cluster` and `build` as islands. `cluster` imports no drawn box at all. `build`'s two imports go to staging modules, which are the siblings of `kubernetes`, not of `build`, so among its own siblings (`cmd`, `pkg`, `plugin`, `cluster`) it uses none. No box qualifies as an entry point: every other box is imported by a sibling.
3. **L3, badges.** `cmd` shows when the box's path below its module ends in `cmd` or its parent segment is `cmd` (a command's own directory), or at least half its packages are `main`; a box named `cmd` still drops it as its name says it. `internal` is unchanged. `gen N%` shows from 20 % (`GEN_MIN`). "entry points" still asks whether the top row *holds* a program (`holdsProgram`, unchanged). Since M1, `gen N%` is the share of the box's declarations in generated files, so it now shows on more boxes: on kubernetes `gen 83%` (api, client-go), `gen 61%` (apiextensions-apiserver), `gen 35%` (dynamic-resource-allocation, `kubernetes/pkg`), `gen 30%` (code-generator), `gen 26%` (component-helpers) and `gen 20%` (`kubernetes/cmd`); on hugo, `cmd` on `hugo (package)` only.
4. **L4, no join rule.** `joins`, its class and its CSS are gone; a merged row is a row. The true order stays in the header's against-order count and, new, in the Panel: a selected box whose set was capped says "rank N in its set before rows merged (0 = depends on nothing here)" (`rankNote`). The lead's note assumed the Panel already named it; it did not, so Task 6 adds that line.
5. **L5, chip text.** A Strip is one line, "258 tests & tools · used by 3". With both kinds it reads "N tests, tools & generated · used by K", and its tooltip gives "X tests & tools · Y generated"; the Panel's text is unchanged. A closed Fold chip reads "+18 more" (N1; it read "+N smaller" before), and its tooltip names what it holds, with the prefix they share dropped as labels do ("cli-runtime, cloud-provider, …").
6. **L6, layout of the plan.** One plan.md with 12a and 12b, as before.

**The `plugin` conflict, ruled (a).** Under L1 and L2 alone, `plugin` (546 hand-written decls) ranked 16th and folded. The lead ruled (a): at the page root, the children of the root module drawn open (`rootModule`) are kept first, like changed and Policy-ordered boxes. They count against the Budget and never fold, except islands among them, which still fold. Built in Task 7: `Keep.root`, `fold`'s `held`; test "keeps its children, however small, and folds the islands among them". It applies whenever that module is open at the page root, whether R5 opened it or the depth did. On kubernetes, `plugin` is drawn beside `cmd` above `pkg`, and `build` and `cluster` fold as islands into "+2 more".

## Rulings on the scrutiny (scrutiny-12), as built

- **B1, speed.** `packagesIn` was called per box, in the fold's sort comparator and in `badgesOf`. Now one rollup per View (`group.ts` `rollup`, a `WeakMap` filled in one pass up the box tree) holds every box's facts. `fold` computes each key once, into a `Map`, before sorting. `probe.mjs`, next to this file, times `scene` over an exported View: six runs, Node 24.17.0, each series on a freshly parsed View, so its first run builds the memos. The times, in ms, for `main` (145322e) and for this plan (the replayed tree):

  | view | main | 12 |
  |---|---|---|
  | kubernetes auto (page root; 39 → 21 nodes) | 24–54 | 43–81 |
  | kubernetes `d=2` (236 → 202 nodes) | 27–52 | 27–55 |
  | kubernetes `d=4`, 11's benchmark (1812 → 1238 nodes) | 61–82 | 53–76 |
  | hugo auto (38 → 18 nodes) | 2–5 | 4 |

  Everything is within 11's ~110 ms. The auto root costs about 20 ms more than `main`, for the rollup and the fold. At `d=4`, 12 is faster than `main`, because it draws fewer boxes. Task 10 reruns the probe.
- **M1, hand-written declarations.** They are counted from each declaration's `generated` flag, not from whole packages: the View's `genDecls` per package (Task 3). The rollup sums it, `size` is `decls − gen`, and `gen N%` is `gen / decls`. The package-level IR `generated` is gone, because it can be derived: a package is generated when `decls > 0` and `genDecls == decls`. Only `main` is new in the IR. The kubernetes keep list below is recomputed.
- **Schema (N5).** As 02's rule has it, `schemaVersion` stays "1", because `main` is additive and optional. The claim that old IRs are refused is gone.
- **M2, project siblings.** An island has no project sibling that uses it, and uses none. An entry point has no project sibling importing it, and uses at least one. An arc counts only when both of its ends are drawn project boxes of the set, so an external or a group does not count. The scrutiny's probes are now vitest cases, in the test "counts only project siblings for islands and entry points (M2)": P1 (an island plus one edge to an external still folds) and P2 (a `main` that imports only an external is not an entry point).
- **M3, the Policy hash.** `Hash` leaves out `demote` and `budget`, and `Normalize` keeps them for the View. Test `TestHashIgnoresDemoteAndBudget`; `zu check` test `TestCheckKeepsBaselineWhenBudgetUncommented` uncomments `policy init`'s `# budget: 15` and adds a `demote:` line, and still gets exit 0 against the old Baseline ("0 new, 1 known"). There is no Format bump. 07 added `proposals` and `edge-kinds` without one; only the first commit, 8e52883, ever set it. And an older build's reader rejects an unknown key by name, so a bump would tell it nothing more.
- **M4, "used by K".** K counts distinct boxes, with closed Fold chips expanded: a box inside "+N more" that imports into the Strip counts once, as itself, not as the chip. Test: "counts every box that uses the strip, folded or not (M4)" (three users, two of them folded: "used by 3").
- **Nits.**
  - N1: "+N more".
  - N2: `capRows` counts only ranks that still hold a box after the fold. Test "counts only the ranks that still hold a box (N2)".
  - N3: an `s=` naming a box inside a closed chip opens the chip and keeps the selection. `Keep.holds` is XORed with the toggle; `anchor` walks the alias up the box tree. Test: "opens the chip that holds a selected box, and keeps the selection (N3)".
  - N4: a single click on a chip opens it. The Panel says "click to open".
  - N6: Task 4's toggle chain is fixed. Test: "keeps an opened demoted box's own toggle".
  - N7: one Budget name in the code, `BUDGET`. 11's depth-cut constant is renamed `DEPTH_LEAVES`.
  - N8: the Change View wording is fixed (The contract).
  - N9: the header says ", N boxes folded". Test: "says how many boxes folded (N9)". e2e `fold` and `changeRest` assert it.
  - N10: `#t=<root module>` keeps its old meaning, opening it in place. Closing the root module that R5 opened uses its own token, `t=<module>#closed`. Test: "keeps an old link's t=<root module> meaning: open in place (N10)".
- **Deferred to Risks:** at 1280 × 720 the bottom row is below the fold; the axis label is easy to miss. e2e `foldNarrow` checks that a chip still opens at 1280 × 720.

## Deviations and decisions for review

1. **Go decides whether a package is demoted, and the page rolls it up.** Go knows the directory and the Policy, so `Mark` sets each package's `demoted`. The page demotes a box when every package under it is demoted and none is changed. This way `zu scan -html` and `zu serve` agree, and the page needs no copy of the built-in list.
2. **The built-in list matches directory segments, not ids.** `k8s.io/kubernetes/test/e2e/...` and `hugo/testscripts` match by segment. Module paths never match: `example.com/…` is a domain, not a directory. `demote:` globs match an id or any box above it, like `exclude`. A `!glob` wins wherever it sits in the list.
3. **Strip wording (L5).** One line: "N tests & tools · used by K", "N generated · used by K", or, with both, "N tests, tools & generated · used by K" and the two counts in the tooltip. No stats line.
4. **G4 (the lead asked for a decision): an imported Strip says "used by K".** K counts the boxes that import any package in it, drawn or inside a closed Fold chip, each once (M4). Hover or select it and its own lines draw (11), so an import into test helpers is visible without opening it. A changed package is never demoted, so a Change View never hides a change inside a Strip.
5. **The first view folds only at auto depth.** An explicit depth (`#d=`) or a declarations view draws every box, as today. A focus below the page root folds too, at its auto depth. So only the first view, and the view after a double-click into a box, is budgeted. A deeper level is where you go to see everything.
6. **One Fold chip per sibling set, in its bottom row, per the lead's "in their own row".** The research had one chip per row. On 11's test scene, and on hugo, the ranks give nearly one box per row, so per-row chips each held one box and folded nothing (measured in the prototype).
7. **A lone leftover stays drawn.** A chip needs at least two boxes. When one box of a set is past the budget, it is drawn: "+1 more" hides as much as it shows. Before L2 this is what kept `plugin` on kubernetes; now the root-module rule keeps it, and two islands of that set fold.
8. **Sets placed by Policy Levels are not capped.** Levels are the reader's own rows, so capping them would contradict 06/07. They still fold.
9. **The cap counts the bottom row.** When a set has a Strip or a Fold chip, its boxes get at most 6 rows and the groups the 7th.
10. **Rows merge bottom-up.** `capRows` binary-searches the smallest per-row capacity. It packs tiers greedily from the bottom and closes a row early whenever the tiers left need every remaining row to themselves. Inside a merged row, boxes run from the higher own tier to the lower, left to right, with no mark between them (L4).
11. **R5 applies only on the page root, and only when `home` is passed.** The page passes it (11); 11's scene tests call `scene` without it, so their snapshots are unchanged. With `with.html` (shop, one module plus `tools`) the root module opens in place too.
12. **Up from inside the root module goes to the page root**, which draws it opened, so Esc never lands on a view that only redraws the same module.
13. **Group ids at the page root have no prefix** (`#demoted`, `#more`), because the page root's box is "". A hash `t=` or `s=` naming a group survives a reload (`knownIds`).
14. **The fold's "Policy-named" test is `policy.order`.** A box is first when its id, or a box containing it, is in `order`. Levels do not count: with Levels, every box is named, and nothing would fold. Changed boxes are also first.
15. **Schemas.** None change. IR `schemaVersion` stays "1", because `main` is additive and optional (02's rule). Policy `Format` stays "1", as it did for 07's additions. The View schema stays "1", because the new fields (`demoted`, `main`, `genDecls`, `budget`) are optional and an older page ignores them.
16. **`demote:` and `budget:` are not in the Policy hash** (M3; ADR 0004 amendment under Doc amendments). They change what the page draws, not the IR, a diff or a check. So adding either keeps a Baseline valid, and `zu check` still exits 0.
17. **Naming.** The code's name for a node's rank before the cap is `ownTier`, not "band", because the glossary's **Band** is CRAP's risk bucket.

**The kubernetes keep list** after L1, L2, ruling (a) and M1. Every box of the view, in both sets, is ranked together against the one Budget of 15. `hand` is the declarations not in generated files (M1). First come the root module's non-island children: `cmd`, `pkg` and `plugin`. No box is an entry point. Each column is sorted by `hand`, not by keep order. The `sample-*` modules are in the Strip.

| Kept (15) | hand | | Folded (20) | hand |
|---|---|---|---|---|
| kubernetes/pkg | 18846 | | kube-aggregator | 327 |
| apiserver | 6355 | | pod-security-admission | 285 |
| client-go | 3254 | | kube-scheduler | 203 |
| apimachinery | 3142 | | cri-client | 161 |
| api | 2829 | | endpointslice | 142 |
| kubectl | 2286 | | kubelet, metrics | 138 |
| kubernetes/cmd | 2284 | | csi-translation-lib, mount-utils | 115 |
| code-generator | 1911 | | streaming | 107 |
| apiextensions-apiserver | 1033 | | cri-streaming | 96 |
| component-base | 939 | | controller-manager | 90 |
| dynamic-resource-allocation | 909 | | cri-api | 83 |
| kubernetes/plugin | 510 | | kube-controller-manager … externaljwt | 35 … 0 |
| cli-runtime | 418 | | kubernetes/cluster (island) | 2 |
| component-helpers | 407 | | kubernetes/build (island) | 1 |
| cloud-provider | 378 | | | |

What changed with M1: `cri-api` (1852 → 83), `kubelet` (1060 → 138) and `metrics` (567 → 138) are mostly generated, so now they fold. `cli-runtime`, `component-helpers` and `cloud-provider` come in. `plugin` stays, by ruling (a).

## Doc amendments (exact text; not task steps)

**`docx/core/decisions.md`, Settled choices, "Policy file" bullet:** replace `(order, levels, foreign, edge-kind overrides, omit, omit-edges, proposals)` with `(order, levels, foreign, edge-kind overrides, omit, omit-edges, proposals; demote and budget from feature 12, which the Policy hash leaves out)`.

**`docx/decisions/0004-policy-hash-and-head-policy.md`:** append:

> **Amended 2026-09-25 (feature 12):** the hash leaves out `demote` and `budget`. They set what the page draws first, never the IR, a diff or a check, so adding or editing them keeps a Baseline valid.

**`docx/core/decisions.md`, Settled choices, "UI v1" bullet:** append:

> **Grouping (12):** with two or more modules the page root draws the modules, and the module at the repository root opens in place above the others; up from inside it is the page root. Demoted packages (a directory segment on the built-in list: testdata, test, tests, \*testing, e2e, example, examples, sample-\*, hack, tools, scripts, third_party; a Policy `demote:` glob; or every declaration in a generated file; `!glob` keeps one; a changed package never) are counted into one Strip per sibling set, drawn in its bottom row and opened in place. At auto depth a view that draws more boxes than the Budget (15; Policy `budget:`) keeps that many and folds the rest into one Fold chip, "+N more", per sibling set, in the set's bottom row. It keeps changed and Policy-ordered boxes first, and at the page root the open root module's children that are not islands (never folded, but counted), then entry points (no project sibling imports it, it holds a package main, it uses a project sibling), then the most hand-written declarations (those not in generated files), then id; islands (no project sibling uses it, it uses none) fold first. A lone leftover stays drawn. A Strip reads "N tests & tools · used by K" (K: the boxes that use it, those in closed Fold chips included), a Fold chip "+N more", each naming the rest in its tooltip; a click opens either, and the header says how many boxes folded. A sibling set not placed by Levels is drawn in at most 7 rows (its groups' row included), adjacent ranks merged bottom-up into plain rows; the Panel names a merged box's own rank. The top row's axis label reads "entry points" when every box in it holds a package main; boxes carry path-role badges: `cmd` (a command's directory, or at least half its packages main), `internal`, `gen N%` (the share of declarations in generated files, from 20 %). IR packages gain the optional `main` (schema still "1"); `demote` and `budget` are not in the Policy hash.

**`docx/glossary.md`, after "Architecture Rank":**

> ## Demoted
>
> A package the first view sets aside: a segment of its directory is on zu's built-in list (tests, test data, examples, tools), a Policy `demote:` glob names it, or every one of its declarations is in a generated file. A changed package is never demoted. Demoted packages are counted and can be opened; nothing is removed.
>
> ## Strip
>
> The one chip that holds a sibling set's Demoted boxes, drawn in its bottom row, on one line: how many, of which kind, and how many boxes use them, counting those in closed Fold chips ("258 tests & tools · used by 3"). A click opens it and draws its boxes in place.
>
> ## Budget
>
> How many boxes a view drawn at its automatic depth shows before the rest fold, across all its sibling sets: 15, or the Policy's `budget:`.
>
> ## Fold Chip
>
> The "+N more" chip that holds the boxes of one sibling set that fell past the view's Budget, drawn in the set's bottom row, their names in its tooltip. A click opens it and draws them in place; it stays drawn as "fold N" to close them again.

**`docx/core/requirements-draft.md`, A6:** replace `Collapse and expand levels; hide edges below a configurable weight to declutter dense graphs` with `Collapse and expand levels; hide edges below a configurable weight; set aside tests, tools and generated packages, and fold boxes past a budget, each counted and expandable, to declutter dense graphs`.

## The contract

**Hash:** `t=` may name `<box>#demoted` or `<box>#more` (`#demoted`, `#more` at the page root): the group is drawn open. `t=<root module>#closed` closes the root module that the page root opened (R5); `t=<root module>` keeps its old meaning, open in place (N10). `s=` may select a group; an `s=` naming a box inside a closed Fold chip opens the chip and keeps the selection (N3). Other keys are unchanged.

**First view** (auto depth, page root or a focus), in this order:
1. per sibling set, the Strip, if any box is demoted and not every box is;
2. over the whole view, the Budget: when more boxes are drawn than the Budget, the Budget's worth are kept (keep order above), and each sibling set's boxes past it fold into that set's Fold chip, when at least 2 fold;
3. per sibling set, the row cap (not for Levels sets): at most 7 rows, groups included.

A Change View folds its merged scene (head's boxes plus removed ones) by the same rules: a removed or changed package is never demoted, and a box holding one is always kept.

**Keep order:** changed or Policy-ordered, and at the page root the open root module's children that are not islands (these never fold, but count against the Budget); then entry points (no project sibling imports it, it holds a package main, it uses a project sibling); then the rest; islands (no project sibling uses it and it uses none) last; within each, hand-written declarations (not in generated files) descending, then id.
**Strip text:** one line (K: distinct boxes that import into it, those in closed Fold chips included), `N tests & tools · used by K`, `N generated · used by K`, or `N tests, tools & generated · used by K` with the tooltip `X tests & tools · Y generated`.
**Fold chip text:** `+N more` when closed, its tooltip the folded boxes' names less their shared prefix; `fold N` when open.
**Badges:** `cmd` (the box's path below its module ends in `cmd` or sits directly under `cmd`, or at least half its packages are main), `internal` (an `internal` segment in that path), `gen N%` (the share of the box's declarations in generated files, rounded, from 20 %). A badge the box's own name already says is left out.
**Merged rows:** no mark between ranks; the Panel says `rank N in its set before rows merged (0 = depends on nothing here)`.
**Entry points:** the axis's top label, when every box in the top row holds a package main.
**Header:** the depth line adds `, N boxes folded` when closed Fold chips hold N boxes.
**Opening a group:** a click, or its toggle.

---

# Tasks
## 12a: package facts and Policy keys (Go)

### Task 1: Package facts in the IR (`main`)

A package node says whether it is a command (`main`). The field is additive and optional, so `SchemaVersion` stays "1", as 02 kept it. Whether a package is generated is not a new fact: the page derives it from each declaration's `generated` flag (Task 3).

**Files:**
- Tests: `internal/scan/build_test.go`, `internal/scan/testdata/shop.golden.json`
- Code: `internal/ir/ir.go`, `internal/scan/build.go`

**Steps:**

- [x] **Write the failing test**

```diff
diff --git a/internal/scan/build_test.go b/internal/scan/build_test.go
index 70634f8..f2d40cd 100644
--- a/internal/scan/build_test.go
+++ b/internal/scan/build_test.go
@@ -131,3 +131,20 @@ func TestBuildPackageHashWithDottedImportPath(t *testing.T) {
 		t.Fatal("a method change must change the package hash for a dotted import path")
 	}
 }
+
+// 12: a package node says whether it is a command (package main). Whether
+// its code is generated stays on its declarations.
+func TestBuildPackageFacts(t *testing.T) {
+	gen := "// Code generated by x. DO NOT EDIT.\n\npackage p\n"
+	doc := scanTree(t, map[string]string{
+		"go.mod":        "module example.com/m\n",
+		"p/a.go":        gen + "\nfunc F() {}\n",
+		"cmd/x/main.go": "package main\n\nfunc main() {}\n",
+	})
+	for id, want := range map[string]bool{"example.com/m/p": false, "example.com/m/cmd/x": true} {
+		n := node(doc, id)
+		if n == nil || n.Main != want || n.Generated {
+			t.Errorf("%s = %+v, want main %v and no package-level generated", id, n, want)
+		}
+	}
+}
diff --git a/internal/scan/testdata/shop.golden.json b/internal/scan/testdata/shop.golden.json
index ad15250..54e0c36 100644
--- a/internal/scan/testdata/shop.golden.json
+++ b/internal/scan/testdata/shop.golden.json
@@ -11,6 +11,7 @@
       "id": "example.com/shop",
       "kind": "package",
       "module": "example.com/shop",
+      "main": true,
       "hash": "65552a8a1360f94e104eeaa147f261bc816391cbeea8138ededea871be6cb1e6",
       "locations": [
         {
@@ -415,6 +416,7 @@
       "id": "example.com/shop/tools/gen",
       "kind": "package",
       "module": "example.com/shop/tools",
+      "main": true,
       "hash": "7fa199a3196c0a620c26f5dd7924c9ba0095b41b4a113244f66bcac128cbbfe4",
       "locations": [
         {
```

- [x] **Run:** `go test ./internal/scan/` Expected: FAIL (`n.Main undefined`)

- [x] **Implement**

```diff
diff --git a/internal/ir/ir.go b/internal/ir/ir.go
index 11e736f..033f992 100644
--- a/internal/ir/ir.go
+++ b/internal/ir/ir.go
@@ -59,6 +59,8 @@ type Ref struct {
 // Optional fields are omitted for kinds they do not apply to. Shape is Hash
 // with the declared name and receiver type name blanked: equal shapes pair a
 // removed and an added declaration as a Move (0003); types and functions only.
+// Main (12): a package whose name is main, a command. Additive and optional,
+// so schemaVersion stays "1", as 02 kept it for additive fields.
 type Node struct {
 	ID        string     `json:"id"`
 	Kind      NodeKind   `json:"kind"`
@@ -67,6 +69,7 @@ type Node struct {
 	Exported  *bool      `json:"exported,omitempty"`
 	TypeKind  string     `json:"typeKind,omitempty"`
 	Generated bool       `json:"generated,omitempty"`
+	Main      bool       `json:"main,omitempty"`
 	Hash      string     `json:"hash,omitempty"`
 	Shape     string     `json:"shape,omitempty"`
 	Locations []Location `json:"locations"`
diff --git a/internal/scan/build.go b/internal/scan/build.go
index 56f93e3..e4b2e9b 100644
--- a/internal/scan/build.go
+++ b/internal/scan/build.go
@@ -81,7 +81,9 @@ func assemble(w *walkResult, facts []*fileFacts) (*ir.IR, Measures) {
 		}
 	}
 	for _, p := range b.ix.pkgs {
-		b.nodes[p.ID].Hash = b.packageHash(p)
+		n := b.nodes[p.ID]
+		n.Hash = b.packageHash(p)
+		n.Main = p.Name == "main"
 	}
 	for _, n := range b.nodes {
 		b.doc.Nodes = append(b.doc.Nodes, *n)
```

- [x] **Run:** `go test ./... && go vet ./...` Expected: PASS

- [x] **Commit** (one line, imperative; stage these files only)

### Task 2: Policy keys `demote` and `budget`

`Policy.Demoted`, the built-in list `Conventional`, validation, `Normalize`, and the `policy init` comment. `Format` stays "1", as 07's additions kept it. `Hash` leaves out `demote` and `budget`: they change what the page draws, not what `zu check` reports, so uncommenting `# budget: 15` keeps a Baseline valid. No caller yet.

**Files:**
- Tests: `internal/cli/check_test.go`, `internal/policy/demote_test.go`, `internal/policy/suggest_test.go`
- Code: `internal/policy/demote.go`, `internal/policy/policy.go`, `internal/policy/suggest.go`

**Steps:**

- [x] **Write the failing test**

```diff
diff --git a/internal/cli/check_test.go b/internal/cli/check_test.go
index 941f976..8ff9bd4 100644
--- a/internal/cli/check_test.go
+++ b/internal/cli/check_test.go
@@ -135,3 +135,25 @@ func TestCheckParseFailureWins(t *testing.T) {
 		t.Fatalf("exit %d, want %d: a file that does not parse hides its imports", code, ExitParseFailure)
 	}
 }
+
+// 12: uncommenting policy init's budget hint keeps an existing Baseline valid:
+// budget and demote draw the first view and are not in the Policy hash.
+func TestCheckKeepsBaselineWhenBudgetUncommented(t *testing.T) {
+	dir := layeredRepo(t)
+	if code, _, _ := run("check", "-update-baseline", dir); code != ExitOK {
+		t.Fatal("-update-baseline")
+	}
+	var hint string
+	for _, l := range strings.Split(string(policy.InitFile(nil, "")), "\n") {
+		if strings.HasPrefix(l, "# budget: ") {
+			hint = strings.TrimPrefix(l, "# ")
+		}
+	}
+	if hint == "" {
+		t.Fatal("policy init writes no budget hint")
+	}
+	writeFile(t, dir, policy.FileName, layeredPolicy+hint+"\ndemote: [\"**/docs\"]\n")
+	if code, out, errOut := run("check", dir); code != ExitOK || !strings.Contains(out, "0 new, 1 known") {
+		t.Fatalf("exit %d, stdout %q, stderr %q", code, out, errOut)
+	}
+}
diff --git a/internal/policy/demote_test.go b/internal/policy/demote_test.go
new file mode 100644
index 0000000..6ed617f
--- /dev/null
+++ b/internal/policy/demote_test.go
@@ -0,0 +1,98 @@
+package policy
+
+import (
+	"strings"
+	"testing"
+)
+
+func TestDemotedByConventionalName(t *testing.T) {
+	p := &Policy{}
+	for _, tc := range []struct{ id, dir, want string }{
+		{"m/test/e2e/x", "test/e2e/x", DemotedName},
+		{"m/internal/htesting", "internal/htesting", DemotedName}, // *testing
+		{"k8s.io/sample-apiserver", "staging/src/k8s.io/sample-apiserver", DemotedName},
+		{"k8s.io/kubernetes/hack/tools/lint", "hack/tools/lint", DemotedName},
+		{"m/examples/basic", "examples/basic", DemotedName},
+		{"m/third_party/forked", "third_party/forked", DemotedName},
+		{"m/pkg/contest", "pkg/contest", ""},        // a whole segment, not a substring
+		{"golang.org/x/tools/go/ast", "go/ast", ""}, // the module path is not a directory
+		{"m", ".", ""},
+	} {
+		if got := p.Demoted(tc.id, tc.dir, false); got != tc.want {
+			t.Errorf("Demoted(%s, %s) = %q, want %q", tc.id, tc.dir, got, tc.want)
+		}
+	}
+}
+
+func TestDemotedGenerated(t *testing.T) {
+	p := &Policy{}
+	if got := p.Demoted("m/client/typed", "client/typed", true); got != DemotedGenerated {
+		t.Errorf("a generated package = %q, want %q", got, DemotedGenerated)
+	}
+	if got := p.Demoted("m/test/gen", "test/gen", true); got != DemotedName {
+		t.Errorf("a name wins over generated: %q", got)
+	}
+}
+
+func TestDemotedByPolicyGlobs(t *testing.T) {
+	p, err := Parse([]byte("demote: [\"**/docshelper\", \"!k8s.io/kubernetes/test\", \"!m/gen\"]\n"))
+	if err != nil {
+		t.Fatal(err)
+	}
+	for _, tc := range []struct {
+		id, dir   string
+		generated bool
+		want      string
+	}{
+		{"github.com/gohugoio/hugo/docshelper", "docshelper", false, DemotedName},
+		{"github.com/gohugoio/hugo/docshelper/x", "docshelper/x", false, DemotedName}, // under a matched box
+		{"k8s.io/kubernetes/test/utils", "test/utils", false, ""},                     // "!" keeps it
+		{"k8s.io/kubernetes/test", "test", false, ""},
+		{"m/gen", "gen", true, ""}, // "!" keeps a generated package too
+		{"k8s.io/kubernetes/hack", "hack", false, DemotedName},
+	} {
+		if got := p.Demoted(tc.id, tc.dir, tc.generated); got != tc.want {
+			t.Errorf("Demoted(%s) = %q, want %q", tc.id, got, tc.want)
+		}
+	}
+}
+
+func TestParseDemoteAndBudget(t *testing.T) {
+	p, err := Parse([]byte("demote: [\"**/tools\", \"!m/tools\"]\nbudget: 20\n"))
+	if err != nil || len(p.Demote) != 2 || p.Budget == nil || *p.Budget != 20 {
+		t.Fatalf("parsed %+v, %v", p, err)
+	}
+	for _, tc := range []struct{ yaml, want string }{
+		{"demote: [\"!\"]\n", "demote[0]"},
+		{"demote: [\"a/[\"]\n", "demote[0]"},
+		{"demote: [\"/a\"]\n", "demote[0]"},
+		{"budget: 0\n", "budget"},
+		{"budget: -3\n", "budget"},
+		{"budget: 1000\n", "budget"},
+		{"budget: many\n", "unmarshal"},
+	} {
+		if _, err := Parse([]byte(tc.yaml)); err == nil || !strings.Contains(err.Error(), tc.want) {
+			t.Errorf("Parse(%q) = %v, want an error naming %s", tc.yaml, err, tc.want)
+		}
+	}
+}
+
+// 12: demote and budget only change what the first view draws, never the IR,
+// a violation or a Baseline, so they stay out of the hash (ADR 0004 hashes the
+// rules) and an existing Baseline stays valid.
+func TestHashIgnoresDemoteAndBudget(t *testing.T) {
+	hash := func(s string) string {
+		t.Helper()
+		p, err := Parse([]byte(s))
+		if err != nil {
+			t.Fatal(err)
+		}
+		return p.Hash()
+	}
+	if hash("budget: 15\n") != hash("") || hash("demote: [a, \"!b\"]\n") != hash("") {
+		t.Error("budget and demote must not change the hash")
+	}
+	if p, _ := Parse([]byte("budget: 20\ndemote: [b, a]\n")); *p.Normalize().Budget != 20 || len(p.Normalize().Demote) != 2 {
+		t.Error("Normalize keeps them for the View")
+	}
+}
diff --git a/internal/policy/suggest_test.go b/internal/policy/suggest_test.go
index 8e8f6af..572a1e7 100644
--- a/internal/policy/suggest_test.go
+++ b/internal/policy/suggest_test.go
@@ -53,6 +53,17 @@ func TestInitFileParsesAndHoldsAsWritten(t *testing.T) {
 	if !strings.Contains(string(src), "abc123") || !strings.Contains(string(src), "# exclude:") {
 		t.Errorf("header or exclude hint missing:\n%s", src)
 	}
+	// 12: the demote and budget hints parse once uncommented.
+	for _, key := range []string{"# demote: ", "# budget: "} {
+		i := strings.Index(string(src), key)
+		if i < 0 {
+			t.Fatalf("%s hint missing:\n%s", key, src)
+		}
+		line, _, _ := strings.Cut(string(src[i+2:]), "\n")
+		if _, err := Parse([]byte(line + "\n")); err != nil {
+			t.Errorf("hint %q: %v", line, err)
+		}
+	}
 }
 
 func TestInitFileWithNoLayering(t *testing.T) {
```

- [x] **Run:** `go test ./internal/policy/ ./internal/cli/` Expected: FAIL (`undefined: DemotedName`, `p.Demoted undefined`)

- [x] **Implement**

```diff
diff --git a/internal/policy/demote.go b/internal/policy/demote.go
new file mode 100644
index 0000000..13b5461
--- /dev/null
+++ b/internal/policy/demote.go
@@ -0,0 +1,85 @@
+package policy
+
+import (
+	"fmt"
+	"path"
+	"strings"
+)
+
+// Conventional is the built-in list of directory names (12, research R2)
+// whose packages the first view sets aside: tests, test data, examples,
+// samples and tooling, as Go and the community name them. A pattern is a
+// path.Match pattern matched against each whole segment of a package's
+// repo-relative directory.
+var Conventional = []string{
+	"testdata", "test", "tests", "*testing", "e2e", "example", "examples", "sample-*",
+	"hack", "tools", "scripts", "third_party",
+}
+
+// Why a package is demoted (12): its name, or its generated files.
+const (
+	DemotedName      = "name"
+	DemotedGenerated = "generated"
+)
+
+// MaxBudget is the largest budget a Policy may set.
+const MaxBudget = 999
+
+// Demoted says why the first view sets the package id aside, or "" when it
+// does not (12). dir is the package's repo-relative directory, generated
+// whether every declaration of it is in a file with the generated marker
+// (the IR's per-declaration flag; export.Mark counts them).
+//   - "name": a segment of dir is Conventional, or the Policy's demote globs
+//     match id or a box above it;
+//   - "generated": every declaration of it is generated;
+//   - "": neither, or a "!glob" in demote matches id or a box above it. An
+//     exception wins whatever its place in the list, so demote is a set.
+//
+// It never removes the package: the view counts it and can draw it.
+func (p *Policy) Demoted(id, dir string, generated bool) string {
+	var keep, name bool
+	for _, g := range p.Demote {
+		not := strings.HasPrefix(g, "!")
+		if matchesBox(strings.TrimPrefix(g, "!"), id) {
+			keep = keep || not
+			name = name || !not
+		}
+	}
+	if keep {
+		return ""
+	}
+	for _, seg := range strings.Split(dir, "/") {
+		for _, c := range Conventional {
+			if ok, _ := path.Match(c, seg); ok {
+				name = true
+			}
+		}
+	}
+	switch {
+	case name:
+		return DemotedName
+	case generated:
+		return DemotedGenerated
+	}
+	return ""
+}
+
+// matchesBox reports whether glob matches id or one of the boxes above it:
+// "a", "a/b" and "a/b/c" for "a/b/c".
+func matchesBox(glob, id string) bool {
+	for i := 0; i <= len(id); i++ {
+		if (i == len(id) || id[i] == '/') && Match(glob, id[:i]) {
+			return true
+		}
+	}
+	return false
+}
+
+// checkDemote accepts a glob over ids, or "!" and one: the exception.
+func checkDemote(g string) error {
+	glob := strings.TrimPrefix(g, "!")
+	if glob == "" || strings.HasPrefix(glob, "/") {
+		return fmt.Errorf("bad pattern %q: want an id glob such as **/tools, or !id to keep one", g)
+	}
+	return checkGlob(glob)
+}
diff --git a/internal/policy/policy.go b/internal/policy/policy.go
index 3ee40af..b3b2afe 100644
--- a/internal/policy/policy.go
+++ b/internal/policy/policy.go
@@ -39,6 +39,8 @@ type Policy struct {
 	OmitEdges []Pair     `yaml:"omit-edges" json:"omitEdges,omitempty"` // dependencies left off
 	EdgeKinds []EdgeKind `yaml:"edge-kinds" json:"edgeKinds,omitempty"` // dependencies the Levels rule exempts
 	Proposals []Proposal `yaml:"proposals" json:"proposals,omitempty"`  // named regroupings, drawn only on request
+	Demote    []string   `yaml:"demote" json:"demote,omitempty"`        // 12: id globs set aside; "!glob" keeps one
+	Budget    *int       `yaml:"budget" json:"budget,omitempty"`        // 12: boxes the first view shows before folding
 }
 
 // Level is one rank: the boxes that share it. In YAML an item is one id or
@@ -118,6 +120,14 @@ func Parse(data []byte) (*Policy, error) {
 }
 
 func (p *Policy) validate() error {
+	for i, g := range p.Demote {
+		if err := checkDemote(g); err != nil {
+			return fmt.Errorf("demote[%d]: %w", i, err)
+		}
+	}
+	if b := p.Budget; b != nil && (*b < 1 || *b > MaxBudget) {
+		return fmt.Errorf("budget: %d: want a number of boxes from 1 to %d", *b, MaxBudget)
+	}
 	for i, g := range p.Exclude {
 		if err := checkGlob(g); err != nil {
 			return fmt.Errorf("exclude[%d]: %w", i, err)
@@ -248,7 +258,7 @@ func checkID(id string) error {
 // "**" in exclude globs collapsed to one. Order, the sequence of levels and
 // of proposals and their layers carry meaning and are kept.
 func (p *Policy) Normalize() *Policy {
-	n := &Policy{Foreign: set(p.Foreign), Omit: set(p.Omit), Cycles: p.Cycles}
+	n := &Policy{Foreign: set(p.Foreign), Omit: set(p.Omit), Cycles: p.Cycles, Demote: set(p.Demote), Budget: p.Budget}
 	for _, g := range p.Exclude {
 		n.Exclude = append(n.Exclude, collapseGlob(g))
 	}
@@ -293,8 +303,13 @@ func set(ids []string) []string {
 // Hash is "sha256:" and the hex SHA-256 of the normalised Policy as JSON plus
 // a newline. Comments, key order, list order within sets and duplicates do
 // not change it (0004); the empty Policy hashes as scan.DefaultPolicyHash.
+// Demote and Budget (12) are left out: they only change what the first view
+// draws, never the IR, a violation or a Baseline, so adding them keeps a
+// Baseline valid.
 func (p *Policy) Hash() string {
-	b, err := json.Marshal(p.Normalize())
+	n := p.Normalize()
+	n.Demote, n.Budget = nil, nil
+	b, err := json.Marshal(n)
 	if err != nil {
 		panic(err) // plain strings and bools cannot fail to marshal
 	}
diff --git a/internal/policy/suggest.go b/internal/policy/suggest.go
index 021d526..6cbbda5 100644
--- a/internal/policy/suggest.go
+++ b/internal/policy/suggest.go
@@ -138,6 +138,11 @@ func InitFile(levels []Level, commit string) []byte {
 	b.WriteString("# what exists today).\n")
 	b.WriteString("# exclude: [\"**/*.pb.go\", \"**/zz_generated*.go\"]\n")
 	b.WriteString("# foreign: [github.com/aws/aws-sdk-go-v2]\n")
+	b.WriteString("# The first view sets aside packages under testdata, test(s), *testing, e2e,\n")
+	b.WriteString("# example(s), sample-*, hack, tools, scripts and third_party, and fully\n")
+	b.WriteString("# generated ones; demote adds id globs, and \"!id\" keeps a box drawn.\n")
+	b.WriteString("# demote: [\"**/docs\", \"!example.com/m/tools\"]\n")
+	b.WriteString("# budget: 15 # boxes the first view shows before folding the rest into +N\n")
 	if len(levels) == 0 {
 		b.WriteString("# No layering found: fewer than two boxes to rank.\nlevels: []\n")
 	} else {
```

- [x] **Run:** `go test ./... && go vet ./...` Expected: PASS

- [x] **Commit** (one line, imperative; stage these files only)

### Task 3: The View marks demoted packages

`Mark` sets `demoted` on every package, with or without a Policy file, and copies `main` and the budget. A package's `genDecls` counts its declarations in generated files, from the IR's per-declaration flag; a package is generated when every declaration is. The View schema stays "1".

**Files:**
- Tests: `internal/export/policy_test.go`, `internal/export/testdata/shop.change.golden.json`, `internal/export/testdata/shop.view.golden.json`
- Code: `internal/export/change.go`, `internal/export/policy.go`, `internal/export/project.go`, `internal/export/view.go`

**Steps:**

- [x] **Write the failing test**

```diff
diff --git a/internal/export/policy_test.go b/internal/export/policy_test.go
index e1a409a..0c6c79b 100644
--- a/internal/export/policy_test.go
+++ b/internal/export/policy_test.go
@@ -6,6 +6,7 @@ import (
 	"strings"
 	"testing"
 
+	"zu/internal/ir"
 	"zu/internal/policy"
 )
 
@@ -67,8 +68,11 @@ func TestMarkWithoutRulesAddsNothing(t *testing.T) {
 	}
 	before, _ := json.Marshal(v)
 	Mark(v, &policy.Policy{Foreign: []string{"github.com/lib"}}, doc)
+	for i := range v.Nodes { // 12: what Mark adds with any Policy (TestMarkDemotes)
+		v.Nodes[i].Demoted = ""
+	}
 	if after, _ := json.Marshal(v); string(before) != string(after) {
-		t.Fatal("a Policy with no rules must leave the View (and 04's goldens) unchanged")
+		t.Fatal("a Policy with no rules must leave the View (and 04's goldens) unchanged but for demotion")
 	}
 }
 
@@ -107,3 +111,80 @@ proposals:
 		}
 	}
 }
+
+// 12: Mark says which packages the first view sets aside, with or without a
+// Policy file, and passes the budget on.
+func TestMarkDemotes(t *testing.T) {
+	demoted := func(pol *policy.Policy) map[string]string {
+		t.Helper()
+		doc := shopIR(t)
+		v, err := Project(pol.Apply(doc), nil, nil)
+		if err != nil {
+			t.Fatal(err)
+		}
+		Mark(v, pol, doc)
+		out := map[string]string{}
+		for _, n := range v.Nodes {
+			if n.Demoted != "" {
+				out[n.ID] = n.Demoted
+			}
+		}
+		return out
+	}
+	if got := demoted(&policy.Policy{}); len(got) != 1 || got["example.com/shop/tools/gen"] != policy.DemotedName {
+		t.Errorf("no Policy: demoted = %v, want tools/gen by name", got)
+	}
+	keep, err := policy.Parse([]byte("demote: [\"!example.com/shop/tools\", example.com/shop/internal/money]\n"))
+	if err != nil {
+		t.Fatal(err)
+	}
+	if got := demoted(keep); len(got) != 1 || got["example.com/shop/internal/money"] != policy.DemotedName {
+		t.Errorf("demote and !: demoted = %v, want only internal/money", got)
+	}
+}
+
+func TestMarkPassesTheBudget(t *testing.T) {
+	doc := shopIR(t)
+	pol, err := policy.Parse([]byte("budget: 20\n"))
+	if err != nil {
+		t.Fatal(err)
+	}
+	v, err := Project(pol.Apply(doc), nil, nil)
+	if err != nil {
+		t.Fatal(err)
+	}
+	Mark(v, pol, doc)
+	if v.Policy == nil || v.Policy.Budget == nil || *v.Policy.Budget != 20 || v.Policy.Hash != pol.Hash() {
+		t.Fatalf("Policy = %+v, want budget 20 alone to add it", v.Policy)
+	}
+	for _, n := range v.Nodes {
+		if want := n.ID == "example.com/shop" || n.ID == "example.com/shop/tools/gen"; n.Kind == "package" && n.Main != want {
+			t.Errorf("%s main = %v, want %v", n.ID, n.Main, want)
+		}
+	}
+}
+
+// 12 (M1): a package counts its declarations in generated files, and is
+// demoted as generated when every declaration of it is.
+func TestProjectCountsGeneratedDeclarations(t *testing.T) {
+	at := []ir.Location{{Path: "p/a.go", Line: 1}}
+	doc := &ir.IR{Nodes: []ir.Node{
+		{ID: "m/p", Kind: ir.KindPackage, Module: "m", Locations: at},
+		{ID: "m/p.T", Kind: ir.KindType, Parent: "m/p", Generated: true, Locations: at},
+		{ID: "m/p.F", Kind: ir.KindFunction, Parent: "m/p", Locations: at},
+		{ID: "m/q", Kind: ir.KindPackage, Module: "m", Locations: []ir.Location{{Path: "q/a.go", Line: 1}}},
+		{ID: "m/q.G", Kind: ir.KindFunction, Parent: "m/q", Generated: true, Locations: at},
+		{ID: "m/r", Kind: ir.KindPackage, Module: "m", Locations: []ir.Location{{Path: "r/doc.go", Line: 1}}},
+	}}
+	v, err := Project(doc, nil, nil)
+	if err != nil {
+		t.Fatal(err)
+	}
+	Mark(v, &policy.Policy{}, doc)
+	want := map[string][3]any{"m/p": {2, 1, ""}, "m/q": {1, 1, policy.DemotedGenerated}, "m/r": {0, 0, ""}}
+	for _, n := range v.Nodes {
+		if w, ok := want[n.ID]; ok && (n.Decls != w[0] || n.GenDecls != w[1] || n.Demoted != w[2] || n.Generated) {
+			t.Errorf("%s: decls %d, genDecls %d, demoted %q, generated %v; want %v and no package-level generated", n.ID, n.Decls, n.GenDecls, n.Demoted, n.Generated, w)
+		}
+	}
+}
diff --git a/internal/export/testdata/shop.change.golden.json b/internal/export/testdata/shop.change.golden.json
index e8d4d36..ca06ac8 100644
--- a/internal/export/testdata/shop.change.golden.json
+++ b/internal/export/testdata/shop.change.golden.json
@@ -19,6 +19,7 @@
       "id": "example.com/shop",
       "kind": "package",
       "module": "example.com/shop",
+      "main": true,
       "loc": {
         "path": "main.go",
         "line": 1
@@ -97,6 +98,7 @@
         "line": 3
       },
       "decls": 14,
+      "genDecls": 2,
       "unresolved": 5,
       "detail": true,
       "status": "modified",
@@ -163,6 +165,7 @@
       "id": "example.com/shop/tools/gen",
       "kind": "package",
       "module": "example.com/shop/tools",
+      "main": true,
       "loc": {
         "path": "tools/gen/gen.go",
         "line": 1
diff --git a/internal/export/testdata/shop.view.golden.json b/internal/export/testdata/shop.view.golden.json
index 2fb33af..888aa0c 100644
--- a/internal/export/testdata/shop.view.golden.json
+++ b/internal/export/testdata/shop.view.golden.json
@@ -15,6 +15,7 @@
       "id": "example.com/shop",
       "kind": "package",
       "module": "example.com/shop",
+      "main": true,
       "loc": {
         "path": "main.go",
         "line": 1
@@ -51,6 +52,7 @@
         "line": 3
       },
       "decls": 15,
+      "genDecls": 2,
       "unresolved": 4,
       "detail": true
     },
@@ -216,6 +218,7 @@
       "id": "example.com/shop/tools/gen",
       "kind": "package",
       "module": "example.com/shop/tools",
+      "main": true,
       "loc": {
         "path": "tools/gen/gen.go",
         "line": 1
```

- [x] **Run:** `go test ./internal/export/` Expected: FAIL (`Demoted`, `Main`, `GenDecls` and `Budget` undefined)

- [x] **Implement**

```diff
diff --git a/internal/export/change.go b/internal/export/change.go
index 43ece59..4e4e14c 100644
--- a/internal/export/change.go
+++ b/internal/export/change.go
@@ -44,10 +44,13 @@ func Change(base, head *ir.IR, delta diff.Delta, sum *diff.Summary, baseTree, he
 		detail[headPkg(to)] = true
 	}
 
-	decls := map[string]int{}
+	decls, gen := map[string]int{}, map[string]int{}
 	for i := range head.Nodes {
 		if k := head.Nodes[i].Kind; k == ir.KindType || k == ir.KindFunction {
 			decls[headPkg(head.Nodes[i].ID)]++
+			if head.Nodes[i].Generated {
+				gen[headPkg(head.Nodes[i].ID)]++
+			}
 		}
 	}
 
@@ -60,7 +63,7 @@ func Change(base, head *ir.IR, delta diff.Delta, sum *diff.Summary, baseTree, he
 			if h, ok := hop[n.ID]; ok {
 				vn.Hop = &h
 			}
-			vn.Decls, vn.Unresolved, vn.Detail = decls[n.ID], from.UnresolvedCalls[n.ID], detail[n.ID]
+			vn.Decls, vn.GenDecls, vn.Unresolved, vn.Detail = decls[n.ID], gen[n.ID], from.UnresolvedCalls[n.ID], detail[n.ID]
 		}
 		v.Nodes = append(v.Nodes, vn)
 		in[n.ID] = true
diff --git a/internal/export/policy.go b/internal/export/policy.go
index 1573d93..05765a5 100644
--- a/internal/export/policy.go
+++ b/internal/export/policy.go
@@ -2,6 +2,7 @@ package export
 
 import (
 	"cmp"
+	"path"
 	"slices"
 
 	"zu/internal/ir"
@@ -15,6 +16,7 @@ type PolicyInfo struct {
 	Levels    [][]string     `json:"levels"`
 	Order     []string       `json:"order,omitempty"`
 	Proposals []ProposalInfo `json:"proposals,omitempty"`
+	Budget    *int           `json:"budget,omitempty"` // 12: boxes the first view shows; absent = the UI's default
 }
 
 // ProposalInfo is one Proposal as the UI draws it: its layers inner first,
@@ -31,14 +33,20 @@ type ProposalInfo struct {
 
 // Mark adds the Policy to a View built from pol.Apply(doc): the rank of
 // every ranked package, the rule each violating import breaks, the order
-// and the Proposals. A Policy with none of these adds nothing, so a View
-// without them is 04's.
+// and the Proposals, and (12) the budget. A Policy with none of these adds
+// nothing, so a View without them is 04's. Every package is marked with why
+// the first view sets it aside, if it does, Policy file or not (12).
 func Mark(v *View, pol *policy.Policy, doc *ir.IR) {
+	for i := range v.Nodes {
+		if n := &v.Nodes[i]; n.Kind == string(ir.KindPackage) {
+			n.Demoted = pol.Demoted(n.ID, path.Dir(n.Loc.Path), n.Decls > 0 && n.GenDecls == n.Decls)
+		}
+	}
 	norm := pol.Normalize()
-	if !pol.Rules() && len(norm.Order) == 0 && len(norm.Proposals) == 0 {
+	if !pol.Rules() && len(norm.Order) == 0 && len(norm.Proposals) == 0 && norm.Budget == nil {
 		return
 	}
-	v.Policy = &PolicyInfo{Hash: pol.Hash(), Levels: [][]string{}, Order: norm.Order}
+	v.Policy = &PolicyInfo{Hash: pol.Hash(), Levels: [][]string{}, Order: norm.Order, Budget: norm.Budget}
 	for _, l := range norm.Levels {
 		v.Policy.Levels = append(v.Policy.Levels, l)
 	}
diff --git a/internal/export/project.go b/internal/export/project.go
index a885bcc..d17555a 100644
--- a/internal/export/project.go
+++ b/internal/export/project.go
@@ -15,13 +15,16 @@ type ReadFunc func(path string) ([]byte, error)
 // edges, plus declarations, calls, embeds and source for included packages.
 func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
 	pkgOf := packageOf(nodesByID(doc))
-	detail, decls := map[string]bool{}, map[string]int{}
+	detail, decls, gen := map[string]bool{}, map[string]int{}, map[string]int{}
 	matched := make([]bool, len(include))
 	for i := range doc.Nodes {
 		n := &doc.Nodes[i]
 		switch n.Kind {
 		case ir.KindType, ir.KindFunction:
 			decls[pkgOf(n.ID)]++
+			if n.Generated {
+				gen[pkgOf(n.ID)]++
+			}
 		case ir.KindPackage:
 			for j, p := range include {
 				if p.Match(n.ID, n.Module) {
@@ -44,7 +47,7 @@ func Project(doc *ir.IR, include []Pattern, read ReadFunc) (*View, error) {
 		switch n.Kind {
 		case ir.KindPackage:
 			modules[n.Module] = true
-			vn.Decls, vn.Unresolved, vn.Detail = decls[n.ID], doc.UnresolvedCalls[n.ID], detail[n.ID]
+			vn.Decls, vn.GenDecls, vn.Unresolved, vn.Detail = decls[n.ID], gen[n.ID], doc.UnresolvedCalls[n.ID], detail[n.ID]
 		case ir.KindType, ir.KindFunction:
 			if !detail[pkgOf(n.ID)] {
 				continue
diff --git a/internal/export/view.go b/internal/export/view.go
index 587e4db..70353ea 100644
--- a/internal/export/view.go
+++ b/internal/export/view.go
@@ -44,14 +44,17 @@ type Node struct {
 	Exported   *bool       `json:"exported,omitempty"`
 	TypeKind   string      `json:"typeKind,omitempty"`
 	Generated  bool        `json:"generated,omitempty"`
+	Main       bool        `json:"main,omitempty"` // packages (12): package main
 	Loc        ir.Location `json:"loc"`
 	Decls      int         `json:"decls,omitempty"`      // packages: declarations in the IR
+	GenDecls   int         `json:"genDecls,omitempty"`   // packages (12): those of them in generated files
 	Unresolved int         `json:"unresolved,omitempty"` // packages: Unresolved Calls
 	Detail     bool        `json:"detail,omitempty"`     // packages: declarations and source are in this file
 	Status     string      `json:"status,omitempty"`     // Change View only
 	MovedFrom  string      `json:"movedFrom,omitempty"`  // Change View: the Move's base id
 	Hop        *int        `json:"hop,omitempty"`        // Change View: distance in the Affected Set
 	Rank       *int        `json:"rank,omitempty"`       // packages: the Policy Level, 0 = innermost
+	Demoted    string      `json:"demoted,omitempty"`    // packages (12): why the first view sets it aside, "name" or "generated"
 }
 
 // Edge is an IR edge with its location count instead of every location.
@@ -105,7 +108,7 @@ func first(l []ir.Location) ir.Location {
 func toNode(n *ir.Node) Node {
 	return Node{
 		ID: n.ID, Kind: string(n.Kind), Parent: n.Parent, Module: n.Module,
-		Exported: n.Exported, TypeKind: n.TypeKind, Generated: n.Generated, Loc: first(n.Locations),
+		Exported: n.Exported, TypeKind: n.TypeKind, Generated: n.Generated, Main: n.Main, Loc: first(n.Locations),
 	}
 }
 
```

- [x] **Run:** `go test ./... && go vet ./...` Expected: PASS

- [x] **Commit** (one line, imperative; stage these files only)

## 12b: the grouped first view (the page)

### Task 4: The Strip (`group.ts`)

Demoted boxes of a sibling set become one Strip in its bottom row, on one line ("N tests & tools · used by K"; the kinds apart in its tooltip when there are two), opened in place by a click or the toggle. Search opens it to reveal a package, a selection inside it opens it, and the Panel lists its members.

**Files:**
- Tests: `web/src/group.test.ts`
- Code: `web/src/App.tsx`, `web/src/Canvas.tsx`, `web/src/Panel.tsx`, `web/src/cut.ts`, `web/src/data.ts`, `web/src/group.ts`, `web/src/layout.ts`, `web/src/scene.ts`, `web/src/styles.css`

**Steps:**

- [ ] **Write the failing test**

```diff
diff --git a/web/src/group.test.ts b/web/src/group.test.ts
new file mode 100644
index 0000000..7094a3d
--- /dev/null
+++ b/web/src/group.test.ts
@@ -0,0 +1,85 @@
+import { describe, expect, it } from "vitest";
+import { demotedBox, isGroup, STRIP, stripText } from "./group";
+import { knownIds, scene } from "./scene";
+import { DEFAULT_STATE, type ViewState } from "./state";
+import { edge, pkgs, view } from "./testkit";
+
+const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
+
+// m holds two drawn boxes, a testdata box and a generated one.
+const noisy = view([
+  ...pkgs(["m/a", "m/b"], "m"),
+  ...pkgs(["m/testdata/x", "m/testdata/y"], "m", { demoted: "name" }),
+  ...pkgs(["m/gen"], "m", { demoted: "generated" }),
+], [edge("m/a", "m/b"), edge("m/a", "m/testdata/x"), edge("m/b", "m/gen")]);
+const at = (s: Partial<ViewState>, v = noisy) => scene(v, { ...DEFAULT_STATE, ...s }, { home: true });
+
+describe("demotedBox (12)", () => {
+  it("demotes a box when every package in it is demoted, by name before generated", () => {
+    const v = view([
+      ...pkgs(["m/t/a"], "m", { demoted: "name" }),
+      ...pkgs(["m/t/b"], "m", { demoted: "generated" }),
+      ...pkgs(["m/g"], "m", { demoted: "generated" }),
+      ...pkgs(["m/mix/a"], "m", { demoted: "name" }),
+      ...pkgs(["m/mix/b"], "m"),
+    ]);
+    expect(demotedBox(v, "m/t")).toBe("name");
+    expect(demotedBox(v, "m/g")).toBe("generated");
+    expect(demotedBox(v, "m/mix")).toBeUndefined();
+    expect(demotedBox(v, "m")).toBeUndefined();
+  });
+  it("never demotes a changed package", () => {
+    const v = view(pkgs(["m/gen"], "m", { demoted: "generated", status: "modified" }));
+    expect(demotedBox(v, "m/gen")).toBeUndefined();
+  });
+});
+
+describe("the demotion strip (12)", () => {
+  it("draws demoted siblings as one strip at the bottom, used by what imports them", () => {
+    const sc = at({});
+    expect(sc.focus).toBe("m");
+    expect(ids(sc.nodes)).toEqual([`m${STRIP}`, "m/a", "m/b"]);
+    const strip = sc.nodes.find((n) => n.id === `m${STRIP}`)!;
+    expect(strip.shape).toBe("chip");
+    expect(strip.label).toBe("3 tests, tools & generated · used by 2");
+    expect(strip.hint).toBe("2 tests & tools · 1 generated");
+    expect(strip.stats).toBeUndefined();
+    // One kind says itself on the line, with no tooltip.
+    expect(stripText(noisy, ["m/testdata"], 3)).toEqual({ label: "2 tests & tools · used by 3" });
+    expect(stripText(noisy, ["m/gen"], 0)).toEqual({ label: "1 generated · used by 0" });
+    expect(strip.tier).toBe(-1);
+    expect(strip.toggle).toBe("expand");
+    expect(sc.against).toBe(0);
+  });
+  it("opens in place when toggled: its boxes in the bottom row, the strip kept to close them", () => {
+    const sc = at({ toggled: [`m${STRIP}`] });
+    expect(ids(sc.nodes)).toEqual([`m${STRIP}`, "m/a", "m/b", "m/gen", "m/testdata", "m/testdata/x", "m/testdata/y"]);
+    for (const id of ["m/gen", "m/testdata"]) {
+      const n = sc.nodes.find((x) => x.id === id)!;
+      expect(n.tier).toBe(-1);
+      expect(n.demoted).toBe(true);
+    }
+    expect(sc.nodes.find((n) => n.id === `m${STRIP}`)!.toggle).toBe("collapse");
+  });
+  it("keeps an opened demoted box's own toggle", () => {
+    const n = at({ depth: 1, toggled: [`m${STRIP}`] }).nodes.find((x) => x.id === "m/testdata")!;
+    expect([n.demoted, n.toggle]).toEqual([true, "expand"]);
+  });
+  it("selects the strip for a box it holds, as for a package", () => {
+    expect(at({ depth: 1, selected: "m/testdata" }).selected).toBe(`m${STRIP}`);
+    expect(at({ depth: 1, selected: "m/testdata/x" }).selected).toBe(`m${STRIP}`);
+  });
+  it("leaves a sibling set alone when all of it is demoted", () => {
+    const sc = at({ focus: "m/testdata" });
+    expect(ids(sc.nodes)).toEqual(["m/testdata/x", "m/testdata/y", "outside"]);
+  });
+  it("keeps a changed package drawn in a Change View", () => {
+    const v = { ...view([...pkgs(["m/a"], "m"), ...pkgs(["m/gen"], "m", { demoted: "generated", status: "modified" })]), kind: "change" as const };
+    expect(ids(at({ focus: "m" }, v).nodes)).toContain("m/gen");
+  });
+  it("lets a hash name a strip as a toggle", () => {
+    expect(knownIds(noisy).folder(`m${STRIP}`)).toBe(true);
+    expect(knownIds(noisy).folder(`nope${STRIP}`)).toBe(false);
+    expect(isGroup(`m${STRIP}`)).toBe(true);
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/group.test.ts` Expected: FAIL (`Cannot find module './group'`)

- [ ] **Implement**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index e6aea3e..b44c387 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -4,6 +4,7 @@ import { Canvas } from "./Canvas";
 import { changedSubgraph, nodeMark } from "./change";
 import { home, upTo } from "./cut";
 import type { View } from "./data";
+import { isGroup } from "./group";
 import { pageEngine } from "./engine";
 import { Header } from "./Header";
 import { redLegend, violationsNote } from "./headline";
@@ -231,6 +232,7 @@ export function App({ view: whole }: { view: View }) {
 
   const open = (n: SceneNode) => {
     if (n.shape === "box" || n.shape === "container") go(n.id);
+    else if (isGroup(n.id)) update((s) => toggle(s, n.id)); // 12: a group opens in place
   };
   // The legend explains red only when something can be red, and badges only
   // when something is ranked; an order-only Policy needs neither.
diff --git a/web/src/Canvas.tsx b/web/src/Canvas.tsx
index ee67d43..9d02dd7 100644
--- a/web/src/Canvas.tsx
+++ b/web/src/Canvas.tsx
@@ -17,6 +17,7 @@ import "@xyflow/react/dist/style.css";
 import { edgeMark } from "./change";
 import { parentBox } from "./cut";
 import type { View } from "./data";
+import { isGroup } from "./group";
 import { around } from "./edges";
 import { absolute, triangles, type Placed } from "./layout";
 import { crapGrade, crapLabel } from "./metrics";
@@ -79,7 +80,8 @@ function Toggle({ data }: { data: Data }) {
 // (07), the CRAP fill (08), selection and dimming.
 const cls = (base: string, n: SceneNode, selected: boolean) =>
   `node ${base}${n.change ? ` ${n.change}` : ""}${n.hidden ? " hides-violation" : ""}${n.rank !== undefined ? " ranked" : ""}` +
-  `${n.crap ? ` crap-${n.crap.band}` : ""}${selected ? " selected" : ""}${n.dim ? " dim" : ""}${n.hub ? " hub" : ""}`;
+  `${n.crap ? ` crap-${n.crap.band}` : ""}${selected ? " selected" : ""}${n.dim ? " dim" : ""}${n.hub ? " hub" : ""}` +
+  `${n.demoted ? " demoted" : ""}`;
 
 // Crap is the CRAP badge (08), at the lower right, or in a container's
 // header: the number and its band in words, so the fill is never the only
@@ -181,8 +183,19 @@ function DeclNode({ data, selected }: NodeProps<ZNode>) {
   );
 }
 
-function ChipNode({ data }: NodeProps<ZNode>) {
-  return <div className={cls("chip", data.node, false)}>{data.node.label}</div>;
+// ChipNode is a "+N" line of a Change View box (04), or a group (12): the
+// strip or a fold chip, which a click opens in place (12, N4: at 1280 × 720
+// the Panel opens over it after the first click, so no double-click).
+function ChipNode({ data, selected }: NodeProps<ZNode>) {
+  if (!isGroup(data.node.id)) return <div className={cls("chip", data.node, false)}>{data.node.label}</div>;
+  return (
+    <div className={cls("chip group", data.node, selected)} title={data.node.hint ?? data.node.label}>
+      <Ends />
+      <Toggle data={data} />
+      <div className="label">{data.node.label}</div>
+      {data.node.stats && <div className="stats">{data.node.stats}</div>}
+    </div>
+  );
 }
 
 const nodeTypes = {
@@ -331,10 +344,14 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
         nodesDraggable={false}
         nodesConnectable={false}
         nodesFocusable
-        onNodeClick={(_, n) => onSelect(n.id)}
+        onNodeClick={(_, n) => {
+          onSelect(n.id);
+          const node = byId.get(n.id);
+          if (node && isGroup(node.id)) onOpen(node); // 12: a click opens or closes a group
+        }}
         onNodeDoubleClick={(_, n) => {
           const node = byId.get(n.id);
-          if (node) onOpen(node);
+          if (node && !isGroup(node.id)) onOpen(node);
         }}
         onEdgeClick={(_, e) => onEdge?.(e.id)}
         onPaneClick={() => onSelect(null)}
diff --git a/web/src/Panel.tsx b/web/src/Panel.tsx
index 65b6687..827e4ec 100644
--- a/web/src/Panel.tsx
+++ b/web/src/Panel.tsx
@@ -2,6 +2,7 @@ import { useEffect, useRef } from "react";
 import type { Bundle } from "./bundle";
 import type { Hunk, Loc, View, ViewEdge, ViewNode } from "./data";
 import { calls, imports, targets, type Row } from "./facts";
+import { isGroup, isStrip } from "./group";
 import { linkFor } from "./links";
 import { crapFacts, type Risk } from "./metrics";
 import type { SceneEdge } from "./scene";
@@ -222,6 +223,14 @@ export function Panel({ view, id, edge, bundles, hidden, crap, onReveal, onClose
   let body: React.ReactNode;
   if (edge) {
     body = <Members view={view} edge={edge} onReveal={onReveal} />;
+  } else if (id !== null && isGroup(id)) {
+    // 12: a group stands for boxes set aside or folded; it opens in place.
+    body = (
+      <>
+        <p className="muted">{isStrip(id) ? "tests, tools and generated code, set aside" : "boxes the first view folded"} · click to open</p>
+        <Rows title="Packages here with dependencies" rows={targets(bundles, id)} onReveal={onReveal} />
+      </>
+    );
   } else if (id === OUTSIDE || id === EXTERNALS) {
     body = (
       <Rows
@@ -274,7 +283,7 @@ export function Panel({ view, id, edge, bundles, hidden, crap, onReveal, onClose
         </button>
       </header>
       {!edge && hidden && <Hidden edges={hidden} onReveal={onReveal} />}
-      {!edge && id !== null && <Crap view={view} id={id} box={crap} onReveal={onReveal} />}
+      {!edge && id !== null && !isGroup(id) && <Crap view={view} id={id} box={crap} onReveal={onReveal} />}
       {body}
     </aside>
   );
diff --git a/web/src/cut.ts b/web/src/cut.ts
index a6ce116..72bf877 100644
--- a/web/src/cut.ts
+++ b/web/src/cut.ts
@@ -109,6 +109,7 @@ export type Cut = {
   parent: Map<string, string>; // leaf or container → enclosing container, "" at the top
   decls: boolean; // the leaves are the declarations of one package
   noDetail: boolean; // that package's declarations are not in the file
+  alias?: ReadonlyMap<string, string>; // 12: a box drawn by a group leaf instead (group.ts)
 };
 
 // declsOf are a package's types and functions, sorted; methods are rows of their type.
@@ -164,15 +165,19 @@ export function cut(view: View, focus: string, depth: number, toggled: readonly
 }
 
 // leafOf maps a package to the leaf that draws it, or OUTSIDE when the cut
-// does not contain it.
+// does not contain it. A box a group leaf stands for (12, Cut.alias) maps to it.
 export function leafOf(view: View, c: Cut): (pkg: string) => string {
   const leaves = new Set(c.leaves);
   const open = new Set(c.containers);
+  const alias = c.alias ?? new Map<string, string>();
+  const drawn = (b: string) => (leaves.has(b) ? b : alias.get(b));
   return (pkg) => {
-    if (leaves.has(pkg)) return pkg;
-    if (open.has(pkg) || pkg === c.focus) return leaves.has(pkg + PKG) ? pkg + PKG : OUTSIDE;
+    const at = drawn(pkg);
+    if (at !== undefined) return at;
+    if (open.has(pkg) || pkg === c.focus) return drawn(pkg + PKG) ?? OUTSIDE;
     for (let b = parentBox(view, pkg); b !== ""; b = parentBox(view, b)) {
-      if (leaves.has(b)) return b;
+      const l = drawn(b);
+      if (l !== undefined) return l;
       if (b === c.focus || open.has(b)) break;
     }
     return OUTSIDE;
diff --git a/web/src/data.ts b/web/src/data.ts
index dffe415..b9aeae0 100644
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -6,6 +6,9 @@ export type ViewNode = {
   typeKind?: string; generated?: boolean; loc: Loc; decls?: number; unresolved?: number;
   detail?: boolean; status?: string; movedFrom?: string; hop?: number;
   rank?: number; // 06: the package's Policy Level, 0 = innermost
+  main?: boolean; // 12: package main, a program's entry
+  genDecls?: number; // 12: packages: declarations in generated files
+  demoted?: "name" | "generated"; // 12: set aside in the first view (policy.Demoted)
 };
 export type ViewEdge = {
   from: string; to: string; kind: "imports" | "calls" | "embeds"; count: number; loc: Loc; status?: string;
@@ -33,7 +36,7 @@ export type View = {
   links?: { blob: string; compare?: string };
   hunks?: Record<string, Hunk[]>;
   // 06: only when the Policy has rules; 07: or an order or Proposals.
-  policy?: { hash: string; levels: string[][]; order?: string[]; proposals?: Proposal[] };
+  policy?: { hash: string; levels: string[][]; order?: string[]; proposals?: Proposal[]; budget?: number };
   violations?: { new: Violation[]; fixed: Violation[]; known: number }; // 07: Change View only
   metrics?: Metrics; // 08: only when zu was given -coverprofile
   // 07, never written by zu: the box tree a Proposal draws (proposal.ts). cut.ts
diff --git a/web/src/group.ts b/web/src/group.ts
new file mode 100644
index 0000000..f6526f8
--- /dev/null
+++ b/web/src/group.ts
@@ -0,0 +1,151 @@
+// Grouping (12): the first view sets aside what a reader does not start from.
+// Two kinds of group leaf stand for boxes of one sibling set:
+//  - the strip ("<parent>#demoted"): the boxes internal/export demoted
+//    (policy.Demoted: tests, tools and samples by name, and generated code),
+//    drawn at the bottom of their set;
+//  - a fold chip ("<parent>#fold:<tier>"): the boxes of one row the budget
+//    left out.
+// Toggling a group's id (U2's t) opens it in place. The model never authors
+// the graph: a group only stands for boxes the cut drew, and the lines to and
+// from them attach to it (cut.ts leafOf, Cut.alias).
+import { childrenOf, cmp, index, isBox, PKG, type Cut } from "./cut";
+import type { View } from "./data";
+
+export const STRIP = "#demoted";
+export const FOLD = "#fold:";
+
+const FOLD_ID = /#fold:-?\d+$/;
+export const isStrip = (id: string) => id.endsWith(STRIP);
+export const isFold = (id: string) => FOLD_ID.test(id);
+export const isGroup = (id: string) => isStrip(id) || isFold(id);
+// groupParent is the box whose children a group stands for ("" at the top).
+export const groupParent = (id: string) => id.slice(0, id.lastIndexOf("#"));
+// knownGroup: a group id a hash may toggle, over a box of this View.
+export const knownGroup = (view: View, id: string) => {
+  if (!isGroup(id)) return false;
+  const p = groupParent(id);
+  return p === "" || (isBox(view, p) && childrenOf(view, p.endsWith(PKG) ? p.slice(0, -PKG.length) : p).length > 0);
+};
+
+// Rollup is what a box holds, summed once per View (like tree.ts boxStats):
+// every grouping question reads it in O(1), never walking the packages again.
+type Rollup = { pkgs: number; name: number; generated: number };
+const rollups = new WeakMap<View, Map<string, Rollup>>();
+
+// rollup counts, per box (and "X#pkg"), its packages and the demoted ones. A
+// changed package (a Change View status) is never demoted: a changed box
+// always shows.
+function rollup(view: View): Map<string, Rollup> {
+  const hit = rollups.get(view);
+  if (hit) return hit;
+  const ix = index(view);
+  const out = new Map<string, Rollup>();
+  const add = (b: string, kind: string | undefined) => {
+    const t = out.get(b) ?? { pkgs: 0, name: 0, generated: 0 };
+    t.pkgs++;
+    if (kind === "name") t.name++;
+    else if (kind === "generated") t.generated++;
+    out.set(b, t);
+  };
+  for (const p of ix.pkgs) {
+    const kind = p.status ? undefined : p.demoted;
+    add(p.id + PKG, kind);
+    for (let b = p.id; b !== ""; b = ix.parent.get(b) ?? "") add(b, kind);
+  }
+  rollups.set(view, out);
+  return out;
+}
+
+// demotedBox: a box is demoted when every package in it is; "name" when any
+// of them is demoted by name, else "generated".
+export function demotedBox(view: View, box: string): "name" | "generated" | undefined {
+  const t = rollup(view).get(box);
+  if (!t || t.name + t.generated < t.pkgs) return undefined;
+  return t.name > 0 ? "name" : "generated";
+}
+
+export type Grouped = {
+  cut: Cut;
+  groups: Map<string, string[]>; // group leaf → the boxes it stands for, sorted
+  opened: Set<string>; // demoted boxes drawn because their strip is toggled open
+  strips: Set<string>; // every strip drawn, closed or open
+  at: Map<string, string>; // group leaf → its container in the cut ("" at the top)
+};
+
+// strip replaces, in each sibling set of c, the demoted boxes with one strip,
+// unless the strip is toggled open or every box of the set is demoted (the
+// reader went inside them). Sets are visited from the top, so a demoted
+// container takes what it holds with it.
+export function strip(view: View, c: Cut, toggled: readonly string[]): Grouped {
+  const none: Grouped = { cut: c, groups: new Map(), opened: new Set(), strips: new Set(), at: new Map() };
+  if (c.decls) return none;
+  const kids = new Map<string, string[]>();
+  for (const id of [...c.leaves, ...c.containers]) {
+    const p = c.parent.get(id) ?? "";
+    kids.set(p, [...(kids.get(p) ?? []), id]);
+  }
+  const level = (id: string) => {
+    let d = 0;
+    for (let x = id; x !== ""; x = c.parent.get(x) ?? "") d++;
+    return d;
+  };
+  const flip = new Set(toggled);
+  const gone = new Set<string>(); // replaced, with everything under it
+  const alias = new Map(c.alias ?? []);
+  const out: Grouped = { ...none, groups: new Map(), at: new Map() };
+  for (const p of [...kids.keys()].sort((a, b) => level(a) - level(b) || cmp(a, b))) {
+    if (p !== "" && gone.has(p)) {
+      for (const k of kids.get(p)!) gone.add(k);
+      continue;
+    }
+    const set = kids.get(p)!.sort(cmp);
+    const low = set.filter((k) => demotedBox(view, k) !== undefined);
+    if (low.length === 0 || low.length === set.length) continue;
+    // A group is named after the box whose children it holds: the focus at the top.
+    const id = (p === "" ? c.focus : p) + STRIP;
+    out.strips.add(id);
+    out.at.set(id, p);
+    if (flip.has(id)) {
+      for (const k of low) out.opened.add(k);
+      continue;
+    }
+    for (const k of low) {
+      gone.add(k);
+      alias.set(k, id);
+    }
+    out.groups.set(id, low);
+  }
+  if (out.strips.size === 0) return none;
+  const parent = new Map(c.parent);
+  for (const g of gone) parent.delete(g);
+  const strips = [...out.strips];
+  for (const s of strips) parent.set(s, out.at.get(s)!);
+  return {
+    ...out,
+    cut: {
+      ...c,
+      leaves: [...c.leaves.filter((l) => !gone.has(l)), ...strips].sort(cmp),
+      containers: c.containers.filter((x) => !gone.has(x)),
+      parent,
+      alias,
+    },
+  };
+}
+
+// stripText is a strip's one line and its tooltip: how many packages it sets
+// aside, of which kind, and how many drawn boxes import into it (gap G4: a
+// demoted box can matter, and the count says so without drawing it). The
+// tooltip gives the kinds apart, only when there are two.
+export function stripText(view: View, members: readonly string[], usedBy: number): { label: string; hint?: string } {
+  let name = 0;
+  let generated = 0;
+  for (const m of members) {
+    const t = rollup(view).get(m);
+    name += t?.name ?? 0;
+    generated += t?.generated ?? 0;
+  }
+  const n = name + generated;
+  const kind = generated === 0 ? "tests & tools" : name === 0 ? "generated" : "tests, tools & generated";
+  const label = `${n} ${kind} · used by ${usedBy}`;
+  return name > 0 && generated > 0 ? { label, hint: `${name} tests & tools · ${generated} generated` } : { label };
+}
diff --git a/web/src/layout.ts b/web/src/layout.ts
index 14298e1..ef86319 100644
--- a/web/src/layout.ts
+++ b/web/src/layout.ts
@@ -142,7 +142,8 @@ const PAD_X = 24; // a container's elk.padding, left and right
 // levelIn is the level ranked places each of one set of siblings at.
 const levelIn = (kids: readonly SceneNode[]) => {
   const policy = kids.some((k) => k.rank !== undefined);
-  return (n: SceneNode) => (policy ? n.rank : n.tier) ?? 0;
+  // 12: groups sit below every row (tier -1), Levels or not.
+  return (n: SceneNode) => (n.tier !== undefined && n.tier < 0 ? n.tier : (policy ? n.rank : n.tier) ?? 0);
 };
 
 // levelsOf is every node's level among its siblings, for packed: rows of one
diff --git a/web/src/scene.ts b/web/src/scene.ts
index f3192db..e4f9f3c 100644
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -11,6 +11,7 @@ import { always, quiet, type Dir } from "./edges";
 import { boxStats, statsLine } from "./tree";
 import { shorten } from "./labels";
 import { withinHops } from "./select";
+import { isGroup, isStrip, knownGroup, strip, stripText } from "./group";
 import type { Known, Stage, ViewState } from "./state";
 
 export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";
@@ -24,11 +25,13 @@ export type SceneNode = {
   rowMarks?: string[]; // the Change View class of each method row
   rank?: number; // 07: the Policy rank of a box, rolled up (policy.ts rolledRanks)
   tier?: number; // 11: its architecture rank among its siblings (rank.ts); only the layout reads it
+  hint?: string; // 12: a group's tooltip (group.ts stripText, the fold's names)
   stats?: string; // 11: a box's stats line (tree.ts statsLine); the canvas draws it and layout.ts sizes by it
   hub?: boolean; // 11: at rest, one of the HUBS most used boxes; drawn with a thicker border
   hidden?: ViewEdge[]; // 07: violating imports with both ends inside this node, so no line shows them
   order?: number; // 07: the box's place in the Policy's order; layout.ts draws it before its siblings
   crap?: { risk: Risk; band: Band }; // 08: a box's rolled μ+σ, a function's own CRAP; null = no coverage data
+  demoted?: boolean; // 12: a demoted box, drawn because its strip is open (group.ts)
 };
 export type SceneEdge = {
   id: string; from: string; to: string; pairs: number; members: Bundle["members"];
@@ -62,7 +65,11 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   // 11: the page root opens at home, so the hash keeps no focus for it.
   const focus = s.focus === "" && opts.home ? home(view) : s.focus;
   const depth = s.depth ?? autoDepth(view, focus);
-  const c = cut(view, focus, depth, s.toggled);
+  // 12: demoted boxes wait in a strip at the bottom of their set (group.ts).
+  const grouped = strip(view, cut(view, focus, depth, s.toggled), s.toggled);
+  const c = grouped.cut;
+  const members = (g: string) => grouped.groups.get(g)
+    ?? [...grouped.opened].filter((b) => c.parent.get(b) === grouped.at.get(g));
   let kept = bundlesOver(view, c, { externals: s.externals }).filter((b) => b.pairs >= s.minPairs || pin(b));
   let leaves = new Set([...c.leaves, ...kept.flatMap((b) => [b.from, b.to])]);
   const open = new Set(c.containers);
@@ -83,6 +90,11 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
       const l = toLeaf(id);
       return l === OUTSIDE ? null : l;
     }
+    // 12: a box a group stands for, or one inside it, anchors to the group.
+    for (let x = id; x !== ""; x = index(view).parent.get(x) ?? "") {
+      const g = c.alias?.get(x);
+      if (g !== undefined) return leaves.has(g) ? g : null;
+    }
     return null;
   };
   let selected = s.selected === null ? null : anchor(s.selected);
@@ -128,6 +140,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const label = (id: string, parent: string): string => {
     const named = view.regroup?.label[id]; // 07: a Proposal's layer boxes and their tops
     if (named !== undefined) return named;
+    if (isStrip(id)) return stripText(view, members(id), 0).label;
     if (id === OUTSIDE) return "outside";
     if (id === EXTERNALS) return `${externals} external modules`;
     if (id.endsWith(PKG)) return `${last(id.slice(0, -PKG.length))} (package)`;
@@ -138,6 +151,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     return top ? id.slice(top.length + 1) : id;
   };
   const shape = (id: string): Shape => {
+    if (isGroup(id)) return "chip";
     if (inner.has(id)) return "container";
     if (id === OUTSIDE) return "outside";
     if (id === EXTERNALS || node.get(id)?.kind === "external") return "oval";
@@ -159,7 +173,9 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     };
     n.dim = n.shape !== "container" && !bright(id);
     if (n.shape === "container") n.toggle = "collapse";
+    else if (isStrip(id)) n.toggle = grouped.groups.has(id) ? "expand" : "collapse";
     else if (n.shape === "box" && !folds.has(id) && !id.endsWith(PKG) && childrenOf(view, id).length > 0) n.toggle = "expand";
+    if (grouped.opened.has(id)) n.demoted = true;
     const m = d.lines ? undefined : d.marks.get(id);
     if (m) n.mark = m;
     // A "#pkg" leaf is its own package; any other box rolls up what it holds.
@@ -192,12 +208,15 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   // keeps, drawn or not, so showing or hiding lines never moves a box.
   // A sibling set with a Policy rank is placed by it (layout.ts ranked).
   const byPolicy = new Set(nodes.filter((n) => n.rank !== undefined).map((n) => n.parent));
+  // 12: a strip, and the demoted boxes it opens onto, sit below the rows
+  // and do not rank: what imports them would otherwise climb over them.
+  const bottom = (id: string) => isStrip(id) || grouped.opened.has(id);
   const { tiers, against } = siblingRanks(
-    new Map(nodes.map((n) => [n.id, n.parent])),
+    new Map(nodes.filter((n) => !bottom(n.id)).map((n) => [n.id, n.parent])),
     kept.map((b) => ({ from: shown(b.from), to: shown(b.to), weight: b.pairs })),
     (p) => byPolicy.has(p),
   );
-  for (const n of nodes) n.tier = tiers.get(n.id);
+  for (const n of nodes) n.tier = bottom(n.id) ? -1 : tiers.get(n.id);
 
   // 11: auto draws at rest only what must show when there are too many lines
   // to follow: violations, changed imports, and the imports behind the
@@ -225,7 +244,13 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const byEnds = (x: SceneEdge, y: SceneEdge) => cmp(x.from, y.from) || cmp(x.to, y.to);
   edges.sort(byEnds);
   all.sort(byEnds);
-  connect(view, nodes, kept.map((b) => [shown(b.from), shown(b.to)] as const).filter(([f, t]) => ids.has(f) && ids.has(t)), selected === null);
+  const usedBy = connect(view, nodes, kept.map((b) => [shown(b.from), shown(b.to)] as const).filter(([f, t]) => ids.has(f) && ids.has(t)), selected === null);
+  for (const n of nodes) {
+    if (!isStrip(n.id)) continue;
+    const t = stripText(view, members(n.id), usedBy.get(n.id)?.size ?? 0);
+    n.label = t.label;
+    if (t.hint) n.hint = t.hint;
+  }
   return {
     focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, against, bundles: kept,
     selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
@@ -245,7 +270,7 @@ export const HUBS = 3;
 // ("depends on nothing here") reads uses 0; the Panel lists its externals.
 // At rest the HUBS boxes used by the most (at least one; ties by id) are
 // marked hub: where to start reading.
-function connect(view: View, nodes: SceneNode[], links: readonly (readonly [string, string])[], rest: boolean) {
+function connect(view: View, nodes: SceneNode[], links: readonly (readonly [string, string])[], rest: boolean): Map<string, Set<string>> {
   const aside = new Set(nodes.filter((n) => n.shape === "oval" || n.shape === "outside").map((n) => n.id));
   const uses = new Map<string, Set<string>>();
   const usedBy = new Map<string, Set<string>>();
@@ -263,9 +288,10 @@ function connect(view: View, nodes: SceneNode[], links: readonly (readonly [stri
   for (const n of boxes) {
     n.stats = statsLine({ uses: uses.get(n.id)?.size ?? 0, usedBy: usedBy.get(n.id)?.size ?? 0, packages: boxStats(view, n.id).packages });
   }
-  if (!rest) return;
+  if (!rest) return usedBy;
   const by = (n: SceneNode) => usedBy.get(n.id)?.size ?? 0;
   for (const n of boxes.filter((b) => by(b) > 0).sort((a, b) => by(b) - by(a) || cmp(a.id, b.id)).slice(0, HUBS)) n.hub = true;
+  return usedBy;
 }
 
 // markHidden marks each drawn node that holds both ends of a violating import
@@ -370,7 +396,7 @@ export function fitDepth(requested: Sized & { depth: number }, at: (depth: numbe
 // under zu.policy.yaml, so it never draws a Proposal's.
 export const knownIds = (view: View): Known => ({
   box: (id) => id === "" || isBox(view, id),
-  folder: (id) => !id.endsWith(PKG) && childrenOf(view, id).length > 0,
+  folder: (id) => knownGroup(view, id) || (!id.endsWith(PKG) && childrenOf(view, id).length > 0),
   node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS,
   proposal: (name) => view.kind !== "change" && (view.policy?.proposals?.some((p) => p.name === name) ?? false),
 });
diff --git a/web/src/styles.css b/web/src/styles.css
index cb84917..f29028e 100644
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -375,6 +375,19 @@ button.st-removed {
   line-height: 28px;
   padding: 0 8px;
 }
+/* 12: a group (group.ts) reads as a box set aside: dashed, muted, square. */
+.node.chip.group {
+  border-radius: 6px;
+  line-height: normal;
+  padding: 4px 8px;
+  text-align: left;
+  font-size: 12px;
+  background: var(--container);
+}
+.node.box.demoted {
+  border-style: dashed;
+  color: var(--muted);
+}
 .react-flow__edge.edge-added path {
   stroke: var(--added);
   stroke-width: 2;
```

- [ ] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

- [ ] **Commit** (one line, imperative; stage these files only)

### Task 5: The Budget and the Fold chip

At auto depth, a view with more boxes than the Budget keeps changed and Policy-ordered boxes, then entry points (no project sibling imports it, it holds a package main, it uses a project sibling), then the most hand-written declarations; islands (among project siblings) fold first. The rest fold into one "+N more" chip per sibling set, its names in the tooltip. One rollup per View holds each box's facts, and the keys are computed once before sorting. The Strip's "used by K" counts boxes inside closed chips; a selection inside a chip opens it; the header says how many boxes folded.

**Files:**
- Tests: `web/src/group.test.ts`, `web/src/headline.test.ts`
- Code: `web/src/App.tsx`, `web/src/Header.tsx`, `web/src/cut.ts`, `web/src/edges.ts`, `web/src/group.ts`, `web/src/headline.ts`, `web/src/scene.ts`, `web/src/search.ts`, `web/src/tree.ts`

**Steps:**

- [ ] **Write the failing test**

```diff
diff --git a/web/src/group.test.ts b/web/src/group.test.ts
index 7094a3d..2484782 100644
--- a/web/src/group.test.ts
+++ b/web/src/group.test.ts
@@ -1,8 +1,10 @@
 import { describe, expect, it } from "vitest";
-import { demotedBox, isGroup, STRIP, stripText } from "./group";
+import type { ViewEdge, ViewNode } from "./data";
+import { demotedBox, isGroup, MORE, STRIP, stripText } from "./group";
 import { knownIds, scene } from "./scene";
+import { reveal } from "./search";
 import { DEFAULT_STATE, type ViewState } from "./state";
-import { edge, pkgs, view } from "./testkit";
+import { edge, exts, pkgs, view } from "./testkit";
 
 const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
 
@@ -83,3 +85,125 @@ describe("the demotion strip (12)", () => {
     expect(isGroup(`m${STRIP}`)).toBe(true);
   });
 });
+
+// twenty boxes under m, p00 the smallest; none imports another.
+const many = (extra: (i: number) => Partial<ViewNode> = () => ({}), edges: ViewEdge[] = []) => view(
+  Array.from({ length: 20 }, (_, i) => pkgs([`m/p${String(i).padStart(2, "0")}`], "m", { decls: i + 1, ...extra(i) })[0]),
+  edges,
+);
+const boxes = (sc: { nodes: { id: string; shape: string }[] }) => sc.nodes.filter((n) => n.shape === "box").map((n) => n.id);
+
+describe("the budget fold (12)", () => {
+  it("keeps the budget's boxes and folds the rest of the set into one chip", () => {
+    const sc = at({}, many());
+    expect(boxes(sc)).toHaveLength(15);
+    expect(boxes(sc)).not.toContain("m/p04");
+    const chip = sc.nodes.find((n) => n.id === `m${MORE}`)!;
+    expect(chip.label).toBe("+5 more");
+    expect(chip.shape).toBe("chip");
+    expect(chip.tier).toBe(-1); // in the bottom row, with the strip
+    expect(chip.toggle).toBe("expand");
+  });
+  it("keeps an entry point before bigger boxes, and folds islands first", () => {
+    // p19 uses p00..p17 and holds a package main: an entry point. p18 uses
+    // nothing and nothing uses it: an island, though the biggest.
+    const into = Array.from({ length: 18 }, (_, i) => edge("m/p19", `m/p${String(i).padStart(2, "0")}`));
+    const sc = at({}, many((i) => (i === 19 ? { decls: 1, main: true } : {}), into));
+    expect(boxes(sc)).toContain("m/p19"); // the smallest, but an entry point
+    expect(boxes(sc)).not.toContain("m/p18"); // an island
+    expect(boxes(sc)).toContain("m/p04");
+    expect(boxes(sc)).not.toContain("m/p03");
+    const chip = sc.nodes.find((n) => n.id === `m${MORE}`)!;
+    expect(chip.label).toBe("+5 more");
+    expect(chip.hint).toBe("p00, p01, p02, p03, p18");
+    // Without a package main, nothing makes p19 an entry point: it folds by size.
+    expect(boxes(at({}, many((i) => (i === 19 ? { decls: 1 } : {}), into)))).not.toContain("m/p19");
+  });
+  it("weighs declarations by the hand-written share", () => {
+    // p19, the biggest, is all generated declarations: it counts 0. p18 has
+    // 19, 18 of them generated: it counts 1. Both fold; p03 (4) stays.
+    const sc = at({}, many((i) => (i === 19 ? { genDecls: 20 } : i === 18 ? { genDecls: 18 } : {})));
+    expect(boxes(sc)).not.toContain("m/p19");
+    expect(boxes(sc)).not.toContain("m/p18");
+    expect(boxes(sc)).toContain("m/p03");
+    expect(boxes(sc)).not.toContain("m/p02");
+  });
+  it("counts only project siblings for islands and entry points (M2)", () => {
+    // p18 uses nothing in m but an external module: still an island, and folds.
+    const into = Array.from({ length: 18 }, (_, i) => edge("m/p19", `m/p${String(i).padStart(2, "0")}`));
+    const withExt = (v: ReturnType<typeof many>) => ({ ...v, nodes: [...v.nodes, ...exts(["github.com/x/y"])] });
+    const p1 = withExt(many((i) => (i === 19 ? { decls: 1, main: true } : {}), [...into, edge("m/p18", "github.com/x/y")]));
+    expect(boxes(at({}, p1))).not.toContain("m/p18");
+    // p00, the smallest, a package main that imports only an external: not an entry point.
+    const p2 = withExt(many((i) => (i === 0 ? { main: true } : {}), [edge("m/p00", "github.com/x/y")]));
+    expect(boxes(at({}, p2))).not.toContain("m/p00");
+  });
+  it("keeps what the Policy names and what changed", () => {
+    const named = many();
+    named.policy = { hash: "", levels: [], order: ["m/p00"] };
+    expect(boxes(at({}, named))).toContain("m/p00");
+    const changed = { ...many((i) => (i === 1 ? { status: "modified" } : {})), kind: "change" as const };
+    expect(boxes(at({ focus: "m" }, changed))).toContain("m/p01");
+  });
+  it("reads the budget from the Policy, and never folds one box alone", () => {
+    const v = many();
+    v.policy = { hash: "", levels: [], budget: 18 };
+    expect(boxes(at({}, v))).toHaveLength(18);
+    v.policy.budget = 19;
+    expect(boxes(at({}, v))).toHaveLength(20);
+  });
+  it("folds a set the Policy's Levels place by its Levels; only the order pins", () => {
+    const v = many((i) => ({ rank: i < 10 ? 0 : 1 }));
+    v.policy = { hash: "", levels: [["m/p0*"], ["m/p1*"]], order: ["m/p00"] };
+    const sc = at({}, v);
+    expect(boxes(sc)).toHaveLength(15);
+    expect(boxes(sc)).toContain("m/p00"); // pinned, though the smallest
+    const chip = sc.nodes.find((n) => n.id === `m${MORE}`)!;
+    expect([chip.label, chip.tier]).toEqual(["+5 more", -1]);
+  });
+  it("folds a deep ranking too: a chain of twenty, one box a row", () => {
+    const chain = many(() => ({}), Array.from({ length: 19 }, (_, i) => edge(`m/p${String(i + 1).padStart(2, "0")}`, `m/p${String(i).padStart(2, "0")}`)));
+    const sc = at({}, chain);
+    expect(boxes(sc)).toHaveLength(15);
+    expect(sc.nodes.find((n) => n.id === `m${MORE}`)!.label).toBe("+5 more");
+  });
+  it("folds only at the automatic depth", () => {
+    expect(boxes(at({ depth: 1 }, many()))).toHaveLength(20);
+  });
+  it("counts every box that uses the strip, folded or not (M4)", () => {
+    // p00, p01 and p19 import the demoted m/testdata/a; p00 and p01 fold.
+    const v = many(() => ({}), ["m/p00", "m/p01", "m/p19"].map((f) => edge(f, "m/testdata/a")));
+    v.nodes.push(...pkgs(["m/testdata/a"], "m", { demoted: "name" }));
+    const sc = at({}, v);
+    expect(boxes(sc)).not.toContain("m/p00");
+    expect(sc.nodes.find((n) => n.id === `m${STRIP}`)!.label).toBe("1 tests & tools · used by 3");
+  });
+  it("says how many boxes folded (N9)", () => {
+    expect(at({}, many()).folded).toBe(5);
+    expect(at({ toggled: [`m${MORE}`] }, many()).folded).toBe(0);
+  });
+  it("opens the chip that holds a selected box, and keeps the selection (N3)", () => {
+    const sc = at({ selected: "m/p00" }, many());
+    expect(sc.selected).toBe("m/p00");
+    expect(boxes(sc)).toContain("m/p00");
+    expect(sc.nodes.find((n) => n.id === `m${MORE}`)!.label).toBe("fold 5");
+    // Its toggle closes it again; the selection then stands on the chip.
+    const shut = at({ selected: "m/p00", toggled: [`m${MORE}`] }, many());
+    expect([boxes(shut).includes("m/p00"), shut.selected]).toEqual([false, `m${MORE}`]);
+  });
+  it("opens a chip in place, keeping it to fold the row again", () => {
+    const sc = at({ toggled: [`m${MORE}`] }, many());
+    expect(boxes(sc)).toHaveLength(20);
+    const chip = sc.nodes.find((n) => n.id === `m${MORE}`)!;
+    expect([chip.toggle, chip.label]).toEqual(["collapse", "fold 5"]);
+    expect(knownIds(many()).folder(`m${MORE}`)).toBe(true);
+  });
+});
+
+describe("search reveals a demoted package (12)", () => {
+  it("opens the strip that holds it", () => {
+    const s = reveal(noisy, "m/gen");
+    expect(s.toggled).toEqual([`m${STRIP}`]);
+    expect(ids(scene(noisy, s, { home: true }).nodes)).toContain("m/gen");
+  });
+});
diff --git a/web/src/headline.test.ts b/web/src/headline.test.ts
index 563a381..c60432f 100644
--- a/web/src/headline.test.ts
+++ b/web/src/headline.test.ts
@@ -61,6 +61,8 @@ describe("header", () => {
     expect(depthNote(5, 2, false, 4)).toBe("5 boxes at depth 2 (collapsed from 4). Double-click to open a box, Esc to go up.");
     expect(depthNote(5, 2, false, 2)).toBe("5 boxes at depth 2 (chosen). Double-click to open a box, Esc to go up.");
     expect(depthNote(70, 1)).toBe("70 boxes at depth 1. Double-click to open a box, Esc to go up. More than 60 boxes, drawn anyway.");
+    // 12 (N9): the boxes the Budget folded, when there are any.
+    expect(depthNote(15, 1, true, 1, 20)).toBe("15 boxes at depth 1, 20 boxes folded. Double-click to open a box, Esc to go up.");
   });
 });
 
```

- [ ] **Run:** `cd web && npx vitest run src/group.test.ts` Expected: FAIL (12 tests: 20 boxes drawn, want 15; no chip; no `folded`)

- [ ] **Implement**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index b44c387..1171484 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -249,6 +249,7 @@ export function App({ view: whole }: { view: View }) {
         focus={sc.focus}
         home={homeBox}
         boxes={boxes}
+        folded={sc.folded}
         depth={sc.depth}
         auto={state.depth === null}
         from={requested.depth}
diff --git a/web/src/Header.tsx b/web/src/Header.tsx
index 1c27642..53179e7 100644
--- a/web/src/Header.tsx
+++ b/web/src/Header.tsx
@@ -7,6 +7,7 @@ type Props = {
   focus: string;
   home?: string; // 11: the box the page root draws (cut.ts home)
   boxes: number;
+  folded?: number; // 12: boxes the Budget folded
   depth: number;
   onFocus: (box: string) => void;
   auto: boolean; // the depth is autoDepth's, not the reader's
@@ -17,7 +18,7 @@ type Props = {
   onToggle?: () => void;
 };
 
-export function Header({ view, focus, home = "", boxes, depth, onFocus, auto, from, hidden = 0, against, full, onToggle }: Props) {
+export function Header({ view, focus, home = "", boxes, folded = 0, depth, onFocus, auto, from, hidden = 0, against, full, onToggle }: Props) {
   const compare = view.links?.compare?.startsWith("https://") ? view.links.compare : null;
   const [showErrors, setShowErrors] = useState(false);
   const errors = view.honesty.parseErrors;
@@ -58,7 +59,7 @@ export function Header({ view, focus, home = "", boxes, depth, onFocus, auto, fr
         ))}
       </nav>
       <p className="note">
-        {depthNote(boxes, depth, auto, from)}
+        {depthNote(boxes, depth, auto, from, folded)}
         {hidden > 0 && <span id="zu-edges"> {edgesNote(hidden)}</span>}
         {against !== undefined && against > 0 && <span id="zu-against"> {againstNote(against)}</span>}
         {full !== undefined && (
diff --git a/web/src/cut.ts b/web/src/cut.ts
index 72bf877..413793a 100644
--- a/web/src/cut.ts
+++ b/web/src/cut.ts
@@ -3,7 +3,8 @@ import type { View, ViewNode } from "./data";
 
 export const PKG = "#pkg"; // suffix of the leaf that stands for a container's own package
 export const OUTSIDE = "outside"; // the aggregate for every package outside the focus
-export const BOX_BUDGET = 60;
+// DEPTH_LEAVES is the most leaves autoDepth draws (04); not the Budget (12, group.ts BUDGET).
+export const DEPTH_LEAVES = 60;
 
 type Index = {
   node: Map<string, ViewNode>;
@@ -220,7 +221,7 @@ export function autoDepth(view: View, focus: string): number {
   for (;;) {
     const here = cut(view, focus, d).leaves.length;
     const next = cut(view, focus, d + 1).leaves.length;
-    if (next > BOX_BUDGET || next <= here) return d;
+    if (next > DEPTH_LEAVES || next <= here) return d;
     d++;
   }
 }
diff --git a/web/src/edges.ts b/web/src/edges.ts
index 8e5daad..e40819d 100644
--- a/web/src/edges.ts
+++ b/web/src/edges.ts
@@ -9,7 +9,7 @@ import type { EdgeMode } from "./state";
 // EDGE_LIMIT is the most lines auto draws at rest. Measured on the Test
 // Corpus's default views (11 acceptance): zu 23 and cobra 6 stay drawn, hugo
 // 260 and kubernetes 175 go on demand. At 40 or fewer, over at most 60 boxes
-// (BOX_BUDGET), each line can still be followed from end to end.
+// (DEPTH_LEAVES), each line can still be followed from end to end.
 export const EDGE_LIMIT = 40;
 
 // quiet says auto hides the lines at rest: lines would be drawn (not off, not
diff --git a/web/src/group.ts b/web/src/group.ts
index f6526f8..a356f68 100644
--- a/web/src/group.ts
+++ b/web/src/group.ts
@@ -3,8 +3,8 @@
 //  - the strip ("<parent>#demoted"): the boxes internal/export demoted
 //    (policy.Demoted: tests, tools and samples by name, and generated code),
 //    drawn at the bottom of their set;
-//  - a fold chip ("<parent>#fold:<tier>"): the boxes of one row the budget
-//    left out.
+//  - a fold chip ("<parent>#more"): the boxes of the set the budget left
+//    out, drawn in the bottom row beside the strip.
 // Toggling a group's id (U2's t) opens it in place. The model never authors
 // the graph: a group only stands for boxes the cut drew, and the lines to and
 // from them attach to it (cut.ts leafOf, Cut.alias).
@@ -12,11 +12,10 @@ import { childrenOf, cmp, index, isBox, PKG, type Cut } from "./cut";
 import type { View } from "./data";
 
 export const STRIP = "#demoted";
-export const FOLD = "#fold:";
+export const MORE = "#more";
 
-const FOLD_ID = /#fold:-?\d+$/;
 export const isStrip = (id: string) => id.endsWith(STRIP);
-export const isFold = (id: string) => FOLD_ID.test(id);
+export const isFold = (id: string) => id.endsWith(MORE);
 export const isGroup = (id: string) => isStrip(id) || isFold(id);
 // groupParent is the box whose children a group stands for ("" at the top).
 export const groupParent = (id: string) => id.slice(0, id.lastIndexOf("#"));
@@ -29,7 +28,9 @@ export const knownGroup = (view: View, id: string) => {
 
 // Rollup is what a box holds, summed once per View (like tree.ts boxStats):
 // every grouping question reads it in O(1), never walking the packages again.
-type Rollup = { pkgs: number; name: number; generated: number };
+// decls and gen count declarations (gen: those in generated files, from the
+// IR's per-declaration flag); mains, packages main; changed, any status.
+export type Rollup = { pkgs: number; name: number; generated: number; decls: number; gen: number; mains: number; changed: boolean };
 const rollups = new WeakMap<View, Map<string, Rollup>>();
 
 // rollup counts, per box (and "X#pkg"), its packages and the demoted ones. A
@@ -40,22 +41,29 @@ function rollup(view: View): Map<string, Rollup> {
   if (hit) return hit;
   const ix = index(view);
   const out = new Map<string, Rollup>();
-  const add = (b: string, kind: string | undefined) => {
-    const t = out.get(b) ?? { pkgs: 0, name: 0, generated: 0 };
+  const add = (b: string, p: (typeof ix.pkgs)[number], kind: string | undefined) => {
+    const t = out.get(b) ?? { pkgs: 0, name: 0, generated: 0, decls: 0, gen: 0, mains: 0, changed: false };
     t.pkgs++;
     if (kind === "name") t.name++;
     else if (kind === "generated") t.generated++;
+    t.decls += p.decls ?? 0;
+    t.gen += p.genDecls ?? 0;
+    if (p.main) t.mains++;
+    if (p.status) t.changed = true;
     out.set(b, t);
   };
   for (const p of ix.pkgs) {
     const kind = p.status ? undefined : p.demoted;
-    add(p.id + PKG, kind);
-    for (let b = p.id; b !== ""; b = ix.parent.get(b) ?? "") add(b, kind);
+    add(p.id + PKG, p, kind);
+    for (let b = p.id; b !== ""; b = ix.parent.get(b) ?? "") add(b, p, kind);
   }
   rollups.set(view, out);
   return out;
 }
 
+// factsOf is a box's Rollup (undefined for a box that holds no package).
+export const factsOf = (view: View, box: string): Rollup | undefined => rollup(view).get(box);
+
 // demotedBox: a box is demoted when every package in it is; "name" when any
 // of them is demoted by name, else "generated".
 export function demotedBox(view: View, box: string): "name" | "generated" | undefined {
@@ -70,6 +78,8 @@ export type Grouped = {
   opened: Set<string>; // demoted boxes drawn because their strip is toggled open
   strips: Set<string>; // every strip drawn, closed or open
   at: Map<string, string>; // group leaf → its container in the cut ("" at the top)
+  folds: Set<string>; // every fold chip drawn, closed or open
+  folded: Map<string, string[]>; // fold chip → the boxes it holds, closed or open
 };
 
 // strip replaces, in each sibling set of c, the demoted boxes with one strip,
@@ -77,7 +87,7 @@ export type Grouped = {
 // reader went inside them). Sets are visited from the top, so a demoted
 // container takes what it holds with it.
 export function strip(view: View, c: Cut, toggled: readonly string[]): Grouped {
-  const none: Grouped = { cut: c, groups: new Map(), opened: new Set(), strips: new Set(), at: new Map() };
+  const none: Grouped = { cut: c, groups: new Map(), opened: new Set(), strips: new Set(), at: new Map(), folds: new Set(), folded: new Map() };
   if (c.decls) return none;
   const kids = new Map<string, string[]>();
   for (const id of [...c.leaves, ...c.containers]) {
@@ -149,3 +159,90 @@ export function stripText(view: View, members: readonly string[], usedBy: number
   const label = `${n} ${kind} · used by ${usedBy}`;
   return name > 0 && generated > 0 ? { label, hint: `${name} tests & tools · ${generated} generated` } : { label };
 }
+
+// BUDGET is how many boxes the first view draws before it folds (R4): under
+// Brown's 20 and NDepend's 20 (docx/research/architecture-diagrams.md §5).
+export const BUDGET = 15; // the glossary's Budget; cut.ts DEPTH_LEAVES is autoDepth's limit
+
+export type Keep = {
+  budget: number;
+  arcs: readonly { from: string; to: string }[]; // dependencies between drawn nodes
+  first: (box: string) => boolean; // changed, or named by the Policy: never folded
+  main: (box: string) => boolean; // holds a package main
+  size: (box: string) => number; // hand-written declarations: those not in generated files
+  holds?: (box: string) => boolean; // holds the selection: its chip opens (N3)
+};
+
+// fold keeps at most budget boxes of the cut, in this order: changed and
+// Policy-named boxes; then entry points (no sibling imports it, it holds a
+// package main and it uses a sibling), which would fold by size alone; then
+// by hand-written declarations, ties by id, islands (no sibling uses it and it
+// uses none) after every other box. A sibling is a project box of the same
+// set. In each sibling set the rest fold into one chip, in a row of its own
+// at the bottom, unless it is toggled open or holds the selection (either
+// opens it; both close it); a single box left over stays drawn, as a chip
+// would not save room. One chip per set, not per row: a deep ranking (a ring
+// of 24 boxes ranks one box a row) would leave a box a row, and fold nothing.
+export function fold(g: Grouped, toggled: readonly string[], k: Keep): Grouped {
+  const c = g.cut;
+  const box = (id: string) => !isGroup(id) && !g.opened.has(id);
+  const drawn = c.leaves.filter(box);
+  if (c.decls || drawn.length <= k.budget) return g;
+  // A sibling imports x when an arc into x comes from inside one of x's siblings.
+  const up = (id: string) => c.parent.get(id) ?? "";
+  const imported = new Set<string>();
+  const uses = new Set<string>();
+  const drawnIds = new Set([...c.leaves, ...c.containers]);
+  for (const a of k.arcs) {
+    // Only project boxes are siblings (M2): the outside, the externals oval
+    // and an external module are drawn beside the rows, not in them.
+    if (!drawnIds.has(a.from) || !drawnIds.has(a.to)) continue;
+    for (let f = a.from; f !== ""; f = up(f)) {
+      if (up(f) === up(a.to)) {
+        if (f !== a.to) [imported, uses].forEach((s, i) => s.add(i === 0 ? a.to : f));
+        break;
+      }
+    }
+  }
+  const entry = (id: string) => !imported.has(id) && uses.has(id) && k.main(id);
+  const island = (id: string) => !imported.has(id) && !uses.has(id);
+  // Each key once, not per comparison (B1).
+  const keys = new Map(drawn.map((id) => [id, [k.first(id) ? 0 : 1, entry(id) ? 0 : 1, island(id) ? 1 : 0, -k.size(id)]]));
+  const order = [...drawn].sort((a, b) => {
+    const [x, y] = [keys.get(a)!, keys.get(b)!];
+    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3] || cmp(a, b);
+  });
+  const rows = new Map<string, string[]>(); // chip id → the boxes it would hold
+  const at = new Map<string, string>();
+  for (const id of order.slice(k.budget)) {
+    if (k.first(id)) continue;
+    const p = up(id);
+    const chip = `${p === "" ? c.focus : p}${MORE}`;
+    rows.set(chip, [...(rows.get(chip) ?? []), id]);
+    at.set(chip, p);
+  }
+  const flip = new Set(toggled);
+  const out: Grouped = { ...g, groups: new Map(g.groups), at: new Map(g.at), folds: new Set(g.folds), folded: new Map(g.folded) };
+  const alias = new Map(c.alias ?? []);
+  const gone = new Set<string>();
+  for (const [chip, ids] of [...rows].sort(([a], [b]) => cmp(a, b))) {
+    if (ids.length < 2) continue;
+    out.at.set(chip, at.get(chip)!);
+    out.folds.add(chip);
+    out.folded.set(chip, ids.sort(cmp));
+    // A chip that holds the selection opens (N3); its toggle still flips it.
+    if (flip.has(chip) !== (k.holds !== undefined && ids.some(k.holds))) continue;
+    out.groups.set(chip, ids);
+    for (const id of ids) {
+      gone.add(id);
+      alias.set(id, chip);
+    }
+  }
+  if (out.folds.size === g.folds.size) return g;
+  const parent = new Map(c.parent);
+  for (const id of gone) parent.delete(id);
+  const chips = [...out.folds].filter((f) => !g.folds.has(f));
+  for (const f of chips) parent.set(f, out.at.get(f)!);
+  return { ...out, cut: { ...c, leaves: [...c.leaves.filter((l) => !gone.has(l)), ...chips].sort(cmp), parent, alias } };
+}
+
diff --git a/web/src/headline.ts b/web/src/headline.ts
index 0a758b0..f127223 100644
--- a/web/src/headline.ts
+++ b/web/src/headline.ts
@@ -1,6 +1,6 @@
 // Header text: what the view is, what it leaves out, and where the reader is.
 import type { View } from "./data";
-import { BOX_BUDGET, parentBox } from "./tree";
+import { DEPTH_LEAVES, parentBox } from "./tree";
 
 const PKG = "#pkg";
 
@@ -53,10 +53,12 @@ export function breadcrumb(view: View, focus: string, home = ""): Crumb[] {
 // auto is false when the reader chose the depth (A6), which the note says.
 // from is the requested depth; when a large view was drawn shallower
 // (Deviation 8), the note says that instead.
-export function depthNote(boxes: number, depth: number, auto = true, from = depth): string {
+// folded (12) is how many boxes the Budget folded into "+N more" chips.
+export function depthNote(boxes: number, depth: number, auto = true, from = depth, folded = 0): string {
   const how = from !== depth ? ` (collapsed from ${from})` : auto ? "" : " (chosen)";
-  const note = `${boxes} boxes at depth ${depth}${how}. Double-click to open a box, Esc to go up.`;
-  return boxes > BOX_BUDGET ? `${note} More than ${BOX_BUDGET} boxes, drawn anyway.` : note;
+  const fold = folded > 0 ? `, ${folded} boxes folded` : "";
+  const note = `${boxes} boxes at depth ${depth}${how}${fold}. Double-click to open a box, Esc to go up.`;
+  return boxes > DEPTH_LEAVES ? `${note} More than ${DEPTH_LEAVES} boxes, drawn anyway.` : note;
 }
 
 // edgesNote says what auto left out (11): the lines, and how to see a box's own.
diff --git a/web/src/scene.ts b/web/src/scene.ts
index e4f9f3c..148e1ec 100644
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -1,7 +1,7 @@
 // scene is the one pure function the canvas draws: View + ViewState → nodes and edges.
 import { nodeMark, unchangedCount } from "./change";
 import type { View, ViewEdge } from "./data";
-import { autoDepth, childrenOf, cmp, cut, declsOf, home, index, isBox, leafOf, OUTSIDE, packagesIn, PKG } from "./cut";
+import { autoDepth, childrenOf, cmp, cut, declsOf, home, index, isBox, leafOf, OUTSIDE, packageOf, packagesIn, PKG, within } from "./cut";
 import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
 import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
 import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
@@ -11,7 +11,7 @@ import { always, quiet, type Dir } from "./edges";
 import { boxStats, statsLine } from "./tree";
 import { shorten } from "./labels";
 import { withinHops } from "./select";
-import { isGroup, isStrip, knownGroup, strip, stripText } from "./group";
+import { BUDGET, factsOf, fold, isFold, isGroup, isStrip, knownGroup, strip, stripText } from "./group";
 import type { Known, Stage, ViewState } from "./state";
 
 export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";
@@ -51,6 +51,7 @@ export type Scene = {
   selected: string | null; // the drawn node that stands for the selection
   selectedRow: string | null; // the selected method, drawn as a row of `selected`
   decls: boolean; noDetail: boolean;
+  folded: number; // 12: the boxes closed fold chips hold; the header says so (N9)
 };
 
 // Options for callers other than the Project View: 06 passes pin (violations);
@@ -66,7 +67,39 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const focus = s.focus === "" && opts.home ? home(view) : s.focus;
   const depth = s.depth ?? autoDepth(view, focus);
   // 12: demoted boxes wait in a strip at the bottom of their set (group.ts).
-  const grouped = strip(view, cut(view, focus, depth, s.toggled), s.toggled);
+  let grouped = strip(view, cut(view, focus, depth, s.toggled), s.toggled);
+  // 12: at the automatic depth, a budget of boxes; the rest of each row folds
+  // into a chip, ranked as the rows were before folding (group.ts fold).
+  let before: Map<string, number> | null = null;
+  const into = new Map<string, Set<string>>(); // strip → the boxes that import into it, before folding (M4)
+  if (s.depth === null && !grouped.cut.decls) {
+    const c1 = grouped.cut;
+    const low = (id: string) => isGroup(id) || grouped.opened.has(id);
+    const pre = bundlesOver(view, c1, { externals: s.externals }).filter((b) => b.pairs >= s.minPairs || pin(b));
+    for (const b of pre) if (isStrip(b.to)) into.set(b.to, (into.get(b.to) ?? new Set()).add(b.from));
+    const arcs = pre.filter((b) => !low(b.from) && !low(b.to));
+    const { tiers } = siblingRanks(
+      new Map([...c1.leaves, ...c1.containers].filter((id) => !low(id)).map((id) => [id, c1.parent.get(id) ?? ""])),
+      arcs.map((b) => ({ from: b.from, to: b.to, weight: b.pairs })),
+    );
+    // Pinned boxes (the Policy's order) never fold. Every fact is the box's
+    // Rollup, summed once per View (B1).
+    const named = view.policy?.order ?? [];
+    const own = (id: string) => (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
+    // The selection's package and the boxes above it: the chip holding one opens (N3).
+    const selPkg = s.selected === null ? undefined : packageOf(view, s.selected);
+    const chain = new Set<string>();
+    for (let b = selPkg ?? s.selected ?? ""; b !== ""; b = index(view).parent.get(b) ?? "") chain.add(b);
+    const folded = fold(grouped, s.toggled, {
+      budget: view.policy?.budget ?? BUDGET, arcs,
+      first: (b) => (factsOf(view, b)?.changed ?? false) || named.some((o) => o === own(b) || (!b.endsWith(PKG) && within(view, o, b))),
+      main: (b) => (factsOf(view, b)?.mains ?? 0) > 0,
+      size: (b) => { const f = factsOf(view, b); return f ? f.decls - f.gen : 0; },
+      holds: (b) => (b.endsWith(PKG) ? own(b) === selPkg : chain.has(b)),
+    });
+    if (folded !== grouped) before = tiers;
+    grouped = folded;
+  }
   const c = grouped.cut;
   const members = (g: string) => grouped.groups.get(g)
     ?? [...grouped.opened].filter((b) => c.parent.get(b) === grouped.at.get(g));
@@ -141,6 +174,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     const named = view.regroup?.label[id]; // 07: a Proposal's layer boxes and their tops
     if (named !== undefined) return named;
     if (isStrip(id)) return stripText(view, members(id), 0).label;
+    if (isFold(id)) return grouped.groups.has(id) ? `+${grouped.folded.get(id)!.length} more` : `fold ${grouped.folded.get(id)!.length}`;
     if (id === OUTSIDE) return "outside";
     if (id === EXTERNALS) return `${externals} external modules`;
     if (id.endsWith(PKG)) return `${last(id.slice(0, -PKG.length))} (package)`;
@@ -173,9 +207,13 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     };
     n.dim = n.shape !== "container" && !bright(id);
     if (n.shape === "container") n.toggle = "collapse";
-    else if (isStrip(id)) n.toggle = grouped.groups.has(id) ? "expand" : "collapse";
+    else if (isGroup(id)) n.toggle = grouped.groups.has(id) ? "expand" : "collapse";
     else if (n.shape === "box" && !folds.has(id) && !id.endsWith(PKG) && childrenOf(view, id).length > 0) n.toggle = "expand";
     if (grouped.opened.has(id)) n.demoted = true;
+    if (isFold(id) && grouped.groups.has(id)) {
+      // 12: a closed fold chip names what it holds in its tooltip, as labels drop their shared prefix.
+      n.hint = shorten(grouped.folded.get(id)!.map((b) => b.replace(PKG, ""))).join(", ");
+    }
     const m = d.lines ? undefined : d.marks.get(id);
     if (m) n.mark = m;
     // A "#pkg" leaf is its own package; any other box rolls up what it holds.
@@ -210,13 +248,17 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const byPolicy = new Set(nodes.filter((n) => n.rank !== undefined).map((n) => n.parent));
   // 12: a strip, and the demoted boxes it opens onto, sit below the rows
   // and do not rank: what imports them would otherwise climb over them.
-  const bottom = (id: string) => isStrip(id) || grouped.opened.has(id);
+  // A fold chip joins them, and the boxes left keep the rows they had
+  // before the others folded.
+  const bottom = (id: string) => isGroup(id) || grouped.opened.has(id);
   const { tiers, against } = siblingRanks(
     new Map(nodes.filter((n) => !bottom(n.id)).map((n) => [n.id, n.parent])),
     kept.map((b) => ({ from: shown(b.from), to: shown(b.to), weight: b.pairs })),
     (p) => byPolicy.has(p),
   );
-  for (const n of nodes) n.tier = bottom(n.id) ? -1 : tiers.get(n.id);
+  for (const n of nodes) {
+    n.tier = bottom(n.id) ? -1 : before?.get(n.id) ?? tiers.get(n.id);
+  }
 
   // 11: auto draws at rest only what must show when there are too many lines
   // to follow: violations, changed imports, and the imports behind the
@@ -245,15 +287,26 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   edges.sort(byEnds);
   all.sort(byEnds);
   const usedBy = connect(view, nodes, kept.map((b) => [shown(b.from), shown(b.to)] as const).filter(([f, t]) => ids.has(f) && ids.has(t)), selected === null);
+  // A strip's "used by" counts boxes: a closed fold chip counts as each of
+  // its boxes that imports into the strip (M4).
+  const users = (strip: string) => {
+    const out = new Set<string>();
+    for (const u of usedBy.get(strip) ?? []) {
+      if (isFold(u) && grouped.groups.has(u)) for (const m of grouped.groups.get(u)!) { if (into.get(strip)?.has(m)) out.add(m); }
+      else out.add(u);
+    }
+    return out.size;
+  };
   for (const n of nodes) {
     if (!isStrip(n.id)) continue;
-    const t = stripText(view, members(n.id), usedBy.get(n.id)?.size ?? 0);
+    const t = stripText(view, members(n.id), users(n.id));
     n.label = t.label;
     if (t.hint) n.hint = t.hint;
   }
   return {
     focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, against, bundles: kept,
     selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
+    folded: [...grouped.folds].reduce((n, f) => n + (grouped.groups.get(f)?.length ?? 0), 0),
   };
 }
 
diff --git a/web/src/search.ts b/web/src/search.ts
index e18dcd6..fb5a2d5 100644
--- a/web/src/search.ts
+++ b/web/src/search.ts
@@ -1,5 +1,6 @@
 // U8/A9: find a node by name and the state that shows it.
 import type { NodeKind, View } from "./data";
+import { demotedBox, STRIP } from "./group";
 import { childrenOf, cmp, index, packageOf, parentBox, PKG } from "./cut";
 import { EXTERNALS } from "./bundle";
 import { scene } from "./scene";
@@ -38,7 +39,11 @@ export function reveal(view: View, id: string, from: ViewState = DEFAULT_STATE):
   const n = index(view).node.get(id);
   if (!n) return from;
   const reset = { ...from, toggled: [] as string[], hops: null, minPairs: 1, externals: true };
-  if (n.kind === "package") return { ...reset, focus: parentBox(view, id), depth: 1, selected: id };
+  if (n.kind === "package") {
+    // 12: a demoted package waits in its strip, so the strip opens.
+    const focus = parentBox(view, id);
+    return { ...reset, focus, depth: 1, selected: id, toggled: demotedBox(view, id) ? [focus + STRIP] : [] };
+  }
   if (n.kind === "external") {
     const s = { ...reset, focus: "", depth: null, selected: id };
     return scene(view, s).nodes.some((x) => x.id === id) ? s : { ...s, selected: EXTERNALS };
diff --git a/web/src/tree.ts b/web/src/tree.ts
index dee0df8..268359e 100644
--- a/web/src/tree.ts
+++ b/web/src/tree.ts
@@ -2,7 +2,7 @@
 import type { View, ViewNode } from "./data";
 import { index, PKG } from "./cut";
 
-export { BOX_BUDGET, OUTSIDE, parentBox } from "./cut";
+export { DEPTH_LEAVES, OUTSIDE, parentBox } from "./cut";
 export { EXTERNALS } from "./bundle";
 
 export type BoxStats = { packages: number; decls: number; unresolved: number };
```

- [ ] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

- [ ] **Commit** (one line, imperative; stage these files only)

### Task 6: At most 7 rows, merged bottom-up

`capRows` renumbers a set's tiers into at most 7 rows, groups' row included, counting only ranks that still hold a box; `byOwnTier` orders a merged row by own tier, drawn as any row. The Panel names a merged box's own rank (`rankNote`).

**Files:**
- Tests: `web/src/group.test.ts`, `web/src/layout.test.ts`
- Code: `web/src/App.tsx`, `web/src/Panel.tsx`, `web/src/group.ts`, `web/src/layout.ts`, `web/src/scene.ts`

**Steps:**

- [ ] **Write the failing test**

```diff
diff --git a/web/src/group.test.ts b/web/src/group.test.ts
index 2484782..5703959 100644
--- a/web/src/group.test.ts
+++ b/web/src/group.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from "vitest";
 import type { ViewEdge, ViewNode } from "./data";
-import { demotedBox, isGroup, MORE, STRIP, stripText } from "./group";
+import { capRows, demotedBox, isGroup, MORE, rankNote, STRIP, stripText } from "./group";
 import { knownIds, scene } from "./scene";
 import { reveal } from "./search";
 import { DEFAULT_STATE, type ViewState } from "./state";
@@ -166,6 +166,8 @@ describe("the budget fold (12)", () => {
     const sc = at({}, chain);
     expect(boxes(sc)).toHaveLength(15);
     expect(sc.nodes.find((n) => n.id === `m${MORE}`)!.label).toBe("+5 more");
+    // six rows of boxes and the bottom row of the chip: seven.
+    expect(new Set(sc.nodes.map((n) => n.tier)).size).toBe(7);
   });
   it("folds only at the automatic depth", () => {
     expect(boxes(at({ depth: 1 }, many()))).toHaveLength(20);
@@ -207,3 +209,36 @@ describe("search reveals a demoted package (12)", () => {
     expect(ids(scene(noisy, s, { home: true }).nodes)).toContain("m/gen");
   });
 });
+
+describe("the row cap (12)", () => {
+  it("counts only the ranks that still hold a box (N2)", () => {
+    // Ranks the fold emptied are not rows: two ranks left fit.
+    expect(capRows([3, 0, 0, 0, 0, 0, 0, 0, 1])).toBeNull();
+    // Nine live ranks under a cap of 6 fill all 6 rows, not 5.
+    const rows = capRows([1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1], 6)!;
+    const live = [0, 1, 2, 3, 4, 5, 6, 7, 13].map((i) => rows[i]);
+    expect(Math.max(...live)).toBe(5);
+    expect(live).toEqual([...live].sort((x, y) => x - y)); // still bottom-up
+  });
+  it("leaves seven rows or fewer alone", () => {
+    expect(capRows([1, 1, 1, 1, 1, 1, 1])).toBeNull();
+    // The Panel keeps a merged box's own rank; a group has none.
+    expect(rankNote(3)).toBe("rank 3 in its set before rows merged (0 = depends on nothing here)");
+    expect([rankNote(undefined), rankNote(-1)]).toEqual([null, null]);
+  });
+  it("merges adjacent rows from the bottom, balanced by boxes", () => {
+    // nine rows of one box: the lowest four pair up, the rest keep a row each.
+    expect(capRows([1, 1, 1, 1, 1, 1, 1, 1, 1])).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 6]);
+    // a heavy bottom row stays alone; the light ones above it merge.
+    expect(capRows([9, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5, 6]);
+  });
+  it("draws a chain of nine at most seven rows, each box keeping its own row as its own tier", () => {
+    const chain = view(pkgs(Array.from({ length: 9 }, (_, i) => `m/c${i}`), "m"),
+      Array.from({ length: 8 }, (_, i) => edge(`m/c${i + 1}`, `m/c${i}`)));
+    const sc = at({}, chain);
+    const tier = (id: string) => sc.nodes.find((n) => n.id === id)!;
+    expect(new Set(sc.nodes.map((n) => n.tier)).size).toBe(7);
+    expect([tier("m/c0").tier, tier("m/c1").tier, tier("m/c8").tier]).toEqual([0, 0, 6]);
+    expect([tier("m/c0").ownTier, tier("m/c1").ownTier]).toEqual([0, 1]);
+  });
+});
diff --git a/web/src/layout.test.ts b/web/src/layout.test.ts
index 1e9c814..9c7f00a 100644
--- a/web/src/layout.test.ts
+++ b/web/src/layout.test.ts
@@ -298,3 +298,16 @@ describe("superseding", () => {
     expect(made.map((f) => f.stopped)).toEqual([true, false]);
   });
 });
+
+// 12: a set of more than MAX_ROWS ranks merges rows; a merged row reads its
+// higher own tier first, and is drawn as any row: no rule between its ranks.
+describe("merged rows (12)", () => {
+  it("orders a merged row by own tier", async () => {
+    const chain = view(pkgs(Array.from({ length: 9 }, (_, i) => `m/c${i}`), "m"),
+      Array.from({ length: 8 }, (_, i) => edge(`m/c${i + 1}`, `m/c${i}`)));
+    const sc = scene(chain, DEFAULT_STATE, { home: true });
+    const a = await layout(sc, elk);
+    expect(a.get("m/c0")!.y).toBe(a.get("m/c1")!.y);
+    expect(a.get("m/c1")!.x).toBeLessThan(a.get("m/c0")!.x);
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/group.test.ts src/layout.test.ts` Expected: FAIL (`capRows is not a function`; a chain of twenty draws 16 rows; a merged row is not ordered by own tier)

- [ ] **Implement**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index 1171484..8202a33 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -9,7 +9,7 @@ import { pageEngine } from "./engine";
 import { Header } from "./Header";
 import { redLegend, violationsNote } from "./headline";
 import { keyAction } from "./keys";
-import { arrange, elkGraph, headers, levelsOf, orderOf, Superseded, type Placed } from "./layout";
+import { arrange, ownTiersOf, elkGraph, headers, levelsOf, orderOf, Superseded, type Placed } from "./layout";
 import { Panel } from "./Panel";
 import { pinFor } from "./policy";
 import { PROPOSAL_NOTICE, proposalView } from "./proposal";
@@ -176,6 +176,7 @@ export function App({ view: whole }: { view: View }) {
   const order = useMemo(() => orderOf(sc), [sc]);
   // 11: likewise each node's level: graph holds the rows ranked made.
   const levels = useMemo(() => levelsOf(sc), [sc]);
+  const ownTiers = useMemo(() => ownTiersOf(sc), [sc]); // 12: a merged row's order
   const [placed, setPlaced] = useState<{ graph: string; at: Map<string, Placed> } | null>(null);
   const [failed, setFailed] = useState<string | null>(null);
   useEffect(() => {
@@ -185,7 +186,7 @@ export function App({ view: whole }: { view: View }) {
       (out) => {
         performance.mark("zu-layout-end");
         setFailed(null);
-        setPlaced({ graph: graph + "\n" + heads, at: arrange(out, order, new Map(JSON.parse(heads) as [string, number][]), levels) });
+        setPlaced({ graph: graph + "\n" + heads, at: arrange(out, order, new Map(JSON.parse(heads) as [string, number][]), levels, ownTiers) });
       },
       (e: Error) => {
         if (!(e instanceof Superseded)) setFailed(e.message);
@@ -358,6 +359,7 @@ export function App({ view: whole }: { view: View }) {
           bundles={sc.bundles}
           hidden={sc.nodes.find((n) => n.id === sc.selected)?.hidden}
           crap={sc.nodes.find((n) => n.id === sc.selected)?.crap?.risk}
+          ownTier={sc.nodes.find((n) => n.id === sc.selected)?.ownTier}
           onReveal={jump}
           onClose={() => choose(null)}
         />
diff --git a/web/src/Panel.tsx b/web/src/Panel.tsx
index 827e4ec..b23664b 100644
--- a/web/src/Panel.tsx
+++ b/web/src/Panel.tsx
@@ -2,7 +2,7 @@ import { useEffect, useRef } from "react";
 import type { Bundle } from "./bundle";
 import type { Hunk, Loc, View, ViewEdge, ViewNode } from "./data";
 import { calls, imports, targets, type Row } from "./facts";
-import { isGroup, isStrip } from "./group";
+import { isGroup, isStrip, rankNote } from "./group";
 import { linkFor } from "./links";
 import { crapFacts, type Risk } from "./metrics";
 import type { SceneEdge } from "./scene";
@@ -19,6 +19,7 @@ type Props = {
   bundles: Bundle[]; // the scene's bundles: an aggregate's real targets come from them
   hidden?: ViewEdge[]; // 07: violating imports inside the selected box, drawn as no line
   crap?: Risk; // 08: the selected box's CRAP as the scene rolled it up
+  ownTier?: number; // 12: the selected box's rank before the row cap merged its row
   onReveal: (id: string) => void;
   onClose: () => void;
 };
@@ -217,7 +218,7 @@ function Crap({ view, id, box, onReveal }: { view: View; id: string; box?: Risk;
   );
 }
 
-export function Panel({ view, id, edge, bundles, hidden, crap, onReveal, onClose }: Props) {
+export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, onReveal, onClose }: Props) {
   const title = edge ? `${edge.from} → ${edge.to}` : (id ?? "");
   const node = id === null ? undefined : view.nodes.find((n) => n.id === (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id));
   let body: React.ReactNode;
@@ -269,6 +270,7 @@ export function Panel({ view, id, edge, bundles, hidden, crap, onReveal, onClose
         <p className="muted">
           {s.packages} packages · {s.decls} declarations · {s.unresolved} unresolved calls
         </p>
+        {rankNote(ownTier) && <p className="muted">{rankNote(ownTier)}</p>}
         <Rows title="Imports" rows={f.out} onReveal={onReveal} />
         <Rows title="Imported by" rows={f.in} onReveal={onReveal} />
       </>
diff --git a/web/src/group.ts b/web/src/group.ts
index a356f68..7c3910f 100644
--- a/web/src/group.ts
+++ b/web/src/group.ts
@@ -246,3 +246,60 @@ export function fold(g: Grouped, toggled: readonly string[], k: Keep): Grouped {
   return { ...out, cut: { ...c, leaves: [...c.leaves.filter((l) => !gone.has(l)), ...chips].sort(cmp), parent, alias } };
 }
 
+
+// rankNote is what the Panel says of a box whose set the row cap merged: its
+// own rank, which the merged row no longer shows (0 = depends on nothing here).
+export const rankNote = (ownTier: number | undefined): string | null =>
+  ownTier === undefined || ownTier < 0 ? null : `rank ${ownTier} in its set before rows merged (0 = depends on nothing here)`;
+
+// MAX_ROWS is the most rows one sibling set is drawn in (R3).
+export const MAX_ROWS = 7;
+
+// capRows merges the rows of one sibling set, given as its box count per row
+// from the bottom, into at most max: the row each merges into, or null when
+// they fit. Rows merge with their neighbours from the bottom up, where the
+// dependencies are, and no merged row holds more boxes than it must: the
+// least capacity that fits (binary search), filled bottom-up, with each row
+// left keeping its own once the rows left can hold them one each. A rank the
+// fold emptied is not a row (N2): only ranks that hold a box count, and an
+// empty one maps to the row of the live rank below it.
+export function capRows(counts: readonly number[], max = MAX_ROWS): number[] | null {
+  const live = counts.flatMap((c, i) => (c > 0 ? [i] : []));
+  if (live.length <= max) return null;
+  const rows = capLive(live.map((i) => counts[i]), max);
+  const out: number[] = [];
+  let at = 0;
+  for (let i = 0; i < counts.length; i++) {
+    const k = live.indexOf(i);
+    if (k >= 0) at = rows[k];
+    out.push(at);
+  }
+  return out;
+}
+
+function capLive(counts: readonly number[], max: number): number[] {
+  const n = counts.length;
+  const pack = (cap: number): number[] => {
+    const row: number[] = [];
+    let at = 0;
+    let sum = 0;
+    for (let i = 0; i < n; i++) {
+      const open = i > 0 && row[i - 1] === at;
+      if (open && (sum + counts[i] > cap || n - i <= max - at - 1)) {
+        at++;
+        sum = 0;
+      }
+      row.push(at);
+      sum += counts[i];
+    }
+    return row;
+  };
+  let lo = 1; // a row heavier than the capacity keeps a row of its own
+  let hi = counts.reduce((a, b) => a + b, 0);
+  while (lo < hi) {
+    const mid = Math.floor((lo + hi) / 2);
+    if (pack(mid)[n - 1] < max) hi = mid;
+    else lo = mid + 1;
+  }
+  return pack(lo);
+}
diff --git a/web/src/layout.ts b/web/src/layout.ts
index ef86319..741558b 100644
--- a/web/src/layout.ts
+++ b/web/src/layout.ts
@@ -90,7 +90,8 @@ export function elkGraph(sc: Scene): ElkNode {
     else byParent.set(n.parent, [n]);
   }
   const last = Number.MAX_SAFE_INTEGER;
-  for (const l of byParent.values()) l.sort((a, b) => (a.order ?? last) - (b.order ?? last));
+  // 12: a merged row wraps by own tier, the higher first, as byOwnTier places it.
+  for (const l of byParent.values()) l.sort((a, b) => (a.order ?? last) - (b.order ?? last) || (b.ownTier ?? 0) - (a.ownTier ?? 0));
   const rank = sc.nodes.some((n) => n.rank !== undefined || n.tier !== undefined) ? ranked(byParent) : null;
   const build = (n: SceneNode): ElkNode => {
     if (n.shape !== "container") {
@@ -234,10 +235,36 @@ export function positions(g: ElkNode): Map<string, Placed> {
 // Policy's order, packed. The page (App) and layout both use it.
 export const arrange = (
   out: ElkNode, order: ReadonlyMap<string, number>, header: ReadonlyMap<string, number>, levels: ReadonlyMap<string, number> = new Map(),
-) => packed(inOrder(positions(out), order), header, levels);
+  ownTiers: ReadonlyMap<string, number> = new Map(),
+) => packed(byOwnTier(inOrder(positions(out), order), ownTiers), header, levels);
 
 export const layout = async (sc: Scene, engine: Engine) =>
-  arrange(await engine.layout(elkGraph(sc)), orderOf(sc), headers(sc), levelsOf(sc));
+  arrange(await engine.layout(elkGraph(sc)), orderOf(sc), headers(sc), levelsOf(sc), ownTiersOf(sc));
+
+// ownTiersOf is each node's rank before the row cap merged its row (12).
+export const ownTiersOf = (sc: Scene): ReadonlyMap<string, number> =>
+  new Map(sc.nodes.flatMap((n) => (n.ownTier === undefined ? [] : [[n.id, n.ownTier] as const])));
+
+// byOwnTier re-places each row of siblings that holds nodes of more than one
+// own tier (12, a merged row), as inOrder does: the higher own tier first, so the row
+// still reads down from left to right, and ELK's order inside one own tier.
+export function byOwnTier(placed: Map<string, Placed>, ownTiers: ReadonlyMap<string, number>): Map<string, Placed> {
+  if (ownTiers.size === 0) return placed;
+  const out = new Map(placed);
+  for (const ids of siblings(placed).values()) {
+    for (const row of rowsOf(ids, placed)) {
+      if (new Set(row.map((id) => ownTiers.get(id))).size < 2) continue;
+      let x = Math.min(...row.map((id) => placed.get(id)!.x));
+      row.sort((a, b) => (ownTiers.get(b) ?? -1) - (ownTiers.get(a) ?? -1) || placed.get(a)!.x - placed.get(b)!.x || cmp(a, b));
+      for (const id of row) {
+        const p = placed.get(id)!;
+        out.set(id, { ...p, x });
+        x += p.w + GAP;
+      }
+    }
+  }
+  return out;
+}
 
 // headers is the least width of each container: its label and badges. ELK
 // never sees it, so a page keys its layout on it as well as on elkGraph.
diff --git a/web/src/scene.ts b/web/src/scene.ts
index 148e1ec..9f7372a 100644
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -11,7 +11,7 @@ import { always, quiet, type Dir } from "./edges";
 import { boxStats, statsLine } from "./tree";
 import { shorten } from "./labels";
 import { withinHops } from "./select";
-import { BUDGET, factsOf, fold, isFold, isGroup, isStrip, knownGroup, strip, stripText } from "./group";
+import { BUDGET, capRows, factsOf, fold, isFold, isGroup, isStrip, knownGroup, MAX_ROWS, strip, stripText } from "./group";
 import type { Known, Stage, ViewState } from "./state";
 
 export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";
@@ -26,6 +26,7 @@ export type SceneNode = {
   rank?: number; // 07: the Policy rank of a box, rolled up (policy.ts rolledRanks)
   tier?: number; // 11: its architecture rank among its siblings (rank.ts); only the layout reads it
   hint?: string; // 12: a group's tooltip (group.ts stripText, the fold's names)
+  ownTier?: number; // 12: its rank before the row cap merged it into tier (group.ts capRows)
   stats?: string; // 11: a box's stats line (tree.ts statsLine); the canvas draws it and layout.ts sizes by it
   hub?: boolean; // 11: at rest, one of the HUBS most used boxes; drawn with a thicker border
   hidden?: ViewEdge[]; // 07: violating imports with both ends inside this node, so no line shows them
@@ -259,6 +260,18 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   for (const n of nodes) {
     n.tier = bottom(n.id) ? -1 : before?.get(n.id) ?? tiers.get(n.id);
   }
+  // 12: at most MAX_ROWS rows in a set the Policy does not place, the
+  // bottom row of groups counted; a box keeps its rank as its own tier, which
+  // orders a merged row (layout.ts).
+  const low = new Set(nodes.filter((n) => n.tier === -1).map((n) => n.parent));
+  const rowSets = new Map<string, SceneNode[]>();
+  for (const n of nodes) if (!byPolicy.has(n.parent) && n.tier !== undefined && n.tier >= 0) rowSets.set(n.parent, [...(rowSets.get(n.parent) ?? []), n]);
+  for (const set of rowSets.values()) {
+    const top = Math.max(...set.map((n) => n.tier!));
+    const counts = Array.from({ length: top + 1 }, (_, t) => set.filter((n) => n.tier === t).length);
+    const rows = capRows(counts, MAX_ROWS - (low.has(set[0].parent) ? 1 : 0));
+    if (rows) for (const n of set) [n.ownTier, n.tier] = [n.tier, rows[n.tier!]];
+  }
 
   // 11: auto draws at rest only what must show when there are too many lines
   // to follow: violations, changed imports, and the imports behind the
```

- [ ] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

- [ ] **Commit** (one line, imperative; stage these files only)

### Task 7: Open the root module in place

With two or more modules, the page root opens the module at the repository root in place; up from inside it is the page root, and its toggle closes it with its own token (`<module>#closed`), so an old link's `t=<module>` keeps its meaning. At the page root that module's children are kept first by the Budget and counted against it; only its islands fold (the lead's ruling on the `plugin` conflict).

**Files:**
- Tests: `web/src/cut.test.ts`, `web/src/group.test.ts`
- Code: `web/src/Canvas.tsx`, `web/src/cut.ts`, `web/src/group.ts`, `web/src/scene.ts`

**Steps:**

- [ ] **Write the failing test**

```diff
diff --git a/web/src/cut.test.ts b/web/src/cut.test.ts
index 1c17840..eb17cf4 100644
--- a/web/src/cut.test.ts
+++ b/web/src/cut.test.ts
@@ -36,7 +36,7 @@ describe("home (11)", () => {
     expect(upTo(h, "x.io/m/pkg")).toBeNull(); // nor at home named by a link
     expect(upTo(h, "x.io/m/pkg/a")).toBe(""); // home's children go to the page root
     expect(upTo(h, "x.io/m/pkg/a/x")).toBe("x.io/m/pkg/a"); // below that, as 05 did
-    expect(upTo(shop, "ex/shop/internal")).toBe("ex/shop"); // no home: as 05 did
+    expect(upTo(shop, "ex/shop/internal")).toBe(""); // 12: ex/shop, the root module, opens in place at the page root
     expect(upTo(shop, "ex/shop")).toBe("");
   });
 });
diff --git a/web/src/group.test.ts b/web/src/group.test.ts
index 5703959..2feb131 100644
--- a/web/src/group.test.ts
+++ b/web/src/group.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from "vitest";
 import type { ViewEdge, ViewNode } from "./data";
 import { capRows, demotedBox, isGroup, MORE, rankNote, STRIP, stripText } from "./group";
+import { ROOT_CLOSED, rootModule, upTo } from "./cut";
 import { knownIds, scene } from "./scene";
 import { reveal } from "./search";
 import { DEFAULT_STATE, type ViewState } from "./state";
@@ -242,3 +243,63 @@ describe("the row cap (12)", () => {
     expect([tier("m/c0").ownTier, tier("m/c1").ownTier]).toEqual([0, 1]);
   });
 });
+
+// k8s's pattern: the repository's own module at the root, and modules nested
+// under it (staging).
+const nested = view([
+  { id: "k/cmd", kind: "package", module: "k", loc: { path: "cmd/main.go", line: 1 }, main: true },
+  { id: "k/pkg/a", kind: "package", module: "k", loc: { path: "pkg/a/a.go", line: 1 } },
+  { id: "k/pkg/b", kind: "package", module: "k", loc: { path: "pkg/b/b.go", line: 1 } },
+  { id: "api/v1", kind: "package", module: "api", loc: { path: "staging/src/api/v1/t.go", line: 1 } },
+  { id: "api/v2", kind: "package", module: "api", loc: { path: "staging/src/api/v2/t.go", line: 1 } },
+  { id: "client", kind: "package", module: "client", loc: { path: "staging/src/client/c.go", line: 1 } },
+], [edge("k/cmd", "k/pkg/a"), edge("k/pkg/a", "api/v1"), edge("client", "api/v1")]);
+
+describe("the root module opens in place (12)", () => {
+  it("finds the module at the repository root when others are nested", () => {
+    expect(rootModule(nested)).toBe("k");
+    expect(rootModule(view(pkgs(["m/a", "m/b"], "m")))).toBeNull();
+    expect(rootModule(view([...pkgs(["a/x"], "a"), ...pkgs(["b/y"], "b")]))).toBeNull(); // no module at the root
+  });
+  it("draws it open at the page root, above the modules it uses", () => {
+    const sc = scene(nested, { ...DEFAULT_STATE, depth: 1 }, { home: true });
+    expect(sc.focus).toBe("");
+    const k = sc.nodes.find((n) => n.id === "k")!;
+    expect(k.shape).toBe("container");
+    expect(ids(sc.nodes)).toEqual(expect.arrayContaining(["k/cmd", "k/pkg", "api", "client"]));
+    expect(k.tier).toBeGreaterThan(sc.nodes.find((n) => n.id === "api")!.tier!);
+  });
+  it("closes by its own token, and never opens in a Change View", () => {
+    const at1 = (toggled: string[]) => scene(nested, { ...DEFAULT_STATE, depth: 1, toggled }, { home: true }).nodes.find((n) => n.id === "k")!;
+    expect(at1([`k${ROOT_CLOSED}`]).shape).toBe("box");
+    // Its toggle flips that token, open or closed.
+    expect([at1([]).toggle, at1([]).toggleId]).toEqual(["collapse", `k${ROOT_CLOSED}`]);
+    expect([at1([`k${ROOT_CLOSED}`]).toggle, at1([`k${ROOT_CLOSED}`]).toggleId]).toEqual(["expand", `k${ROOT_CLOSED}`]);
+    expect(knownIds(nested).folder(`k${ROOT_CLOSED}`)).toBe(true);
+    const change = { ...nested, kind: "change" as const };
+    expect(scene(change, { ...DEFAULT_STATE, depth: 1 }, { home: true }).nodes.find((n) => n.id === "k")!.shape).toBe("box");
+  });
+  it("keeps its children, however small, and folds the islands among them", () => {
+    // Twenty staging modules in a chain, each bigger than k/a; k/i1 and k/i2,
+    // the biggest, use nothing in k and nothing in k uses them: islands.
+    const kid = (id: string, decls: number, main = false): ViewNode =>
+      ({ id, kind: "package", module: "k", decls, main, loc: { path: `${id.slice(2)}/x.go`, line: 1 } });
+    const mods = Array.from({ length: 20 }, (_, i) => `s${String(i).padStart(2, "0")}`);
+    const v = view([
+      kid("k/cmd", 5, true), kid("k/a", 1), kid("k/i1", 900), kid("k/i2", 900),
+      ...mods.map((m): ViewNode => ({ id: m, kind: "package", module: m, decls: 100, loc: { path: `staging/${m}/x.go`, line: 1 } })),
+    ], [edge("k/cmd", "k/a"), edge("k/a", "s00"), ...mods.slice(1).map((m, i) => edge(m, mods[i]))]);
+    const sc = at({}, v);
+    expect(boxes(sc)).toEqual(expect.arrayContaining(["k/cmd", "k/a"])); // the root module's, though the smallest
+    expect(boxes(sc)).toHaveLength(15); // they count against the budget
+    const chip = sc.nodes.find((n) => n.id === `k${MORE}`)!;
+    expect([chip.label, chip.hint]).toEqual(["+2 more", "i1, i2"]);
+  });
+  it("keeps an old link's t=<root module> meaning: open in place (N10)", () => {
+    expect(scene(nested, { ...DEFAULT_STATE, depth: 1, toggled: ["k"] }, { home: true }).nodes.find((n) => n.id === "k")!.shape).toBe("container");
+  });
+  it("goes up from inside it to the page root", () => {
+    expect(upTo(nested, "k/pkg")).toBe("");
+    expect(upTo(nested, "k")).toBe("");
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/group.test.ts src/cut.test.ts` Expected: FAIL (`rootModule is not a function`; `upTo` from inside the root module is not the page root)

- [ ] **Implement**

```diff
diff --git a/web/src/Canvas.tsx b/web/src/Canvas.tsx
index 9d02dd7..b538369 100644
--- a/web/src/Canvas.tsx
+++ b/web/src/Canvas.tsx
@@ -68,7 +68,7 @@ function Toggle({ data }: { data: Data }) {
       aria-label={open ? `Open ${node.label} here` : `Close ${node.label}`}
       onClick={(e) => {
         e.stopPropagation();
-        toggle(node.id);
+        toggle(node.toggleId ?? node.id);
       }}
     >
       {open ? "+" : "−"}
diff --git a/web/src/cut.ts b/web/src/cut.ts
index 413793a..0a806ea 100644
--- a/web/src/cut.ts
+++ b/web/src/cut.ts
@@ -206,12 +206,14 @@ export function home(view: View): string {
 // upTo is where Esc and "Go back one level" go from focus (11): nowhere
 // (null) at the page root or at home, the page root from home's children, and
 // the parent box elsewhere, as 05 did. So going up never lands on a root that
-// differs from home only by the boxes home descends through.
+// differs from home only by the boxes home descends through. 12: the root
+// module opens in place at the page root (rootModule), so up from inside it
+// is the page root too.
 export function upTo(view: View, focus: string): string | null {
   const h = home(view);
   if (focus === "" || focus === h) return null;
   const p = parentBox(view, focus);
-  return p === h ? "" : p;
+  return p === h || (h === "" && view.kind !== "change" && p === rootModule(view)) ? "" : p;
 }
 
 // autoDepth: start at 1 and go deeper while the next level has ≤ 60 leaves and
@@ -225,3 +227,25 @@ export function autoDepth(view: View, focus: string): number {
     d++;
   }
 }
+
+// ROOT_CLOSED, after the root module's id, is the toggle that closes it at the
+// page root (N10): a pre-12 link's t=<root module> meant "open it in place",
+// which is now the default, so that toggle keeps meaning open.
+export const ROOT_CLOSED = "#closed";
+
+// rootModule is the module at the repository's root when other modules are
+// nested under it (R5: kubernetes and its staging modules), or null. A
+// package's directory (from its file) less its path below its module is the
+// module's directory; "." is the root. The page root opens it in place.
+export function rootModule(view: View): string | null {
+  if (view.modules.length < 2) return null;
+  for (const p of index(view).pkgs) {
+    const m = p.module;
+    if (!m || (p.id !== m && !p.id.startsWith(m + "/"))) continue;
+    const below = p.id === m ? "" : p.id.slice(m.length + 1);
+    const slash = p.loc.path.lastIndexOf("/");
+    const dir = slash < 0 ? "." : p.loc.path.slice(0, slash);
+    if (below === "" ? dir === "." : dir === below) return m;
+  }
+  return null;
+}
diff --git a/web/src/group.ts b/web/src/group.ts
index 7c3910f..0408ba5 100644
--- a/web/src/group.ts
+++ b/web/src/group.ts
@@ -168,13 +168,15 @@ export type Keep = {
   budget: number;
   arcs: readonly { from: string; to: string }[]; // dependencies between drawn nodes
   first: (box: string) => boolean; // changed, or named by the Policy: never folded
+  root: (box: string) => boolean; // a child of the opened root module: never folded unless an island
   main: (box: string) => boolean; // holds a package main
   size: (box: string) => number; // hand-written declarations: those not in generated files
   holds?: (box: string) => boolean; // holds the selection: its chip opens (N3)
 };
 
 // fold keeps at most budget boxes of the cut, in this order: changed and
-// Policy-named boxes; then entry points (no sibling imports it, it holds a
+// Policy-named boxes, and the opened root module's children that are not
+// islands; then entry points (no sibling imports it, it holds a
 // package main and it uses a sibling), which would fold by size alone; then
 // by hand-written declarations, ties by id, islands (no sibling uses it and it
 // uses none) after every other box. A sibling is a project box of the same
@@ -206,8 +208,11 @@ export function fold(g: Grouped, toggled: readonly string[], k: Keep): Grouped {
   }
   const entry = (id: string) => !imported.has(id) && uses.has(id) && k.main(id);
   const island = (id: string) => !imported.has(id) && !uses.has(id);
+  // The opened root module's children are what the reader came to see:
+  // kept first, counted against the budget; its islands still fold.
+  const held = (id: string) => k.first(id) || (k.root(id) && !island(id));
   // Each key once, not per comparison (B1).
-  const keys = new Map(drawn.map((id) => [id, [k.first(id) ? 0 : 1, entry(id) ? 0 : 1, island(id) ? 1 : 0, -k.size(id)]]));
+  const keys = new Map(drawn.map((id) => [id, [held(id) ? 0 : 1, entry(id) ? 0 : 1, island(id) ? 1 : 0, -k.size(id)]]));
   const order = [...drawn].sort((a, b) => {
     const [x, y] = [keys.get(a)!, keys.get(b)!];
     return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3] || cmp(a, b);
@@ -215,7 +220,7 @@ export function fold(g: Grouped, toggled: readonly string[], k: Keep): Grouped {
   const rows = new Map<string, string[]>(); // chip id → the boxes it would hold
   const at = new Map<string, string>();
   for (const id of order.slice(k.budget)) {
-    if (k.first(id)) continue;
+    if (held(id)) continue;
     const p = up(id);
     const chip = `${p === "" ? c.focus : p}${MORE}`;
     rows.set(chip, [...(rows.get(chip) ?? []), id]);
diff --git a/web/src/scene.ts b/web/src/scene.ts
index 9f7372a..a59b615 100644
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -1,7 +1,7 @@
 // scene is the one pure function the canvas draws: View + ViewState → nodes and edges.
 import { nodeMark, unchangedCount } from "./change";
 import type { View, ViewEdge } from "./data";
-import { autoDepth, childrenOf, cmp, cut, declsOf, home, index, isBox, leafOf, OUTSIDE, packageOf, packagesIn, PKG, within } from "./cut";
+import { autoDepth, childrenOf, cmp, cut, declsOf, home, index, isBox, leafOf, OUTSIDE, packageOf, packagesIn, PKG, ROOT_CLOSED, rootModule, within } from "./cut";
 import { bundlesOver, EXTERNALS, externalsOf, type Bundle } from "./bundle";
 import { declutter, NO_PINS, type Mark, type Pin } from "./declutter";
 import { crapBand, packageRisk, rolledCrap, type Band, type Risk } from "./metrics";
@@ -19,6 +19,7 @@ export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";
 export type SceneNode = {
   id: string; label: string; parent: string; shape: Shape;
   dim: boolean; selected: boolean; toggle?: "expand" | "collapse";
+  toggleId?: string; // 12: the id the toggle flips when not the node's own (the root module's ROOT_CLOSED)
   methods: string[]; // method rows of a type, empty once the stage hides members
   mark?: Mark; // incoming/outgoing triangles, when lines are hidden
   change?: string; // the Change View class (change.ts nodeMark, or "has-change")
@@ -68,7 +69,13 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
   const focus = s.focus === "" && opts.home ? home(view) : s.focus;
   const depth = s.depth ?? autoDepth(view, focus);
   // 12: demoted boxes wait in a strip at the bottom of their set (group.ts).
-  let grouped = strip(view, cut(view, focus, depth, s.toggled), s.toggled);
+  // 12 (R5): at the page root, the repository's own module opens in place
+  // among the modules nested in it; toggling it closes it.
+  const root = focus === "" && opts.home && view.kind !== "change" && depth <= 1 ? rootModule(view) : null;
+  const shut = root !== null && s.toggled.includes(root + ROOT_CLOSED);
+  const flips = root === null || s.toggled.includes(root) ? s.toggled
+    : shut ? s.toggled.filter((t) => t !== root + ROOT_CLOSED) : [...s.toggled, root];
+  let grouped = strip(view, cut(view, focus, depth, flips), s.toggled);
   // 12: at the automatic depth, a budget of boxes; the rest of each row folds
   // into a chip, ranked as the rows were before folding (group.ts fold).
   let before: Map<string, number> | null = null;
@@ -83,8 +90,10 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
       new Map([...c1.leaves, ...c1.containers].filter((id) => !low(id)).map((id) => [id, c1.parent.get(id) ?? ""])),
       arcs.map((b) => ({ from: b.from, to: b.to, weight: b.pairs })),
     );
-    // Pinned boxes (the Policy's order) never fold. Every fact is the box's
-    // Rollup, summed once per View (B1).
+    // Pinned boxes (the Policy's order) never fold, nor the children of the
+    // root module drawn open at the page root, however it opened. Every fact
+    // is the box's Rollup, summed once per View (B1).
+    const rm = focus === "" && view.kind !== "change" ? rootModule(view) : null;
     const named = view.policy?.order ?? [];
     const own = (id: string) => (id.endsWith(PKG) ? id.slice(0, -PKG.length) : id);
     // The selection's package and the boxes above it: the chip holding one opens (N3).
@@ -94,6 +103,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     const folded = fold(grouped, s.toggled, {
       budget: view.policy?.budget ?? BUDGET, arcs,
       first: (b) => (factsOf(view, b)?.changed ?? false) || named.some((o) => o === own(b) || (!b.endsWith(PKG) && within(view, o, b))),
+      root: (b) => rm !== null && c1.parent.get(b) === rm,
       main: (b) => (factsOf(view, b)?.mains ?? 0) > 0,
       size: (b) => { const f = factsOf(view, b); return f ? f.decls - f.gen : 0; },
       holds: (b) => (b.endsWith(PKG) ? own(b) === selPkg : chain.has(b)),
@@ -210,6 +220,7 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     if (n.shape === "container") n.toggle = "collapse";
     else if (isGroup(id)) n.toggle = grouped.groups.has(id) ? "expand" : "collapse";
     else if (n.shape === "box" && !folds.has(id) && !id.endsWith(PKG) && childrenOf(view, id).length > 0) n.toggle = "expand";
+    if (id === root && n.toggle) n.toggleId = root + ROOT_CLOSED;
     if (grouped.opened.has(id)) n.demoted = true;
     if (isFold(id) && grouped.groups.has(id)) {
       // 12: a closed fold chip names what it holds in its tooltip, as labels drop their shared prefix.
@@ -462,7 +473,8 @@ export function fitDepth(requested: Sized & { depth: number }, at: (depth: numbe
 // under zu.policy.yaml, so it never draws a Proposal's.
 export const knownIds = (view: View): Known => ({
   box: (id) => id === "" || isBox(view, id),
-  folder: (id) => knownGroup(view, id) || (!id.endsWith(PKG) && childrenOf(view, id).length > 0),
+  folder: (id) => knownGroup(view, id) || (!id.endsWith(PKG) && childrenOf(view, id).length > 0)
+    || (id.endsWith(ROOT_CLOSED) && id.slice(0, -ROOT_CLOSED.length) === rootModule(view)),
   node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS,
   proposal: (name) => view.kind !== "change" && (view.policy?.proposals?.some((p) => p.name === name) ?? false),
 });
```

- [ ] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

- [ ] **Commit** (one line, imperative; stage these files only)

### Task 8: Path-role badges and "entry points"

Badges under a box's stats line, 16 px taller: `cmd` on a command's directory or a box at least half commands, `internal`, `gen N%` (declarations in generated files) from 20 %. The axis's top label reads "entry points" when every box of the top row holds a program. Both read the per-View rollup.

**Files:**
- Tests: `web/src/group.test.ts`, `web/src/layout.test.ts`
- Code: `web/src/Canvas.tsx`, `web/src/group.ts`, `web/src/layout.ts`, `web/src/scene.ts`, `web/src/styles.css`

**Steps:**

- [ ] **Write the failing test**

```diff
diff --git a/web/src/group.test.ts b/web/src/group.test.ts
index 2feb131..cbd0492 100644
--- a/web/src/group.test.ts
+++ b/web/src/group.test.ts
@@ -303,3 +303,42 @@ describe("the root module opens in place (12)", () => {
     expect(upTo(nested, "k")).toBe("");
   });
 });
+
+const roles = view([
+  ...pkgs(["m/cmd/tool"], "m", { main: true }),
+  ...pkgs(["m/internal/x"], "m", { genDecls: 3, decls: 3 }),
+  ...pkgs(["m/internal/y", "m/lib"], "m", { decls: 1 }),
+  // one command among three packages; half commands; a 10 % generated share.
+  ...pkgs(["m/svc/a", "m/half/a"], "m", { main: true }),
+  ...pkgs(["m/svc/b", "m/svc/c", "m/half/b"], "m"),
+  ...pkgs(["m/lowgen/g"], "m", { genDecls: 1, decls: 1 }),
+  // half its declarations generated, in one package (M1: counted per declaration).
+  ...pkgs(["m/mixed"], "m", { genDecls: 5, decls: 10 }),
+  ...pkgs(["m/lowgen/h"], "m", { decls: 9 }),
+], [edge("m/cmd/tool", "m/lib"), edge("m/cmd/tool", "m/internal/y")]);
+
+describe("path-role badges (12)", () => {
+  const badges = (sc: { nodes: { id: string; badges?: string[] }[] }, id: string) => sc.nodes.find((n) => n.id === id)!.badges;
+  it("names a box's role unless its own name says it, and its generated share", () => {
+    const sc = scene(roles, { ...DEFAULT_STATE, depth: 1 }, { home: true });
+    expect(badges(sc, "m/cmd")).toBeUndefined(); // "cmd" is its name
+    expect(badges(sc, "m/internal")).toEqual(["gen 75%"]);
+    expect(badges(sc, "m/lib")).toBeUndefined();
+    const inner = scene(roles, { ...DEFAULT_STATE, focus: "m/internal" }, { home: true });
+    expect(badges(inner, "m/internal/x")).toEqual(["internal", "gen 100%"]);
+    const tool = scene(roles, { ...DEFAULT_STATE, focus: "m/cmd" }, { home: true });
+    expect(badges(tool, "m/cmd/tool")).toEqual(["cmd"]);
+  });
+  it("says cmd only of a command's directory or a box half commands, and gen from 20 %", () => {
+    const sc = scene(roles, { ...DEFAULT_STATE, depth: 1 }, { home: true });
+    expect(badges(sc, "m/svc")).toBeUndefined(); // one package main of three
+    expect(badges(sc, "m/half")).toEqual(["cmd"]);
+    expect(badges(sc, "m/lowgen")).toBeUndefined(); // gen 10 %
+    expect(badges(sc, "m/mixed")).toEqual(["gen 50%"]);
+  });
+  it("calls the top row entry points only when every box in it holds a program", () => {
+    expect(scene(roles, { ...DEFAULT_STATE, depth: 1 }, { home: true }).entry).toBe(true);
+    const flat = { ...roles, edges: [] };
+    expect(scene(flat, { ...DEFAULT_STATE, depth: 1 }, { home: true }).entry).toBe(false);
+  });
+});
diff --git a/web/src/layout.test.ts b/web/src/layout.test.ts
index 9c7f00a..440f0ee 100644
--- a/web/src/layout.test.ts
+++ b/web/src/layout.test.ts
@@ -53,6 +53,11 @@ describe("layout", () => {
       expect(sizeOf({ ...box, label: "mount-utils", stats: line }).w).toBe(Math.max(90, Math.ceil(textWidth(line) + INSET)));
     }
   });
+  it("gives a box's role badges a line of their own (12)", () => {
+    const box = { id: "x", parent: "", shape: "box" as const, dim: false, selected: false, methods: [], label: "x" };
+    expect(sizeOf({ ...box, badges: ["cmd", "gen 40%"] }).h).toBe(56);
+    expect(sizeOf(box).h).toBe(40);
+  });
   it("triangles sit on the top and bottom edges, apex out (uml-viewer)", () => {
     expect(triangles(100, 40)).toEqual({ in: "50,-10.39 44,0 56,0", out: "44,40 56,40 50,50.39" });
   });
```

- [ ] **Run:** `cd web && npx vitest run src/group.test.ts src/layout.test.ts` Expected: FAIL (4 tests: no badges, no `entry`, a badged box is not taller)

- [ ] **Implement**

```diff
diff --git a/web/src/Canvas.tsx b/web/src/Canvas.tsx
index b538369..5a5f8e0 100644
--- a/web/src/Canvas.tsx
+++ b/web/src/Canvas.tsx
@@ -121,6 +121,11 @@ function BoxNode({ data, selected }: NodeProps<ZNode>) {
       <Toggle data={data} />
       <div className="label">{data.node.label}</div>
       {data.node.stats && <div className="stats">{data.node.stats}</div>}
+      {data.node.badges && (
+        <div className="badges">
+          {data.node.badges.map((b) => <span key={b} className="badge">{b}</span>)}
+        </div>
+      )}
       <Marks data={data} />
     </div>
   );
@@ -318,8 +323,10 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
       {/* 11: what the rows mean. Higher rows use lower ones (ranked, rank.ts);
           the bottom rank uses none of its siblings. Nothing more is promised:
           longest-path ranks do not lift a box nothing uses to the top. */}
-      <div className="axis" role="note" aria-label="Rows: a box uses the rows below it; at the bottom, boxes that depend on nothing here">
+      <div className="axis" role="note" aria-label={`Rows: ${sc.entry ? "the top row holds the entry points; " : ""}a box uses the rows below it; at the bottom, boxes that depend on nothing here`}>
         <span className="uses">
+          {/* 12 (R6): named only when every box of the top row holds a program. */}
+          {sc.entry && <span className="v entry">entry points</span>}
           <span className="v">uses</span>
           <span>↓</span>
         </span>
diff --git a/web/src/group.ts b/web/src/group.ts
index 0408ba5..f431264 100644
--- a/web/src/group.ts
+++ b/web/src/group.ts
@@ -30,7 +30,8 @@ export const knownGroup = (view: View, id: string) => {
 // every grouping question reads it in O(1), never walking the packages again.
 // decls and gen count declarations (gen: those in generated files, from the
 // IR's per-declaration flag); mains, packages main; changed, any status.
-export type Rollup = { pkgs: number; name: number; generated: number; decls: number; gen: number; mains: number; changed: boolean };
+// module (12, Task 8) is its first package's, for path roles.
+export type Rollup = { pkgs: number; name: number; generated: number; decls: number; gen: number; mains: number; changed: boolean; module: string };
 const rollups = new WeakMap<View, Map<string, Rollup>>();
 
 // rollup counts, per box (and "X#pkg"), its packages and the demoted ones. A
@@ -42,7 +43,7 @@ function rollup(view: View): Map<string, Rollup> {
   const ix = index(view);
   const out = new Map<string, Rollup>();
   const add = (b: string, p: (typeof ix.pkgs)[number], kind: string | undefined) => {
-    const t = out.get(b) ?? { pkgs: 0, name: 0, generated: 0, decls: 0, gen: 0, mains: 0, changed: false };
+    const t = out.get(b) ?? { pkgs: 0, name: 0, generated: 0, decls: 0, gen: 0, mains: 0, changed: false, module: p.module ?? "" };
     t.pkgs++;
     if (kind === "name") t.name++;
     else if (kind === "generated") t.generated++;
@@ -308,3 +309,39 @@ function capLive(counts: readonly number[], max: number): number[] {
   }
   return pack(lo);
 }
+
+// roleOf reads a box's path roles (R6) from its packages and its path below
+// its module: whether it holds a program (a package main, or a cmd
+// directory), whether it is one (a cmd directory or its child, or at least
+// half its packages main), an internal/ package, and the share of its
+// declarations in generated files (M1: per declaration, from the IR). It reads
+// the box's Rollup, so it walks no packages (B1).
+function roleOf(view: View, box: string) {
+  const own = box.endsWith(PKG) ? box.slice(0, -PKG.length) : box;
+  const f = factsOf(view, box) ?? { pkgs: 0, decls: 0, gen: 0, mains: 0, module: "" };
+  const segs = own.startsWith(f.module + "/") ? own.slice(f.module.length + 1).split("/") : [];
+  return {
+    name: own.slice(own.lastIndexOf("/") + 1),
+    program: f.mains > 0 || segs.includes("cmd"),
+    cmd: segs.at(-1) === "cmd" || segs.at(-2) === "cmd" || 2 * f.mains >= Math.max(1, f.pkgs),
+    internal: segs.includes("internal"),
+    generated: f.decls === 0 ? 0 : f.gen / f.decls,
+  };
+}
+
+// GEN_MIN is the least generated share a badge names.
+export const GEN_MIN = 0.2;
+
+// badgesOf are a box's role badges, drawn under its stats line; a badge its
+// own name already says is left out, and a generated share under GEN_MIN.
+export function badgesOf(view: View, box: string): string[] {
+  const r = roleOf(view, box);
+  const out: string[] = [];
+  if (r.cmd && r.name !== "cmd") out.push("cmd");
+  if (r.internal && r.name !== "internal") out.push("internal");
+  if (r.generated >= GEN_MIN) out.push(`gen ${Math.round(100 * r.generated)}%`);
+  return out;
+}
+
+// holdsProgram: the box holds a package main or a cmd directory (R6's entry points).
+export const holdsProgram = (view: View, box: string) => roleOf(view, box).program;
diff --git a/web/src/layout.ts b/web/src/layout.ts
index 741558b..2c1f5a9 100644
--- a/web/src/layout.ts
+++ b/web/src/layout.ts
@@ -44,8 +44,10 @@ export const INSET = 18;
 // clipped: a long name makes a wide box.
 export function sizeOf(n: SceneNode): { w: number; h: number } {
   const label = textWidth(n.label) + (n.rank !== undefined ? 18 : 0) + (n.toggle ? 22 : 0);
-  const text = Math.max(label, textWidth(n.stats ?? ""), ...n.methods.map((r) => (r.length + 2) * MONO));
-  return { w: Math.max(90, Math.ceil(text + INSET)), h: 40 + ROW * n.methods.length };
+  const badges = (n.badges ?? []).reduce((w, b) => w + textWidth(b) + 12, 0); // 12: each padded, 4 px apart
+  const text = Math.max(label, textWidth(n.stats ?? ""), badges, ...n.methods.map((r) => (r.length + 2) * MONO));
+  // 12: role badges take a line under the stats, 16 px at 11 px type.
+  return { w: Math.max(90, Math.ceil(text + INSET)), h: 40 + ROW * n.methods.length + (n.badges?.length ? 16 : 0) };
 }
 
 // containerWidth is the least a container is drawn: its label, its rank
diff --git a/web/src/scene.ts b/web/src/scene.ts
index a59b615..7978a41 100644
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -11,7 +11,7 @@ import { always, quiet, type Dir } from "./edges";
 import { boxStats, statsLine } from "./tree";
 import { shorten } from "./labels";
 import { withinHops } from "./select";
-import { BUDGET, capRows, factsOf, fold, isFold, isGroup, isStrip, knownGroup, MAX_ROWS, strip, stripText } from "./group";
+import { badgesOf, BUDGET, capRows, factsOf, fold, holdsProgram, isFold, isGroup, isStrip, knownGroup, MAX_ROWS, strip, stripText } from "./group";
 import type { Known, Stage, ViewState } from "./state";
 
 export type Shape = "container" | "box" | "oval" | "decl" | "outside" | "chip";
@@ -34,6 +34,7 @@ export type SceneNode = {
   order?: number; // 07: the box's place in the Policy's order; layout.ts draws it before its siblings
   crap?: { risk: Risk; band: Band }; // 08: a box's rolled μ+σ, a function's own CRAP; null = no coverage data
   demoted?: boolean; // 12: a demoted box, drawn because its strip is open (group.ts)
+  badges?: string[]; // 12: its path roles, drawn under the stats line (group.ts badgesOf)
 };
 export type SceneEdge = {
   id: string; from: string; to: string; pairs: number; members: Bundle["members"];
@@ -49,6 +50,7 @@ export type Scene = {
   all: SceneEdge[]; // 11: every edge the cut could draw, drawn or not; the canvas draws a hovered box's from here
   hidden: number; // 11: the lines auto leaves out at rest (edges.ts); 0 when every line is drawn
   against: number; // 11: dependencies that run against the rows (rank.ts siblingRanks); the header counts them
+  entry: boolean; // 12: every box of the top row holds a program, so the axis names it entry points
   bundles: Bundle[]; // the leaf bundles behind the edges, for the panel
   selected: string | null; // the drawn node that stands for the selection
   selectedRow: string | null; // the selected method, drawn as a row of `selected`
@@ -226,6 +228,10 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
       // 12: a closed fold chip names what it holds in its tooltip, as labels drop their shared prefix.
       n.hint = shorten(grouped.folded.get(id)!.map((b) => b.replace(PKG, ""))).join(", ");
     }
+    if (n.shape === "box" && !c.decls) {
+      const b = badgesOf(view, id);
+      if (b.length) n.badges = b;
+    }
     const m = d.lines ? undefined : d.marks.get(id);
     if (m) n.mark = m;
     // A "#pkg" leaf is its own package; any other box rolls up what it holds.
@@ -327,8 +333,13 @@ export function scene(view: View, s: ViewState, opts: SceneOptions = {}): Scene
     n.label = t.label;
     if (t.hint) n.hint = t.hint;
   }
+  // 12 (R6): the top row is the entry points when every box in it holds a program.
+  const tops = nodes.filter((n) => n.parent === "" && (n.tier ?? -1) >= 0);
+  const high = Math.max(...tops.map((n) => n.tier!));
+  const topRow = tops.filter((n) => n.tier === high);
+  const entry = !c.decls && topRow.length > 0 && topRow.every((n) => (n.shape === "box" || n.shape === "container") && holdsProgram(view, n.id));
   return {
-    focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, against, bundles: kept,
+    focus, depth, stage: s.stage, lines: d.lines && !hush, nodes: nodes.sort((x, y) => cmp(x.id, y.id)), edges, all, hidden, against, entry, bundles: kept,
     selected, selectedRow: row?.selectedRow ?? selectedRow, decls: c.decls, noDetail: c.noDetail,
     folded: [...grouped.folds].reduce((n, f) => n + (grouped.groups.get(f)?.length ?? 0), 0),
   };
diff --git a/web/src/styles.css b/web/src/styles.css
index f29028e..0c6b2f9 100644
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -375,6 +375,25 @@ button.st-removed {
   line-height: 28px;
   padding: 0 8px;
 }
+/* 12: a box's path roles (group.ts badgesOf), under its stats line. */
+.badges {
+  display: flex;
+  gap: 4px;
+  margin-top: 2px;
+}
+.badge {
+  font-size: 11px;
+  line-height: 14px;
+  padding: 0 4px;
+  border-radius: 3px;
+  background: var(--container);
+  color: var(--muted);
+  white-space: nowrap;
+}
+.axis .entry {
+  font-weight: 600;
+  margin-bottom: 6px;
+}
 /* 12: a group (group.ts) reads as a box set aside: dashed, muted, square. */
 .node.chip.group {
   border-radius: 6px;
```

- [ ] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

- [ ] **Commit** (one line, imperative; stage these files only)

### Task 9: The browser suite

Seven checks in three engines on two new fixtures (`grouped.html`: 3 demoted packages and budget 12; `chain.html`: a chain of nine): fold (its header count), fold opened by a click, strip (its line and tooltip), strip opened by a click, the row cap, the root module in place, and a chip opened at 1280 × 720. Two of 11's checks change: `overview` sees no minimap (the cap makes `big` fit; `firstView` still asserts the minimap) and `changeRest` expects "15 boxes at depth 2, 10 boxes folded". A selected group survives a reload.

**Files:**
- Tests: `web/e2e/accept.mjs`, `web/src/group.test.ts`
- Code: `web/src/scene.ts`

**Steps:**

- [ ] **Write the failing test**

```diff
diff --git a/web/e2e/accept.mjs b/web/e2e/accept.mjs
index dbf797f..83e99f5 100644
--- a/web/e2e/accept.mjs
+++ b/web/e2e/accept.mjs
@@ -113,6 +113,20 @@ write("crap-change.html", page({
     funcs: {},
   },
 }));
+// 12: big.html's 24 groups, two testdata packages and a generated one, and a
+// Policy budget of 12; m/g00/p0 imports one testdata package.
+const noise = [["m/testdata/a", "name"], ["m/testdata/b", "name"], ["m/zz_generated", "generated"]];
+write("grouped.html", page({
+  ...shop, modules: ["m"], sources: {}, policy: { hash: "sha256:e2e", levels: [], budget: 12 },
+  nodes: [...bigNodes, ...noise.map(([id, demoted]) => ({ ...pkg(id, "m"), demoted }))],
+  edges: [...edges, imp("m/g00/p0", "m/testdata/a")],
+}));
+// 12: a chain of nine, c8 a program: nine ranks drawn in seven rows.
+const chain = Array.from({ length: 9 }, (_, i) => `m/c${i}`);
+write("chain.html", page({
+  ...shop, modules: ["m"], sources: {}, edges: chain.slice(1).map((id, i) => imp(id, chain[i])),
+  nodes: chain.map((id) => ({ ...pkg(id, "m"), ...(id === "m/c8" ? { main: true } : {}) })),
+}));
 
 const base = "file://" + dir + "/";
 const vp = (p) => p.locator(".react-flow__viewport").getAttribute("style");
@@ -296,7 +310,7 @@ async function run(b) {
   await p.getByRole("button", { name: "Show full project" }).click({ timeout: 5000 }).catch(() => {});
   await settle(p);
   out.changeRest = [
-    await p.locator("header").innerText().then((t) => /\d+ boxes at depth \d+/.exec(t)?.[0] ?? ""),
+    await p.locator("header").innerText().then((t) => /\d+ boxes at depth \d+(, \d+ boxes folded)?/.exec(t)?.[0] ?? ""),
     await p.locator(".react-flow__edge").count(),
     await p.locator(".react-flow__edge.edge-mixed, .react-flow__edge.edge-added").count(),
   ];
@@ -434,6 +448,67 @@ async function run(b) {
   await p.locator("#zu-status", { hasText: "Layout failed" }).waitFor({ timeout: 15000 }).catch(() => {});
   out.blocked = await p.locator("#zu-status").textContent().catch(() => null);
   await p.close();
+  // 12: the first view's grouping, at 1600 × 1000.
+  p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
+  const rows = () => p.evaluate(() => {
+    const top = [...document.querySelectorAll(".react-flow__node")].filter((n) => !n.querySelector(".node.container") && !n.closest(".react-flow__node-container"));
+    return new Set(top.map((n) => Math.round(n.getBoundingClientRect().top))).size;
+  });
+  const boxCount = () => p.locator(".react-flow__node .node.box").count();
+  await p.goto(base + "big.html");
+  await drawn(p);
+  await settle(p);
+  await p.locator(".react-flow__controls-fitview").click();
+  await settle(p);
+  const chips = await p.locator(".node.chip.group .label").allTextContents();
+  out.fold = [await boxCount(), chips.length > 0 && chips.every((t) => /^\+\d+ more$/.test(t)), (await rows()) <= 7,
+    await p.locator("header").innerText().then((t) => /\d+ boxes folded/.exec(t)?.[0] ?? "")];
+  await p.locator(".react-flow__node:has(.node.chip.group)").first().click(); // 12 (N4): one click opens a group
+  await settle(p);
+  out.foldOpen = [(await hash(p)).includes("t=m#more"), await p.locator(".node.chip.group .label").first().textContent().then((t) => /^fold \d+$/.test(t))];
+  await p.goto(base + "grouped.html");
+  await p.reload();
+  await drawn(p);
+  await settle(p);
+  await p.locator(".react-flow__controls-fitview").click();
+  await settle(p);
+  const strip = p.locator(".react-flow__node[data-id='m#demoted']");
+  out.strip = [await boxCount(), await strip.locator(".label").textContent(), await strip.locator(".node").getAttribute("title")];
+  await strip.click();
+  await settle(p);
+  out.stripOpen = [await hash(p), await p.locator(".react-flow__node[data-id='m/testdata'] .node.demoted").count()];
+  await p.goto(base + "chain.html");
+  await p.reload();
+  await drawn(p);
+  await settle(p);
+  out.rowCap = [await rows(),
+    await p.locator(".axis .entry").textContent().catch(() => null), await p.locator(".react-flow__node[data-id='m/c8'] .badge").allTextContents()];
+  // with.html: example.com/shop sits at the repository root with a nested
+  // module, so the page root opens it in place; Esc from inside it comes back.
+  await p.goto(base + "with.html");
+  await drawn(p);
+  await settle(p);
+  const shopOpen = await p.locator(".react-flow__node-container[data-id='example.com/shop']").count();
+  await p.goto(base + "with.html#f=example.com/shop/internal");
+  await p.reload();
+  await drawn(p);
+  await settle(p);
+  await p.keyboard.press("Escape");
+  await settle(p);
+  out.rootOpen = [shopOpen, await hash(p)];
+  await p.close();
+  // 12 (N4): at 1280 × 720 the Panel opens over the canvas after a click, so
+  // a group opens on one click, not a double-click.
+  p = await b.newPage({ viewport: { width: 1280, height: 720 } });
+  await p.goto(base + "big.html");
+  await drawn(p);
+  await settle(p);
+  await p.locator(".react-flow__controls-fitview").click();
+  await settle(p);
+  await p.locator(".react-flow__node:has(.node.chip.group)").first().click();
+  await settle(p);
+  out.foldNarrow = [(await hash(p)).includes("t=m#more"), await p.locator(".node.chip.group .label").first().textContent()];
+  await p.close();
   out.errors = errors;
   return out;
 }
@@ -462,7 +537,8 @@ const want = {
   errors: [],
   // 07
   ranks: ["m/cmd 2", "m/internal 1", "m/internal/cli 1", "m/internal/ir 0"],
-  overview: ["144 dependencies hidden; select or hover a box to see its own.", 0, true, true, true, 0, 1],
+  // 12: 24 boxes in at most seven rows fit the first view: no minimap.
+  overview: ["144 dependencies hidden; select or hover a box to see its own.", 0, true, true, true, 0, 0],
   firstView: [0, 3, 0, 0, 1],
   // big.html's 24 groups form a ring, each using the next 6: in any row order the
   // arcs that wrap round run against it, 1 + 2 + … + 6 = 21 at the least.
@@ -471,7 +547,8 @@ const want = {
   keyboard: [0, 1, true, 6, 6],
   narrowMap: [0, 1],
   policyRest: [1, 1],
-  changeRest: ["25 boxes at depth 2", 1, 1],
+  // 12: the full project at the auto depth folds to the budget; m/g02, changed, shows.
+  changeRest: ["15 boxes at depth 2, 10 boxes folded", 1, 1],
   redBox: ["d=1: m/internal", "full:  / 1 0", "arrows:  / 1 0", "triangles:  / 0 2", "elements:  / 1 0", "classes:  / 1 0"],
   panel: ["Violations inside (1)", "levels m/internal/ir/bad → m/internal/cli"],
   proposal: ["#p=Hexagon", "PROPOSAL — not instantiated in code: Hexagon", "violates Proposal Hexagon's layers; a red box holds one"],
@@ -494,6 +571,14 @@ const want = {
   crapChange: [true, true],
   crapChangeBox: ["35 high", "Worst CRAP μ+σ among drawn: 35, grade 1.0 of 10"],
   noCrap: [0, 0],
+  // 12
+  fold: [15, true, true, "10 boxes folded"],
+  foldOpen: [true, true],
+  strip: [12, "3 tests, tools & generated · used by 1", "2 tests & tools · 1 generated"], // the kinds apart in the tooltip
+  stripOpen: ["#t=m#demoted&s=m#demoted", 1], // one click opens it and selects it
+  rowCap: [7, "entry points", ["cmd"]], // a merged row draws no rule between its ranks
+  rootOpen: [1, "#s=example.com/shop/internal"], // up to the page root, the box left selected
+  foldNarrow: [true, "fold 10"],
 };
 
 const channel = process.env.ZU_E2E_CHANNEL;
diff --git a/web/src/group.test.ts b/web/src/group.test.ts
index cbd0492..c0f5b27 100644
--- a/web/src/group.test.ts
+++ b/web/src/group.test.ts
@@ -83,6 +83,7 @@ describe("the demotion strip (12)", () => {
   it("lets a hash name a strip as a toggle", () => {
     expect(knownIds(noisy).folder(`m${STRIP}`)).toBe(true);
     expect(knownIds(noisy).folder(`nope${STRIP}`)).toBe(false);
+    expect(knownIds(noisy).node(`m${STRIP}`)).toBe(true); // a selected group survives a reload
     expect(isGroup(`m${STRIP}`)).toBe(true);
   });
 });
```

- [ ] **Run:** `cd web && npx vitest run src/group.test.ts` Expected: FAIL (a group id is not a known node)

- [ ] **Implement**

```diff
diff --git a/web/src/scene.ts b/web/src/scene.ts
index 7978a41..41116b6 100644
--- a/web/src/scene.ts
+++ b/web/src/scene.ts
@@ -486,7 +486,7 @@ export const knownIds = (view: View): Known => ({
   box: (id) => id === "" || isBox(view, id),
   folder: (id) => knownGroup(view, id) || (!id.endsWith(PKG) && childrenOf(view, id).length > 0)
     || (id.endsWith(ROOT_CLOSED) && id.slice(0, -ROOT_CLOSED.length) === rootModule(view)),
-  node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS,
+  node: (id) => isBox(view, id) || index(view).node.has(id) || id === OUTSIDE || id === EXTERNALS || knownGroup(view, id),
   proposal: (name) => view.kind !== "change" && (view.policy?.proposals?.some((p) => p.name === name) ?? false),
 });
 
```

- [ ] **Run:** `cd web && npx vitest run && npx tsc --noEmit` Expected: PASS

- [ ] **Run:** `make build` Expected: PASS

- [ ] **Run:** `cd web/e2e && npm run accept` Expected: PASS, 54/54 in each engine

- [ ] **Commit** (one line, imperative; stage these files only)

### Task 10: Gates and acceptance

**Steps:**

- [ ] **Run:** `test -z "$(gofmt -l cmd internal web/*.go)" && go vet ./... && go test ./... && golangci-lint run ./... && cd web && npm run typecheck && npx vitest run` Expected: PASS. A bare `golangci-lint` exits non-zero on any issue. Through the RTK wrapper it exits 0 whatever it finds, so read its output there.

- [ ] **Acceptance** (by hand; zu writes acceptance.md next to this file). After `make build`, export the two Test Corpus checkouts (read-only; never clone) and measure the first views in three engines with `measure.mjs`, next to this file:

  ```bash
  O=$(mktemp -d); Z=$PWD/bin/zu
  (cd .zu/corpus/hugo@v0.166.0 && "$Z" scan -out "$O/hugo.json" -html "$O/hugo.html" .)
  (cd .zu/corpus/kubernetes@v1.37.0 && "$Z" scan -out "$O/k8s.json" -html "$O/k8s.html" .)
  node docx/features/12-grouping/measure.mjs "$O" hugo="$O/hugo.html" k8s="$O/k8s.html"
  ```

  Each engine must show what Prototype evidence shows:
  - about 15 boxes, plus the chips;
  - at most 7 rows per sibling set;
  - labels, stats and badges at 11 px or more;
  - "entry points" on the axis;
  - no page or CSP error.

  On kubernetes, the `kubernetes` module must be opened at the top (`plugin` and `cmd` above `pkg`, and "+2 more" holding `build` and `cluster`), with the staging modules below it. Click "+N more" and a Strip: each opens in place. Esc from inside `kubernetes/pkg` goes to the page root.

- [ ] **Speed** (by hand, B1): time `scene` on the same exports with `probe.mjs`, next to this file, for this tree and for `main`:

  ```bash
  node docx/features/12-grouping/probe.mjs web k8s="$O/k8s.html" hugo="$O/hugo.html"
  ```

  Six runs each. kubernetes auto and `d=4` must stay within 11's ~110 ms; Rulings on the scrutiny has the numbers.

- [ ] **The user's check:** open `hugo.html` and `k8s.html`. Can you say what each system's main parts are, and where it starts, within 10 seconds?

---

## Prototype evidence

Measured 2026-09-25 on an Apple M2, macOS, Go 1.24.5, Node 24.17.0. `bin/zu` was built by the replay's `make build` (Task 9) on a fresh archive of `main` at 145322e, so the measured code is exactly this plan's. The exports come from the read-only Test Corpus checkouts (hugo v0.166.0, kubernetes v1.37.0) and were measured with `measure.mjs` at 1600 × 1000. "Rows" counts the rows of the top sibling set. The 7-row cap applies to each sibling set, so the opened `kubernetes` module's 3 inner rows (its own capped set) are not in that count; by eye, the kubernetes page shows 9 rows. The three engines agreed on every number except kubernetes' zoom (1.137 firefox, 1.141 chromium, 1.144 webkit) and its smallest text (12.5 px in firefox). kubernetes' zoom fell from 1.196 before M1, because more of its boxes now carry a `gen N%` badge, a line of their own.

| | hugo, 11 | hugo, 12 | kubernetes, 11 | kubernetes, 12 |
|---|---|---|---|---|
| opens at | `github.com/gohugoio/hugo`, depth 1 | same | root, depth 1 | root, depth 1, `kubernetes` opened in place |
| zoom | 0.917 (floor, minimap) | **1.2 (whole)** | 1.035 | **1.141 (whole)** |
| smallest text (labels, stats, badges) | 11 px | **13.2 px** | 12.4 px | **12.6 px** |
| boxes drawn | 38 | **15** | 39 | **15** |
| chips | — | "3 tests & tools · used by 5", "+20 more" | — | in `kubernetes`: "258 tests & tools · used by 3", "+2 more"; below: "183 tests & tools · used by 1", "+18 more" |
| header | — | "15 boxes at depth 1, 20 boxes folded." | — | "15 boxes at depth 1, 20 boxes folded." |
| rows (top set) | 17 | **7** | 13 | **7** |
| top row | `hugo (package)` | `hugo (package)` [cmd] | `kubernetes` | `kubernetes`: `plugin`, `cmd` |
| axis | "uses ↓" | **"entry points"** | "uses ↓" | **"entry points"** |
| against the order | 39 | 25 | 0 | 2 |
| badges | — | `cmd` on `hugo (package)` | — | `gen 83%` api, client-go; `gen 61%` apiextensions-apiserver; `gen 35%` dynamic-resource-allocation, `pkg`; `gen 30%` code-generator; `gen 26%` component-helpers; `gen 20%` `cmd` |
| page or CSP errors | 0 | 0 | 0 | 0 |

hugo, 12:
- `hugo (package)` [cmd] at the top;
- then `commands`, `tpl` and `resources`, then `hugolib`, `markup` and `config`;
- down to `common` and `identity` beside the externals oval;
- the Strip and "+20 more" in the bottom row.

Merged rows are plain rows (L4).

kubernetes, 12: see the keep list under Deviations.

Screenshots (chromium, 1600 × 1000) in the lead's scratchpad: `hugo-12.png`, `k8s-12.png`.

## Replay record

Replayed, after the scrutiny rulings, on a fresh `git archive` of `main` at 145322e with `replay.py`. Each task's red command fails, then its green commands pass. The log keeps only each command's last line, so the e2e line shows webkit, the last engine. A separate run of `npm run accept` on the replayed tree printed `chromium: ok (54/54 checks)`, `firefox: ok (54/54 checks)` and `webkit: ok (54/54 checks)`. The replayed tree is diff-identical to the prototype's for `internal`, `cmd`, `web/src` and `web/e2e/accept.mjs`. The replayed `bin/zu` wrote IRs byte-identical to the prototype's for hugo and kubernetes, and the measurements, the probe and the screenshots come from it.

```
ok   Task 1: Package facts in the IR (`main`)         red   exit=1 go test ./internal/scan/  | internal/scan/build_test.go:146:20: n.Main undefined (type *ir.Node has no field or method Main)
ok   Task 1: Package facts in the IR (`main`)         green exit=0 go test ./... && go vet ./...  | ok  	zu/web	1.498s
ok   Task 2: Policy keys `demote` and `budget`        red   exit=1 go test ./internal/policy/ ./internal/cli/  | internal/policy/demote_test.go:30:54: too many errors
ok   Task 2: Policy keys `demote` and `budget`        green exit=0 go test ./... && go vet ./...  | ok  	zu/web	1.509s
ok   Task 3: The View marks demoted packages          red   exit=1 go test ./internal/export/  | internal/export/policy_test.go:187:137: too many errors
ok   Task 3: The View marks demoted packages          green exit=0 go test ./... && go vet ./...  | ok  	zu/web	(cached)
ok   Task 4: The Strip (`group.ts`)                   red   exit=1 cd web && npx vitest run src/group.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
ok   Task 4: The Strip (`group.ts`)                   green exit=0 cd web && npx vitest run && npx tsc --noEmit  |              at least ~252ms faster with isolate: false — reuses workers across files instead of one per file
ok   Task 5: The Budget and the Fold chip             red   exit=1 cd web && npx vitest run src/group.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/12]⎯
ok   Task 5: The Budget and the Fold chip             green exit=0 cd web && npx vitest run && npx tsc --noEmit  |              at least ~262ms faster with isolate: false — reuses workers across files instead of one per file
ok   Task 6: At most 7 rows, merged bottom-up         red   exit=1 cd web && npx vitest run src/group.test.ts src/layout.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯
ok   Task 6: At most 7 rows, merged bottom-up         green exit=0 cd web && npx vitest run && npx tsc --noEmit  |    Duration  689ms (transform 46%, tests 28%, import 22%, worker 4%)
ok   Task 7: Open the root module in place            red   exit=1 cd web && npx vitest run src/group.test.ts src/cut.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯
ok   Task 7: Open the root module in place            green exit=0 cd web && npx vitest run && npx tsc --noEmit  |    Duration  714ms (transform 43%, tests 32%, import 21%, worker 4%)
ok   Task 8: Path-role badges and "entry points"      red   exit=1 cd web && npx vitest run src/group.test.ts src/layout.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯
ok   Task 8: Path-role badges and "entry points"      green exit=0 cd web && npx vitest run && npx tsc --noEmit  |    Duration  705ms (transform 44%, tests 29%, import 24%, worker 3%)
ok   Task 9: The browser suite                        red   exit=1 cd web && npx vitest run src/group.test.ts  | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
ok   Task 9: The browser suite                        green exit=0 cd web && npx vitest run && npx tsc --noEmit  |    Duration  724ms (transform 48%, tests 29%, import 19%, worker 3%)
ok   Task 9: The browser suite                        green exit=0 make build  | [MISSING_NAME_OPTION_FOR_IIFE_EXPORT] If you do not supply "output.name", you may not be able to acce
ok   Task 9: The browser suite                        green exit=0 cd web/e2e && npm run accept  | webkit: ok (54/54 checks)
ok   Task 10: Gates and acceptance                    green exit=0 test -z "$(gofmt -l cmd internal web/*.go)" && go vet ./... && go test ./... && golangci-lint run ./... && cd web && npm run typecheck && npx vitest run  |    Duration  748ms (transform 42%, te
```

## Risks

- **The root module's children never fold** (ruling (a)). A root module with more non-island children than the Budget draws them all, over the Budget; kubernetes has 3. Its islands still fold.
- **Hand-written decls still favour big libraries.** With L1 `client-go` falls from 19341 to 4256 but stays, and `kube-scheduler` (309) still folds: size is not importance. A Policy `order:` names what a reader cares about.
- **The Budget is per view, so sibling sets compete for it** (by design: it bounds what one screen shows). In kubernetes the root module's children compete with the staging modules. A per-set budget would keep more of `kubernetes` by rule, but a view with several open containers would then draw a multiple of 15.
- **The built-in list can demote real code.** A package under `tools/` or `scripts/` that is product code goes in the Strip. `demote: ["!…"]` keeps it; `policy init` says so. Nothing is removed, and search opens the Strip.
- **A Policy edit to `demote:` or `budget:` leaves the hash alone** (M3). This is right for `check`, whose results they cannot change. But two Policies that differ only in these keys now share a hash, so the hash alone does not say what the page will fold.
- **At 1280 × 720 the bottom row is below the fold** (deferred by the lead). The row with the chips can need a scroll or a zoom out (scrutiny-12). e2e `foldNarrow` checks that a chip still opens there.
- **The axis label is easy to miss** (deferred by the lead). "entry points" is the rotated top label of the thin axis on the left.
- **A merged row hides its ranks** (L4). Up to five ranks share a row on hugo with nothing between them; the Panel's rank line and the against-order count keep the order, but the canvas alone no longer shows it.
- **`upTo` changes for one 11 test** (`cut.test.ts`: up from `ex/shop/internal` is now the page root, since shop's root module opens in place). Old links still work; Esc just goes one level higher there.
- **The fold runs only at auto depth.** `#d=2` links from before 12 draw every box, as they did.
- **11's `overview` check no longer sees a minimap** (Task 9: the row cap makes `big` fit). The minimap stays covered by `firstView` (`wide.html#d=2`, an explicit depth, so nothing folds), which still asserts it appears, hides and shows again.
