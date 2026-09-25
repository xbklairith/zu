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

## Pending, by a person

**B6 is not met** until the user's steps 1 and 2 pass.

**Step 1's page is ready (amendment A2).**
- **How it was made:**
  - a detached worktree of `origin/main` (`b8dd2e3`);
  - in it, `zu diff origin/main~40 -html` wrote the page;
  - the worktree was then removed.
- **The file:**
  `/private/tmp/claude-502/-Users-xb-table-zu/5140d9a4-3505-47d2-9e0f-0f07a8861f30/scratchpad/c14.html`.
- **What it links to:** the compare page
  `github.com/xbklairith/zu/compare/e314168…b8dd2e3`, which changes 49 Go files. The page
  carries 119 line links and a base-blob link.
- **Files past the fourth on the compare page:** for example `internal/ir/encode.go`,
  `internal/ir/ir.go` and `internal/scan/build.go`.

The four steps:
1. **GitHub:** a file past the fourth, then "Diff on the host". The page must load that
   file and scroll to the line.
2. **GitLab:** any changed function. The compare page must scroll to its line.
3. "View at" on a removed declaration opens the base commit's file at it.
4. `zu serve -base main`, then save an edit. It is redrawn in place as a change.

None of them has been run.
