# 14 · Review links — acceptance

Measured 2026-09-25 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0,
git 2.39.1. `bin/zu` was built by `make build` from Task 6's tree (Task 7 adds only
`measure.mjs`).

**Commits:**

| Task | Commit | What it did |
|---|---|---|
| 1 | `a2221a9` | `internal/export` anchors: `DiffLinks`, `CompareURL`, `BaseBlob` |
| 2 | `589b42a` | `gitref.Diff` (git's own `diff -M`) and `gitref.OnRemote` |
| 3 | `d71890c` | `SummarizeDelta`: one `Compare` per `zu diff` |
| 4 | `dd9f902` | `zu diff -html` writes the links, for pushed commits only |
| 5 | `4b4a4b1` | the panel links to the hunk, and removed code to the base |
| 6 | `dadad41` | `zu serve -base`, and amendment A1 |

Each task's failing step failed before its code went in, and its passing step passed
after. Task 6's failing `serve.mjs` step failed on `zu serve exited 3` (no `-base`
flag yet).

## Gates

- **`make check`:** exit 0. `golangci-lint run ./...`: no issues. vitest: 249 tests.
- **`node accept.mjs`:** 56/56 in chromium, firefox and webkit.
  - In one of two runs, Firefox crashed on a reload and the suite reran it once. That
    is 08's recorded Firefox flake. The rerun passed 56/56.
- **`node serve.mjs`:** 10/10 in each engine, with A1's filter in place.

## Red for the right reason

Steering asked for proof of two failures. Each proof breaks `internal/cli/html.go`,
runs `go test ./internal/cli -run DiffHTML`, and then restores the file from a backup.
Each time, `cmp` showed the restored file identical to the backup.

- **M1: links key on the new path.** In the first proof, `hostFiles` keys each file on
  `OldPath`.
  - `TestDiffHTMLMovedPackageLinksTheNewPath` fails, and no other test does.
  - The page lacks the `b/b.go` and `c/a.go` file links, and the `c.F` and `c.G` links
    (`…R5`).
  - The test reports "a link names the old path a/a.go".
- **M3: an unpushed head gets no host links.** In the second proof, `onHost` treats
  every commit as on the remote (`|| true`). `TestDiffHTMLUnpushedHeadLinksOnlyTheBase`
  fails, and no other test does:
  - "an unpushed head must link only to the base commit";
  - stderr lacks the note;
  - "with nothing on the remote, nothing links to the host".

**`serve -base` is byte-identical to `zu diff ref -worktree -html`:**
`TestServeBaseSendsTheViewDiffHTMLWrites` compares the two on the same tree, byte for
byte, and passes.

## Amendment A1

- `serve.mjs` ignores a `pageerror` only when its message equals
  `ResizeObserver loop completed with undelivered notifications.`. The three
  `pageerror` handlers share one `benign` check.
- `accept.mjs` is unchanged.
- 13's acceptance.md records the flake.

## kubernetes (`measure.mjs`)

- **The tree:** a `cp -cRp` copy of `.zu/corpus/kubernetes@v1.37.0` in the scratchpad.
  - A faked push: `update-ref refs/remotes/origin/master HEAD`.
  - The base: `HEAD~50`, `24a5b063a5f2b8d6c2d1d9279758109a7b75d4ad`.
  - Afterwards the copy was deleted. The corpus's `git status` was clean, and it has no
    remote-tracking refs.
- **The runs:** 11 rounds each, in chromium.
  - The machine was shared with other sessions, at a load average of 5.2–5.7 (8 cores).
  - After clean 1 missed a gate, `clean` was run twice more, and every run is shown.

| | dirty 1 | dirty 2 | clean 1 | clean 2 | clean 3 | clean 4 |
|---|---|---|---|---|---|---|
| start (spawn → URL) | 6.20 s | 6.61 s | 6.81 s | 6.68 s | 6.43 s | 6.00 s |
| first drawn | 2.36 s | 2.37 s | 2.86 s | 4.89 s | 2.36 s | 2.36 s |
| `view.json` | 15.2 MB | 15.2 MB | 15.3 MB | 15.3 MB | 15.3 MB | 15.3 MB |
| watch rescans (11) | 1.23–1.42 s | 1.28–1.51 s | 1.45–**2.30** s | 1.38–1.88 s | 1.33–1.65 s | 1.38–1.71 s |
| save → drawn: min / **median** / max | 1.65 / **2.06** / 2.79 | 1.76 / **2.24** / 2.75 | 2.42 / **2.86** / 3.45 | 2.25 / **2.72** / 3.15 | 2.20 / **2.66** / 3.12 | 2.19 / **2.64** / 3.23 |
| save → `view.json` links it: median / max | — | — | 2.93 / 3.52 | 2.82 / 3.22 | 2.72 / 3.18 | 2.70 / 3.33 |
| RSS at the end | 873 MB | 818 MB | 347 MB | 722 MB | 787 MB | 713 MB |

**Against the budget (Deviation 6):**

| | budget | measured | |
|---|---|---|---|
| start | at most 10 s | 6.0–6.8 s | met |
| every watch rescan | under 2 s | at most 1.88 s in five runs; **2.30 s once**, in clean 1 | met in 5 of 6 runs |
| median save → drawn | at most 3 s | 2.06–2.24 s dirty; 2.64–2.86 s clean | met |
| worst save → drawn (reported, not gated) | — | 3.45 s | — |

**Against the plan's Measurements:**
- Every figure here is slower. Clean medians are 2.64–2.86 s here and 2.39–2.45 s in the
  plan. Rescans reach 1.88 s here and 1.45 s in the plan.
- Both sets ran on the same machine and binary code. These runs shared it with other
  sessions, and I did not measure on an idle machine.
- **The one rescan over 2 s** came in the first run on a freshly copied tree. Whether it
  came from the shared machine or from zu is not proven. Whether it counts against the
  gate is steering's call.
- **The committed and pushed median** leaves 0.14–0.36 s of headroom under 3 s on a
  loaded machine.

**After the first ruling: two `clean` runs on a second fresh copy.** This was a new
`cp -cRp` copy with the same faked push and base. The copy was deleted afterwards, and
the corpus's `git status` was clean.

| | fresh 1 | fresh 2 |
|---|---|---|
| load average (1 / 5 / 15 min) at the start | 3.89 / 4.90 / 4.97 | 7.90 / 5.69 / 5.25 |
| watch rescans (11) | 1.54–**2.68** s | 1.29–1.95 s |
| save → drawn: median / worst | **2.95** / 3.64 s | 2.71 / 3.11 s |
| save → `view.json` links it: median / worst | 3.01 / 3.72 s | 2.81 / 3.18 s |

- The rescan gate was missed again on the first run of a freshly copied tree, and not on
  the run after it. Both fresh first runs missed: 2.30 s, then 2.68 s.
- Fresh 1's median came within 0.05 s of the 3 s gate.
- Steering records the rescan gate as not met on a cold tree. The remedy is feature 16.

## Doc amendments

Applied as the plan's exact text:
- **decisions.md:**
  - the Structural Summary bullet: "Links (B6) are the HTML Export's (14)";
  - the Links (B6) bullet, including when B6 counts as met;
  - Serve (10): `[-base ref]` and the **Change View (14)** text.
- **requirements-draft.md:** the "Change to redraw in `zu serve -base` (14)" budget
  bullet. It quotes the plan's figures, which the runs above do not all match: this
  record's rescans reach 2.30 s, and its clean medians are 2.64–2.86 s.
- **04's plan:** Deviation 3's sentence.
- **13's plan:** Out of scope.
- **glossary.md:** "Change View" gains the sentence about `zu diff -html` and
  `zu serve -base`.

**Not applied: the plan's CLAUDE.md layout lines.** They wait on the user's own word,
as 13's did.

## 14b: diff links that land

**zu's rehearsal of 14's step 1** was run in Chrome, signed out, on c14.html's
`ir.Encode` link: `compare/e314168…b8dd2e3#diff-c9bf87…R60`, 40 commits.
- **The anchor was right.** The element `diff-c9bf87…R60` exists, and it is the line
  `func Encode(w io.Writer, doc *IR) error {`.
- **The page never scrolled there.** The compare opened on its "Commits 40" tab, with
  the files in the hidden "Files changed 75" tab, and `scrollY` stayed 0.
- **Switching tabs didn't help.** After a click on "Files changed", the line was
  visible 35,245 px down, and `scrollY` was still 0.

**The lead's browser study** (2026-09-25, recorded in `amend-14b.md`) found:
- a GitHub compare of more than 20 commits hides its files behind that tab in every
  browser;
- a compare of 20 or fewer shows them inline, and Firefox and Safari scroll to a line
  in the first loaded batch while Chrome stays at the top;
- GitLab's compare and merge request links land in every engine;
- a blob link ("View at") lands everywhere.

**Built (strict TDD, one commit each):**

| Change | Commit | What it did |
|---|---|---|
| 1 | `ccae2f1` | `gitref.CommitCount`: `rev-list --count --end-of-options base..head`, refusing a ref that starts with `-` |
| 2 | `e7c4980` | `-mr N` on `zu diff -html` and `zu serve -base`: GitHub `/pull/N/files`, GitLab `/-/merge_requests/N/diffs`; the header reads "PR #N on the host" or "MR !N on the host" |
| 3 | `81a6a7b` | a GitHub compare of more than 20 commits, without `-mr`, gets no line or file links, with one note per `zu diff` or `zu serve` session |
| 4 | this commit | the "Diff on the host" tooltip, the decisions.md sentence and this record |

**Red for the right reason:**
1. **`CommitCount`:** its test failed first on `undefined: CommitCount`. Its refusal of
   an option-like ref still passes with both guards removed. Joined into one
   `base..head` argument, such a ref is neither a valid option nor a revision, so git
   refuses it anyway. The guards are defense in depth.
2. **`-mr`:** the export and CLI tests failed first on the missing function and flag.
   - The `zu diff` rejection cases at first exited 3 only as "flag provided but not
     defined", which is the wrong reason.
   - So each case now also checks its own message: "-mr wants a merge request number
     from 1", "-mr needs -html", "-mr does not apply with -link-template" and "-mr needs
     an origin on GitHub or GitLab". The `zu serve` cases check "-mr needs -base" and
     the same number and origin messages.
3. **The 20-commit cut:**
   - **The first red:** the tests failed on links present at 21 commits and no note.
   - **A fault in the tests themselves:** they first read any `"nodes":` as links, but
     that key is also the View's node list. They now read the parsed `links` object.
     Because that fix came after the code, each part of the code was proven by breaking
     it on purpose, then restoring it (checked identical by `cmp`):
     - nothing hidden: the 21-commit case, the count-failure case and the serve case
       fail;
     - the note on every rescan: the serve test fails ("printed 4 times, want once");
     - `>=` for `>`: the 20-commit case fails;
     - `-mr` not exempt: the 21-commit `-mr` case fails.
4. **The tooltip:** `accept.mjs` failed first in all three engines (`diffTitle = null`),
   then passed.

**Gates:**
- `make check`: exit 0. `golangci-lint`: no issues. vitest: 250 tests.
- `accept.mjs`: 57/57 in chromium, firefox and webkit, in two runs in a row.
- An earlier run stopped when Firefox crashed on a reload twice, the second time in the
  suite's own rerun. That is 08's Firefox reload flake.

## Pending, by a person

**B6 is not met** until all four steps of the check below pass. That check replaces 14
Task 7's steps 1–2. Task 7's steps 3–4 (View at on a removed declaration; `zu serve
-base main` redrawing a saved edit) still stand.

**Step 1's page is ready.**
- **How it was made:**
  - a detached worktree of `origin/main` (`b8dd2e3`);
  - in it, `zu diff d8e36c95291c86a7020ee39450581fa7b679007f -html`, where that sha is
    `origin/main~5` (5 commits);
  - the worktree was then removed.
- **The file:**
  `/private/tmp/claude-502/-Users-xb-table-zu/5140d9a4-3505-47d2-9e0f-0f07a8861f30/scratchpad/c14b.html`.
- **What it links to:** the compare page `github.com/xbklairith/zu/compare/d8e36c9…b8dd2e3`.
  - It lists 22 files, 18 of them Go.
  - The page carries 41 line links, 8 file links and the base-blob link.
  - zu printed no hidden-compare note.
- **Which function to use:** the first four files the compare lists are three docs and
  `internal/cli/scan.go`, so the function to pick is `runScan` (`…R50`).
- **A rehearsal of that link** in Chrome, signed out:
  - the files were inline, with no tabs;
  - the anchored line was visible 5,872 px down;
  - Chrome stayed at the top, which the check allows.

The user's check (14b), as written:
1. **GitHub, small compare:** `zu diff <sha of origin/main~5> -html` in a detached
   worktree of `origin/main`. Pick a function in a file among the first four the compare
   page lists, and click "Diff on the host". The compare opens with that file's diff, and
   the URL carries `#diff-…R<n>`. In Firefox or Safari the page lands on the line; Chrome
   may stay at the top.
2. **GitHub, PR:** repeat on a pull request of any public repository you have cloned,
   with `-mr <PR number>`. The PR's files page opens, with the anchor in the URL. It may
   not scroll to the line, and that doesn't fail this step.
3. **GitLab:** any GitLab repository, a compare link. It lands on the line in any
   browser.
4. **View at** on a changed function lands on the declaration.

None of them has been run.
