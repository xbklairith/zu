# 26 · Mermaid Export — Plan

**Status:** APPROVED 2026-10-22 (lead, after scrutiny-26, two fix rounds and the replay; the re-check's one gap, `&`, fixed test-first and replayed; advisor sign-off). Not built: Tasks 1–4 wait.

**Base.** Every diff here is against `main` at da92a30. The code at da92a30 is unchanged on `main`: the commits after it add only 25's plan files (`docx/features/25-check-by-source/`) and this plan's. The diffs come from a scratch branch whose first commit is a `git archive` of da92a30. After it come one commit per red step and one per green step. The plan was replayed on a fresh `git archive` of da92a30 (**Replay record**).

New files are given whole, in `<!-- file: … -->` blocks, the four golden files among them. No step rewrites a golden: Task 2's `TestShopGolden` compares the export with the bytes given here.

The proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is a copy of 21's, unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. From the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && python3 -u docx/features/26-mermaid-export/replay.py docx/features/26-mermaid-export/plan.md "$S"; rm -rf "${S:?}"
```

It needs:
- Go, git, `patch` and Python 3;
- `golangci-lint`, npm and Node (Task 4's `make check`, which builds the UI and runs its tests).

No browser is needed. Rendering the files with Mermaid is part of the by-hand measurement (Task 4), not the replay.

---

## Goal

A repository can keep in its docs a diagram of its own structure that zu writes from the code, and CI can check that the committed diagram still matches the code. Requirements l.240 kept Mermaid "only as an export format", and l.188 asked for one "for piping into CI or a doc". The three Go repositories in the baseline comparison (2026-10-22) each keep a hand-drawn Mermaid diagram, and all three have drifted: boxes for code that does not exist, arrows no import stands behind, packages and layer pairs left out.

`zu scan -mermaid FILE` also writes a Mermaid flowchart of the Package Tree, cut a fixed number of levels below each module root (`-depth`, default 1). With `-proposal NAME` it draws a Proposal's layers instead. The boxes and arrows come from the scan alone.

**Scenario:** litestream at f282d0e, whose `docs/ARCHITECTURE.md` draws 15 boxes and 16 arrows by hand.
- **Before 26:** zu can draw litestream as an HTML page, but a Markdown doc cannot hold that page. The doc's diagram names a `config.go` that does not exist, leaves out webdav, mock, tests/integration and internal, and draws arrows from the root's ReplicaClient interface to the seven storage clients, where each client imports the root.
- **After 26:** `zu scan -mermaid docs/arch.mmd` writes 840 bytes:
  - a comment line naming the one module: `%% zu: Package Tree of github.com/benbjohnson/litestream at depth 1; external modules not drawn: 35`;
  - 13 boxes, with no subgraph: "litestream (package)", abs, "cmd · 3 packages", file, gs, "internal · 2 packages", mock, nats, oss, s3, sftp, tests/integration and webdav;
  - 38 arrows, one for each pair of boxes with imports between them, such as `n3 -->|2| n1` (two of cmd's three packages import the root package).

  It holds no commit or version. A committed copy changes when the structure it draws does: a box or an arrow comes or goes, a package is added inside a box (its count), or a new package pair joins two boxes (an arrow's number). It also changes with `-depth`, `-proposal` or a zu version that writes other bytes. So `zu scan -mermaid docs/arch.mmd && git diff --exit-code docs/arch.mmd` fails a CI job when the diagram no longer matches the code. On stderr: `zu scan: mermaid: 13 boxes, 38 arrows → docs/arch.mmd`.
- **A Proposal:** in agent-orchestrator, with the clone's `zu.policy.yaml` (written for the baseline comparison from the doc's layers), `zu scan -mermaid - -proposal doc-layers` prints six boxes under "PROPOSAL — not instantiated in code: doc-layers": "Data + Infrastructure · 131 packages", "Core · 12 packages", "Services · 25 packages", "HTTP · 7 packages", "CLI" and "Unassigned · 84 packages". There are 21 arrows between them, among them `n1 -->|11| n2`: 11 package pairs in which Data + Infrastructure imports Core, against the doc's rule that dependencies point down.

## Architecture

1. **Package `mermaid`** (new, `internal/mermaid`). `mermaid.go` holds what both Mermaid writers share:
   - `Node(i)`, the generated id `n1`, `n2`, …, so no label is ever an id;
   - `Label(s)`, the Structural Summary's label: `s` in double quotes with each `"` as `#quot;`, and nothing else escaped (the export escapes more, item 2);
   - `Limit`, 30 boxes.

   The Structural Summary's diagram (`internal/diff/render.go`, 03) used to do the same things inline. It now calls these, and its function `mermaid` is renamed `diagram`, since the package name would shadow it. Its output is unchanged: the diff goldens pass without `-update`.
2. **The export** (`internal/mermaid/export.go`). A `Diagram` is groups of boxes and the arrows between boxes. A group with a title is drawn as a subgraph; a group without one is drawn as plain boxes.
   - `Tree(doc, pol, depth)` applies the Policy as the View does (`pol.Apply`: omit, omit-edges, foreign). Each package's module root is `Node.Module`, so a nested module is its own root, as in the Package Tree (ADR 0008).
     - A package at most `depth` segments below its root is its own box.
     - A deeper package folds into its ancestor `depth` segments below the root, which is a box even when no package has that path.
     - At depth 0 each module is one box.

     Boxes are in module path order, then id order. A box is labelled by its path below the module root, and the root package as the UI labels it, "litestream (package)". A box that holds exactly one package is labelled by that package's path instead: on zu at depth 1, the box for `cmd` holds only `cmd/zu` and reads "cmd/zu". At depth 0 a box is labelled by its whole path: the module's, or its one package's (shop's nested module reads "example.com/shop/tools/gen").

     Subgraphs follow the modules. With two or more modules and a depth above 0, each module is a subgraph titled by its path. With one module there is no subgraph, and the comment line names the module instead: `Package Tree of github.com/benbjohnson/litestream at depth 1`. At depth 0 there is none either: each box is a module and is labelled by its path, or by its one package's path.
   - `Proposal(doc, pol, name)` draws `doc` as `pol.ForProposal(name)` does, with the Proposal's omit added to the Policy's. Each layer is one box, inner first, then "Unassigned" for the packages in no layer. A package takes the layer of the longest member it falls under (`RankOf`). All boxes are in one subgraph, titled with the UI's banner, "PROPOSAL — not instantiated in code: NAME" (ADR 0008). A layer that holds no package is left out and named in `Empty`, as the UI leaves out unused layer boxes (`proposal.ts`). An empty Unassigned is left out too.
   - `connect` adds one arrow for each pair of boxes with imports between them, counted per package pair. Imports inside a box draw nothing, so there are no self-loops. Calls, embeds and the other edge kinds draw nothing.
   - External modules are not drawn. The comment line counts the ones the drawn packages import, after `foreign:` (Deviation 4).
   - `Write` writes `flowchart TD` and then the comment line, `%% zu: <what>; external modules not drawn: N`. Each group with a title follows as `subgraph gK["title"]`, its boxes as `nI["label"]`, and `end`; the boxes of a group without one follow at the top level. The arrows come last. A box with more than one package adds " · N packages" to its label, and an arrow that stands for more than one package pair is labelled with that number (`-->|N|`), as the canvas labels a bundle only when it holds more than one pair.
   - **Escaping.** Mermaid 11 reads Markdown and HTML inside a quoted label, so every box label, subgraph title and banner goes through `escape`, which writes these characters as numeric or named entities: `#` as `#35;` (first, so no entity is escaped twice: `strings.NewReplacer` makes one pass), then `"` as `#quot;`, `` ` `` as `#96;`, `<` as `#lt;`, `>` as `#gt;`, `*` as `#42;`, `~` as `#126;`, `$` as `#36;` and `&` as `#38;`, so an HTML entity such as `&amp;` shows as written rather than decoded. `_` is left as it is: Mermaid shows an in-word `_` as written. Package paths come from directory names, which may hold any of these, `~` is legal in a module path, and a Proposal's layer names are free text. The Structural Summary's `Label` is unchanged.
3. **The flags** (`internal/cli/mermaid.go`, `scan.go`):
   - `-mermaid FILE` (`-` for stdout);
   - `-depth N` (default 1);
   - `-proposal NAME`.

   `prepare` refuses, with exit 3 before the scan:
   - `-depth` or `-proposal` without `-mermaid`;
   - a negative depth;
   - an empty name;
   - `-depth` with `-proposal`;
   - `-out -` with `-mermaid -`.

   `check` loads the Policy from the tree being scanned (the working tree, or `-ref`'s commit) and refuses a name it does not declare, with exit 3, before the scan.

   The scan then writes the IR, and `-html`'s page, as before. The diagram is written last, atomically (`writeAtomic`, shared with `-html`), or to stdout for `-`, and stderr says:
   - for each layer left out, `zu scan: mermaid: layer "X" of Proposal "P" holds no package: not drawn`;
   - `zu scan: mermaid: N boxes, M arrows → FILE`, with `1 box` and `1 arrow` in the singular;
   - above 30 boxes, `zu scan: mermaid: N boxes is more than 30; a smaller -depth or a -proposal draws fewer` (Deviation 5).

   The exit stays 0. A write that fails exits 3, as `-html`'s does. More parse failures than `-max-parse-errors` still exit 2, after the diagram is written, as after `-html`'s page.
4. **Determinism.** Boxes sort by module and id, layers keep the Policy's order, and arrows sort by their two boxes' places. The output is a function of the IR, the Policy, `-depth` and `-proposal`, whatever the IR's order (`TestOutputIgnoresTheIRsOrder`). Two scans of the same tree write the same bytes: the CLI test and the shop golden check it, and so did the by-hand runs on four repositories (**Measurements**).
5. **Edge cases**, each run by hand on this plan's last commit:
   - a repository with no packages: the `flowchart TD` line and the comment line, 0 boxes, exit 0;
   - Go files outside any module: they are parse failures, so the diagram is written without them and the scan then exits 2 (with `-max-parse-errors` 0, the default);
   - more parse failures than `-max-parse-errors`: exit 2 after the write, as with `-html`, so a CI job that runs `zu scan -mermaid … && git diff --exit-code …` fails at the scan, before `git diff` (`TestScanMermaidIsWrittenBeforeTooManyParseErrorsExit2`);
   - a `go.work` with no `go.mod` at the root: it works, one subgraph per module, with the imports between modules drawn.

The shop fixture at depth 1 (`internal/mermaid/testdata/shop.mmd`), two modules, so two subgraphs:

```text
flowchart TD
  %% zu: Package Tree at depth 1; external modules not drawn: 2
  subgraph g1["example.com/shop"]
    n1["shop (package)"]
    n2["internal · 3 packages"]
  end
  subgraph g2["example.com/shop/tools"]
    n3["gen"]
  end
  n1 --> n2
  n3 --> n2
```

## Out of scope

- **SVG and PNG** (U7). The export is Mermaid text, and a doc's host renders it.
- **Arrow statuses and colours.** A Proposal's declared arrows and whether code stands behind them are 24's. 26 draws the imports between layers, with no status.
- **The Change View.** `zu diff -format markdown` already carries the Structural Summary's diagram (03). 26 adds no `-mermaid` to `zu diff`.
- **Type-level boxes** (22). Store, DB and Replica in litestream's doc are types in its root package, and only the Type Map would draw them.
- **The Policy's `levels:` and `order:`.** Mermaid places the boxes itself, so 26 draws no ranks.
- **`-format mermaid`** on `zu scan`, as l.188 names it (Deviation 1).
- **Mermaid's 500-edge limit** (**Risks**; a follow-up).
- **The IR, its schema and the UI.** The scan writes the same IR. `make build` embeds the same UI.

## Overlap

Build order: 21 (UI only) → 25 (`check.go`) → 26 → 24 (Proposal arrows; does not touch `scan.go`).
- **21:** no file in common. 21 changes only `web/`, and 26 changes none of it.
- **25** is committed on `main` as a66fdc5: its plan and `replay.py`, not its code.
  - Its code touches `internal/cli/check.go`, `check_test.go`, and the new `internal/policy/tally.go` and `tally_test.go`. 26 touches none of them.
  - Both add to package `cli`. 26 adds `mermaid.go` and `mermaid_test.go` and edits only `scan.go`'s doc comment, flag block and `runScan`. Its package-level names there are `mermaidOptions` and `noun`. 25's `writeCounts` and `writeCount` take a parameter named `noun`, which shadows 26's function inside them: legal Go, and 25 never calls it.
  - 26 calls `loadPolicy` (`diff.go`) and `scanSource` (`scan.go`) without changing them. If 25 changes either one's signature, `mermaid.go`'s `check` and the two calls in `runScan` follow it.
  - **Docs.** 25 rewrites `decisions.md`'s **Output formats** bullet, amends `requirements-draft.md`'s command table (`check` row, l.182) and adds a glossary entry after Baseline. 26 edits the **Output formats** bullet on top of 25's text and adds a bullet after it (**Doc amendments**), so 25's amendments go in first. 26's other amendments are on other lines: requirements l.188 and l.240, a glossary entry after HTML Export. 25 does not touch the README, and 26 adds a line to its **Use** block and a bullet to its **Output contract**.
- **24** adds `arrows:` to a Proposal and their statuses to the View.
  - `mermaid.Proposal` reads `pol.Normalize().Proposals`, `Layer.Name`, `ForProposal` and `RankOf`. A change to any of them in 24 reaches `export.go`.
  - Drawing a Proposal's declared arrows, with their statuses, in the Mermaid Export is a follow-up to both (**Notes**), not 24's scope.
  - 24 touches no file 26 adds.
- **22** (Type Map, IR schema 2) will conflict in three places:
  1. `export.go` reads the IR: `KindPackage`, `KindExternal`, `EdgeImports`, `Node.Module`, `Node.ID` and `Edge.From/To/Kind`. Schema 2 must keep these, or `Tree` and `connect` follow it. New edge kinds draw nothing, since only imports count.
  2. If 22 adds flags to `zu scan`, they sit in the same flag block in `scan.go`, a textual conflict.
  3. If 22 extends `internal/scan/testdata/shop`, `TestShopGolden` fails whenever packages or imports change. `go test ./internal/mermaid -update` rewrites the four goldens, and the diff must be reviewed.

## Deviations and decisions for review

1. **A flag on `zu scan`, not `-format mermaid`.** l.188 names `-out` / `-format json|mermaid|svg`. But `-format` is `zu diff`'s, choosing the Summary's text, Markdown or JSON; `zu check` writes text only, and `zu scan` has no `-format`. A separate flag lets one scan write the IR, the page and the diagram together. `-` means stdout, as `-out -` does. With both on stdout, IR and diagram would interleave, so `-out -` and `-mermaid -` together exit 3. **Doc amendments** corrects l.188.
2. **The default depth is 1, fixed, and counts levels below each module root.** Measured at depths 1 and 2:
   - litestream: 13 and 16 boxes;
   - agent-orchestrator: 6 and 90;
   - tuios: 34 and 124.

   The UI's own depth is not used. `autoDepth` starts at 1, as this does, and goes deeper while the next level has at most 60 leaves and more than this one. That depends on the tree's size, so one new package could change the cut and rewrite the whole file. With a fixed depth, a new package changes the file only where it lands: a new box, a box's package count, or an arrow or its number (Deviation 10). A nested module is its own root, as in the UI's index (shop's `tools/gen` is "gen" under `example.com/shop/tools`, not a "tools" box under shop).
3. **Top-down, as the Project View draws dependencies: `flowchart TD`, not the Summary's `BT`.** Rendered with Mermaid 11.4.1, `BT` drew the dependency 104 px above its importer and `TD` drew it below. The Structural Summary keeps `BT`: its bytes are 03's contract, and its goldens are unchanged.
4. **External modules are counted, not drawn.** The comment line says how many the drawn packages import, after `foreign:`. litestream imports 35, tuios 32 and agent-orchestrator 28. One box each would outnumber the packages. Folding them all into one box would add an arrow from nearly every box. The hand-drawn diagrams draw two at most.
5. **Above 30 boxes the diagram is written whole, and stderr warns.** The exit stays 0. The Structural Summary leaves its diagram out above 30 (03) because an MR comment has a budget. A file asked for by name is different: cutting it would draw something other than what was asked. Mermaid 11.4.1 rendered every measured file, the largest with 124 boxes and 363 arrows. The warning names the two ways to draw fewer: a smaller `-depth` or a `-proposal`.
   - The Policy's `omit:` also draws fewer: on tuios it takes depth 1 from 34 boxes to 22 (**Measurements**). But `omit:` also drops those packages from `check`, `diff` and the View, and it changes the Policy hash, so `check` exits 3 against a Baseline written before it. The warning does not suggest it.
   - Folding each module's demoted packages (12's `demote:` and built-in list) into one box would draw fewer without that cost: tuios at depth 1 would draw 23 boxes. That is a follow-up, not in 26 (**Notes**).
6. **The Policy applies as for the View.** `omit`, `omit-edges` and `foreign` go through `pol.Apply`. With `-proposal`, the Proposal's own `omit` is added (`ForProposal`). Tested in `TestTreeDrawsWhatThePolicyDraws`, `TestProposalDrawsItsLayersAndUnassigned`, `TestShopGolden` (`foreign` on a real scan) and `TestScanMermaidDrawsWhatThePolicyDraws`.
7. **A Proposal's empty layers are left out and named on stderr**, as the UI leaves out unused layer boxes. An unknown Proposal exits 3 before the scan. The name is case-sensitive, as `ForProposal` is. `-depth` with `-proposal` exits 3: the layers are the boxes.
8. **A new package, not one renderer file.** The brief asked for a renderer file and for `render.go`'s escaping and naming to be reused. `internal/diff` cannot import `internal/cli`, and the export is not a diff, so the shared part and the export live in `internal/mermaid` (two files). `internal/cli/mermaid.go` holds the flags.
9. **Labels carry counts, as the canvas does, and name a lone package.** A box with more than one package ends in " · N packages". An arrow is labelled with its package pairs only above one. A Package Tree box that holds one package is labelled by that package, so a box never names a directory that is not a package unless it folds two or more. A Proposal's layer keeps its name, whatever it holds.
10. **The file names no commit and no version.** The comment line says what was drawn and how many external modules were left out. A commit hash would change the file on every commit and defeat a drift check. The bytes still depend on the commit, the Policy, `-depth`, `-proposal` and zu's version, and they change when a package is added inside a box (its count) or a new package pair joins two boxes (an arrow's number), not only when a box or an arrow comes or goes.
11. **Subgraphs only where they tell modules apart.** Rendered with Mermaid 11.4.1 (scrutiny's measurements, and **Measurements**):
    - one module draws no subgraph, and the comment line names it. litestream at depth 1 now renders 1,470 × 414 px. Scrutiny measured the same boxes at 1,521 × 564 in one subgraph and 1,427 × 414 without, when the box now labelled "tests/integration" read "tests"; this export with that one label set back to "tests" renders 1,427 × 414 too. The subgraph added nothing the boxes do not say. The module goes in the comment, not a frontmatter `title:`, which added 50 px, and which fails to parse unless quoted when the title holds ": ", as the Proposal banner does;
    - two or more modules draw one subgraph each. Without them tuios's three "internal" boxes and agent-orchestrator's two "cmd" boxes could not be told apart;
    - a Proposal keeps its banner subgraph, as the UI keeps its banner (ADR 0008);
    - at depth 0 each box is a module, labelled by its path, so a subgraph would hold one box: none is drawn. A module of one package is labelled by that package's path, as any box of one package is (item 9): shop's `example.com/shop/tools/gen`.
12. **Labels are escaped as entities in the export only** (Architecture 2). The Summary's `Label` keeps its bytes, which are 03's contract. Escaping its labels the same way is a follow-up (**Notes**).

## Measurements

The brief set two checks for each file: two runs write the same bytes (`cmp`), and Mermaid 11.4.1 parses and renders it. The clones were copied with `cp -cR` from the baseline comparison's shallow clones and treated as data: zu parsed them, and nothing of theirs was run. `bin/zu` was built from dd8697a, this plan's last code commit before `&` was escaped (on the scratch branch's earlier cut). No measured file and no golden holds `&` (`grep`), and a binary built from this plan's last code commit, 015bfec, wrote every export byte for byte the same. Each file was exported twice. Each was then loaded into Chromium through Playwright (`web/e2e`'s `playwright-core`), with mermaid@11.4.1 from jsDelivr, as `baseline/mcheck.mjs` does: `mermaid.parse`, then `mermaid.render`. The size is the drawn SVG's `getBBox`.

| Export | Boxes | Arrows | Subgraphs | Bytes | Two runs | Mermaid 11.4.1 | Drawn (px) |
|---|---|---|---|---|---|---|---|
| litestream f282d0e, depth 1 | 13 | 38 | 0 | 840 | identical | parses, renders | 1,470 × 414 |
| litestream, depth 2 | 16 | 48 | 0 | 1,017 | identical | parses, renders | 2,017 × 366 |
| tuios 4417122, depth 1 | 34, warned | 40 | 10 | 1,845 | identical | parses, renders | 4,415 × 816 |
| tuios, depth 2 | 124, warned | 363 | 10 | 8,930 | identical | parses, renders | 16,685 × 1,686 |
| tuios, depth 1, `omit: [github.com/Gaurav-Gosain/tuios/e2e]` | 22 | 40 | 9 | 1,520 | identical | parses, renders | 3,694 × 741 |
| agent-orchestrator 7c83bd6, depth 1 | 6 | 7 | 2 | 500 | identical | parses, renders | 916 × 385 |
| agent-orchestrator, depth 2 | 90, warned | 291 | 2 | 7,200 | identical | parses, renders | 15,148 × 1,714 |
| agent-orchestrator, `-proposal doc-layers` | 6 | 21 | 1 | 654 | identical | parses, renders | 868 × 918 |
| zu (this plan's last commit), depth 1 | 3 | 2 | 0 | 166 | identical | parses, renders | 219 × 262 |
| Task 3's escape test Policy, `-proposal 'Odd *one*'` | 2 | 2 | 1 | 312 | identical | parses, renders as written | 330 × 282 |
| shop goldens: depth 0, 1, 2, Proposal | 2, 3, 5, 3 | 1, 2, 5, 2 | 0, 2, 2, 1 | 163, 259, 340, 233 | (goldens) | parse, render | 275 × 182, 472 × 233, 505 × 466, 271 × 411 |

In every file, Mermaid drew as many nodes as the export has boxes, as many subgraphs as it has groups with a title, and as many edge paths as it has arrows.

**zu itself** at depth 1 draws "cmd/zu", "internal · 12 packages" and "web": the box for `cmd` holds one package and is labelled by it.

**Escaping, rendered.** The escape test's layer, ``` `Core` <b>x</b> **y** a~b~c x#35;y $z "q" ```, and banner, "PROPOSAL — not instantiated in code: Odd \*one\*", read back from the rendered SVG exactly as written. Unescaped, scrutiny's probes on the same Mermaid saw: `x#35;y` drawn as "x#y"; `<b>x</b>` and `<img…>` stripped; a backtick in a layer name failing the whole diagram's parse; `**bold**` drawn bold; and `a~b~c`, a legal module path element, drawn as "aUnsupported markdown: delc". A label `x &amp; y` drew "x & y"; escaped as `x #38;amp; y`, it draws "x &amp; y".

**Against the hand-drawn diagrams,** one sentence each:
- **litestream** (`docs/ARCHITECTURE.md`): the doc's 15 boxes include a `config.go` that does not exist, four types the export cannot draw (22) and two external modules, and leave out webdav, mock, tests/integration and internal, which the export's 13 boxes at depth 1 draw, with each storage client importing the root where the doc draws the arrow the other way.
- **agent-orchestrator** (`docs/backend-code-structure.md`): against the doc's six layers and seven arrows, one of them (CLI → HTTP) with no import behind it, `-proposal doc-layers` draws the Policy's five layers (Data and Infra are one there), Unassigned with 84 packages and 21 arrows, among them the upward imports the doc's rule forbids, such as Data + Infrastructure → Core with 11 package pairs, with no status to tell them apart (24).
- **tuios** (`docs/ARCHITECTURE.md`): the doc maps nine packages into 17 boxes, puts `app` in two groups and mostly draws types, while the export at depth 1 draws ten modules as 34 boxes, 12 of them the `e2e/tui` test module's, and folds the eight internal packages the doc names into "internal · 83 packages", so a Proposal of the doc's groups comes closer to what the doc draws than any depth.

## Doc amendments (exact text; not task steps)

**`docx/core/requirements-draft.md`, line 188** (under "Flags that matter"). Replace "- `-out` / `-format json|mermaid|svg` — for piping into CI or a doc." with:

> - `-out` — the IR, for piping into CI. `zu scan -mermaid file` writes the Mermaid Export, for a doc (26). `-format` is `diff`'s (text, markdown, json), for the Structural Summary; `check` writes text only; SVG is U7's.

**`docx/core/requirements-draft.md`, line 240.** After "Mermaid is worth keeping only as an export format." add " `zu scan -mermaid` writes it (26)."

**`docx/core/requirements-draft.md`, U7 (line 224):** unchanged. The Mermaid Export is the Package Tree at a fixed depth, written by the CLI, not the view on screen, and SVG and PNG remain U7's.

**`docx/core/decisions.md`, the Output formats bullet.** 25's Doc amendments rewrite it first (25 is committed as a66fdc5; its amendments are applied by hand, before these). As 25 leaves it, the bullet reads:

> - **Output formats:** `diff` takes `-format text|markdown|json`, and `check` writes text only; markdown can be pasted as a PR comment; HTML via export. The summary includes the blast-radius count and says "no structural change" when only cosmetic edits were made. After its summary line, `check` counts the new Levels violations by importer, then by imported package (25). Each count is written when it groups something, two or more packages with one of them at two or more: `zu check: new levels violations by importer:` (or `by imported package:`), then one line per package at two or more, `  <count>  <package>`, most first, ties by id, then the rest in one line, `  <N>  other importers, 1 each` (`other importer` for one). Each count's closing line, `zu check: N of M new levels violations start in <package>` (`end in` for an imported package), is written, with or without its count's heading, when there are two or more Levels violations and one package holds half or more of them and more than any other. Cycle violations are not counted: a cycle's arc lies between boxes, lifted from imports that may start in many packages, so it has no single importer or imported package. Every line `check` wrote before 25 is written as it was. When `-update-baseline` creates the Baseline, it counts what it accepts the same way, on stderr after its list, with "accepted" for "new".

In it, replace "HTML via export." with "HTML via export; a Mermaid flowchart via `zu scan -mermaid` (26)." Then add a new bullet after it:

> - **Mermaid Export (26):** `zu scan -mermaid FILE` (`-` for stdout; not with `-out -`) also writes a Mermaid `flowchart TD` of the Package Tree as the Policy draws it (omit, omit-edges, foreign), cut `-depth N` levels below each module root (default 1; a nested module is its own root). A package at most N segments below its root is its own box, and a deeper one folds into its ancestor N segments below it. A box is labelled by its path below the module root, or by its package's path when it holds one; at depth 0 each module is one box, labelled by its path, or by its one package's path. With two or more modules and a depth above 0 each module is a subgraph titled by its path; with one module there is none, and the `%%` line names the module. With `-proposal NAME` (not with `-depth`; an unknown name exits 3 before the scan), it draws the Proposal's layers, inner first, and Unassigned, as the UI does, in one subgraph titled "PROPOSAL — not instantiated in code: NAME". A layer that holds no package is left out and named on stderr. An arrow joins two boxes with imports between them, labelled with its package pairs above one. Imports inside a box draw nothing. External modules are not drawn, and the `%%` line counts them. Labels and titles write `#`, `"`, `` ` ``, `<`, `>`, `*`, `~`, `$` and `&` as entities, so Mermaid shows them as written. Above 30 boxes the file is still written whole, and stderr warns; more parse failures than `-max-parse-errors` exit 2 after it is written. The file names no commit or version. Its bytes depend on the commit, the Policy, `-depth`, `-proposal` and zu's version, so a committed copy changes when the structure it draws does, a box's package count and an arrow's pair count included. Its arrows carry no status. The Structural Summary's diagram keeps `flowchart BT`, its bytes and its quote-only escaping, and shares the Mermaid ids and the 30 with the export (`internal/mermaid`).

**`docx/glossary.md`, a new entry after HTML Export:**

> ## Mermaid Export
>
> A Mermaid flowchart that `zu scan -mermaid` writes for a document to hold (26): the Package Tree cut a fixed number of levels below each module root, or a Proposal's layers and Unassigned. Its boxes are packages, or the packages folded under one path, and its arrows are the imports between boxes, counted in package pairs and labelled with their number when above one. External modules are counted, not drawn. It is not the Structural Summary's diagram, which draws a change.

**`README.md`, the Use block.** After the `zu scan -html zu.html` line, add:

```text
zu scan -mermaid arch.mmd     # also write the Package Tree as a Mermaid diagram
```

**`README.md`, Output contract.** After the IR's bullet, add:

> - **The Mermaid Export** that `zu scan -mermaid` writes names no commit or version. It is byte-identical for the same commit, Policy, `-depth`, `-proposal` and zu version, so a committed copy changes when the structure it draws does, including a box's package count and an arrow's pair count.

## Tasks

### Task 1: Mermaid labels and node ids from one place (`internal/mermaid`, `render.go`)

The tests (`internal/mermaid/mermaid_test.go`, new):
- `Label` quotes a string and writes each `"` as `#quot;`;
- `Node` counts from n1.

The Structural Summary's diagram then takes its ids, labels and limit from the package, and the diff goldens prove that its bytes are unchanged.

**Files:**
- Test: `internal/mermaid/mermaid_test.go` (new)
- Code: `internal/mermaid/mermaid.go` (new), `internal/diff/render.go`

**Steps:**

- [ ] **Write the failing tests**

<!-- file: internal/mermaid/mermaid_test.go -->
```go
package mermaid

import "testing"

func TestLabelQuotesAndEscapesDoubleQuotes(t *testing.T) {
	for in, want := range map[string]string{
		"example.com/shop": `"example.com/shop"`,
		`m/a"x`:            `"m/a#quot;x"`,
		`Data "Core"`:      `"Data #quot;Core#quot;"`,
	} {
		if got := Label(in); got != want {
			t.Errorf("Label(%q) = %s, want %s", in, got, want)
		}
	}
}

func TestNodeIDsCountFromOne(t *testing.T) {
	if got := []string{Node(0), Node(1), Node(29)}; got[0] != "n1" || got[1] != "n2" || got[2] != "n30" {
		t.Fatalf("Node = %v, want n1 n2 n30", got)
	}
}
```

- [ ] **Run:** `go test ./internal/mermaid` Expected: FAIL (the package has only its test: `undefined: Label`, `undefined: Node`)

- [ ] **Add package mermaid; the Summary's diagram uses it**

<!-- file: internal/mermaid/mermaid.go -->
```go
// Package mermaid writes Mermaid flowcharts: the Structural Summary's
// diagram (03) and the Mermaid Export, a cut of the Package Tree or a
// Proposal's layers (26). Node ids are generated, so no label is an id, and
// labels are quoted. The export also escapes the Markdown and HTML Mermaid
// reads inside a label (escape); the Summary's labels escape only the quote.
package mermaid

import (
	"strconv"
	"strings"
)

// Limit is the most boxes a diagram is drawn with: the Structural Summary
// omits its diagram above it (03), and zu scan -mermaid warns (26).
const Limit = 30

// Node is the generated id of the i-th node, counting from 0: n1, n2, …
func Node(i int) string { return "n" + strconv.Itoa(i+1) }

// Label is s quoted as a node label for the Structural Summary; a double
// quote becomes #quot;, and nothing else is escaped.
func Label(s string) string { return `"` + strings.ReplaceAll(s, `"`, "#quot;") + `"` }
```

`internal/diff/render.go`:

```diff
diff --git a/internal/diff/render.go b/internal/diff/render.go
index 0311ffe..1912a2b 100644
--- a/internal/diff/render.go
+++ b/internal/diff/render.go
@@ -4,15 +4,14 @@ import (
 	"fmt"
 	"io"
 	"strings"
+
+	"zu/internal/mermaid"
 )
 
 // markdownBudget is the most bytes WriteMarkdown writes: GitHub rejects
 // comments longer than 65,536 characters.
 const markdownBudget = 65536
 
-// mermaidLimit is the most packages the Mermaid diagram draws.
-const mermaidLimit = 30
-
 // WriteText writes s as plain text for a terminal.
 func WriteText(w io.Writer, s *Summary) error {
 	var b strings.Builder
@@ -131,7 +130,7 @@ func markdownBody(s *Summary, rows, items int) string {
 	}
 	b.WriteString(affectedLine(s) + "\n\n")
 	b.WriteString(edgeCountsLine(s) + "\n\n")
-	b.WriteString(mermaid(s) + "\n")
+	b.WriteString(diagram(s) + "\n")
 	b.WriteString(parseErrorsLine(s) + "\n")
 	return b.String()
 }
@@ -142,10 +141,9 @@ func more(b *strings.Builder, n int) {
 	}
 }
 
-// mermaid draws the changed packages and their direct importers (dimmed),
-// with head's imports between them. Node ids are generated so no package id
-// can break the syntax; labels are quoted.
-func mermaid(s *Summary) string {
+// diagram draws the changed packages and their direct importers (dimmed),
+// with head's imports between them, in package mermaid's ids and labels.
+func diagram(s *Summary) string {
 	var ids []string
 	seen := map[string]bool{}
 	add := func(id string) {
@@ -163,15 +161,15 @@ func mermaid(s *Summary) string {
 			add(h.Package)
 		}
 	}
-	if len(ids) > mermaidLimit {
-		return fmt.Sprintf("_Diagram omitted: %d packages (limit %d)._\n", len(ids), mermaidLimit)
+	if len(ids) > mermaid.Limit {
+		return fmt.Sprintf("_Diagram omitted: %d packages (limit %d)._\n", len(ids), mermaid.Limit)
 	}
 	node := map[string]string{}
 	var b strings.Builder
 	b.WriteString("```mermaid\nflowchart BT\n")
 	for i, id := range ids {
-		node[id] = fmt.Sprintf("n%d", i+1)
-		fmt.Fprintf(&b, "  %s[\"%s\"]\n", node[id], strings.ReplaceAll(id, `"`, "#quot;"))
+		node[id] = mermaid.Node(i)
+		fmt.Fprintf(&b, "  %s[%s]\n", node[id], mermaid.Label(id))
 	}
 	for _, e := range s.imports {
 		fmt.Fprintf(&b, "  %s --> %s\n", node[e.From], node[e.To])
```

- [ ] **Run:** `go test ./internal/mermaid ./internal/diff` Expected: PASS (the diff goldens unchanged, without `-update`)

- [ ] **Commit:** `Take the Summary's Mermaid labels and node ids from package mermaid`

---

### Task 2: The Mermaid Export draws a cut of the Package Tree or a Proposal's layers (`export.go`)

The tests (`internal/mermaid/export_test.go`, new) run on `town`, a synthetic IR with module m (m, m/a, m/a/b, m/a/b/c and m/d), the nested module m/tools (m/tools/gen), three external modules and a call:
- `TestTreeFoldsPackagesBelowTheDepthIntoTheirBox`: the whole output at depths 0, 1 and 3. Folded boxes count their packages, and an arrow counts its package pairs. At depths 1 and 3 each of the two modules is a subgraph. At depth 0 there is none, the module m reads "m · 5 packages" and m/tools, which holds one package, reads "m/tools/gen". The call draws nothing.
- `TestTreeDrawsWhatThePolicyDraws`: `foreign: [x.io]` makes two external modules one. `omit` takes m/d with its imports and the external only it imported. `omit-edges` takes m/tools/gen → m/a.
- `TestTreeDrawsOneModuleWithoutASubgraph`: with m/tools omitted, one module is left: no subgraph, and the comment line names m.
- `TestABoxOfOnePackageIsNamedByIt`: a box `cmd` that holds only `m/cmd/zu` reads "cmd/zu"; the box `internal` with two packages reads "internal · 2 packages".
- `TestProposalDrawsItsLayersAndUnassigned`: the layers inner first, and Unassigned, under the banner subgraph. The longest member decides a layer. The Proposal's omit drops m/tools. An empty layer is left out and named in `Empty`, and an unknown name is not found.
- `TestOutputIgnoresTheIRsOrder`: reversed nodes and edges draw the same bytes.
- `TestExportEscapesWhatMermaidReadsInALabel`: each of `#`, `"`, `` ` ``, `<`, `>`, `*`, `~`, `$` and `&` becomes its entity; `x &amp; y` becomes `x #38;amp; y`; `#35;` becomes `#35;35;` (`#` first, once); `session_manager` and "m/a · 2 packages" stay as they are.
- `TestShopGolden`: the scanner's shop fixture at depths 0, 1 and 2, and a Proposal with `foreign:` and an omit, against four goldens. Two scans draw the same bytes.

**Files:**
- Test: `internal/mermaid/export_test.go` (new), `internal/mermaid/testdata/shop.depth0.mmd`, `shop.mmd`, `shop.depth2.mmd`, `shop.proposal.mmd` (new)
- Code: `internal/mermaid/export.go` (new)

**Steps:**

- [ ] **Write the failing tests and the goldens**

<!-- file: internal/mermaid/export_test.go -->
```go
package mermaid

import (
	"bytes"
	"context"
	"flag"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"zu/internal/ir"
	"zu/internal/policy"
	"zu/internal/scan"
)

var update = flag.Bool("update", false, "rewrite golden files")

// town is module m (m, m/a, m/a/b, m/a/b/c, m/d), the nested module m/tools
// (m/tools/gen) and three external modules, with these imports, and a call
// that no arrow counts.
func town() *ir.IR {
	doc := &ir.IR{}
	for _, id := range []string{"m", "m/a", "m/a/b", "m/a/b/c", "m/d"} {
		doc.Nodes = append(doc.Nodes, ir.Node{ID: id, Kind: ir.KindPackage, Module: "m"})
	}
	doc.Nodes = append(doc.Nodes,
		ir.Node{ID: "m/tools/gen", Kind: ir.KindPackage, Module: "m/tools"},
		ir.Node{ID: "m/a.T", Kind: ir.KindType, Parent: "m/a"},
		ir.Node{ID: "m/d.U", Kind: ir.KindType, Parent: "m/d"})
	for _, id := range []string{"x.io/one", "x.io/two", "y.io/z"} {
		doc.Nodes = append(doc.Nodes, ir.Node{ID: id, Kind: ir.KindExternal})
	}
	for _, e := range []string{"m>m/a/b", "m/a/b>m/d", "m/a/b/c>m/d", "m/a/b>m/a", "m/tools/gen>m/a",
		"m/d>x.io/one", "m/a>x.io/two", "m/a/b>y.io/z"} {
		from, to, _ := strings.Cut(e, ">")
		doc.Edges = append(doc.Edges, ir.Edge{From: from, To: to, Kind: ir.EdgeImports, Locations: []ir.Location{{Path: "f.go", Line: 1}}})
	}
	doc.Edges = append(doc.Edges, ir.Edge{From: "m/a.T", To: "m/d.U", Kind: ir.EdgeCalls})
	return doc
}

func mustParse(t *testing.T, src string) *policy.Policy {
	t.Helper()
	p, err := policy.Parse([]byte(src))
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func text(t *testing.T, d *Diagram) string {
	t.Helper()
	var b bytes.Buffer
	if err := d.Write(&b); err != nil {
		t.Fatal(err)
	}
	return b.String()
}

func TestTreeFoldsPackagesBelowTheDepthIntoTheirBox(t *testing.T) {
	for depth, want := range map[int]string{
		0: `flowchart TD
  %% zu: Package Tree at depth 0; external modules not drawn: 3
  n1["m · 5 packages"]
  n2["m/tools/gen"]
  n2 --> n1
`,
		1: `flowchart TD
  %% zu: Package Tree at depth 1; external modules not drawn: 3
  subgraph g1["m"]
    n1["m (package)"]
    n2["a · 3 packages"]
    n3["d"]
  end
  subgraph g2["m/tools"]
    n4["gen"]
  end
  n1 --> n2
  n2 -->|2| n3
  n4 --> n2
`,
		3: `flowchart TD
  %% zu: Package Tree at depth 3; external modules not drawn: 3
  subgraph g1["m"]
    n1["m (package)"]
    n2["a"]
    n3["a/b"]
    n4["a/b/c"]
    n5["d"]
  end
  subgraph g2["m/tools"]
    n6["gen"]
  end
  n1 --> n3
  n3 --> n2
  n3 --> n5
  n4 --> n5
  n6 --> n2
`,
	} {
		if got := text(t, Tree(town(), &policy.Policy{}, depth)); got != want {
			t.Errorf("depth %d:\n%s\nwant:\n%s", depth, got, want)
		}
	}
}

func TestTreeDrawsWhatThePolicyDraws(t *testing.T) {
	// foreign merges x.io/one and x.io/two into one external module.
	got := text(t, Tree(town(), mustParse(t, "foreign: [x.io]\n"), 1))
	if !strings.Contains(got, "external modules not drawn: 2\n") || !strings.Contains(got, `n2 -->|2| n3`) {
		t.Errorf("foreign:\n%s", got)
	}
	// omit takes m/d with its imports and the external only it imports;
	// omit-edges takes m/tools/gen → m/a.
	got = text(t, Tree(town(), mustParse(t, "omit: [m/d]\nomit-edges: [{from: m/tools, to: m/a}]\n"), 1))
	want := `flowchart TD
  %% zu: Package Tree at depth 1; external modules not drawn: 2
  subgraph g1["m"]
    n1["m (package)"]
    n2["a · 3 packages"]
  end
  subgraph g2["m/tools"]
    n3["gen"]
  end
  n1 --> n2
`
	if got != want {
		t.Errorf("omit:\n%s\nwant:\n%s", got, want)
	}
}

func TestTreeDrawsOneModuleWithoutASubgraph(t *testing.T) {
	got := text(t, Tree(town(), mustParse(t, "omit: [m/tools]\n"), 1))
	want := `flowchart TD
  %% zu: Package Tree of m at depth 1; external modules not drawn: 3
  n1["m (package)"]
  n2["a · 3 packages"]
  n3["d"]
  n1 --> n2
  n2 -->|2| n3
`
	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestABoxOfOnePackageIsNamedByIt(t *testing.T) {
	doc := &ir.IR{}
	for _, id := range []string{"m", "m/cmd/zu", "m/internal/x", "m/internal/y"} {
		doc.Nodes = append(doc.Nodes, ir.Node{ID: id, Kind: ir.KindPackage, Module: "m"})
	}
	doc.Edges = []ir.Edge{{From: "m/cmd/zu", To: "m/internal/x", Kind: ir.EdgeImports, Locations: []ir.Location{{Path: "f.go", Line: 1}}}}
	want := `flowchart TD
  %% zu: Package Tree of m at depth 1; external modules not drawn: 0
  n1["m (package)"]
  n2["cmd/zu"]
  n3["internal · 2 packages"]
  n2 --> n3
`
	if got := text(t, Tree(doc, &policy.Policy{}, 1)); got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

const proposalSrc = `proposals:
  - name: Layered
    layers:
      - {name: Model, members: [m/a/b]}
      - {name: Core, members: [m/a]}
      - {name: Edge, members: [m/d]}
      - {name: Ghost, members: [m/zzz]}
    omit: [m/tools]
`

func TestProposalDrawsItsLayersAndUnassigned(t *testing.T) {
	d, ok := Proposal(town(), mustParse(t, proposalSrc), "Layered")
	if !ok {
		t.Fatal("Layered not found")
	}
	want := `flowchart TD
  %% zu: Proposal layers; external modules not drawn: 3
  subgraph g1["PROPOSAL — not instantiated in code: Layered"]
    n1["Model · 2 packages"]
    n2["Core"]
    n3["Edge"]
    n4["Unassigned"]
  end
  n1 --> n2
  n1 -->|2| n3
  n4 --> n1
`
	if got := text(t, d); got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
	if !slices.Equal(d.Empty, []string{"Ghost"}) || d.Boxes() != 4 {
		t.Errorf("Empty = %v, Boxes = %d; want [Ghost], 4", d.Empty, d.Boxes())
	}
	if _, ok := Proposal(town(), mustParse(t, proposalSrc), "Nope"); ok {
		t.Error("an unknown Proposal is not found")
	}
}

func TestOutputIgnoresTheIRsOrder(t *testing.T) {
	doc := town()
	slices.Reverse(doc.Nodes)
	slices.Reverse(doc.Edges)
	if a, b := text(t, Tree(town(), &policy.Policy{}, 1)), text(t, Tree(doc, &policy.Policy{}, 1)); a != b {
		t.Errorf("tree differs with the IR reversed:\n%s\n%s", a, b)
	}
	p := mustParse(t, proposalSrc)
	x, _ := Proposal(town(), p, "Layered")
	y, _ := Proposal(doc, p, "Layered")
	if a, b := text(t, x), text(t, y); a != b {
		t.Errorf("proposal differs with the IR reversed:\n%s\n%s", a, b)
	}
}

func TestExportEscapesWhatMermaidReadsInALabel(t *testing.T) {
	for in, want := range map[string]string{
		"#":                "#35;",
		`"`:                "#quot;",
		"`":                "#96;",
		"<":                "#lt;",
		">":                "#gt;",
		"*":                "#42;",
		"~":                "#126;",
		"$":                "#36;",
		"&":                "#38;",
		"x &amp; y":        "x #38;amp; y", // an entity shows as written, not decoded
		"x#35;y":           "x#35;35;y",    // # first, once: the label reads x#35;y
		"session_manager":  "session_manager",
		"m/a · 2 packages": "m/a · 2 packages",
	} {
		if got := escape(in); got != want {
			t.Errorf("escape(%q) = %q, want %q", in, got, want)
		}
	}
}

// shop scans the scanner's shop fixture, which it only reads.
func shop(t *testing.T) *ir.IR {
	t.Helper()
	tree, err := scan.DirTree(filepath.Join("..", "scan", "testdata", "shop"))
	if err != nil {
		t.Fatal(err)
	}
	doc, _, err := scan.Run(context.Background(), scan.Options{Tree: tree})
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func golden(t *testing.T, name string, got string) {
	t.Helper()
	p := filepath.Join("testdata", name)
	if *update {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("%v (run with -update to create it)", err)
	}
	if got != string(want) {
		t.Errorf("%s differs from golden; run go test ./internal/mermaid -update and review the diff\n%s", name, got)
	}
}

func TestShopGolden(t *testing.T) {
	doc := shop(t)
	golden(t, "shop.depth0.mmd", text(t, Tree(doc, &policy.Policy{}, 0)))
	golden(t, "shop.mmd", text(t, Tree(doc, &policy.Policy{}, 1)))
	golden(t, "shop.depth2.mmd", text(t, Tree(doc, &policy.Policy{}, 2)))
	p := mustParse(t, `foreign: [golang.org/x]
proposals:
  - name: Layers
    layers:
      - {name: Money, members: [example.com/shop/internal/money]}
      - {name: Orders, members: [example.com/shop/internal]}
      - {name: Web, members: [example.com/shop/web]}
    omit: [example.com/shop/tools]
`)
	d, ok := Proposal(doc, p, "Layers")
	if !ok {
		t.Fatal("Layers not found")
	}
	golden(t, "shop.proposal.mmd", text(t, d))
	if a, b := text(t, Tree(shop(t), &policy.Policy{}, 1)), text(t, Tree(doc, &policy.Policy{}, 1)); a != b {
		t.Error("two scans of the same tree draw different bytes")
	}
}
```

<!-- file: internal/mermaid/testdata/shop.depth0.mmd -->
```text
flowchart TD
  %% zu: Package Tree at depth 0; external modules not drawn: 2
  n1["example.com/shop · 4 packages"]
  n2["example.com/shop/tools/gen"]
  n2 --> n1
```

<!-- file: internal/mermaid/testdata/shop.mmd -->
```text
flowchart TD
  %% zu: Package Tree at depth 1; external modules not drawn: 2
  subgraph g1["example.com/shop"]
    n1["shop (package)"]
    n2["internal · 3 packages"]
  end
  subgraph g2["example.com/shop/tools"]
    n3["gen"]
  end
  n1 --> n2
  n3 --> n2
```

<!-- file: internal/mermaid/testdata/shop.depth2.mmd -->
```text
flowchart TD
  %% zu: Package Tree at depth 2; external modules not drawn: 2
  subgraph g1["example.com/shop"]
    n1["shop (package)"]
    n2["internal/checkout"]
    n3["internal/money"]
    n4["internal/store"]
  end
  subgraph g2["example.com/shop/tools"]
    n5["gen"]
  end
  n1 --> n2
  n2 --> n3
  n2 --> n4
  n4 --> n3
  n5 --> n3
```

<!-- file: internal/mermaid/testdata/shop.proposal.mmd -->
```text
flowchart TD
  %% zu: Proposal layers; external modules not drawn: 2
  subgraph g1["PROPOSAL — not instantiated in code: Layers"]
    n1["Money"]
    n2["Orders · 2 packages"]
    n3["Unassigned"]
  end
  n2 -->|2| n1
  n3 --> n2
```

- [ ] **Run:** `go test ./internal/mermaid` Expected: FAIL (`undefined: Diagram`, `undefined: Tree`, `undefined: Proposal`, then "too many errors")

- [ ] **Cut the tree, draw the layers, escape the labels, write the flowchart**

<!-- file: internal/mermaid/export.go -->
```go
package mermaid

import (
	"cmp"
	"fmt"
	"io"
	"path"
	"slices"
	"strconv"
	"strings"

	"zu/internal/ir"
	"zu/internal/policy"
)

// Notice heads a Proposal, as the UI's banner does (ADR 0008).
const Notice = "PROPOSAL — not instantiated in code"

// markup writes what Mermaid 11 reads inside a quoted label as an entity, so
// the label shows as written: # (first and once: the replacer makes one
// pass), the quote, the Markdown and HTML marks, and & (an HTML entity such
// as &amp; would show decoded). Package paths come from directory names, ~
// is legal in a module path, and a Proposal's layer names are free text. An
// in-word _ is left as it is: Mermaid shows it.
var markup = strings.NewReplacer("#", "#35;", `"`, "#quot;", "`", "#96;", "<", "#lt;", ">", "#gt;",
	"*", "#42;", "~", "#126;", "$", "#36;", "&", "#38;")

// escape is s with what Mermaid would read in a label escaped.
func escape(s string) string { return markup.Replace(s) }

// Diagram is one Mermaid Export (26): boxes in groups, each group with a
// title drawn as a subgraph, and one arrow for the imports from one box to
// another.
type Diagram struct {
	Comment   string // what was drawn, for the %% line
	Groups    []Group
	Arrows    []Arrow
	Externals int      // external modules the drawn packages import, not drawn
	Empty     []string // a Proposal's layers that hold no package, not drawn
}

// Group is a module, or a Proposal under its notice, and its boxes. A group
// with no title is drawn without a subgraph.
type Group struct {
	Title string
	Boxes []Box
}

// Box is a Package Tree box or a Proposal's layer, and how many packages
// it holds.
type Box struct {
	Label    string
	Packages int
}

// Arrow is the imports from one box to another, each box named by its
// place in drawing order.
type Arrow struct {
	From, To int
	Pairs    int // the package pairs with imports it stands for
}

// Tree is the Package Tree of doc as pol draws it (omit, omit-edges and
// foreign applied, as for the View), cut depth levels below each module
// root: a package at most depth segments below its module root is its own
// box, and a deeper one folds into its ancestor depth segments below it.
// Boxes are in module path order, then id order. With two or more modules
// and depth above 0, each module is a subgraph titled by its path; with one
// module the %% line names it instead, and at depth 0 each box is a module.
// A box that holds one package is named by that package.
func Tree(doc *ir.IR, pol *policy.Policy, depth int) *Diagram {
	doc = pol.Apply(doc)
	boxOf, module, count := map[string]string{}, map[string]string{}, map[string]int{}
	only, modules := map[string]string{}, map[string]bool{}
	for _, n := range doc.Nodes {
		if n.Kind != ir.KindPackage {
			continue
		}
		m := cmp.Or(n.Module, n.ID)
		b := cutAt(n.ID, m, depth)
		boxOf[n.ID], module[b], only[b] = b, m, n.ID
		count[b]++
		modules[m] = true
	}
	keys := make([]string, 0, len(module))
	for b := range module {
		keys = append(keys, b)
	}
	slices.SortFunc(keys, func(a, b string) int {
		return cmp.Or(strings.Compare(module[a], module[b]), strings.Compare(a, b))
	})
	d := &Diagram{Comment: fmt.Sprintf("Package Tree at depth %d", depth)}
	if len(modules) == 1 {
		for m := range modules {
			d.Comment = fmt.Sprintf("Package Tree of %s at depth %d", m, depth)
		}
	}
	grouped := depth > 0 && len(modules) > 1
	for _, b := range keys {
		m, title := module[b], ""
		if grouped {
			title = m
		}
		if len(d.Groups) == 0 || d.Groups[len(d.Groups)-1].Title != title {
			d.Groups = append(d.Groups, Group{Title: title})
		}
		name := b
		if count[b] == 1 {
			name = only[b]
		}
		g := &d.Groups[len(d.Groups)-1]
		g.Boxes = append(g.Boxes, Box{Label: treeLabel(name, m, depth), Packages: count[b]})
	}
	d.connect(doc, keys, boxOf)
	return d
}

// cutAt is the box that draws package id of module m when the tree is cut
// depth levels below m.
func cutAt(id, m string, depth int) string {
	if id == m {
		return id
	}
	segs := strings.Split(id[len(m)+1:], "/")
	switch {
	case len(segs) <= depth:
		return id
	case depth == 0:
		return m
	}
	return m + "/" + strings.Join(segs[:depth], "/")
}

// treeLabel names a box of module m by name, the box's path or its one
// package's: at depth 0, where each box is a module and no subgraph is drawn,
// by the whole path; below it, by the path below m, and the root package as
// the UI names it.
func treeLabel(name, m string, depth int) string {
	switch {
	case depth == 0:
		return name
	case name != m:
		return name[len(m)+1:]
	}
	return path.Base(m) + " (package)"
}

// Proposal is the Proposal name of pol drawn on doc: one box per layer,
// inner first, and Unassigned for the packages in none, under the
// Proposal's notice. It draws doc as ForProposal does, the Proposal's omit
// added to the Policy's, and a package takes the layer of the longest
// member it is under. A layer that holds no package is left out and named
// in Empty. ok is false when pol declares no such Proposal.
func Proposal(doc *ir.IR, pol *policy.Policy, name string) (d *Diagram, ok bool) {
	q, ok := pol.ForProposal(name)
	if !ok {
		return nil, false
	}
	var layers []policy.Layer
	for _, pr := range pol.Normalize().Proposals {
		if pr.Name == name {
			layers = pr.Layers
		}
	}
	doc = q.Apply(doc)
	boxOf, count := map[string]string{}, make([]int, len(layers)+1) // the last is Unassigned
	for _, n := range doc.Nodes {
		if n.Kind != ir.KindPackage {
			continue
		}
		r, ranked := q.RankOf(n.ID)
		if !ranked {
			r = len(layers)
		}
		boxOf[n.ID] = strconv.Itoa(r)
		count[r]++
	}
	d = &Diagram{Comment: "Proposal layers"}
	g := Group{Title: Notice + ": " + name}
	var keys []string
	for i, c := range count {
		label := "Unassigned"
		if i < len(layers) {
			label = layers[i].Name
		}
		if c == 0 {
			if i < len(layers) {
				d.Empty = append(d.Empty, label)
			}
			continue
		}
		g.Boxes = append(g.Boxes, Box{Label: label, Packages: c})
		keys = append(keys, strconv.Itoa(i))
	}
	if len(g.Boxes) > 0 {
		d.Groups = []Group{g}
	}
	d.connect(doc, keys, boxOf)
	return d, true
}

// connect adds an arrow for the imports between each two boxes (boxOf
// maps a package to its box, keys are the boxes in drawing order), counted
// per package pair, and counts the external modules the packages import.
// Imports within a box draw nothing.
func (d *Diagram) connect(doc *ir.IR, keys []string, boxOf map[string]string) {
	at := make(map[string]int, len(keys))
	for i, k := range keys {
		at[k] = i
	}
	external := map[string]bool{}
	for _, n := range doc.Nodes {
		if n.Kind == ir.KindExternal {
			external[n.ID] = false
		}
	}
	pairs := map[[2]int]int{}
	for _, e := range doc.Edges {
		from, ok := boxOf[e.From]
		if e.Kind != ir.EdgeImports || !ok {
			continue
		}
		if _, ext := external[e.To]; ext {
			external[e.To] = true
			continue
		}
		if to, ok := boxOf[e.To]; ok && to != from {
			pairs[[2]int{at[from], at[to]}]++
		}
	}
	for k, n := range pairs {
		d.Arrows = append(d.Arrows, Arrow{From: k[0], To: k[1], Pairs: n})
	}
	slices.SortFunc(d.Arrows, func(a, b Arrow) int { return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To)) })
	for _, imported := range external {
		if imported {
			d.Externals++
		}
	}
}

// Boxes is how many boxes d draws.
func (d *Diagram) Boxes() int {
	n := 0
	for _, g := range d.Groups {
		n += len(g.Boxes)
	}
	return n
}

// Write writes d as a Mermaid flowchart, dependencies below what imports
// them (TD), as the Project View draws them: a %% line saying what was
// drawn, the boxes, in a subgraph for each group with a title, then the
// arrows. Every label and title is escaped. A box that holds more than one
// package says how many, and an arrow that stands for more than one package
// pair is labelled with their number.
func (d *Diagram) Write(w io.Writer) error {
	var b strings.Builder
	b.WriteString("flowchart TD\n")
	fmt.Fprintf(&b, "  %%%% zu: %s; external modules not drawn: %d\n", d.Comment, d.Externals)
	i := 0
	for gi, g := range d.Groups {
		indent := "  "
		if g.Title != "" {
			fmt.Fprintf(&b, "  subgraph g%d[\"%s\"]\n", gi+1, escape(g.Title))
			indent = "    "
		}
		for _, x := range g.Boxes {
			label := x.Label
			if x.Packages > 1 {
				label += fmt.Sprintf(" · %d packages", x.Packages)
			}
			fmt.Fprintf(&b, "%s%s[\"%s\"]\n", indent, Node(i), escape(label))
			i++
		}
		if g.Title != "" {
			b.WriteString("  end\n")
		}
	}
	for _, a := range d.Arrows {
		if a.Pairs > 1 {
			fmt.Fprintf(&b, "  %s -->|%d| %s\n", Node(a.From), a.Pairs, Node(a.To))
		} else {
			fmt.Fprintf(&b, "  %s --> %s\n", Node(a.From), Node(a.To))
		}
	}
	_, err := io.WriteString(w, b.String())
	return err
}
```

- [ ] **Run:** `go test ./internal/mermaid` Expected: PASS

- [ ] **Commit:** `Cut the Package Tree at a depth, or draw a Proposal's layers, as a Mermaid flowchart`

---

### Task 3: `zu scan -mermaid` writes it (`internal/cli/mermaid.go`, `scan.go`)

The tests (`internal/cli/mermaid_test.go`, new) run `zu scan` on `layered`, a module whose a/b and a/c import d and whose root imports a/b and one external module, or on `tool`, a module whose one command, cmd/tool, imports internal/x:
- `TestScanMermaidWritesThePackageTreeAtDepth1`: the whole file (one module: no subgraph, the comment line names it), nothing on stdout, the stderr line, the IR still written, and a second scan writing the same bytes.
- `TestScanMermaidToStdoutAtDepth2`: `-mermaid -` with `-depth 2`.
- `TestScanMermaidDrawsWhatThePolicyDraws`: an omitted package is not drawn. `-proposal` draws a layer and Unassigned under the banner, and stderr names the layer left out.
- `TestScanMermaidEscapesWhatMermaidWouldRead`: a Proposal named `Odd *one*` with a layer named with backticks, HTML tags, Markdown, `~`, `#35;`, `$` and `"` prints every one of them as an entity, in the box and in the banner.
- `TestScanMermaidNamesABoxOfOnePackageByItAndCountsInTheSingular`: on `tool` at depth 1 the boxes read "cmd/tool" and "internal/x", and stderr says "2 boxes, 1 arrow"; at depth 0, "example.com/t · 2 packages" and "1 box, 0 arrows".
- `TestScanMermaidIsWrittenBeforeTooManyParseErrorsExit2`: with a broken file and `-max-parse-errors 0`, the scan exits 2 and the diagram is written.
- `TestScanMermaidWarnsAbove30Boxes`: 30 boxes, no warning; 31, a warning; both written whole.
- `TestScanMermaidBadInvocation`: eight invocations exit 3 with their reason, and neither the IR nor the diagram is written. The eight are `-depth` or `-proposal` without `-mermaid`, a negative depth, `-depth` with `-proposal`, an empty name, `-out -` with `-mermaid -`, an unknown Proposal, and a name in the wrong case.

**Files:**
- Test: `internal/cli/mermaid_test.go` (new)
- Code: `internal/cli/mermaid.go` (new), `internal/cli/scan.go`

**Steps:**

- [ ] **Write the failing tests**

<!-- file: internal/cli/mermaid_test.go -->
```go
package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// layered is a module whose a/b and a/c both import d, and whose root
// package imports a/b and one external module.
func layered() map[string]string {
	return map[string]string{
		"go.mod":   "module example.com/m\n\nrequire x.io/one v1.0.0\n",
		"main.go":  "package main\n\nimport (\n\t_ \"example.com/m/a/b\"\n\t_ \"x.io/one\"\n)\n\nfunc main() {}\n",
		"a/b/b.go": "package b\n\nimport _ \"example.com/m/d\"\n",
		"a/c/c.go": "package c\n\nimport _ \"example.com/m/d\"\n",
		"d/d.go":   "package d\n",
	}
}

func TestScanMermaidWritesThePackageTreeAtDepth1(t *testing.T) {
	dir := repo(t, layered())
	target := filepath.Join(t.TempDir(), "arch.mmd")
	code, out, errOut := run("scan", dir, "-mermaid", target)
	if code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	want := `flowchart TD
  %% zu: Package Tree of example.com/m at depth 1; external modules not drawn: 1
  n1["m (package)"]
  n2["a · 2 packages"]
  n3["d"]
  n1 --> n2
  n2 -->|2| n3
`
	got, err := os.ReadFile(target)
	if err != nil || string(got) != want {
		t.Fatalf("%s holds (%v):\n%s\nwant:\n%s", target, err, got, want)
	}
	if out != "" {
		t.Errorf("stdout = %q, want nothing", out)
	}
	if !strings.Contains(errOut, "zu scan: mermaid: 3 boxes, 2 arrows → "+target+"\n") {
		t.Errorf("stderr lacks the export's line:\n%s", errOut)
	}
	if _, err := os.Stat(filepath.Join(dir, ".zu", "ir", "worktree.json")); err != nil {
		t.Errorf("the IR is written as before: %v", err)
	}
	again := filepath.Join(t.TempDir(), "again.mmd")
	if code, _, errOut := run("scan", dir, "-mermaid", again); code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	if b, _ := os.ReadFile(again); string(b) != want {
		t.Errorf("a second scan of the same tree draws other bytes:\n%s", b)
	}
}

func TestScanMermaidToStdoutAtDepth2(t *testing.T) {
	dir := repo(t, layered())
	code, out, errOut := run("scan", "-mermaid", "-", "-depth", "2", dir)
	if code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	want := `flowchart TD
  %% zu: Package Tree of example.com/m at depth 2; external modules not drawn: 1
  n1["m (package)"]
  n2["a/b"]
  n3["a/c"]
  n4["d"]
  n1 --> n2
  n2 --> n4
  n3 --> n4
`
	if out != want {
		t.Errorf("stdout:\n%s\nwant:\n%s", out, want)
	}
	if !strings.Contains(errOut, "zu scan: mermaid: 4 boxes, 3 arrows\n") {
		t.Errorf("stderr lacks the export's line:\n%s", errOut)
	}
}

func TestScanMermaidDrawsWhatThePolicyDraws(t *testing.T) {
	files := layered()
	files["zu.policy.yaml"] = `omit: [example.com/m/d]
proposals:
  - name: Split
    layers:
      - {name: Leaf, members: [example.com/m/a/b]}
      - {name: Gone, members: [example.com/m/d]}
`
	dir := repo(t, files)
	code, out, errOut := run("scan", dir, "-mermaid", "-")
	if code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	if !strings.Contains(out, `n2["a · 2 packages"]`) || strings.Contains(out, `"d"`) || strings.Contains(out, "n3") {
		t.Errorf("the omitted package is drawn:\n%s", out)
	}
	code, out, errOut = run("scan", dir, "-mermaid", "-", "-proposal", "Split")
	if code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	want := `flowchart TD
  %% zu: Proposal layers; external modules not drawn: 1
  subgraph g1["PROPOSAL — not instantiated in code: Split"]
    n1["Leaf"]
    n2["Unassigned · 2 packages"]
  end
  n2 --> n1
`
	if out != want {
		t.Errorf("stdout:\n%s\nwant:\n%s", out, want)
	}
	if !strings.Contains(errOut, `zu scan: mermaid: layer "Gone" of Proposal "Split" holds no package: not drawn`+"\n") {
		t.Errorf("stderr does not name the empty layer:\n%s", errOut)
	}
}

func TestScanMermaidEscapesWhatMermaidWouldRead(t *testing.T) {
	files := layered()
	// Single quotes: in YAML a leading backtick is reserved and " #" starts a comment.
	files["zu.policy.yaml"] = "proposals:\n  - name: 'Odd *one*'\n    layers:\n" +
		"      - {name: '\x60Core\x60 <b>x</b> **y** a~b~c x#35;y $z \"q\"', members: [example.com/m/a/b]}\n"
	dir := repo(t, files)
	code, out, errOut := run("scan", dir, "-mermaid", "-", "-proposal", "Odd *one*")
	if code != ExitOK {
		t.Fatalf("exit %d: %s", code, errOut)
	}
	want := `flowchart TD
  %% zu: Proposal layers; external modules not drawn: 1
  subgraph g1["PROPOSAL — not instantiated in code: Odd #42;one#42;"]
    n1["#96;Core#96; #lt;b#gt;x#lt;/b#gt; #42;#42;y#42;#42; a#126;b#126;c x#35;35;y #36;z #quot;q#quot;"]
    n2["Unassigned · 3 packages"]
  end
  n1 --> n2
  n2 --> n1
`
	if out != want {
		t.Errorf("stdout:\n%s\nwant:\n%s", out, want)
	}
}

// tool is a module whose one command, cmd/tool, imports internal/x.
func tool() map[string]string {
	return map[string]string{
		"go.mod":           "module example.com/t\n",
		"cmd/tool/main.go": "package main\n\nimport _ \"example.com/t/internal/x\"\n\nfunc main() {}\n",
		"internal/x/x.go":  "package x\n",
	}
}

func TestScanMermaidNamesABoxOfOnePackageByItAndCountsInTheSingular(t *testing.T) {
	dir := repo(t, tool())
	for depth, c := range map[string]struct{ want, line string }{
		"1": {`flowchart TD
  %% zu: Package Tree of example.com/t at depth 1; external modules not drawn: 0
  n1["cmd/tool"]
  n2["internal/x"]
  n1 --> n2
`, "zu scan: mermaid: 2 boxes, 1 arrow\n"},
		"0": {`flowchart TD
  %% zu: Package Tree of example.com/t at depth 0; external modules not drawn: 0
  n1["example.com/t · 2 packages"]
`, "zu scan: mermaid: 1 box, 0 arrows\n"},
	} {
		code, out, errOut := run("scan", dir, "-mermaid", "-", "-depth", depth)
		if code != ExitOK || out != c.want {
			t.Errorf("depth %s: exit %d, stdout:\n%s\nwant:\n%s", depth, code, out, c.want)
		}
		if !strings.Contains(errOut, c.line) {
			t.Errorf("depth %s: stderr lacks %q:\n%s", depth, c.line, errOut)
		}
	}
}

func TestScanMermaidIsWrittenBeforeTooManyParseErrorsExit2(t *testing.T) {
	files := layered()
	files["d/broken.go"] = "package d\n\nfunc {\n"
	dir := repo(t, files)
	target := filepath.Join(t.TempDir(), "arch.mmd")
	code, _, errOut := run("scan", dir, "-mermaid", target, "-max-parse-errors", "0")
	if code != ExitParseFailure {
		t.Fatalf("exit %d, want %d: %s", code, ExitParseFailure, errOut)
	}
	if b, err := os.ReadFile(target); err != nil || !strings.HasPrefix(string(b), "flowchart TD\n") {
		t.Errorf("the diagram is not written (%v):\n%s", err, b)
	}
}

func TestScanMermaidWarnsAbove30Boxes(t *testing.T) {
	for n, warn := range map[int]bool{30: false, 31: true} {
		files := map[string]string{"go.mod": "module example.com/m\n"}
		for i := range n {
			files[fmt.Sprintf("p%02d/p.go", i)] = fmt.Sprintf("package p%02d\n", i)
		}
		code, out, errOut := run("scan", repo(t, files), "-mermaid", "-")
		if code != ExitOK || !strings.Contains(out, fmt.Sprintf("n%d[", n)) {
			t.Fatalf("%d boxes: exit %d, the diagram is not written whole: %s\n%s", n, code, errOut, out)
		}
		msg := fmt.Sprintf("zu scan: mermaid: %d boxes is more than 30; a smaller -depth or a -proposal draws fewer\n", n)
		if strings.Contains(errOut, msg) != warn {
			t.Errorf("%d boxes: warned = %v, want %v:\n%s", n, !warn, warn, errOut)
		}
	}
}

func TestScanMermaidBadInvocation(t *testing.T) {
	files := layered()
	files["zu.policy.yaml"] = "proposals:\n  - name: Split\n    layers:\n      - {name: Leaf, members: [example.com/m/a/b]}\n"
	target := filepath.Join(t.TempDir(), "arch.mmd")
	for name, c := range map[string]struct {
		args []string
		why  string
	}{
		"depth alone":         {[]string{"-depth", "2"}, "-depth and -proposal need -mermaid"},
		"proposal alone":      {[]string{"-proposal", "Split"}, "-depth and -proposal need -mermaid"},
		"negative depth":      {[]string{"-mermaid", target, "-depth", "-1"}, "-depth must be >= 0"},
		"depth with proposal": {[]string{"-mermaid", target, "-depth", "2", "-proposal", "Split"}, "-depth does not apply with -proposal"},
		"empty proposal":      {[]string{"-mermaid", target, "-proposal", ""}, "-proposal needs a name"},
		"two streams":         {[]string{"-mermaid", "-", "-out", "-"}, "-out - and -mermaid - would both write to stdout"},
		"unknown proposal":    {[]string{"-mermaid", target, "-proposal", "Nope"}, "-proposal Nope: zu.policy.yaml declares no such Proposal"},
		"case matters":        {[]string{"-mermaid", target, "-proposal", "split"}, "-proposal split: zu.policy.yaml declares no such Proposal"},
	} {
		dir := repo(t, files)
		code, out, errOut := run(append([]string{"scan", dir}, c.args...)...)
		if code != ExitBadInvocation || !strings.Contains(errOut, c.why) || out != "" {
			t.Errorf("%s: exit %d, stdout %q, stderr %q; want %d and %q", name, code, out, errOut, ExitBadInvocation, c.why)
		}
		if _, err := os.Stat(filepath.Join(dir, ".zu")); !os.IsNotExist(err) {
			t.Errorf("%s: the IR is written", name)
		}
		if _, err := os.Stat(target); !os.IsNotExist(err) {
			t.Errorf("%s: the diagram is written", name)
		}
	}
}
```

- [ ] **Run:** `go test ./internal/cli -run Mermaid` Expected: FAIL (all 8 tests: `flag provided but not defined: -mermaid`; the bad invocations exit 3, but for `-depth`, `-proposal` and `-mermaid` being undefined, not for their reasons)

- [ ] **Add the flags; check them before the scan; write the diagram after it**

<!-- file: internal/cli/mermaid.go -->
```go
package cli

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"io"

	"zu/internal/ir"
	"zu/internal/mermaid"
	"zu/internal/policy"
	"zu/internal/scan"
)

// mermaidOptions are zu scan's -mermaid, -depth and -proposal (26).
type mermaidOptions struct {
	path     string // "-" for stdout
	depth    int
	proposal string
}

// prepare checks the flags fs parsed before the scan: -depth and -proposal
// need -mermaid and exclude each other, and stdout takes one stream.
func (o *mermaidOptions) prepare(fs *flag.FlagSet, out string) error {
	set := map[string]bool{}
	fs.Visit(func(f *flag.Flag) { set[f.Name] = true })
	switch {
	case o.path == "" && (set["depth"] || set["proposal"]):
		return errors.New("-depth and -proposal need -mermaid")
	case o.depth < 0:
		return errors.New("-depth must be >= 0")
	case set["proposal"] && o.proposal == "":
		return errors.New("-proposal needs a name")
	case set["depth"] && o.proposal != "":
		return errors.New("-depth does not apply with -proposal: a Proposal draws its layers")
	case o.path == "-" && out == "-":
		return errors.New("-out - and -mermaid - would both write to stdout")
	}
	return nil
}

// check fails, before the scan, when -proposal names no Proposal of the
// Policy at tree's root.
func (o *mermaidOptions) check(tree scan.Tree) error {
	if o.proposal == "" {
		return nil
	}
	pol, err := loadPolicy(tree)
	if err != nil {
		return err
	}
	if _, ok := pol.ForProposal(o.proposal); !ok {
		return fmt.Errorf("-proposal %s: %s declares no such Proposal", o.proposal, policy.FileName)
	}
	return nil
}

// write writes the Mermaid Export of doc as pol draws it, to stdout for
// "-", and says on stderr what it drew: the layers it left out, its boxes
// and arrows, and a warning above mermaid.Limit boxes.
func (o *mermaidOptions) write(doc *ir.IR, pol *policy.Policy, stdout, stderr io.Writer) error {
	var d *mermaid.Diagram
	if o.proposal == "" {
		d = mermaid.Tree(doc, pol, o.depth)
	} else {
		var ok bool
		if d, ok = mermaid.Proposal(doc, pol, o.proposal); !ok { // the Policy changed since check
			return fmt.Errorf("-proposal %s: %s declares no such Proposal", o.proposal, policy.FileName)
		}
	}
	var buf bytes.Buffer
	if err := d.Write(&buf); err != nil {
		return err
	}
	var err error
	if o.path == "-" {
		_, err = stdout.Write(buf.Bytes())
	} else {
		err = writeAtomic(o.path, buf.Bytes())
	}
	if err != nil {
		return fmt.Errorf("write: %w", err)
	}
	for _, l := range d.Empty {
		fmt.Fprintf(stderr, "zu scan: mermaid: layer %q of Proposal %q holds no package: not drawn\n", l, o.proposal)
	}
	fmt.Fprintf(stderr, "zu scan: mermaid: %s, %s%s\n", noun(d.Boxes(), "box", "boxes"), noun(len(d.Arrows), "arrow", "arrows"), wroteTo(o.path))
	if d.Boxes() > mermaid.Limit {
		fmt.Fprintf(stderr, "zu scan: mermaid: %d boxes is more than %d; a smaller -depth or a -proposal draws fewer\n", d.Boxes(), mermaid.Limit)
	}
	return nil
}

// noun is n and the noun for it, in the singular for one.
func noun(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}
```

`internal/cli/scan.go`:

```diff
diff --git a/internal/cli/scan.go b/internal/cli/scan.go
index bb9a3d1..6881071 100644
--- a/internal/cli/scan.go
+++ b/internal/cli/scan.go
@@ -34,8 +34,8 @@ var (
 
 // runScan implements `zu scan [dir] [-ref commit | -include-ignored]
 // [-out -|path] [-max-parse-errors N] [-html file [-include pattern]…
-// [-link-template url] [-coverprofile file]]`. Flags may come before or
-// after dir.
+// [-link-template url] [-coverprofile file]] [-mermaid -|file [-depth N |
+// -proposal name]]`. Flags may come before or after dir.
 func runScan(args []string, stdout, stderr io.Writer) int {
 	fs := flag.NewFlagSet("zu scan", flag.ContinueOnError)
 	fs.SetOutput(stderr)
@@ -48,6 +48,10 @@ func runScan(args []string, stdout, stderr io.Writer) int {
 	fs.Var(&hopts.include, "include", "with -html, inline declarations and source of packages matching `pattern` (repeatable; ./ = root module; not -include-ignored)")
 	fs.StringVar(&hopts.linkTmpl, "link-template", "", "source link `url` with {commit} {path} {line}; overrides origin detection")
 	fs.StringVar(&hopts.cover, "coverprofile", "", "with -html, colour packages by CRAP from `file`, written by go test -coverprofile over this tree")
+	var mopts mermaidOptions
+	fs.StringVar(&mopts.path, "mermaid", "", "also write the Package Tree as a Mermaid flowchart to `file` (- for stdout)")
+	fs.IntVar(&mopts.depth, "depth", 1, "with -mermaid, cut the Package Tree `N` levels below each module root")
+	fs.StringVar(&mopts.proposal, "proposal", "", "with -mermaid, draw Proposal `name`'s layers instead of the Package Tree")
 	dir, err := parseWithDir(fs, args)
 	if err != nil {
 		if !errors.Is(err, flag.ErrHelp) {
@@ -67,6 +71,10 @@ func runScan(args []string, stdout, stderr io.Writer) int {
 		fmt.Fprintf(stderr, "zu scan: %v\n", err)
 		return ExitBadInvocation
 	}
+	if err := mopts.prepare(fs, *out); err != nil {
+		fmt.Fprintf(stderr, "zu scan: %v\n", err)
+		return ExitBadInvocation
+	}
 
 	ctx, stop := interruptContext()
 	defer stop()
@@ -76,6 +84,10 @@ func runScan(args []string, stdout, stderr io.Writer) int {
 		return ExitBadInvocation
 	}
 	defer src.close()
+	if err := mopts.check(src.tree); err != nil {
+		fmt.Fprintf(stderr, "zu scan: %v\n", err)
+		return ExitBadInvocation
+	}
 	doc, pol, stats, err := scanSource(ctx, src)
 	if err != nil {
 		fmt.Fprintf(stderr, "zu scan: %v\n", err)
@@ -119,6 +131,12 @@ func runScan(args []string, stdout, stderr io.Writer) int {
 			return ExitBadInvocation
 		}
 	}
+	if mopts.path != "" {
+		if err := mopts.write(doc, pol, stdout, stderr); err != nil {
+			fmt.Fprintf(stderr, "zu scan: mermaid: %v\n", err)
+			return ExitBadInvocation
+		}
+	}
 
 	fmt.Fprintf(stderr, "zu scan: %d packages, %d files, %d parse errors, %d unresolved calls, unsupported: %s%s\n",
 		stats.Packages, stats.Files, stats.ParseErrors, stats.UnresolvedCalls,
```

- [ ] **Run:** `go test ./internal/cli` Expected: PASS

- [ ] **Commit:** `Write the Mermaid Export from zu scan -mermaid`

---

### Task 4: Acceptance

**Files:**
- Record: `docx/features/26-mermaid-export/acceptance.md` (written by hand)

**Steps:**

- [ ] **Run:** `make check` Expected: PASS (read the lint output)

- [ ] **Run:** `make build >/dev/null` Expected: PASS

- [ ] **Run:** `T=$(mktemp -d "$PWD/.zu-accept26.XXXXXX") && ./bin/zu scan internal/scan/testdata/shop -out "$T/ir.json" -mermaid "$T/shop.mmd" && cmp "$T/shop.mmd" internal/mermaid/testdata/shop.mmd; s=$?; rm -rf "${T:?}"; exit $s` Expected: PASS (the binary writes the golden)

- [ ] **Measure** (by hand; not a replay step).
  1. Copy the baseline comparison's clones of litestream (f282d0e), tuios (4417122) and agent-orchestrator (7c83bd6) with `cp -cR`. They are data: let zu parse them, and run nothing of theirs.
  2. In each copy, run `bin/zu scan <copy> -out <scratch>/<repo>.ir.json -mermaid <scratch>/<repo>.d<N>.mmd -depth N` for N = 1 and 2, twice. In agent-orchestrator, also run with `-proposal doc-layers` instead of `-depth`, using the copy's `zu.policy.yaml`. `cmp` each pair.
  3. Parse and render each file with mermaid@11.4.1 in Playwright's Chromium (`web/e2e/node_modules/playwright-core`): `mermaid.parse`, then `mermaid.render`. Count the drawn nodes, subgraphs and edge paths.
  4. Record the table in `acceptance.md`. The step passes when every pair is identical, every file parses and renders with as many nodes, subgraphs and edges as it has boxes, titled groups and arrows, and the boxes, arrows and bytes match this plan's table.

- [ ] **The user's check** (by hand).
  1. Run `zu scan -mermaid arch.mmd` on a repository of the user's own and paste the file into a `mermaid` code block of a Markdown file on GitHub, or into mermaid.live. Say whether the cut at depth 1 is the one the user would draw, or whether `-depth` 2 or a `-proposal` is closer.
  2. Commit the file, scan again without a change, and check that `git diff --exit-code arch.mmd` exits 0.

- [ ] **Commit:** `Record the Mermaid Export's acceptance`

---

## Risks

- **Mermaid refuses more than 500 edges by default.** Measured with mermaid@11.4.1: a flowchart with 500 edges renders, and one with 501 fails with "Edge limit exceeded". `maxEdges` can be raised only in `mermaid.initialize`, not from inside the diagram. The largest measured export has 363 arrows. A diagram with more than 500 arrows has more than 30 boxes in every measured case, so it is warned, but the warning does not say Mermaid will refuse it. Not handled in 26 (**Notes**, follow-ups).
- **Large diagrams draw wide.** tuios at depth 2 rendered 16,685 px wide. Mermaid places the boxes, and zu cannot. The warning above 30 boxes is the only guard.
- **Mermaid reads Markdown and HTML inside labels.** Package paths come from directory names, which may hold `#`, `` ` ``, `<`, `*` and the rest, `~` is legal in a module path, and a Proposal's layer names are free text. Unescaped, Mermaid 11.4.1 reads `#…;` and HTML entities such as `&amp;` as entities, strips HTML tags rather than showing them, fails the whole diagram on a backtick in a layer name, and reads `*` and `~` as Markdown (**Measurements**). The export writes all nine as entities (Architecture 2). A mark that a later Mermaid reads and these nine do not cover would show wrongly until it is added. The Structural Summary's labels are not escaped this way (**Notes**, follow-ups).
- **The file says what it drew, not from which commit.** A reader cannot tell the commit from the file (Deviation 10). The commit that changed it is in git.
- **Depth 1 can fold what a doc names.** tuios's eight named packages fold into "internal · 83 packages". The measured depth-1 cuts are 3 to 34 boxes, and a doc that needs a finer cut takes `-depth 2` or a Proposal.

## Notes

- **Task count: 4**, within Quick mode's limit.
- **TDD:** every task writes its failing tests first, and each red step was seen red for the reason given, on the scratch branch's red commits. Tasks 1 and 2 are red on undefined names. Task 3 is red on undefined flags.
- **The model never authors the graph.** A box is a package, or the packages under one path. An arrow is the IR's import edges between two boxes, counted. A layer is the Policy's. Nothing is inferred.
- **Output stays byte-identical.** Boxes, layers and arrows are in total orders (**Architecture 4**), and the file carries no time, commit or version. The IR is unchanged.
- **File mode: no change.** The diagram is written by `writeAtomic`, which `-html` shares, so a new file is 0600, as `-html`'s page is. Git records a committed copy as 100644 whatever its local mode.
- **Edge cases** are under Architecture 5.
- **Follow-ups, not in 26:**
  - warn when the arrows pass Mermaid's 500;
  - escape the Structural Summary's labels as the export's are (its bytes are 03's contract);
  - fold each module's demoted packages into one box (tuios at depth 1: 23 boxes, not 34);
  - draw a Proposal's declared arrows and their statuses, once 24 lands;
  - draw the Policy's Levels as Mermaid ranks;
  - type-level boxes (22);
  - a `-mermaid` for `zu diff`'s Change View, beyond the Summary's diagram.

## Replay record

Replayed with `replay.py` on a fresh `git archive` of da92a30, in a scratch directory. This plan's directory was copied in, as `git archive HEAD` will give it once the plan is committed. `make check` ran its own `npm ci`. The plan replayed differs from this one only in prose outside its code blocks and **Run** lines. Every step's exit matched its expectation:

| Task | Step | Command | Exit |
|---|---|---|---|
| 1 | red | `go test ./internal/mermaid` | 1 |
| 1 | green | `go test ./internal/mermaid ./internal/diff` | 0 |
| 2 | red | `go test ./internal/mermaid` | 1 |
| 2 | green | `go test ./internal/mermaid` | 0 |
| 3 | red | `go test ./internal/cli -run Mermaid` | 1 |
| 3 | green | `go test ./internal/cli` | 0 |
| 4 | green | `make check` | 0 |
| 4 | green | `make build >/dev/null` | 0 |
| 4 | green | `bin/zu` writes the shop golden (`cmp`) | 0 |

- After Task 4, the replayed tree was byte-identical to the scratch branch's last code commit, 015bfec, in every source file (`diff -rq`, leaving out `node_modules`, `dist`, `bin`, `.zu`, `docx` and test output). That commit's git tree is 670519e. Against the base, 12 files change, with 1,040 lines added and 14 removed.
- `golangci-lint run ./...` in the replayed tree, run directly rather than through the RTK wrapper, exited 0 and printed no issue. `gofmt -l` printed nothing.
- `replay.py` prints only each step's last line, so the red reasons were checked on the scratch branch's red commits:
  - Task 1 (1612d62): `undefined: Label`, `undefined: Node`.
  - Task 2 (4af0e2d): `undefined: Diagram`, `undefined: Tree` and `undefined: Proposal`, then "too many errors".
  - Task 3 (f14eb2c): all eight tests fail with `flag provided but not defined: -mermaid`; the two "alone" bad invocations fail on `-depth` and `-proposal`.
- Task 4's third step made its directory under the replayed tree, with `mktemp -d "$PWD/.zu-accept26.XXXXXX"`, and removed it.
- **With 25.** On a fresh `git archive` of a66fdc5, 25's `replay.py` replayed 25's plan, then this plan's replayed on the same tree. Every step of both matched its expectation, and `golangci-lint run ./...` exited 0 with no issue.
- Toolchain: Go 1.24.5, Node 24.17.0, Python 3.11.17, macOS on an Apple M2.
