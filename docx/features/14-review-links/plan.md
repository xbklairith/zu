# 14 · Review links — Plan

**Status:** APPROVED 2026-09-25 (scrutiny-14 rulings applied, replay green on 4195876 but for 13's webkit flake, advisor sign-off), with amendments A1–A2 below. History: Revised for scrutiny-14, not approved. First drafted 2026-09-25 (v1) and revised the same day (v2) under the lead's rulings on scrutiny-14 (**Revision for scrutiny-14**).

**Amendments at approval (they win over the text below):**
- **A1 (Task 6, before its green step): `serve.mjs` drops the one benign WebKit error.** A `pageerror` whose message is exactly `ResizeObserver loop completed with undelivered notifications.` is not counted. Match it by equality, not a regex, and leave `accept.mjs` alone. It is a pre-existing flake: 13's serve.mjs on main failed 2 of 5 runs in webkit. Add one line recording it to 13's acceptance.md, as 08 recorded Firefox's reload crash. B6 is recorded in decisions.md as met only after Task 7's by-hand steps 1 and 2 pass (answering the drafter's Q2).
- **A2 (Task 7, the user's check): runnable without a push.** zu's own `origin/main` (github.com/xbklairith/zu) is already fetched, and `b8dd2e3~40..b8dd2e3` changes 49 Go files. Step 1 becomes:
  1. `git worktree add --detach <scratch>/zu-check origin/main`.
  2. In that worktree, `zu diff origin/main~40 -html -out <scratch>/c.html`.
  3. Pick a file listed after the fourth on the compare page.
  4. Remove the worktree afterwards.

  For step 2, use any GitLab repository the user has. If there is none, shallow-clone a small public Go project from gitlab.com into scratch (never into `.zu/corpus/`), and say its size.

The plan has two parts:
- 14a (Tasks 1–5) closes B6. Each changed declaration and each changed file links to its place on the host's compare page, and what the change removed links to its source at the base commit.
- 14b (Task 6) adds the served Change View: `zu serve -base ref`.

Task 7 is acceptance. 14a and 14b are independent: 14a can ship alone, and 14b needs only Task 3 (one `Compare` per rescan) and Task 4's `changeView`.

**Base.** Every diff here is against `main` at 4195876, which contains all of 13 (Tasks 1–8 and its acceptance). The diffs were cut from a scratch branch built on a `git archive` of 4195876, one commit per step, and the plan was replayed on a fresh `git archive` of it. Every step was as expected but one, a webkit flake that 13's own `serve.mjs` also has (**Replay record**).

Proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is 12's and 13's script unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. Run it from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 -u docx/features/14-review-links/replay.py docx/features/14-review-links/plan.md "$S"; rm -rf "$S"
```

It needs:
- Go, git, `patch`, Python 3, npm and Node;
- `golangci-lint` (Tasks 1, 2, 4, 6 and 7);
- Playwright's three browsers (Tasks 5–7).

---

## Revision for scrutiny-14

What changed from v1, ruling by ruling:

| Ruling | v2 |
|---|---|
| Budget | Accepted as 14's own: start ≤ 10 s, rescan < 2 s, median save → drawn ≤ 3 s, worst case reported only. It is in the requirements amendment, and Deviation 6 records the ruling. |
| (a) the compare page | Accepted: Deviation 1 stands. |
| (b), M4 | The user's check (Task 7) clicks a GitHub link to a file after the first four in the compare, and a GitLab link, and confirms that each scrolls to its line. B6 is recorded as met only after that. Until then it is a **Risk**. |
| (c) | A fetch, or a push, is shown at the next save or reload. **Risks** says so. |
| (d) | Deferred, as ruled. |
| **M1** | Host links now come from git's own diff. When both sides are commits, `changeView` runs one local `git diff -M -U3 <merge-base> <head> -- '*.go'` through `gitref.Diff` (Task 2). A declaration links to the first line its side changes within its span: the head side, or the base side for removed code. A renamed file is keyed by its new path, with the old path kept for base-side links. When no hunk overlaps, the link is the file anchor. zu's own hunks still drive the panel's "Changes in" lists. They no longer place any host link. The **Host anchors** claim that zu's `Hunks` are keyed as the host keys them (v1 l.124) was wrong, and it is corrected. `TestDiffHTMLMovedPackageLinksTheNewPath` does a `git mv` plus a 2-line edit. The links key on the new path, the moved function the edit missed gets the file link, and the edited one gets its line. |
| **M2** | A declaration in a generated file (`n.Generated`) links to its file only. The `linguist-generated` attribute is not read (Deviation 2). |
| **M3** | Host links are emitted only for a commit that a remote-tracking ref contains (`git for-each-ref --contains <commit> refs/remotes`, offline; `gitref.OnRemote`). The rule applies to head (blob, compare, files, nodes) and to the merge-base (base blob). `TestDiffHTMLUnpushedHeadLinksOnlyTheBase` covers it (Deviation 11). |
| Cheap cut | `diff.SummarizeDelta` summarizes a Delta the caller already has. `zu diff` and `zu serve -base` compare once and pass the Delta into `changeView`, which compares again only under a Policy lens (Task 3). Re-measured: the rescan fell from 1.32–1.65 s to 1.17–1.42 s (dirty), and the median save → drawn from 2.26–2.34 s to 2.02–2.06 s (**Measurements**). |
| `measure.mjs` | It now has an overall timeout (15 min), per-wait timeouts, and exit handlers that stop `zu serve` on any exit, signal or failure. It takes the base as a full sha, and a `clean` mode that commits each save and moves a faked remote-tracking ref to it, so `gitref.Diff` and `DiffLinks` are in the measured path (Task 7, **Measurements**). |

Two more changes came from the advisor's review of v2:
- A failing `git diff` no longer fails the View. It degrades to file links, with a note (Deviation 12, `TestDiffHTMLGitDiffFailureLinksEachFile`).
- `OnRemote` and its note run only for hosts zu links to by itself (`export.Hosted`). A Bitbucket origin gets no "left out" note.

The scrutiny's other notes are handled as follows:
- N1: Compare once, as above.
- N2: `measure.mjs`'s timeouts.
- N3: the new anchor split on kubernetes (**Measurements**).
- N4: measured function spans (Architecture).
- N5: a change only in a doc comment gets the file link (Deviation 2).
- N6: `measure.mjs` takes a full sha, and **Risks** notes that a relative `-base` rescans the base on each commit.
- N7: GitHub Enterprise and self-managed GitLab are listed under **Out of scope**.
- N8: the error paths (Deviation 12).
- N9: each compile-failure red step is named as one.

**Goal:**
- **B6 (Must).** "Link each changed node to its hunk in the MR, and to the source at that ref." B6 counts as met after Task 7's by-hand check, and not before.
  - In a Change View whose base and head are clean, pushed commits on GitHub or GitLab, the panel of a changed type or function has "Diff on the host". It opens the compare page at that declaration's first changed line, or at its file's diff when no line of its own changed.
  - Each file's "Changes in" heading links to that file's diff there.
  - "View at" opens the source at head. For anything the change removed (a declaration, a package, a dropped edge's site), it opens the source at the base commit. Today a removed edge's site links to head, where the file may be gone (404), and a removed declaration has no link.
- **A served Change View.** `zu serve [dir] -base ref` serves the Change View of the working tree against the merge-base of `ref` and HEAD. It is the same View, byte for byte, that `zu diff ref -worktree -html` writes. 13's watch redraws it on a save. 10's security rules are unchanged.

**Budget (ruled; Deviation 6):** measured on kubernetes v1.37.0 with `-base` at `HEAD~50`'s sha (52 packages changed, a 15 MB View) and the default 1 s poll:
- start (both scans) at most 10 s;
- the watch's rescan under 2 s;
- save → drawn with a median of at most 3 s.

The worst case is reported, not gated.

**Architecture:**
- **Git's diff: `internal/gitref/hostdiff.go` (new, Task 2).** Two functions:
  - `Diff(ctx, top, base, head)` runs `git diff -M -U3 base head -- '*.go'` and parses it into `[]FileDiff{Path, OldPath, Hunks}`:
    - `Path` is head's path, "" for a deleted file;
    - `OldPath` is base's path, "" for an added file;
    - a rename has both;
    - a mode-only change has no hunks.

    Options a user's config could change are pinned: no prefix swap, no external diff or textconv, `--diff-algorithm=myers`, `--indent-heuristic`, `-U3`, `--inter-hunk-context=0` and `core.quotePath=false`. Its hunks are git's defaults, the diff the hosts render. Quoted paths are unquoted. Commits starting with `-` are refused, as `MergeBase` refuses them. Only Go files are read: zu's `Hunks` hold nothing else.
  - `OnRemote(ctx, top, commit)` reports whether any remote-tracking ref contains `commit`: `git for-each-ref --count=1 --contains <commit> refs/remotes`. It reads local refs only, so zu still makes no network call (N-offline).
- **Anchors: `internal/export/anchors.go` (new, Task 1).** `DiffLinks(v, origin, files, ms)` fills two maps in the Change View's `Links`:
  - `Files`: each path in `Hunks` that the host's diff has → its diff on the compare page. A deleted file is keyed by its base path. A renamed file's old path gets no entry, because the host names that diff by the new path.
  - `Nodes`: each changed type or function (a Change Status or a Move) → its first changed line there, or its file's diff.

  The anchors are computed offline from the path and a line number: SHA-256 or SHA-1 of the path. The rules come from **Host anchors**. `hosts` has one entry per host, and `Hosted(origin)` says whether origin is one of them. Nothing is set unless both sides are clean commits (`CompareURL`'s rule, 04 Deviation 4) and `files` is known.

  **Which line.** A declaration's file in the host's diff is found by its own path on its own side: head's path for all but removed code, base's for removed code. Its link is the first line its side changes (`+` on head, `-` on base) within its span. A `-` run that a `+` run replaces gives the `+`. The span runs from its first line to:
  - for a function on head, the end of its measured span (`scan.Measures`, 08). The span starts at `func`, so a changed doc comment is outside it;
  - otherwise (types, and removed code, whose base side zu does not measure), the line before the next declaration the View draws in that file on that side, or the end of the file.

  It links to its file instead in four cases:
  - its span has no changed line (a Move git sees as a rename, a change only in its doc comment, or a declaration marked modified by an edge only);
  - it is in a generated file (M2);
  - it is in a file the change deleted, since GitHub shows deleted files collapsed;
  - `files` came from the fallback (Deviation 12).
- **The base blob: `export.BaseBlob` (Task 1).** `ForRepo`'s blob template at the base commit, which is always clean, even when head is the dirty working tree. With `-link-template` it is used only when the template has `{commit}`; without it the link would open head's file.
- **The View (Task 1).** `Links` gains `base`, `files` and `nodes`, all `omitempty`. A Project View's `links` is unchanged, and so is every golden.
- **One Compare (Task 3).** `diff.SummarizeDelta(base, head, d)` is `Summarize` given the Delta `Compare` returned. It reads `d` and never changes it. `changeSides` carries the Delta, so `zu diff` and `zu serve -base` compare once per run or rescan. Under a Policy lens, `changeView` compares the lens's two IRs again, as it summarizes them again today.
- **`zu diff -html` (Task 4).** `writeChangeHTML` is split in two:
  - `changeView` builds the View: everything the old body did, then the links;
  - `renderView` writes it.

  In `changeView`, when there is no `-link-template` and origin is on GitHub or GitLab, each clean side goes through `onHost`. A commit no remote-tracking ref contains counts as no commit for links, and `zu diff` prints `note: <sha> is on no remote-tracking ref; its host links are left out until it is pushed and fetched`. When the compare URL exists, `gitref.Diff` supplies the host files for `DiffLinks`. `zu serve -base` calls the same `changeView`.
- **The page (Task 5).**
  - `links.ts`: `linkFor(…, side)` fills `base` or `blob`; `diffLink(id)` and `fileDiffLink(path)` read the maps. Every result must be `https:`, and the maps are read with `Object.hasOwn`, so an id like `constructor` is never a link.
  - `Panel.tsx`: "Diff on the host" in the change facts; "on the host" beside each file's changes; `Where` takes `removed` and links to base, for declarations, packages and a dropped edge's site (`Members`).
- **`zu serve -base ref` (Task 6).**
  - `runServe` resolves `ref` in `dir` under the interrupt context and serves the repository's top, as `zu diff -worktree` reads it. `-include` is refused, as in `zu diff`: the change decides what the page inlines. Outside git, or with an unknown ref, it exits 3.
  - `session.build` calls `s.viewOf` where it called `projectView`. The one place that makes the View's bytes (13) now makes either kind.
  - `viewOf` (new, `internal/cli/change.go`) runs on every rescan, whether from a page load or the watch, under the session's mutex:
    - it resolves `ref` again, and the merge-base with HEAD, so a commit, a checkout or a `ref` that moved is seen;
    - it scans the merge-base under head's Policy (ADR 0004), but only when the merge-base or the Policy's hash changed since the last scan (`session.baseDoc`);
    - it opens the base commit's tree for the hunks and closes it at the end, so no git process outlives a rescan.

    It then runs `Compare`, `SummarizeDelta`, the violations and `changeView`, as `zu diff` does.
  - 13's watch is unchanged. Its rescan goes through `build`, so a save recomputes the diff. Its hold rule compares head's parse errors, the tree being edited, at the same commit.

**What 14 takes from 13's end state:**
- `session.build` (`internal/cli/serve.go`) is the only producer of View bytes, for page loads and the watch alike, and runs under `session.mu`;
- the Hub, `/events`, `?latest` and the hold rule;
- the helpers `startServe`, `stream`, `await`, `latest`, `diffRepo`, `withUI`, `repo`, `git` and `noZu`;
- `serve.mjs`'s engine loop.

14 also uses these seams from before 13: `gitResolve`, `gitMergeBase`, `openCommit`, `scanTree`, `changeSides` and `openSource`. It adds `gitDiff` and `gitOnRemote`.

**Tech Stack:** as 13. No new dependency. `crypto/sha1` is Go's standard library, and it names GitLab's anchors only (`//nolint:gosec`, with the reason).

**Source decisions:**
- requirements B6 (Must). The lead's audit found it partial: a head blob link and one whole-change compare link in the Header, no per-node hunk link, and removed code linked to head;
- decisions.md "Links (B6)" and "Structural Summary … Links (B6) deferred to the HTML Export";
- decisions.md "Serve (10)": "A served Change View is not planned yet";
- 04 Deviation 3 (`#Lx`, no range) and Deviation 4 (no head links when dirty);
- 08's measured function spans (`scan.Measures`);
- ADR 0004 (both sides under head's Policy);
- CLAUDE.md: "The model never authors the graph", "IR output must be byte-identical" and "the git CLI (the only process zu runs)". 14 adds no node, leaves the IR as it is, and runs only git.
- the lead's rulings on scrutiny-14 (**Revision for scrutiny-14**).

**Out of scope:**
- Gitea, Forgejo and Bitbucket. `ForRepo` does not detect them today. Gitea and Forgejo have a file anchor (`#diff-<sha1(path)>`) but no line ids, and Bitbucket's diff anchors are unconfirmed. See **Host anchors**.
- GitHub Enterprise and self-managed GitLab (N7). `ForRepo`, `CompareURL` and `hosts` match `github.com` and `gitlab.com` only, so these get no host links, as today. `-link-template` still gives them a blob link.
- A merge request's own page (`/pull/N/files`, `/-/merge_requests/N/diffs`). zu does not know the MR number offline. The compare page shows the same diff, with the same anchors (GitHub and GitLab both, per the research).
- A line range (`#L3-L10`): 04 Deviation 3 stands.
- The `linguist-generated` attribute (M2's "if cheap"). It is not cheap: git 2.39, the version here, has no `check-attr --source` (2.40+) to read `.gitattributes` at a commit. Deviation 2 has the details.
- `zu serve -base` with a head ref (a commit instead of the working tree), `-include-ignored` or `-max-parse-errors`;
- polling `ref` or the remote-tracking refs. A fetch or a push shows at the next save or reload (**Risks**).
- A notice for an empty Change View: see Deviation 8.
- Scrutiny (d), deferred by the lead.

---

## Host anchors (research, 2026-09-25)

Every rule `hosts` uses was checked against live pages. The dates and sources are in the research notes. The live checks were HTTP fetches by the researcher, not zu: zu makes no network call.

| Host | File | Line | Checked |
|---|---|---|---|
| GitHub | `#diff-<sha256hex(path)>` | `…R<head line>` for a `+`, `…L<base line>` for a `-` | live: element ids on a golang/go compare page matched the computed hashes (`doc/go_spec.html` → `diff-2ed8cb1b…0cfc`, with `L5428` and `R1` line ids). The same anchors work on `/pull/N/files` and `/commit/SHA` (the commit page's JSON calls the hash `pathDigest`). |
| GitLab | `?file_path=<path>#<sha1hex(path)>` | `?file_path=<path>#line_<first 9 hex of sha1(path)>_A<head line>` for a `+`, `…_<base line>` for a `-` | live: gitlab-org/cli compare and merge-request pages (Rapid Diffs) carry `id="<sha1>"` and `id="line_63889d50a_A63"`. `?file_path=` makes the page render that file first. Source: `lib/gitlab/diff/line.rb` `id`, `diff/file.rb` `file_hash` (gitlab-org/gitlab @4522ddb). |
| Gitea, Forgejo | `#diff-<sha1hex(path)>` | none: line markers are `rel` attributes, not ids | source only (not in scope) |
| Bitbucket Cloud | unconfirmed | unconfirmed | not in scope |

- **Paths:** a renamed file is anchored by its new path, and a deleted file by its base path. zu's own `Hunks` are **not** keyed that way. They pair files by path, so a rename shows there as a deletion of the old path plus an addition of the new one (v1 claimed otherwise; corrected, M1). The host's anchors therefore come from git's diff (`gitref.Diff`). Its rename detection (`-M`, 50% similarity) is the host's too: a file edited past that threshold is a deletion plus an addition on both, and the links follow git.
- **GitHub switched from MD5 to SHA-256** between 2020-09-28 and 2020-10-21. The Wayback Machine has golang/go commit pages from both sides of that window. GitHub never documented the switch.
- **Compare semantics:** `a...b` diffs b against the merge-base of a and b. zu's base is already that merge-base, so `...` and `..` give the same diff here. `CompareURL` is unchanged.
- **The legacy GitLab line code** `<sha1>_<old>_<new>` is still parsed by GitLab's scripts. It was rejected because it needs both counters and was not observed as an element id. The `line_` ids are real element ids, and both GitLab front ends parse them (`parseRapidDiffsLineHash`).
- **GitHub, removed files:** `/blob/<head>/path` returns 404 once the file is gone, and `/blob/<base>/path` returns 200. That is why removed code links to base (`Links.Base`).
- **Unpushed commits** (reasoning, not a live check): the host cannot show a commit it has not received, so a compare or blob URL for it cannot open the change. That is why links need a remote-tracking ref (M3).

---

## Measurements (kubernetes)

Measured 2026-09-25 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0 and git 2.39.1, with the `bin/zu` built from this plan's code.

**The tree.** A writable copy of `.zu/corpus/kubernetes@v1.37.0`, made with `cp -cRp` (a clonefile copy). The corpus itself was only read.
- The corpus has no remote-tracking ref, so the copy got a faked one: `git update-ref refs/remotes/origin/master HEAD`.
- The base was `HEAD~50`'s sha, `24a5b063a5f2b8d6c2d1d9279758109a7b75d4ad`.
- The copy was deleted afterwards.

**Two modes of `measure.mjs` (Task 7), two runs of 11 rounds each, in chromium:**
- `dirty`: each save stays uncommitted, as in v1. Head is dirty, so no host diff is read.
- `clean`: each save is committed, and `refs/remotes/origin/zu-measure` is moved to it. Head is clean and "pushed", so `gitref.OnRemote`, `gitref.Diff` and `DiffLinks` all run in the rescan.

  Its save → drawn time starts before the write and includes `git add`, `git commit` and `git update-ref` on kubernetes' index, so it is an upper bound on commit → drawn. The second row, "→ `view.json` links it", reads the watch's latest View (`view.json?latest`) until the new function has its compare-page link.

| What | dirty 1 | dirty 2 | clean 1 | clean 2 |
|---|---|---|---|---|
| start: spawn → URL printed (both scans + View) | 5.69 s | 5.62 s | 6.02 s | 5.72 s |
| first drawn | 2.41 s | 2.39 s | 2.39 s | 2.37 s |
| `view.json` | 15.2 MB | 15.2 MB | 15.3 MB | 15.3 MB |
| watch rescan, 1 file parsed | 1.17–1.29 s | 1.21–1.42 s | 1.30–1.43 s | 1.29–1.45 s |
| save → drawn: min / median / max | 1.71 / 2.02 / 2.57 s | 1.69 / 2.06 / 2.67 s | 2.02 / 2.45 / 3.00 s | 2.04 / 2.39 / 3.06 s |
| save → `view.json` links it: min / median / max | — | — | 2.07 / 2.51 / 3.05 s | 2.09 / 2.45 / 3.12 s |
| RSS at the end | 968 MB | 826 MB | 730 MB | 726 MB |

Every run is within the ruled budget. Across all of v2's runs, including the discarded ones below, RSS at the end ranged from 260 MB to 968 MB: it depends on when Go's collector last ran.

A first `clean` run polled plain `view.json` and showed 4.5 s to the link. Each plain `view.json` request is a full rescan (10's page-load rule), so the script was measuring its own rescans. `?latest` fixed the script. zu was not changed.

**The cheap cut (one Compare).** In v1, `-base` rescans took 1.32–1.65 s, with a median save → drawn of 2.26–2.34 s. With Task 3 they take 1.17–1.42 s, with a median of 2.02–2.06 s (dirty). In v1's breakdown, `Summarize` took ~170 ms, of which `Compare` is 132–173 ms (scrutiny N1). The clean mode adds `OnRemote`, `git diff` and `DiffLinks`: about 0.1 s per rescan.

**Git's diff.** `git diff -M` of `HEAD~50..HEAD` over the Go files is 382 KB and takes 0.07 s. Over every file it would be 647 KB and 0.25 s.

**Anchors on kubernetes (N3).** `zu diff <HEAD~50 sha> -html` was run on the clean copy after the measure runs. Its head is the corpus's HEAD plus `measure.mjs`'s commits, which add one function. The result:
- 53 packages changed;
- 173 changed types and functions, all linked;
- 138 line links: 76 modified, 46 added and 16 removed declarations, each at the first changed line on its side within its span;
- 35 file links. That set is exactly the 35 declarations in generated files, checked by set equality, not by count. No declaration fell back to a file link for lack of an overlapping hunk.
- 69 files, each with its diff link.

In v1, the scrutiny's check of span-guessed anchors on zu's own hunks found 166 right, 5 wrong and 1 missing. In v2 the lines come from git's diff, so each line link names a line the host's diff marks changed on that side.

---

## Deviations and decisions for review

1. **Links point at the compare page, not the MR** (ruled: accepted). B6 says "its hunk in the MR". zu does not know the MR number, and it may not ask the host (N-offline). The compare page of the merge-base and head shows the same diff as the MR's changes tab, and both hosts give it the same anchors. The Header's whole-MR compare link (04) stays.
2. **Line anchors from git's diff; file anchors where a line cannot be pinned.** A declaration links to its file's diff in these cases:
   - Its span has no changed line of its own. This covers a Move that git sees as a rename with an unchanged body, a change only in its doc comment (the measured span starts at `func`; N5), and a declaration marked modified by an edge only.
   - It is in a generated file: `n.Generated`, the standard `// Code generated … DO NOT EDIT.` header zu already reads (M2). The `linguist-generated` attribute is not read. Reading `.gitattributes` at a commit needs `git check-attr --source`, which is git 2.40+ (2.39.1 here), or a parser for gitattributes' patterns and macros. That is not cheap, so it was left out. Kubernetes' generated files all carry the header.
   - It is in a deleted file (GitHub collapses them).

   A package gets no link of its own: its files' "on the host" links are in the panel.
3. **The span of a type, or of removed code, is inferred.** `ir.Location` has a start line only (04 Deviation 3).
   - A head function's span is its measured one (08).
   - For a type, or anything on the base side, the span ends at the next declaration the View draws in that file. A declaration the View does not carry, lying between two it does, can make that span too long, and the first change found may then belong to an undrawn neighbour. The link still lands on a changed line inside the right file's diff, near the declaration. An end line in the IR would fix it, but that is a schema change to 01's golden and out of scope.
4. **Removed code links to base.** `Links.Base` is set when the merge-base is a clean commit on the remote (Deviation 11) of a known host, or when `-link-template` has `{commit}`, even when head is dirty: the base side is always a commit. This refines 04 Deviation 4 ("no head links when dirty"), which still holds for head.
5. **`zu serve -base` serves the repository top**, even when `dir` is a subdirectory. `zu serve dir` without `-base` still serves `dir`. The Change View compares whole trees at a commit, as `zu diff -worktree` does, and the equality test depends on it.
6. **The budget is 14's own, not 13's (ruled: accepted).** 13's gate (rescan under 2 s, median save → drawn at most 2 s) was set for the Project View. 14's gate is start at most 10 s, rescan under 2 s and median save → drawn at most 3 s. The worst case is reported, not gated. The measured values are in **Measurements**. Making the change work incremental (reusing `Compare` for unchanged packages) is out of scope.
7. **The base's IR is cached; its tree is not.** The session keeps the merge-base's IR keyed by (commit, Policy hash). The Policy hash covers everything but demote and budget, which do not change the scan. The base commit's tree is opened again on each rescan, for about 40 ms, rather than holding a `git cat-file --batch` process for the session's life.
8. **An empty Change View draws nothing, as `zu diff -html` does today.** Suppose `zu serve -base` starts before any edit, on a branch with no commits past `ref`. The page shows the header, "0 boxes at depth 1 … Showing the changed packages and their direct importers. Show full project" and an empty canvas. The first save draws the change (seen in scratch: 0 nodes, then 3 after one new file, with no errors). A clearer message ("No structural change against `ref`") belongs to the page for both commands, and it is left for later.
9. **`Links.Nodes` and `Links.Files` are computed in Go, not in the page.** The page only reads strings. Hashing in Go keeps one implementation, testable against the hosts' own examples, and keeps `crypto.subtle` (async, secure contexts only) out of the page.
10. **A test helper fix in 13's `withUI`.** `diffRepo` changes into the repository (`t.Chdir`), and `withUI` then read its fixture by a relative path, so any test that called both failed. The fixture path is now made absolute at package init (`uiFixture`). `runAside` runs a second command, `zu diff`, beside a running `zu serve`, with its own interrupt context. The stubbed context would otherwise stop the server when `diff` returns.
11. **Host links only for pushed commits (M3).** Without `-link-template`, and for an origin on GitHub or GitLab only (`export.Hosted`), a clean side that no remote-tracking ref contains counts as no commit for links:
    - head: no blob, compare, file or node links;
    - merge-base: no base blob.

    `zu diff` prints a note naming the commit. `zu serve -base` prints nothing, because it would repeat on every rescan. Its page simply has no host links until the next rescan after a push or fetch (**Risks**).

    `-link-template` is trusted as given: the user named the host, and zu cannot tell what it holds. This extends 04 Deviation 4 ("no head links when dirty") to "no host links for what the host does not have".
12. **A failing `git diff` degrades, it does not fail.** In v1 the host links could not fail `zu diff -html`, and v2 keeps that.
    - If `gitref.Diff` fails with the context still live, `changeView` prints `note: git diff failed (<err>); host links point at each file's diff` and builds file-only host files from the View's own `Hunks`. Every changed declaration and file then gets its file anchor.
    - A cancelled context still fails the command, as every other git call does.
    - The other error paths are unchanged. `OnRemote` treats any git error as "not on the remote", which gives fewer links and no failure. `Resolve` and `MergeBase` errors fail as in `zu diff` (exit 3), or, in `zu serve -base`, leave the page on its last drawing with 13's "rescan failed" line.
13. **One Compare per run (the cheap cut).** `diff.SummarizeDelta` is a new exported function, and `Summarize` is now `SummarizeDelta(base, head, Compare(base, head))`, so its output is unchanged (`TestSummarizeDeltaIsSummarize`, and every golden).

---

## Doc amendments (exact text; not task steps)

**`docx/core/decisions.md`, Settled choices:**
- l.29, "Structural Summary (v1)" bullet: replace `Links (B6) deferred to the HTML Export.` with `Links (B6) are the HTML Export's (14): the Summary has none.`
- l.33, replace the "Links (B6)" bullet with:

> - **Links (B6):** host detected from the `origin` remote (GitHub/GitLab), `-link-template` override. In a Change View whose sides are clean commits that a remote-tracking ref contains (14), each changed type or function links to its first changed line on the host's compare page, and each changed file to its diff there. On GitHub that is `#diff-<sha256(path)>` plus `R<head line>` or `L<base line>`; on GitLab, `?file_path=<path>#<sha1(path)>` or `#line_<sha1(path)[:9]>_A<head line>` / `_<base line>`. The lines come from one local `git diff -M -U3` of the two commits, a renamed file keyed by its new path; the anchors are computed offline. A declaration with no changed line in its span, or in a generated or deleted file, links to its file. What the change removed links to its source at the base commit, even when head is dirty. B6 is met once 14's by-hand check (a GitHub link past the compare's first four files, and a GitLab link, each scrolling to its line) has passed; until then it is 14's open risk.

- l.45, "Serve (10)" bullet:
  - replace `[-coverprofile …] [-poll interval]` with `[-coverprofile …] [-poll interval] [-base ref]`;
  - replace `A served Change View is not planned yet.` with:

> **Change View (14):** `-base ref` serves the Change View of the working tree against the merge-base of `ref` and HEAD, the View `zu diff ref -worktree -html` writes, at the repository's top. Each rescan resolves `ref` and the merge-base again, and it rescans the base only when the merge-base or the Policy's hash moved. `-include` does not apply. A push or fetch shows at the next save or reload.

**`docx/core/requirements-draft.md`:**
- The requirements table has no status column, so B6's row is unchanged. The decisions.md bullet above records when B6 counts as met.
- Performance budgets: after the "Change to redraw in `zu serve` (13)" bullet, insert:

> - Change to redraw in `zu serve -base` (14): on kubernetes v1.37.0 with `-base` at `HEAD~50` (52 packages changed) and the default 1 s poll, start stays at most 10 s (measured 5.6–6.0 s), the watch's rescan under 2 s (measured 1.17–1.45 s), and save → drawn has a median of at most 3 s (measured 2.02–2.06 s uncommitted; 2.39–2.45 s committed and pushed, git's diff and the host links included). The worst case is reported, not gated (measured 2.57–3.06 s).

**`docx/features/04-html-export/plan.md`**, Deviation 3: append `Feature 14 bounds a declaration by its measured span (a head function) or by the next declaration drawn in its file (the rest), to pick its first changed line (14 Deviation 3).`

**`docx/features/13-watch/plan.md`**, Out of scope: replace `watching a served Change View (none exists);` with `watching a served Change View (none existed; feature 14 adds one, and this watch redraws it);`

**`docx/glossary.md`**, in "Change View", append: `zu diff -html writes one; zu serve -base serves one (14).`

**`CLAUDE.md`, Layout:**
- in the `internal/cli` line, append: `; `change.go` is `zu serve -base`'s Change View (14)`;
- in the `internal/gitref` line, after `` `MergeBase` ``, insert: `, `Diff` (git's own `diff -M` of two commits, for host anchors) and `OnRemote` (a remote-tracking ref contains the commit; offline) (14)`;
- after the `internal/diff` line, insert:

> - `internal/export` — the View the UI draws (`Project`, `Change`), its `Links` (`ForRepo`, `CompareURL`, `BaseBlob`) and 14's `DiffLinks`: each change's anchor on the host's compare page, computed offline from git's diff (`anchors.go`)

---

# Tasks

## 14a: links (B6)

### Task 1: Each change's place on the host (`internal/export`)

`DiffLinks` sets `Links.Files` and `Links.Nodes` in a Change View from the host's diff (`HostFile`s), `Hosted` says whether zu links into an origin's host, and `BaseBlob` gives the blob template at the base commit.

The tests:
- `TestFirstChange`: the first changed line in a span, on each side. A replaced line gives the `+`.
- `TestDiffLinks`, on GitHub and on GitLab. The expected hashes were computed with `shasum`. The cases:
  - one file with a modified, an added and a removed declaration;
  - a file the change deleted;
  - a renamed file (`a/r.go` → `b/r.go`) with a generated type, two moved functions (with measured spans) and a removed function. The links key on `b/r.go`, and `a/r.go` has no file link. The generated type and the moved functions get the file link. The removed function gets `L30` on the new path.
  - With a dirty head, an unknown host, no origin, or no host diff, there are no links.
- `TestDiffLinksKeepToAFunctionsSpan`: with no measured span, `G` takes the next line's change (`R4`); with its measured span, it gets the file link.
- `TestDiffLinksOnShop`: on the shop Change View golden, with the View's own hunks as the host's, every changed declaration links into its own file's diff, at a line its hunks mark `+` (R) or `-` (L).
- `TestHosted`: GitHub and GitLab under any URL form; Bitbucket, another host and no origin.
- `TestBaseBlob`: GitHub; a template with `{commit}`; a template without it; an unknown host.

**Files:**
- Tests: `internal/export/anchors_test.go`, `internal/export/links_test.go`
- Code: `internal/export/anchors.go`, `internal/export/links.go`, `internal/export/view.go`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/export/anchors_test.go b/internal/export/anchors_test.go
new file mode 100644
index 0000000..df717c6
--- /dev/null
+++ b/internal/export/anchors_test.go
@@ -0,0 +1,250 @@
+package export
+
+import (
+	"encoding/json"
+	"maps"
+	"math"
+	"os"
+	"strconv"
+	"strings"
+	"testing"
+
+	"zu/internal/ir"
+	"zu/internal/scan"
+)
+
+// hunk: base lines 1-4, head lines 1-5 of
+//
+//	 package a          1 1
+//	-func F() int { 1 } 2
+//	+func F() int { 2 }   2
+//	 func G() {}        3 3
+//	+func H() {}          4
+//	 // end            4 5
+var fileHunks = []Hunk{{BaseStart: 1, BaseLines: 4, HeadStart: 1, HeadLines: 5, Lines: []string{
+	" package a", "-func F() int { 1 }", "+func F() int { 2 }", " func G() {}", "+func H() {}", " // end",
+}}}
+
+func TestFirstChange(t *testing.T) {
+	cases := []struct {
+		name        string
+		line, until int
+		base        bool
+		want        change // zero: none
+	}{
+		{"modified at its first line: the new text", 2, 3, false, change{'+', 3, 2}},
+		{"replaced lines give the new text", 1, 3, false, change{'+', 3, 2}},
+		{"added", 4, math.MaxInt, false, change{'+', 4, 4}},
+		{"removed, base side", 2, math.MaxInt, true, change{'-', 2, 2}},
+		{"nothing in range", 3, 4, false, change{}},
+		{"past the end", 6, math.MaxInt, false, change{}},
+	}
+	for _, c := range cases {
+		if got, _ := firstChange(fileHunks, c.line, c.until, c.base); got != c.want {
+			t.Errorf("%s: %+v, want %+v", c.name, got, c.want)
+		}
+	}
+}
+
+// renamed is a/r.go moved to b/r.go with its package clause edited, as
+// git diff -M gives it: one hunk at the top, and one where Gone was.
+var renamed = HostFile{Path: "b/r.go", OldPath: "a/r.go", Hunks: []Hunk{
+	{BaseStart: 1, BaseLines: 3, HeadStart: 1, HeadLines: 3, Lines: []string{"-package a", "+package b", " ", " func M1() {}"}},
+	{BaseStart: 30, BaseLines: 1, HeadStart: 29, HeadLines: 0, Lines: []string{"-func Gone() {}"}},
+}}
+
+// The host's files for the Change View below: a/a.go edited in place, a/gone.go
+// deleted, and the rename.
+var hostFiles = []HostFile{
+	{Path: "a/a.go", OldPath: "a/a.go", Hunks: fileHunks},
+	{OldPath: "a/gone.go", Hunks: []Hunk{{BaseStart: 1, BaseLines: 3, Lines: []string{"-package a", "-", "-func Z() {}"}}}},
+	renamed,
+}
+
+// movedSpans are the moved functions' measured spans in b/r.go, as zu diff
+// passes head's: M2 ends before the lines git shows Gone removed from.
+var movedSpans = scan.Measures{Funcs: map[string]scan.Measure{
+	"m/b.M1": {Spans: []scan.Span{{Path: "b/r.go", Start: scan.Pos{Line: 3, Col: 1}, End: scan.Pos{Line: 3, Col: 14}}}},
+	"m/b.M2": {Spans: []scan.Span{{Path: "b/r.go", Start: scan.Pos{Line: 21, Col: 1}, End: scan.Pos{Line: 23, Col: 2}}}},
+}}
+
+// One file with a modified, an added and a removed declaration; a file the
+// change deleted; a renamed file with moved, generated and removed
+// declarations; on GitHub and GitLab; and every case with no links.
+func TestDiffLinks(t *testing.T) {
+	const b, h = "bbbb", "hhhh"
+	view := func(head ir.Ref) *View {
+		return &View{
+			Kind: "change", Base: &ir.Ref{Commit: b}, Head: head,
+			Nodes: []Node{
+				{ID: "m/a", Kind: "package", Status: "modified", Loc: ir.Location{Path: "a/a.go", Line: 1}},
+				{ID: "m/a.F", Kind: "function", Status: "modified", Loc: ir.Location{Path: "a/a.go", Line: 2}},
+				{ID: "m/a.G", Kind: "function", Loc: ir.Location{Path: "a/a.go", Line: 3}}, // unchanged, drawn as a parent
+				{ID: "m/a.H", Kind: "function", Status: "added", Loc: ir.Location{Path: "a/a.go", Line: 4}},
+				{ID: "m/a.Old", Kind: "function", Status: "removed", Loc: ir.Location{Path: "a/a.go", Line: 2}},
+				{ID: "m/a.Z", Kind: "function", Status: "removed", Loc: ir.Location{Path: "a/gone.go", Line: 3}},
+				{ID: "m/b.X", Kind: "function", Status: "modified", Loc: ir.Location{Path: "b/b.go", Line: 9}}, // not in the host's diff
+				// The rename: moved declarations whose lines git does not show
+				// as changed, a generated one, and one removed on the way.
+				{ID: "m/b.Gen", Kind: "type", Status: "modified", Generated: true, Loc: ir.Location{Path: "b/r.go", Line: 1}},
+				{ID: "m/b.M1", Kind: "function", MovedFrom: "m/a.M1", Loc: ir.Location{Path: "b/r.go", Line: 3}},
+				{ID: "m/b.M2", Kind: "function", MovedFrom: "m/a.M2", Loc: ir.Location{Path: "b/r.go", Line: 21}},
+				{ID: "m/a.Gone", Kind: "function", Status: "removed", Loc: ir.Location{Path: "a/r.go", Line: 30}},
+			},
+			// zu's own hunks, which pair files by path: the rename is two.
+			Hunks: map[string][]Hunk{
+				"a/a.go": fileHunks, "a/gone.go": hostFiles[1].Hunks,
+				"a/r.go": {{BaseStart: 1, BaseLines: 1, Lines: []string{"-package a"}}},
+				"b/r.go": {{HeadStart: 1, HeadLines: 1, Lines: []string{"+package b"}}},
+			},
+		}
+	}
+	// printf %s PATH | shasum -a 256 (GitHub) and -a 1 (GitLab)
+	const (
+		gh       = "https://github.com/o/r/compare/bbbb...hhhh#diff-"
+		ghFile   = gh + "6f0e76217f46bde75131273709c148632e8120c9be0617a825f09640d38454a5"
+		ghGone   = gh + "c46f4fd109577125d53ceee7616c779aa32f745078a742e4e173fe7f80fb3b7b"
+		ghRen    = gh + "3f12eeb4a0c446696b23b7a71cdaf971fb74608e7d40e8824af182dce37bc86f" // b/r.go, the new path
+		gl       = "https://gitlab.com/g/r/-/compare/bbbb...hhhh?file_path="
+		glFile   = gl + "a%2Fa.go#cfb4ad65a271be152f896011f6f2a5ce741005b5"
+		glGone   = gl + "a%2Fgone.go#86ec06dfaa62ad90d9df7920abf4a3f1a4dd06b9"
+		glLine   = gl + "a%2Fa.go#line_cfb4ad65a_" // the first 9 hex of a/a.go's SHA-1
+		glRen    = gl + "b%2Fr.go#b7d3b0a22b1c18c2fbcf0471a7716a2f71ed1a6f"
+		glRenLin = gl + "b%2Fr.go#line_b7d3b0a22_"
+	)
+	for _, c := range []struct {
+		origin string
+		files  map[string]string
+		nodes  map[string]string
+	}{
+		{"git@github.com:o/r.git",
+			map[string]string{"a/a.go": ghFile, "a/gone.go": ghGone, "b/r.go": ghRen},
+			map[string]string{
+				"m/a.F": ghFile + "R2", "m/a.H": ghFile + "R4", "m/a.Old": ghFile + "L2", "m/a.Z": ghGone,
+				"m/b.Gen": ghRen, "m/b.M1": ghRen, "m/b.M2": ghRen, "m/a.Gone": ghRen + "L30",
+			}},
+		{"https://gitlab.com/g/r.git",
+			map[string]string{"a/a.go": glFile, "a/gone.go": glGone, "b/r.go": glRen},
+			map[string]string{
+				"m/a.F": glLine + "A2", "m/a.H": glLine + "A4", "m/a.Old": glLine + "2", "m/a.Z": glGone,
+				"m/b.Gen": glRen, "m/b.M1": glRen, "m/b.M2": glRen, "m/a.Gone": glRenLin + "30",
+			}},
+	} {
+		v := view(ir.Ref{Commit: h})
+		DiffLinks(v, c.origin, hostFiles, movedSpans)
+		if v.Links == nil {
+			t.Fatalf("%s: no links", c.origin)
+		}
+		if !maps.Equal(v.Links.Files, c.files) {
+			t.Errorf("%s: files = %v, want %v", c.origin, v.Links.Files, c.files)
+		}
+		if !maps.Equal(v.Links.Nodes, c.nodes) {
+			t.Errorf("%s: nodes = %v, want %v", c.origin, v.Links.Nodes, c.nodes)
+		}
+	}
+	for name, c := range map[string]struct {
+		origin string
+		head   ir.Ref
+		files  []HostFile
+	}{
+		"dirty head":   {"git@github.com:o/r.git", ir.Ref{Commit: h, Dirty: true}, hostFiles},
+		"unknown host": {"git@example.com:o/r.git", ir.Ref{Commit: h}, hostFiles},
+		"no origin":    {"", ir.Ref{Commit: h}, hostFiles},
+		"no host diff": {"git@github.com:o/r.git", ir.Ref{Commit: h}, nil},
+	} {
+		v := view(c.head)
+		DiffLinks(v, c.origin, c.files, scan.Measures{})
+		if v.Links != nil {
+			t.Errorf("%s: links %+v", name, v.Links)
+		}
+	}
+}
+
+// A function's measured span bounds its search: G ends at line 3, so the
+// line H added at 4 is not G's, although nothing drawn lies between them.
+func TestDiffLinksKeepToAFunctionsSpan(t *testing.T) {
+	v := &View{
+		Kind: "change", Base: &ir.Ref{Commit: "bbbb"}, Head: ir.Ref{Commit: "hhhh"},
+		Nodes: []Node{{ID: "m/a.G", Kind: "function", Status: "modified", Loc: ir.Location{Path: "a/a.go", Line: 3}}},
+		Hunks: map[string][]Hunk{"a/a.go": fileHunks},
+	}
+	const file = "https://github.com/o/r/compare/bbbb...hhhh#diff-6f0e76217f46bde75131273709c148632e8120c9be0617a825f09640d38454a5"
+	DiffLinks(v, "git@github.com:o/r.git", hostFiles[:1], scan.Measures{})
+	if got := v.Links.Nodes["m/a.G"]; got != file+"R4" {
+		t.Fatalf("unmeasured: %q, want the next change, R4", got)
+	}
+	ms := scan.Measures{Funcs: map[string]scan.Measure{"m/a.G": {Spans: []scan.Span{
+		{Path: "a/a.go", Start: scan.Pos{Line: 3, Col: 1}, End: scan.Pos{Line: 3, Col: 12}},
+	}}}}
+	v.Links = nil
+	DiffLinks(v, "git@github.com:o/r.git", hostFiles[:1], ms)
+	if got := v.Links.Nodes["m/a.G"]; got != file {
+		t.Errorf("measured: %q, want the file", got)
+	}
+}
+
+// On the shop Change View every changed declaration links to a line its
+// file's hunks mark changed on its own side: R to a '+', L to a '-'.
+func TestDiffLinksOnShop(t *testing.T) {
+	b, err := os.ReadFile("testdata/shop.change.golden.json")
+	if err != nil {
+		t.Fatal(err)
+	}
+	var v View
+	if err := json.Unmarshal(b, &v); err != nil {
+		t.Fatal(err)
+	}
+	// The shop's change renames nothing, so zu's hunks are the host's.
+	var files []HostFile
+	for p, hs := range v.Hunks {
+		files = append(files, HostFile{Path: p, OldPath: p, Hunks: hs})
+	}
+	DiffLinks(&v, "git@github.com:o/r.git", files, scan.Measures{})
+	marked := func(path string, side byte, line int) bool {
+		for _, h := range v.Hunks[path] {
+			for _, c := range changes(h) {
+				if c.kind == side && (side == '+' && c.head == line || side == '-' && c.base == line) {
+					return true
+				}
+			}
+		}
+		return false
+	}
+	for _, n := range v.Nodes {
+		if n.Kind == "package" || n.Status == "" && n.MovedFrom == "" {
+			continue
+		}
+		link := v.Links.Nodes[n.ID]
+		i := strings.LastIndexAny(link, "RL") // GitHub's R or L and the line
+		line, err := strconv.Atoi(link[i+1:])
+		if err != nil || !strings.HasPrefix(link, v.Links.Files[n.Loc.Path]) {
+			t.Errorf("%s: link %q", n.ID, link)
+			continue
+		}
+		side := byte('+')
+		if link[i] == 'L' {
+			side = '-'
+		}
+		if !marked(n.Loc.Path, side, line) || side == '+' && line < n.Loc.Line {
+			t.Errorf("%s at %s:%d: %s%d is not a changed line at or after it", n.ID, n.Loc.Path, n.Loc.Line, link[i:i+1], line)
+		}
+		t.Logf("%s %s:%d → %s", n.ID, n.Loc.Path, n.Loc.Line, link[strings.Index(link, "#"):])
+	}
+}
+
+// Hosted is whether zu links into origin's host on its own: GitHub and
+// GitLab, under any remote URL form.
+func TestHosted(t *testing.T) {
+	for origin, want := range map[string]bool{
+		"git@github.com:o/r.git":         true,
+		"https://gitlab.com/g/sub/r.git": true,
+		"ssh://git@github.com/o/r":       true,
+		"git@bitbucket.org:o/r.git":      false,
+		"https://git.example.com/o/r":    false,
+		"":                               false,
+	} {
+		if got := Hosted(origin); got != want {
+			t.Errorf("Hosted(%q) = %v, want %v", origin, got, want)
+		}
+	}
+}
diff --git a/internal/export/links_test.go b/internal/export/links_test.go
index 94a6207..6b61008 100644
--- a/internal/export/links_test.go
+++ b/internal/export/links_test.go
@@ -67,3 +67,18 @@ func TestCompareURL(t *testing.T) {
 		}
 	}
 }
+
+func TestBaseBlob(t *testing.T) {
+	b := ir.Ref{Commit: "bbbb"}
+	cases := []struct{ name, origin, tmpl, want string }{
+		{"github", "git@github.com:o/r.git", "", "https://github.com/o/r/blob/bbbb/{path}#L{line}"},
+		{"template with {commit}", "", "https://h/o/r/src/{commit}/{path}#L{line}", "https://h/o/r/src/bbbb/{path}#L{line}"},
+		{"template without {commit}", "", "https://h/o/r/src/main/{path}#L{line}", ""},
+		{"unknown host", "git@example.com:o/r.git", "", ""},
+	}
+	for _, c := range cases {
+		if got := BaseBlob(c.origin, b, c.tmpl); got != c.want {
+			t.Errorf("%s: %q, want %q", c.name, got, c.want)
+		}
+	}
+}
```

- [x] **Run:** `go test ./internal/export/` Expected: FAIL (a compile failure: `undefined: change`, and the compiler stops at 10 errors, all in `anchors_test.go`)

- [x] **Implement**

```diff
diff --git a/internal/export/anchors.go b/internal/export/anchors.go
new file mode 100644
index 0000000..b040ee3
--- /dev/null
+++ b/internal/export/anchors.go
@@ -0,0 +1,256 @@
+package export
+
+import (
+	"crypto/sha1" //nolint:gosec // G505: GitLab names a file by the SHA-1 of its path; not a security use
+	"crypto/sha256"
+	"encoding/hex"
+	"math"
+	"net/url"
+	"strconv"
+
+	"zu/internal/ir"
+	"zu/internal/scan"
+)
+
+// HostFile is one file of the diff the host renders for base → head, as
+// git diff -M gives it (gitref.Diff): keyed as the host keys it, by head's
+// path, with base's path for a rename, and git's own hunks.
+type HostFile struct {
+	Path    string // head's path; "" for a file the change deleted
+	OldPath string // base's path; "" for a file the change added
+	Hunks   []Hunk
+}
+
+// key is the path the host names f's diff by: head's, or base's for a
+// deleted file.
+func (f *HostFile) key() string {
+	if f.Path != "" {
+		return f.Path
+	}
+	return f.OldPath
+}
+
+// DiffLinks sets, in the Change View v, the host links of B6 (14): each file
+// with hunks to its diff on the host's compare page (Links.Files), and each
+// changed declaration to its first changed line there (Links.Nodes). The
+// lines come from files, the host's own diff, not from v's hunks, which pair
+// files by path and so miss renames. It is all computed here, offline: zu
+// asks the host nothing. Nothing is set unless both sides are clean commits
+// on GitHub or GitLab and files is known.
+//
+// A declaration links to the first line its side of the diff changes within
+// its span: from its first line to the end ms measured for a head function,
+// else to the next declaration the View draws in its file. With no changed
+// line there (a Move git sees as a rename, a change only in its doc
+// comment), in a generated file or in a file the change deleted, both of
+// which GitHub shows collapsed, it links to its file.
+func DiffLinks(v *View, origin string, files []HostFile, ms scan.Measures) {
+	if v.Base == nil || len(files) == 0 {
+		return
+	}
+	cmpURL := CompareURL(origin, *v.Base, v.Head)
+	if cmpURL == "" {
+		return
+	}
+	host, _ := parseRemote(origin)
+	at, ok := hosts[host]
+	if !ok {
+		return
+	}
+	byHead, byBase := map[string]*HostFile{}, map[string]*HostFile{}
+	for i := range files {
+		f := &files[i]
+		if f.Path != "" {
+			byHead[f.Path] = f
+		}
+		if f.OldPath != "" {
+			byBase[f.OldPath] = f
+		}
+	}
+	links := map[string]string{}
+	for p := range v.Hunks {
+		f := byHead[p]
+		if g := byBase[p]; f == nil && g != nil && g.Path == "" {
+			f = g // deleted: the host keys it by base's path
+		}
+		if f != nil {
+			links[p] = at.file(cmpURL, f.key())
+		}
+	}
+	nodes := map[string]string{}
+	for i := range v.Nodes {
+		n := &v.Nodes[i]
+		if n.Kind != string(ir.KindType) && n.Kind != string(ir.KindFunction) || n.Status == "" && n.MovedFrom == "" {
+			continue
+		}
+		removed := n.Status == "removed"
+		f := byHead[n.Loc.Path]
+		if removed {
+			f = byBase[n.Loc.Path]
+		}
+		if f == nil {
+			continue
+		}
+		nodes[n.ID] = at.file(cmpURL, f.key())
+		if n.Generated || f.Path == "" {
+			continue
+		}
+		if c, ok := firstChange(f.Hunks, n.Loc.Line, spanEnd(v, n, removed, ms)+1, removed); ok {
+			nodes[n.ID] = at.line(cmpURL, f.key(), c)
+		}
+	}
+	if v.Links == nil {
+		v.Links = &Links{}
+	}
+	v.Links.Files, v.Links.Nodes = links, nodes
+}
+
+// spanEnd is the last line of n: of its measured span for a head function,
+// else the line before the next declaration drawn in its file on its side.
+func spanEnd(v *View, n *Node, removed bool, ms scan.Measures) int {
+	if !removed {
+		for _, sp := range ms.Funcs[n.ID].Spans {
+			if sp.Path == n.Loc.Path && sp.Start.Line <= n.Loc.Line && n.Loc.Line <= sp.End.Line {
+				return sp.End.Line
+			}
+		}
+	}
+	if next := nextDecl(v, n, removed); next != math.MaxInt {
+		return next - 1
+	}
+	return math.MaxInt - 1
+}
+
+// anchors are one host's places on its compare page (14's research,
+// 2026-09-25): a file's diff, and one changed line in it.
+type anchors struct {
+	file func(compare, path string) string
+	line func(compare, path string, c change) string
+}
+
+// Hosted is whether origin is on a host zu links into by itself: GitHub or
+// GitLab (a -link-template covers any other).
+func Hosted(origin string) bool {
+	host, _ := parseRemote(origin)
+	_, ok := hosts[host]
+	return ok
+}
+
+var hosts = map[string]anchors{
+	// GitHub: "diff-" and the SHA-256 of the path, then R and the head line
+	// or L and the base line. Seen on live compare pages.
+	"github.com": {
+		file: func(cmp, p string) string { return cmp + "#diff-" + sha256Hex(p) },
+		line: func(cmp, p string, c change) string {
+			if c.kind == '+' {
+				return cmp + "#diff-" + sha256Hex(p) + "R" + strconv.Itoa(c.head)
+			}
+			return cmp + "#diff-" + sha256Hex(p) + "L" + strconv.Itoa(c.base)
+		},
+	},
+	// GitLab: the SHA-1 of the path, or a line's id: "line_", its first 9
+	// hex, then A and the head line of an added line or the base line of a
+	// removed one (lib/gitlab/diff/line.rb id). ?file_path= draws that file
+	// first. Seen on live compare and merge request pages.
+	"gitlab.com": {
+		file: func(cmp, p string) string { return cmp + "?file_path=" + url.QueryEscape(p) + "#" + sha1Hex(p) },
+		line: func(cmp, p string, c change) string {
+			id := "line_" + sha1Hex(p)[:9] + "_"
+			if c.kind == '+' {
+				id += "A" + strconv.Itoa(c.head)
+			} else {
+				id += strconv.Itoa(c.base)
+			}
+			return cmp + "?file_path=" + url.QueryEscape(p) + "#" + id
+		},
+	},
+}
+
+func sha256Hex(s string) string {
+	sum := sha256.Sum256([]byte(s))
+	return hex.EncodeToString(sum[:])
+}
+
+func sha1Hex(s string) string {
+	sum := sha1.Sum([]byte(s)) //nolint:gosec // G401: as the import says
+	return hex.EncodeToString(sum[:])
+}
+
+// change is one changed line of a file's diff: '+' at head line head, or
+// '-' at base line base. The other number is the next line on that side.
+type change struct {
+	kind       byte
+	base, head int
+}
+
+// firstChange returns the first changed line of hs inside [line, until) on
+// one side: base (a removed declaration, '-' lines only) or head (a '+' at
+// or after line, or a '-' removed from after line). On head, lines that a
+// '+' run replaces give that run's first line: the new text, not the old.
+func firstChange(hs []Hunk, line, until int, base bool) (change, bool) {
+	for _, h := range hs {
+		cs := changes(h)
+		for i, c := range cs {
+			switch {
+			case base && c.kind == '-' && c.base >= line && c.base < until,
+				!base && c.kind == '+' && c.head >= line && c.head < until:
+				return c, true
+			case !base && c.kind == '-' && c.head > line && c.head < until:
+				j := i
+				for j < len(cs) && cs[j].kind == '-' && cs[j].head == c.head {
+					j++
+				}
+				if j < len(cs) && cs[j].kind == '+' && cs[j].head == c.head {
+					return cs[j], true
+				}
+				return c, true
+			}
+		}
+	}
+	return change{}, false
+}
+
+// changes lists the changed lines of h, each with its line on both sides.
+// A side with no lines starts at the line before the hunk (unified diff).
+func changes(h Hunk) []change {
+	b, hd := h.BaseStart, h.HeadStart
+	if h.BaseLines == 0 {
+		b++
+	}
+	if h.HeadLines == 0 {
+		hd++
+	}
+	var out []change
+	for _, l := range h.Lines {
+		if l == "" {
+			continue
+		}
+		switch l[0] {
+		case '-':
+			out = append(out, change{'-', b, hd})
+			b++
+		case '+':
+			out = append(out, change{'+', b, hd})
+			hd++
+		default:
+			b, hd = b+1, hd+1
+		}
+	}
+	return out
+}
+
+// nextDecl is the line of the next declaration after n in its file on n's
+// side, among those the View draws, or MaxInt.
+func nextDecl(v *View, n *Node, removed bool) int {
+	next := math.MaxInt
+	for i := range v.Nodes {
+		o := &v.Nodes[i]
+		if o.Loc.Path != n.Loc.Path || (o.Status == "removed") != removed || o.Kind == string(ir.KindPackage) {
+			continue
+		}
+		if o.Loc.Line > n.Loc.Line {
+			next = min(next, o.Loc.Line)
+		}
+	}
+	return next
+}
diff --git a/internal/export/links.go b/internal/export/links.go
index 081cde6..cce6159 100644
--- a/internal/export/links.go
+++ b/internal/export/links.go
@@ -36,6 +36,20 @@ func ForRepo(origin string, head ir.Ref, template, prefix string) (*Links, error
 	return nil, nil
 }
 
+// BaseBlob is ForRepo's blob template at base, the Change View's
+// merge-base, for what the change removed (14), or "". A template without
+// {commit} gives none: it would open head's file.
+func BaseBlob(origin string, base ir.Ref, template string) string {
+	if template != "" && !strings.Contains(template, "{commit}") {
+		return ""
+	}
+	l, err := ForRepo(origin, base, template, "")
+	if err != nil || l == nil {
+		return ""
+	}
+	return l.Blob
+}
+
 // CompareURL returns the host's page comparing base with head, or "" when
 // either side is not a clean commit or the origin is not GitHub or GitLab.
 func CompareURL(origin string, base, head ir.Ref) string {
diff --git a/internal/export/view.go b/internal/export/view.go
index 70353ea..da3cc7c 100644
--- a/internal/export/view.go
+++ b/internal/export/view.go
@@ -130,8 +130,13 @@ func sortView(v *View) {
 }
 
 // Links are URL templates the UI fills with {path} and {line}. Compare is set
-// only in a Change View.
+// only in a Change View, as are the rest (14): Base is Blob at the base
+// commit, for what the change removed; Files maps each path in Hunks, and
+// Nodes each changed declaration, to its place on the compare page.
 type Links struct {
-	Blob    string `json:"blob"`
-	Compare string `json:"compare,omitempty"`
+	Blob    string            `json:"blob"`
+	Compare string            `json:"compare,omitempty"`
+	Base    string            `json:"base,omitempty"`
+	Files   map[string]string `json:"files,omitempty"`
+	Nodes   map[string]string `json:"nodes,omitempty"`
 }
```

- [x] **Run:** `go test -race ./internal/export/ && go vet ./... && golangci-lint run ./internal/export/` Expected: PASS (read the lint output)

- [x] **Commit:** `Place each change on the host's compare page from the host's diff`

### Task 2: Git's own diff, and what the remote has (`internal/gitref`)

`Diff` reads `git diff -M -U3 base head -- '*.go'` into `FileDiff`s, and `OnRemote` says whether a remote-tracking ref contains a commit.

The tests use real repositories:
- `TestDiff`: a head that makes several changes against its base:
  - it renames `a/a.go` to `b/a.go` with `git mv` and edits two lines;
  - it edits `c/c.go` and drops its last newline;
  - it deletes `d/gone.go`;
  - it renames `e/e.go` to `f/e.go` unchanged (no `---` lines);
  - it adds `n/new.go`;
  - it edits `sp ace/é.go`, a path with a space and an accent;
  - it makes `m.go` executable (a mode change, no hunks);
  - it edits a README, which is not Go and so is not read.

  The repository's config sets `diff.noprefix`, `diff.algorithm=patience` and `diff.context=9`, and the hunks must not change. An option given as a commit is refused.
- `TestOnRemote`: with no remote-tracking ref, neither commit is on the remote. With `origin/main` at base, base is on the remote and head is not. With `origin/feat` at head, head is on it. A local branch does not count. An option as a commit, or a directory outside git, is on no remote.

**Files:**
- Tests: `internal/gitref/hostdiff_test.go` (new)
- Code: `internal/gitref/hostdiff.go` (new)

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/gitref/hostdiff_test.go b/internal/gitref/hostdiff_test.go
new file mode 100644
index 0000000..e293c18
--- /dev/null
+++ b/internal/gitref/hostdiff_test.go
@@ -0,0 +1,140 @@
+package gitref
+
+import (
+	"context"
+	"fmt"
+	"os"
+	"path/filepath"
+	"reflect"
+	"strings"
+	"testing"
+)
+
+// funcs is a Go file of package pkg with n one-line functions F1…Fn, one
+// per line from line 3.
+func funcs(pkg string, n int) string {
+	var b strings.Builder
+	fmt.Fprintf(&b, "package %s\n\n", pkg)
+	for i := 1; i <= n; i++ {
+		fmt.Fprintf(&b, "func F%d() {}\n", i)
+	}
+	return b.String()
+}
+
+// put writes a file, making its directories.
+func put(t *testing.T, path, body string) {
+	t.Helper()
+	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
+		t.Fatal(err)
+	}
+	write(t, path, body)
+}
+
+// hostRepo commits a base, then a head that renames a/a.go to b/a.go with
+// two lines edited, edits c/c.go (dropping its last newline), deletes
+// d/gone.go, renames e/e.go to f/e.go unchanged, adds n/new.go, edits a path with a space and an accent, makes
+// m.go executable and edits a README. It returns the two commits.
+func hostRepo(t *testing.T) (dir, base, head string) {
+	t.Helper()
+	needGit(t)
+	dir = t.TempDir()
+	run(t, dir, "init", "-q", "-b", "main")
+	files := map[string]string{
+		"a/a.go":      funcs("a", 30),
+		"c/c.go":      "package c\n\nfunc C() int {\n\treturn 1\n}\n",
+		"d/gone.go":   "package d\n\nfunc Z() {}\n",
+		"sp ace/é.go": "package sp\n\nfunc S() {}\n",
+		"m.go":        "package m\n",
+		"e/e.go":      "package e\n",
+		"README.md":   "hello\n",
+	}
+	for p, body := range files {
+		put(t, filepath.Join(dir, p), body)
+	}
+	run(t, dir, "add", "-A")
+	run(t, dir, "commit", "-q", "-m", "base")
+	base = strings.TrimSpace(run(t, dir, "rev-parse", "HEAD"))
+	if err := os.Mkdir(filepath.Join(dir, "b"), 0o755); err != nil {
+		t.Fatal(err)
+	}
+	run(t, dir, "mv", "a/a.go", "b/a.go")
+	run(t, dir, "mv", "e", "f")
+	write(t, filepath.Join(dir, "b/a.go"), strings.Replace(strings.Replace(funcs("a", 30), "package a", "package b", 1), "func F15() {}", "func F15() { _ = 1 }", 1))
+	write(t, filepath.Join(dir, "c/c.go"), "package c\n\nfunc C() int {\n\treturn 2\n}")
+	run(t, dir, "rm", "-q", "d/gone.go")
+	put(t, filepath.Join(dir, "n/new.go"), "package n\n")
+	write(t, filepath.Join(dir, "sp ace/é.go"), "package sp\n\nfunc S() { _ = 0 }\n")
+	if err := os.Chmod(filepath.Join(dir, "m.go"), 0o755); err != nil { // #nosec G302 -- a test's mode change
+		t.Fatal(err)
+	}
+	write(t, filepath.Join(dir, "README.md"), "bye\n")
+	run(t, dir, "add", "-A")
+	run(t, dir, "commit", "-q", "-m", "head")
+	head = strings.TrimSpace(run(t, dir, "rev-parse", "HEAD"))
+	return dir, base, head
+}
+
+// Diff gives each changed Go file as the host's compare page shows it: a
+// rename under its new path with its old one and only the lines that moved
+// in it, a deletion under its old path, a mode change with no hunks.
+func TestDiff(t *testing.T) {
+	dir, base, head := hostRepo(t)
+	// A user's config must not change what the host would show.
+	run(t, dir, "config", "diff.noprefix", "true")
+	run(t, dir, "config", "diff.algorithm", "patience")
+	run(t, dir, "config", "diff.context", "9")
+	got, err := Diff(context.Background(), dir, base, head)
+	if err != nil {
+		t.Fatal(err)
+	}
+	want := []FileDiff{
+		{Path: "b/a.go", OldPath: "a/a.go", Hunks: []Hunk{
+			{BaseStart: 1, BaseLines: 4, HeadStart: 1, HeadLines: 4, Lines: []string{"-package a", "+package b", " ", " func F1() {}", " func F2() {}"}},
+			{BaseStart: 14, BaseLines: 7, HeadStart: 14, HeadLines: 7, Lines: []string{
+				" func F12() {}", " func F13() {}", " func F14() {}", "-func F15() {}", "+func F15() { _ = 1 }", " func F16() {}", " func F17() {}", " func F18() {}",
+			}},
+		}},
+		{Path: "c/c.go", OldPath: "c/c.go", Hunks: []Hunk{
+			{BaseStart: 1, BaseLines: 5, HeadStart: 1, HeadLines: 5, Lines: []string{
+				" package c", " ", " func C() int {", "-\treturn 1", "-}", "+\treturn 2", "+}",
+			}},
+		}},
+		{OldPath: "d/gone.go", Hunks: []Hunk{
+			{BaseStart: 1, BaseLines: 3, HeadStart: 0, HeadLines: 0, Lines: []string{"-package d", "-", "-func Z() {}"}},
+		}},
+		{Path: "f/e.go", OldPath: "e/e.go"},
+		{Path: "m.go", OldPath: "m.go"},
+		{Path: "n/new.go", Hunks: []Hunk{{BaseStart: 0, BaseLines: 0, HeadStart: 1, HeadLines: 1, Lines: []string{"+package n"}}}},
+		{Path: "sp ace/é.go", OldPath: "sp ace/é.go", Hunks: []Hunk{
+			{BaseStart: 1, BaseLines: 3, HeadStart: 1, HeadLines: 3, Lines: []string{" package sp", " ", "-func S() {}", "+func S() { _ = 0 }"}},
+		}},
+	}
+	if !reflect.DeepEqual(got, want) {
+		t.Errorf("Diff =\n%+v\nwant\n%+v", got, want)
+	}
+	if _, err := Diff(context.Background(), dir, "-p", head); err == nil {
+		t.Error("an option as a commit was accepted")
+	}
+}
+
+// OnRemote is whether a remote-tracking ref holds the commit: what the host
+// can show, read offline from the clone's refs.
+func TestOnRemote(t *testing.T) {
+	dir, base, head := hostRepo(t)
+	ctx := context.Background()
+	if OnRemote(ctx, dir, head) || OnRemote(ctx, dir, base) {
+		t.Fatal("no remote-tracking ref, yet a commit is on the remote")
+	}
+	run(t, dir, "update-ref", "refs/remotes/origin/main", base)
+	if !OnRemote(ctx, dir, base) || OnRemote(ctx, dir, head) {
+		t.Error("origin/main at base: base should be on the remote, head not")
+	}
+	run(t, dir, "update-ref", "refs/remotes/origin/feat", head)
+	if !OnRemote(ctx, dir, head) {
+		t.Error("origin/feat at head: head should be on the remote")
+	}
+	run(t, dir, "update-ref", "refs/heads/local", head) // a local branch is not the host
+	if OnRemote(ctx, dir, "-p") || OnRemote(ctx, t.TempDir(), head) {
+		t.Error("an option or a directory outside git is on no remote")
+	}
+}
```

- [x] **Run:** `go test ./internal/gitref/` Expected: FAIL (a compile failure: `undefined: Diff`, `FileDiff`, `Hunk`, `OnRemote`)

- [x] **Implement**

```diff
diff --git a/internal/gitref/hostdiff.go b/internal/gitref/hostdiff.go
new file mode 100644
index 0000000..f342b17
--- /dev/null
+++ b/internal/gitref/hostdiff.go
@@ -0,0 +1,180 @@
+package gitref
+
+import (
+	"bufio"
+	"context"
+	"fmt"
+	"strconv"
+	"strings"
+)
+
+// FileDiff is one Go file of `git diff -M` between two commits, as a host's
+// compare page lists it: Path is head's path ("" when the change deleted the
+// file), OldPath base's ("" when it added the file).
+type FileDiff struct {
+	Path, OldPath string
+	Hunks         []Hunk
+}
+
+// Hunk is one @@ block: its line ranges on each side and its lines, each
+// prefixed " ", "-" or "+".
+type Hunk struct {
+	BaseStart, BaseLines, HeadStart, HeadLines int
+	Lines                                      []string
+}
+
+// diffArgs pin what a user's config could change, so the hunks are git's
+// defaults: the ones a host computes for its compare page.
+var diffArgs = []string{
+	"-c", "core.quotePath=false",
+	"diff", "--no-color", "--no-ext-diff", "--no-textconv", "--no-relative",
+	"-M", "-U3", "--inter-hunk-context=0", "--diff-algorithm=myers", "--indent-heuristic",
+	"--src-prefix=a/", "--dst-prefix=b/",
+}
+
+// Diff is `git diff -M -U3 base head -- '*.go'`, read from git objects. base
+// and head must be commit ids (see Resolve), never options.
+func Diff(ctx context.Context, top, base, head string) ([]FileDiff, error) {
+	if strings.HasPrefix(base, "-") || strings.HasPrefix(head, "-") {
+		return nil, fmt.Errorf("invalid commit %q or %q", base, head)
+	}
+	out, err := git(ctx, top, append(diffArgs, base, head, "--", "*.go")...)
+	if err != nil {
+		if ctx.Err() != nil {
+			return nil, ctx.Err()
+		}
+		return nil, fmt.Errorf("git diff: %w", err)
+	}
+	return parseDiff(out)
+}
+
+// parseDiff reads unified diff output: a "diff --git" line opens each file,
+// headers name its sides, and each @@ hunk's body is read by its counts.
+func parseDiff(out string) ([]FileDiff, error) {
+	var files []FileDiff
+	sc := bufio.NewScanner(strings.NewReader(out))
+	sc.Buffer(make([]byte, 0, 64*1024), 64*1024*1024)
+	var f *FileDiff
+	for sc.Scan() {
+		line := sc.Text()
+		switch {
+		case strings.HasPrefix(line, "diff --git "):
+			files = append(files, FileDiff{})
+			f = &files[len(files)-1]
+			f.OldPath, f.Path = headerPaths(line[len("diff --git "):])
+		case f == nil:
+			return nil, fmt.Errorf("git diff: unexpected line %q", line)
+		case strings.HasPrefix(line, "new file mode "):
+			f.OldPath = ""
+		case strings.HasPrefix(line, "deleted file mode "):
+			f.Path = ""
+		case strings.HasPrefix(line, "rename from "):
+			f.OldPath = unquote(line[len("rename from "):])
+		case strings.HasPrefix(line, "rename to "):
+			f.Path = unquote(line[len("rename to "):])
+		case strings.HasPrefix(line, "--- "):
+			f.OldPath = side(line[len("--- "):], "a/")
+		case strings.HasPrefix(line, "+++ "):
+			f.Path = side(line[len("+++ "):], "b/")
+		case strings.HasPrefix(line, "@@ "):
+			h, err := hunkHeader(line)
+			if err != nil {
+				return nil, err
+			}
+			for base, head := h.BaseLines, h.HeadLines; base > 0 || head > 0; {
+				if !sc.Scan() {
+					return nil, fmt.Errorf("git diff: hunk %q cut short", line)
+				}
+				l := sc.Text()
+				if strings.HasPrefix(l, `\`) { // "\ No newline at end of file"
+					continue
+				}
+				switch {
+				case strings.HasPrefix(l, "-"):
+					base--
+				case strings.HasPrefix(l, "+"):
+					head--
+				default:
+					base--
+					head--
+				}
+				h.Lines = append(h.Lines, l)
+			}
+			f.Hunks = append(f.Hunks, h)
+		}
+	}
+	return files, sc.Err()
+}
+
+// headerPaths splits `a/P b/Q` from a "diff --git" line. Unquoted paths may
+// hold spaces, so it relies on a/P and b/P being equal when the header is
+// all there is (a mode change); renames and edits name their sides again.
+func headerPaths(s string) (oldPath, path string) {
+	if strings.HasPrefix(s, `"`) {
+		if q, err := strconv.QuotedPrefix(s); err == nil {
+			return strings.TrimPrefix(unquote(q), "a/"), strings.TrimPrefix(unquote(strings.TrimSpace(s[len(q):])), "b/")
+		}
+	}
+	if n := len(s); n%2 == 1 && s[n/2] == ' ' && strings.HasPrefix(s, "a/") && s[n/2+1:n/2+3] == "b/" && s[2:n/2] == s[n/2+3:] {
+		return s[2 : n/2], s[2 : n/2]
+	}
+	return "", ""
+}
+
+// side reads a "---" or "+++" path: /dev/null is no path.
+func side(s, prefix string) string {
+	s = strings.TrimSuffix(s, "\t")
+	if s == "/dev/null" {
+		return ""
+	}
+	return strings.TrimPrefix(unquote(s), prefix)
+}
+
+// unquote undoes git's C-style quoting of a path with unusual characters.
+func unquote(s string) string {
+	if strings.HasPrefix(s, `"`) {
+		if u, err := strconv.Unquote(s); err == nil {
+			return u
+		}
+	}
+	return s
+}
+
+// hunkHeader reads "@@ -a[,b] +c[,d] @@": a count left out is 1.
+func hunkHeader(line string) (Hunk, error) {
+	var h Hunk
+	f := strings.Fields(line)
+	if len(f) < 4 || !strings.HasPrefix(f[1], "-") || !strings.HasPrefix(f[2], "+") {
+		return h, fmt.Errorf("git diff: bad hunk header %q", line)
+	}
+	var err1, err2 error
+	h.BaseStart, h.BaseLines, err1 = rng(f[1][1:])
+	h.HeadStart, h.HeadLines, err2 = rng(f[2][1:])
+	if err1 != nil || err2 != nil {
+		return h, fmt.Errorf("git diff: bad hunk header %q", line)
+	}
+	return h, nil
+}
+
+func rng(s string) (start, n int, err error) {
+	a, b, ok := strings.Cut(s, ",")
+	if start, err = strconv.Atoi(a); err != nil {
+		return 0, 0, err
+	}
+	if !ok {
+		return start, 1, nil
+	}
+	n, err = strconv.Atoi(b)
+	return start, n, err
+}
+
+// OnRemote is whether a remote-tracking ref contains commit: what the host
+// has, as far as this clone knows. It reads local refs only; zu never
+// fetches.
+func OnRemote(ctx context.Context, top, commit string) bool {
+	if commit == "" || strings.HasPrefix(commit, "-") {
+		return false
+	}
+	out, err := git(ctx, top, "for-each-ref", "--count=1", "--format=%(refname)", "--contains", commit, "refs/remotes")
+	return err == nil && strings.TrimSpace(out) != ""
+}
```

- [x] **Run:** `go test -race ./internal/gitref/ && golangci-lint run ./internal/gitref/` Expected: PASS (read the lint output)

- [x] **Commit:** `Read git's own diff of two commits, and whether the remote has a commit`

### Task 3: Compare once (`internal/diff`, `internal/cli`)

`SummarizeDelta` summarizes a Delta the caller already has. `zu diff` passes its Delta through `changeSides` into the Change View, which compares again only under a Policy lens.

The test: `TestSummarizeDeltaIsSummarize` checks that the Summary is `Summarize`'s, and that the Delta is unchanged after. The existing `zu diff` and Change View tests guard the wiring.

**Files:**
- Tests: `internal/diff/summary_test.go`
- Code: `internal/diff/summary.go`, `internal/cli/diff.go`, `internal/cli/html.go`

**Steps:**

- [x] **Write the failing test**

```diff
diff --git a/internal/diff/summary_test.go b/internal/diff/summary_test.go
index ad7b543..5ceb045 100644
--- a/internal/diff/summary_test.go
+++ b/internal/diff/summary_test.go
@@ -183,3 +183,16 @@ func TestSummaryRowOrderBottomUp(t *testing.T) {
 		t.Fatalf("rows = %v, want %v (leaves first; one cycle shares a rank)", ids, want)
 	}
 }
+
+// A caller that already compared the sides summarizes that Delta instead of
+// comparing again (14): the Summary is the same.
+func TestSummarizeDeltaIsSummarize(t *testing.T) {
+	base, head := shopPair(t)
+	d := Compare(base, head)
+	if got, want := SummarizeDelta(base, head, d), Summarize(base, head); !reflect.DeepEqual(got, want) {
+		t.Errorf("SummarizeDelta =\n%+v\nwant\n%+v", got, want)
+	}
+	if !reflect.DeepEqual(d, Compare(base, head)) {
+		t.Error("SummarizeDelta changed the Delta it was given")
+	}
+}
```

- [x] **Run:** `go test ./internal/diff/` Expected: FAIL (a compile failure: `undefined: SummarizeDelta`)

- [x] **Implement**

```diff
diff --git a/internal/cli/diff.go b/internal/cli/diff.go
index df28393..27eb5a9 100644
--- a/internal/cli/diff.go
+++ b/internal/cli/diff.go
@@ -125,7 +125,8 @@ func runDiff(args []string, stdout, stderr io.Writer) int {
 		fmt.Fprintf(stderr, "zu diff: warning: %v (zu check fails on it)\n", err)
 	}
 
-	s := diff.Summarize(baseDoc, headDoc)
+	delta := diff.Compare(baseDoc, headDoc)
+	s := diff.SummarizeDelta(baseDoc, headDoc, delta)
 	if pol.Rules() {
 		s.Violations = diff.Violations(pol.Check(baseDoc), pol.Check(headDoc))
 	}
@@ -147,7 +148,7 @@ func runDiff(args []string, stdout, stderr io.Writer) int {
 	fmt.Fprintf(stderr, "zu diff: %d packages changed, %d affected, parse errors base=%d head=%d\n",
 		len(s.Packages), len(s.Affected), len(baseDoc.ParseErrors), len(headDoc.ParseErrors))
 	if hopts.path != "" {
-		c := changeSides{top: top, base: baseDoc, head: headDoc, baseTree: baseTree, headTree: head.tree, pol: pol, measures: headStats.Measures}
+		c := changeSides{top: top, base: baseDoc, head: headDoc, baseTree: baseTree, headTree: head.tree, pol: pol, measures: headStats.Measures, delta: delta}
 		if err := writeChangeHTML(ctx, c, s, &hopts, stderr); err != nil {
 			return bad("html: %v", err)
 		}
diff --git a/internal/cli/html.go b/internal/cli/html.go
index d052fd5..9d5a82a 100644
--- a/internal/cli/html.go
+++ b/internal/cli/html.go
@@ -213,20 +213,22 @@ type changeSides struct {
 	baseTree, headTree scan.Tree
 	pol                *policy.Policy // head's, which the hash check proved is base's
 	measures           scan.Measures  // head's (08)
+	delta              diff.Delta     // diff.Compare(base, head), computed once (14)
 }
 
 // writeChangeHTML writes the Change View export of base → head. Links point at
 // head, and at the host's compare page when both sides are clean commits.
 func writeChangeHTML(ctx context.Context, c changeSides, sum *diff.Summary, o *htmlOptions, stderr io.Writer) error {
-	base, head := c.base, c.head
+	base, head, d := c.base, c.head, c.delta
 	violations := sum.Violations
 	if c.pol.Lens() {
 		// The View draws both sides as the Policy does, so its changed list
 		// must come from the same IRs; the printed Summary stays whole.
 		base, head = c.pol.Apply(base), c.pol.Apply(head)
-		sum = diff.Summarize(base, head)
+		d = diff.Compare(base, head)
+		sum = diff.SummarizeDelta(base, head, d)
 	}
-	v, err := export.Change(base, head, diff.Compare(base, head), sum, c.baseTree, c.headTree)
+	v, err := export.Change(base, head, d, sum, c.baseTree, c.headTree)
 	if err != nil {
 		return err
 	}
diff --git a/internal/diff/summary.go b/internal/diff/summary.go
index 5687723..2657fa5 100644
--- a/internal/diff/summary.go
+++ b/internal/diff/summary.go
@@ -62,7 +62,13 @@ type SideErrors struct {
 
 // Summarize builds the Structural Summary of base → head.
 func Summarize(base, head *ir.IR) *Summary {
-	d := Compare(base, head)
+	return SummarizeDelta(base, head, Compare(base, head))
+}
+
+// SummarizeDelta is Summarize given d, the Delta Compare(base, head) already
+// returned, so a caller that needs both compares once (14). It reads d and
+// never changes it.
+func SummarizeDelta(base, head *ir.IR, d Delta) *Summary {
 	s := &Summary{
 		SummaryVersion: SummaryVersion,
 		Base:           base.Ref,
```

- [x] **Run:** `go test -race ./... && go vet ./...` Expected: PASS

- [x] **Commit:** `Compare the two sides once per zu diff`

### Task 4: `zu diff -html` writes the links

`writeChangeHTML` becomes `changeView` + `renderView`. `changeView` gates each side on the remote, runs `gitref.Diff` when the compare URL exists, and calls `DiffLinks`. It also sets `Links.Base`.

The tests:
- `TestDiffHTMLWritesTheChangeView` (pushed with `update-ref`): the page carries the base blob, `a/a.go`'s diff and `a.F`'s `R3`.
- `TestDiffHTMLWorktreeLinksOnlyTheBase` (renamed from `TestDiffHTMLWorktreeHasNoLinks`): a dirty head links only to the base.
- `TestDiffHTMLUnpushedHeadLinksOnlyTheBase` (M3):
  - with `origin/main` at the base and head unpushed, only the base links, and stderr names the head commit;
  - with no remote-tracking ref, nothing links;
  - with a Bitbucket origin, there is no note.
- `TestDiffHTMLGitDiffFailureLinksEachFile` (Deviation 12): with `gitDiff` stubbed to fail, the page is written, `a.F` gets its file's diff, and stderr has the note.
- `TestDiffHTMLMovedPackageLinksTheNewPath` (M1): `git mv a c` plus a 2-line edit (the package clause, `G`'s body) and the importer's update, pushed.
  - The links key on `b/b.go` and `c/a.go`, and nothing names `a/a.go`.
  - `c.F`, moved and unedited, gets the file link.
  - `c.G`, moved and edited, gets `R5`.
  - The file is 45 lines, so two edits keep it a rename.

**Files:**
- Tests: `internal/cli/diff_test.go`
- Code: `internal/cli/html.go`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/cli/diff_test.go b/internal/cli/diff_test.go
index 26c99ba..f217c81 100644
--- a/internal/cli/diff_test.go
+++ b/internal/cli/diff_test.go
@@ -3,12 +3,15 @@ package cli
 import (
 	"context"
 	"encoding/json"
+	"errors"
+	"fmt"
 	"os"
 	"path/filepath"
 	"strings"
 	"testing"
 
 	"zu/internal/diff"
+	"zu/internal/gitref"
 	"zu/internal/policy"
 )
 
@@ -266,6 +269,7 @@ func TestDiffHTMLWritesTheChangeView(t *testing.T) {
 	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
 	base := git(t, dir, "rev-parse", "main")
 	head := git(t, dir, "rev-parse", "HEAD")
+	git(t, dir, "update-ref", "refs/remotes/origin/feat", head) // pushed and fetched
 	out := filepath.Join(t.TempDir(), "change.html")
 
 	code, stdout, errOut := run("diff", "main", "-html", out)
@@ -283,6 +287,10 @@ func TestDiffHTMLWritesTheChangeView(t *testing.T) {
 		`"+func F() int { return 2 }"`,
 		`"compare":"https://github.com/o/r/compare/` + base + `...` + head + `"`,
 		`"blob":"https://github.com/o/r/blob/` + head + `/{path}#L{line}"`,
+		// 14: the base blob, the file's diff and F's changed line on the compare page.
+		`"base":"https://github.com/o/r/blob/` + base + `/{path}#L{line}"`,
+		`"files":{"a/a.go":"https://github.com/o/r/compare/` + base + `...` + head + `#diff-` + aGo + `"}`,
+		`"nodes":{"example.com/m/a.F":"https://github.com/o/r/compare/` + base + `...` + head + `#diff-` + aGo + `R3"}`,
 	} {
 		if !strings.Contains(s, want) {
 			t.Errorf("html lacks %s", want)
@@ -293,24 +301,150 @@ func TestDiffHTMLWritesTheChangeView(t *testing.T) {
 	}
 }
 
-func TestDiffHTMLWorktreeHasNoLinks(t *testing.T) {
+// aGo is GitHub's anchor of a/a.go: printf %s a/a.go | shasum -a 256.
+const aGo = "6f0e76217f46bde75131273709c148632e8120c9be0617a825f09640d38454a5"
+
+// A dirty head links nothing on the host but the base side (14): the base
+// commit is clean, and a removed declaration is found there.
+func TestDiffHTMLWorktreeLinksOnlyTheBase(t *testing.T) {
 	withUI(t)
 	dir := diffRepo(t)
 	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
+	git(t, dir, "update-ref", "refs/remotes/origin/feat", "HEAD")
 	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() int { return 3 }\n\nfunc G() {}\n")
 	out := filepath.Join(t.TempDir(), "change.html")
 	if code, _, errOut := run("diff", "main", "-worktree", "-html", out); code != ExitOK {
 		t.Fatalf("exit %d: %s", code, errOut)
 	}
 	s := readFile(t, out)
-	if strings.Contains(s, `"links"`) {
-		t.Error("a dirty head must not link to the host")
+	base := git(t, dir, "rev-parse", "main")
+	if !strings.Contains(s, `"links":{"blob":"","base":"https://github.com/o/r/blob/`+base+`/{path}#L{line}"}`) {
+		t.Error("a dirty head must link only to the base commit")
 	}
 	if !strings.Contains(s, `"+func F() int { return 3 }"`) {
 		t.Error("the worktree edit is not in the hunks")
 	}
 }
 
+// A commit no remote-tracking ref holds is not on the host yet, so nothing
+// links to it there (14): only the base, which origin/main holds.
+func TestDiffHTMLUnpushedHeadLinksOnlyTheBase(t *testing.T) {
+	withUI(t)
+	dir := diffRepo(t)
+	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
+	git(t, dir, "update-ref", "refs/remotes/origin/main", "main")
+	out := filepath.Join(t.TempDir(), "change.html")
+	code, _, errOut := run("diff", "main", "-html", out)
+	if code != ExitOK {
+		t.Fatalf("exit %d: %s", code, errOut)
+	}
+	s := readFile(t, out)
+	base := git(t, dir, "rev-parse", "main")
+	if !strings.Contains(s, `"links":{"blob":"","base":"https://github.com/o/r/blob/`+base+`/{path}#L{line}"}`) {
+		t.Error("an unpushed head must link only to the base commit")
+	}
+	head := git(t, dir, "rev-parse", "HEAD")
+	if !strings.Contains(errOut, "zu diff: note: "+head[:12]+" is on no remote-tracking ref") {
+		t.Errorf("stderr does not say why host links are missing: %q", errOut)
+	}
+	git(t, dir, "update-ref", "-d", "refs/remotes/origin/main")
+	if code, _, errOut := run("diff", "main", "-html", out); code != ExitOK {
+		t.Fatalf("exit %d: %s", code, errOut)
+	}
+	if s := readFile(t, out); strings.Contains(s, `"links"`) {
+		t.Error("with nothing on the remote, nothing links to the host")
+	}
+	// A host zu does not link to is never "left out": no note.
+	git(t, dir, "remote", "set-url", "origin", "git@bitbucket.org:o/r.git")
+	code, _, errOut = run("diff", "main", "-html", out)
+	if code != ExitOK || strings.Contains(errOut, "remote-tracking") {
+		t.Errorf("exit %d, stderr %q", code, errOut)
+	}
+}
+
+// When git diff fails, the Change View is still written, and each changed
+// declaration links to its file's diff on the compare page (14).
+func TestDiffHTMLGitDiffFailureLinksEachFile(t *testing.T) {
+	withUI(t)
+	dir := diffRepo(t)
+	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
+	git(t, dir, "update-ref", "refs/remotes/origin/feat", "HEAD")
+	old := gitDiff
+	gitDiff = func(context.Context, string, string, string) ([]gitref.FileDiff, error) {
+		return nil, errors.New("boom")
+	}
+	t.Cleanup(func() { gitDiff = old })
+	out := filepath.Join(t.TempDir(), "change.html")
+	code, _, errOut := run("diff", "main", "-html", out)
+	if code != ExitOK {
+		t.Fatalf("exit %d: %s", code, errOut)
+	}
+	if !strings.Contains(errOut, "zu diff: note: git diff failed (boom); host links point at each file's diff") {
+		t.Errorf("stderr = %q", errOut)
+	}
+	cmp := `https://github.com/o/r/compare/` + git(t, dir, "rev-parse", "main") + `...` + git(t, dir, "rev-parse", "HEAD") + `#diff-` + aGo
+	if s := readFile(t, out); !strings.Contains(s, `"nodes":{"example.com/m/a.F":"`+cmp+`"}`) {
+		t.Error("a.F does not link to its file's diff")
+	}
+}
+
+// A package moved with git mv and edited in two lines links each file under
+// its new path: a moved declaration the edit changed to its line, one the
+// edit missed to its file, never to a line the host shows for something
+// else (14).
+func TestDiffHTMLMovedPackageLinksTheNewPath(t *testing.T) {
+	withUI(t)
+	needGit(t)
+	// Long enough that two edited lines keep it a rename: git, like the
+	// host, calls a file renamed while at least half of it is unchanged.
+	var filler string
+	for i := range 20 {
+		filler += fmt.Sprintf("\nfunc H%d() {}\n", i)
+	}
+	dir := repo(t, map[string]string{
+		"go.mod": "module example.com/m\n",
+		"a/a.go": "package a\n\nfunc F() int { return 1 }\n\nfunc G() {}\n" + filler,
+		"b/b.go": "package b\n\nimport \"example.com/m/a\"\n\nfunc B() { a.G() }\n",
+	})
+	git(t, dir, "init", "-q", "-b", "main")
+	git(t, dir, "add", "-A")
+	git(t, dir, "commit", "-q", "-m", "base")
+	git(t, dir, "checkout", "-q", "-b", "feat")
+	t.Chdir(dir)
+	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
+	git(t, dir, "mv", "a", "c")
+	writeFile(t, dir, "c/a.go", "package c\n\nfunc F() int { return 1 }\n\nfunc G() { _ = 0 }\n"+filler)
+	writeFile(t, dir, "b/b.go", "package b\n\nimport \"example.com/m/c\"\n\nfunc B() { c.G() }\n")
+	git(t, dir, "commit", "-q", "-am", "move a to c")
+	base := git(t, dir, "rev-parse", "main")
+	head := git(t, dir, "rev-parse", "HEAD")
+	git(t, dir, "update-ref", "refs/remotes/origin/feat", head)
+	out := filepath.Join(t.TempDir(), "change.html")
+	if code, _, errOut := run("diff", "main", "-html", out); code != ExitOK {
+		t.Fatalf("exit %d: %s", code, errOut)
+	}
+	s := readFile(t, out)
+	cmp := `https://github.com/o/r/compare/` + base + `...` + head + `#diff-`
+	for _, want := range []string{
+		`"files":{"b/b.go":"` + cmp + bGo + `","c/a.go":"` + cmp + cGo + `"}`,
+		`"example.com/m/c.F":"` + cmp + cGo + `"`,
+		`"example.com/m/c.G":"` + cmp + cGo + `R5"`,
+	} {
+		if !strings.Contains(s, want) {
+			t.Errorf("html lacks %s", want)
+		}
+	}
+	if strings.Contains(s, aGo) {
+		t.Error("a link names the old path a/a.go")
+	}
+}
+
+// bGo and cGo are GitHub's anchors of b/b.go and c/a.go (sha256 of the path).
+const (
+	bGo = "9c7fdc5697cffd37ba63c15d88f002ab329e2f2a8f46b1cd123b008262c69a68"
+	cGo = "7223cd615191d576a1cca14f37997bd46bb87aa82f9c241a6b6ed4b11079cbb1"
+)
+
 func TestDiffHTMLBadInvocations(t *testing.T) {
 	withUI(t)
 	diffRepo(t)
```

- [x] **Run:** `go test ./internal/cli/ -run DiffHTML` Expected: FAIL (a compile failure: `undefined: gitDiff`, the seam the fallback test stubs)

- [x] **Implement**

```diff
diff --git a/internal/cli/html.go b/internal/cli/html.go
index 9d5a82a..9959d17 100644
--- a/internal/cli/html.go
+++ b/internal/cli/html.go
@@ -23,9 +23,11 @@ import (
 
 // Seams for tests: the built UI page and the repository facts links need.
 var (
-	uiTemplate = builtTemplate
-	gitOrigin  = gitref.Origin
-	gitPrefix  = gitref.Prefix
+	uiTemplate  = builtTemplate
+	gitOrigin   = gitref.Origin
+	gitPrefix   = gitref.Prefix
+	gitDiff     = gitref.Diff
+	gitOnRemote = gitref.OnRemote
 )
 
 // listFlag collects a repeatable flag.
@@ -216,9 +218,20 @@ type changeSides struct {
 	delta              diff.Delta     // diff.Compare(base, head), computed once (14)
 }
 
-// writeChangeHTML writes the Change View export of base → head. Links point at
-// head, and at the host's compare page when both sides are clean commits.
+// writeChangeHTML writes the Change View export of base → head.
 func writeChangeHTML(ctx context.Context, c changeSides, sum *diff.Summary, o *htmlOptions, stderr io.Writer) error {
+	v, err := changeView(ctx, "diff", c, sum, o, stderr)
+	if err != nil {
+		return err
+	}
+	return renderView("diff", v, o, stderr)
+}
+
+// changeView builds the Change View of base → head, for zu diff -html and
+// zu serve -base alike. Links point at head, and, when both sides are clean
+// commits, at the host's compare page: each changed file and declaration at
+// its place there (14). The base side always links to the base commit.
+func changeView(ctx context.Context, cmd string, c changeSides, sum *diff.Summary, o *htmlOptions, stderr io.Writer) (*export.View, error) {
 	base, head, d := c.base, c.head, c.delta
 	violations := sum.Violations
 	if c.pol.Lens() {
@@ -230,31 +243,92 @@ func writeChangeHTML(ctx context.Context, c changeSides, sum *diff.Summary, o *h
 	}
 	v, err := export.Change(base, head, d, sum, c.baseTree, c.headTree)
 	if err != nil {
-		return err
+		return nil, err
 	}
 	export.Mark(v, c.pol, c.head)
-	addMetrics("diff", v, c.measures, o, stderr)
+	addMetrics(cmd, v, c.measures, o, stderr)
 	if _, commit := c.headTree.(*gitref.CommitTree); commit {
-		warnUncommitted(ctx, "diff", c.top, "add -worktree", o, stderr)
+		warnUncommitted(ctx, cmd, c.top, "add -worktree", o, stderr)
 	}
 	v.Violations = violations
 	for _, t := range []scan.Tree{c.baseTree, c.headTree} {
 		if ct, ok := t.(*gitref.CommitTree); ok && ct.Err() != nil {
-			return ct.Err()
+			return nil, ct.Err()
 		}
 	}
 	v.Tool = version.Version
-	origin := gitOrigin(ctx, c.top) // diff always runs at the repository top
-	if v.Links, err = export.ForRepo(origin, c.head.Ref, o.linkTmpl, ""); err != nil {
-		return err
+	origin := gitOrigin(ctx, c.top) // both sides are scanned at the repository top
+	baseRef, headRef := c.base.Ref, c.head.Ref
+	if o.linkTmpl == "" && export.Hosted(origin) {
+		// The host shows only what was pushed: a commit no remote-tracking
+		// ref holds gets no host link yet (14). -link-template is trusted.
+		baseRef, headRef = onHost(ctx, cmd, c.top, baseRef, stderr), onHost(ctx, cmd, c.top, headRef, stderr)
+	}
+	if v.Links, err = export.ForRepo(origin, headRef, o.linkTmpl, ""); err != nil {
+		return nil, err
 	}
-	if cmp := export.CompareURL(origin, c.base.Ref, c.head.Ref); cmp != "" {
+	if cmp := export.CompareURL(origin, baseRef, headRef); cmp != "" {
 		if v.Links == nil {
 			v.Links = &export.Links{}
 		}
 		v.Links.Compare = cmp
+		// Link lines come from git's own diff of the two commits, the one
+		// the compare page shows, not from zu's hunks (14).
+		files, err := gitDiff(ctx, c.top, baseRef.Commit, headRef.Commit)
+		switch {
+		case err == nil:
+			export.DiffLinks(v, origin, hostFiles(files), c.measures)
+		case ctx.Err() != nil:
+			return nil, ctx.Err()
+		default:
+			// The View does not depend on git diff: without it, each
+			// changed declaration links to its file's diff.
+			fmt.Fprintf(stderr, "zu %s: note: git diff failed (%v); host links point at each file's diff\n", cmd, err)
+			export.DiffLinks(v, origin, fileOnly(v), c.measures)
+		}
 	}
-	return renderView("diff", v, o, stderr)
+	if b := export.BaseBlob(origin, baseRef, o.linkTmpl); b != "" {
+		if v.Links == nil {
+			v.Links = &export.Links{}
+		}
+		v.Links.Base = b
+	}
+	return v, nil
+}
+
+// onHost is r, or no commit when r is a clean commit that no remote-tracking
+// ref holds; zu diff says why its links are missing.
+func onHost(ctx context.Context, cmd, top string, r ir.Ref, stderr io.Writer) ir.Ref {
+	if r.Commit == "" || r.Dirty || gitOnRemote(ctx, top, r.Commit) {
+		return r
+	}
+	if cmd == "diff" {
+		fmt.Fprintf(stderr, "zu diff: note: %s is on no remote-tracking ref; its host links are left out until it is pushed and fetched\n", r.Commit[:min(12, len(r.Commit))])
+	}
+	return ir.Ref{}
+}
+
+// fileOnly is one HostFile without hunks for each file the View has hunks
+// for, so DiffLinks gives files and declarations their file anchor only.
+func fileOnly(v *export.View) []export.HostFile {
+	out := make([]export.HostFile, 0, len(v.Hunks))
+	for p := range v.Hunks {
+		out = append(out, export.HostFile{Path: p, OldPath: p})
+	}
+	return out
+}
+
+// hostFiles converts git's per-file diff for export.
+func hostFiles(files []gitref.FileDiff) []export.HostFile {
+	out := make([]export.HostFile, len(files))
+	for i, f := range files {
+		hs := make([]export.Hunk, len(f.Hunks))
+		for j, h := range f.Hunks {
+			hs[j] = export.Hunk{BaseStart: h.BaseStart, BaseLines: h.BaseLines, HeadStart: h.HeadStart, HeadLines: h.HeadLines, Lines: h.Lines}
+		}
+		out[i] = export.HostFile{Path: f.Path, OldPath: f.OldPath, Hunks: hs}
+	}
+	return out
 }
 
 // renderView writes v into the UI page at o.path and says what it inlined.
```

- [x] **Run:** `go test -race ./... && go vet ./... && golangci-lint run ./...` Expected: PASS (read the lint output)

- [x] **Commit:** `Write each change's host links into zu diff's Change View, from git's diff, for pushed commits`

### Task 5: The panel links to the hunk, and removed code to base

The tests:
- vitest: `linkFor` on the base side; `diffLink` and `fileDiffLink`, https only, own keys only.
- `accept.mjs`: a `links.html` page (the shop Change View plus GitHub links, as `zu diff -html` writes them). Selecting `Repo.Get` (modified) gives head's source, its `R42` line and its file's diff. Selecting `ReadWriter` (removed) gives base's source at line 19, its `L19` line and the file's diff.

**Files:**
- Tests: `web/src/links.test.ts`, `web/e2e/accept.mjs`
- Code: `web/src/links.ts`, `web/src/data.ts`, `web/src/Panel.tsx`

**Steps:**

- [ ] **Write the failing browser check** (first: `make build` type-checks the unit tests, so it must run before they name `diffLink`)

```diff
diff --git a/web/e2e/accept.mjs b/web/e2e/accept.mjs
index 7956fee..84b0c40 100644
--- a/web/e2e/accept.mjs
+++ b/web/e2e/accept.mjs
@@ -27,6 +27,17 @@ const imp = (from, to) => ({ from, to, kind: "imports", count: 1, loc });
 write("with.html", page(shop));
 write("without.html", page(shop).replace(" worker-src blob:;", ""));
 write("change.html", page(change));
+// 14: the Change View's host links, as zu diff -html writes them on GitHub.
+const gh = "https://github.com/o/r";
+const onHost = `${gh}/compare/${change.base.commit}...${change.head.commit}#diff-b26d414d0eb20deebca0d2b785bd3e1090aa1a7a182e7dc30640d68c53cb40da`;
+write("links.html", page({
+  ...change,
+  links: {
+    blob: `${gh}/blob/${change.head.commit}/{path}#L{line}`, base: `${gh}/blob/${change.base.commit}/{path}#L{line}`,
+    compare: onHost.split("#")[0], files: { "internal/store/store.go": onHost },
+    nodes: { "example.com/shop/internal/store.Repo.Get": onHost + "R42", "example.com/shop/internal/store.ReadWriter": onHost + "L19" },
+  },
+}));
 // Two unchanged packages outside the changed subgraph (openFull).
 const far = ["example.com/shop/far/a", "example.com/shop/far/b"];
 write("far.html", page({ ...change, nodes: [...change.nodes, ...far.map((id) => pkg(id, "example.com/shop"))], edges: [...change.edges, imp(far[0], far[1])] }));
@@ -540,6 +551,23 @@ async function run(b) {
   await settle(p);
   out.foldNarrow = [(await hash(p)).includes("t=m#more"), await p.locator(".node.chip.group .label").first().textContent()];
   await p.close();
+  // 14: a changed declaration links to its line on the compare page and its
+  // file's diff there; a removed one to its source at base.
+  p = await b.newPage();
+  const linked = "links.html#f=example.com/shop/internal/store&s=example.com/shop/internal/store.";
+  // Each href with the host, the commits and the path's hash shortened.
+  const hrefs = () => p.locator(".panel a").evaluateAll((as) => as.map((a) => a.getAttribute("href")
+    .replace("https://github.com/o/r", "").replace(/b{40}/, "B").replace(/h{40}/, "H").replace(/diff-(.{8}).{56}/, "diff-$1")));
+  await p.goto(base + linked + "Repo.Get");
+  await drawn(p);
+  await settle(p);
+  const get = await hrefs();
+  await p.goto(base + linked + "ReadWriter");
+  await p.reload();
+  await drawn(p);
+  await settle(p);
+  out.links = [get, await hrefs()];
+  await p.close();
   out.errors = errors;
   return out;
 }
@@ -565,6 +593,10 @@ const want = {
   hidden: ["#d=4&l=0", 0],
   anyway: 0,
   blocked: "Layout failed: layout worker failed: blocked",
+  links: [
+    ["/blob/H/internal/store/store.go#L37", "/compare/B...H#diff-b26d414dR42", "/compare/B...H#diff-b26d414d"],
+    ["/blob/B/internal/store/store.go#L19", "/compare/B...H#diff-b26d414dL19", "/compare/B...H#diff-b26d414d"],
+  ],
   errors: [],
   // 07
   ranks: ["m/cmd 2", "m/internal 1", "m/internal/cli 1", "m/internal/ir 0"],
```

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node accept.mjs` Expected: FAIL (`links = [["/blob/H/internal/store/store.go#L37"],[]]` in each engine, 55/56: no diff links, and no link for the removed type)

- [ ] **Write the failing unit tests**

```diff
diff --git a/web/src/links.test.ts b/web/src/links.test.ts
index 6677798..6368872 100644
--- a/web/src/links.test.ts
+++ b/web/src/links.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from "vitest";
-import { linkFor } from "./links";
+import { diffLink, fileDiffLink, linkFor } from "./links";
 
 const gh = { blob: "https://github.com/o/r/blob/90cb22a/{path}#L{line}" };
 
@@ -15,3 +15,28 @@ describe("linkFor", () => {
     expect(linkFor(undefined, "x.go", 1)).toBeNull();
   });
 });
+
+// 14: the Change View's links, which zu computed.
+const change = {
+  blob: "",
+  base: "https://github.com/o/r/blob/bbbb/{path}#L{line}",
+  files: { "a/a.go": "https://github.com/o/r/compare/b...h#diff-6f0e", "x.go": "javascript:alert(1)" },
+  nodes: { "m/a.F": "https://github.com/o/r/compare/b...h#diff-6f0eR3" },
+};
+
+describe("Change View links (14)", () => {
+  it("links what the change removed at base, and nothing at a dirty head", () => {
+    expect(linkFor(change, "a/a.go", 2, "base")).toBe("https://github.com/o/r/blob/bbbb/a/a.go#L2");
+    expect(linkFor(change, "a/a.go", 2)).toBeNull();
+  });
+  it("gives a declaration's and a file's place on the compare page, https only", () => {
+    expect(diffLink(change, "m/a.F")).toBe("https://github.com/o/r/compare/b...h#diff-6f0eR3");
+    expect(fileDiffLink(change, "a/a.go")).toBe("https://github.com/o/r/compare/b...h#diff-6f0e");
+    expect(fileDiffLink(change, "x.go")).toBeNull();
+  });
+  it("gives nothing for an id or path it lacks, inherited names included", () => {
+    expect(diffLink(change, "m/a.G")).toBeNull();
+    expect(diffLink(change, "constructor")).toBeNull();
+    expect(fileDiffLink(gh, "a/a.go")).toBeNull();
+  });
+});
```

- [ ] **Run:** `cd web && npx vitest run src/links.test.ts` Expected: FAIL (3 of 6: `diffLink is not a function`, and `linkFor(…, "base")` is null)

- [ ] **Implement**

```diff
diff --git a/web/src/Panel.tsx b/web/src/Panel.tsx
index b23664b..0e2a874 100644
--- a/web/src/Panel.tsx
+++ b/web/src/Panel.tsx
@@ -3,7 +3,7 @@ import type { Bundle } from "./bundle";
 import type { Hunk, Loc, View, ViewEdge, ViewNode } from "./data";
 import { calls, imports, targets, type Row } from "./facts";
 import { isGroup, isStrip, rankNote } from "./group";
-import { linkFor } from "./links";
+import { diffLink, fileDiffLink, linkFor } from "./links";
 import { crapFacts, type Risk } from "./metrics";
 import type { SceneEdge } from "./scene";
 import { EXTERNALS, OUTSIDE, boxStats } from "./tree";
@@ -48,9 +48,12 @@ function Rows({ title, rows, onReveal }: { title: string; rows: Row[]; onReveal:
   );
 }
 
-function Where({ view, loc }: { view: View; loc: Loc }) {
+// Where is a location and its source on the host: at head, or at base for
+// what the change removed (14), whose line is base's.
+function Where({ view, loc, removed = false }: { view: View; loc: Loc; removed?: boolean }) {
   if (!loc.path) return null;
-  const href = linkFor(view.links, loc.path, loc.line);
+  const href = linkFor(view.links, loc.path, loc.line, removed ? "base" : "head");
+  const at = (removed ? view.base?.commit : view.head.commit) ?? "";
   return (
     <p>
       <code>
@@ -60,7 +63,7 @@ function Where({ view, loc }: { view: View; loc: Loc }) {
         <>
           {" · "}
           <a href={href} target="_blank" rel="noopener noreferrer">
-            View at {view.head.commit.slice(0, 12)}
+            View at {at.slice(0, 12)}
           </a>
         </>
       )}
@@ -69,11 +72,20 @@ function Where({ view, loc }: { view: View; loc: Loc }) {
 }
 
 // Hunks renders line diffs as React text children only, like Source.
-function Hunks({ path, hunks }: { path: string; hunks: Hunk[] }) {
+function Hunks({ view, path, hunks }: { view: View; path: string; hunks: Hunk[] }) {
+  const href = fileDiffLink(view.links, path);
   return (
     <section>
       <h3>
         Changes in <code>{path}</code>
+        {href && (
+          <>
+            {" · "}
+            <a className="diff-link" href={href} target="_blank" rel="noopener noreferrer">
+              on the host
+            </a>
+          </>
+        )}
       </h3>
       {hunks.map((h) => (
         <pre key={`${h.baseStart},${h.headStart}`} className="hunk">
@@ -105,6 +117,7 @@ function Change({ view, node }: { view: View; node: ViewNode }) {
     node.hop !== undefined && (node.hop === 0 ? "changed (hop 0)" : `affected, ${node.hop} hop${node.hop > 1 ? "s" : ""} from a change`),
   ].filter(Boolean);
   const hunks = view.hunks ?? {};
+  const href = diffLink(view.links, node.id); // 14: its first changed line there
   const files =
     node.kind === "package"
       ? Object.keys(hunks).filter((p) => dir(p) === dir(node.loc.path)).sort()
@@ -114,8 +127,15 @@ function Change({ view, node }: { view: View; node: ViewNode }) {
   return (
     <>
       {facts.length > 0 && <p className={`change-facts ${node.status ? `st-${node.status}` : ""}`}>{facts.join(" · ")}</p>}
+      {href && (
+        <p>
+          <a className="diff-link" href={href} target="_blank" rel="noopener noreferrer">
+            Diff on the host
+          </a>
+        </p>
+      )}
       {files.map((p) => (
-        <Hunks key={p} path={p} hunks={hunks[p]} />
+        <Hunks key={p} view={view} path={p} hunks={hunks[p]} />
       ))}
     </>
   );
@@ -158,7 +178,7 @@ function Members({ view, edge, onReveal }: { view: View; edge: SceneEdge; onReve
             </button>
             {m.count > 1 && <span className="muted"> ×{m.count}</span>}
             {m.status && <span className={`muted edge-${m.status}`}> {m.status}</span>}
-            <Where view={view} loc={m.loc} />
+            <Where view={view} loc={m.loc} removed={m.status === "removed"} />
           </li>
         ))}
       </ul>
@@ -246,7 +266,7 @@ export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, onReveal
     body = (
       <>
         <p className="muted">{node.typeKind ? `${node.kind} (${node.typeKind})` : node.kind}</p>
-        {node.status !== "removed" && <Where view={view} loc={node.loc} />}
+        <Where view={view} loc={node.loc} removed={node.status === "removed"} />
         <Change view={view} node={node} />
         <Rows title="Calls and embeds out" rows={c.out} onReveal={onReveal} />
         <Rows title="Called or embedded by" rows={c.in} onReveal={onReveal} />
@@ -265,7 +285,7 @@ export function Panel({ view, id, edge, bundles, hidden, crap, ownTier, onReveal
     const f = imports(view, id);
     body = (
       <>
-        {node && node.status !== "removed" && <Where view={view} loc={node.loc} />}
+        {node && <Where view={view} loc={node.loc} removed={node.status === "removed"} />}
         {node && <Change view={view} node={node} />}
         <p className="muted">
           {s.packages} packages · {s.decls} declarations · {s.unresolved} unresolved calls
diff --git a/web/src/data.ts b/web/src/data.ts
index 7ccb1cf..4df40b6 100644
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -33,7 +33,8 @@ export type Metrics = {
 export type View = {
   schema: string; kind: "project" | "change"; tool: string; head: Ref; base?: Ref; changed?: string[];
   modules: string[]; nodes: ViewNode[]; edges: ViewEdge[]; sources: Record<string, string>;
-  links?: { blob: string; compare?: string };
+  // 14: base, files and nodes only in a Change View (export.DiffLinks).
+  links?: { blob: string; compare?: string; base?: string; files?: Record<string, string>; nodes?: Record<string, string> };
   hunks?: Record<string, Hunk[]>;
   // 06: only when the Policy has rules; 07: or an order or Proposals.
   policy?: { hash: string; levels: string[][]; order?: string[]; proposals?: Proposal[]; budget?: number };
diff --git a/web/src/links.ts b/web/src/links.ts
index bc590f4..69d20f2 100644
--- a/web/src/links.ts
+++ b/web/src/links.ts
@@ -1,11 +1,29 @@
-// Host links: the View's templates filled for one file and line. Only https
-// results are returned, so a crafted template cannot become a script URL.
+// Host links: the View's templates filled for one file and line, and the
+// Change View's places on the host's compare page, which zu computed (14).
+// Only https results are returned, so a crafted View cannot become a script URL.
 import type { View } from "./data";
 
-export function linkFor(links: View["links"], path: string, line: number): string | null {
-  if (!links?.blob) return null;
-  const url = links.blob
-    .replace("{path}", path.split("/").map(encodeURIComponent).join("/"))
-    .replace("{line}", String(line));
-  return url.startsWith("https://") ? url : null;
+type Links = View["links"];
+
+const https = (url: unknown): string | null => (typeof url === "string" && url.startsWith("https://") ? url : null);
+
+// linkFor is the source at head, or at base (14) for what the change removed.
+export function linkFor(links: Links, path: string, line: number, side: "head" | "base" = "head"): string | null {
+  const template = side === "base" ? links?.base : links?.blob;
+  if (!template) return null;
+  return https(
+    template.replace("{path}", path.split("/").map(encodeURIComponent).join("/")).replace("{line}", String(line)),
+  );
+}
+
+const own = (m: Record<string, string> | undefined, key: string) => (m && Object.hasOwn(m, key) ? m[key] : null);
+
+// diffLink is a changed declaration's first changed line on the compare page.
+export function diffLink(links: Links, id: string): string | null {
+  return https(own(links?.nodes, id));
+}
+
+// fileDiffLink is one changed file's diff on the compare page.
+export function fileDiffLink(links: Links, path: string): string | null {
+  return https(own(links?.files, path));
 }
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node accept.mjs` Expected: PASS (56 checks in each engine)

- [ ] **Commit:** `Link a changed declaration to its hunk on the host, and removed code to the base`

## 14b: the served Change View

### Task 6: `zu serve -base ref`

The tests:
- `TestServeBaseSendsTheViewDiffHTMLWrites`: the served `view.json` equals the View `zu diff main -worktree -html` inlines. Head is pushed with `update-ref`. The check runs twice: on the clean tree, where `a.F` links to its hunk on GitHub, and after an edit, where head is dirty and `a.F` links to nothing.
- `TestServeBaseScansTheBaseOnlyWhenItMoves`: counted through the `scanTree` seam, the base is scanned once for a reload, again for a new Policy, and again for a commit, which moves the merge-base when `ref` is `HEAD`. An edit costs no base scan.
- `TestServeBaseWatchPushesTheChange`: a save is pushed as `view 2`, a Change View with the added `a.H`.
- `TestServeBaseBadInvocations`: `-include` with `-base`, an unknown ref, and a directory outside git all exit 3.
- `serve.mjs`: a second `zu serve` with `-base main` on a git copy of the shop, with `feat` checked out. In each engine, the header says "Change View", and a saved file's new function is drawn in place, marked added, with the hash kept.

**Files:**
- Tests: `internal/cli/change_test.go` (new), `internal/cli/html_test.go` (13's `withUI`; Deviation 10), `web/e2e/serve.mjs`
- Code: `internal/cli/change.go` (new), `internal/cli/serve.go`

**Steps:**

- [ ] **Write the failing tests**

```diff
diff --git a/internal/cli/change_test.go b/internal/cli/change_test.go
new file mode 100644
index 0000000..3315725
--- /dev/null
+++ b/internal/cli/change_test.go
@@ -0,0 +1,128 @@
+package cli
+
+import (
+	"context"
+	"path/filepath"
+	"strings"
+	"sync/atomic"
+	"testing"
+
+	"zu/internal/ir"
+	"zu/internal/policy"
+	"zu/internal/scan"
+)
+
+// inlined is the View JSON zu wrote into an HTML page.
+func inlined(t *testing.T, path string) string {
+	t.Helper()
+	html := readFile(t, path)
+	open := `<script id="zu-data" type="application/json">`
+	s := html[strings.Index(html, open)+len(open):]
+	return s[:strings.Index(s, "</script>")]
+}
+
+// runAside is run with its own interrupt context, so a command that ends
+// does not stop the zu serve startServe runs.
+func runAside(args ...string) (int, string, string) {
+	old := interruptContext
+	interruptContext = func() (context.Context, context.CancelFunc) { return context.WithCancel(context.Background()) }
+	defer func() { interruptContext = old }()
+	return run(args...)
+}
+
+// zu serve -base sends the Change View zu diff -worktree -html writes for
+// the same tree, byte for byte: on a clean worktree, with its host links,
+// and after an edit, with none but the base's (14).
+func TestServeBaseSendsTheViewDiffHTMLWrites(t *testing.T) {
+	dir := diffRepo(t)
+	git(t, dir, "remote", "add", "origin", "git@github.com:o/r.git")
+	git(t, dir, "update-ref", "refs/remotes/origin/feat", "HEAD") // pushed and fetched
+	url, _ := startServe(t, dir, "-base", "main", "-poll", "0")
+	out := filepath.Join(t.TempDir(), "change.html")
+	for i, edit := range []string{"", "package a\n\nfunc F() int { return 3 }\n\nfunc G() {}\n\nfunc H() {}\n"} {
+		if edit != "" {
+			writeFile(t, dir, "a/a.go", edit)
+		}
+		served := fetch(t, url+"view.json")
+		if code, _, errOut := runAside("diff", "main", "-worktree", "-html", out); code != ExitOK {
+			t.Fatalf("diff: exit %d: %s", code, errOut)
+		}
+		if want := inlined(t, out); served != want {
+			t.Errorf("round %d: served View differs from zu diff's:\nserved %s\ndiff   %s", i, served, want)
+		}
+		if !strings.Contains(served, `"kind":"change"`) {
+			t.Errorf("round %d: not a Change View: %.200s", i, served)
+		}
+		if linked := strings.Contains(served, `"nodes":{"example.com/m/a.F":"https://github.com/o/r/compare/`); linked != (edit == "") {
+			t.Errorf("round %d: a.F linked to its hunk = %v, want %v", i, linked, edit == "")
+		}
+	}
+	noZu(t, dir)
+}
+
+// The Base is scanned once and kept: again only when the merge-base or the
+// Policy's hash moves (ADR 0004), never on an edit in the worktree.
+func TestServeBaseScansTheBaseOnlyWhenItMoves(t *testing.T) {
+	dir := diffRepo(t)
+	var scans atomic.Int32
+	old := scanTree
+	scanTree = func(ctx context.Context, tree scan.Tree, pol *policy.Policy) (*ir.IR, scan.Stats, error) {
+		scans.Add(1)
+		return old(ctx, tree, pol)
+	}
+	t.Cleanup(func() { scanTree = old })
+	url, _ := startServe(t, dir, "-base", "HEAD", "-poll", "0")
+	step := func(what string, want int32) {
+		t.Helper()
+		fetch(t, url+"view.json")
+		if got := scans.Load(); got != want {
+			t.Errorf("%s: %d base scans, want %d", what, got, want)
+		}
+	}
+	step("a reload", 1)
+	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() int { return 9 }\n\nfunc G() {}\n")
+	step("an edit", 1)
+	writeFile(t, dir, policy.FileName, "levels:\n  - [example.com/m/a]\n  - [example.com/m/b]\n")
+	step("a new Policy", 2)
+	git(t, dir, "add", "-A")
+	git(t, dir, "commit", "-q", "-m", "F is 9")
+	step("a commit, which moves HEAD and the merge-base with it", 3)
+}
+
+// With a watch, a save is pushed as the Change View it makes.
+func TestServeBaseWatchPushesTheChange(t *testing.T) {
+	dir := diffRepo(t)
+	url, _ := startServe(t, dir, "-base", "main", "-poll", "100ms")
+	events := stream(t, url)
+	if e := await(t, events); e != "view 1" {
+		t.Fatalf("on connect: %q", e)
+	}
+	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() int { return 2 }\n\nfunc G() {}\n\nfunc H() {}\n")
+	if e := await(t, events); e != "view 2" {
+		t.Fatalf("after a save: %q", e)
+	}
+	v := latest(t, url)
+	if !strings.Contains(v, `"kind":"change"`) || !strings.Contains(v, `{"id":"example.com/m/a.H","kind":"function"`) ||
+		!strings.Contains(v, `"status":"added"`) {
+		t.Errorf("the pushed View lacks the added H: %.400s", v)
+	}
+}
+
+func TestServeBaseBadInvocations(t *testing.T) {
+	withUI(t)
+	dir := diffRepo(t)
+	notGit := repo(t, small)
+	for _, tc := range []struct {
+		args []string
+		want string
+	}{
+		{[]string{dir, "-base", "main", "-include", "./a"}, "-include does not apply with -base"},
+		{[]string{dir, "-base", "no-such-ref"}, "-base"},
+		{[]string{notGit, "-base", "main"}, "-base"},
+	} {
+		code, out, errOut := run(append([]string{"serve", "-addr", "127.0.0.1:0"}, tc.args...)...)
+		if code != ExitBadInvocation || out != "" || !strings.Contains(errOut, tc.want) {
+			t.Errorf("%v: exit %d, stdout %q, stderr %q; want exit 3 with %q", tc.args, code, out, errOut, tc.want)
+		}
+	}
+}
diff --git a/internal/cli/html_test.go b/internal/cli/html_test.go
index f763598..afad871 100644
--- a/internal/cli/html_test.go
+++ b/internal/cli/html_test.go
@@ -9,10 +9,14 @@ import (
 	"testing"
 )
 
-// withUI points the uiTemplate seam at the export package's fixture template.
+// uiFixture is the export package's fixture template, made absolute before
+// any test changes directory (diffRepo does).
+var uiFixture, _ = filepath.Abs("../export/testdata/template.html")
+
+// withUI points the uiTemplate seam at uiFixture.
 func withUI(t *testing.T) {
 	t.Helper()
-	tmpl, err := os.ReadFile("../export/testdata/template.html")
+	tmpl, err := os.ReadFile(uiFixture)
 	if err != nil {
 		t.Fatal(err)
 	}
diff --git a/web/e2e/serve.mjs b/web/e2e/serve.mjs
index 4d231ad..2ac7019 100644
--- a/web/e2e/serve.mjs
+++ b/web/e2e/serve.mjs
@@ -1,7 +1,7 @@
-// Browser acceptance for zu serve (10 Task 6) and its watch (13). Not part
+// Browser acceptance for zu serve (10 Task 6), its watch (13) and -base (14). Not part
 // of make check: it needs browsers and a bin/zu built with the UI. Run from
 // web/e2e after `make build`: npm run accept-serve
-import { spawn } from "node:child_process";
+import { execFileSync, spawn } from "node:child_process";
 import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
 import { tmpdir } from "node:os";
 import { join } from "node:path";
@@ -10,20 +10,33 @@ import { chromium, firefox, webkit } from "playwright-core";
 const here = new URL(".", import.meta.url).pathname;
 const dir = mkdtempSync(join(tmpdir(), "zu-serve-"));
 cpSync(join(here, "../../internal/scan/testdata/shop"), dir, { recursive: true });
-const server = spawn(join(here, "../../bin/zu"), ["serve", dir, "-addr", "127.0.0.1:0", "-include", "./internal/store"], {
-  stdio: ["ignore", "pipe", "pipe"],
-});
+// 14: the shop again, committed on main with feat checked out, for -base.
+const changeDir = mkdtempSync(join(tmpdir(), "zu-serve-base-"));
+cpSync(join(here, "../../internal/scan/testdata/shop"), changeDir, { recursive: true });
+const git = (...a) => execFileSync("git", ["-c", "user.name=zu", "-c", "user.email=zu@example.com", ...a], { cwd: changeDir });
+git("init", "-q", "-b", "main");
+git("add", "-A");
+git("commit", "-q", "-m", "base");
+git("checkout", "-q", "-b", "feat");
+const servers = [];
 // Stopped and removed however the run ends.
 process.on("exit", () => {
-  server.kill();
+  for (const s of servers) s.kill();
   rmSync(dir, { recursive: true, force: true });
+  rmSync(changeDir, { recursive: true, force: true });
 });
 let log = "";
-server.stderr.on("data", (d) => (log += d));
-const url = await new Promise((ok, fail) => {
-  server.stdout.once("data", (d) => ok(String(d).trim()));
-  server.once("exit", (code) => fail(new Error(`zu serve exited ${code}: ${log}`)));
-});
+async function start(...args) {
+  const s = spawn(join(here, "../../bin/zu"), ["serve", ...args, "-addr", "127.0.0.1:0"], { stdio: ["ignore", "pipe", "pipe"] });
+  servers.push(s);
+  s.stderr.on("data", (d) => (log += d));
+  return new Promise((ok, fail) => {
+    s.stdout.once("data", (d) => ok(String(d).trim()));
+    s.once("exit", (code) => fail(new Error(`zu serve exited ${code}: ${log}`)));
+  });
+}
+const url = await start(dir, "-include", "./internal/store");
+const changeURL = await start(changeDir, "-base", "main");
 
 const drawn = (p) => p.locator(".react-flow__node").first().waitFor({ timeout: 30000 });
 const settle = (p) => p.waitForTimeout(900);
@@ -115,6 +128,26 @@ async function run(name, b) {
   const seventh = await ctx.newPage();
   out.tabs = await seventh.goto(url + view, { timeout: 15000 }).then(() => drawn(seventh)).then(() => true, () => false);
   await ctx.close();
+  // 14: with -base the page draws the Change View against main, and a save
+  // is drawn as a change, in place.
+  p = await b.newPage();
+  p.on("pageerror", (e) => errors.push("pageerror " + e.message.slice(0, 120)));
+  const storePkg = "example.com/shop/internal/store";
+  await p.goto(changeURL + `#f=${storePkg}`);
+  await p.waitForSelector(".app", { timeout: 30000 });
+  await settle(p);
+  const changeHash = await hash();
+  const grown = `${storePkg}.Change${name}`;
+  writeFileSync(join(changeDir, "internal", "store", `change${name}.go`), `package store\n\nfunc Change${name}() {}\n`);
+  const shown = await node(grown);
+  await settle(p);
+  out.change = [
+    await p.locator(".header").innerText().then((t) => t.startsWith("Change View")),
+    shown,
+    await p.locator(`.react-flow__node[data-id="${grown}"] .node`).getAttribute("class").then((c) => c.split(" ").includes("st-added"), () => false),
+    (await hash()) === changeHash,
+  ];
+  await p.close();
   out.errors = errors;
   return out;
 }
@@ -128,6 +161,7 @@ const want = {
   broken: [true, 1, true],
   fixed: [true, 0],
   tabs: true,
+  change: [true, true, true, true],
   errors: [],
 };
 
```

- [ ] **Run:** `go test ./internal/cli/ -run ServeBase` Expected: FAIL (`flag provided but not defined: -base`)

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node serve.mjs` Expected: FAIL (`zu serve exited 3`: the `-base` server's flag is not defined)

- [ ] **Implement**

```diff
diff --git a/internal/cli/change.go b/internal/cli/change.go
new file mode 100644
index 0000000..5681e05
--- /dev/null
+++ b/internal/cli/change.go
@@ -0,0 +1,59 @@
+package cli
+
+import (
+	"context"
+	"errors"
+	"fmt"
+
+	"zu/internal/diff"
+	"zu/internal/export"
+	"zu/internal/ir"
+	"zu/internal/policy"
+	"zu/internal/scan"
+)
+
+// viewOf is the View a session serves for doc, head's IR, sorted: the
+// Project View or, with -base (14), the Change View of doc against the
+// merge-base of the base ref and HEAD, the one zu diff -worktree -html writes.
+// The merge-base is found again on each rescan; its IR is scanned again
+// only when the merge-base or head's Policy hash moved (ADR 0004).
+func (s *session) viewOf(ctx context.Context, src *source, doc *ir.IR, pol *policy.Policy, ms scan.Measures) (*export.View, error) {
+	if s.base == "" {
+		return projectView(ctx, "serve", src, doc, pol, ms, s.o, s.stderr)
+	}
+	if doc.Ref.Commit == "" {
+		return nil, errors.New("-base: HEAD has no commit yet")
+	}
+	_, baseCommit, err := gitResolve(ctx, s.dir, s.base)
+	if err != nil {
+		return nil, err
+	}
+	mb, err := gitMergeBase(ctx, s.dir, baseCommit, doc.Ref.Commit)
+	if err != nil {
+		return nil, err
+	}
+	tree, err := openCommit(ctx, s.dir, mb) // for the base side of the hunks
+	if err != nil {
+		return nil, err
+	}
+	defer tree.Close()
+	if s.baseDoc == nil || s.baseDoc.Ref.Commit != mb || s.baseDoc.PolicyHash != pol.Hash() {
+		s.baseDoc = nil
+		d, _, err := scanTree(ctx, tree, pol)
+		if treeErr := tree.Err(); treeErr != nil {
+			err = treeErr
+		}
+		if err != nil {
+			return nil, fmt.Errorf("base %s: %w", mb[:min(12, len(mb))], err)
+		}
+		d.Ref = ir.Ref{Commit: mb}
+		s.baseDoc = d
+	}
+	delta := diff.Compare(s.baseDoc, doc)
+	sum := diff.SummarizeDelta(s.baseDoc, doc, delta)
+	if pol.Rules() {
+		sum.Violations = diff.Violations(pol.Check(s.baseDoc), pol.Check(doc))
+	}
+	c := changeSides{top: s.dir, base: s.baseDoc, head: doc, baseTree: tree, headTree: src.tree, pol: pol, measures: ms, delta: delta}
+	return changeView(ctx, "serve", c, sum, s.o, s.stderr)
+}
diff --git a/internal/cli/serve.go b/internal/cli/serve.go
index f9ae039..f4f433a 100644
--- a/internal/cli/serve.go
+++ b/internal/cli/serve.go
@@ -22,10 +22,12 @@ import (
 )
 
 // runServe implements `zu serve [dir] [-addr host:port] [-include pattern]…
-// [-link-template url] [-coverprofile file]` (10): the Project View of the
-// working tree, on a loopback address, until interrupted. Every load of the
-// page rescans the tree, parsing only the files whose content changed.
-// Flags may come before or after dir. It writes nothing to disk.
+// [-link-template url] [-coverprofile file] [-poll interval] [-base ref]`
+// (10): the Project View of the working tree, on a loopback address, until
+// interrupted, or with -base (14) the Change View zu diff ref -worktree
+// -html writes. Every load of the page rescans the tree, parsing only the
+// files whose content changed. Flags may come before or after dir. It
+// writes nothing to disk.
 func runServe(args []string, stdout, stderr io.Writer) int {
 	fs := flag.NewFlagSet("zu serve", flag.ContinueOnError)
 	fs.SetOutput(stderr)
@@ -35,6 +37,7 @@ func runServe(args []string, stdout, stderr io.Writer) int {
 	fs.StringVar(&o.linkTmpl, "link-template", "", "source link `url` with {commit} {path} {line}; overrides origin detection")
 	fs.StringVar(&o.cover, "coverprofile", "", "colour packages by CRAP from `file`, written by go test -coverprofile over this tree; read once, at start")
 	poll := fs.Duration("poll", time.Second, "look for changes every `interval` and redraw the open page; 0: never")
+	base := fs.String("base", "", "show the Change View of the working tree against the merge-base of `ref` and HEAD, as zu diff ref -worktree -html")
 	dir, err := parseWithDir(fs, args)
 	if err != nil {
 		if !errors.Is(err, flag.ErrHelp) {
@@ -49,6 +52,18 @@ func runServe(args []string, stdout, stderr io.Writer) int {
 	if *poll < 0 || *poll > 0 && *poll < minPoll {
 		return bad(fmt.Errorf("-poll %v: want 0 (off) or at least %v", *poll, minPoll))
 	}
+	ctx, stop := interruptContext()
+	defer stop()
+	if *base != "" {
+		if len(o.include) > 0 {
+			return bad(errors.New("-include does not apply with -base: the change decides what the page inlines"))
+		}
+		top, _, err := gitResolve(ctx, dir, *base)
+		if err != nil {
+			return bad(fmt.Errorf("-base: %w", err))
+		}
+		dir = top // the working tree zu diff -worktree reads
+	}
 	if err := o.load(); err != nil {
 		return bad(err)
 	}
@@ -65,9 +80,7 @@ func runServe(args []string, stdout, stderr io.Writer) int {
 		fmt.Fprintf(stderr, "zu serve: %s is in use; serving on a free port\n", serve.DefaultAddr)
 	}
 
-	ctx, stop := interruptContext()
-	defer stop()
-	s := &session{dir: dir, o: &o, cache: scan.NewCache(), stderr: stderr}
+	s := &session{dir: dir, base: *base, o: &o, cache: scan.NewCache(), stderr: stderr}
 	first, _, err := s.view(ctx)
 	if err != nil { // a tree zu cannot scan fails here, not in the page
 		return bad(err)
@@ -120,6 +133,10 @@ type session struct {
 	o      *htmlOptions
 	cache  *scan.Cache
 	stderr io.Writer
+	// base is -base's ref (14); baseDoc, guarded by mu, is the IR of the
+	// merge-base last scanned, under the Policy whose hash it carries.
+	base    string
+	baseDoc *ir.IR
 	// scanning, when set, runs while a rescan holds mu (a test seam).
 	scanning func()
 
@@ -175,7 +192,7 @@ func (s *session) view(ctx context.Context) ([]byte, uint64, error) {
 	return data, gen, nil
 }
 
-// build scans src under its Policy and returns the Project View JSON and the
+// build scans src under its Policy and returns the View JSON (viewOf) and the
 // IR it came from. With trust the Cache trusts each file's Stamp (13's
 // watch). HEAD is read beside the scan, off its path (10
 // rescan-profile, fix 2). what prefixes the stderr line.
@@ -205,7 +222,7 @@ func (s *session) build(ctx context.Context, src *source, trust bool, what strin
 		return nil, nil, err
 	}
 	ir.Sort(doc) // as ir.Encode does before zu scan -html builds its View
-	v, err := projectView(ctx, "serve", src, doc, pol, stats.Measures, s.o, s.stderr)
+	v, err := s.viewOf(ctx, src, doc, pol, stats.Measures)
 	if err != nil {
 		return nil, nil, err
 	}
```

- [ ] **Run:** `go test -race ./... && go vet ./... && golangci-lint run ./...` Expected: PASS (read the lint output)

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node serve.mjs` Expected: PASS (10 checks in each engine)

- [ ] **Commit:** `Serve the Change View against a base ref with zu serve -base`

## Acceptance

### Task 7: Acceptance

**Files:**
- Code: `docx/features/14-review-links/measure.mjs`
- Record: `docx/features/14-review-links/acceptance.md` (written by hand)

**Steps:**

- [ ] **Add the measurement script**

```diff
diff --git a/docx/features/14-review-links/measure.mjs b/docx/features/14-review-links/measure.mjs
new file mode 100644
index 0000000..01e646f
--- /dev/null
+++ b/docx/features/14-review-links/measure.mjs
@@ -0,0 +1,122 @@
+// Measures zu serve -base for 14's acceptance on a writable copy of a Go
+// tree, as 13's measure.mjs measures the Project View: start (spawn → URL,
+// which scans head and the merge-base), first drawn, write → drawn in
+// chromium, the watch's rescans and the resident memory at the end. Each
+// round renames the function in one file of a package the page shows.
+// MODE dirty leaves each write uncommitted: head is dirty, so no host diff
+// is read. MODE clean commits each write and points a remote-tracking ref
+// at it, as a push and fetch would, so head is clean and on the "host":
+// git diff runs and DiffLinks places each link, and a round also times
+// write → a view.json whose Zz node has its compare-page link. The copy's
+// own history takes those commits; use a copy you delete after.
+// Usage, from the repo root after `make build` and `npm ci` in web/e2e:
+//   node docx/features/14-review-links/measure.mjs TREE PKGDIR BASE MODE [POLL] [ROUNDS]
+// e.g. TREE a cp -cRp copy of kubernetes, PKGDIR pkg/util/env, BASE the
+// full sha of HEAD~50 (a relative ref would move with each commit, and
+// the base would be rescanned every round), MODE clean.
+import { execFileSync, spawn } from "node:child_process";
+import { readFileSync, rmSync, writeFileSync } from "node:fs";
+import { join } from "node:path";
+import { chromium } from "../../../web/e2e/node_modules/playwright-core/index.mjs";
+
+const [tree, rel, base, mode, poll = "1s", rounds = "11"] = process.argv.slice(2);
+if (!/^[0-9a-f]{40}$/.test(base ?? "") || !["dirty", "clean"].includes(mode)) {
+  console.error("usage: measure.mjs TREE PKGDIR BASE-SHA dirty|clean [POLL] [ROUNDS]");
+  process.exit(3);
+}
+const bin = new URL("../../../bin/zu", import.meta.url).pathname;
+const file = join(tree, rel, "zzwatch.go");
+const name = rel.split("/").at(-1);
+const mod = readFileSync(join(tree, "go.mod"), "utf8").match(/^module\s+(\S+)/m)[1];
+const pkg = `${mod}/${rel}`;
+const git = (...a) => execFileSync("git", ["-C", tree, "-c", "user.name=zu", "-c", "user.email=zu@example.com", ...a]);
+let zu;
+let log = "";
+// Stopped however the run ends: finished, failed, timed out or interrupted.
+process.on("exit", () => {
+  zu?.kill();
+  if (mode === "dirty") rmSync(file, { force: true });
+});
+for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));
+const fail = (why) => {
+  console.error(`measure: ${why}\n${log.slice(-2000)}`);
+  process.exit(2);
+};
+setTimeout(() => fail("timed out after 15 min"), 15 * 60 * 1000).unref();
+const within = (ms, what, p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what}: no answer in ${ms} ms`)), ms))]);
+
+function save(i) {
+  writeFileSync(file, `package ${name}\n\nfunc Zz${i}() {}\n`);
+  if (mode === "clean") {
+    git("add", "--", join(rel, "zzwatch.go"));
+    git("commit", "-q", "--no-verify", "-m", `zz ${i}`);
+    git("update-ref", "refs/remotes/origin/zu-measure", "HEAD"); // "pushed and fetched"
+  }
+}
+
+try {
+  save(0);
+  const t0 = Date.now();
+  zu = spawn(bin, ["serve", tree, "-addr", "127.0.0.1:0", "-base", base, "-poll", poll], { stdio: ["ignore", "pipe", "pipe"] });
+  zu.stderr.on("data", (d) => (log += d));
+  const url = await within(
+    120000,
+    "zu serve start",
+    new Promise((ok, no) => {
+      zu.stdout.once("data", (d) => ok(String(d).trim()));
+      zu.once("exit", (code) => no(new Error(`zu serve exited ${code}`)));
+    }),
+  );
+  const started = Date.now() - t0;
+  // ?latest is the watch's last View, read without a scan of its own.
+  const view = async () => (await within(60000, "view.json", fetch(url + "view.json?latest"))).text();
+  const linked = (json, i) => JSON.parse(json).links?.nodes?.[`${pkg}.Zz${i}`] !== undefined;
+  const b = await chromium.launch();
+  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
+  const t1 = Date.now();
+  await p.goto(`${url}#f=${pkg}`);
+  await p.locator(`.react-flow__node[data-id="${pkg}.Zz0"]`).waitFor({ timeout: 120000 });
+  const drawn = Date.now() - t1;
+  const first = await view();
+  if (mode === "clean" && !linked(first, 0)) fail("clean head, yet Zz0 has no host link");
+  await p.waitForTimeout(3000);
+  const times = [];
+  const linkTimes = [];
+  for (let i = 1; i <= Number(rounds); i++) {
+    await p.evaluate((sel) => {
+      window.zuSeen = new Promise((ok) => {
+        const o = new MutationObserver(() => {
+          if (document.querySelector(sel)) ok(Date.now(), o.disconnect());
+        });
+        o.observe(document.body, { subtree: true, childList: true });
+      });
+    }, `.react-flow__node[data-id="${pkg}.Zz${i}"]`);
+    const w = Date.now();
+    save(i);
+    times.push((await within(60000, `round ${i} drawn`, p.evaluate(() => window.zuSeen))) - w);
+    if (mode === "clean") {
+      for (;;) {
+        if (linked(await view(), i)) break;
+        if (Date.now() - w > 60000) fail(`round ${i}: no host link for Zz${i} in 60 s`);
+        await p.waitForTimeout(250);
+      }
+      linkTimes.push(Date.now() - w);
+    }
+    await p.waitForTimeout(1300 + 137 * i); // vary the write's phase against the poll
+  }
+  await b.close();
+  const rss = Number(execFileSync("ps", ["-o", "rss=", "-p", String(zu.pid)], { encoding: "utf8" }).trim()) / 1024;
+  const stats = (xs) => {
+    const s = [...xs].sort((x, y) => x - y);
+    return `${xs.join(" ")} | min ${s[0]} median ${s[s.length >> 1]} max ${s.at(-1)}`;
+  };
+  console.log(`${mode}: start ${started} ms (URL printed) · first drawn ${drawn} ms · view.json ${(first.length / 1e6).toFixed(1)} MB · RSS ${rss.toFixed(0)} MB`);
+  console.log(`write → drawn ms: ${stats(times)}`);
+  if (mode === "clean") console.log(`write → view.json links it ms: ${stats(linkTimes)}`);
+  const scans = [...log.matchAll(/watch: scanned in ([\d.]+)(ms|s):/g)].map((m) => Math.round(Number(m[1]) * (m[2] === "s" ? 1000 : 1)));
+  console.log(`watch rescans ms: min ${Math.min(...scans)} max ${Math.max(...scans)} (${scans.length})`);
+  console.log(process.env.ZU_LOG ? log : log.split("\n")[0]);
+  process.exit(0);
+} catch (e) {
+  fail(e.message);
+}
```

- [ ] **Run:** `make check` Expected: PASS (read the lint output)

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (56 checks in each engine)

- [ ] **Run:** `cd web/e2e && node serve.mjs` Expected: PASS (10 checks in each engine)

- [ ] **Measure** (by hand; not a replay step). After `make build`:
  1. Make a writable copy of the Test Corpus's kubernetes with `cp -cRp` (APFS clonefile) into `$K`. Never clone it, and never write to `.zu/corpus/` itself.
  2. Fake a push of its HEAD: `git -C "$K" update-ref refs/remotes/origin/master HEAD`.
  3. Take the base as a full sha: `B=$(git -C "$K" rev-parse HEAD~50)`. A relative `-base HEAD~50` would move with each commit the `clean` mode makes, and the base would be rescanned every round.
  4. Run `node docx/features/14-review-links/measure.mjs "$K" pkg/util/env "$B" clean` twice, then `… dirty` twice. `clean` commits into the copy, so use the copy only.
  5. Check the budget (Deviation 6, as ruled), and record in `acceptance.md`: start, first drawn, `view.json`, the rescans, save → drawn (the worst case too), save → linked (`clean`) and RSS.
  6. Delete the copy.

- [ ] **The user's check** (by hand). B6 is recorded as met only if steps 1 and 2 pass (ruling b, M4):
  1. **GitHub, past the first four files.** On a branch of a GitHub repository with at least five changed Go files, push the commits past `main` and fetch, so `origin/<branch>` holds them. Run `zu diff main -html /tmp/c.html`. On the compare page, find a changed file listed after the first four. In `/tmp/c.html`, select a modified function in that file and click "Diff on the host". GitHub loads the compare page progressively; the page must load that file and scroll to the function's changed line. Record the URL and what the page showed.
  2. **GitLab.** Do the same on a GitLab repository, with any changed function. Its compare page must scroll to the line. Record the URL and what the page showed.
  3. Select a removed declaration and click "View at". The base commit's file opens at it.
  4. Run `zu serve -base main`, open a changed package and save an edit. It is redrawn as a change, in place.

- [ ] **Commit:** `Record review links' acceptance`

---

## Risks

- **B6 is not met until the user's check passes (ruling b, M4).** The anchors were checked in the hosts' HTML, and 14's tests prove what zu writes. No test clicks a link on a live host, and zu cannot do so offline. Until Task 7's steps 1 and 2 pass, B6 stays open.
- **Line anchors depend on the hosts' pages, which zu cannot check offline.** GitHub and GitLab were checked live on 2026-09-25, but either may change its ids without notice. GitHub switched hashes once, in 2020. When a line anchor stops resolving, the page opens at the top of the compare page, and the file anchor may still work. The rules live in one table (`hosts`), with their sources.
  - **GitLab:** the `line_` ids and `?file_path=` were seen in live HTML, but the scroll on load was not exercised in a browser (Task 7 step 2 does). A self-managed GitLab on the legacy merge-request app also parses `line_` hashes (source), but that was not tested live, and self-managed hosts are out of scope (N7).
- **GitHub loads a large compare progressively, and caps it.** The first fragment carries the first four files. On a large change, an anchor may name a diff that GitHub has not loaded yet, or will not render. Task 7 step 1 tests a file past the first four for this reason. If the page does not scroll, it stays at the top, and the file can be reached with GitHub's own file filter. This does not happen on a merge request's own page, which zu cannot link (Deviation 1).
- **GitHub collapses deleted files and generated files**, so their declarations link to the file (Deviation 2). Large diffs that GitHub collapses ("Load diff") have the same limit: a line anchor inside one may not scroll until the diff is expanded.
- **git's diff and the host's may still differ.** v2 takes lines from `git diff` with git's defaults pinned, which is what both hosts run. A host could still pair lines differently on an ambiguous edit, or decide a rename differently on a file near the 50% similarity threshold. Then a line anchor may not exist on the page, which opens at the file or the top.
- **An inferred span can be too long** (Deviation 3): for types and for removed code only.
- **Unpushed commits get no host links (M3).** This is by design, but it can surprise: after a commit, `zu serve -base` drops its compare links until the commit is pushed and fetched. `zu diff` says why on stderr, and `zu serve` does not.
- **Neither the base ref nor the remote-tracking refs are polled (ruling c).** 13's watch polls git's `HEAD`, `index`, `packed-refs` and the ref `HEAD` names. A `git fetch` that moves `origin/main`, or a `git push` that moves `origin/<branch>`, updates a loose ref the watch does not read. It shows at the next rescan (a save or a reload), not by itself.
- **A relative `-base` rescans the base on each commit** (N6). `-base HEAD~50` names a different commit after every commit, so the merge-base moves, and the base is scanned again: 2.4 s on kubernetes. A branch name such as `main` moves only when it is updated. `measure.mjs` takes a full sha for this reason.
- **Every save pushes the whole Change View.** On kubernetes with 52 packages changed, that is 15.2 MB per push, and `-include` cannot trim it. A far bigger change grows the View, the rescan's Change View work and the page's layout time with it.
- **Memory:** `zu serve -base` holds two IRs, head's Cache and the View: 726–968 MB RSS at the end of v2's runs on kubernetes, against 821 MB for `zu diff HEAD~50`, which holds no Cache but builds both scans in one run.
- **The tests time real polls** (as 13). `TestServeBaseWatchPushesTheChange` polls every 100 ms under `-race`, with 13's `await` deadline.
- **`serve.mjs` in webkit is flaky, before and after 14.** In scratch, 13's own `serve.mjs` from `main` failed 2 runs of 5 in webkit, and 14's failed 2 of 4. Each failure was one `pageerror ResizeObserver loop completed with undelivered notifications.`, and chromium and firefox always passed. The flake belongs to 13's test; 14 does not change it. A rerun passes.
- **`serve.mjs` makes a git repository** in a temporary copy of the shop (`git init`, one commit, a branch) with its own identity (`-c user.name`), and removes it on exit. Each engine writes its own file names.

---

## Notes

- **Task count: 7**, within Quick mode's 10 and the lead's 9.
- **TDD:** every task writes its failing tests first, and each red step was seen red for the reason given, in the replay.
  - Tasks 1–4 are red on a compile failure: the tests name what the task adds.
  - Task 5's browser check is red against Task 4, because the panel has no diff links and a removed declaration has no "View at".
  - Task 6's are red because `-base` is not a flag yet.
- **Determinism:** `DiffLinks` iterates over nodes, paths and git's files, but it writes to maps, and JSON sorts map keys. So the View's bytes are stable, and the served View equals `zu diff`'s byte for byte (Task 6's test). The IR is untouched.
- **The model never authors the graph:** 14 adds links to nodes the parser made. It makes no node or edge. Git's diff places links only; it adds nothing to the graph.
- **Security:**
  - Every link the page renders is `https:` (`links.ts`), from maps read with `Object.hasOwn`.
  - `zu serve -base` adds no route. It keeps 10's loopback bind, Host check and `Sec-Fetch-Site`, and writes nothing to disk (`noZu` in Task 6's test).
  - Git remains the only process zu runs. 14 adds `diff` (pinned options, `--no-ext-diff`, `--no-textconv`, so no repository-configured program runs) and `for-each-ref`, next to `rev-parse`, `merge-base`, `ls-tree` and `cat-file`. Every call goes through `gitref`'s `safeArgs`.
  - Commits are refused when they start with `-`, and `ref` is passed to git as an argument, never through a shell.
  - SHA-1 here names a GitLab anchor. It is not a security use.

## Replay record

Replayed 2026-09-25 with `replay.py` (`python3 -u`) on a fresh `git archive` of `main` at 4195876, which contains all of 13. `node_modules` in `web` and `web/e2e` were APFS clone copies of a full install.

19 steps ran: 18 were as expected, and 1 failed on a flake that predates 14. The script exited 1 for that step.

| Task | Step | Result |
|---|---|---|
| 1 | red | exit 1: a compile failure, `undefined: change`; the compiler stops at 10 errors, all in `anchors_test.go` |
| 1 | green | exit 0 (`-race`, vet); golangci-lint: no issues |
| 2 | red | exit 1: a compile failure, `undefined: Diff`, `FileDiff`, `Hunk`, `OnRemote` (10 errors) |
| 2 | green | exit 0 (`-race`); golangci-lint: no issues |
| 3 | red | exit 1: a compile failure, `undefined: SummarizeDelta` |
| 3 | green | exit 0 (`-race ./...`, vet) |
| 4 | red | exit 1: a compile failure, `undefined: gitDiff` |
| 4 | green | exit 0 (`-race ./...`, vet); golangci-lint: no issues |
| 5 | red, browser | exit 1: 55/56 in each engine, no diff links |
| 5 | red, unit | exit 1: 3 of 6 fail, `diffLink is not a function` |
| 5 | green | vitest and typecheck exit 0; `accept.mjs` exit 0 |
| 6 | red | exit 1: `flag provided but not defined: -base` |
| 6 | red, browser | exit 1: `zu serve exited 3` for the `-base` server |
| 6 | green | exit 0 (`-race ./...`, vet, golangci-lint: no issues) |
| 6 | green, browser | **exit 1**: chromium 10/10, firefox 10/10, webkit 9/10 on `pageerror ResizeObserver loop completed with undelivered notifications.` (**Risks**: a flake 13's own `serve.mjs` has too) |
| 7 | `make check` | exit 0 |
| 7 | `accept.mjs` | exit 0: 56/56 checks in each of chromium, firefox and webkit |
| 7 | `serve.mjs` | exit 0: 10/10 checks in each engine. Task 7 adds only `measure.mjs`, so this is the same code and binary as Task 6's green browser step. |

**The flake.** `serve.mjs` on the replayed tree was run twice more by hand. It failed once in webkit, the same way, and passed once in all three engines. In scratch, 13's own `serve.mjs` from `main` failed 2 runs of 5 in webkit with the same error. So the flake belongs to 13's test, and 14 does not cause it or change it. Filtering that one benign notice in `serve.mjs` is a question for the lead; 14 does not do it.

The replay prints only each step's last line. The red reasons in the table were read from the same steps, run by hand in scratch on the tagged commits the diffs were cut from.

On the replayed tree:
- `go test ./...`: 305 top-level tests (336 with subtests) in 13 packages, against 289 (320) on `main`: 14 adds 16 tests.
- vitest: 249 tests in 27 files;
- golangci-lint: no issues;
- `accept.mjs`: green in all three engines;
- `serve.mjs`: green in all three engines, apart from the webkit flake above.

`diff -rq` of the replayed tree against the scratch branch the diffs were cut from shows no differences outside `node_modules`, `bin`, `dist`, `.git` and `docx`. `patch` left no `.orig` or `.rej` file. `replay.py` is byte-identical to 13's.

The kubernetes measurements were taken in scratch with the same code (**Measurements**). They are not replay steps. The kubernetes copy, the scratch trees and the replays were deleted afterwards.
