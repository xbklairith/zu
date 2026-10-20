# 16 · Fast rescan — Plan

**Status:** APPROVED 2026-09-25 (lead, after scrutiny-16, two revisions and the replay; advisor sign-off); text REVISED 2026-10-20 after a review of 16 to 19 (**Notes**), no code block changed. Ruling on plan16's last question: an edit to the modules stays ungated in 16. It is rare in a review session, its cost is the pre-Task 7 new-package rows, and rebuilding only the parts a changed require reaches is a named follow-up. The cold-tree amendment to requirements l.267 is measured under 14's condition: first runs, committed and pushed, over fresh copies with git's index refreshed (624–839 ms). Held: zu builds it only when the user says go.

**Base.** Every diff here is against `main` at de2c117. The diffs come from a scratch branch built on a `git archive` of de2c117, one commit per task. The plan was replayed on a fresh `git archive` of de2c117 (**Replay record**).

The proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is a copy of 15's, unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. Run it from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 -u docx/features/16-fast-rescan/replay.py docx/features/16-fast-rescan/plan.md "$S"; rm -rf "$S"
```

It needs:
- Go, git, `patch`, Python 3, npm and Node;
- `golangci-lint` (Task 8's `make check`);
- Playwright's three browsers (Tasks 6 and 8).

Two scripts sit beside this plan. Neither is a replay step:
- `measure.mjs` measures `zu serve` end to end (**Measurements**). It is 14's script, with these changes:
  - it parses both "123ms" and "1.023s", and takes a true median (the mean of the two middle values of an even count); `--selftest` checks both;
  - it checks that it saw one watch rescan per round, and warns if not. A save and its commit that straddle two polls give a second, cheaper rescan, which would pull the median down;
  - its clean mode passes `-mr 1`, because a GitHub compare of more than 20 commits gets no line links without it (14b);
  - PKGDIR's import path comes from the nearest `go.mod` above it, so a staging package works. The Project View mode passes that import path to `-include`;
  - with `NEWPKG=1`, each round adds a new package under PKGDIR instead of a function, and waits for the watch's rescan rather than a drawing;
  - with `WAIT=scan`, rounds also wait for the rescan, for a package whose declarations the Project View leaves folded (`util/sets`).
- `firefox-reload.mjs` reproduces Task 6's crash without zu.

---

## Goal

After one edit on kubernetes v1.37.0, `zu serve`'s rescan costs roughly what the edit touched, not the whole tree. The IR stays byte-identical to a cold scan's. 14 missed its rescan budget on a cold tree: 2.30 s and 2.68 s over a freshly copied kubernetes. After 16, on a tree whose git index is fresh:
- after an edit to a package with few importers, or a new package, the rescan has a median of at most 400 ms (Project View) and 1 s (`-base`), and every rescan is under 2 s;
- a function added to a package with 347 importers is gated on "under 2 s" only, with its medians recorded.

Before Task 7, a new package rebuilt every part, and one `-base` rescan in 44 took 2.27 s. Task 7 rebuilds only the new package and the packages importing its path. An edit to the modules (a new `go.mod`, a require line moved) still rebuilds every part. It is rare, and it is not gated; that whole assembly measured 1.2–2.3 s under `-base` (Deviation 8).

Separately, 16 finds the cause of 08's Firefox reload crash in `accept.mjs` and removes it from the harness.

## Architecture

A warm rescan on kubernetes spent about 0.8 of its 0.9 s in five stages. All of them read the whole tree:
- `assemble` (450–510 ms);
- `ir.Sort` (120–170 ms);
- `Policy.Apply` (123–175 ms);
- under `-base`, `diff.Compare` (166–266 ms);
- a second `Lstat` of all 31k listed files for the Change View's hunks (about 107 ms).

16 makes each stage cost what changed, or removes it:

1. **A ListTree lists once (Task 1).** `hunksOf` called `Files()` a second time, which re-ran the `Lstat` pass. A `ListTree` is one scan's listing, so `Files` now keeps its first answer. The pass itself runs four `Lstat`s at a time: the watcher polls two at a time to spare an idle CPU, but a rescan is a burst. `within` stops allocating a string per call; `moduleFor` calls it for every Go file × every module (35 on kubernetes). Because the listing is kept, a file deleted between the scan and the hunks is still listed. `hunksOf` reads a listed file that is gone as empty, as it read an unlisted one before.

2. **The Cache keeps the assembly by package (Task 2).** A package's **Part** (glossary) is what assembling the whole tree gives that package's files:
   - its package node, declarations and edges out of them;
   - its unresolved calls and imports;
   - the externals its imports reach, with their require lines;
   - its Measures.

   A part reads three things beyond its own files' facts:
   - the modules: each `go.mod`'s module path and directory, and each require's path and line (not its version);
   - for each path its imports name, whether the tree holds a package there;
   - through its imports, the **surface** of each package it imports: its Name, function names and type names.

   `Cache.assemble` rebuilds a part when:
   - its files' facts changed (the facts pointers differ; facts are already cached by path and content hash, 10);
   - or it imports a package whose surface changed;
   - or, from Task 7 on, its package is new, or it imports a path where a package appeared or went. Until Task 7, a change to the package set rebuilds every part.

   Everything is rebuilt when the modules changed: a module's path or directory, or a require's path or line. A version-only `go.mod` edit rebuilds nothing, since no part reads a version.

   The parts are joined in order. Each part is sorted once when it is built, as `ir.Sort` would. A part splits into runs: the package's own node, its declarations, and the edges out of each. Sorted by their first element, the runs concatenate to a sorted IR (a package `m/a-b` sorts between `m/a` and `m/a.F`, so parts cannot simply be joined in package order). `ir.Sort` then only checks the order (`sortOnce`), so it never writes to a location list that successive IRs share.

   **When parts are unsafe.** Parts are correct only when no two nodes can share an id and no package's ids fall among another's. Directory names may hold dots: package `m/a.b` and type `b` of `m/a` are both `m/a.b`, and `m/a.F/x` sorts among `m/a`'s declarations. `separable` rules these out. A package id, or a required module path that the tree doesn't hold, must not be another package's id plus "." and more, and a required path must not be a package id. A tree where that fails is assembled whole on every scan, as before. kubernetes, hugo and cobra are all separable. kubernetes' staging modules are required *and* scanned; a require of a module the tree holds never becomes an external, so it is exempt.

   **Keeping the surface honest.** `surfaceOf` sits beside the resolver in `resolve.go`. Its comment says it must mirror what `resolveImport`, `resolveCall` and `embeds` read of an imported package, and the comments of `resolveCall` and `embeds` name it. The Cache's doc says to keep one Cache per sequence of scans of one tree: serve scans its Base without one, and must go on doing so, or every rescan would assemble again, after each scan of the Base, every package the Base and the working tree differ in, and its importers.

   **Proof on real trees.** Besides the random-edit property test, Task 2 adds `TestCorpusRescansMatchColdScans`, which runs only when `ZU_CORPUS` names a writable copy of a corpus tree. As Task 7 leaves it, it makes thirteen edits in one package, after a first scan:
   - a new function, a body-only edit, the function removed;
   - the package renamed, and back;
   - a new file, the file deleted;
   - a file importing a package that does not exist yet;
   - that package added (its import resolves), then deleted;
   - the importing file deleted;
   - a parse error, the error fixed.

   After each, it checks that the rescan through one Cache encodes byte for byte what a cold scan encodes, with the same Measures. The default package is kubernetes' apimachinery `util/sets` (347 importers). From Task 7 on, it also checks that a new or deleted package assembled no more than its importers plus one. Task 8 runs it on kubernetes, hugo and cobra.

3. **Apply with no lens copies nothing it needn't (Task 3).** With no `omit`, `omit_edges` or `foreign`, `Policy.Apply` of an IR in canonical order returns the same nodes and edges, less self-loops, sharing their location lists. Any other IR takes the old path. An equivalence test over random IRs pins the two paths together.

4. **Compare walks two IRs in order side by side (Task 4).** `ir.InOrder` reports an IR sorted with no id or edge twice. `diff.Compare` of two such IRs merges them in one pass, with no map of 110k nodes and 118k edges. Other IRs are matched through maps, as before. Reversed imports are folded from the two short lists of one-sided edges. A property test pins the merge to the maps.

5. **serve keeps its Base in order (Task 5).** The Base IR is sorted once, when it is scanned, so `Compare` takes the merge.

6. **Firefox reload crash (Task 6), separate from the performance work.** Firefox kills a page when a reload lands while a large `blob:` worker script is still loading. zu's page is such a page: Vite inlines ELK's 1.5 MB worker as a `blob:` URL (`?worker&inline`), and `accept.mjs` reloaded twelve times right after `goto` resolved. The page's own code plays no part. A page with no zu code and a 1.5 MB blob worker crashed on 177 of 300 reloads made at once, and on none of 150 made after the worker answered (**Measurements**). Task 6 makes `accept.mjs` wait for the worker's first answer before each of those reloads.

7. **An added or removed package rebuilds only its importers (Task 7).** After Task 2, any change to the package set rebuilds every part: 2,964 on kubernetes for one new package. Task 7 treats a package that appears or goes as a change at its import path. Its own part is built, and so is each part whose imports name that path, as for a changed surface. `index.classify` is the only place a part looks up another package, and it looks up only the exact path an import names. Nothing else a part reads depends on the package set: module roots come from the `go.mod` files, and `separable` is checked again on every scan (Task 7 lists each). An import that named a missing path, and so was unresolved, resolves when a package appears there, and its importer is rebuilt.

What 16 does not make incremental, and why (**Deviations**):
- the View projection (`export.Project`, 36–41 ms);
- `diff.SummarizeDelta` (17–23 ms);
- `export.Change` (about 160 ms);
- `Marshal` (11–29 ms).

The budgets (Deviation 8) are met without them.

The model never authors the graph. 16 changes how the parser's nodes, edges and paths are put together, never which ones there are: every rescan's IR is byte-identical to a cold scan's, which the tests prove over random edit sequences, and the corpus test (`ZU_CORPUS`) checks on copies of the three corpus trees (**Measurements**).

## Out of scope

- **A freshly copied tree's `git status` (Q1; the lead ruled it out of 16).** On a `cp -cRp` copy of kubernetes, every file's ctime and inode are new, so git's index is stale for all of them. zu runs `git status --no-optional-locks`, which never writes the refreshed index back, so git rehashes all 31k files on every rescan: 3.0–4.7 s, whatever zu does. `measure.mjs`'s clean mode escapes it only because its own `git commit` refreshes the index before the first rescan. A plain `git status` (or any git command that takes the index lock) run once by the user fixes it for good. A fresh clone or checkout is not affected: git writes the index as it writes the files. Two fixes were measured:
  - a private index copy in `$TMPDIR` via `GIT_INDEX_FILE`: 64 ms after the first run. It writes a file, which `decisions.md` rules out for `serve` ("it writes nothing to disk");
  - a `status` limited to the files a rescan reads: 21–41 ms, but it no longer sees changes to other tracked files, which `Dirty` reports today.

  Neither is in 16. Scrutiny confirmed the stale index did not cause 13's or 14's misses: both refreshed their copy's index before measuring, and a stale index slows every rescan, not one in eleven.

  **Follow-up:** say it in `zu serve`'s start message when the first `git status` takes more than 1 s ("git's index is stale: run `git status` once").
- **An edit to the modules still assembles the whole tree** (a new `go.mod`, a module path, a require's path or line). Every part reads the modules, so 16 rebuilds them all; under `-base` that costs 1.2–2.3 s on kubernetes (Deviation 8). Rebuilding only the parts whose imports a changed require can reach is a follow-up.
- `zu diff`'s Compare still matches by key: `runDiff` compares unsorted IRs, and it scans each side once, so a merge would save a few hundred milliseconds of a multi-second command. Same Delta either way.
- Keeping the base commit's `CommitTree` open between rescans (`openCommit`, 35–55 ms per `-base` rescan).
- Anything in `web/src`. Feature 15 finished at de2c117; 16's only web change is `web/e2e/accept.mjs`.

## Deviations and decisions for review

1. **No JSON fragments.** The brief suggested per-package fragments or a delta for the JSON marshal. `Marshal` costs 11 ms (Project View) and 27–29 ms (Change View) of a rescan. Fragments would keep a second copy of the View's bytes for that. Not taken.
2. **Compare and Summarize are not limited to changed packages.** Task 4's merge takes `Compare` from 150–185 ms to 30–33 ms on the whole IR, and `SummarizeDelta` costs 17–23 ms. A per-package delta would need the Base split into parts too. Not worth it at these numbers.
3. **`export.Change` (about 160 ms) is left whole.** It is the largest stage left under `-base`: hunks for the 52 changed packages' files, and maps of both IRs. The `-base` budget is met without it; it is the next lever (**Risks**).
4. **Tests red on a build error.** Tasks 2, 3 and 4 add tests that call what the task adds (`Stats.Assembled`, `Policy.apply`, `ir.InOrder`, `compareByKey`), so the red step fails to compile rather than on an assertion. Each test was also run against mutants of the finished code, and each mutant was killed (**Notes**).
5. **Task 1's parallel `Lstat` and `within` have no red test.** They change no behaviour, only time, and run under the existing `ListTree`, parity and watch tests. `go test -race` covers the new goroutines.
6. **The Change View's hunks read the scan's listing.** Before Task 1, `hunksOf` listed the tree again, so a file deleted between the scan and the hunks fell out of the second listing and read as empty. Now it stays listed, and `hunksOf` reads a listed file that is gone as empty too, so the view is what it was (Task 1's second test). The earlier draft called this a fix; it was a regression that the test now pins (scrutiny nit 5).
7. **How the budgets are gated.** A single rescan on a shared machine can run 2–3× its median (GC, another process). "Every rescan under 2 s" is gated on the maximum; the 400 ms and 1 s targets are gated on the median. Task 8 records the load average before each run, and reruns up to twice when it is above 4, keeping every run.
8. **The budgets (the lead's ruling on Q2, scrutiny M2 and M3, and the ruling that added Task 7).** The medians have headroom: 400 ms plain and 1 s with `-base`. The brief's 300 ms is met by the plain rescan (medians 278 and 282 ms), but it sits close to the floor that `git status` sets under load (186–234 ms). The `-base` rescan does not meet 300 ms (medians 559–778 ms). What is left under `-base` is whole-tree work 16 does not split:
   - `export.Change` (about 160 ms, Deviation 3);
   - `Compare` and `SummarizeDelta` (50–75 ms);
   - the Change View's 15 MB `Marshal` (27–29 ms);
   - when committed, git's work for the base commit (`openCommit`, 35–55 ms).

   Getting under 300 ms would take an incremental `export.Change` and a Base kept in parts: a feature of its own.

   The medians cover edits to a package with few importers, and a new package (**Measurements**, worst edits). After Task 7, a new package imported by nothing builds one part: medians of 260 ms plain and 689–747 ms with `-base`, and at most 1,062 ms.

   One costlier edit is gated on "under 2 s" only: **a function added to `util/sets` (347 importers)**. Its medians are 535 ms plain and 863 ms with `-base`, and its slowest rescan took 1,127 ms.

   **Before Task 7, a new package rebuilt every part,** and one `-base` rescan in 44 went over 2 s (2,274 ms, at a starting load of 3.34). The lead ruled that a plan whose own acceptance can fail is not ready, and Task 7 was added.

   **What still assembles the whole tree:** an edit to the modules (a new `go.mod`, a module path, a require's path or line), and a tree that is not separable. The pre-Task 7 new-package rows measure that cost: 1,233–1,298 ms at the fastest, medians of 1,364–1,446 ms, and a slowest rescan of 1,533–2,274 ms under `-base`. Such an edit is rare in a review session, so 16 does not gate it. Rebuilding only the parts that read a changed require would be a follow-up.

## Measurements

Apple M2, 8 cores, one machine shared with other sessions; the load average is printed beside each row. kubernetes v1.37.0 from `.zu/corpus/`, copied with `cp -cRp` into a scratch directory (never written to in place, never cloned). `-base` is `HEAD~50` (24a5b06…, 52 packages changed). Unless a row says otherwise, every edit adds one function to a package. "Before" is b07be19's build, whose Go tree is de2c117's. The after rows for one-function edits came from the first draft's build. The scrutiny-16 revision's build gave the worst-edit rows marked "before Task 7". It changed no timed code path: it added tests, one error check in `hunksOf`, moved a function and edited comments. Task 7's build (all eight tasks) gave the "after Task 7" rows and the corpus-parity runs.

**In process** (a test harness, build tag `prof`, not part of the plan, that times each stage of `session.build`; one-function edit to `pkg/kubelet/kubelet.go`; index refreshed; median of 4–6 warm rounds, ms):

| Stage | Before (b07be19) | After (Task 5) |
|---|---|---|
| `git rev-parse` + `git status`, concurrent with walk → assemble (`build` waits for it) | 59–81 alone, idle; 186–234 at load 4.6–8.3 (scrutiny) | the same |
| walk (listing + `go.mod`s) | 118–128 | 84–102 |
| extract (1 file parsed) | 13 | 13 |
| assemble | 450–510 | 55–85 (4 of 2,963 packages) |
| `ir.Sort` | 120–170 | 8–15 |
| `Policy.Apply` | 123–175 | 19–21 |
| `export.Project` + Mark + metrics | 55–70 | 45–67 |
| `Marshal` | 11–12 | 11 |
| **plain rescan** | **930–1,030** | **260–300** |
| `diff.Compare` | 150–266 | 30–54 |
| `SummarizeDelta` | 17–54 | 17–23 |
| changeView (`export.Change`, hunks, links) | 230–277 | 158–189 |
| **`-base` rescan** | **1,300–1,630** | **470–540** |
| allocation per rescan, plain / `-base` | 786 / 1,064 MB | 185 / 515 MB |

The harness timed the stages it runs, not git: `session.build` starts `gitref.Head` beside the scan and waits for it before it logs "scanned in", so git counts only when it outlasts the scan. It was timed alone, as zu runs it (`-c core.fsmonitor=false -c core.untrackedCache=false --no-optional-locks`, `GIT_OPTIONAL_LOCKS=0`), eight times on a copy whose index was fresh. Under load it is the floor of a plain rescan: at 186–234 ms, it leaves little of a 300 ms budget, which is one reason the medians are gated at 400 ms and 1 s (Deviation 8).

The same harness, on each round, also encoded the rescan's IR and a cold scan's of the same tree, with no Cache: byte-identical every round on kubernetes (107.9 MB of IR), hugo v0.166.0 (193 packages, 4 assembled per edit) and cobra v1.10.2.

**Corpus parity** (`TestCorpusRescansMatchColdScans` as Task 7 leaves it, on `cp -cRp` copies; packages assembled by the rescan, each step byte-identical to a cold scan, with the same Measures):

| Edit | kubernetes, `…/apimachinery/pkg/util/sets` | hugo, `common/hugio` | cobra, `doc` |
|---|---|---|---|
| first scan | 2,963 of 2,963 | 193 of 193 | 2 of 2 |
| new function | 347 | 26 | 1 |
| body-only edit | 1 | 1 | 1 |
| function removed | 347 | 26 | 1 |
| package renamed | 347 | 26 | 1 |
| package renamed back | 347 | 26 | 1 |
| new file (a type) | 347 | 26 | 1 |
| file deleted | 347 | 26 | 1 |
| a file importing a missing package (`zz_uses.go`) | 347 | 26 | 1 |
| new package (`zzparity`: that import resolves) | 2 of 2,964 | 2 of 194 | 2 of 3 |
| package deleted (the import is unresolved again) | 1 | 1 | 1 |
| the importing file deleted | 347 | 26 | 1 |
| parse error (a file added) | 0 | 0 | 0 |
| parse error fixed | 0 | 0 | 0 |
| time | 72 s | 3.7 s | 0.2 s |

Before Task 7, a new package (then imported by nothing) assembled 2,964 of 2,964, 194 of 194 and 3 of 3 packages, and its deletion 2,963, 193 and 2.

A file that fails to parse contributes no facts to its package, so the parts stand and only the IR's parse errors change. With Name dropped from `surfaceOf` (a mutant), the hugo run fails at "package renamed". The View JSON `zu serve` sends for kubernetes, before and after, differs only in the `tool` field (the build's version): 6.2 MB (Project View) and 15.2 MB (Change View).

**End to end** (`measure.mjs`, 11 edits each, 1 s poll; watch rescan as `zu serve` logs it; write → drawn in Chromium):

Two sessions. **Paired** runs were taken one after another in one script, the before binary (b07be19's build) then the after binary (the first draft's scratch branch at Task 5), on a fresh copy of kubernetes whose index was refreshed once for the uncommitted rows, and on two untouched fresh copies for the committed rows. **Earlier** runs were taken on another fresh copy a few hours before. Watch rescan as min / median / max, write → drawn as the median, ms:

| Run | Load | Before: rescan | Before: drawn | After: rescan | After: drawn |
|---|---|---|---|---|---|
| Project View, `pkg/util/env`, uncommitted (paired) | 3.4–5.1 | 901 / 940 / 1,077 | 1,781 | 255 / 282 / 353 | 1,034 |
| the same (earlier) | 3.0–3.1 | 870 / 903 / 960 | 1,695 | 249 / 278 / 301 | 1,007 |
| `-base HEAD~50`, `pkg/kubelet`, uncommitted (paired) | 3.2–5.0 | 1,349 / 1,432 / 1,855 | 2,403 | 482 / 657 / 814 | 1,482 |
| the same (earlier; before at load 2.9, after at 3.1) | 2.9–3.1 | 1,227 / 1,324 / 4,921 | 2,612 | 488 / 559 / 686 | 1,426 |
| `-base HEAD~50`, committed and pushed, **first runs over a fresh copy** (paired) | 3.9–4.2 | 1,375 / 1,474 / 1,592 | 2,605 | 624 / 778 / 828 | 1,945 |
| the same (earlier) | 3.2–7.5 | 1,519 / 1,668 / 2,231 | 2,887 | 629 / 733 / 839 | 1,883 |

- The earlier uncommitted `-base` before-row ran into another session's burst from its seventh edit on (2.5–4.9 s). Its first six edits (1,227–1,324 ms) match the paired row.
- The earlier committed before-row went over 2 s once (2,231 ms), as 14's acceptance did. No after-row went over 839 ms.
- Page-load scans (the first after start) are not rescans and are not in the table: 2.7–6.8 s cold and 0.46–1.1 s warm after, 2.9–7.8 s and 1.1–2.1 s before.
- Write → drawn includes the 1 s poll, the page's fetch and ELK's layout in Chromium.

**Worst edits** (after only). `measure.mjs` ran on a fresh copy whose index was refreshed, uncommitted, 11 rounds each, under Task 8's load rule. Each new package (`NEWPKG=1`) is imported by nothing. Watch rescans are min / median / max, in ms:

| Edit | Build | View | Start load | Rescan |
|---|---|---|---|---|
| a new package under `pkg/util/env` | after Task 7 | Project View | 3.73 | 248 / 260 / 350 |
| a new package under `pkg/kubelet` | after Task 7 | `-base HEAD~50` | 3.95 | 626 / 747 / 1,062 |
| the same, again | after Task 7 | `-base HEAD~50` | 3.90 | 568 / 689 / 922 |
| a function added to `…/apimachinery/pkg/util/sets` (347 importers), `WAIT=scan` | before Task 7 | Project View | 3.90 | 430 / 535 / 619 |
| the same | before Task 7 | `-base HEAD~50` | 3.98 | 839 / 863 / 1,127 (write → drawn median 1,835) |
| a new package under `pkg/util/env` (a whole assembly) | before Task 7 | Project View | 3.75 | 935 / 1,020 / 1,135 |
| a new package under `pkg/kubelet` (a whole assembly) | before Task 7 | `-base HEAD~50` | 3.34 | 1,268 / 1,446 / **2,274** |
| the same, again | before Task 7 | `-base HEAD~50` | 3.98 | 1,298 / 1,386 / 1,884 |
| the same, again | before Task 7 | `-base HEAD~50` | 4.19 (over the rule's 4; kept) | 1,243 / 1,364 / 1,533 |
| the same, again | before Task 7 | `-base HEAD~50` | 3.94 | 1,233 / 1,401 / 1,983 |

Task 7 changes nothing on the `util/sets` rows' path: a new function there rebuilds its 347 importers either way.

- Every run saw one watch rescan per round.
- The `util/sets` Project View rows took six failed attempts before one succeeded:
  - three passed `-include ./…`, which names only the root module (`measure.mjs` now passes the import path);
  - three waited for a drawing of the package's declarations, which the Project View leaves folded. That row now waits for the rescan (`WAIT=scan`).
- Before Task 7, a new package cost a whole assembly: about 0.7 s over a one-function edit. After it, the new-package rows sit with the one-function rows (Project View median 260 ms against 278–282; `-base` 689–747 ms against 559–657 uncommitted). The load was 7.15 when the after-Task 7 runs were due, so the first waited about a minute for it to fall below 4. Each run waited for a load of at most 4 before it started.

**Firefox** (Playwright's Firefox 155.0, `firefox-reload.mjs` and a copy of `accept.mjs` reduced to Firefox, crashes counted without accept.mjs's rerun):

| Page | Reload | Pages crashed |
|---|---|---|
| no zu code, 1.5 MB `blob:` worker (`firefox-reload.mjs` `big-now` and its first draft) | at once after `goto` | 177 / 300, 53 / 100, 12 / 40 |
| the same (`big-after`) | after the worker answered | 0 / 150, 0 / 40 |
| no zu code, 200-byte `blob:` worker (`small-now`) | at once | 0 / 300, 0 / 40 |
| the same, the worker terminated and restarted meanwhile | at once | 0 / 300 |
| zu's page (built `policy.html` from `accept.mjs`'s fixtures) | at once after `goto` | 3 / 130 |
| the same | after the first drawing | 0 / 200 |
| zu's page with `worker-src blob:` dropped from its CSP, so no worker loads | at once | 0 / 100 |
| `accept.mjs`, Firefox only, before Task 6 | as it was | 1 crash in 12 runs |
| `accept.mjs`, Firefox only, after Task 6 | after `loaded` | 0 crashes in 11 runs |

Release Firefox is not installed on this machine, so the minimal repro was not tried there; none was installed. Scrutiny's rerun of `firefox-reload.mjs` crashed 46 of 80 and 39 of 60 `big-now` reloads, and two page-side variants still crashed: the worker terminated on `pagehide` (54 of 80) and a `data:` URL worker (20 of 60).

The evidence is the mechanism, shown by the rows without zu: the crash needs a large `blob:` worker whose script is still loading when the reload lands, and nothing else. The `accept.mjs` rows alone (1 in 12 against 0 in 11) would not show a difference.

## Doc amendments (exact text; not task steps)

1. `docx/core/decisions.md`, Serve bullet. Replace

   > Each page load rescans; `scan.Cache` re-parses only files whose content changed, and the IR stays byte-identical to a cold scan's.

   with

   > Each page load rescans; `scan.Cache` re-parses only files whose content changed and assembles again only the packages whose files changed, that are new, or that import a path where a package appeared, went, or changed its name, functions or types (16). It assembles the whole tree when the modules change (a module's path or directory, or a require's path or line; a version alone changes nothing), or when two packages' ids could meet through dotted directory names. The IR stays byte-identical to a cold scan's; `TestCorpusRescansMatchColdScans` checks it on a copy of a corpus tree.

   and, after the **UI v1** bullet, add:

   > - **Firefox reload (16):** in Playwright's Firefox 155, reloading a zu page within about a second of its load can crash the tab: Firefox kills a page reloaded while a large `blob:` worker script (ELK's, 1.5 MB, inlined by Vite) is still loading. A page with no zu code and such a worker shows it; a 200-byte worker does not. Two page-side mitigations were tried and failed: terminating the worker on `pagehide`, and a `data:` URL worker. Loading the worker from a separate file would break the single-file page (ADR 0006). So the browser checks wait for the worker before a reload, and the page is unchanged. Whether release Firefox does too is untested: none was installed where 16 was measured.

2. `docx/core/requirements-draft.md`, the `zu serve -base` (14) line. Replace

   > the watch's rescan under 2 s: **not met on a cold tree**. The first run over a freshly copied tree went over twice out of two (2.30 s and 2.68 s, with a median save → drawn of 2.95 s, at a load average of 4.9–5.7). Later runs over the same tree stayed at most 1.95 s. Rescan-profile fix 1 is the planned remedy,

   with

   > the watch's rescan under 2 s: not met on a cold tree at 14 (2.30 s and 2.68 s over a freshly copied tree, at a load average of 4.9–5.7), met by 16 (624–839 ms in two runs over a freshly copied tree, committed and pushed),

   and add after it:

   > - Rescan in `zu serve` (16): on kubernetes v1.37.0 with git's index fresh, after an edit to a package with few importers, or a new package:
   >   - the watch's rescan has a median of at most 400 ms (measured 278 and 282 ms after a new function, 260 ms after a new package);
   >   - with `-base` at `HEAD~50`, a median of at most 1 s (measured 559 and 657 ms uncommitted and 733 and 778 ms committed and pushed after a new function, 689 and 747 ms after a new package);
   >   - every rescan stays under 2 s, the first over a freshly copied tree included (measured at most 1,062 ms).
   >
   >   A function added to a package with 347 importers is gated on 2 s only: medians of 535 ms, and 863 ms with `-base`; at most 1,127 ms.
   >
   >   **Not gated:** an edit to the modules (a new `go.mod`, a module path, a require's path or line) still assembles the whole tree. Under `-base` that measured 1.2–2.3 s, once over 2 s in 44 rescans.
   >
   >   The rescan's IR stays byte-identical to a cold scan's, checked on copies of kubernetes, hugo and cobra (`TestCorpusRescansMatchColdScans`). A freshly *copied* tree's first `git status` is not covered: until git's index is refreshed, `git status` alone takes 3–5 s (16, Out of scope).

3. `docx/features/10-serve/rescan-profile.md`, after the "Taken by feature 13" paragraph, add:

   > **Taken by feature 16 (2026-09-25):** fix 1 as its smaller step: the Cache keeps each package's part of the assembly and rebuilds only the parts whose files or imported surfaces changed, a new package's, and those of the packages importing a new or removed package's path (all of them when the modules change), joined in order so `ir.Sort` only checks. Fix 5 in another form: a `ListTree` lists once, so the Change View's hunks no longer re-run the `Lstat` pass. `Policy.Apply` with no lens and `diff.Compare` of two sorted IRs no longer copy or map the whole IR. A one-edit rescan on kubernetes now takes 260–300 ms in process (470–540 ms with `-base`); see `docx/features/16-fast-rescan/plan.md`, Measurements. Fix 4 was not taken: a no-change rescan now costs little more than its walk.

4. `docx/glossary.md`, after **IR**, add:

   > ## Part
   >
   > One package's share of the IR, as `scan.Cache` keeps it between scans (16): the package node, its declarations, the edges out of them, its unresolved calls and imports, and the externals its imports reach. A rescan builds a package's part again when the package is new, when its files changed, or when a path it imports gained or lost a package, or that package's name, functions or types changed. It reuses the part otherwise. It builds every part again when the modules changed (a module's path or directory, or a require's path or line; not a version). The IR joined from parts is byte-identical to a cold scan's.

## Tasks

### Task 1: A ListTree lists once, a few files at a time (`scan`, `export`)

The test (`listtree_test.go`) lists a tree, deletes a file, and lists again: the second `Files` must return the first listing and Stamps. That is what the Change View's hunks need, and it is red today because `Files` re-runs the `Lstat` pass.

Keeping the listing has one consequence. Before, a file deleted between the scan and the Change View's hunks (a checkout mid-rescan) fell out of the second listing and read as empty. Now it is still listed, and `ReadFile` fails, which would fail the whole view. A second test (`hunksof_test.go`) deletes a listed file before `hunksOf` reads it; it passes on `main` and fails once the listing is kept, so it is written after it. `hunksOf` then reads a missing file as empty, as before.

**Files:**
- Test: `internal/scan/listtree_test.go`, `internal/export/hunksof_test.go` (new)
- Code: `internal/scan/tree.go`, `internal/scan/walk.go`, `internal/export/change.go`

**Steps:**

- [x] **Write the failing test**

```diff
diff --git a/internal/scan/listtree_test.go b/internal/scan/listtree_test.go
index 181f769fe171da574fe73accba0a50e914c17223..17b901cdabd8687e9c2b6889ce8d6478a744d05c 100644
--- a/internal/scan/listtree_test.go
+++ b/internal/scan/listtree_test.go
@@ -86,3 +86,29 @@ func TestListTreeRootMustBeADirectory(t *testing.T) {
 		t.Error("ListTree of a missing root must fail")
 	}
 }
+
+// A ListTree is one scan's listing: Files runs its Lstat pass once, and a
+// later call (the Change View's hunks, 16) returns the same listing and
+// Stamps, not what is on disk by then.
+func TestListTreeListsOnce(t *testing.T) {
+	root := tree(t, map[string]string{"go.mod": "module example.com/m\n", "a/a.go": "package a\n"})
+	lt, err := ListTree(root, []string{"go.mod", "a/a.go"})
+	if err != nil {
+		t.Fatal(err)
+	}
+	first, _, err := lt.Files()
+	if err != nil {
+		t.Fatal(err)
+	}
+	st := StampIn(lt, "a/a.go")
+	if err := os.Remove(filepath.Join(root, "a", "a.go")); err != nil {
+		t.Fatal(err)
+	}
+	again, _, err := lt.Files()
+	if err != nil || !slices.Equal(again, first) {
+		t.Fatalf("second Files = %v, %v; want the first listing %v", again, err, first)
+	}
+	if StampIn(lt, "a/a.go") != st {
+		t.Error("the second Files changed a Stamp")
+	}
+}
```

- [x] **Run:** `go test ./internal/scan -run TestListTreeListsOnce` Expected: FAIL (the second `Files` misses `a/a.go`)

- [x] **List once, four `Lstat`s at a time; `within` without a string**

```diff
diff --git a/internal/scan/tree.go b/internal/scan/tree.go
index c1d82febd9c7a129ebcf10feaa6668b3d6b4093b..e3532185e3f559902dac62106af55e868bfadc86 100644
--- a/internal/scan/tree.go
+++ b/internal/scan/tree.go
@@ -10,6 +10,7 @@ import (
 	"path/filepath"
 	"slices"
 	"strings"
+	"sync"
 
 	"zu/internal/ir"
 )
@@ -73,12 +74,18 @@ type listTree struct {
 	*dirTree
 	listed []string
 	stamps map[string]Stamp // each listed file's Stamp, from Files' Lstat
+	// once guards files and errs: Files lists once, so a second caller in
+	// the same scan (the Change View's hunks) skips the Lstat pass (16).
+	once  sync.Once
+	files []string
+	errs  []ir.ParseError
 }
 
 // ListTree is the directory at root, restricted to files: slash paths
 // relative to root, in any order. Of those, Files keeps what DirTree would:
 // regular files and in-tree file symlinks outside pruned directories. Listed
-// paths missing from disk are skipped.
+// paths missing from disk are skipped. Files lists once: a later call returns
+// the first listing and Stamps (16).
 func ListTree(root string, files []string) (Tree, error) {
 	d, err := openDir(root)
 	if err != nil {
@@ -88,33 +95,58 @@ func ListTree(root string, files []string) (Tree, error) {
 }
 
 func (l *listTree) Files() ([]string, []ir.ParseError, error) {
+	l.once.Do(func() { l.files, l.errs = l.list() })
+	return slices.Clone(l.files), slices.Clone(l.errs), nil
+}
+
+func (l *listTree) list() ([]string, []ir.ParseError) {
+	listed := slices.Compact(slices.Sorted(slices.Values(l.listed)))
+	listed = slices.DeleteFunc(listed, func(rel string) bool {
+		dirs := strings.Split(rel, "/")
+		return slices.ContainsFunc(dirs[:len(dirs)-1], PrunedDir)
+	})
+	// Lstat each listed file, a few at a time: kubernetes lists 28k, and one
+	// at a time takes 100ms of a rescan (16).
+	type seen struct {
+		st   Stamp
+		keep bool
+		err  error
+	}
+	got := make([]seen, len(listed))
+	var wg sync.WaitGroup
+	const workers = 4
+	for k := range workers {
+		wg.Add(1)
+		go func() {
+			defer wg.Done()
+			for i := k; i < len(listed); i += workers {
+				p := filepath.Join(l.root, filepath.FromSlash(listed[i]))
+				info, err := os.Lstat(p)
+				switch {
+				case errors.Is(err, fs.ErrNotExist):
+				case err != nil:
+					got[i].err = err
+				case info.Mode().IsRegular(), info.Mode()&fs.ModeSymlink != 0 && l.linkedFileInside(p):
+					got[i] = seen{st: StampOf(info), keep: true}
+				}
+			}
+		}()
+	}
+	wg.Wait()
 	var files []string
 	var errs []ir.ParseError
-	stamps := map[string]Stamp{}
-	listed := slices.Sorted(slices.Values(l.listed))
-	for _, rel := range slices.Compact(listed) {
-		dirs := strings.Split(rel, "/")
-		if slices.ContainsFunc(dirs[:len(dirs)-1], PrunedDir) {
-			continue
+	stamps := make(map[string]Stamp, len(listed))
+	for i, rel := range listed {
+		switch g := got[i]; {
+		case g.err != nil:
+			errs = append(errs, ir.ParseError{Path: rel, Message: ioMessage(g.err)})
+		case g.keep:
+			files = append(files, rel)
+			stamps[rel] = g.st
 		}
-		p := filepath.Join(l.root, filepath.FromSlash(rel))
-		info, err := os.Lstat(p)
-		switch {
-		case errors.Is(err, fs.ErrNotExist):
-			continue
-		case err != nil:
-			errs = append(errs, ir.ParseError{Path: rel, Message: ioMessage(err)})
-			continue
-		case info.Mode().IsRegular():
-		case info.Mode()&fs.ModeSymlink != 0 && l.linkedFileInside(p):
-		default:
-			continue
-		}
-		files = append(files, rel)
-		stamps[rel] = StampOf(info)
 	}
 	l.stamps = stamps
-	return files, errs, nil
+	return files, errs
 }
 
 // stamp is rel's Stamp as Files saw it, or zero before Files runs.
diff --git a/internal/scan/walk.go b/internal/scan/walk.go
index 176827d98ff07782f0365b58615725b9e502bd4f..6f1b909d5958348be3f3cb414a0446be432f275e 100644
--- a/internal/scan/walk.go
+++ b/internal/scan/walk.go
@@ -130,7 +130,7 @@ func (w *walkResult) moduleFor(dir string) *module {
 }
 
 func within(dir, base string) bool {
-	return base == "." || dir == base || strings.HasPrefix(dir, base+"/")
+	return base == "." || strings.HasPrefix(dir, base) && (len(dir) == len(base) || dir[len(base)] == '/')
 }
 
 // importPath is the import path of the package in dir, which lies in m.
```

- [x] **Run:** `go test -race ./internal/scan ./internal/watch ./internal/cli` Expected: PASS

- [x] **Write the failing test: a file deleted after the listing**

```diff
diff --git a/internal/export/hunksof_test.go b/internal/export/hunksof_test.go
new file mode 100644
index 0000000000000000000000000000000000000000..5e187015c93efdba030ec1068b2f21e6b66cb95e
--- /dev/null
+++ b/internal/export/hunksof_test.go
@@ -0,0 +1,43 @@
+package export
+
+import (
+	"os"
+	"path/filepath"
+	"reflect"
+	"testing"
+
+	"zu/internal/scan"
+)
+
+// A file the scan listed may be gone by the time the Change View reads it (a
+// checkout mid-rescan). It reads as empty, as a file absent from the listing
+// does, rather than failing the view (16).
+func TestHunksOfAFileDeletedAfterTheListing(t *testing.T) {
+	src := []byte("package a\n\nfunc F() {}\n")
+	tree := func() (string, scan.Tree) {
+		dir := t.TempDir()
+		if err := os.WriteFile(filepath.Join(dir, "a.go"), src, 0o644); err != nil {
+			t.Fatal(err)
+		}
+		tr, err := scan.ListTree(dir, []string{"a.go"})
+		if err != nil {
+			t.Fatal(err)
+		}
+		if _, _, err := tr.Files(); err != nil { // the scan lists the tree
+			t.Fatal(err)
+		}
+		return dir, tr
+	}
+	_, base := tree()
+	dir, head := tree()
+	if err := os.Remove(filepath.Join(dir, "a.go")); err != nil {
+		t.Fatal(err)
+	}
+	got, err := hunksOf(map[string]bool{"a.go": true}, base, head)
+	if err != nil {
+		t.Fatalf("hunksOf: %v", err)
+	}
+	if want := Hunks(src, nil); !reflect.DeepEqual(got["a.go"], want) {
+		t.Errorf("hunks of a.go = %+v, want %+v", got["a.go"], want)
+	}
+}
```

- [x] **Run:** `go test ./internal/export -run TestHunksOfAFileDeletedAfterTheListing` Expected: FAIL (`read head a.go: … no such file or directory`)

- [x] **Read a listed file that is gone as empty**

```diff
diff --git a/internal/export/change.go b/internal/export/change.go
index 4e4e14c3e98fd347aeba9b9b21abfa82af33bad2..966fec1059b6db3108bb06572046c2546bd26606 100644
--- a/internal/export/change.go
+++ b/internal/export/change.go
@@ -1,7 +1,9 @@
 package export
 
 import (
+	"errors"
 	"fmt"
+	"io/fs"
 	"path/filepath"
 	"slices"
 
@@ -190,7 +192,13 @@ func hunksOf(files map[string]bool, baseTree, headTree scan.Tree) (map[string][]
 			if _, ok := slices.BinarySearch(list, p); !ok {
 				return nil, nil
 			}
-			return t.ReadFile(p)
+			// A listed file deleted since (a checkout mid-rescan) reads as
+			// empty too: the listing is the scan's, kept (16).
+			b, err := t.ReadFile(p)
+			if errors.Is(err, fs.ErrNotExist) {
+				return nil, nil
+			}
+			return b, err
 		}, nil
 	}
 	readBase, err := read(baseTree)
```

- [x] **Run:** `go test ./internal/export ./internal/cli` Expected: PASS

- [x] **Commit:** `List a tree once per scan, a few files at a time`

---

### Task 2: The Cache assembles only the packages whose inputs changed (`scan`)

The tests (`assembly_test.go`) check, on the shop fixture and on hand-built trees:
- how many packages a rescan assembles after each kind of edit:
  - none after no change;
  - one after a body edit;
  - the package and its importers after a function is added or removed, or a package renamed;
  - all after a package is added or a require's line moves (Task 7 narrows the first to the new package alone);
  - none after a version-only `go.mod` change;
- that trees whose ids may meet are assembled whole, every time:
  - a method against a function under a dotted directory;
  - a type against a required module;
  - a package below a directory named as a declaration (`m/a.F/x`);
- that a required module the tree scans does not force a whole assembly;
- that parts join in order when a package id sorts between another's and its declarations (`m/a-b`);
- over 6 seeds × 60 random edits to a random two-module tree, that each rescan through one Cache encodes byte for byte what a cold scan encodes, with the same Measures and Stats, and with at least 10 rescans assembling only part of the tree. The edits are rewrites, adds, deletes, `go.mod` changes, package-clause changes and whitespace, over dotted, dashed and nested directories, build-ignored and unparseable files.

`corpus_parity_test.go` makes the same check on a real tree, after twelve kinds of edit in one package (**Architecture** 2). It skips unless `ZU_CORPUS` names a writable copy of a corpus tree, so the replay runs it as a skip; Task 8 runs it by hand. Task 7 replaces its two new-package steps with four that import the new package before it exists. `surfaceOf` goes into `resolve.go`, beside what it mirrors.

**Files:**
- Test: `internal/scan/assembly_test.go` (new), `internal/scan/corpus_parity_test.go` (new)
- Code: `internal/scan/assembly.go` (new), `internal/scan/resolve.go`, `internal/scan/build.go`, `internal/scan/cache.go`, `internal/scan/scan.go`, `internal/ir/encode.go`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/scan/assembly_test.go b/internal/scan/assembly_test.go
new file mode 100644
index 0000000000000000000000000000000000000000..fc8721a54eb4af21aa57543e7ea6bfa2f0db088f
--- /dev/null
+++ b/internal/scan/assembly_test.go
@@ -0,0 +1,456 @@
+package scan
+
+import (
+	"bytes"
+	"context"
+	"fmt"
+	"math/rand/v2"
+	"os"
+	"path"
+	"path/filepath"
+	"reflect"
+	"slices"
+	"strings"
+	"testing"
+
+	"zu/internal/ir"
+)
+
+// A rescan through a Cache assembles again only the packages whose inputs
+// changed (16): a package whose files changed, every package importing one
+// whose Name, functions or types changed, and all of them when a go.mod or
+// the set of packages changed. Every IR is a cold scan's, byte for byte.
+func TestCacheAssemblesOnlyWhatChanged(t *testing.T) {
+	root := fixture(t, "shop")
+	cache := NewCache()
+	money := "example.com/shop/internal/money"
+	step := func(name string, want func(cold *ir.IR, cs Stats) int) {
+		t.Helper()
+		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
+		if err != nil {
+			t.Fatal(err)
+		}
+		cold, cs := run(t, root, 0)
+		if !bytes.Equal(encode(t, warm), encode(t, cold)) {
+			t.Errorf("%s: the IR differs from a cold scan's", name)
+		}
+		if !reflect.DeepEqual(ws.Measures, cs.Measures) {
+			t.Errorf("%s: the Measures differ from a cold scan's", name)
+		}
+		if n := want(cold, cs); ws.Assembled != n {
+			t.Errorf("%s: assembled %d packages, want %d", name, ws.Assembled, n)
+		}
+		if cs.Assembled != cs.Packages {
+			t.Errorf("%s: a cold scan assembled %d of %d packages", name, cs.Assembled, cs.Packages)
+		}
+	}
+	all := func(_ *ir.IR, cs Stats) int { return cs.Packages }
+	n := func(k int) func(*ir.IR, Stats) int { return func(*ir.IR, Stats) int { return k } }
+	// money and each package that imports it.
+	moneyAndImporters := func(cold *ir.IR, _ Stats) int {
+		k := 1
+		for _, e := range cold.Edges {
+			if e.Kind == ir.EdgeImports && e.To == money {
+				k++
+			}
+		}
+		if k < 2 {
+			t.Fatal("the fixture changed: nothing imports money")
+		}
+		return k
+	}
+	write := func(rel, body string) {
+		t.Helper()
+		p := filepath.Join(root, filepath.FromSlash(rel))
+		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
+			t.Fatal(err)
+		}
+		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
+			t.Fatal(err)
+		}
+	}
+	old, err := os.ReadFile(filepath.Join(root, "internal", "money", "money.go"))
+	if err != nil || !bytes.Contains(old, []byte("{ return a + b }")) {
+		t.Fatal("the fixture changed: money.go has no Add returning a + b")
+	}
+	moneyGo := strings.Replace(string(old), "a + b", "%s", 1)
+
+	step("first scan", all)
+	step("no change", n(0))
+	write("internal/money/money.go", fmt.Sprintf(moneyGo, "b + a"))
+	step("a body", n(1))
+	write("internal/money/neg.go", "package money\n\n// Neg negates.\nfunc Neg(a Cents) Cents { return -a }\n")
+	step("a new function", moneyAndImporters)
+	write("internal/money/neg.go", "package money\n\n// Neg negates.\nfunc Neg(a Cents) Cents { return 0 - a }\n")
+	step("its body", n(1))
+	if err := os.Remove(filepath.Join(root, "internal", "money", "neg.go")); err != nil {
+		t.Fatal(err)
+	}
+	step("the function gone", moneyAndImporters)
+	write("internal/extra/extra.go", "package extra\n")
+	step("a new package", all)
+	if err := os.Rename(filepath.Join(root, "internal", "extra"), filepath.Join(root, "internal", "other")); err != nil {
+		t.Fatal(err)
+	}
+	step("a package renamed", all) // as many packages as before, one of them new
+	write("go.mod", "module example.com/shop\n\ngo 1.24\n\nrequire (\n\tgithub.com/lib/pq v1.10.9\n\tgolang.org/x/sync v0.9.0\n)\n")
+	step("a version in go.mod", n(0)) // the IR holds require lines, not versions
+	write("go.mod", "module example.com/shop\n\ngo 1.24\n\n// the requires move down a line\nrequire (\n\tgithub.com/lib/pq v1.10.9\n\tgolang.org/x/sync v0.9.0\n)\n")
+	step("a require's line", all)
+	step("no change again", n(0))
+}
+
+// A package importing another resolves its calls by the other's Name, so
+// a new package clause alone assembles its importers again.
+func TestCacheAssemblesImportersOfARenamedPackage(t *testing.T) {
+	root := tree(t, map[string]string{
+		"go.mod": "module example.com/m\n",
+		"a/a.go": "package a\n\nfunc F() {}\n",
+		"b/b.go": "package b\n\nimport \"example.com/m/a\"\n\nfunc G() { a.F() }\n",
+	})
+	cache := NewCache()
+	for i, clause := range []string{"package a", "package z", "package a"} {
+		if err := os.WriteFile(filepath.Join(root, "a", "a.go"), []byte(clause+"\n\nfunc F() {}\n"), 0o644); err != nil {
+			t.Fatal(err)
+		}
+		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
+		if err != nil {
+			t.Fatal(err)
+		}
+		cold, _ := run(t, root, 0)
+		if !bytes.Equal(encode(t, warm), encode(t, cold)) {
+			t.Errorf("%s: the IR differs from a cold scan's", clause)
+		}
+		if i > 0 && ws.Assembled != 2 {
+			t.Errorf("%s: assembled %d packages, want a and b", clause, ws.Assembled)
+		}
+	}
+}
+
+// Dots are legal in directory names, so two nodes can share an id: a
+// declaration and a package, two declarations, or a declaration and a
+// required module. Then the scan assembles the whole tree every time, as it
+// did before 16, and the IR is still a cold scan's.
+func TestCacheAssemblesWholeWhereIDsMayMeet(t *testing.T) {
+	for name, files := range map[string]map[string]string{
+		"a method and a function": {
+			"go.mod":   "module example.com/m\n",
+			"a/a.go":   "package a\n\ntype b struct{}\n\nfunc (b) c() {}\n",
+			"a.b/c.go": "package x\n\nfunc c() {}\n",
+		},
+		"a package below a directory named as a declaration": { // m/a.F/x sorts between m/a.F and m/a.T
+			"go.mod":     "module example.com/m\n",
+			"a/a.go":     "package a\n\nfunc F() {}\n\ntype T struct{}\n",
+			"a.F/x/x.go": "package x\n\nfunc G() {}\n",
+		},
+		"a type and a required module": {
+			"go.mod": "module example.com/m\n\nrequire example.com/m/a.b v1.0.0\n",
+			"a/a.go": "package a\n\ntype b struct{}\n",
+			"c/c.go": "package c\n\nimport \"example.com/m/a.b/x\"\n\nfunc F() { x.G() }\n",
+		},
+	} {
+		root := tree(t, files)
+		cache := NewCache()
+		for _, when := range []string{"first", "again"} {
+			warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
+			if err != nil {
+				t.Fatal(err)
+			}
+			cold, cs := run(t, root, 0)
+			if !bytes.Equal(encode(t, warm), encode(t, cold)) {
+				t.Errorf("%s, %s: the IR differs from a cold scan's", name, when)
+			}
+			if ws.Assembled != cs.Packages {
+				t.Errorf("%s, %s: assembled %d of %d packages; want all", name, when, ws.Assembled, cs.Packages)
+			}
+		}
+	}
+}
+
+// Random edits to a random tree: after each, a rescan through one Cache
+// writes the IR and the Measures a cold scan writes. The tree has two
+// modules, requires, dotted and nested directories, package clauses that
+// differ from the directory, build-ignored and unparseable files, and calls,
+// embeds and imports between its packages.
+func TestCacheRescansMatchColdScansOverRandomEdits(t *testing.T) {
+	for seed := range uint64(6) {
+		t.Run(fmt.Sprint(seed), func(t *testing.T) {
+			g := &gen{r: rand.New(rand.NewPCG(seed, 16)), files: map[string]string{}}
+			root := t.TempDir()
+			g.init()
+			cache := NewCache()
+			partial := 0
+			for i := range 60 {
+				what := g.edit()
+				g.sync(t, root)
+				warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
+				if err != nil {
+					t.Fatalf("step %d (%s): %v", i, what, err)
+				}
+				cold, cs := run(t, root, 0)
+				if a, b := encode(t, warm), encode(t, cold); !bytes.Equal(a, b) {
+					t.Fatalf("step %d (%s): the IR differs from a cold scan's\n%s", i, what, firstDiff(a, b))
+				}
+				if !reflect.DeepEqual(ws.Measures, cs.Measures) {
+					t.Fatalf("step %d (%s): the Measures differ from a cold scan's", i, what)
+				}
+				if cacheBuilt(cache) < cs.Packages && !inOrder(warm) {
+					t.Fatalf("step %d (%s): an IR assembled from parts is not in order", i, what)
+				}
+				ws.Assembled, ws.Parsed, cs.Assembled, cs.Parsed = 0, 0, 0, 0
+				if !reflect.DeepEqual(ws, cs) {
+					t.Fatalf("step %d (%s): Stats %+v, a cold scan's %+v", i, what, ws, cs)
+				}
+				if st := ws; st.Packages > 1 && cacheBuilt(cache) > 0 && cacheBuilt(cache) < st.Packages {
+					partial++
+				}
+			}
+			if partial < 10 {
+				t.Errorf("only %d of 60 rescans assembled part of the tree: the test is not testing reuse", partial)
+			}
+		})
+	}
+}
+
+// A package id may sort between another's and its declarations':
+// m/a-b falls between m/a and m/a.F. Parts joined in package order would
+// leave the IR out of order and ir.Sort a full sort of kubernetes (16).
+func TestCacheJoinsPartsInOrder(t *testing.T) {
+	root := tree(t, map[string]string{
+		"go.mod":   "module example.com/m\n",
+		"a/a.go":   "package a\n\nimport \"example.com/m/a-b\"\n\nfunc F() { b.G() }\n\ntype T struct{}\n",
+		"a-b/b.go": "package b\n\nfunc G() {}\n\nfunc H() { G() }\n",
+	})
+	cache := NewCache()
+	for i, body := range []string{"", "func H() { G(); G() }\n"} {
+		if body != "" {
+			if err := os.WriteFile(filepath.Join(root, "a-b", "b.go"), []byte("package b\n\nfunc G() {}\n\n"+body), 0o644); err != nil {
+				t.Fatal(err)
+			}
+		}
+		doc, st, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
+		if err != nil {
+			t.Fatal(err)
+		}
+		if i > 0 && st.Assembled != 1 {
+			t.Fatalf("assembled %d packages; want 1", st.Assembled)
+		}
+		if !inOrder(doc) {
+			t.Fatalf("scan %d: the IR is not in order: %v", i, doc.Nodes)
+		}
+	}
+}
+
+// inOrder reports whether doc's nodes and edges are in ir.Sort's order, as
+// an IR assembled from parts must be for ir.Sort to be cheap (16).
+func inOrder(doc *ir.IR) bool {
+	sorted := &ir.IR{Nodes: slices.Clone(doc.Nodes), Edges: slices.Clone(doc.Edges)}
+	ir.Sort(sorted)
+	return reflect.DeepEqual(sorted.Nodes, doc.Nodes) && reflect.DeepEqual(sorted.Edges, doc.Edges)
+}
+
+// cacheBuilt is how many packages the Cache's last scan assembled.
+func cacheBuilt(c *Cache) int {
+	c.mu.Lock()
+	defer c.mu.Unlock()
+	return c.built
+}
+
+func firstDiff(a, b []byte) string {
+	la, lb := strings.Split(string(a), "\n"), strings.Split(string(b), "\n")
+	for i := range min(len(la), len(lb)) {
+		if la[i] != lb[i] {
+			return fmt.Sprintf("line %d:\nwarm %s\ncold %s", i+1, la[i], lb[i])
+		}
+	}
+	return fmt.Sprintf("lengths %d, %d", len(la), len(lb))
+}
+
+// gen is a random Go tree and its edits.
+type gen struct {
+	r     *rand.Rand
+	files map[string]string // slash path → content; "" deletes
+	dirs  []string          // package directories
+}
+
+var genDirs = []string{"p0", "p1", "p1/q", "p2", "p2.x", "tools/t", "p3", "p1-r"}
+
+func (g *gen) init() {
+	g.files["go.mod"] = "module example.com/m\n\nrequire (\n\text.io/a v1.0.0\n\text.io/b v1.0.0\n)\n"
+	g.files["tools/go.mod"] = "module example.com/tools\n\nrequire ext.io/a v1.0.0\n"
+	for _, d := range genDirs[:4] {
+		g.addFile(d)
+	}
+}
+
+func (g *gen) pick(xs []string) string { return xs[g.r.IntN(len(xs))] }
+
+// genImport is d's import path.
+func genImport(d string) string {
+	if rest, ok := strings.CutPrefix(d, "tools/"); ok {
+		return "example.com/tools/" + rest
+	}
+	return "example.com/m/" + d
+}
+
+// body is a file of package dir d: random declarations calling, embedding
+// and importing the other package directories.
+func (g *gen) body(d string) string {
+	name := path.Base(d)
+	if i := strings.IndexAny(name, ".-"); i >= 0 {
+		name = name[:i]
+	}
+	if g.r.IntN(8) == 0 {
+		name = "other"
+	}
+	var b strings.Builder
+	if g.r.IntN(12) == 0 {
+		b.WriteString("//go:build ignore\n\n")
+	}
+	fmt.Fprintf(&b, "package %s\n\n", name)
+	type imp struct{ name, path string }
+	var imps []imp
+	for k := range 1 + g.r.IntN(3) {
+		o := g.pick(genDirs)
+		alias := fmt.Sprintf("i%d", k)
+		if g.r.IntN(2) == 0 {
+			alias = ""
+		}
+		imps = append(imps, imp{alias, genImport(o)})
+	}
+	if g.r.IntN(2) == 0 {
+		imps = append(imps, imp{"", "ext.io/" + g.pick([]string{"a", "b", "c"}) + "/sub"})
+	}
+	for _, i := range imps {
+		fmt.Fprintf(&b, "import %s %q\n", i.name, i.path)
+	}
+	qual := func() string {
+		i := imps[g.r.IntN(len(imps))]
+		if i.name != "" {
+			return i.name
+		}
+		q := path.Base(i.path)
+		if j := strings.IndexAny(q, ".-"); j >= 0 {
+			q = q[:j]
+		}
+		return q
+	}
+	for k := range 1 + g.r.IntN(4) {
+		switch g.r.IntN(3) {
+		case 0:
+			fmt.Fprintf(&b, "\nfunc F%d() { %s.F%d(); F%d(); T%d{}.M%d() }\n", g.r.IntN(4), qual(), g.r.IntN(4), g.r.IntN(4), k, g.r.IntN(3))
+		case 1:
+			fmt.Fprintf(&b, "\ntype T%d struct { %s.T%d; T%d }\n", g.r.IntN(3), qual(), g.r.IntN(3), g.r.IntN(3))
+		default:
+			fmt.Fprintf(&b, "\nfunc (t T%d) M%d() { t.M%d(); %s.F%d() }\n", g.r.IntN(3), g.r.IntN(3), g.r.IntN(3), qual(), g.r.IntN(4))
+		}
+	}
+	if g.r.IntN(15) == 0 {
+		b.WriteString("\nfunc broken( {\n")
+	}
+	return b.String()
+}
+
+func (g *gen) addFile(d string) string {
+	if !slices.Contains(g.dirs, d) {
+		g.dirs = append(g.dirs, d)
+	}
+	p := fmt.Sprintf("%s/f%d.go", d, g.r.IntN(3))
+	g.files[p] = g.body(d)
+	return p
+}
+
+// edit changes the tree once and says how.
+func (g *gen) edit() string {
+	var goFiles []string
+	for p, c := range g.files {
+		if c != "" && strings.HasSuffix(p, ".go") {
+			goFiles = append(goFiles, p)
+		}
+	}
+	slices.Sort(goFiles)
+	switch k := g.r.IntN(20); {
+	case k < 11 && len(goFiles) > 0: // most edits rewrite one file
+		p := g.pick(goFiles)
+		g.files[p] = g.body(path.Dir(p))
+		return "rewrite " + p
+	case k < 14:
+		return "add " + g.addFile(g.pick(g.dirs))
+	case k < 16 && len(goFiles) > 1:
+		p := g.pick(goFiles)
+		g.files[p] = ""
+		return "delete " + p
+	case k < 18:
+		return "add " + g.addFile(g.pick(genDirs))
+	case k < 19:
+		g.files["go.mod"] = fmt.Sprintf("module example.com/m\n\nrequire (\n\text.io/a v1.0.%d\n\text.io/b v1.0.0\n)\n", g.r.IntN(3))
+		if g.r.IntN(2) == 0 {
+			g.files["go.mod"] = "module example.com/m\n\n// a comment moves the requires\nrequire ext.io/a v1.0.0\n"
+		}
+		return "go.mod"
+	case k < 20 && g.r.IntN(2) == 0: // the package clause alone
+		p := g.pick(goFiles)
+		if c := g.files[p]; strings.Contains(c, "package other // was ") {
+			g.files[p] = strings.Replace(c, "package other // was ", "package ", 1)
+		} else {
+			g.files[p] = strings.Replace(c, "package ", "package other // was ", 1)
+		}
+		return "clause " + p
+	default:
+		p := g.pick(goFiles)
+		g.files[p] = strings.Replace(g.files[p], "package ", "package  ", 1) // same facts, new content
+		return "whitespace " + p
+	}
+}
+
+// sync writes the tree to root.
+func (g *gen) sync(t *testing.T, root string) {
+	t.Helper()
+	for p, c := range g.files {
+		f := filepath.Join(root, filepath.FromSlash(p))
+		if c == "" {
+			if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
+				t.Fatal(err)
+			}
+			delete(g.files, p)
+			continue
+		}
+		if err := os.MkdirAll(filepath.Dir(f), 0o755); err != nil {
+			t.Fatal(err)
+		}
+		if err := os.WriteFile(f, []byte(c), 0o644); err != nil {
+			t.Fatal(err)
+		}
+	}
+}
+
+// A require of a module the tree holds (kubernetes' staging modules) never
+// becomes an external: that module's own path claims every import under it.
+// So its path may be a package id, and a rescan still assembles only what
+// changed.
+func TestCacheAssemblesPartsWhenARequiredModuleIsScanned(t *testing.T) {
+	root := tree(t, map[string]string{
+		"go.mod":     "module example.com/m\n\nrequire example.com/lib v1.0.0\n",
+		"a/a.go":     "package a\n\nimport \"example.com/lib\"\n\nfunc F() { lib.G() }\n",
+		"b/b.go":     "package b\n\nfunc H() {}\n",
+		"lib/go.mod": "module example.com/lib\n",
+		"lib/lib.go": "package lib\n\nfunc G() {}\n",
+	})
+	cache := NewCache()
+	for i, body := range []string{"func H() {}", "func H() { H() }"} {
+		if err := os.WriteFile(filepath.Join(root, "b", "b.go"), []byte("package b\n\n"+body+"\n"), 0o644); err != nil {
+			t.Fatal(err)
+		}
+		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
+		if err != nil {
+			t.Fatal(err)
+		}
+		cold, cs := run(t, root, 0)
+		if !bytes.Equal(encode(t, warm), encode(t, cold)) {
+			t.Errorf("%s: the IR differs from a cold scan's", body)
+		}
+		if want := []int{cs.Packages, 1}[i]; ws.Assembled != want {
+			t.Errorf("%s: assembled %d packages, want %d", body, ws.Assembled, want)
+		}
+	}
+}
diff --git a/internal/scan/corpus_parity_test.go b/internal/scan/corpus_parity_test.go
new file mode 100644
index 0000000000000000000000000000000000000000..f8dc8c47bfc3aa7605006a80bfc1a4343ed6d54f
--- /dev/null
+++ b/internal/scan/corpus_parity_test.go
@@ -0,0 +1,134 @@
+package scan
+
+import (
+	"bytes"
+	"cmp"
+	"context"
+	"os"
+	"path/filepath"
+	"reflect"
+	"regexp"
+	"slices"
+	"strings"
+	"testing"
+)
+
+// On a real tree, every rescan through a Cache writes the IR a cold scan
+// writes, byte for byte, after each kind of edit a watch sees (16). The
+// random-edit test covers the rules; this one covers a real tree's scale:
+// kubernetes' 2,963 packages, its staging modules (required and scanned), a
+// package with 347 importers. It runs only when ZU_CORPUS names a writable
+// copy of a corpus tree (`cp -cRp`, never the corpus itself), and puts back
+// every file it touched. ZU_CORPUS_PKG names the package to edit, relative
+// to the tree; the default is kubernetes' apimachinery util/sets.
+//
+//	ZU_CORPUS=/path/to/copy go test ./internal/scan -run TestCorpusRescansMatchColdScans -v
+func TestCorpusRescansMatchColdScans(t *testing.T) {
+	root := os.Getenv("ZU_CORPUS")
+	if root == "" {
+		t.Skip("ZU_CORPUS is not set")
+	}
+	rel := cmp.Or(os.Getenv("ZU_CORPUS_PKG"), "staging/src/k8s.io/apimachinery/pkg/util/sets")
+	dir := filepath.Join(root, filepath.FromSlash(rel))
+	ents, err := os.ReadDir(dir)
+	if err != nil {
+		t.Fatalf("ZU_CORPUS_PKG: %v", err)
+	}
+	var files []string // the package's non-test Go files
+	for _, e := range ents {
+		if n := e.Name(); !e.IsDir() && strings.HasSuffix(n, ".go") && !strings.HasSuffix(n, "_test.go") {
+			files = append(files, filepath.Join(dir, n))
+		}
+	}
+	if len(files) == 0 {
+		t.Fatalf("%s holds no Go files", rel)
+	}
+	clause := regexp.MustCompile(`(?m)^package (\w+)`)
+	orig := map[string][]byte{}
+	for _, f := range files {
+		b, err := os.ReadFile(f)
+		if err != nil {
+			t.Fatal(err)
+		}
+		orig[f] = b
+	}
+	name := clause.FindSubmatch(orig[files[0]])[1]
+	restore := func() {
+		for f, b := range orig {
+			if err := os.WriteFile(f, b, 0o644); err != nil {
+				t.Error(err)
+			}
+		}
+		for _, p := range []string{"zz_parity.go", "zz_broken.go", "zzparity"} {
+			if err := os.RemoveAll(filepath.Join(dir, p)); err != nil {
+				t.Error(err)
+			}
+		}
+	}
+	t.Cleanup(restore)
+	write := func(p string, b []byte) {
+		t.Helper()
+		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
+			t.Fatal(err)
+		}
+		if err := os.WriteFile(p, b, 0o644); err != nil {
+			t.Fatal(err)
+		}
+	}
+	remove := func(p string) {
+		t.Helper()
+		if err := os.RemoveAll(p); err != nil {
+			t.Fatal(err)
+		}
+	}
+	withFunc := func(body string) []byte {
+		return append(slices.Clone(orig[files[0]]), []byte("\nfunc ZzParity() {"+body+"}\n")...)
+	}
+	pkg := "package " + string(name) + "\n\n"
+
+	cache := NewCache()
+	step := func(what string, partial bool) {
+		t.Helper()
+		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
+		if err != nil {
+			t.Fatalf("%s: %v", what, err)
+		}
+		cold, cs := run(t, root, 0)
+		if a, b := encode(t, warm), encode(t, cold); !bytes.Equal(a, b) {
+			t.Fatalf("%s: the IR differs from a cold scan's\n%s", what, firstDiff(a, b))
+		}
+		if !reflect.DeepEqual(ws.Measures, cs.Measures) {
+			t.Fatalf("%s: the Measures differ from a cold scan's", what)
+		}
+		if partial && ws.Assembled >= cs.Packages {
+			t.Errorf("%s: assembled all %d packages: the tree does not reuse parts", what, cs.Packages)
+		}
+		t.Logf("%-24s assembled %4d of %d packages, %d parse errors", what, ws.Assembled, cs.Packages, len(cold.ParseErrors))
+	}
+
+	step("first scan", false)
+	write(files[0], withFunc(""))
+	step("new function", true)
+	write(files[0], withFunc(" _ = 1 "))
+	step("body-only edit", true)
+	write(files[0], orig[files[0]])
+	step("function removed", true)
+	for _, f := range files {
+		write(f, clause.ReplaceAll(orig[f], []byte("package zzparity")))
+	}
+	step("package renamed", true)
+	restore()
+	step("package renamed back", true)
+	write(filepath.Join(dir, "zz_parity.go"), []byte(pkg+"type ZzParity struct{}\n"))
+	step("new file", true)
+	remove(filepath.Join(dir, "zz_parity.go"))
+	step("file deleted", true)
+	write(filepath.Join(dir, "zzparity", "zz.go"), []byte("package zzparity\n\nfunc F() {}\n"))
+	step("new package", false)
+	remove(filepath.Join(dir, "zzparity"))
+	step("package deleted", false)
+	write(filepath.Join(dir, "zz_broken.go"), []byte(pkg+"func (\n"))
+	step("parse error", true)
+	remove(filepath.Join(dir, "zz_broken.go"))
+	step("parse error fixed", true)
+}
```

- [x] **Run:** `go test ./internal/scan` Expected: FAIL (`ws.Assembled undefined`)

- [x] **Keep the assembly by package, and sort only what is out of order**

```diff
diff --git a/internal/ir/encode.go b/internal/ir/encode.go
index 26840a3455ae4fe592a22b2fd00829a5ba0946ef..63a344e1b7db57a59310273fbced4c1ceabc9ae3 100644
--- a/internal/ir/encode.go
+++ b/internal/ir/encode.go
@@ -22,8 +22,8 @@ func Sort(doc *IR) {
 			doc.Edges[i].Locations = []Location{}
 		}
 	}
-	slices.SortFunc(doc.Nodes, func(a, b Node) int { return cmp.Compare(a.ID, b.ID) })
-	slices.SortFunc(doc.Edges, func(a, b Edge) int {
+	sortOnce(doc.Nodes, func(a, b Node) int { return cmp.Compare(a.ID, b.ID) })
+	sortOnce(doc.Edges, func(a, b Edge) int {
 		return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To), cmp.Compare(a.Kind, b.Kind))
 	})
 	slices.SortFunc(doc.ParseErrors, func(a, b ParseError) int {
@@ -50,11 +50,20 @@ func Sort(doc *IR) {
 }
 
 func sortLocations(l []Location) {
-	slices.SortFunc(l, func(a, b Location) int {
+	sortOnce(l, func(a, b Location) int {
 		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.Line, b.Line))
 	})
 }
 
+// sortOnce sorts s, and leaves a list already in order untouched: checking
+// is cheaper than sorting, and a scan's Cache shares location lists between
+// the IRs of successive scans (16).
+func sortOnce[E any](s []E, cmp func(a, b E) int) {
+	if !slices.IsSortedFunc(s, cmp) {
+		slices.SortFunc(s, cmp)
+	}
+}
+
 // Encode sorts doc, stamps the schema version, and writes it as two-space
 // indented JSON with a trailing newline. Map keys are sorted by encoding/json.
 func Encode(w io.Writer, doc *IR) error {
diff --git a/internal/scan/assembly.go b/internal/scan/assembly.go
new file mode 100644
index 0000000000000000000000000000000000000000..ed2083fd792c7e307cc49e760183c9d90cfe601b
--- /dev/null
+++ b/internal/scan/assembly.go
@@ -0,0 +1,247 @@
+package scan
+
+import (
+	"cmp"
+	"maps"
+	"slices"
+	"strings"
+
+	"zu/internal/ir"
+)
+
+// assembly is one scan's IR kept by package, so the next scan through the
+// same Cache assembles again only the packages whose inputs changed (16).
+// A package's part is what assembling the whole tree gives its files: the
+// package node, its declarations, the edges out of them, its unresolved
+// calls and imports, the externals its imports reach and its Measures.
+// Beyond its own files a part reads only the modules (every go.mod) and,
+// through its imports, the surface of the packages it imports: their Name,
+// functions and types. An assembly is never changed once built.
+type assembly struct {
+	modules []*module
+	parts   map[string]*part // by package id
+}
+
+// part is one package's share of the IR.
+type part struct {
+	files     []*fileFacts // the facts it was built from, in path order
+	surface   string       // surfaceOf the package it was built for
+	nodes     []ir.Node    // the package and its declarations
+	externals []ir.Node    // each external its imports reach, at the require lines
+	edges     []ir.Edge
+	calls     int            // its unresolved calls
+	imports   map[string]int // its unresolved imports
+	measures  Measures
+}
+
+// assembleParts assembles facts from prev's parts where they still hold and
+// builds the rest, and reports how many packages it built. It returns nil
+// when two nodes could share an id (see separable): only a whole assembly
+// resolves that, as dropCollisions does.
+func assembleParts(prev *assembly, w *walkResult, facts []*fileFacts) (*assembly, int) {
+	ix := buildIndex(w, facts)
+	if !separable(ix, w) {
+		return nil, 0
+	}
+	reuse := prev != nil && len(prev.parts) == len(ix.pkgs) && sameModules(prev.modules, w.Modules)
+	for id := range ix.pkgs {
+		reuse = reuse && prev.parts[id] != nil
+	}
+	build := map[string]bool{}
+	for id, p := range ix.pkgs {
+		if !reuse || !slices.Equal(prev.parts[id].files, p.Files) {
+			build[id] = true
+		}
+	}
+	if reuse {
+		var moved []string // packages whose surface changed: their importers resolve against it
+		for id := range build {
+			if surfaceOf(ix.pkgs[id]) != prev.parts[id].surface {
+				moved = append(moved, id)
+			}
+		}
+		if len(moved) > 0 {
+			by := importers(w, facts)
+			for _, id := range moved {
+				for q := range by[id] {
+					build[q] = true
+				}
+			}
+		}
+	}
+	a := &assembly{modules: w.Modules, parts: make(map[string]*part, len(ix.pkgs))}
+	for id, p := range ix.pkgs {
+		if build[id] {
+			a.parts[id] = buildPart(ix, w, p)
+		} else {
+			a.parts[id] = prev.parts[id]
+		}
+	}
+	return a, len(build)
+}
+
+// separable reports whether no two nodes can share an id, and no package's
+// ids fall among another's, so that each package's part is exactly what a
+// whole assembly gives its files and the parts join in order. Dots are legal
+// in directory names: package m/a.b and type b of package m/a are both
+// "m/a.b", and a method c of that type is "m/a.b.c" as is function c of
+// m/a.b; package m/a.F/x is no declaration's id but sorts among m/a's. So a
+// package id, or a required module path (an external's id), must not be
+// another package's id plus "." and more, nor may a required module path be
+// a package id. A require of a module the tree holds never becomes an
+// external: that module's path claims every import under it
+// (index.classify), so its path may be a package id (kubernetes' staging
+// modules).
+func separable(ix *index, w *walkResult) bool {
+	dotted := func(id string) bool {
+		for i := range len(id) {
+			if id[i] == '.' && ix.pkgs[id[:i]] != nil {
+				return true
+			}
+		}
+		return false
+	}
+	for id := range ix.pkgs {
+		if dotted(id) {
+			return false
+		}
+	}
+	held := map[string]bool{}
+	for _, m := range w.Modules {
+		held[m.Path] = true
+	}
+	for _, m := range w.Modules {
+		for _, r := range m.Requires {
+			if !held[r.Path] && (ix.pkgs[r.Path] != nil || dotted(r.Path)) {
+				return false
+			}
+		}
+	}
+	return true
+}
+
+// importers maps each import path to the packages with a file importing it.
+func importers(w *walkResult, facts []*fileFacts) map[string]map[string]bool {
+	by := map[string]map[string]bool{}
+	for _, f := range facts {
+		if f.Skip || f.Err != nil {
+			continue
+		}
+		q := importPath(w.moduleFor(f.Dir), f.Dir)
+		for _, imp := range f.Imports {
+			if by[imp.Path] == nil {
+				by[imp.Path] = map[string]bool{}
+			}
+			by[imp.Path][q] = true
+		}
+	}
+	return by
+}
+
+// sameModules reports whether a and b are the same go.mod files, requires
+// and their lines included.
+func sameModules(a, b []*module) bool {
+	return slices.EqualFunc(a, b, func(x, y *module) bool {
+		return x.Path == y.Path && x.Dir == y.Dir && slices.Equal(x.Requires, y.Requires)
+	})
+}
+
+// buildPart assembles p's files alone, against the whole index.
+func buildPart(ix *index, w *walkResult, p *pkgInfo) *part {
+	doc, ms := assembleWith(ix, w, p.Files)
+	pt := &part{files: p.Files, surface: surfaceOf(p), edges: doc.Edges, calls: doc.UnresolvedCalls[p.ID],
+		imports: doc.UnresolvedImports, measures: ms}
+	for _, n := range doc.Nodes {
+		if n.Kind == ir.KindExternal {
+			pt.externals = append(pt.externals, n)
+		} else {
+			pt.nodes = append(pt.nodes, n)
+		}
+	}
+	// Sorted once here, as ir.Sort would: the IR joins parts in package
+	// order, so ir.Sort finds it nearly in order, and never writes to the
+	// location lists that later scans share.
+	part := &ir.IR{Nodes: pt.nodes, Edges: pt.edges}
+	ir.Sort(part)
+	pt.nodes, pt.edges = part.Nodes, part.Edges
+	return pt
+}
+
+// ir joins the parts into one IR, in order, with the parse errors and
+// unsupported files of the whole tree, and their Measures.
+func (a *assembly) ir(w *walkResult, facts []*fileFacts) (*ir.IR, Measures) {
+	doc := &ir.IR{
+		UnresolvedCalls:   map[string]int{},
+		UnresolvedImports: map[string]int{},
+		Unsupported:       w.Unsupported,
+		ParseErrors:       append([]ir.ParseError(nil), w.Errors...),
+	}
+	for _, f := range facts {
+		if f.Err != nil {
+			doc.ParseErrors = append(doc.ParseErrors, *f.Err)
+		}
+	}
+	ms := Measures{Funcs: map[string]Measure{}, Files: map[string][]Span{}}
+	var nodes [][]ir.Node
+	var edges [][]ir.Edge
+	ext := map[string][]ir.Location{}
+	for id, pt := range a.parts {
+		nodes = append(nodes, runs(pt.nodes, func(n ir.Node) bool { return n.ID == id })...)
+		edges = append(edges, runs(pt.edges, func(e ir.Edge) bool { return e.From == id })...)
+		if pt.calls > 0 {
+			doc.UnresolvedCalls[id] = pt.calls
+		}
+		for p, n := range pt.imports {
+			doc.UnresolvedImports[p] += n
+		}
+		for _, n := range pt.externals {
+			for _, l := range n.Locations {
+				if !slices.Contains(ext[n.ID], l) {
+					ext[n.ID] = append(ext[n.ID], l)
+				}
+			}
+		}
+		maps.Copy(ms.Funcs, pt.measures.Funcs)
+		maps.Copy(ms.Files, pt.measures.Files)
+	}
+	for id, l := range ext {
+		sortLocations(l)
+		nodes = append(nodes, []ir.Node{{ID: id, Kind: ir.KindExternal, Locations: l}})
+	}
+	// Each run holds one package's node, or its declarations, or the edges
+	// out of either, and runs never overlap: a declaration's id is its
+	// package's plus "." and a name, and separable rules out any other
+	// package's id, declaration or external starting so. So the runs, put in
+	// order by their first element, are the nodes and the edges in order.
+	slices.SortFunc(nodes, func(x, y []ir.Node) int { return strings.Compare(x[0].ID, y[0].ID) })
+	slices.SortFunc(edges, func(x, y []ir.Edge) int { return byEdge(x[0], y[0]) })
+	doc.Nodes, doc.Edges = slices.Concat(nodes...), slices.Concat(edges...)
+	return doc, ms
+}
+
+// runs splits a sorted part list in two: the leading elements that belong
+// to the package itself (head), and the rest, its declarations'. Empty runs
+// are left out.
+func runs[E any](l []E, head func(E) bool) [][]E {
+	i := 0
+	for i < len(l) && head(l[i]) {
+		i++
+	}
+	var out [][]E
+	for _, r := range [][]E{l[:i], l[i:]} {
+		if len(r) > 0 {
+			out = append(out, r)
+		}
+	}
+	return out
+}
+
+func byEdge(a, b ir.Edge) int {
+	return cmp.Or(strings.Compare(a.From, b.From), strings.Compare(a.To, b.To), strings.Compare(string(a.Kind), string(b.Kind)))
+}
+
+func sortLocations(l []ir.Location) {
+	slices.SortFunc(l, func(a, b ir.Location) int {
+		return cmp.Or(strings.Compare(a.Path, b.Path), cmp.Compare(a.Line, b.Line))
+	})
+}
diff --git a/internal/scan/build.go b/internal/scan/build.go
index e4b2e9b9d4197925c2e2b234888c8051e8964df9..4f800bf29cefe23797aa398e1a6c7062995e00a2 100644
--- a/internal/scan/build.go
+++ b/internal/scan/build.go
@@ -36,8 +36,14 @@ type edgeID struct {
 // assemble turns per-file facts into an IR (unsorted; ir.Encode sorts) and
 // the Measures of its function and method nodes.
 func assemble(w *walkResult, facts []*fileFacts) (*ir.IR, Measures) {
+	return assembleWith(buildIndex(w, facts), w, facts)
+}
+
+// assembleWith assembles facts, resolving against ix: every file's facts
+// for the whole IR, or one package's for its part (16).
+func assembleWith(ix *index, w *walkResult, facts []*fileFacts) (*ir.IR, Measures) {
 	b := &builder{
-		ix: buildIndex(w, facts),
+		ix: ix,
 		doc: &ir.IR{
 			UnresolvedCalls:   map[string]int{},
 			UnresolvedImports: map[string]int{},
@@ -82,6 +88,9 @@ func assemble(w *walkResult, facts []*fileFacts) (*ir.IR, Measures) {
 	}
 	for _, p := range b.ix.pkgs {
 		n := b.nodes[p.ID]
+		if n == nil {
+			continue // a package whose files this assembly left out: another part's
+		}
 		n.Hash = b.packageHash(p)
 		n.Main = p.Name == "main"
 	}
@@ -211,7 +220,8 @@ func (b *builder) calls(p *pkgInfo, f *fileFacts, names map[string]target) {
 
 // resolveCall returns the callee id for a certain call, or reports whether
 // an uncertain call counts as unresolved (false: builtin, conversion, or a
-// call outside this repository).
+// call outside this repository). It reads only an imported package's Funcs
+// and Types, which surfaceOf must cover (16).
 func (b *builder) resolveCall(p *pkgInfo, c callSite, names map[string]target) (to string, unresolved bool) {
 	switch c.Kind {
 	case callBare:
@@ -242,6 +252,7 @@ func (b *builder) resolveCall(p *pkgInfo, c callSite, names map[string]target) (
 
 // embeds adds an edge for each embedded type declared in this repository or
 // in a required module; standard-library and predeclared types are omitted.
+// It reads only an imported package's Types, which surfaceOf must cover (16).
 func (b *builder) embeds(p *pkgInfo, f *fileFacts, names map[string]target) {
 	for _, e := range f.Embeds {
 		from := declID(p.ID, "", e.Owner)
diff --git a/internal/scan/cache.go b/internal/scan/cache.go
index 36b57507a22a45b92b1ace93d03eabca8b0c99b8..37f65162b2c0b76d02189745a34b78488556b8b7 100644
--- a/internal/scan/cache.go
+++ b/internal/scan/cache.go
@@ -4,17 +4,29 @@ import (
 	"crypto/sha256"
 	"io/fs"
 	"sync"
+
+	"zu/internal/ir"
 )
 
 // Cache keeps each file's facts between scans, keyed by path and content
 // hash, so a rescan parses only the files whose content changed (10). A
 // file's facts depend on nothing but its path and content, so one Cache
-// serves any Tree. Everything after extraction (modules, the index, the
-// build) still runs over every file, which is what keeps a rescan's IR
-// byte-identical to a cold scan's. Safe for concurrent use.
+// serves any Tree. It also keeps the last scan's assembly by package, so a
+// rescan assembles again only the packages whose files or imported surfaces
+// changed, and every package when the package set or the modules (a path, a
+// directory, or a require's path or line) changed (16). The rest of the IR is
+// the last scan's, which is what a cold scan would build of it, byte for
+// byte. Keep one Cache per sequence of scans of one tree: scanning another
+// tree through it (serve's Base, say) replaces the kept assembly, and each
+// scan after that assembles every package again. Successive IRs share
+// location lists with the kept parts: nothing may append to an IR's
+// Locations in place, or sort them but through ir.Sort, which leaves sorted
+// lists alone. Safe for concurrent use.
 type Cache struct {
 	mu    sync.Mutex
 	files map[string]cached
+	last  *assembly // the last scan's; nil when it assembled the whole tree at once
+	built int       // how many packages the last scan assembled
 }
 
 type cached struct {
@@ -130,3 +142,40 @@ func (c *Cache) keep(files []string) {
 		}
 	}
 }
+
+// assemble assembles facts from the last scan's parts where they hold (16),
+// and reports how many packages it assembled. A nil Cache, or a tree whose
+// node ids could meet, assembles the whole tree.
+func (c *Cache) assemble(w *walkResult, facts []*fileFacts) (*ir.IR, Measures, int) {
+	if c == nil {
+		doc, ms := assemble(w, facts)
+		return doc, ms, packages(doc)
+	}
+	c.mu.Lock()
+	prev := c.last
+	c.mu.Unlock()
+	a, n := assembleParts(prev, w, facts)
+	var doc *ir.IR
+	var ms Measures
+	if a == nil {
+		doc, ms = assemble(w, facts)
+		n = packages(doc)
+	} else {
+		doc, ms = a.ir(w, facts)
+	}
+	c.mu.Lock()
+	c.last, c.built = a, n
+	c.mu.Unlock()
+	return doc, ms, n
+}
+
+// packages counts doc's package nodes.
+func packages(doc *ir.IR) int {
+	n := 0
+	for _, x := range doc.Nodes {
+		if x.Kind == ir.KindPackage {
+			n++
+		}
+	}
+	return n
+}
diff --git a/internal/scan/resolve.go b/internal/scan/resolve.go
index ebc0e5c46d788d67a05f7b6426ffe6ceeb4e9f77..50219ffd4d3977406c06338b06c43762c7d4ab0b 100644
--- a/internal/scan/resolve.go
+++ b/internal/scan/resolve.go
@@ -1,7 +1,9 @@
 package scan
 
 import (
+	"maps"
 	"path"
+	"slices"
 	"strings"
 )
 
@@ -17,6 +19,16 @@ type pkgInfo struct {
 	Methods map[string]map[string]bool // receiver base type → method names
 }
 
+// surfaceOf is what packages importing p resolve against: its Name, its
+// functions and its types. A Cache reuses an importer's part while this is
+// unchanged (16), so it must mirror what resolution reads of an imported
+// package: every field of a target's Pkg that resolveImport, resolveCall or
+// embeds reads must be here, or a rescan's IR can differ from a cold scan's.
+func surfaceOf(p *pkgInfo) string {
+	return p.Name + "\x00" + strings.Join(slices.Sorted(maps.Keys(p.Funcs)), " ") +
+		"\x00" + strings.Join(slices.Sorted(maps.Keys(p.Types)), " ")
+}
+
 // index maps import paths to scanned packages.
 type index struct {
 	w    *walkResult
diff --git a/internal/scan/scan.go b/internal/scan/scan.go
index 6e4f1082b869fe43d0e1bec45b27a4bf9b880602..9863e9e096f38b09d87d8d5f5df0fa97631e607a 100644
--- a/internal/scan/scan.go
+++ b/internal/scan/scan.go
@@ -43,6 +43,7 @@ type Stats struct {
 	UnresolvedCalls int
 	Measures        Measures
 	Parsed          int // files this scan parsed; with a Cache, only the new and changed ones (10)
+	Assembled       int // packages this scan assembled; with a Cache, only those whose inputs changed (16)
 }
 
 // Run scans opts.Tree. The result is unsorted; ir.Encode canonicalises it.
@@ -58,16 +59,11 @@ func Run(ctx context.Context, opts Options) (*ir.IR, Stats, error) {
 		return nil, Stats{}, err
 	}
 	opts.Cache.keep(w.Files)
-	doc, ms := assemble(w, facts)
+	doc, ms, assembled := opts.Cache.assemble(w, facts)
 	doc.Grouping = "tree"
 	doc.PolicyHash = cmp.Or(opts.PolicyHash, DefaultPolicyHash)
 
-	st := Stats{ParseErrors: len(doc.ParseErrors), Measures: ms, Parsed: parsed}
-	for _, n := range doc.Nodes {
-		if n.Kind == ir.KindPackage {
-			st.Packages++
-		}
-	}
+	st := Stats{ParseErrors: len(doc.ParseErrors), Measures: ms, Parsed: parsed, Assembled: assembled, Packages: packages(doc)}
 	for _, f := range facts {
 		if !f.Skip && f.Err == nil {
 			st.Files++
```

- [x] **Run:** `go test -race ./internal/scan ./internal/ir` Expected: PASS

- [x] **Run:** `go test ./...` Expected: PASS (the shop golden and the disk/commit parity are unchanged)

- [x] **Commit:** `Assemble again only the packages whose inputs changed`

---

### Task 3: Apply with no lens shares a canonical IR's locations (`policy`)

The tests (`apply_fast_test.go`) check:
- with an empty Policy, `Apply` of a sorted IR shares its location lists but not its node list;
- over 2,000 random IRs, `Apply` gives what the whole Apply (`apply`) gives, and leaves the IR as it was. The IRs may be out of order, and may hold duplicate ids and edges, self-loops, and unordered or missing locations.

**Files:**
- Test: `internal/policy/apply_fast_test.go` (new)
- Code: `internal/policy/apply.go`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/policy/apply_fast_test.go b/internal/policy/apply_fast_test.go
new file mode 100644
index 0000000000000000000000000000000000000000..2bb3741aa13769cd5185a0271980120ce6441789
--- /dev/null
+++ b/internal/policy/apply_fast_test.go
@@ -0,0 +1,82 @@
+package policy
+
+import (
+	"fmt"
+	"math/rand/v2"
+	"reflect"
+	"slices"
+	"testing"
+
+	"zu/internal/ir"
+)
+
+// With no lens, Apply of a canonical IR copies no location list: a rescan
+// of kubernetes applies the Policy to 110k nodes and 118k edges (16).
+func TestApplyWithoutLensSharesLocations(t *testing.T) {
+	doc := sample()
+	ir.Sort(doc)
+	out := (&Policy{}).Apply(doc)
+	if &out.Nodes[0].Locations[0] != &doc.Nodes[0].Locations[0] {
+		t.Error("a node's locations were copied")
+	}
+	if &out.Edges[0].Locations[0] != &doc.Edges[0].Locations[0] {
+		t.Error("an edge's locations were copied")
+	}
+	if &out.Nodes[0] == &doc.Nodes[0] {
+		t.Error("the node list is doc's: a change to out would change doc")
+	}
+}
+
+// Whatever the IR, Apply with no lens gives what the whole Apply gives, and
+// leaves doc as it was: out of order, duplicate ids and edges, self-loops,
+// unordered or missing locations.
+func TestApplyWithoutLensMatchesTheWholeApply(t *testing.T) {
+	r := rand.New(rand.NewPCG(16, 3))
+	id := func() string { return fmt.Sprintf("m/p%d", r.IntN(4)) + []string{"", ".F", ".T", ".T.M"}[r.IntN(4)] }
+	locs := func() []ir.Location {
+		var l []ir.Location
+		for range r.IntN(3) {
+			l = append(l, ir.Location{Path: fmt.Sprintf("f%d.go", r.IntN(2)), Line: r.IntN(4)})
+		}
+		return l
+	}
+	for i := range 2000 {
+		doc := &ir.IR{}
+		for range r.IntN(8) {
+			doc.Nodes = append(doc.Nodes, ir.Node{ID: id(), Kind: ir.KindFunction, Locations: locs()})
+		}
+		for range r.IntN(8) {
+			doc.Edges = append(doc.Edges, ir.Edge{From: id(), To: id(), Kind: []ir.EdgeKind{ir.EdgeCalls, ir.EdgeImports}[r.IntN(2)], Locations: locs()})
+		}
+		if r.IntN(2) == 0 {
+			ir.Sort(doc) // canonical, mostly: duplicates and self-loops stay
+		}
+		was := clone(doc)
+		p := &Policy{}
+		got, want := p.Apply(doc), p.apply(clone(doc))
+		if !reflect.DeepEqual(got, want) {
+			t.Fatalf("case %d: Apply\n%+v\nthe whole Apply\n%+v", i, got, want)
+		}
+		if !reflect.DeepEqual(doc, was) {
+			t.Fatalf("case %d: Apply changed doc", i)
+		}
+	}
+}
+
+func clone(doc *ir.IR) *ir.IR {
+	c := *doc
+	c.Nodes, c.Edges = slices.Clone(doc.Nodes)[:0], slices.Clone(doc.Edges)[:0] // nil stays nil
+	for _, n := range doc.Nodes {
+		if n.Locations != nil {
+			n.Locations = append([]ir.Location{}, n.Locations...)
+		}
+		c.Nodes = append(c.Nodes, n)
+	}
+	for _, e := range doc.Edges {
+		if e.Locations != nil {
+			e.Locations = append([]ir.Location{}, e.Locations...)
+		}
+		c.Edges = append(c.Edges, e)
+	}
+	return &c
+}
```

- [x] **Run:** `go test ./internal/policy` Expected: FAIL (`p.apply undefined`)

- [x] **Take the short path when nothing is omitted or merged**

```diff
diff --git a/internal/policy/apply.go b/internal/policy/apply.go
index 8ace39311eccb2541ce80624391efc6c17a40069..35c12dba0a38765059ce91f520d9a1b3319bc0d1 100644
--- a/internal/policy/apply.go
+++ b/internal/policy/apply.go
@@ -1,6 +1,7 @@
 package policy
 
 import (
+	"cmp"
 	"slices"
 	"strings"
 
@@ -60,6 +61,48 @@ func (p *Policy) foreignIDs(doc *ir.IR) map[string]string {
 // Merged nodes and edges keep every location; an edge that merging turns
 // into a self-loop is dropped. doc is not modified and nothing is invented.
 func (p *Policy) Apply(doc *ir.IR) *ir.IR {
+	if p.Lens() || !canonical(doc) {
+		return p.apply(doc)
+	}
+	// Nothing to omit or merge in an IR in order with no id twice: the
+	// nodes and edges as they are, less self-loops, sharing their location
+	// lists, which nothing writes to (16).
+	out := *doc
+	out.Nodes = slices.Clone(doc.Nodes)
+	out.Edges = slices.DeleteFunc(slices.Clone(doc.Edges), func(e ir.Edge) bool { return e.From == e.To })
+	ir.Sort(&out)
+	return &out
+}
+
+// canonical reports whether doc is as ir.Sort leaves it, every location list
+// included, with no node id and no edge twice.
+func canonical(doc *ir.IR) bool {
+	sorted := func(l []ir.Location) bool {
+		return slices.IsSortedFunc(l, func(a, b ir.Location) int {
+			return cmp.Or(strings.Compare(a.Path, b.Path), cmp.Compare(a.Line, b.Line))
+		})
+	}
+	for i, n := range doc.Nodes {
+		if !sorted(n.Locations) || i > 0 && doc.Nodes[i-1].ID >= n.ID {
+			return false
+		}
+	}
+	for i, e := range doc.Edges {
+		if !sorted(e.Locations) {
+			return false
+		}
+		if i > 0 {
+			d := doc.Edges[i-1]
+			if cmp.Or(strings.Compare(d.From, e.From), strings.Compare(d.To, e.To), strings.Compare(string(d.Kind), string(e.Kind))) >= 0 {
+				return false
+			}
+		}
+	}
+	return true
+}
+
+// apply is Apply for any Policy and any IR.
+func (p *Policy) apply(doc *ir.IR) *ir.IR {
 	pkg := packageOf(doc)
 	foreign := p.foreignIDs(doc)
 	rename := func(id string) string {
```

- [x] **Run:** `go test ./internal/policy ./internal/export ./internal/cli` Expected: PASS

- [x] **Commit:** `Apply an empty lens without copying the IR`

---

### Task 4: Compare walks two IRs in order side by side (`ir`, `diff`)

The tests check:
- `ir.InOrder` on empty, sorted, out-of-order and duplicate nodes and edges (`ir_test.go`);
- over 3,000 random pairs of IRs, in order or not, that `Compare` gives what matching by key gives: moves, modified hashes, reversed and one-way imports included (`merge_test.go`);
- that only an import reverses: a call a→b replaced by b→a is two changes.

`policy.canonical` now uses `ir.InOrder`.

**Files:**
- Tests: `internal/ir/ir_test.go`, `internal/diff/merge_test.go` (new)
- Code: `internal/ir/encode.go`, `internal/diff/diff.go`, `internal/policy/apply.go`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/diff/merge_test.go b/internal/diff/merge_test.go
new file mode 100644
index 0000000000000000000000000000000000000000..65b0c03f7b07762c8c8f0353f706d90b015bf7bf
--- /dev/null
+++ b/internal/diff/merge_test.go
@@ -0,0 +1,80 @@
+package diff
+
+import (
+	"fmt"
+	"math/rand/v2"
+	"reflect"
+	"slices"
+	"testing"
+
+	"zu/internal/ir"
+)
+
+// Compare of two IRs in order walks them side by side (16); it must find
+// what matching by id and by edge finds, for IRs in order or not: moves,
+// modified hashes, reversed and one-way imports included.
+func TestCompareMatchesMatchingByKey(t *testing.T) {
+	r := rand.New(rand.NewPCG(16, 5))
+	pkgs := []string{"m/a", "m/b", "m/c"}
+	side := func() *ir.IR {
+		d := &ir.IR{}
+		for _, p := range pkgs {
+			if r.IntN(5) > 0 {
+				d.Nodes = append(d.Nodes, ir.Node{ID: p, Kind: ir.KindPackage})
+			}
+			for _, name := range []string{"F", "G", "T"} {
+				if r.IntN(2) == 0 {
+					continue
+				}
+				kind := ir.KindFunction
+				if name == "T" {
+					kind = ir.KindType
+				}
+				d.Nodes = append(d.Nodes, ir.Node{ID: p + "." + name, Kind: kind, Parent: p,
+					Hash: fmt.Sprint(r.IntN(2)), Shape: fmt.Sprint(r.IntN(2))})
+			}
+		}
+		if r.IntN(2) == 0 {
+			d.Nodes = append(d.Nodes, ir.Node{ID: "ext.io/x", Kind: ir.KindExternal})
+		}
+		for range r.IntN(8) {
+			from, to := pkgs[r.IntN(3)], pkgs[r.IntN(3)]
+			d.Edges = append(d.Edges, ir.Edge{From: from, To: to, Kind: []ir.EdgeKind{ir.EdgeImports, ir.EdgeImports, ir.EdgeCalls}[r.IntN(3)]})
+		}
+		if r.IntN(3) > 0 {
+			ir.Sort(d)
+			if r.IntN(4) > 0 { // in order; else an edge may be there twice
+				d.Edges = slices.CompactFunc(d.Edges, func(a, b ir.Edge) bool { return a.From == b.From && a.To == b.To && a.Kind == b.Kind })
+			}
+		} else {
+			r.Shuffle(len(d.Nodes), func(i, j int) { d.Nodes[i], d.Nodes[j] = d.Nodes[j], d.Nodes[i] })
+		}
+		return d
+	}
+	merged := 0
+	for i := range 3000 {
+		base, head := side(), side()
+		if ir.InOrder(base) && ir.InOrder(head) {
+			merged++
+		}
+		if got, want := Compare(base, head), compareByKey(base, head); !reflect.DeepEqual(got, want) {
+			t.Fatalf("case %d: Compare\n%+v\nmatching by key\n%+v", i, got, want)
+		}
+	}
+	if merged < 1000 {
+		t.Fatalf("only %d of 3000 cases had both IRs in order", merged)
+	}
+}
+
+// Only an import reverses: a call a→b replaced by b→a is two changes.
+func TestCompareReversesImportsOnly(t *testing.T) {
+	base := doc([]string{"p m/a", "p m/b"}, "c m/a m/b")
+	head := doc([]string{"p m/a", "p m/b"}, "c m/b m/a")
+	want := []EdgeChange{
+		{From: "m/a", To: "m/b", Kind: ir.EdgeCalls, Status: Removed},
+		{From: "m/b", To: "m/a", Kind: ir.EdgeCalls, Status: Added},
+	}
+	if got := Compare(base, head).Edges; !reflect.DeepEqual(got, want) {
+		t.Fatalf("edges %+v, want %+v", got, want)
+	}
+}
diff --git a/internal/ir/ir_test.go b/internal/ir/ir_test.go
index 8989265e4cd7280c256d0e5534ac6c53689ad5c8..33e6b42dbb8f1d1f1a820a5abcdc951ba7bd0e2b 100644
--- a/internal/ir/ir_test.go
+++ b/internal/ir/ir_test.go
@@ -130,3 +130,31 @@ func TestNodeShapeFollowsHash(t *testing.T) {
 		t.Errorf("a node without a shape must omit the key, got\n%s", out)
 	}
 }
+
+func TestInOrder(t *testing.T) {
+	n := func(ids ...string) []Node {
+		var out []Node
+		for _, id := range ids {
+			out = append(out, Node{ID: id})
+		}
+		return out
+	}
+	e := func(from, to string, k EdgeKind) Edge { return Edge{From: from, To: to, Kind: k} }
+	for _, c := range []struct {
+		name string
+		doc  IR
+		want bool
+	}{
+		{"empty", IR{}, true},
+		{"sorted", IR{Nodes: n("a", "a.F", "b"), Edges: []Edge{e("a", "b", EdgeCalls), e("a", "b", EdgeImports), e("a.F", "a", EdgeCalls)}}, true},
+		{"nodes out of order", IR{Nodes: n("b", "a")}, false},
+		{"an id twice", IR{Nodes: n("a", "a")}, false},
+		{"edges out of order by kind", IR{Edges: []Edge{e("a", "b", EdgeImports), e("a", "b", EdgeCalls)}}, false},
+		{"edges out of order by to", IR{Edges: []Edge{e("a", "c", EdgeCalls), e("a", "b", EdgeCalls)}}, false},
+		{"an edge twice", IR{Edges: []Edge{e("a", "b", EdgeCalls), e("a", "b", EdgeCalls)}}, false},
+	} {
+		if got := InOrder(&c.doc); got != c.want {
+			t.Errorf("%s: InOrder = %v, want %v", c.name, got, c.want)
+		}
+	}
+}
```

- [x] **Run:** `go test ./internal/ir ./internal/diff` Expected: FAIL (`undefined: InOrder`, `undefined: compareByKey`)

- [x] **Merge two IRs in order; match others by key**

```diff
diff --git a/internal/diff/diff.go b/internal/diff/diff.go
index 04daceaed22e364b90963a637ef30519c70de8d8..a2776b949fda738816815404d9ae4eeebb5eac7b 100644
--- a/internal/diff/diff.go
+++ b/internal/diff/diff.go
@@ -57,25 +57,33 @@ type Delta struct {
 // node only in head is added, only in base removed, and in both with a
 // different hash modified (external nodes have no hash, so they are never
 // modified). Edges are matched by (from, to, kind); locations are ignored.
+// Two IRs in ir.Sort's order are walked side by side, with no map of either
+// (16); others are matched through maps, to the same Delta.
 func Compare(base, head *ir.IR) Delta {
-	var d Delta
-	baseNodes := byID(base)
-	headNodes := byID(head)
-	var removed, added []ir.Node
-	for id, b := range baseNodes {
-		h, ok := headNodes[id]
-		switch {
-		case !ok:
-			removed = append(removed, b)
-		case h.Hash != b.Hash:
-			d.Nodes = append(d.Nodes, NodeChange{ID: id, Kind: h.Kind, Status: Modified})
-		}
-	}
-	for id, h := range headNodes {
-		if _, ok := baseNodes[id]; !ok {
-			added = append(added, h)
-		}
+	if ir.InOrder(base) && ir.InOrder(head) {
+		return compare(base, head, mergeNodes, mergeEdges)
 	}
+	return compareByKey(base, head)
+}
+
+func compareByKey(base, head *ir.IR) Delta { return compare(base, head, nodesByKey, edgesByKey) }
+
+// A nodeDiff finds the nodes whose hash changed, and those only in base and
+// only in head; an edgeDiff, the edges only in base and only in head.
+type (
+	nodeDiff func(base, head *ir.IR) (modified []NodeChange, removed, added []ir.Node)
+	edgeDiff func(base, head *ir.IR) (removed, added []edgeKey)
+)
+
+type edgeKey struct {
+	kind     ir.EdgeKind
+	from, to string
+}
+
+func compare(base, head *ir.IR, nodes nodeDiff, edges edgeDiff) Delta {
+	var d Delta
+	modified, removed, added := nodes(base, head)
+	d.Nodes = modified
 	pkgs := map[string]bool{} // package ids on either side
 	for _, n := range append(slices.Clip(base.Nodes), head.Nodes...) {
 		if n.Kind == ir.KindPackage {
@@ -99,10 +107,51 @@ func Compare(base, head *ir.IR) Delta {
 	}
 	slices.SortFunc(d.Nodes, func(a, b NodeChange) int { return strings.Compare(a.ID, b.ID) })
 
-	d.Edges = edges(base, head)
+	d.Edges = fold(edges(base, head))
 	return d
 }
 
+func nodesByKey(base, head *ir.IR) (modified []NodeChange, removed, added []ir.Node) {
+	baseNodes := byID(base)
+	headNodes := byID(head)
+	for id, b := range baseNodes {
+		h, ok := headNodes[id]
+		switch {
+		case !ok:
+			removed = append(removed, b)
+		case h.Hash != b.Hash:
+			modified = append(modified, NodeChange{ID: id, Kind: h.Kind, Status: Modified})
+		}
+	}
+	for id, h := range headNodes {
+		if _, ok := baseNodes[id]; !ok {
+			added = append(added, h)
+		}
+	}
+	return modified, removed, added
+}
+
+// mergeNodes is nodesByKey for two IRs whose nodes are in order by id.
+func mergeNodes(base, head *ir.IR) (modified []NodeChange, removed, added []ir.Node) {
+	b, h := base.Nodes, head.Nodes
+	for len(b) > 0 || len(h) > 0 {
+		switch {
+		case len(h) == 0 || len(b) > 0 && b[0].ID < h[0].ID:
+			removed = append(removed, b[0])
+			b = b[1:]
+		case len(b) == 0 || h[0].ID < b[0].ID:
+			added = append(added, h[0])
+			h = h[1:]
+		default:
+			if h[0].Hash != b[0].Hash {
+				modified = append(modified, NodeChange{ID: h[0].ID, Kind: h[0].Kind, Status: Modified})
+			}
+			b, h = b[1:], h[1:]
+		}
+	}
+	return modified, removed, added
+}
+
 func byID(d *ir.IR) map[string]ir.Node {
 	m := make(map[string]ir.Node, len(d.Nodes))
 	for _, n := range d.Nodes {
@@ -161,39 +210,78 @@ func splitDecl(id string, pkgs map[string]bool) (pkg, name string) {
 	return "", id
 }
 
-// edges compares edge sets and folds a removed a→b import with an added b→a
-// import into one reversed change.
-func edges(base, head *ir.IR) []EdgeChange {
-	type key struct {
-		kind     ir.EdgeKind
-		from, to string
-	}
-	set := func(d *ir.IR) map[key]bool {
-		s := make(map[key]bool, len(d.Edges))
+func edgesByKey(base, head *ir.IR) (removed, added []edgeKey) {
+	set := func(d *ir.IR) map[edgeKey]bool {
+		s := make(map[edgeKey]bool, len(d.Edges))
 		for _, e := range d.Edges {
-			s[key{e.Kind, e.From, e.To}] = true
+			s[edgeKey{e.Kind, e.From, e.To}] = true
 		}
 		return s
 	}
 	bs, hs := set(base), set(head)
-	var out []EdgeChange
 	for k := range hs {
-		if bs[k] {
-			continue
-		}
-		back := key{k.kind, k.to, k.from}
-		if k.kind == ir.EdgeImports && bs[back] && !hs[back] {
-			out = append(out, EdgeChange{From: k.from, To: k.to, Kind: k.kind, Status: Reversed})
-			continue
+		if !bs[k] {
+			added = append(added, k)
 		}
-		out = append(out, EdgeChange{From: k.from, To: k.to, Kind: k.kind, Status: Added})
 	}
 	for k := range bs {
-		if hs[k] {
-			continue
+		if !hs[k] {
+			removed = append(removed, k)
 		}
-		back := key{k.kind, k.to, k.from}
-		if k.kind == ir.EdgeImports && hs[back] && !bs[back] {
+	}
+	return removed, added
+}
+
+// mergeEdges is edgesByKey for two IRs whose edges are in ir.Sort's order.
+func mergeEdges(base, head *ir.IR) (removed, added []edgeKey) {
+	b, h := base.Edges, head.Edges
+	key := func(e ir.Edge) edgeKey { return edgeKey{e.Kind, e.From, e.To} }
+	for len(b) > 0 || len(h) > 0 {
+		c := 0
+		switch {
+		case len(h) == 0:
+			c = -1
+		case len(b) == 0:
+			c = 1
+		default:
+			c = cmp.Or(strings.Compare(b[0].From, h[0].From), strings.Compare(b[0].To, h[0].To),
+				strings.Compare(string(b[0].Kind), string(h[0].Kind)))
+		}
+		switch {
+		case c < 0:
+			removed = append(removed, key(b[0]))
+			b = b[1:]
+		case c > 0:
+			added = append(added, key(h[0]))
+			h = h[1:]
+		default:
+			b, h = b[1:], h[1:]
+		}
+	}
+	return removed, added
+}
+
+// fold turns the edges only in base and only in head into changes, folding
+// a removed a→b import with an added b→a import into one reversed change.
+func fold(removed, added []edgeKey) []EdgeChange {
+	set := func(ks []edgeKey) map[edgeKey]bool {
+		s := make(map[edgeKey]bool, len(ks))
+		for _, k := range ks {
+			s[k] = true
+		}
+		return s
+	}
+	gone, came := set(removed), set(added)
+	var out []EdgeChange
+	for _, k := range added {
+		status := Added
+		if k.kind == ir.EdgeImports && gone[edgeKey{k.kind, k.to, k.from}] {
+			status = Reversed
+		}
+		out = append(out, EdgeChange{From: k.from, To: k.to, Kind: k.kind, Status: status})
+	}
+	for _, k := range removed {
+		if k.kind == ir.EdgeImports && came[edgeKey{k.kind, k.to, k.from}] {
 			continue // reported as reversed
 		}
 		out = append(out, EdgeChange{From: k.from, To: k.to, Kind: k.kind, Status: Removed})
diff --git a/internal/ir/encode.go b/internal/ir/encode.go
index 63a344e1b7db57a59310273fbced4c1ceabc9ae3..0cf4882081ca927d8f4b5259109fe63f0ceeb5e8 100644
--- a/internal/ir/encode.go
+++ b/internal/ir/encode.go
@@ -23,9 +23,7 @@ func Sort(doc *IR) {
 		}
 	}
 	sortOnce(doc.Nodes, func(a, b Node) int { return cmp.Compare(a.ID, b.ID) })
-	sortOnce(doc.Edges, func(a, b Edge) int {
-		return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To), cmp.Compare(a.Kind, b.Kind))
-	})
+	sortOnce(doc.Edges, edgeOrder)
 	slices.SortFunc(doc.ParseErrors, func(a, b ParseError) int {
 		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.Message, b.Message))
 	})
@@ -49,6 +47,26 @@ func Sort(doc *IR) {
 	}
 }
 
+func edgeOrder(a, b Edge) int {
+	return cmp.Or(cmp.Compare(a.From, b.From), cmp.Compare(a.To, b.To), cmp.Compare(a.Kind, b.Kind))
+}
+
+// InOrder reports whether doc's nodes and edges are in Sort's order with no
+// node id and no edge twice: two such IRs can be merged in one pass (16).
+func InOrder(doc *IR) bool {
+	for i := 1; i < len(doc.Nodes); i++ {
+		if doc.Nodes[i-1].ID >= doc.Nodes[i].ID {
+			return false
+		}
+	}
+	for i := 1; i < len(doc.Edges); i++ {
+		if edgeOrder(doc.Edges[i-1], doc.Edges[i]) >= 0 {
+			return false
+		}
+	}
+	return true
+}
+
 func sortLocations(l []Location) {
 	sortOnce(l, func(a, b Location) int {
 		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.Line, b.Line))
diff --git a/internal/policy/apply.go b/internal/policy/apply.go
index 35c12dba0a38765059ce91f520d9a1b3319bc0d1..5a6a13e591d76e286fe6b9a5ecb7c16627cc9114 100644
--- a/internal/policy/apply.go
+++ b/internal/policy/apply.go
@@ -82,23 +82,9 @@ func canonical(doc *ir.IR) bool {
 			return cmp.Or(strings.Compare(a.Path, b.Path), cmp.Compare(a.Line, b.Line))
 		})
 	}
-	for i, n := range doc.Nodes {
-		if !sorted(n.Locations) || i > 0 && doc.Nodes[i-1].ID >= n.ID {
-			return false
-		}
-	}
-	for i, e := range doc.Edges {
-		if !sorted(e.Locations) {
-			return false
-		}
-		if i > 0 {
-			d := doc.Edges[i-1]
-			if cmp.Or(strings.Compare(d.From, e.From), strings.Compare(d.To, e.To), strings.Compare(string(d.Kind), string(e.Kind))) >= 0 {
-				return false
-			}
-		}
-	}
-	return true
+	return ir.InOrder(doc) &&
+		!slices.ContainsFunc(doc.Nodes, func(n ir.Node) bool { return !sorted(n.Locations) }) &&
+		!slices.ContainsFunc(doc.Edges, func(e ir.Edge) bool { return !sorted(e.Locations) })
 }
 
 // apply is Apply for any Policy and any IR.
```

- [x] **Run:** `go test ./internal/ir ./internal/diff ./internal/policy ./internal/cli` Expected: PASS (the diff goldens are unchanged)

- [x] **Commit:** `Compare two sorted IRs in one pass`

---

### Task 5: serve keeps the Base in order (`cli`)

The test builds a `-base HEAD` session, renders its View once, and checks that the kept Base is as `ir.Sort` leaves it.

**Files:**
- Test: `internal/cli/change_test.go`
- Code: `internal/cli/change.go`

**Steps:**

- [x] **Write the failing test**

```diff
diff --git a/internal/cli/change_test.go b/internal/cli/change_test.go
index 3ed03f8e66815be73270bb4eb0a03810d1ce9211..2bb79a4fec35b561c7ea700f2055bb689ee22655 100644
--- a/internal/cli/change_test.go
+++ b/internal/cli/change_test.go
@@ -2,6 +2,7 @@ package cli
 
 import (
 	"context"
+	"io"
 	"path/filepath"
 	"strings"
 	"sync/atomic"
@@ -144,3 +145,21 @@ func TestServeBaseNotesAHiddenCompareOnce(t *testing.T) {
 		t.Errorf("the note is printed %d times, want once: %s", got, stderr.String())
 	}
 }
+
+// The kept Base is in ir.Sort's order, as head's IR is: Compare then walks
+// the two side by side instead of matching 110k nodes by id (16).
+func TestServeKeepsTheBaseInOrder(t *testing.T) {
+	dir := diffRepo(t)
+	withUI(t)
+	o := &htmlOptions{}
+	if err := o.load(); err != nil {
+		t.Fatal(err)
+	}
+	s := &session{dir: dir, base: "HEAD", o: o, cache: scan.NewCache(), stderr: io.Discard}
+	if _, _, err := s.view(context.Background()); err != nil {
+		t.Fatal(err)
+	}
+	if s.baseDoc == nil || !ir.InOrder(s.baseDoc) || s.baseDoc.Edges == nil {
+		t.Fatal("the kept Base is not as ir.Sort leaves it")
+	}
+}
```

- [x] **Run:** `go test ./internal/cli -run TestServeKeepsTheBaseInOrder` Expected: FAIL (the kept Base is not as `ir.Sort` leaves it)

- [x] **Sort the Base once, when it is scanned**

```diff
diff --git a/internal/cli/change.go b/internal/cli/change.go
index 5681e0515bde55ecfcd0762f74943de8c49f1b18..76d7a32096f8ef260a62cfc664d94acde84c059e 100644
--- a/internal/cli/change.go
+++ b/internal/cli/change.go
@@ -47,6 +47,7 @@ func (s *session) viewOf(ctx context.Context, src *source, doc *ir.IR, pol *poli
 			return nil, fmt.Errorf("base %s: %w", mb[:min(12, len(mb))], err)
 		}
 		d.Ref = ir.Ref{Commit: mb}
+		ir.Sort(d) // once, as head's IR is on each rescan: Compare then merges the two (16)
 		s.baseDoc = d
 	}
 	delta := diff.Compare(s.baseDoc, doc)
```

- [x] **Run:** `go test -race ./internal/cli` Expected: PASS

- [x] **Commit:** `Keep serve's Base in order, so Compare merges`

---

### Task 6: accept.mjs reloads only after the layout worker answered (`web/e2e`)

Separate from Tasks 1–5. This task has no red step. The crash is Firefox's, and it is random: 1 in 12 of `accept.mjs`'s Firefox runs here, 3 in 5 in 15's runs. The evidence is `firefox-reload.mjs` (beside this plan) and the A/B in **Measurements**.

`loaded` waits for the page's first drawing, or for a status other than "Laying out…" (a failed or too-big layout). The worker made either one, so its script has loaded. It also accepts an empty state with no status, such as "Declarations not included": that state lays nothing out, so it starts no worker. The twelve reloads that followed a `goto` at once now wait for it first.

A reload after a click or a key press already follows a drawing, but not always a loaded worker. `superseding()` (`web/src/layout.ts`) terminates the worker when a layout is superseded, and the next layout starts a fresh 1.5 MB blob worker. A reload in that window can crash too. Those three reloads keep relying on `accept.mjs`'s rerun on "Page crashed" (08), which stays as it is.

**Files:**
- Code: `web/e2e/accept.mjs`

**Steps:**

- [x] **Reproduce** (by hand; not a replay step): `node docx/features/16-fast-rescan/firefox-reload.mjs 100`. Expected: `big-now` crashes on a share of its reloads (12 of 40 here); `big-after` and `small-now` never do.

- [x] **Wait for the worker before a reload**

```diff
diff --git a/web/e2e/accept.mjs b/web/e2e/accept.mjs
index 21548176e91178e344c0d9bc8a13add35188b4da..4698eeebf1c5ea087a7785c9e636ca49264cf816 100644
--- a/web/e2e/accept.mjs
+++ b/web/e2e/accept.mjs
@@ -153,6 +153,14 @@ const base = "file://" + dir + "/";
 const vp = (p) => p.locator(".react-flow__viewport").getAttribute("style");
 const settle = (p) => p.waitForTimeout(900);
 const drawn = (p) => p.locator(".react-flow__node").first().waitFor({ timeout: 30000 });
+// Firefox (Playwright's 155.0) crashes the page on a reload while the page's
+// 1.5 MB blob worker (ELK) is still loading: 177 of 300 reloads of a page with
+// no zu code but such a worker crashed, none of 150 once the worker had
+// answered (16). A reload waits for the worker's first answer (a drawing, or
+// a status other than "Laying out…"), or for a state that lays nothing out
+// and so starts no worker ("Declarations not included").
+const loaded = (p) => p.waitForFunction(() => document.querySelector(".react-flow__node, main .empty:not(#zu-status)") ||
+  /^(?!Laying out)./.test(document.getElementById("zu-status")?.textContent ?? ""), null, { timeout: 30000 });
 const hash = (p) => p.evaluate(() => decodeURIComponent(location.hash));
 async function run(b) {
   const out = {};
@@ -233,6 +241,7 @@ async function run(b) {
   // in a minimap. A reload shows the page as
   // it opens.
   await p.goto(base + "big.html#d=1");
+  await loaded(p);
   await p.reload();
   await drawn(p);
   await settle(p);
@@ -340,6 +349,7 @@ async function run(b) {
   p = await b.newPage();
   const at = async (h) => {
     await p.goto(base + "policy.html" + h);
+    await loaded(p);
     await p.reload();
     await drawn(p);
     await settle(p);
@@ -403,6 +413,7 @@ async function run(b) {
   out.crap = [];
   for (const d of [1, 2]) {
     await p.goto(base + `crap.html#d=${d}`);
+    await loaded(p);
     await p.reload();
     await drawn(p);
     await settle(p);
@@ -426,11 +437,13 @@ async function run(b) {
     getComputedStyle(document.querySelector(`.react-flow__node[data-id="${id}"] .node`)).backgroundColor)).size);
   out.crapLegend = await p.locator(".legend").innerText().then((t) => t.split("\n").filter((l) => /CRAP|≤|>/.test(l)));
   await p.goto(base + "crap.html#d=3&s=m%2Finternal%2Fcli");
+  await loaded(p);
   await p.reload();
   await drawn(p);
   await settle(p);
   out.crapPanel = await p.locator(".crap-facts").innerText().then((t) => t.split("\n").filter(Boolean)).catch(() => null);
   await p.goto(base + "crap.html#f=m%2Finternal%2Fcli&s=m%2Finternal%2Fcli.Run");
+  await loaded(p);
   await p.reload();
   await drawn(p);
   await settle(p);
@@ -446,6 +459,7 @@ async function run(b) {
   out.crapChange = await p.locator(`.react-flow__node[data-id="${store}"] .node`).getAttribute("class")
     .then((c) => ["crap-red", "st-modified"].map((k) => c.split(" ").includes(k)));
   await p.goto(base + "crap-change.html#d=2&s=example.com%2Fshop%2Finternal");
+  await loaded(p);
   await p.reload();
   await drawn(p);
   await settle(p);
@@ -488,6 +502,7 @@ async function run(b) {
   await settle(p);
   out.foldOpen = [(await hash(p)).includes("t=m#more"), await p.locator(".node.chip.group .label").first().textContent().then((t) => /^fold \d+$/.test(t))];
   await p.goto(base + "grouped.html");
+  await loaded(p);
   await p.reload();
   await drawn(p);
   await settle(p);
@@ -499,6 +514,7 @@ async function run(b) {
   await settle(p);
   out.stripOpen = [await hash(p), await p.locator(".react-flow__node[data-id='m/testdata'] .node.demoted").count()];
   await p.goto(base + "chain.html");
+  await loaded(p);
   await p.reload();
   await drawn(p);
   await settle(p);
@@ -511,6 +527,7 @@ async function run(b) {
   await settle(p);
   const shopOpen = await p.locator(".react-flow__node-container[data-id='example.com/shop']").count();
   await p.goto(base + "with.html#f=example.com/shop/internal");
+  await loaded(p);
   await p.reload();
   await drawn(p);
   await settle(p);
@@ -522,6 +539,7 @@ async function run(b) {
   // still opens it in place (N10).
   const kOpen = () => p.locator(".react-flow__node-container[data-id='k']").count();
   await p.goto(base + "rooted.html");
+  await loaded(p);
   await p.reload();
   await drawn(p);
   await settle(p);
@@ -534,6 +552,7 @@ async function run(b) {
   await settle(p);
   const closedAfter = [await kOpen(), await p.locator(".react-flow__node[data-id='k']").count(), await p.evaluate(() => location.hash)];
   await p.goto(base + "rooted.html#t=k");
+  await loaded(p);
   await p.reload();
   await drawn(p);
   await settle(p);
@@ -564,6 +583,7 @@ async function run(b) {
   const get = await hrefs();
   out.diffTitle = await p.locator(".panel a.diff-link", { hasText: "Diff on the host" }).getAttribute("title"); // 14b
   await p.goto(base + linked + "ReadWriter");
+  await loaded(p);
   await p.reload();
   await drawn(p);
   await settle(p);
```

- [x] **Run:** `make build >/dev/null && cd web/e2e && node accept.mjs` Expected: PASS (57 checks in each engine)

- [x] **Commit:** `Reload a page in the browser checks only after its layout worker answered`

---

### Task 7: An added or removed package assembles only its importers (`scan`)

After Task 2, a package that appears or goes makes the rescan assemble every package: on kubernetes that is 2,964 parts, and one `-base` rescan in 44 went over 2 s (**Measurements**, worst edits before Task 7). Task 7 treats an added or removed package as a change of what lives at its import path. Only the new package's part and the packages whose imports name that path are rebuilt. The rest keep their parts and are joined in order, as before.

**What else reads the package set.** Each place a part can read another package was checked:
- **`index.classify`** is the only lookup of another package, and it looks up only `ix.pkgs[path]` for the exact path an import names. Its other outcomes (external, standard library, unresolved) read the modules and their requires, never the package set. So a package at a new path changes exactly the parts of the files that import that path, including an import that was unresolved until the package appeared.
- **Module roots** (`moduleFor`, `importPath`) come from the walk's `go.mod` list, not from the packages. A new package that brings its own `go.mod` changes the modules, and `sameModules` still rebuilds every part.
- **`separable`** is computed again on every scan, over the whole new index. A new package whose ids fall among another's (`m/a.F/y` beside `m/a`'s `F`) makes the tree not separable, and the whole tree is assembled, as before. When that package goes, the Cache holds no parts (the last scan was whole), so every part is built once.
- **`dropCollisions`** checks a declaration id against `ix.pkgs`. A hit would need a package id that is another package's id plus "." and more, which `separable` rules out. So within a part it never fires, and the package set does not reach it.
- **`buildIndex`** is built again from every file's facts on each scan. A part reads its own package's entry from it, and the entries at the paths its imports name.
- **The rest of a part** (its package node, hash, Measures, externals, unresolved counts) reads only its own files' facts and the modules.

**The tests.**
- `TestCacheAssemblesOnlyWhatChanged` (Task 2) now expects one package, not all, after a new package and after a package renamed. The renamed package is new, and the old one had no importers.
- `TestCacheAssemblesImportersOfAnAddedOrRemovedPackage` is new. Package `a` imports `m/c` before `c` exists, and calls through it: the key case, an unresolved import that resolves when `c` appears. `b` imports `m/c/d`, a path below `c`, which `c`'s arrival must not rebuild. `e` imports `a`, whose surface never changes, so `e` is never rebuilt. The steps are:
  - `c` appears: `c` and `a`;
  - `c/d` appears: `d` and `b`;
  - `c` goes: `a` alone;
  - `c/d` goes: `b` alone;
  - `x/d` appears, imported by nothing: itself alone;
  - `a.F/y` appears: the whole tree (not separable);
  - it goes: the whole tree again, once.

  After every step, the IR is compared byte for byte with a cold scan's.
- `TestCorpusRescansMatchColdScans` (Task 2) builds the key case on a real tree. It adds `zz_uses.go` to the edited package, importing `<package>/zzparity`, which does not exist yet. It then adds `zzparity` and deletes it again. The "new package" step now checks that the scan assembled no more than the importers of `zzparity` plus one, and "package deleted" no more than those importers. Both must also reuse parts. `zzparity` has at least one importer, which the test checks. Every step is still byte-identical to a cold scan. It now makes fourteen steps.

The tests are red on assertions: `main` after Task 6 assembles every package after a new package.

**Files:**
- Test: `internal/scan/assembly_test.go`, `internal/scan/corpus_parity_test.go`
- Code: `internal/scan/assembly.go`, `internal/scan/cache.go`

**Steps:**

- [ ] **Write the failing tests**

```diff
diff --git a/internal/scan/assembly_test.go b/internal/scan/assembly_test.go
index fc8721a54eb4af21aa57543e7ea6bfa2f0db088f..a8709b38a8716eedc277648f9ab70ae16792ca35 100644
--- a/internal/scan/assembly_test.go
+++ b/internal/scan/assembly_test.go
@@ -18,8 +18,9 @@ import (
 
 // A rescan through a Cache assembles again only the packages whose inputs
 // changed (16): a package whose files changed, every package importing one
-// whose Name, functions or types changed, and all of them when a go.mod or
-// the set of packages changed. Every IR is a cold scan's, byte for byte.
+// whose Name, functions or types changed or that appeared or went, and all
+// of them when a go.mod's paths or require lines changed. Every IR is a cold
+// scan's, byte for byte.
 func TestCacheAssemblesOnlyWhatChanged(t *testing.T) {
 	root := fixture(t, "shop")
 	cache := NewCache()
@@ -88,11 +89,11 @@ func TestCacheAssemblesOnlyWhatChanged(t *testing.T) {
 	}
 	step("the function gone", moneyAndImporters)
 	write("internal/extra/extra.go", "package extra\n")
-	step("a new package", all)
+	step("a new package", n(1)) // nothing imports it
 	if err := os.Rename(filepath.Join(root, "internal", "extra"), filepath.Join(root, "internal", "other")); err != nil {
 		t.Fatal(err)
 	}
-	step("a package renamed", all) // as many packages as before, one of them new
+	step("a package renamed", n(1)) // a new package, and one gone that nothing imported
 	write("go.mod", "module example.com/shop\n\ngo 1.24\n\nrequire (\n\tgithub.com/lib/pq v1.10.9\n\tgolang.org/x/sync v0.9.0\n)\n")
 	step("a version in go.mod", n(0)) // the IR holds require lines, not versions
 	write("go.mod", "module example.com/shop\n\ngo 1.24\n\n// the requires move down a line\nrequire (\n\tgithub.com/lib/pq v1.10.9\n\tgolang.org/x/sync v0.9.0\n)\n")
@@ -127,6 +128,60 @@ func TestCacheAssemblesImportersOfARenamedPackage(t *testing.T) {
 	}
 }
 
+// A package's import may name a path the tree does not hold yet: the import
+// is unresolved, and so are the calls through it. When a package appears at
+// that path, or goes, only it and the packages whose imports name its path
+// are assembled again: the rest read nothing of it (16). A package whose
+// arrival lets ids meet assembles the whole tree.
+func TestCacheAssemblesImportersOfAnAddedOrRemovedPackage(t *testing.T) {
+	root := tree(t, map[string]string{
+		"go.mod": "module example.com/m\n",
+		"a/a.go": "package a\n\nimport \"example.com/m/c\"\n\nfunc F() { c.G() }\n",
+		"b/b.go": "package b\n\nimport \"example.com/m/c/d\"\n\nfunc H() { d.K() }\n",
+		"e/e.go": "package e\n\nimport \"example.com/m/a\"\n\nfunc E() { a.F() }\n",
+	})
+	cache := NewCache()
+	step := func(what string, want func(Stats) int, edit func(p string) error, rel string) {
+		t.Helper()
+		if edit != nil {
+			if err := edit(filepath.Join(root, filepath.FromSlash(rel))); err != nil {
+				t.Fatal(err)
+			}
+		}
+		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
+		if err != nil {
+			t.Fatal(err)
+		}
+		cold, cs := run(t, root, 0)
+		if a, b := encode(t, warm), encode(t, cold); !bytes.Equal(a, b) {
+			t.Errorf("%s: the IR differs from a cold scan's\n%s", what, firstDiff(a, b))
+		}
+		if n := want(cs); ws.Assembled != n {
+			t.Errorf("%s: assembled %d packages, want %d", what, ws.Assembled, n)
+		}
+	}
+	add := func(body string) func(string) error {
+		return func(p string) error {
+			if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
+				return err
+			}
+			return os.WriteFile(p, []byte(body), 0o644)
+		}
+	}
+	all := func(cs Stats) int { return cs.Packages }
+	n := func(k int) func(Stats) int { return func(Stats) int { return k } }
+
+	step("first scan", all, nil, "")
+	step("c appears: a's import resolves", n(2), add("package c\n\nfunc G() {}\n"), "c/c.go")
+	step("c/d appears: b's import resolves", n(2), add("package d\n\nfunc K() {}\n"), "c/d/d.go")
+	step("c goes: a's import is unresolved again", n(1), os.Remove, "c/c.go")
+	step("c/d goes", n(1), os.RemoveAll, "c")
+	step("x/d appears, imported by nothing", n(1), add("package d\n\nfunc K() {}\n"), "x/d/d.go")
+	step("a.F/y appears: its ids fall among a's", all, add("package y\n"), "a.F/y/y.go")
+	step("a.F/y goes", all, os.RemoveAll, "a.F")
+	step("no change", n(0), nil, "")
+}
+
 // Dots are legal in directory names, so two nodes can share an id: a
 // declaration and a package, two declarations, or a declaration and a
 // required module. Then the scan assembles the whole tree every time, as it
diff --git a/internal/scan/corpus_parity_test.go b/internal/scan/corpus_parity_test.go
index f8dc8c47bfc3aa7605006a80bfc1a4343ed6d54f..c0aa963fc0c8c28fc72f87d23d681d51e922bba4 100644
--- a/internal/scan/corpus_parity_test.go
+++ b/internal/scan/corpus_parity_test.go
@@ -5,19 +5,25 @@ import (
 	"cmp"
 	"context"
 	"os"
+	"path"
 	"path/filepath"
 	"reflect"
 	"regexp"
 	"slices"
 	"strings"
 	"testing"
+
+	"zu/internal/ir"
 )
 
 // On a real tree, every rescan through a Cache writes the IR a cold scan
 // writes, byte for byte, after each kind of edit a watch sees (16). The
 // random-edit test covers the rules; this one covers a real tree's scale:
 // kubernetes' 2,963 packages, its staging modules (required and scanned), a
-// package with 347 importers. It runs only when ZU_CORPUS names a writable
+// package with 347 importers. After a package appears, it also checks that
+// no more than that package and the packages importing its path were
+// assembled, and after it goes, no more than those importers; the new
+// package is imported before it exists, so an unresolved import resolves. It runs only when ZU_CORPUS names a writable
 // copy of a corpus tree (`cp -cRp`, never the corpus itself), and puts back
 // every file it touched. ZU_CORPUS_PKG names the package to edit, relative
 // to the tree; the default is kubernetes' apimachinery util/sets.
@@ -59,7 +65,7 @@ func TestCorpusRescansMatchColdScans(t *testing.T) {
 				t.Error(err)
 			}
 		}
-		for _, p := range []string{"zz_parity.go", "zz_broken.go", "zzparity"} {
+		for _, p := range []string{"zz_parity.go", "zz_broken.go", "zz_uses.go", "zzparity"} {
 			if err := os.RemoveAll(filepath.Join(dir, p)); err != nil {
 				t.Error(err)
 			}
@@ -87,7 +93,7 @@ func TestCorpusRescansMatchColdScans(t *testing.T) {
 	pkg := "package " + string(name) + "\n\n"
 
 	cache := NewCache()
-	step := func(what string, partial bool) {
+	step := func(what string, partial bool) (*ir.IR, int) {
 		t.Helper()
 		warm, ws, err := Run(context.Background(), Options{Tree: dirOf(t, root), Cache: cache})
 		if err != nil {
@@ -103,10 +109,30 @@ func TestCorpusRescansMatchColdScans(t *testing.T) {
 		if partial && ws.Assembled >= cs.Packages {
 			t.Errorf("%s: assembled all %d packages: the tree does not reuse parts", what, cs.Packages)
 		}
-		t.Logf("%-24s assembled %4d of %d packages, %d parse errors", what, ws.Assembled, cs.Packages, len(cold.ParseErrors))
+		t.Logf("%-34s assembled %4d of %d packages, %d parse errors", what, ws.Assembled, cs.Packages, len(cold.ParseErrors))
+		return cold, ws.Assembled
+	}
+	// importers counts the packages importing id in doc.
+	importers := func(doc *ir.IR, id string) int {
+		n := 0
+		for _, e := range doc.Edges {
+			if e.Kind == ir.EdgeImports && e.To == id {
+				n++
+			}
+		}
+		return n
 	}
 
-	step("first scan", false)
+	first, _ := step("first scan", false)
+	var id string // the edited package's import path
+	for _, n := range first.Nodes {
+		if n.Kind == ir.KindPackage && path.Dir(n.Locations[0].Path) == filepath.ToSlash(rel) {
+			id = n.ID
+		}
+	}
+	if id == "" {
+		t.Fatalf("no package at %s", rel)
+	}
 	write(files[0], withFunc(""))
 	step("new function", true)
 	write(files[0], withFunc(" _ = 1 "))
@@ -123,10 +149,19 @@ func TestCorpusRescansMatchColdScans(t *testing.T) {
 	step("new file", true)
 	remove(filepath.Join(dir, "zz_parity.go"))
 	step("file deleted", true)
+	write(filepath.Join(dir, "zz_uses.go"), []byte(pkg+"import \""+id+"/zzparity\"\n\nfunc zzUses() { zzparity.F() }\n"))
+	step("a file importing a missing package", true)
 	write(filepath.Join(dir, "zzparity", "zz.go"), []byte("package zzparity\n\nfunc F() {}\n"))
-	step("new package", false)
+	with, n := step("new package", true)
+	if k := importers(with, id+"/zzparity"); k == 0 || n > k+1 {
+		t.Errorf("new package: assembled %d packages; %d import it", n, k)
+	}
 	remove(filepath.Join(dir, "zzparity"))
-	step("package deleted", false)
+	if _, n := step("package deleted", true); n > importers(with, id+"/zzparity") {
+		t.Errorf("package deleted: assembled %d packages; %d imported it", n, importers(with, id+"/zzparity"))
+	}
+	remove(filepath.Join(dir, "zz_uses.go"))
+	step("the importing file deleted", true)
 	write(filepath.Join(dir, "zz_broken.go"), []byte(pkg+"func (\n"))
 	step("parse error", true)
 	remove(filepath.Join(dir, "zz_broken.go"))
```

- [ ] **Run:** `go test ./internal/scan -run 'TestCacheAssemblesOnlyWhatChanged|TestCacheAssemblesImportersOfAnAddedOrRemovedPackage'` Expected: FAIL (a new package: assembled 6 packages, want 1; c appears: assembled 4 packages, want 2)

- [ ] **Rebuild a new package, and the importers of a new, gone or changed one**

```diff
diff --git a/internal/scan/assembly.go b/internal/scan/assembly.go
index ed2083fd792c7e307cc49e760183c9d90cfe601b..88a12d73d954528a7843fd678f1cffad5577f7eb 100644
--- a/internal/scan/assembly.go
+++ b/internal/scan/assembly.go
@@ -15,8 +15,9 @@ import (
 // package node, its declarations, the edges out of them, its unresolved
 // calls and imports, the externals its imports reach and its Measures.
 // Beyond its own files a part reads only the modules (every go.mod) and,
-// through its imports, the surface of the packages it imports: their Name,
-// functions and types. An assembly is never changed once built.
+// through its imports, whether a package is at each path it imports and, if
+// one is, its surface: its Name, functions and types. An assembly is never
+// changed once built.
 type assembly struct {
 	modules []*module
 	parts   map[string]*part // by package id
@@ -35,28 +36,40 @@ type part struct {
 }
 
 // assembleParts assembles facts from prev's parts where they still hold and
-// builds the rest, and reports how many packages it built. It returns nil
-// when two nodes could share an id (see separable): only a whole assembly
-// resolves that, as dropCollisions does.
+// builds the rest, and reports how many packages it built. It builds a
+// package whose files changed, a package that is new, and every package
+// importing the path of one that is new, gone, or whose surface changed:
+// index.classify looks a package up only by the exact path an import names.
+// It builds them all when the modules changed. It returns nil when two
+// nodes could share an id (see separable): only a whole assembly resolves
+// that, as dropCollisions does.
 func assembleParts(prev *assembly, w *walkResult, facts []*fileFacts) (*assembly, int) {
 	ix := buildIndex(w, facts)
 	if !separable(ix, w) {
 		return nil, 0
 	}
-	reuse := prev != nil && len(prev.parts) == len(ix.pkgs) && sameModules(prev.modules, w.Modules)
-	for id := range ix.pkgs {
-		reuse = reuse && prev.parts[id] != nil
-	}
+	reuse := prev != nil && sameModules(prev.modules, w.Modules)
 	build := map[string]bool{}
+	var moved []string // paths whose package is new, gone or has a new surface
 	for id, p := range ix.pkgs {
-		if !reuse || !slices.Equal(prev.parts[id].files, p.Files) {
+		var old *part
+		if reuse {
+			old = prev.parts[id]
+		}
+		switch {
+		case old == nil:
 			build[id] = true
+			moved = append(moved, id)
+		case !slices.Equal(old.files, p.Files):
+			build[id] = true
+			if surfaceOf(p) != old.surface {
+				moved = append(moved, id)
+			}
 		}
 	}
 	if reuse {
-		var moved []string // packages whose surface changed: their importers resolve against it
-		for id := range build {
-			if surfaceOf(ix.pkgs[id]) != prev.parts[id].surface {
+		for id := range prev.parts {
+			if ix.pkgs[id] == nil {
 				moved = append(moved, id)
 			}
 		}
diff --git a/internal/scan/cache.go b/internal/scan/cache.go
index 37f65162b2c0b76d02189745a34b78488556b8b7..e16ab4d1d5e3071070b24f96192159e88c46d2d3 100644
--- a/internal/scan/cache.go
+++ b/internal/scan/cache.go
@@ -12,9 +12,10 @@ import (
 // hash, so a rescan parses only the files whose content changed (10). A
 // file's facts depend on nothing but its path and content, so one Cache
 // serves any Tree. It also keeps the last scan's assembly by package, so a
-// rescan assembles again only the packages whose files or imported surfaces
-// changed, and every package when the package set or the modules (a path, a
-// directory, or a require's path or line) changed (16). The rest of the IR is
+// rescan assembles again only the packages whose files changed, that are
+// new, or that import a path whose package is new, gone or has a new
+// surface, and every package when the modules (a path, a directory, or a
+// require's path or line) changed (16). The rest of the IR is
 // the last scan's, which is what a cold scan would build of it, byte for
 // byte. Keep one Cache per sequence of scans of one tree: scanning another
 // tree through it (serve's Base, say) replaces the kept assembly, and each
```

- [ ] **Run:** `go test -race ./internal/scan` Expected: PASS

- [ ] **Run:** `go test ./...` Expected: PASS

- [ ] **Commit:** `Assemble only a new or removed package's importers`

---

### Task 8: Acceptance

**Files:**
- Record: `docx/features/16-fast-rescan/acceptance.md` (written by hand)

**Steps:**

- [ ] **Run:** `make check` Expected: PASS (read the lint output: RTK's wrapper exits 0 with issues)

- [ ] **Run:** `go test -race -count=1 ./internal/scan ./internal/policy ./internal/diff ./internal/ir ./internal/export ./internal/cli ./internal/watch` Expected: PASS

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (57 checks in each engine)

- [ ] **Run:** `cd web/e2e && node serve.mjs` Expected: PASS (10 checks in each engine)

- [ ] **Run:** `node docx/features/16-fast-rescan/measure.mjs --selftest` Expected: PASS

- [ ] **Corpus parity** (by hand; not a replay step). Make `cp -cRp` copies of the three corpus trees in a scratch directory (never the corpus itself), and delete them after. Run:
  - `ZU_CORPUS=<kubernetes copy> go test ./internal/scan -run TestCorpusRescansMatchColdScans -count=1 -v -timeout 20m`
  - the same with `ZU_CORPUS=<hugo copy> ZU_CORPUS_PKG=common/hugio`
  - the same with `ZU_CORPUS=<cobra copy> ZU_CORPUS_PKG=doc`

  Expected: PASS, with fourteen steps each, and each copy's `git status` clean afterwards. Record each step's assembled count in `acceptance.md`. "new package" should assemble 2 packages and "package deleted" 1: the new package, and the edited package that imports it.

- [ ] **Measure** (by hand; not a replay step). After `make build`, work on `cp -cRp` copies of `.zu/corpus/kubernetes@v1.37.0` in a scratch directory (never the corpus itself), and delete them after. Run `git status` once in the first copy so its index is fresh (**Out of scope**). Leave the second copy untouched, for the first run after a fresh copy.

  **Load rule** (decided before measuring): record the load average before each run. If the 1-minute load is above 4 at the start, wait for it to fall or run again, up to twice. Keep every run in `acceptance.md`, and say which one is gated.

  1. `node docx/features/16-fast-rescan/measure.mjs <copy1> pkg/util/env - dirty`
  2. `node docx/features/16-fast-rescan/measure.mjs <copy1> pkg/kubelet <HEAD~50 sha> dirty`
  3. `node docx/features/16-fast-rescan/measure.mjs <copy2> pkg/kubelet <HEAD~50 sha> clean`
  4. `WAIT=scan node docx/features/16-fast-rescan/measure.mjs <copy1> staging/src/k8s.io/apimachinery/pkg/util/sets - dirty` (347 importers; the Project View leaves this package's declarations folded, so rounds wait for the rescan)
  5. `node docx/features/16-fast-rescan/measure.mjs <copy1> staging/src/k8s.io/apimachinery/pkg/util/sets <HEAD~50 sha> dirty`
  6. `NEWPKG=1 node docx/features/16-fast-rescan/measure.mjs <copy1> pkg/util/env - dirty` (a new package each round, imported by nothing)
  7. `NEWPKG=1 node docx/features/16-fast-rescan/measure.mjs <copy1> pkg/kubelet <HEAD~50 sha> dirty`

  Pass criteria, against the targets in **Doc amendments** 2:
  - every watch rescan in every run is under 2 s, the copy2 run's first included;
  - the median is at most 400 ms in runs 1 and 6, and at most 1 s in runs 2, 3 and 7;
  - runs 4 and 5 are gated on "under 2 s" only; record their medians;
  - no run prints a `WARNING` line (one watch rescan per round).

  Record each run's load average and its worst case in `acceptance.md`.

- [ ] **Firefox** (by hand): run `accept.mjs` 5 times. Record every "page crashed" line. Expected: none from the twelve guarded reloads; a crash on one of the three unguarded ones is rerun, and recorded.

- [ ] **Commit:** `Record fast rescan's acceptance`

---

## Risks

- **Memory.** The Cache now keeps the last scan's parts: about one more IR's worth of nodes and edges, plus a surface string per package. End-to-end RSS on kubernetes was 86–793 MB after and 187–729 MB before, read once at the end of each run, with no consistent difference (627 → 287 MB in one pair, 729 → 793 MB in another). A rescan allocates much less (185 MB instead of 786 MB plain, 515 MB instead of 1,064 MB with `-base`), which offsets the parts kept.
- **Shared location lists.** Successive IRs, and `Apply`'s output, share location slices with the Cache's parts. Nothing writes to a location list after a part is built: `ir.Sort` checks order before sorting (`sortOnce`), and the old `Apply` path clones. A future change that appends to or sorts a node's `Locations` in place, on an IR from a Cache, would corrupt later scans. The random-edit test would catch a sort; an append would need its own check. The `Cache` doc comment says so, and says to keep one Cache per sequence of scans of one tree.
- **A tree with dotted directory names falls back to a whole assembly on every scan**, so it keeps 13's timings (about 0.9 s on a kubernetes-sized tree). None of the three corpus trees does.
- **Surface is coarse on purpose.** An importer is rebuilt when its import's function or type *names* change, not their bodies. That is what resolution reads: `index` resolves a call by name. A change to how resolution works (for example, reading method sets or signatures) must widen `surfaceOf`. Its comment, and those of `resolveCall` and `embeds`, say so. The random-edit test catches what its generator reaches, and the corpus test (`ZU_CORPUS`) is the backstop on real trees: with Name dropped from the surface it fails on hugo at the rename step.
- **`export.Change` is now the largest `-base` stage** (about 160 ms, Deviation 3), and `walk` (84–102 ms, most of it `Lstat` syscalls) the largest plain one. Handing the watcher's stamps to the `ListTree` would remove most of `walk`. That is a follow-up.
- **Firefox.** Task 6 removes the crash from the harness, not from Firefox. In Playwright's Firefox 155, a reload within about a second of a zu page's load, while the layout worker's 1.5 MB `blob:` script is still loading, can crash the tab. Scrutiny tried two page-side mitigations, and both failed: terminating the worker on `pagehide` (54 of 80 reloads still crashed) and a `data:` URL worker (20 of 60). Loading the worker from a separate file is not possible: the page is one self-contained HTML file (ADR 0006). Doc amendments 1 records the risk in `decisions.md`. Release Firefox was not tried, because none is installed on this machine, and none was installed for this.
- **Other sessions' load.** Every figure was taken on a shared machine, and each row gives its load average. From this revision on, a run that starts at a load above 4 is rerun, up to twice, and every run is kept (Task 8).
- **Edits that rebuild more.** A function added to a package with many importers rebuilds them all (**Measurements**, worst edits). It stays under 2 s, but not within the medians' budgets, which cover edits to a package with few importers. A new or removed package now rebuilds only itself and the packages importing its path. A module change (a new `go.mod`, a require's line) and a tree that is not separable still rebuild every part.

## Notes

- **Task count: 8**, within Quick mode's limit and the lead's 9. The scrutiny-16 revision added steps and tests to Tasks 1, 2 and 6. The lead's ruling on the new-package miss added Task 7.
- **TDD:** every task but 6 writes its failing tests first. Task 1 is red on an assertion twice (its second test only once the listing is kept), and Tasks 5 and 7 too; Tasks 2–4 are red on a build error (Deviation 4). Mutants were run against each finished task, and every one was killed:
  - Task 1: `hunksOf` failing on a listed file that is gone;
  - Task 2: no importers rebuilt; the module check dropped; `separable` always true; `separable` ignoring requires; no package-set check; a surface without Name, Types or Funcs; files never compared; parts joined in package order (the `m/a-b` test); and, for the corpus test on hugo, a surface without Name;
  - Task 3: no canonical check; self-loops kept; duplicate ids allowed; duplicate edges allowed;
  - Task 4: the merge taken for any IR; ties treated as removals; modified hashes ignored; one side's tail taken as matched; a call reversed (the imports-only test);
  - Task 7: a new package's importers forgotten; a removed package's importers forgotten; only the first importer of a changed path rebuilt. Each fails the new unit test or the random-edit test, and the corpus test on hugo: the first two at "new package" and "package deleted" (the IR differs from a cold scan's), the third at "package renamed".
- **Surface and order proofs are property tests.** Both the Cache (Task 2) and the merge (Task 4) keep their old path, and the property tests run old against new.
- **Revision, 2026-10-20 (text only).** A review of 16 to 19 together (check-16-19) found the cost of scanning two trees through one Cache overstated. Trees A, B, A and B, differing in one package, assembled every package once, then one package in three each time, every IR byte-identical to a cold scan's. A scan after another tree's assembles again, as a rescan would, the packages the two trees differ in and their importers, not every package. The **Architecture** text now says so. The Cache's doc comment in Task 2's diff still says "every package"; 20's Task 1 rewords it, so this plan's code blocks, and its replay record, are unchanged. Keeping serve's Base off the Cache is still right.

## Replay record

Replayed with `replay.py` on a fresh `git archive` of `main` at de2c117, in a scratch directory. `node_modules` was clone-copied from the repository (`cp -cR`), and Playwright's three browsers were already installed. This plan's directory was copied in, as `git archive HEAD` will give it once the plan is committed. Every step's exit matched its expectation:

| Task | Step | Command | Exit |
|---|---|---|---|
| 1 | red | `go test ./internal/scan -run TestListTreeListsOnce` | 1 |
| 1 | green | `go test -race ./internal/scan ./internal/watch ./internal/cli` | 0 |
| 1 | red | `go test ./internal/export -run TestHunksOfAFileDeletedAfterTheListing` | 1 |
| 1 | green | `go test ./internal/export ./internal/cli` | 0 |
| 2 | red | `go test ./internal/scan` | 1 |
| 2 | green | `go test -race ./internal/scan ./internal/ir` | 0 |
| 2 | green | `go test ./...` | 0 |
| 3 | red | `go test ./internal/policy` | 1 |
| 3 | green | `go test ./internal/policy ./internal/export ./internal/cli` | 0 |
| 4 | red | `go test ./internal/ir ./internal/diff` | 1 |
| 4 | green | `go test ./internal/ir ./internal/diff ./internal/policy ./internal/cli` | 0 |
| 5 | red | `go test ./internal/cli -run TestServeKeepsTheBaseInOrder` | 1 |
| 5 | green | `go test -race ./internal/cli` | 0 |
| 6 | green | `make build >/dev/null && cd web/e2e && node accept.mjs` | 0 |
| 7 | red | `go test ./internal/scan -run 'TestCacheAssemblesOnlyWhatChanged\|TestCacheAssemblesImportersOfAnAddedOrRemovedPackage'` | 1 |
| 7 | green | `go test -race ./internal/scan` | 0 |
| 7 | green | `go test ./...` | 0 |
| 8 | green | `make check` | 0 |
| 8 | green | `go test -race -count=1 ./internal/scan ./internal/policy ./internal/diff ./internal/ir ./internal/export ./internal/cli ./internal/watch` | 0 |
| 8 | green | `cd web/e2e && node accept.mjs` | 0 |
| 8 | green | `cd web/e2e && node serve.mjs` | 0 |
| 8 | green | `node docx/features/16-fast-rescan/measure.mjs --selftest` | 0 |

- After Task 8, all 21 files the tasks change were byte-identical in the replayed tree and on the scratch branch.
- `golangci-lint run ./...` in the replayed tree: no issues.
- The corpus test skips in the replay (no `ZU_CORPUS`). After the replay, it was run in the replayed tree on copies of kubernetes (71 s), hugo and cobra, and passed. In each, "new package" assembled 2 packages and "package deleted" 1, and each copy's `git status` was clean afterwards (**Measurements**).
- The first draft's replay failed only at `measure.mjs --selftest`, because the archive predated the plan's own files. This one copies them in.
