# 13 · Watch — Plan

**Status:** APPROVED 2026-09-25 (scrutiny-13 rulings applied, replay green on 31fcff8, advisor sign-off). History: Revised for scrutiny-13, not approved. First drafted 2026-09-25, then revised the same day under the lead's rulings on scrutiny-13 (see **Revision for scrutiny-13**).

The plan has two parts:
- 13a (Go: Tasks 1–4) makes `zu serve` watch the tree and push each new View;
- 13b (the page: Tasks 5–7) draws each pushed View in place.

Task 8 is acceptance. 13a can ship alone: the page ignores `/events` until 13b.

Every diff here is against `main` at 31fcff8, with 12 committed; `main` has not moved since. The plan was built in a scratch copy and replayed green on a fresh `git archive` of 31fcff8 (**Replay record**). Proposed doc amendments are under **Doc amendments**, as exact text. They are not task steps.

> **Mode:** Quick (single-file)
> **For Claude:** Use `dev-workflow:spec-driven-implementation` to execute task-by-task. Quick mode is auto-detected from this file's presence.
> **Upgrade path:** If scope grows, run `/dev-workflow:spec full` to convert to a 3-file spec (requirements + design + tasks).

**Replaying this plan.** `replay.py`, next to this file, is 12's script unchanged. It applies every code block to a fresh copy of `main`, task by task:
- a `<!-- file: … -->` block is written whole;
- a `diff` block goes through `patch -p1`.

At each **Run** step it runs that step's first command. A step marked "Expected: FAIL" must exit non-zero; every other step must exit 0. Run it from the repository root:

```bash
S=$(mktemp -d) && git archive HEAD | tar -x -C "$S" \
  && (cd "$S/web" && npm ci) && (cd "$S/web/e2e" && npm ci && npm run browsers) \
  && python3 docx/features/13-watch/replay.py docx/features/13-watch/plan.md "$S"; rm -rf "$S"
```

It needs:
- Go, git, `patch`, Python 3, npm and Node;
- `golangci-lint` (Tasks 4 and 8);
- Playwright's three browsers (Tasks 6–8).

Type-check with `npm run typecheck` (`tsc --noEmit`), never `tsc -b`.

**Goal:** A11, and U1's "state preserved across re-renders in watch mode". With `zu serve` running, a saved file is redrawn on the open page. The page does not reload. The URL hash (focus, depth, toggles, selection), pan and zoom all stay.

A save that leaves a file unparseable keeps the last good drawing and says which file broke. Fixing the file clears that notice and redraws.

**Budget (the lead's ruling):** on kubernetes at the default 1 s poll:
- the watch's rescan takes under 2 s;
- save → drawn has a median of at most 2 s.

The worst case is reported, not gated.

**Architecture:**
- **Detect: `internal/watch` (new, Task 2).** A poller, with no new dependency. It stats:
  - every file a rescan reads (non-test `.go`, `go.mod`) outside pruned directories;
  - the Policy, whether or not git ignores it;
  - every `.gitignore`;
  - every directory the scan does not prune;
  - git's `HEAD`, `index`, `packed-refs` and the ref `HEAD` names.

  How it works:
  - A stamp is size, mtime, ctime and inode (plus the type bits and whether the path exists).
  - It lists the tree again, through git as `zu scan` does, only when a directory, a `.gitignore` or a git file changed. Before listing, it reads each changed directory and starts polling any new subdirectory, however deep. Editing a file never relists.
  - It settles a burst: once a poll differs, it polls every `Quiet` until two polls agree. It then calls back once and waits for that callback before polling again, so one rescan runs at a time and a burst costs one rescan.
  - Polling uses two goroutines and one `Lstat` per path. It runs no process and reads no content.
- **Rescan faster (Tasks 1 and 4): the rescan-profile fixes 2 and 3.**
  - Fix 3: `scan.Cache` keeps each file's `Stamp` beside its hash. With `Options.TrustStamps`, it reuses a file's facts without reading the file when the stamp is unchanged. The stamp comes from the `Lstat` that `ListTree.Files` already takes. Only the watch sets `TrustStamps`: a page load still reads and hashes every file (10 Deviation 3).
  - Fix 2: `gitHead` runs beside `scan.Run`, not after it. The watch lists through git only when the listing can have changed.
- **Push: `internal/serve` (Task 3).** A `Hub` holds the watch's latest View bytes, a generation counter and a notice.
  - `GET /events` is Server-Sent Events. On connect, and again on each change, it sends `event: view` with the generation and `event: notice` with the text.
  - `GET /view.json?latest` answers the Hub's bytes without a rescan.
  - A plain `/view.json` carries `Zu-Generation`. The session reads it under the lock the watch publishes under.
  - Both routes sit behind 10's loopback listener, Host check and `Sec-Fetch-Site` check. Without a watch (`-poll 0`), `/events` is a 404.
- **The session (Task 4).** `zu serve -poll interval` (default 1 s; 0 is off).
  - The first scan creates the Hub, and the watch runs until shutdown.
  - On a change the session rescans under its mutex, the same one a page load takes. If a page load has scanned since the watch began its poll, it lists the tree again first.
  - It then does one of three things:
    - **Hold.** The rescan failed, or, at the same commit, a path that parsed in the published View has a parse error now. It keeps the published View and sets the notice.
    - **Publish.** The bytes differ: it publishes them, which also clears the notice.
    - **Clear.** Otherwise it only clears the notice.
- **The page (Tasks 5–7).**
  - `live.ts` (`follow`) keeps an `EventSource("events")` while the page is visible, and closes it while the page is hidden. On a generation newer than the one drawn, it fetches `view.json?latest`. Generations that arrive during a fetch coalesce into one more fetch. Text equal to the drawn View is not drawn again.
  - `main.tsx` wraps `App` in `Live`, which holds the View and the notice banner (`#zu-live`). The page seeds its generation from its own load's `Zu-Generation`.
  - To keep pan and zoom:
    - `App` keeps drawing the last layout, with its own View and scene, in the same `ReactFlowProvider` while a newer View lays out;
    - `Canvas` centres once per request, not on every new layout;
    - `useViewState` reads the state again against each new View (`revalidate`), which drops a deleted selection or focus.

**Tech Stack:** as 12. No new dependency, Go or npm. The stat fields come from `syscall`, behind build-tagged files, with `CGO_ENABLED=0`.

**Source decisions:**
- requirements A11 (Could) and U1 (Must);
- decisions.md l.45: "**Watch** (13): poll the files git lists, rescan on change, redraw over Server-Sent Events keeping the hash";
- 10's plan, "Feature 11 (next): watch and live redraw" (numbered 13 since);
- 10's rescan-profile.md, fixes 2 and 3;
- 10 Deviation 3 (no stat trust on a page load);
- CLAUDE.md: "IR output must be byte-identical for the same commit + policy". The watch's IR equals a cold scan's (Task 1's test).
- the lead's rulings on scrutiny-13 (2026-09-25).

**Out of scope:**
- rescan-profile fix 1 (incremental `assemble`) and fix 4 (reuse the View when nothing parsed);
- fix 5 (hand the listing's `Lstat` to the scan). The listing's own `Lstat` already gives the stamps. Dropped under the ruling on scrutiny-13; see Deviation 8.
- re-reading `-coverprofile` when it changes (10 Deviation 10 stays);
- watching a served Change View (none exists);
- a heartbeat on `/events`;
- an adaptive poll interval;
- fsnotify;
- skipping directories git ignores (`git check-ignore --stdin`). They are polled; see **Risks**.

---

## Revision for scrutiny-13

Each finding and ruling, and where it landed:

| Finding or ruling | What changed | Where |
|---|---|---|
| Q1: default poll | 1 s kept. Budget restated: rescan under 2 s, save → drawn median ≤ 2 s; the worst case reported, not gated. | Goal, Measurements, Deviation 2 |
| Q2: stamp trust | Stamp is size, mtime, ctime and inode, for the Cache and the poll alike. `stamp_darwin.go` and `stamp_linux.go`; elsewhere size and mtime only. New test: a same-size edit with the mtime put back is seen. | Task 1, Deviation 4 |
| B1: a file in a directory that held no listed file | Every non-pruned directory is polled. The first poll reads each directory the listing implies, and a changed one is read for new subdirectories, recursively. Unit test: a directory there at start, one made later, nested ones. End-to-end Go test: mkdir, wait, then save. | Tasks 2, 4 |
| M1(a): generation read before the scan | `Views.Scan` returns the generation, read under `s.mu`. Test: a page load waiting on a watch rescan gets that rescan's generation. | Tasks 3, 4, Deviation 7 |
| M1(b): stale watch listing after a page load | Page-scan counter. `polledAt` is set by `Watcher.Polling`; if they differ, `changed` relists under the mutex. Test: a page load draws a new file, and the watch's rescan keeps it. | Tasks 2, 4, Deviation 7 |
| M2: a 7th tab hangs | A hidden page closes its stream; shown again, it reconnects and fetches `?latest` once. Unit tests, plus a browser check in which six hidden pages leave room for a seventh. | Tasks 5, 6, Deviation 10 |
| Nit: OFFLINE never cleared without a stream | Cleared when the stream closes for good after a drop (404). | Task 5 |
| Nit: hold across a commit | No hold when the View's commit moved. | Task 4 |
| Nit: fix 5 (Task 1 before) | Dropped. Stamps come from `ListTree.Files`' own `Lstat`; a file deleted mid-scan is skipped, not a read error, so there is no spurious hold. | Task 1, Deviation 8 |
| Nit: refs | `gitref.Meta` adds `packed-refs` and the ref `HEAD` names, from the common directory; asked again at each listing. | Tasks 2, 4 |
| Nit: ignored Policy | Always polled, from a stamp taken before the first scan read it. | Tasks 2, 4 |
| Nit: ulimit claim | Corrected: Go raises the soft `NOFILE` limit to the hard one. | Deviation 1 |
| Accepted: IDE `git status` rewrites the index | Recorded. | Risks |
| Q3, Q4, Q5 | M1 replaces the one-line amendment; the "search no longer re-centres" sentence is gone; no heartbeat, in Risks. | Deviations 7, 9, 10 |
| Scrutiny nit 8 | `newServer` says why it sets no `WriteTimeout`. | Task 3 |

Task count: 8, down from 9.

---

## Measurements (kubernetes)

Measured 2026-09-25 on an Apple M2 (8 cores, 16 GB), macOS 15.4, Go 1.24.5, Node 24.17.0. The revised rows were taken with the `bin/zu` built from this revision's code.

The tree was a writable copy of `.zu/corpus/kubernetes@v1.37.0` made with `cp -cRp`. On APFS that is a clonefile copy, which shares the corpus's blocks. It is not a git clone, and the corpus itself was only read. The copy was deleted afterwards.

| What | Number |
|---|---|
| git's listing | 31,300 files |
| paths a poll stats (revised: every non-pruned directory) | 13,952: 9,963 files + 3,989 directories, counted from the corpus; before B1, 13,950 |
| one idle poll | 21 ms wall, 42 ms CPU (2 goroutines), measured before B1 with 2 fewer paths; not re-measured |
| idle `zu serve`, `-poll 1s` (revised) | 7.2–7.5 % of one core (`ps` over 30 s, 2 runs); before, 6.9–7.7 % |
| idle `zu serve`, `-poll 500ms` (first draft) | 13.6–14.5 % of one core |
| watch rescan after one edit, 1 file parsed (revised) | 855–957 ms (22 rescans); before, 805–931 ms |
| save → drawn, `-poll 1s`, chromium, 11 rounds × 2 (revised) | min 1.19 / 1.24, median 1.69 / 1.66, max 2.11 / 2.06 s |
| save → drawn, `-poll 500ms`, chromium (first draft) | min 1.08, median 1.41, max 1.54 s |
| cold scan at start | 3.2–3.5 s |

hugo polls about 2,550 paths, at under 6 ms of CPU per poll.

"Save → drawn" is measured by Task 8's `measure.mjs`:
- It starts at the `writeFileSync` that renames a function in `pkg/util/env`.
- It ends when a `MutationObserver` in the page sees the renamed node.
- Each round shifts the write's phase against the poll.

**Against the budget:** the rescan takes 0.86–0.96 s, under 2 s. The median save → drawn is 1.66–1.69 s, at most 2 s. The worst case is 2.06–2.11 s. The path is at most `Every` + `Quiet` + rescan + fetch and draw: about 1 s + 0.2 s + 0.95 s + 0.1 s.

The revised rescan is about 50 ms slower than the first draft's, for two reasons. Its `ListTree` takes the `Lstat` again that fix 5 used to hand over, and it takes ctime and inode.

**Where the rescan's time goes.** About 0.8 s of the rescan comes after extraction: `assemble`, `ir.Sort`, `projectView` and `Marshal` over all 9,910 files. That floor grows with the tree. Only fix 1 removes it.

---

## Deviations and decisions for review

1. **Polling, not fsnotify.** The brief asked for no new dependency if feasible, and fsnotify buys nothing on zu's release targets:
   - On macOS, fsnotify uses kqueue, because FSEvents needs cgo and zu builds with `CGO_ENABLED=0`.
     - kqueue watches files, not directory trees. It needs one open descriptor per watched path, 13,952 on kubernetes, and a re-add each time a file or directory is created.
     - The descriptor count alone would fit: Go ≥ 1.19 raises the soft `NOFILE` limit to the hard one. This Mac's hard limit is unlimited and `kern.maxfilesperproc` is 61,440. But a descriptor held on every file of the tree is costlier than polling it, and a missed re-add is a missed change.
   - On Linux, inotify needs one watch per directory and a recursive re-add as directories appear. It still misses changes on network and some container filesystems.

   Polling costs about 42 ms of CPU per poll on kubernetes, and it works on every filesystem that keeps mtimes.
2. **The default interval is 1 s (ruled): `-poll interval`, where 0 is off and anything else must be at least 100 ms.** At 1 s on kubernetes, zu serve uses about 7 % of one core idle. The rescan takes 0.86–0.96 s and save → drawn has a median of 1.66–1.69 s. The worst case (2.06–2.11 s) is reported, not gated. `-poll 500ms` roughly doubles the idle cost, for about 0.3 s off the median.
3. **What is polled.**
   - Content: the files a rescan reads (non-test Go files and `go.mod`s outside pruned directories) and the Policy.
     - The Policy is always polled: `loadPolicy` reads it whether or not git ignores it. Its base stamp is taken before the first scan reads it, so an edit between that scan and the first poll is still seen. The failing test for the ignored Policy found that window.
     - Test files, READMEs and other listed files are seen only through their directory, that is, when they are added, removed or renamed. A test-only edit never rescans, which is right: the View does not change.
   - Directories: every directory the scan does not prune, including ones that hold no listed file (B1).
     - The first poll after start reads every directory the listing implies, because directory stamps start unknown. It adds any subdirectory it finds.
     - After that, a directory whose stamp changed is read, and each new subdirectory joins, with those below it. Its stamp is taken before it is read, so a file saved in it after that is a change at the next poll.
     - Gone directories leave.
   - Git (`gitref.Meta`): `HEAD` and `index` from the git directory, and `packed-refs` and the ref `HEAD` names from the common directory, which a linked worktree shares. These are asked again at each listing, so after a checkout the new branch's ref is polled.
   - A directory, a `.gitignore` or a git file changing lists the tree again.
   - Not polled:
     - `.git/info/exclude`, `core.excludesFile` and the global excludes;
     - a symlink's target;
     - `go.work`, which the scan does not read.
4. **The watch trusts the stamp; a page load does not (rescan-profile fix 3, against 10 Deviation 3 on the watch path only).**
   - The trade Deviation 3 refused is still refused where it was made: a reload reads and hashes every file.
   - A stamp is size, mtime, ctime and inode (`scan.Stamp`), from `syscall.Stat_t`:
     - on darwin, `Ctimespec` in `stamp_darwin.go`;
     - on linux, `Ctim` in `stamp_linux.go`;
     - elsewhere, size and mtime only (`stamp_other.go`, which covers windows).
   - The watch's rescan trusts the stamp. The hash still decides whether a changed stamp means changed content: a touch re-hashes and does not re-parse.
   - ctime closes the hole the first draft had. An edit that keeps the size and puts the mtime back (`touch -r`, `Chtimes`, `cp -p`, `rsync -t`) still moves the ctime, and a file replaced by a rename has a new inode.
   - What remains is setting the system clock back, or a filesystem without ctime (some network mounts). The poll has the same hole, so a missed edit is missed by both until the next change or a reload.
   - Task 1's tests pin both sides:
     - a same-size edit with the mtime put back is parsed under trust;
     - a trusted, unchanged stamp is the only thing that skips the read.
5. **The server holds the drawing; the page does not guess.** A rescan's result is judged against the View the Hub published:
   - **Hold.** Nothing is published and the notice says why when:
     - the rescan failed (a bad Policy, say);
     - or, at the same commit, it has a parse error in a path that parsed in the published View. The notice names the file and its first error, plus "(and N more)" when there are more.
   - **Publish.** If the bytes differ, they are published and the notice is cleared.
   - **Clear.** Otherwise only the notice is cleared.

   A parse error the published View already had does not hold, so a tree that starts broken still redraws. Nor does one at a new commit: the View must say what was committed. A page load is not held: a reload shows the tree as it is, parse errors included (10's contract).
6. **The generation is a counter, not the SHA-256 in 10's sketch.** A counter orders; a hash only says "different".
   - On connect the stream sends the current generation and notice, so a new tab or a reconnect catches up without polling.
   - zu serve restarting resets the counter. After a dropped stream the page therefore forgets the generation it drew and fetches once, and its text comparison avoids a needless redraw.
   - There is no heartbeat (ruled). The socket is loopback with no proxy to keep alive, and `EventSource`'s own error event tells the page the server went away. The page then shows "zu serve is not answering: the drawing may be out of date".
7. **A page load rescans and does not publish, and never runs ahead of the generation it is told (M1).** 10's contract stands: `GET /view.json` rescans, so a reload is always current. Only the watch moves the Hub, which keeps one writer and one hold rule. Two races are closed:
   - **(a) The generation is read under the session's mutex, after the scan** (`session.view` returns it; `Views.Scan` carries it). A publish happens only inside a watch rescan, under the same mutex, so the generation a page is told is the Hub's at the moment its View was built. That View is at least as new.
   - **(b) The watch never publishes a listing older than a page load's.** The watch lists before it takes the mutex, so a page load can list a new file B in between. The watch's rescan would then publish a View without B, a step back.
     - The session counts page scans (`scans`). `Watcher.Polling` records the count as each poll at rest begins (`polledAt`).
     - If a page scan ran since, `changed` lists the tree again under the mutex before it rescans.
     - A page scan before that poll is covered by the poll itself: any directory the page saw change has a new stamp, so the watch relists anyway.
   - Both have tests that fail without the fix.
8. **Stamps come from the listing's own `Lstat`; fix 5 is dropped (ruled).**
   - `ListTree.Files` already calls `Lstat` on every listed path. It now keeps each regular file's `Stamp`, and `scan.StampIn` reads it. So `gitref.Listing` gains no `Info`, and there is no `ListedTree`.
   - A file deleted between the listing and the scan is skipped by `Files`, as before, instead of becoming a read error that would hold the drawing.
   - Inside git, the watch starts from the first scan's listing and that scan's stamps, so an edit between the first scan and the first poll is a change.
   - Outside git the first scan has no stamps: the first poll rescans once. Every rescan outside git reads and hashes every file (`openSource`), as a page load does.
9. **Pan and zoom are kept by never remounting the flow.** Today a new graph unmounts `ReactFlowProvider` during "Laying out…", and the first view's fit runs again.
   - `App` now keeps the last finished layout (`Drawing`), together with the View and scene it was made for, and draws it while a newer View lays out. It does so only when the View object changed and the focus and drawn depth are the same.
   - A redraw that changes the focus or the drawn depth (auto depth refitting to `DRAW_LIMIT`) starts at the first view, as navigating does.
   - `Canvas` centres once per request (`center.seq` and target), not again on each layout.
10. **A hidden page holds no stream (M2).** Over HTTP/1.1 a browser opens at most 6 connections per host. Without this, six open tabs of one zu serve would each hold one for `/events`, and a seventh tab's `GET /` would hang.
    - `follow` closes the `EventSource` when `document.hidden` and opens a new one when the page is shown.
    - Shown again, it has missed what changed, and zu serve may have restarted. It forgets the drawn generation, so the next `view` event fetches `?latest` once, and the text comparison decides whether to draw.
    - Six visible tabs of one zu serve still fill the pool. That is accepted, and the tabs a person uses at once are the visible ones.
    - The browser check hides six pages by overriding `document.hidden` and firing `visibilitychange`, then loads a seventh. Without the pause it fails in all three engines (checked in scratch).
11. **12 has landed.** Every diff here is against `main` at 31fcff8.

---

## Doc amendments (exact text; not task steps)

**`docx/core/decisions.md`, Settled choices, "Serve (10)" bullet:**
- replace `zu serve [dir] [-addr host:port] [-include …] [-link-template …] [-coverprofile …]` with `zu serve [dir] [-addr host:port] [-include …] [-link-template …] [-coverprofile …] [-poll interval]`;
- replace `**Watch** (13): poll the files git lists, rescan on change, redraw over Server-Sent Events keeping the hash.` with:

> **Watch (13):** every `-poll` (default 1 s; 0 off; at least 100 ms), zu serve stats (size, mtime, ctime, inode) what a rescan reads (non-test Go files, `go.mod`s, and the Policy even if git ignores it), every directory the scan does not prune, every `.gitignore`, and git's `HEAD`, `index`, `packed-refs` and the ref `HEAD` names. It lists the tree again only when a directory, a `.gitignore` or a git file changed. A burst of changes costs one rescan, and one rescan runs at a time. The watch's rescan trusts each file's stamp, as a page load does not (10 Deviation 3). It publishes the View over Server-Sent Events (`/events`: the generation and a notice; `/view.json?latest`) unless the rescan failed or, at the same commit, a file that parsed no longer does. In that case the page keeps its drawing and shows the notice. The page redraws in place, keeping the URL hash, pan and zoom, and a hidden page closes its stream.

**`docx/features/10-serve/rescan-profile.md`:**
- l.3, replace `for feature 12 (watch)` with `for feature 13 (watch)`;
- l.142, replace `Under feature 12,` with `Under feature 13,`;
- l.151, replace `Feature 12 could accept` with `Feature 13 could accept`;
- append:

> **Taken by feature 13 (2026-09-25):** fix 2, and fix 3 on the watch path only, with ctime and inode in the stamp. Fix 5 was considered and dropped, because `ListTree`'s own `Lstat` gives the stamps. A watch rescan after one edit on kubernetes takes 0.86–0.96 s; see `docx/features/13-watch/plan.md`, Measurements.

**`docx/features/10-serve/plan.md`:**
- l.46, replace `feature 11, below` with `feature 13 (planned below as 11)`;
- under the heading `## Feature 11 (next): watch and live redraw`, insert as the first line:

> Built as feature 13, which differs: `-poll` defaults to 1 s; the event carries a generation counter, not a SHA-256; `/view.json` still rescans on a page load and `?latest` serves the kept View; a hidden page closes its stream; there is no heartbeat. See `docx/features/13-watch/plan.md`.

**`docx/features/10-serve/acceptance.md`**, l.51: replace `Feature 11's watcher` with `Feature 13's watcher`.

**`docx/core/requirements-draft.md`, Performance budgets:** after the "Incremental re-scan" bullet, insert:

> - Change to redraw in `zu serve` (13): on kubernetes v1.37.0 at the default 1 s poll, the watch's rescan stays under 2 s (measured 0.86–0.96 s) and save → drawn has a median of at most 2 s (measured 1.66–1.69 s). The worst case is reported, not gated (measured 2.06–2.11 s).

**`docx/glossary.md`**, append:

> ## Generation
>
> The count zu serve's watch keeps of the Views it has published, starting at 1 with the first scan. `/events` sends it, and `/view.json` carries it as `Zu-Generation`, read under the lock the watch publishes under. The page draws only a later one. It restarts with zu serve.

**`CLAUDE.md`, Layout:**
- after the `internal/serve` line, insert:

> - `internal/watch` — 13's poller: stats (size, mtime, ctime, inode) what a rescan reads and every non-pruned directory, relists on a directory, `.gitignore` or git meta change, settles a burst into one callback; `internal/cli/watch.go` rescans and publishes to `serve.Hub` (`/events`, `/view.json?latest`)

- in the `internal/serve` line, replace `(Host check, read-only, `/` and `/view.json`)` with `(Host check, read-only, `/`, `/view.json` and `/events`)`.

---

## The contract

| Route | Answer |
|---|---|
| `GET /view.json` | a rescan's View, as in 10. With a watch, header `Zu-Generation: N`: the Hub's generation, read under the session's mutex once the scan is done, so the View is at least that new. |
| `GET /view.json?latest` | with a watch, the Hub's View and its `Zu-Generation`, with no rescan; without one, as `GET /view.json` |
| `GET /events` | with a watch, `text/event-stream`; without one, 404 |

Every route answers only a loopback Host. `/view.json` and `/events` refuse a `Sec-Fetch-Site` of `same-site` or `cross-site` (403).

The stream sends, on connect and again whenever either value changes:

```text
event: view
data: 7

event: notice
data: internal/store/repo.go:12:1: expected declaration, found '}'
```

A notice is one line, with whitespace runs flattened to one space. An empty `data:` clears it. The page:
- shows a notice in `#zu-live`;
- fetches `view.json?latest` for a generation above the one it drew;
- says "zu serve is not answering: the drawing may be out of date" while the stream reconnects;
- stays silent when `/events` is a 404 (`-poll 0`, so EventSource gives up), and clears that message if the 404 comes after a drop;
- closes the stream while hidden. Shown again, it opens a new one and fetches `?latest` once.

---

# Tasks

## 13a: watch and push (Go)

### Task 1: Trust the stamp on request (rescan-profile fix 3)

The Cache keeps each file's `Stamp` beside its hash: size, mtime, ctime and inode of a regular file, the last two from build-tagged `sysStamp`.
- With `Options.TrustStamps`, a file whose non-zero stamp equals the cached one keeps its facts unread.
- Otherwise the file is read and hashed as before, and an equal hash only refreshes the stamp.
- A `ListTree` supplies the stamp, from the `Lstat` its `Files` already takes. `StampIn` exposes it for the watch (Task 4).
- Only 13's watch sets `TrustStamps` (Deviation 4).

The tests:
- A same-size edit with the mtime put back is parsed under trust: ctime catches it. This test is skipped outside darwin and linux.
- A trusted, unchanged stamp is the only thing that skips the read, counted through a Tree that counts reads.
- The trusted rescan's IR equals a cold scan's.

**Files:**
- Tests: `internal/scan/cache_test.go`
- Code: `internal/scan/cache.go`, `internal/scan/stamp_darwin.go`, `internal/scan/stamp_linux.go`, `internal/scan/stamp_other.go`, `internal/scan/tree.go`, `internal/scan/extract.go`, `internal/scan/scan.go`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/scan/cache_test.go b/internal/scan/cache_test.go
index 40fea8c..47e5f9e 100644
--- a/internal/scan/cache_test.go
+++ b/internal/scan/cache_test.go
@@ -6,8 +6,10 @@ import (
 	"os"
 	"path/filepath"
 	"reflect"
+	"runtime"
 	"slices"
 	"testing"
+	"time"
 
 	"zu/internal/ir"
 )
@@ -80,3 +82,115 @@ func TestRunWithoutACacheParsesEveryFile(t *testing.T) {
 		t.Errorf("Parsed = %d, want %d", st.Parsed, len(w.Files))
 	}
 }
+
+// listed is root as the watch's rescan reads it: a ListTree over every file
+// DirTree lists, whose Files takes each file's Stamp.
+func listed(t *testing.T, root string) Tree {
+	t.Helper()
+	files, _, err := dirOf(t, root).Files()
+	if err != nil {
+		t.Fatal(err)
+	}
+	lt, err := ListTree(root, files)
+	if err != nil {
+		t.Fatal(err)
+	}
+	return lt
+}
+
+// With TrustStamps a rescan reuses a file's facts without reading it while
+// its Stamp (size, mtime, ctime, inode) is the one the Cache kept (13,
+// rescan-profile fix 3). An edit that keeps the size and puts the mtime
+// back still moves the ctime, so it is seen; a touch that keeps the content
+// is read and hashed but not parsed; and the IR is always a cold scan's.
+func TestCacheTrustsStamps(t *testing.T) {
+	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
+		t.Skip("a Stamp has a ctime only on darwin and linux")
+	}
+	root := fixture(t, "shop")
+	money := filepath.Join(root, "internal", "money", "money.go")
+	cache := NewCache()
+	scan := func(trust bool) (*ir.IR, Stats) {
+		t.Helper()
+		doc, st, err := Run(context.Background(), Options{Tree: listed(t, root), Cache: cache, TrustStamps: trust})
+		if err != nil {
+			t.Fatal(err)
+		}
+		return doc, st
+	}
+	hasSub := func(doc *ir.IR) bool {
+		return slices.ContainsFunc(doc.Nodes, func(n ir.Node) bool { return n.ID == "example.com/shop/internal/money.Sub" })
+	}
+	scan(false)
+	if _, st := scan(true); st.Parsed != 0 {
+		t.Fatalf("no change: parsed %d", st.Parsed)
+	}
+
+	before, err := os.Stat(money)
+	if err != nil {
+		t.Fatal(err)
+	}
+	old, err := os.ReadFile(money)
+	if err != nil {
+		t.Fatal(err)
+	}
+	// Same size, mtime put back: Add renamed to Sub.
+	edited := bytes.Replace(old, []byte("func Add("), []byte("func Sub("), 1)
+	if len(edited) != len(old) || bytes.Equal(edited, old) {
+		t.Fatal("the fixture changed: money.go has no func Add")
+	}
+	if err := os.WriteFile(money, edited, 0o644); err != nil {
+		t.Fatal(err)
+	}
+	if err := os.Chtimes(money, before.ModTime(), before.ModTime()); err != nil {
+		t.Fatal(err)
+	}
+	if doc, st := scan(true); st.Parsed != 1 || !hasSub(doc) {
+		t.Errorf("same size, mtime put back: parsed %d, Sub drawn %v; want the edit seen", st.Parsed, hasSub(doc))
+	}
+
+	// A touch that keeps the content: read and hashed, not parsed.
+	later := before.ModTime().Add(2 * time.Second)
+	if err := os.Chtimes(money, later, later); err != nil {
+		t.Fatal(err)
+	}
+	doc, st := scan(true)
+	if cold, _ := run(t, root, 0); st.Parsed != 0 || !bytes.Equal(encode(t, doc), encode(t, cold)) {
+		t.Errorf("touched: parsed %d, want 0 and a cold scan's IR", st.Parsed)
+	}
+}
+
+// reads is a Tree that counts ReadFile calls and lists each file with the
+// Stamp the test sets.
+type reads struct {
+	Tree
+	stamps map[string]Stamp
+	n      int
+}
+
+func (r *reads) ReadFile(rel string) ([]byte, error) { r.n++; return r.Tree.ReadFile(rel) }
+func (r *reads) stamp(rel string) Stamp              { return r.stamps[rel] }
+
+// A trusted Stamp is the only thing that skips the read: a new Stamp, an
+// unknown one, or no trust reads the file.
+func TestCacheTrustSkipsOnlyTheRead(t *testing.T) {
+	root := fixture(t, "shop")
+	rel := "internal/money/money.go"
+	r := &reads{Tree: dirOf(t, root), stamps: map[string]Stamp{rel: {Size: 1, Mod: 2, Ctime: 3, Ino: 4}}}
+	c := NewCache()
+	step := func(name string, trust bool, wantReads int) {
+		t.Helper()
+		r.n = 0
+		if f, _ := c.extract(r, rel, trust); f == nil || r.n != wantReads {
+			t.Errorf("%s: %d reads, want %d", name, r.n, wantReads)
+		}
+	}
+	step("first", true, 1)
+	step("same Stamp, trusted", true, 0)
+	step("same Stamp, not trusted", false, 1)
+	r.stamps[rel] = Stamp{Size: 1, Mod: 2, Ctime: 5, Ino: 4}
+	step("new ctime", true, 1)
+	step("the new Stamp is kept", true, 0)
+	r.stamps[rel] = Stamp{}
+	step("unknown", true, 1)
+}
```

- [x] **Run:** `go test ./internal/scan/` Expected: FAIL (`unknown field TrustStamps`, `undefined: Stamp`)

- [x] **Implement**

```diff
diff --git a/internal/scan/cache.go b/internal/scan/cache.go
index b14e5dd..24436b2 100644
--- a/internal/scan/cache.go
+++ b/internal/scan/cache.go
@@ -2,6 +2,7 @@ package scan
 
 import (
 	"crypto/sha256"
+	"io/fs"
 	"sync"
 )
 
@@ -19,6 +20,51 @@ type Cache struct {
 type cached struct {
 	sum   [sha256.Size]byte
 	facts *fileFacts // shared between scans: nothing writes to it after extraction
+	stamp Stamp      // as the Tree listed the file when it was last read; zero if unknown
+}
+
+// Stamp is what Lstat says of a regular file: size, modification time,
+// status-change time and inode. An edit that keeps the size and puts the
+// mtime back (touch -r, cp -p, rsync -t) still moves the ctime, and a file
+// replaced by a rename has a new inode. The zero Stamp means "unknown": a
+// symlink, or a Tree that did not Lstat. Ctime and Ino are zero on systems
+// other than darwin and linux.
+type Stamp struct {
+	Size  int64
+	Mod   int64 // UnixNano
+	Ctime int64 // UnixNano
+	Ino   uint64
+}
+
+// StampOf is fi's Stamp: zero for anything but a regular file, since a
+// symlink's own Stamp says nothing of its target's content.
+func StampOf(fi fs.FileInfo) Stamp {
+	if fi == nil || !fi.Mode().IsRegular() {
+		return Stamp{}
+	}
+	return Stat(fi)
+}
+
+// Stat is fi's Stamp whatever fi is: a directory's changes when an entry is
+// added, removed or renamed. It is zero for a nil fi.
+func Stat(fi fs.FileInfo) Stamp {
+	if fi == nil {
+		return Stamp{}
+	}
+	ctime, ino := sysStamp(fi)
+	return Stamp{Size: fi.Size(), Mod: fi.ModTime().UnixNano(), Ctime: ctime, Ino: ino}
+}
+
+// stamper is a Tree that knows each file's Stamp from its listing.
+type stamper interface {
+	stamp(rel string) Stamp
+}
+
+func stampIn(t Tree, rel string) Stamp {
+	if s, ok := t.(stamper); ok {
+		return s.stamp(rel)
+	}
+	return Stamp{}
 }
 
 // NewCache returns an empty Cache.
@@ -26,8 +72,21 @@ func NewCache() *Cache { return &Cache{files: map[string]cached{}} }
 
 // extract returns rel's facts, from c when rel's content is what c last saw,
 // and reports whether it parsed rel. A nil Cache parses every file. A read
-// error is never cached: it says nothing about the content.
-func (c *Cache) extract(t Tree, rel string) (f *fileFacts, parsed bool) {
+// error is never cached: it says nothing about the content. With trust, a
+// file whose Stamp is the one c kept is not read at all (13): an edit that
+// keeps both size and mtime then goes unseen until the file changes again.
+func (c *Cache) extract(t Tree, rel string, trust bool) (f *fileFacts, parsed bool) {
+	st := stampIn(t, rel)
+	var e cached
+	var ok bool
+	if c != nil {
+		c.mu.Lock()
+		e, ok = c.files[rel]
+		c.mu.Unlock()
+		if trust && ok && st != (Stamp{}) && e.stamp == st {
+			return e.facts, false
+		}
+	}
 	src, err := t.ReadFile(rel)
 	if err != nil {
 		return readFailed(rel, err), false
@@ -36,15 +95,17 @@ func (c *Cache) extract(t Tree, rel string) (f *fileFacts, parsed bool) {
 		return extractSource(rel, src), true
 	}
 	sum := sha256.Sum256(src)
-	c.mu.Lock()
-	e, ok := c.files[rel]
-	c.mu.Unlock()
 	if ok && e.sum == sum {
+		if e.stamp != st {
+			c.mu.Lock()
+			c.files[rel] = cached{sum, e.facts, st}
+			c.mu.Unlock()
+		}
 		return e.facts, false
 	}
 	f = extractSource(rel, src)
 	c.mu.Lock()
-	c.files[rel] = cached{sum, f}
+	c.files[rel] = cached{sum, f, st}
 	c.mu.Unlock()
 	return f, true
 }
diff --git a/internal/scan/extract.go b/internal/scan/extract.go
index da47b04..2996816 100644
--- a/internal/scan/extract.go
+++ b/internal/scan/extract.go
@@ -52,7 +52,7 @@ type declFact struct {
 
 // extractFile parses rel from t and pulls out its facts.
 func extractFile(t Tree, rel string) *fileFacts {
-	f, _ := (*Cache)(nil).extract(t, rel)
+	f, _ := (*Cache)(nil).extract(t, rel, false)
 	return f
 }
 
diff --git a/internal/scan/scan.go b/internal/scan/scan.go
index a3366ed..6e4f108 100644
--- a/internal/scan/scan.go
+++ b/internal/scan/scan.go
@@ -27,6 +27,11 @@ type Options struct {
 	// Cache, when set, keeps each file's facts for the next scan, which
 	// then parses only the files whose content changed (10).
 	Cache *Cache
+	// TrustStamps lets the Cache reuse a file's facts without reading it
+	// when the Tree (ListTree) lists it with the Stamp the Cache kept (13's
+	// watch rescans). Without it every file is read and hashed,
+	// so only a changed content re-parses (10 Deviation 3).
+	TrustStamps bool
 }
 
 // Stats summarise a scan for the one-line report, and carry what the scan
@@ -48,7 +53,7 @@ func Run(ctx context.Context, opts Options) (*ir.IR, Stats, error) {
 	if err != nil {
 		return nil, Stats{}, err
 	}
-	facts, parsed, err := extractAll(ctx, opts.Tree, w, opts.Workers, opts.Cache)
+	facts, parsed, err := extractAll(ctx, opts.Tree, w, opts.Workers, opts.Cache, opts.TrustStamps)
 	if err != nil {
 		return nil, Stats{}, err
 	}
@@ -78,7 +83,7 @@ func Run(ctx context.Context, opts Options) (*ir.IR, Stats, error) {
 // its content is unchanged, and counts the files it parsed. Each worker
 // writes only its own slot, so the result order is the sorted file order
 // regardless of timing.
-func extractAll(ctx context.Context, t Tree, w *walkResult, workers int, c *Cache) ([]*fileFacts, int, error) {
+func extractAll(ctx context.Context, t Tree, w *walkResult, workers int, c *Cache, trust bool) ([]*fileFacts, int, error) {
 	if workers <= 0 {
 		workers = runtime.GOMAXPROCS(0)
 	}
@@ -91,7 +96,7 @@ func extractAll(ctx context.Context, t Tree, w *walkResult, workers int, c *Cach
 		go func() {
 			defer wg.Done()
 			for i := range next {
-				facts[i], parsed[i] = c.extract(t, w.Files[i])
+				facts[i], parsed[i] = c.extract(t, w.Files[i], trust)
 			}
 		}()
 	}
diff --git a/internal/scan/stamp_darwin.go b/internal/scan/stamp_darwin.go
new file mode 100644
index 0000000..7e43cb6
--- /dev/null
+++ b/internal/scan/stamp_darwin.go
@@ -0,0 +1,15 @@
+package scan
+
+import (
+	"io/fs"
+	"syscall"
+)
+
+// sysStamp is fi's status-change time and inode.
+func sysStamp(fi fs.FileInfo) (ctime int64, ino uint64) {
+	st, ok := fi.Sys().(*syscall.Stat_t)
+	if !ok {
+		return 0, 0
+	}
+	return st.Ctimespec.Nano(), st.Ino
+}
diff --git a/internal/scan/stamp_linux.go b/internal/scan/stamp_linux.go
new file mode 100644
index 0000000..1433d6e
--- /dev/null
+++ b/internal/scan/stamp_linux.go
@@ -0,0 +1,15 @@
+package scan
+
+import (
+	"io/fs"
+	"syscall"
+)
+
+// sysStamp is fi's status-change time and inode.
+func sysStamp(fi fs.FileInfo) (ctime int64, ino uint64) {
+	st, ok := fi.Sys().(*syscall.Stat_t)
+	if !ok {
+		return 0, 0
+	}
+	return st.Ctim.Nano(), st.Ino
+}
diff --git a/internal/scan/stamp_other.go b/internal/scan/stamp_other.go
new file mode 100644
index 0000000..f5a0580
--- /dev/null
+++ b/internal/scan/stamp_other.go
@@ -0,0 +1,9 @@
+//go:build !darwin && !linux
+
+package scan
+
+import "io/fs"
+
+// sysStamp is zero where zu does not read the system's stat: a Stamp is
+// then size and mtime only.
+func sysStamp(fs.FileInfo) (ctime int64, ino uint64) { return 0, 0 }
diff --git a/internal/scan/tree.go b/internal/scan/tree.go
index 92a5884..c1d82fe 100644
--- a/internal/scan/tree.go
+++ b/internal/scan/tree.go
@@ -72,6 +72,7 @@ func openDir(root string) (*dirTree, error) {
 type listTree struct {
 	*dirTree
 	listed []string
+	stamps map[string]Stamp // each listed file's Stamp, from Files' Lstat
 }
 
 // ListTree is the directory at root, restricted to files: slash paths
@@ -89,6 +90,7 @@ func ListTree(root string, files []string) (Tree, error) {
 func (l *listTree) Files() ([]string, []ir.ParseError, error) {
 	var files []string
 	var errs []ir.ParseError
+	stamps := map[string]Stamp{}
 	listed := slices.Sorted(slices.Values(l.listed))
 	for _, rel := range slices.Compact(listed) {
 		dirs := strings.Split(rel, "/")
@@ -109,10 +111,15 @@ func (l *listTree) Files() ([]string, []ir.ParseError, error) {
 			continue
 		}
 		files = append(files, rel)
+		stamps[rel] = StampOf(info)
 	}
+	l.stamps = stamps
 	return files, errs, nil
 }
 
+// stamp is rel's Stamp as Files saw it, or zero before Files runs.
+func (l *listTree) stamp(rel string) Stamp { return l.stamps[rel] }
+
 func (d *dirTree) Files() ([]string, []ir.ParseError, error) {
 	var files []string
 	var errs []ir.ParseError
```

- [x] **Run:** `go test -race ./... && go vet ./... && CGO_ENABLED=0 GOOS=linux go vet ./internal/scan/ && CGO_ENABLED=0 GOOS=windows go vet ./internal/scan/` Expected: PASS

- [x] **Commit** (one line, imperative; stage these files only): `Let a rescan trust each file's size, mtime, ctime and inode`

### Task 2: The poller (`internal/watch`)

`Watcher.Run` polls until its context ends:
- It starts from a Listing. The base stamp of each file it polls is the one the last scan kept (`Kept`); directories start unknown.
- `Polling` runs before each poll at rest.
- On a difference it settles: it polls every `Quiet` until two polls agree, at most 20 times.
- If a directory, a `.gitignore` or a meta path changed, it reads each changed directory for new ones (`discover`), asks `Meta` again, polls the meta paths and lists again. A new directory's stamp is the one taken before it was read. Other directory stamps carry over from the poll before the listing.
- It calls `changed` once, when a meta path, an `Always` path, a file a rescan reads or the listing itself changed, and waits for it to return.
- `Walk` lists a directory outside git.

The tests use a lister that also returns files in pruned directories, as git does, so pruning is tested and not just inherited from `DirTree`. Other tests:
- a file in a directory that holds no listed file: one there at start, one made after, nested ones (B1);
- an `Always` path that no listing holds;
- a meta path `Meta` names only after a relist;
- a start whose kept stamps differ from the tree's.

**Files:**
- Tests: `internal/watch/watch_test.go`
- Code: `internal/watch/watch.go`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/watch/watch_test.go b/internal/watch/watch_test.go
new file mode 100644
index 0000000..0864274
--- /dev/null
+++ b/internal/watch/watch_test.go
@@ -0,0 +1,344 @@
+package watch
+
+import (
+	"context"
+	"io/fs"
+	"os"
+	"path/filepath"
+	"slices"
+	"strings"
+	"sync/atomic"
+	"testing"
+	"time"
+
+	"zu/internal/scan"
+)
+
+// goOnly is what a rescan reads in these tests.
+func goOnly(rel string) bool { return strings.HasSuffix(rel, ".go") }
+
+func write(t *testing.T, root, rel, body string) {
+	t.Helper()
+	p := filepath.Join(root, filepath.FromSlash(rel))
+	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
+		t.Fatal(err)
+	}
+	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
+		t.Fatal(err)
+	}
+}
+
+// every lists every file under root, pruned directories too, as git does,
+// but not the files named ignored.
+func every(root string, ignored ...string) (*Listing, error) {
+	l := &Listing{}
+	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
+		if err != nil || d.IsDir() {
+			return err
+		}
+		rel, _ := filepath.Rel(root, p)
+		if rel = filepath.ToSlash(rel); !slices.Contains(ignored, rel) {
+			l.Files = append(l.Files, rel)
+		}
+		return nil
+	})
+	return l, err
+}
+
+// watching runs a Watcher over root until the test ends; with changes it
+// before it runs. Each change arrives on the channel; hold, when set, runs
+// inside the callback. Unless with sets Kept, the Stamps the "last scan"
+// kept are Lstat's now.
+func watching(t *testing.T, root string, hold func(), with ...func(*Watcher)) (<-chan *Listing, *atomic.Int32) {
+	t.Helper()
+	var lists atomic.Int32
+	w := &Watcher{
+		Root: root, Matters: goOnly, Every: 10 * time.Millisecond, Quiet: 60 * time.Millisecond,
+		List: func(context.Context) (*Listing, error) { return every(root) },
+	}
+	for _, o := range with {
+		o(w)
+	}
+	l, err := w.List(context.Background())
+	if err != nil {
+		t.Fatal(err)
+	}
+	list := w.List
+	w.List = func(ctx context.Context) (*Listing, error) {
+		lists.Add(1)
+		return list(ctx)
+	}
+	if w.Kept == nil {
+		kept := map[string]scan.Stamp{}
+		for _, f := range append(l.Files, w.Always...) {
+			fi, _ := os.Lstat(filepath.Join(root, filepath.FromSlash(f)))
+			kept[f] = scan.StampOf(fi)
+		}
+		w.Kept = func(rel string) scan.Stamp { return kept[rel] }
+	}
+	ctx, cancel := context.WithCancel(context.Background())
+	got := make(chan *Listing, 16)
+	done := make(chan error, 1)
+	go func() {
+		done <- w.Run(ctx, l, func(_ context.Context, l *Listing) {
+			if hold != nil {
+				hold()
+			}
+			got <- l
+		})
+	}()
+	t.Cleanup(func() {
+		cancel()
+		if err := <-done; err != context.Canceled {
+			t.Errorf("Run = %v, want context.Canceled", err)
+		}
+	})
+	return got, &lists
+}
+
+func next(t *testing.T, got <-chan *Listing) *Listing {
+	t.Helper()
+	select {
+	case l := <-got:
+		return l
+	case <-time.After(5 * time.Second):
+		t.Fatal("no change reported")
+		return nil
+	}
+}
+
+func none(t *testing.T, got <-chan *Listing, why string) {
+	t.Helper()
+	select {
+	case l := <-got:
+		t.Fatalf("%s: a change was reported: %v", why, l.Files)
+	case <-time.After(300 * time.Millisecond):
+	}
+}
+
+// A watcher reports an edit, an add in a new directory and a delete, and
+// nothing for a file no rescan reads or one in a directory the scan prunes.
+func TestWatcherReportsEditsAddsAndDeletes(t *testing.T) {
+	root := t.TempDir()
+	write(t, root, "go.mod", "module m\n")
+	write(t, root, "a/a.go", "package a\n")
+	write(t, root, "README.md", "hi\n")
+	write(t, root, "vendor/v/v.go", "package v\n")
+	got, _ := watching(t, root, nil)
+	none(t, got, "at rest") // the first poll relists once, but nothing changed
+
+	write(t, root, "README.md", "hello\n")
+	none(t, got, "a file no rescan reads")
+	write(t, root, "vendor/v/v.go", "package v // edited\n")
+	none(t, got, "a file in a directory the scan prunes")
+
+	write(t, root, "a/a.go", "package a\n\nfunc A() {}\n")
+	next(t, got)
+	write(t, root, "b/c/b.go", "package c\n")
+	if l := next(t, got); !slices.Contains(l.Files, "b/c/b.go") {
+		t.Errorf("add in a new directory: %v", l.Files)
+	}
+	if err := os.Remove(filepath.Join(root, "a", "a.go")); err != nil {
+		t.Fatal(err)
+	}
+	if l := next(t, got); slices.Contains(l.Files, "a/a.go") {
+		t.Errorf("delete: %v", l.Files)
+	}
+	none(t, got, "after the delete")
+}
+
+// A file that changed since the last scan read it, before the watch began,
+// is a change at the first poll: the base is what the scan kept, not what
+// the first poll finds.
+func TestWatcherStartsFromTheKeptStamps(t *testing.T) {
+	root := t.TempDir()
+	write(t, root, "go.mod", "module m\n")
+	write(t, root, "a.go", "package m\n")
+	got, _ := watching(t, root, nil, func(w *Watcher) {
+		w.Kept = func(string) scan.Stamp { return scan.Stamp{Size: 1} } // what the scan read is gone
+	})
+	next(t, got)
+	none(t, got, "after the first change")
+}
+
+// A burst, such as a checkout rewriting many files, is one change, reported
+// once the tree has been quiet for one Quiet.
+func TestWatcherCoalescesABurst(t *testing.T) {
+	root := t.TempDir()
+	write(t, root, "go.mod", "module m\n")
+	got, _ := watching(t, root, nil)
+	none(t, got, "at rest")
+	for i := range 200 {
+		write(t, root, filepath.Join("p", string(rune('a'+i%26)), "f"+strings.Repeat("x", i/26)+".go"), "package p\n")
+	}
+	if l := next(t, got); len(l.Files) != 201 {
+		t.Errorf("the burst was reported before it ended: %d files", len(l.Files))
+	}
+	none(t, got, "after the burst")
+}
+
+// One rescan at a time: changes made while one runs are reported once, after
+// it returns.
+func TestWatcherWaitsForTheRescan(t *testing.T) {
+	root := t.TempDir()
+	write(t, root, "go.mod", "module m\n")
+	write(t, root, "a.go", "package m\n")
+	release := make(chan struct{})
+	var calls atomic.Int32
+	got, _ := watching(t, root, func() {
+		if calls.Add(1) == 1 {
+			<-release
+		}
+	})
+	write(t, root, "a.go", "package m // 1\n")
+	time.Sleep(200 * time.Millisecond) // the first rescan is now running
+	write(t, root, "a.go", "package m // 22\n")
+	write(t, root, "b.go", "package m\n")
+	time.Sleep(200 * time.Millisecond)
+	close(release)
+	next(t, got)
+	if l := next(t, got); !slices.Contains(l.Files, "b.go") {
+		t.Errorf("the second rescan missed b.go: %v", l.Files)
+	}
+	none(t, got, "after the second rescan")
+	if n := calls.Load(); n != 2 {
+		t.Errorf("%d rescans, want 2", n)
+	}
+}
+
+// An edit to a file already listed needs no new listing; an added file, a
+// .gitignore or a meta path (git's HEAD, index) does, and a meta path is a
+// change even when no file is.
+func TestWatcherRelistsOnlyWhenTheListingMayChange(t *testing.T) {
+	root := t.TempDir()
+	write(t, root, "go.mod", "module m\n")
+	write(t, root, "a.go", "package m\n")
+	write(t, root, ".gitignore", "y\n")
+	meta := filepath.Join(t.TempDir(), "index")
+	if err := os.WriteFile(meta, []byte("1"), 0o644); err != nil {
+		t.Fatal(err)
+	}
+	got, lists := watching(t, root, nil, func(w *Watcher) {
+		w.Meta = func(context.Context) []string { return []string{meta} }
+	})
+	none(t, got, "at rest")
+	before := lists.Load()
+	write(t, root, "a.go", "package m\n\nvar X = 1\n")
+	next(t, got)
+	if n := lists.Load(); n != before {
+		t.Errorf("an edit relisted %d times", n-before)
+	}
+	write(t, root, ".gitignore", "xx\n")
+	none(t, got, "a .gitignore edit that hides nothing")
+	if lists.Load() == before {
+		t.Error("a .gitignore edit did not relist")
+	}
+	if err := os.WriteFile(meta, []byte("22"), 0o644); err != nil {
+		t.Fatal(err)
+	}
+	next(t, got)
+}
+
+// A file saved in a directory that holds no listed file is seen (13,
+// scrutiny B1): every directory is polled. The first poll reads each one
+// the listing implies, and finds one that was there already; a later one
+// is found by reading the directory that changed, however deep it is.
+func TestWatcherSeesAFileInANewDirectory(t *testing.T) {
+	root := t.TempDir()
+	write(t, root, "go.mod", "module m\n")
+	write(t, root, "empty/.keep", "")
+	if err := os.MkdirAll(filepath.Join(root, "pre", "q"), 0o755); err != nil {
+		t.Fatal(err)
+	}
+	got, _ := watching(t, root, nil)
+	none(t, got, "at rest")
+	for _, d := range []string{"d", "e/f/g", "empty/h"} {
+		if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(d)), 0o755); err != nil {
+			t.Fatal(err)
+		}
+	}
+	none(t, got, "empty directories") // longer than a poll: they are found and polled
+	for _, f := range []string{"pre/q/p.go", "d/x.go", "e/f/g/y.go", "empty/h/z.go"} {
+		write(t, root, f, "package x\n")
+		if l := next(t, got); !slices.Contains(l.Files, f) {
+			t.Errorf("%s: %v", f, l.Files)
+		}
+	}
+	none(t, got, "after the adds")
+}
+
+// A path in Always, such as a Policy git ignores, is polled though no
+// listing holds it, from the Stamp the last scan kept: an edit, a delete
+// and an add are each a change.
+func TestWatcherPollsAlways(t *testing.T) {
+	root := t.TempDir()
+	write(t, root, "go.mod", "module m\n")
+	write(t, root, "zu.policy.yaml", "levels: []\n")
+	got, _ := watching(t, root, nil, func(w *Watcher) {
+		w.Always = []string{"zu.policy.yaml"}
+		w.List = func(context.Context) (*Listing, error) { return every(root, "zu.policy.yaml") }
+	})
+	none(t, got, "at rest")
+	write(t, root, "zu.policy.yaml", "levels: [a]\n")
+	next(t, got)
+	if err := os.Remove(filepath.Join(root, "zu.policy.yaml")); err != nil {
+		t.Fatal(err)
+	}
+	next(t, got)
+	write(t, root, "zu.policy.yaml", "levels: []\n")
+	next(t, got)
+}
+
+// Meta is asked again at each listing, so a path it names later, such as
+// the ref a checkout moved HEAD to, is polled from then on. Polling runs
+// before each poll at rest.
+func TestWatcherAsksMetaAgain(t *testing.T) {
+	root := t.TempDir()
+	write(t, root, "go.mod", "module m\n")
+	gd := t.TempDir()
+	head, ref := filepath.Join(gd, "HEAD"), filepath.Join(gd, "main")
+	for _, p := range []string{head, ref} {
+		if err := os.WriteFile(p, []byte("1"), 0o644); err != nil {
+			t.Fatal(err)
+		}
+	}
+	var polls atomic.Int32
+	var moved atomic.Bool
+	got, _ := watching(t, root, nil, func(w *Watcher) {
+		w.Meta = func(context.Context) []string {
+			if moved.Load() {
+				return []string{head, ref}
+			}
+			return []string{head}
+		}
+		w.Polling = func() { polls.Add(1) }
+	})
+	none(t, got, "at rest")
+	if err := os.WriteFile(ref, []byte("22"), 0o644); err != nil {
+		t.Fatal(err)
+	}
+	none(t, got, "a ref HEAD does not name")
+	moved.Store(true)
+	if err := os.WriteFile(head, []byte("22"), 0o644); err != nil {
+		t.Fatal(err)
+	}
+	next(t, got)
+	if err := os.WriteFile(ref, []byte("333"), 0o644); err != nil {
+		t.Fatal(err)
+	}
+	next(t, got)
+	if polls.Load() == 0 {
+		t.Error("Polling never ran")
+	}
+}
+
+// Walk lists what a DirTree lists.
+func TestWalk(t *testing.T) {
+	root := t.TempDir()
+	write(t, root, "go.mod", "module m\n")
+	write(t, root, "vendor/v.go", "package v\n")
+	l, err := Walk(root)
+	if err != nil || !slices.Equal(l.Files, []string{"go.mod"}) {
+		t.Fatalf("Walk = %+v, %v", l, err)
+	}
+}
```

- [x] **Run:** `go test ./internal/watch/` Expected: FAIL (`undefined: Listing`, `undefined: Watcher`)

- [x] **Implement**

```diff
diff --git a/internal/watch/watch.go b/internal/watch/watch.go
new file mode 100644
index 0000000..aef462c
--- /dev/null
+++ b/internal/watch/watch.go
@@ -0,0 +1,334 @@
+// Package watch tells zu serve when the working tree changed (13). It polls
+// the Stamp (size, mtime, ctime, inode) of the files a rescan reads and of
+// every directory the scan does not prune, and lists the tree again only
+// when a directory, a .gitignore or a meta path (git's HEAD, index and
+// refs) changed. It runs no process and reads no file's content.
+package watch
+
+import (
+	"context"
+	"io/fs"
+	"os"
+	"path"
+	"path/filepath"
+	"slices"
+	"strings"
+	"sync"
+	"time"
+
+	"zu/internal/scan"
+)
+
+// Listing is what a rescan reads.
+type Listing struct {
+	Files []string // slash paths relative to the root, sorted
+	Extra bool     // as gitref.Listing: the tree has files HEAD lacks
+}
+
+// Walk lists root as a DirTree does: the listing of a directory outside git.
+func Walk(root string) (*Listing, error) {
+	t, err := scan.DirTree(root)
+	if err != nil {
+		return nil, err
+	}
+	files, _, err := t.Files()
+	if err != nil {
+		return nil, err
+	}
+	return &Listing{Files: files}, nil
+}
+
+// Watcher polls a tree.
+type Watcher struct {
+	Root string
+	// Meta returns absolute paths outside the listing, such as git's HEAD,
+	// index and the ref HEAD names: a change to one lists the tree again
+	// and is a change. It is asked again at each listing. Nil: none.
+	Meta func(context.Context) []string
+	// Always are slash paths a rescan reads whether or not a listing holds
+	// them, such as a Policy git ignores.
+	Always []string
+	// Matters reports whether a rescan reads rel's content. A listed file
+	// it rejects is polled only through its directory (an add or a delete).
+	Matters func(rel string) bool
+	// List lists the tree again.
+	List func(context.Context) (*Listing, error)
+	// Kept is the Stamp of rel, a listed file or an Always path, when the
+	// last scan read it: zero if it was missing or is unknown. Nil: every
+	// file is unknown, so the first poll is a change.
+	Kept func(rel string) scan.Stamp
+	// Polling, when set, runs before each poll at rest.
+	Polling func()
+	// Every is the time between polls at rest; Quiet, the time between
+	// polls while a burst of changes lasts.
+	Every, Quiet time.Duration
+}
+
+// maxSettle bounds how long a burst can hold a rescan back: 20 Quiets.
+const maxSettle = 20
+
+// Run watches from l, the listing the last scan read, until ctx ends, and
+// returns ctx's error. When a poll differs from the one before, it polls
+// every Quiet until two agree, so a burst is one change. It lists the tree
+// again if a directory, a .gitignore or a meta path changed, after reading
+// each changed directory for new ones to poll. It then calls changed with
+// the listing if a file was added, removed or rewritten, or a meta path or
+// an Always path changed. It polls again only after changed returns: one
+// rescan runs at a time, and changes made during one are reported once,
+// after it.
+func (w *Watcher) Run(ctx context.Context, l *Listing, changed func(context.Context, *Listing)) error {
+	dirs := map[string]bool{".": true}
+	for _, f := range l.Files {
+		if !pruned(f) {
+			for d := path.Dir(f); !dirs[d]; d = path.Dir(d) {
+				dirs[d] = true
+			}
+		}
+	}
+	meta := w.meta(ctx)
+	sc := w.scope(l, dirs)
+	base := sc.poll(meta)
+	for i, p := range sc.paths {
+		if i < sc.files {
+			base.st[i] = w.kept(p) // what the last scan read, not what is there now
+		} else {
+			base.st[i] = stamp{} // unknown: the first poll reads it and lists again
+		}
+	}
+	for {
+		if err := sleep(ctx, w.Every); err != nil {
+			return err
+		}
+		if w.Polling != nil {
+			w.Polling()
+		}
+		cur := sc.poll(meta)
+		if cur.equal(base) {
+			continue
+		}
+		for range maxSettle {
+			if err := sleep(ctx, w.Quiet); err != nil {
+				return err
+			}
+			again := sc.poll(meta)
+			if again.equal(cur) {
+				break
+			}
+			cur = again
+		}
+		change := !slices.Equal(cur.meta, base.meta)
+		relist := change
+		var moved []string // directories whose stamp changed
+		for i, p := range sc.paths {
+			switch {
+			case cur.st[i] == base.st[i]:
+			case i >= sc.files:
+				relist = true
+				moved = append(moved, p)
+			default:
+				relist = relist || ignoreFile(p)
+				change = change || w.Matters(p) || slices.Contains(w.Always, p)
+			}
+		}
+		if relist {
+			found := w.discover(dirs, moved)
+			meta = w.meta(ctx)
+			metaNow := pollMeta(meta) // before the listing, so a later change is seen
+			nl, err := w.List(ctx)
+			if err != nil {
+				if ctx.Err() != nil {
+					return ctx.Err()
+				}
+				continue // git failed: poll again, and list again, next time
+			}
+			nsc := w.scope(nl, dirs)
+			next := nsc.poll(nil)
+			was, now := sc.byPath(base), sc.byPath(cur)
+			for i, p := range nsc.paths {
+				switch {
+				case i >= nsc.files:
+					// A directory's stamp is the one taken before the
+					// listing that read it.
+					if st, ok := found[p]; ok {
+						next.st[i] = st
+					} else {
+						next.st[i] = now[p]
+					}
+				case next.st[i] != was[p] && (w.Matters(p) || slices.Contains(w.Always, p)):
+					change = true
+				}
+			}
+			next.meta = metaNow
+			change = change || !slices.Equal(nl.Files, l.Files)
+			l, sc, cur = nl, nsc, next
+		}
+		if change {
+			changed(ctx, l)
+		}
+		base = cur
+	}
+}
+
+func sleep(ctx context.Context, d time.Duration) error {
+	t := time.NewTimer(d)
+	defer t.Stop()
+	select {
+	case <-ctx.Done():
+		return ctx.Err()
+	case <-t.C:
+		return nil
+	}
+}
+
+func (w *Watcher) meta(ctx context.Context) []string {
+	if w.Meta == nil {
+		return nil
+	}
+	return w.Meta(ctx)
+}
+
+// kept is the stamp a poll would give the file the last scan read.
+func (w *Watcher) kept(rel string) stamp {
+	if w.Kept == nil {
+		return stamp{}
+	}
+	st := w.Kept(rel)
+	if st == (scan.Stamp{}) {
+		return stamp{} // unknown: a symlink, or a tree that did not Lstat
+	}
+	return stamp{st: st, seen: true} // a regular file: Type() is 0
+}
+
+// discover reads each directory in moved: one that is gone leaves dirs, and
+// a subdirectory the scan does not prune joins it, with those below it. It
+// returns the stamp of each new directory, taken before it was read.
+func (w *Watcher) discover(dirs map[string]bool, moved []string) map[string]stamp {
+	found := map[string]stamp{}
+	var visit func(d string, isNew bool)
+	visit = func(d string, isNew bool) {
+		p := filepath.Join(w.Root, filepath.FromSlash(d))
+		fi, err := os.Lstat(p)
+		if err != nil || !fi.IsDir() {
+			delete(dirs, d) // those below it are gone too, and go when polled
+			return
+		}
+		if isNew {
+			found[d] = stampOf(fi)
+		}
+		entries, err := os.ReadDir(p)
+		if err != nil {
+			return
+		}
+		for _, e := range entries {
+			if sub := path.Join(d, e.Name()); e.IsDir() && !scan.PrunedDir(e.Name()) && !dirs[sub] {
+				dirs[sub] = true
+				visit(sub, true)
+			}
+		}
+	}
+	for _, d := range moved {
+		visit(d, false)
+	}
+	return found
+}
+
+// stamp is what a poll compares.
+type stamp struct {
+	st   scan.Stamp
+	typ  fs.FileMode // the type bits: 0 for a regular file
+	seen bool
+}
+
+func stampOf(fi fs.FileInfo) stamp {
+	if fi == nil {
+		return stamp{}
+	}
+	return stamp{scan.Stat(fi), fi.Mode().Type(), true}
+}
+
+// scope is what a poll looks at for one listing: the listed files a rescan
+// reads, the .gitignores and the Always paths, then every directory in
+// dirs. Pruned directories are left out.
+type scope struct {
+	paths []string // slash paths relative to the root
+	abs   []string // the same, joined to the root
+	files int      // paths[:files] are files
+}
+
+func (w *Watcher) scope(l *Listing, dirs map[string]bool) *scope {
+	sc := &scope{}
+	for _, f := range l.Files {
+		if !pruned(f) && (w.Matters(f) || ignoreFile(f) || slices.Contains(w.Always, f)) {
+			sc.paths = append(sc.paths, f)
+		}
+	}
+	for _, a := range w.Always {
+		if !slices.Contains(l.Files, a) {
+			sc.paths = append(sc.paths, a)
+		}
+	}
+	sc.files = len(sc.paths)
+	for d := range dirs {
+		sc.paths = append(sc.paths, d)
+	}
+	slices.Sort(sc.paths[sc.files:])
+	for _, p := range sc.paths {
+		sc.abs = append(sc.abs, filepath.Join(w.Root, filepath.FromSlash(p)))
+	}
+	return sc
+}
+
+// pruned reports whether rel lies in a directory the scan never reads.
+func pruned(rel string) bool {
+	dirs := strings.Split(rel, "/")
+	return slices.ContainsFunc(dirs[:len(dirs)-1], scan.PrunedDir)
+}
+
+func ignoreFile(rel string) bool { return path.Base(rel) == ".gitignore" }
+
+// state is one poll: a stamp per scope path, and one per meta path.
+type state struct {
+	st   []stamp
+	meta []stamp
+}
+
+// poll Lstats the scope and meta, two at a time: more workers shorten a
+// poll of kubernetes but cost more CPU, which is what an idle serve spends.
+func (sc *scope) poll(meta []string) state {
+	s := state{st: make([]stamp, len(sc.abs))}
+	var wg sync.WaitGroup
+	for k := range 2 {
+		wg.Add(1)
+		go func() {
+			defer wg.Done()
+			for i := k; i < len(sc.abs); i += 2 {
+				fi, _ := os.Lstat(sc.abs[i])
+				s.st[i] = stampOf(fi)
+			}
+		}()
+	}
+	wg.Wait()
+	s.meta = pollMeta(meta)
+	return s
+}
+
+func pollMeta(meta []string) []stamp {
+	var out []stamp
+	for _, m := range meta {
+		fi, _ := os.Lstat(m)
+		out = append(out, stampOf(fi))
+	}
+	return out
+}
+
+func (s state) equal(o state) bool {
+	return slices.Equal(s.st, o.st) && slices.Equal(s.meta, o.meta)
+}
+
+func (sc *scope) byPath(s state) map[string]stamp {
+	m := make(map[string]stamp, len(sc.paths))
+	for i, p := range sc.paths {
+		m[p] = s.st[i]
+	}
+	return m
+}
```

- [x] **Run:** `go test -race ./internal/watch/ && go vet ./...` Expected: PASS

- [x] **Commit:** `Poll the tree for what a rescan reads`

### Task 3: The Hub, `/events` and `/view.json?latest`

`Handler` takes `Views{Scan, Hub}`.
- `Scan` returns the View and the generation it is at least as new as. The Handler only passes the generation on as `Zu-Generation`; the session reads it under its mutex (Task 4).
- The Hub:
  - holds the latest View, its generation (1 at start) and the notice;
  - `Publish` advances the generation and clears the notice, and `Notify` sets the notice;
  - `Close` ends every stream, and zu serve calls it on shutdown.
- `/events` streams the protocol in **The contract**, under the same Host and `Sec-Fetch-Site` rules as `/view.json`.
- `zu serve` passes no Hub yet. `newServer` says why it sets no `WriteTimeout`.

**Files:**
- Tests: `internal/serve/live_test.go`, `internal/serve/serve_test.go`
- Code: `internal/serve/live.go`, `internal/serve/serve.go`, `internal/cli/serve.go`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/serve/live_test.go b/internal/serve/live_test.go
new file mode 100644
index 0000000..1b35f22
--- /dev/null
+++ b/internal/serve/live_test.go
@@ -0,0 +1,142 @@
+package serve
+
+import (
+	"bufio"
+	"context"
+	"io"
+	"net/http"
+	"net/http/httptest"
+	"strings"
+	"testing"
+	"time"
+)
+
+func liveServer(t *testing.T, hub *Hub) (*httptest.Server, *int) {
+	t.Helper()
+	builds := 0
+	srv := httptest.NewServer(Handler([]byte("PAGE"), Views{
+		Scan: func(context.Context) ([]byte, uint64, error) { builds++; return []byte(`{"scanned":true}`), 5, nil },
+		Hub:  hub,
+	}))
+	t.Cleanup(srv.Close)
+	return srv, &builds
+}
+
+func request(t *testing.T, url string, hdr map[string]string) *http.Response {
+	t.Helper()
+	req, err := http.NewRequest("GET", url, nil)
+	if err != nil {
+		t.Fatal(err)
+	}
+	for k, v := range hdr {
+		req.Header.Set(k, v)
+	}
+	resp, err := http.DefaultClient.Do(req)
+	if err != nil {
+		t.Fatal(err)
+	}
+	return resp
+}
+
+// events reads the stream's events as "name data" lines.
+func events(t *testing.T, body io.Reader) <-chan string {
+	t.Helper()
+	out := make(chan string, 16)
+	go func() {
+		defer close(out)
+		sc := bufio.NewScanner(body)
+		var name string
+		for sc.Scan() {
+			switch line := sc.Text(); {
+			case strings.HasPrefix(line, "event: "):
+				name = strings.TrimPrefix(line, "event: ")
+			case strings.HasPrefix(line, "data: "):
+				out <- name + " " + strings.TrimPrefix(line, "data: ")
+			}
+		}
+	}()
+	return out
+}
+
+func expect(t *testing.T, got <-chan string, want string) {
+	t.Helper()
+	select {
+	case e, ok := <-got:
+		if !ok {
+			t.Fatalf("the stream ended; want %q", want)
+		}
+		if e != want {
+			t.Fatalf("event %q, want %q", e, want)
+		}
+	case <-time.After(5 * time.Second):
+		t.Fatalf("no event; want %q", want)
+	}
+}
+
+// GET /events streams the latest View's generation, at once and on each
+// change, and the notice, one line; closing the Hub ends the stream.
+func TestEventsStreamTheLatestGeneration(t *testing.T) {
+	hub := NewHub([]byte(`{"v":1}`))
+	srv, builds := liveServer(t, hub)
+	resp := request(t, srv.URL+"/events", map[string]string{"Sec-Fetch-Site": "same-origin"})
+	defer resp.Body.Close()
+	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "text/event-stream" || resp.Header.Get("Cache-Control") != "no-store" {
+		t.Fatalf("/events = %d %q", resp.StatusCode, resp.Header.Get("Content-Type"))
+	}
+	got := events(t, resp.Body)
+	expect(t, got, "view 1")
+	expect(t, got, "notice ")
+	hub.Notify("a.go:3:1: expected '}'\nfound EOF")
+	expect(t, got, "notice a.go:3:1: expected '}' found EOF")
+	hub.Publish([]byte(`{"v":2}`))
+	expect(t, got, "view 2")
+	expect(t, got, "notice ")
+	hub.Close()
+	if e, ok := <-got; ok {
+		t.Errorf("after Close: %q, want the stream to end", e)
+	}
+	if *builds != 0 {
+		t.Errorf("%d rescans", *builds)
+	}
+}
+
+// GET /view.json?latest answers the Hub's View and generation without a
+// rescan; a plain GET /view.json rescans, as in 10, and says the generation
+// Scan read under the lock the watch publishes under (13, scrutiny M1).
+func TestViewLatestAnswersWithoutARescan(t *testing.T) {
+	hub := NewHub([]byte(`{"v":1}`))
+	hub.Publish([]byte(`{"v":2}`))
+	srv, builds := liveServer(t, hub)
+	for path, want := range map[string][2]string{"/view.json?latest": {`{"v":2}`, "2"}, "/view.json": {`{"scanned":true}`, "5"}} {
+		resp := request(t, srv.URL+path, nil)
+		body, _ := io.ReadAll(resp.Body)
+		resp.Body.Close()
+		if string(body) != want[0] || resp.Header.Get("Zu-Generation") != want[1] || resp.Header.Get("Content-Type") != "application/json" {
+			t.Errorf("%s = %s, generation %q", path, body, resp.Header.Get("Zu-Generation"))
+		}
+	}
+	if *builds != 1 {
+		t.Errorf("%d rescans, want 1", *builds)
+	}
+}
+
+// Another site's page may not read the stream, nor hold a connection
+// open, and without a Hub (zu serve -poll 0) there is none.
+func TestEventsOnlyForItsOwnPage(t *testing.T) {
+	srv, _ := liveServer(t, NewHub(nil))
+	for site, want := range map[string]int{"same-site": 403, "cross-site": 403} {
+		resp := request(t, srv.URL+"/events", map[string]string{"Sec-Fetch-Site": site})
+		resp.Body.Close()
+		if resp.StatusCode != want {
+			t.Errorf("Sec-Fetch-Site %q: %d, want %d", site, resp.StatusCode, want)
+		}
+	}
+	none, _ := liveServer(t, nil)
+	for _, path := range []string{"/events", "/view.json?latest"} {
+		resp := request(t, none.URL+path, nil)
+		resp.Body.Close()
+		if want := map[string]int{"/events": 404, "/view.json?latest": 200}[path]; resp.StatusCode != want {
+			t.Errorf("no Hub, %s: %d, want %d", path, resp.StatusCode, want)
+		}
+	}
+}
diff --git a/internal/serve/serve_test.go b/internal/serve/serve_test.go
index 97fa074..6c61bf3 100644
--- a/internal/serve/serve_test.go
+++ b/internal/serve/serve_test.go
@@ -93,10 +93,11 @@ func get(t *testing.T, method, path, host string, hdr map[string]string, view fu
 	if view == nil {
 		view = func(context.Context) ([]byte, error) { return []byte(`{"schema":"1"}`), nil }
 	}
-	h := Handler([]byte("PAGE"), func(ctx context.Context) ([]byte, error) {
+	h := Handler([]byte("PAGE"), Views{Scan: func(ctx context.Context) ([]byte, uint64, error) {
 		builds++
-		return view(ctx)
-	})
+		data, err := view(ctx)
+		return data, 0, err
+	}})
 	r := httptest.NewRequest(method, path, nil)
 	r.Host = host
 	for k, v := range hdr {
@@ -138,7 +139,7 @@ func TestHandlerAnswersOnlyRequestsForThisMachine(t *testing.T) {
 		}
 	}
 	for _, host := range []string{"", "evil.example", "evil.example:7433", "localhost.evil.example", "10.0.0.1:7433", "[::]:7433"} {
-		for _, path := range []string{"/", "/view.json"} {
+		for _, path := range []string{"/", "/view.json", "/events"} {
 			w, builds := get(t, "GET", path, host, nil, nil)
 			if w.Code != http.StatusMisdirectedRequest || builds != 0 {
 				t.Errorf("Host %q %s: %d, %d builds", host, path, w.Code, builds)
```

- [x] **Run:** `go test ./internal/serve/` Expected: FAIL (`undefined: Hub`, `undefined: Views`, `undefined: NewHub`)

- [x] **Implement**

```diff
diff --git a/internal/cli/serve.go b/internal/cli/serve.go
index 573a631..5caf4d5 100644
--- a/internal/cli/serve.go
+++ b/internal/cli/serve.go
@@ -62,7 +62,10 @@ func runServe(args []string, stdout, stderr io.Writer) int {
 	if _, err := s.view(ctx); err != nil { // a tree zu cannot scan fails here, not in the page
 		return bad(err)
 	}
-	srv := newServer(serve.Handler(page, s.view))
+	srv := newServer(serve.Handler(page, serve.Views{Scan: func(ctx context.Context) ([]byte, uint64, error) {
+		data, err := s.view(ctx)
+		return data, 0, err
+	}}))
 	done := make(chan error, 1)
 	go func() { done <- srv.Serve(ln) }()
 	fmt.Fprintf(stdout, "http://%s/\n", ln.Addr())
@@ -78,7 +81,8 @@ func runServe(args []string, stdout, stderr io.Writer) int {
 }
 
 // newServer bounds how long a client may take to send its headers and keep
-// an idle connection open.
+// an idle connection open. It sets no WriteTimeout: one would cut 13's
+// /events stream, which stays open while the page does.
 func newServer(h http.Handler) *http.Server {
 	return &http.Server{Handler: h, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
 }
diff --git a/internal/serve/live.go b/internal/serve/live.go
new file mode 100644
index 0000000..5776b3e
--- /dev/null
+++ b/internal/serve/live.go
@@ -0,0 +1,129 @@
+package serve
+
+import (
+	"fmt"
+	"net/http"
+	"strings"
+	"sync"
+)
+
+// Hub holds what zu serve's watch last built (13): the latest View, its
+// generation, and a notice for the page, and wakes every open stream when
+// one changes. Safe for concurrent use.
+type Hub struct {
+	mu     sync.Mutex
+	view   []byte
+	gen    uint64
+	notice string
+	subs   map[chan struct{}]bool
+	closed bool
+}
+
+// NewHub starts at generation 1 with view.
+func NewHub(view []byte) *Hub {
+	return &Hub{view: view, gen: 1, subs: map[chan struct{}]bool{}}
+}
+
+// Publish makes view the latest View, under the next generation, and clears
+// the notice.
+func (h *Hub) Publish(view []byte) {
+	h.set(func() { h.view, h.gen, h.notice = view, h.gen+1, "" })
+}
+
+// Notify sets the notice the page shows over its drawing; "" clears it.
+func (h *Hub) Notify(text string) {
+	h.set(func() { h.notice = text })
+}
+
+// Latest returns the latest View, its generation and the notice.
+func (h *Hub) Latest() (view []byte, gen uint64, notice string) {
+	h.mu.Lock()
+	defer h.mu.Unlock()
+	return h.view, h.gen, h.notice
+}
+
+// Close ends every stream, now and later: zu serve is stopping.
+func (h *Hub) Close() {
+	h.mu.Lock()
+	defer h.mu.Unlock()
+	if h.closed {
+		return
+	}
+	h.closed = true
+	for c := range h.subs {
+		close(c)
+	}
+	clear(h.subs)
+}
+
+func (h *Hub) set(change func()) {
+	h.mu.Lock()
+	defer h.mu.Unlock()
+	change()
+	for c := range h.subs {
+		select { // a stream that has not caught up yet reads the latest anyway
+		case c <- struct{}{}:
+		default:
+		}
+	}
+}
+
+// subscribe returns a channel that is signalled after each change and
+// closed with the Hub, and a function to stop.
+func (h *Hub) subscribe() (<-chan struct{}, func()) {
+	c := make(chan struct{}, 1)
+	h.mu.Lock()
+	defer h.mu.Unlock()
+	if h.closed {
+		close(c)
+		return c, func() {}
+	}
+	h.subs[c] = true
+	return c, func() {
+		h.mu.Lock()
+		defer h.mu.Unlock()
+		if h.subs[c] {
+			delete(h.subs, c)
+		}
+	}
+}
+
+// stream is GET /events: Server-Sent Events, "view" with the latest
+// generation and "notice" with the notice, each sent at once and again
+// whenever it changes.
+func (h *Hub) stream(w http.ResponseWriter, r *http.Request) {
+	fl, ok := w.(http.Flusher)
+	if !ok {
+		http.Error(w, "zu serve cannot stream here", http.StatusInternalServerError)
+		return
+	}
+	w.Header().Set("Content-Type", "text/event-stream")
+	w.WriteHeader(http.StatusOK)
+	if r.Method == http.MethodHead {
+		return
+	}
+	wake, stop := h.subscribe()
+	defer stop()
+	var sentGen uint64
+	sentNotice := "\x00" // never a notice, so the first is sent
+	for {
+		_, gen, notice := h.Latest()
+		if gen != sentGen {
+			fmt.Fprintf(w, "event: view\ndata: %d\n\n", gen)
+			sentGen = gen
+		}
+		if notice != sentNotice {
+			fmt.Fprintf(w, "event: notice\ndata: %s\n\n", strings.Join(strings.Fields(notice), " "))
+			sentNotice = notice
+		}
+		fl.Flush()
+		select {
+		case <-r.Context().Done():
+			return
+		case _, ok := <-wake:
+			if !ok {
+				return
+			}
+		}
+	}
+}
diff --git a/internal/serve/serve.go b/internal/serve/serve.go
index 9e361be..4704b8e 100644
--- a/internal/serve/serve.go
+++ b/internal/serve/serve.go
@@ -10,6 +10,7 @@ import (
 	"fmt"
 	"net"
 	"net/http"
+	"strconv"
 	"strings"
 	"syscall"
 )
@@ -72,11 +73,24 @@ func loopbackHost(hostport string) bool {
 	return strings.EqualFold(host, "localhost") || loopbackIP(host)
 }
 
-// Handler serves page at / and, at /view.json, the View JSON that view
-// builds for each request. It answers only requests whose Host names this
-// machine, which defeats DNS rebinding, and builds the View only for its own
+// Views is what Handler serves besides the page.
+type Views struct {
+	// Scan rescans the tree and returns the View JSON: GET /view.json. With
+	// a Hub it returns too the generation of the Hub's View, read under the
+	// lock the watch publishes under (13), so the View is at least that new;
+	// else 0.
+	Scan func(context.Context) ([]byte, uint64, error)
+	// Hub, when set, is the watch's latest View (13): GET /view.json?latest
+	// answers it without a rescan, and GET /events streams its changes.
+	Hub *Hub
+}
+
+// Handler serves page at /; at /view.json, the View JSON that v.Scan builds
+// for each request, or with ?latest v.Hub's; and at /events, v.Hub's
+// changes. It answers only requests whose Host names this machine, which
+// defeats DNS rebinding, and serves the View and its changes only to its own
 // page: a request another site's page makes is refused before any scan.
-func Handler(page []byte, view func(context.Context) ([]byte, error)) http.Handler {
+func Handler(page []byte, v Views) http.Handler {
 	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
 		h := w.Header()
 		h.Set("Content-Security-Policy", "frame-ancestors 'none'") // the page's meta CSP cannot say this
@@ -92,17 +106,28 @@ func Handler(page []byte, view func(context.Context) ([]byte, error)) http.Handl
 		case r.URL.Path == "/":
 			h.Set("Content-Type", "text/html; charset=utf-8")
 			_, _ = w.Write(page)
-		case r.URL.Path != "/view.json":
+		case r.URL.Path != "/view.json" && (r.URL.Path != "/events" || v.Hub == nil):
 			http.NotFound(w, r)
 		case crossSite(r):
 			http.Error(w, "zu serve sends the View only to its own page", http.StatusForbidden)
+		case r.URL.Path == "/events":
+			v.Hub.stream(w, r)
 		default:
-			data, err := view(r.Context())
-			if err != nil {
-				http.Error(w, err.Error(), http.StatusInternalServerError)
-				return
+			var data []byte
+			var gen uint64
+			if v.Hub != nil && r.URL.Query().Has("latest") {
+				data, gen, _ = v.Hub.Latest()
+			} else {
+				var err error
+				if data, gen, err = v.Scan(r.Context()); err != nil {
+					http.Error(w, err.Error(), http.StatusInternalServerError)
+					return
+				}
 			}
 			h.Set("Content-Type", "application/json")
+			if gen > 0 {
+				h.Set("Zu-Generation", strconv.FormatUint(gen, 10))
+			}
 			_, _ = w.Write(data)
 		}
 	})
```

- [x] **Run:** `go test -race ./... && go vet ./...` Expected: PASS

- [x] **Commit:** `Stream the latest View's generation and notice at /events`

### Task 4: `zu serve` watches (`-poll`)

- `runServe` makes the Hub from the first scan and runs the watch until shutdown.
- `session.view` returns the Hub's generation, read under the mutex (M1a). It counts page scans (`scans`). The first scan keeps its listing, its tree (whose stamps are the watch's base), the Policy's stamp, its parse-error paths and its commit.
- `session.build` is the scan both paths share. It runs `gitHead` beside `scan.Run` (fix 2).
- `session.watch` gives the Watcher:
  - `Meta`, which asks `gitref.Meta` again at each listing;
  - `Always`, the Policy;
  - `Kept`, from the first scan;
  - `Polling`, which sets `polledAt`.
- `session.changed`:
  - relists under the mutex if a page scan ran since the poll began (M1b);
  - rescans with trusted stamps, over `ListTree` inside git and through `openSource` outside it;
  - holds, publishes or clears (Deviation 5). It does not hold on a parse error when the commit moved.
- `gitref.Meta` names `HEAD`, `index`, `packed-refs` and the ref `HEAD` names, from the git and common directories.
- 10's `TestServeRescansOnlyWhatChanged` counts parses per page load, so it runs with `-poll 0`.

The end-to-end tests run `zu serve -poll 100ms` in and out of git:
- an add;
- an empty directory, then a file saved in it half a second later (B1);
- a commit;
- a broken file held, then fixed;
- a broken file committed, and drawn;
- a bad Policy that git ignores, held, then good again.

Two session tests drive `view` and `changed` directly, one for each M1 race.

**Files:**
- Tests: `internal/cli/watch_test.go`, `internal/cli/serve_test.go`, `internal/gitref/gitref_test.go`
- Code: `internal/cli/watch.go`, `internal/cli/serve.go`, `internal/cli/scan.go`, `internal/gitref/gitref.go`, `internal/scan/cache.go`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/internal/cli/serve_test.go b/internal/cli/serve_test.go
index 3430aa7..46858e8 100644
--- a/internal/cli/serve_test.go
+++ b/internal/cli/serve_test.go
@@ -114,7 +114,7 @@ func TestServeSendsTheViewScanHTMLInlines(t *testing.T) {
 // Every load of the page rescans, parsing only the files that changed.
 func TestServeRescansOnlyWhatChanged(t *testing.T) {
 	dir := repo(t, small)
-	url, stderr := startServe(t, dir)
+	url, stderr := startServe(t, dir, "-poll", "0") // no watch: every line is a page load's
 	if !strings.Contains(stderr.String(), "1 files, 1 parsed") {
 		t.Errorf("startup scan: %s", stderr.String())
 	}
@@ -148,6 +148,8 @@ func TestServeBadInvocations(t *testing.T) {
 		{[]string{"-html", "x.html"}, "flag provided but not defined: -html"},
 		{[]string{"-ref", "HEAD"}, "flag provided but not defined: -ref"},
 		{[]string{noGoMod}, "no go.mod"},
+		{[]string{"-poll", "-1s"}, "-poll -1s: want 0 (off) or at least 100ms"},
+		{[]string{"-poll", "10ms"}, "-poll 10ms: want 0 (off) or at least 100ms"},
 	} {
 		dir := repo(t, small)
 		args := append([]string{"serve", "-addr", "127.0.0.1:0", dir}, tc.args...)
@@ -201,7 +203,7 @@ func TestServeRescansOneAtATime(t *testing.T) {
 		wg.Add(1)
 		go func() {
 			defer wg.Done()
-			if _, err := s.view(context.Background()); err != nil {
+			if _, _, err := s.view(context.Background()); err != nil {
 				t.Error(err)
 			}
 		}()
diff --git a/internal/cli/watch_test.go b/internal/cli/watch_test.go
new file mode 100644
index 0000000..c262cf7
--- /dev/null
+++ b/internal/cli/watch_test.go
@@ -0,0 +1,294 @@
+package cli
+
+import (
+	"bufio"
+	"context"
+	"io"
+	"net/http"
+	"net/http/httptest"
+	"os"
+	"path/filepath"
+	"strings"
+	"testing"
+	"time"
+
+	"zu/internal/scan"
+	"zu/internal/serve"
+)
+
+// stream opens zu serve's /events and returns its events as "name data".
+func stream(t *testing.T, url string) <-chan string {
+	t.Helper()
+	resp, err := http.Get(url + "events")
+	if err != nil {
+		t.Fatal(err)
+	}
+	if resp.StatusCode != 200 {
+		t.Fatalf("/events: %d", resp.StatusCode)
+	}
+	t.Cleanup(func() { resp.Body.Close() })
+	out := make(chan string, 16)
+	go func() {
+		defer close(out)
+		sc := bufio.NewScanner(resp.Body)
+		var name string
+		for sc.Scan() {
+			switch line := sc.Text(); {
+			case strings.HasPrefix(line, "event: "):
+				name = strings.TrimPrefix(line, "event: ")
+			case strings.HasPrefix(line, "data: "):
+				out <- name + " " + strings.TrimPrefix(line, "data: ")
+			}
+		}
+	}()
+	return out
+}
+
+// await returns the next event that is not an empty notice.
+func await(t *testing.T, events <-chan string) string {
+	t.Helper()
+	for {
+		select {
+		case e, ok := <-events:
+			if !ok {
+				t.Fatal("the stream ended")
+			}
+			if e != "notice " {
+				return e
+			}
+		case <-time.After(10 * time.Second):
+			t.Fatal("no event")
+		}
+	}
+}
+
+func latest(t *testing.T, url string) string {
+	t.Helper()
+	resp, err := http.Get(url + "view.json?latest")
+	if err != nil {
+		t.Fatal(err)
+	}
+	defer resp.Body.Close()
+	b, err := io.ReadAll(resp.Body)
+	if err != nil {
+		t.Fatal(err)
+	}
+	return string(b)
+}
+
+// zu serve watches the working tree: a change is rescanned once and pushed
+// as a new generation, without a page load, in a git repository and out of
+// one. In git, a commit that changes no file is a change too: the View's
+// commit moves.
+func TestServeWatchPushesAChange(t *testing.T) {
+	for _, inGit := range []bool{false, true} {
+		dir := repo(t, small)
+		if inGit {
+			needGit(t)
+			git(t, dir, "init", "-q")
+			git(t, dir, "add", "-A")
+			git(t, dir, "commit", "-q", "-m", "one")
+		}
+		url, stderr := startServe(t, dir, "-poll", "100ms")
+		events := stream(t, url)
+		if e := await(t, events); e != "view 1" {
+			t.Fatalf("git %v, on connect: %q", inGit, e)
+		}
+		writeFile(t, dir, "c/c.go", "package c\n")
+		if e := await(t, events); e != "view 2" {
+			t.Fatalf("git %v, after an add: %q", inGit, e)
+		}
+		if v := latest(t, url); !strings.Contains(v, `"id":"example.com/m/c"`) {
+			t.Errorf("git %v: the latest View lacks c: %.300s", inGit, v)
+		}
+		// A directory made empty, then a file saved in it a while later
+		// (scrutiny B1).
+		if err := os.MkdirAll(filepath.Join(dir, "d", "e"), 0o755); err != nil {
+			t.Fatal(err)
+		}
+		time.Sleep(500 * time.Millisecond)
+		writeFile(t, dir, "d/e/e.go", "package e\n")
+		if e := await(t, events); e != "view 3" {
+			t.Fatalf("git %v, after an add in a new directory: %q", inGit, e)
+		}
+		if v := latest(t, url); !strings.Contains(v, `"id":"example.com/m/d/e"`) {
+			t.Errorf("git %v: the latest View lacks d/e: %.300s", inGit, v)
+		}
+		if inGit {
+			head := git(t, dir, "rev-parse", "HEAD")
+			git(t, dir, "add", "-A")
+			git(t, dir, "commit", "-q", "-m", "add c")
+			if e := await(t, events); e != "view 4" {
+				t.Fatalf("after a commit: %q", e)
+			}
+			if v := latest(t, url); strings.Contains(v, head) || !strings.Contains(v, git(t, dir, "rev-parse", "HEAD")) {
+				t.Errorf("the latest View is not at the new commit: %.300s", v)
+			}
+		}
+		if !strings.Contains(stderr.String(), "zu serve: watch: scanned in ") {
+			t.Errorf("stderr: %s", stderr.String())
+		}
+	}
+}
+
+// While a changed file does not parse, zu serve keeps the last View and
+// says why; once it parses again, the change is pushed. A parse error the
+// last View already had does not hold anything back, and neither does one
+// at a new commit: the View must say what was committed.
+func TestServeWatchKeepsTheViewWhileAFileDoesNotParse(t *testing.T) {
+	needGit(t)
+	dir := repo(t, map[string]string{
+		"go.mod": "module example.com/m\n", "a/a.go": "package a\n", "old/bad.go": "package old\n\nfunc {\n",
+	})
+	git(t, dir, "init", "-q")
+	git(t, dir, "add", "-A")
+	git(t, dir, "commit", "-q", "-m", "one")
+	url, stderr := startServe(t, dir, "-poll", "100ms")
+	events := stream(t, url)
+	await(t, events)
+	before := latest(t, url)
+	writeFile(t, dir, "a/a.go", "package a\n\nfunc F( {\n")
+	if e := await(t, events); !strings.HasPrefix(e, "notice a/a.go:") {
+		t.Fatalf("a broken file: %q", e)
+	}
+	if latest(t, url) != before {
+		t.Error("the View changed while a/a.go did not parse")
+	}
+	writeFile(t, dir, "a/a.go", "package a\n\nfunc F() {}\n")
+	if e := await(t, events); e != "view 2" {
+		t.Fatalf("fixed: %q", e)
+	}
+	if v := latest(t, url); !strings.Contains(v, `"id":"example.com/m/a","kind":"package","module":"example.com/m","loc":{"path":"a/a.go","line":1},"decls":1}`) {
+		t.Errorf("the fixed View lacks a.F: %.300s", v)
+	}
+	if !strings.Contains(stderr.String(), "a/a.go:3:") || !strings.Contains(stderr.String(), "the page keeps its drawing") {
+		t.Errorf("stderr: %s", stderr.String())
+	}
+
+	writeFile(t, dir, "b/b.go", "package b\n\nfunc {\n")
+	if e := await(t, events); !strings.HasPrefix(e, "notice b/b.go:") {
+		t.Fatalf("another broken file: %q", e)
+	}
+	git(t, dir, "add", "-A")
+	git(t, dir, "commit", "-q", "-m", "broken b")
+	if e := await(t, events); e != "view 3" {
+		t.Fatalf("the broken file committed: %q", e)
+	}
+	if v := latest(t, url); !strings.Contains(v, git(t, dir, "rev-parse", "HEAD")) {
+		t.Errorf("the View is not at the new commit: %.300s", v)
+	}
+}
+
+// A rescan that fails, here on a Policy that does not load, keeps the last
+// View too. The Policy is watched though git ignores it.
+func TestServeWatchKeepsTheViewWhenARescanFails(t *testing.T) {
+	needGit(t)
+	dir := repo(t, small)
+	writeFile(t, dir, ".gitignore", "zu.policy.yaml\n")
+	git(t, dir, "init", "-q")
+	git(t, dir, "add", "-A")
+	git(t, dir, "commit", "-q", "-m", "one")
+	url, stderr := startServe(t, dir, "-poll", "100ms")
+	events := stream(t, url)
+	await(t, events)
+	writeFile(t, dir, "zu.policy.yaml", "levels: [\n")
+	if e := await(t, events); !strings.HasPrefix(e, "notice rescan failed: ") {
+		t.Fatalf("a bad Policy: %q; %s", e, stderr.String())
+	}
+	writeFile(t, dir, "zu.policy.yaml", "levels: []\n")
+	select { // the notice clears; the View may be unchanged
+	case e := <-events:
+		if e != "notice " && e != "view 2" {
+			t.Fatalf("a good Policy again: %q", e)
+		}
+	case <-time.After(10 * time.Second):
+		t.Fatal("the notice stayed")
+	}
+}
+
+// watchSession is zu serve's session over dir after its first scan, with a
+// Hub, as runServe makes it, but no watch running: a test drives it.
+func watchSession(t *testing.T, dir string) *session {
+	t.Helper()
+	withUI(t)
+	o := &htmlOptions{}
+	if err := o.load(); err != nil {
+		t.Fatal(err)
+	}
+	s := &session{dir: dir, o: o, cache: scan.NewCache(), stderr: io.Discard}
+	first, _, err := s.view(context.Background())
+	if err != nil {
+		t.Fatal(err)
+	}
+	s.hub = serve.NewHub(first)
+	return s
+}
+
+func committed(t *testing.T) string {
+	t.Helper()
+	needGit(t)
+	dir := repo(t, small)
+	git(t, dir, "init", "-q")
+	git(t, dir, "add", "-A")
+	git(t, dir, "commit", "-q", "-m", "one")
+	return dir
+}
+
+// A page load that waits for a watch's rescan says the generation that
+// rescan published: the generation is read under the session's lock, so
+// the page never draws a View newer than it thinks (13, scrutiny M1).
+func TestServePageLoadReadsTheGenerationUnderTheLock(t *testing.T) {
+	dir := committed(t)
+	s := watchSession(t, dir)
+	writeFile(t, dir, "c/c.go", "package c\n")
+	l, err := s.list(context.Background())
+	if err != nil {
+		t.Fatal(err)
+	}
+	inside, release := make(chan struct{}), make(chan struct{})
+	s.scanning = func() {
+		s.scanning = nil // the page load's own scan does not wait
+		close(inside)
+		<-release
+	}
+	go s.changed(context.Background(), l)
+	<-inside // the rescan holds the lock
+	srv := httptest.NewServer(serve.Handler([]byte("PAGE"), serve.Views{Scan: s.view, Hub: s.hub}))
+	defer srv.Close()
+	gen := make(chan string, 1)
+	go func() {
+		resp, err := http.Get(srv.URL + "/view.json")
+		if err != nil {
+			gen <- err.Error()
+			return
+		}
+		resp.Body.Close()
+		gen <- resp.Header.Get("Zu-Generation")
+	}()
+	time.Sleep(200 * time.Millisecond) // the page load waits for the lock
+	close(release)
+	if g := <-gen; g != "2" {
+		t.Errorf("Zu-Generation %q, want 2: the View the page got is at least the rescan's", g)
+	}
+}
+
+// A page load that listed a file the watch's listing lacks makes the watch
+// list again before it rescans, so the View it publishes never drops a file
+// the page already drew (13, scrutiny M1).
+func TestServeWatchListsAgainAfterAPageLoad(t *testing.T) {
+	dir := committed(t)
+	s := watchSession(t, dir)
+	s.polling() // the watch polls, then lists
+	l, err := s.list(context.Background())
+	if err != nil {
+		t.Fatal(err)
+	}
+	writeFile(t, dir, "c/c.go", "package c\n")
+	if _, _, err := s.view(context.Background()); err != nil { // a page load draws c
+		t.Fatal(err)
+	}
+	s.changed(context.Background(), l)
+	if v, _, _ := s.hub.Latest(); !strings.Contains(string(v), `"id":"example.com/m/c"`) {
+		t.Errorf("the watch published a View without c: %.300s", v)
+	}
+}
diff --git a/internal/gitref/gitref_test.go b/internal/gitref/gitref_test.go
index 0970a17..954e426 100644
--- a/internal/gitref/gitref_test.go
+++ b/internal/gitref/gitref_test.go
@@ -5,6 +5,7 @@ import (
 	"os"
 	"os/exec"
 	"path/filepath"
+	"slices"
 	"testing"
 )
 
@@ -157,3 +158,42 @@ func TestOrigin(t *testing.T) {
 		t.Errorf("Origin = %q", got)
 	}
 }
+
+// Meta names the files a commit, checkout, reset or add rewrites, which 13's
+// watch polls beside the tree: HEAD, the index, the ref HEAD names and
+// packed-refs. A ref lives in the common directory of a linked worktree.
+func TestMeta(t *testing.T) {
+	needGit(t)
+	dir := t.TempDir()
+	run(t, dir, "init", "-q")
+	run(t, dir, "symbolic-ref", "HEAD", "refs/heads/trunk")
+	top, err := filepath.EvalSymlinks(dir)
+	if err != nil {
+		t.Fatal(err)
+	}
+	g := filepath.Join(top, ".git")
+	want := []string{filepath.Join(g, "HEAD"), filepath.Join(g, "index"), filepath.Join(g, "packed-refs"), filepath.Join(g, "refs", "heads", "trunk")}
+	if got := Meta(context.Background(), dir); !slices.Equal(got, want) {
+		t.Errorf("Meta = %v, want %v", got, want)
+	}
+	run(t, dir, "commit", "-q", "--allow-empty", "-m", "one")
+	wt := filepath.Join(t.TempDir(), "wt")
+	run(t, dir, "worktree", "add", "-q", "-b", "side", wt)
+	wtop, err := filepath.EvalSymlinks(wt)
+	if err != nil {
+		t.Fatal(err)
+	}
+	wg := filepath.Join(g, "worktrees", filepath.Base(wtop))
+	want = []string{filepath.Join(wg, "HEAD"), filepath.Join(wg, "index"), filepath.Join(g, "packed-refs"), filepath.Join(g, "refs", "heads", "side")}
+	if got := Meta(context.Background(), wt); !slices.Equal(got, want) {
+		t.Errorf("a linked worktree: Meta = %v, want %v", got, want)
+	}
+	run(t, dir, "checkout", "-q", "--detach")
+	want = []string{filepath.Join(g, "HEAD"), filepath.Join(g, "index"), filepath.Join(g, "packed-refs")}
+	if got := Meta(context.Background(), dir); !slices.Equal(got, want) {
+		t.Errorf("a detached HEAD: Meta = %v, want %v", got, want)
+	}
+	if got := Meta(context.Background(), t.TempDir()); got != nil {
+		t.Errorf("outside a repository: %v", got)
+	}
+}
```

- [x] **Run:** `go test ./internal/cli/ ./internal/gitref/` Expected: FAIL (`undefined: Meta`; `s.view` returns 2 values)

- [x] **Implement**

```diff
diff --git a/internal/cli/scan.go b/internal/cli/scan.go
index 528ab35..bb9a3d1 100644
--- a/internal/cli/scan.go
+++ b/internal/cli/scan.go
@@ -136,8 +136,11 @@ type source struct {
 	root  string  // where default output goes
 	ref   *ir.Ref // known up front for a commit; nil for the working tree
 	extra bool    // the working tree has files HEAD lacks: the IR is dirty
-	err   func() error
-	close func()
+	// listing is what git listed of the working tree; nil for a commit or
+	// outside git. zu serve's watch starts from it (13).
+	listing *gitref.Listing
+	err     func() error
+	close   func()
 }
 
 // openSource opens the commit ref names or, without one, the working tree:
@@ -160,7 +163,7 @@ func openSource(ctx context.Context, dir, ref string, withIgnored bool) (*source
 		}
 		none := func() error { return nil }
 		return &source{
-			tree: tree, root: dir, extra: listing != nil && listing.Extra,
+			tree: tree, root: dir, extra: listing != nil && listing.Extra, listing: listing,
 			err: none, close: func() {},
 		}, nil
 	}
diff --git a/internal/cli/serve.go b/internal/cli/serve.go
index 5caf4d5..f9ae039 100644
--- a/internal/cli/serve.go
+++ b/internal/cli/serve.go
@@ -7,11 +7,16 @@ import (
 	"fmt"
 	"io"
 	"net/http"
+	"os"
+	"path/filepath"
 	"sync"
+	"sync/atomic"
 	"time"
 
 	"zu/internal/export"
+	"zu/internal/gitref"
 	"zu/internal/ir"
+	"zu/internal/policy"
 	"zu/internal/scan"
 	"zu/internal/serve"
 )
@@ -29,6 +34,7 @@ func runServe(args []string, stdout, stderr io.Writer) int {
 	fs.Var(&o.include, "include", "inline declarations and source of packages matching `pattern` (repeatable; ./ = root module)")
 	fs.StringVar(&o.linkTmpl, "link-template", "", "source link `url` with {commit} {path} {line}; overrides origin detection")
 	fs.StringVar(&o.cover, "coverprofile", "", "colour packages by CRAP from `file`, written by go test -coverprofile over this tree; read once, at start")
+	poll := fs.Duration("poll", time.Second, "look for changes every `interval` and redraw the open page; 0: never")
 	dir, err := parseWithDir(fs, args)
 	if err != nil {
 		if !errors.Is(err, flag.ErrHelp) {
@@ -40,6 +46,9 @@ func runServe(args []string, stdout, stderr io.Writer) int {
 		fmt.Fprintf(stderr, "zu serve: %v\n", err)
 		return ExitBadInvocation
 	}
+	if *poll < 0 || *poll > 0 && *poll < minPoll {
+		return bad(fmt.Errorf("-poll %v: want 0 (off) or at least %v", *poll, minPoll))
+	}
 	if err := o.load(); err != nil {
 		return bad(err)
 	}
@@ -59,13 +68,30 @@ func runServe(args []string, stdout, stderr io.Writer) int {
 	ctx, stop := interruptContext()
 	defer stop()
 	s := &session{dir: dir, o: &o, cache: scan.NewCache(), stderr: stderr}
-	if _, err := s.view(ctx); err != nil { // a tree zu cannot scan fails here, not in the page
+	first, _, err := s.view(ctx)
+	if err != nil { // a tree zu cannot scan fails here, not in the page
 		return bad(err)
 	}
-	srv := newServer(serve.Handler(page, serve.Views{Scan: func(ctx context.Context) ([]byte, uint64, error) {
-		data, err := s.view(ctx)
-		return data, 0, err
-	}}))
+	var hub *serve.Hub
+	if *poll > 0 {
+		hub = serve.NewHub(first)
+		s.hub = hub
+	}
+	srv := newServer(serve.Handler(page, serve.Views{Scan: s.view, Hub: hub}))
+	if hub != nil {
+		srv.RegisterOnShutdown(hub.Close) // open streams end, so Shutdown need not wait them out
+		wctx, stopWatch := context.WithCancel(ctx)
+		var watching sync.WaitGroup
+		watching.Add(1)
+		go func() {
+			defer watching.Done()
+			s.watch(wctx, *poll)
+		}()
+		defer func() {
+			stopWatch()
+			watching.Wait()
+		}()
+	}
 	done := make(chan error, 1)
 	go func() { done <- srv.Serve(ln) }()
 	fmt.Fprintf(stdout, "http://%s/\n", ln.Addr())
@@ -96,45 +122,98 @@ type session struct {
 	stderr io.Writer
 	// scanning, when set, runs while a rescan holds mu (a test seam).
 	scanning func()
+
+	// The watch (13), guarded by mu. hub is nil with -poll 0.
+	hub    *serve.Hub
+	begun  bool            // the first scan ran: the fields below are set
+	git    bool            // the tree is a git working tree
+	seen   *gitref.Listing // what the first scan listed; nil outside git
+	first  scan.Tree       // the first scan's tree, which knows each listed file's Stamp
+	policy scan.Stamp      // the Policy's, taken before the first scan read it
+	errs   map[string]bool // the paths with parse errors in the View hub holds
+	commit string          // the commit of the View hub holds
+
+	// scans counts page loads' scans; polledAt is scans when the watch
+	// last began a poll. When they differ, a page load may have listed a
+	// file the watch's listing lacks.
+	scans, polledAt atomic.Int64
 }
 
 // view rescans the working tree under its Policy, as zu scan does, and
-// returns the Project View JSON that zu scan -html would inline.
-func (s *session) view(ctx context.Context) ([]byte, error) {
+// returns the Project View JSON that zu scan -html would inline, and the
+// generation of the watch's latest View (0 without a watch), read under mu:
+// the View returned is at least that new. It reads and hashes every file,
+// as a page load always has (10 Deviation 3).
+func (s *session) view(ctx context.Context) ([]byte, uint64, error) {
 	s.mu.Lock()
 	defer s.mu.Unlock()
 	if s.scanning != nil {
 		s.scanning()
 	}
-	start := time.Now()
+	if !s.begun {
+		fi, _ := os.Lstat(filepath.Join(s.dir, policy.FileName))
+		s.policy = scan.StampOf(fi)
+	}
 	src, err := openSource(ctx, s.dir, "", false)
 	if err != nil {
-		return nil, err
+		return nil, 0, err
 	}
 	defer src.close()
+	s.scans.Add(1)
+	data, doc, err := s.build(ctx, src, false, "")
+	if err != nil {
+		return nil, 0, err
+	}
+	if !s.begun {
+		s.begun, s.git, s.seen, s.first = true, src.listing != nil, src.listing, src.tree
+		s.errs, s.commit = errPaths(doc), doc.Ref.Commit
+	}
+	var gen uint64
+	if s.hub != nil {
+		_, gen, _ = s.hub.Latest()
+	}
+	return data, gen, nil
+}
+
+// build scans src under its Policy and returns the Project View JSON and the
+// IR it came from. With trust the Cache trusts each file's Stamp (13's
+// watch). HEAD is read beside the scan, off its path (10
+// rescan-profile, fix 2). what prefixes the stderr line.
+func (s *session) build(ctx context.Context, src *source, trust bool, what string) ([]byte, *ir.IR, error) {
+	start := time.Now()
 	pol, err := loadPolicy(src.tree)
 	if err != nil {
-		return nil, err
+		return nil, nil, err
+	}
+	type head struct {
+		commit string
+		dirty  bool
 	}
-	doc, stats, err := scan.Run(ctx, scan.Options{Tree: src.tree, Exclude: pol.Excluded, PolicyHash: pol.Hash(), Cache: s.cache})
+	heads := make(chan head, 1)
+	go func() {
+		c, d := gitHead(ctx, src.root)
+		heads <- head{c, d}
+	}()
+	doc, stats, err := scan.Run(ctx, scan.Options{Tree: src.tree, Exclude: pol.Excluded, PolicyHash: pol.Hash(), Cache: s.cache, TrustStamps: trust})
+	h := <-heads
 	if err != nil {
-		return nil, err
+		return nil, nil, err
 	}
-	doc.Ref.Commit, doc.Ref.Dirty = gitHead(ctx, src.root)
-	doc.Ref.Dirty = doc.Ref.Commit != "" && (doc.Ref.Dirty || src.extra)
+	doc.Ref.Commit = h.commit
+	doc.Ref.Dirty = h.commit != "" && (h.dirty || src.extra)
 	if err := ctx.Err(); err != nil {
-		return nil, err
+		return nil, nil, err
 	}
 	ir.Sort(doc) // as ir.Encode does before zu scan -html builds its View
 	v, err := projectView(ctx, "serve", src, doc, pol, stats.Measures, s.o, s.stderr)
 	if err != nil {
-		return nil, err
+		return nil, nil, err
 	}
 	data, err := export.Marshal(v)
 	if err != nil {
-		return nil, err
+		return nil, nil, err
 	}
-	fmt.Fprintf(s.stderr, "zu serve: scanned in %v: %d packages, %d files, %d parsed, %d parse errors\n",
-		time.Since(start).Round(time.Millisecond), stats.Packages, stats.Files, stats.Parsed, stats.ParseErrors)
-	return data, nil
+	fmt.Fprintf(s.stderr, "zu serve: %sscanned in %v: %d packages, %d files, %d parsed, %d parse errors\n",
+		what, time.Since(start).Round(time.Millisecond), stats.Packages, stats.Files, stats.Parsed, stats.ParseErrors)
+	return data, doc, nil
 }
diff --git a/internal/cli/watch.go b/internal/cli/watch.go
new file mode 100644
index 0000000..b7c06a2
--- /dev/null
+++ b/internal/cli/watch.go
@@ -0,0 +1,170 @@
+package cli
+
+import (
+	"bytes"
+	"context"
+	"fmt"
+	"path"
+	"strings"
+	"time"
+
+	"zu/internal/gitref"
+	"zu/internal/ir"
+	"zu/internal/policy"
+	"zu/internal/scan"
+	"zu/internal/watch"
+)
+
+// minPoll is the shortest -poll: one poll of kubernetes takes about 20 ms.
+const minPoll = 100 * time.Millisecond
+
+// gitMeta is a seam like gitHead: the git files a watch polls.
+var gitMeta = gitref.Meta
+
+// watch polls the working tree every interval until ctx ends, rescans once
+// per change and pushes the result to the page (13). It starts from what
+// the first scan listed, and the Stamp it saw of each file and the Policy. Outside git
+// that scan kept neither: the first poll finds every file changed and
+// rescans once.
+func (s *session) watch(ctx context.Context, every time.Duration) {
+	s.mu.Lock()
+	start, first, pol := &watch.Listing{}, s.first, s.policy
+	if s.seen != nil {
+		start = &watch.Listing{Files: s.seen.Files, Extra: s.seen.Extra}
+	}
+	s.mu.Unlock()
+	if start.Files == nil {
+		if l, err := watch.Walk(s.dir); err == nil {
+			start = l
+		}
+	}
+	w := &watch.Watcher{
+		Root:    s.dir,
+		Meta:    func(ctx context.Context) []string { return gitMeta(ctx, s.dir) },
+		Always:  []string{policy.FileName}, // read whether or not git ignores it
+		Matters: rescanReads,
+		List:    s.list,
+		Kept: func(rel string) scan.Stamp {
+			if st := scan.StampIn(first, rel); st != (scan.Stamp{}) || rel != policy.FileName {
+				return st
+			}
+			return pol
+		},
+		Polling: s.polling,
+		Every:   every,
+		Quiet:   max(every/5, 50*time.Millisecond),
+	}
+	_ = w.Run(ctx, start, s.changed)
+}
+
+// polling notes that the watch begins a poll: a page load's scan after it
+// may list what the watch's listing lacks.
+func (s *session) polling() { s.polledAt.Store(s.scans.Load()) }
+
+// rescanReads reports whether a rescan reads rel's content: a Go file other
+// than a test, a go.mod, or the Policy.
+func rescanReads(rel string) bool {
+	name := path.Base(rel)
+	return name == "go.mod" || rel == policy.FileName ||
+		strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go")
+}
+
+// list lists the working tree as zu scan does.
+func (s *session) list(ctx context.Context) (*watch.Listing, error) {
+	if !s.git {
+		return watch.Walk(s.dir)
+	}
+	g, err := gitWorktree(ctx, s.dir, false)
+	if err != nil {
+		return nil, err
+	}
+	if g == nil {
+		return nil, fmt.Errorf("%s is no longer a git working tree", s.dir)
+	}
+	return &watch.Listing{Files: g.Files, Extra: g.Extra}, nil
+}
+
+// changed rescans after the watch saw a change and pushes the View, unless
+// the rescan failed or, at the same commit, a file that parsed in the
+// pushed View no longer does: then the page keeps its drawing and shows
+// why. If a page load scanned since the watch began its poll, it lists the
+// tree again first: the page may already draw a file l lacks.
+func (s *session) changed(ctx context.Context, l *watch.Listing) {
+	s.mu.Lock()
+	defer s.mu.Unlock()
+	if s.scanning != nil {
+		s.scanning()
+	}
+	var src *source
+	var err error
+	if s.git {
+		if s.scans.Load() != s.polledAt.Load() {
+			l, err = s.list(ctx)
+		}
+		var tree scan.Tree
+		if err == nil {
+			tree, err = scan.ListTree(s.dir, l.Files)
+		}
+		if err == nil {
+			src = &source{tree: tree, root: s.dir, extra: l.Extra, err: func() error { return nil }, close: func() {}}
+		}
+	} else {
+		src, err = openSource(ctx, s.dir, "", false) // outside git, as a page load does
+	}
+	var data []byte
+	var doc *ir.IR
+	if err == nil {
+		defer src.close()
+		data, doc, err = s.build(ctx, src, s.git, "watch: ")
+	}
+	switch {
+	case ctx.Err() != nil:
+		return
+	case err != nil:
+		fmt.Fprintf(s.stderr, "zu serve: watch: rescan failed: %v; the page keeps its drawing\n", err)
+		s.hub.Notify("rescan failed: " + err.Error())
+		return
+	}
+	if broken := newParseErrors(s.errs, doc); broken != "" && doc.Ref.Commit == s.commit {
+		fmt.Fprintf(s.stderr, "zu serve: watch: %s; the page keeps its drawing\n", broken)
+		s.hub.Notify(broken)
+		return
+	}
+	s.errs, s.commit = errPaths(doc), doc.Ref.Commit
+	if last, _, _ := s.hub.Latest(); bytes.Equal(last, data) {
+		s.hub.Notify("")
+		return
+	}
+	s.hub.Publish(data)
+}
+
+// errPaths is the set of paths with parse errors in doc.
+func errPaths(doc *ir.IR) map[string]bool {
+	m := map[string]bool{}
+	for _, e := range doc.ParseErrors {
+		m[e.Path] = true
+	}
+	return m
+}
+
+// newParseErrors describes doc's first parse error in a path had lacks, and
+// how many more there are; "" when there is none.
+func newParseErrors(had map[string]bool, doc *ir.IR) string {
+	var fresh []ir.ParseError
+	for _, e := range doc.ParseErrors {
+		if !had[e.Path] {
+			fresh = append(fresh, e)
+		}
+	}
+	if len(fresh) == 0 {
+		return ""
+	}
+	msg := fresh[0].Message
+	if !strings.HasPrefix(msg, fresh[0].Path+":") {
+		msg = fresh[0].Path + ": " + msg
+	}
+	if len(fresh) > 1 {
+		msg += fmt.Sprintf(" (and %d more)", len(fresh)-1)
+	}
+	return msg
+}
diff --git a/internal/gitref/gitref.go b/internal/gitref/gitref.go
index 833acb1..6a20d0d 100644
--- a/internal/gitref/gitref.go
+++ b/internal/gitref/gitref.go
@@ -7,6 +7,7 @@ import (
 	"context"
 	"os"
 	"os/exec"
+	"path/filepath"
 	"strings"
 )
 
@@ -65,3 +66,27 @@ func Origin(ctx context.Context, dir string) string {
 	}
 	return strings.TrimSpace(out)
 }
+
+// Meta returns the files in dir's git directory that change when HEAD moves
+// or the index is written: HEAD, the index, packed-refs, and the ref HEAD
+// names unless it is detached. A ref is in the common directory, which a
+// linked worktree shares. zu serve's watch polls them (13). Outside a
+// repository it returns nil.
+func Meta(ctx context.Context, dir string) []string {
+	out, err := git(ctx, dir, "rev-parse", "--absolute-git-dir", "--git-common-dir")
+	lines := strings.Split(strings.TrimSpace(out), "\n")
+	if err != nil || len(lines) != 2 {
+		return nil
+	}
+	gd, common := lines[0], lines[1]
+	if !filepath.IsAbs(common) { // relative to dir
+		if common, err = filepath.EvalSymlinks(filepath.Join(dir, common)); err != nil {
+			return nil
+		}
+	}
+	m := []string{filepath.Join(gd, "HEAD"), filepath.Join(gd, "index"), filepath.Join(common, "packed-refs")}
+	if ref, err := git(ctx, dir, "symbolic-ref", "-q", "HEAD"); err == nil {
+		m = append(m, filepath.Join(common, filepath.FromSlash(strings.TrimSpace(ref))))
+	}
+	return m
+}
diff --git a/internal/scan/cache.go b/internal/scan/cache.go
index 24436b2..36b5750 100644
--- a/internal/scan/cache.go
+++ b/internal/scan/cache.go
@@ -60,7 +60,9 @@ type stamper interface {
 	stamp(rel string) Stamp
 }
 
-func stampIn(t Tree, rel string) Stamp {
+// StampIn is rel's Stamp as t listed it: zero unless t is a ListTree whose
+// Files ran. zu serve's watch starts from the first scan's (13).
+func StampIn(t Tree, rel string) Stamp {
 	if s, ok := t.(stamper); ok {
 		return s.stamp(rel)
 	}
@@ -76,7 +78,7 @@ func NewCache() *Cache { return &Cache{files: map[string]cached{}} }
 // file whose Stamp is the one c kept is not read at all (13): an edit that
 // keeps both size and mtime then goes unseen until the file changes again.
 func (c *Cache) extract(t Tree, rel string, trust bool) (f *fileFacts, parsed bool) {
-	st := stampIn(t, rel)
+	st := StampIn(t, rel)
 	var e cached
 	var ok bool
 	if c != nil {
```

- [x] **Run:** `go test -race ./... && go vet ./... && golangci-lint run ./...` Expected: PASS (read the lint output: through RTK it exits 0 with issues)

- [x] **Commit:** `Watch the tree in zu serve and push each new View`

## 13b: draw in place (the page)

### Task 5: Follow the stream (`live.ts`)

`follow(open, load, first, show, say, doc)` is the page's side of the contract, pure but for its callbacks:
- It fetches for a generation above the one drawn. Generations that arrive during a fetch cost one more fetch, not one each.
- A View whose text equals the drawn one is not drawn again.
- It says each notice.
- On a dropped stream it says `OFFLINE`, and on the reconnect it forgets the drawn generation.
- It is silent when the stream closes for good (`/events` 404), and clears `OFFLINE` if that follows a drop.
- A failed fetch keeps the drawing and says why.
- While `doc` is hidden, it holds no stream. Shown again, it opens one with `open` and forgets the drawn generation, so the first `view` event fetches once (M2).

**Files:**
- Tests: `web/src/live.test.ts`
- Code: `web/src/live.ts`

**Steps:**

- [x] **Write the failing tests**

```diff
diff --git a/web/src/live.test.ts b/web/src/live.test.ts
new file mode 100644
index 0000000..e0250ae
--- /dev/null
+++ b/web/src/live.test.ts
@@ -0,0 +1,168 @@
+import { describe, expect, it } from "vitest";
+import { follow, OFFLINE, type Stream, type Visibility } from "./live";
+
+// A Stream the test drives: what /events would send.
+function stream() {
+  const on: Record<string, (e: { data?: unknown }) => void> = {};
+  const s = {
+    readyState: 1,
+    closed: false,
+    addEventListener: (type: string, fn: (e: { data?: unknown }) => void) => {
+      on[type] = fn;
+    },
+    close: () => {
+      s.closed = true;
+    },
+    send: (type: string, data?: string) => on[type]?.({ data }),
+  };
+  return s satisfies Stream;
+}
+
+const view = (tag: string) => JSON.stringify({ schema: "1", nodes: [], edges: [], tool: tag });
+
+// latest answers view.json?latest from a list of [generation, body].
+function latest(answers: [number, string][]) {
+  const asked: number[] = [];
+  const load = async () => {
+    const [gen, body] = answers[Math.min(asked.length, answers.length - 1)];
+    asked.push(gen);
+    return new Response(body, { status: gen < 0 ? 500 : 200, headers: gen > 0 ? { "Zu-Generation": String(gen) } : {} });
+  };
+  return { load, asked };
+}
+
+// page is a document the test hides and shows.
+function page() {
+  const on: (() => void)[] = [];
+  const d = {
+    hidden: false,
+    addEventListener: (_: "visibilitychange", fn: () => void) => void on.push(fn),
+    removeEventListener: (_: "visibilitychange", fn: () => void) => void on.splice(on.indexOf(fn), 1),
+    set: (hidden: boolean) => {
+      d.hidden = hidden;
+      for (const fn of [...on]) fn();
+    },
+    listeners: () => on.length,
+  };
+  return d satisfies Visibility;
+}
+
+const tick = () => new Promise((ok) => setTimeout(ok, 5));
+
+function run(answers: [number, string][], first = { text: view("a"), gen: 0 }) {
+  const streams: ReturnType<typeof stream>[] = [];
+  const open = () => {
+    streams.push(stream());
+    return streams[streams.length - 1];
+  };
+  const l = latest(answers);
+  const shown: string[] = [];
+  const said: string[] = [];
+  const doc = page();
+  const stop = follow(open, l.load, first, (v) => shown.push(v.tool), (t) => void said.push(t), doc);
+  return { s: streams[0], streams, doc, l, shown, said, stop };
+}
+
+describe("follow", () => {
+  it("draws a newer View", async () => {
+    const r = run([[2, view("b")]]);
+    r.s.send("view", "2");
+    await tick();
+    expect(r.shown).toEqual(["b"]);
+  });
+  it("does not draw again what it drew", async () => {
+    const r = run([[1, view("a")]]);
+    r.s.send("view", "1");
+    await tick();
+    expect([r.l.asked, r.shown]).toEqual([[1], []]);
+  });
+  it("does not fetch the generation the page loaded with", async () => {
+    const r = run([[3, view("b")]], { text: view("a"), gen: 3 });
+    r.s.send("open");
+    r.s.send("view", "3");
+    await tick();
+    expect(r.l.asked).toEqual([]);
+  });
+  it("fetches once per generation", async () => {
+    const r = run([[2, view("b")]]);
+    r.s.send("view", "2");
+    await tick();
+    r.s.send("view", "2");
+    await tick();
+    expect(r.l.asked).toEqual([2]);
+  });
+  it("coalesces generations that arrive while it fetches", async () => {
+    const r = run([[2, view("b")], [4, view("d")]]);
+    r.s.send("view", "2");
+    r.s.send("view", "3");
+    r.s.send("view", "4");
+    await tick();
+    await tick();
+    await tick();
+    expect([r.l.asked, r.shown]).toEqual([[2, 4], ["b", "d"]]);
+  });
+  it("shows the notice zu serve sends, and clears it", () => {
+    const r = run([[1, view("a")]]);
+    r.s.send("notice", "a.go:3:1: expected declaration");
+    r.s.send("notice", "");
+    expect(r.said).toEqual(["a.go:3:1: expected declaration", ""]);
+  });
+  it("says so while zu serve is not answering, and forgets the generation it drew", async () => {
+    const r = run([[2, view("b")], [1, view("c")]]);
+    r.s.send("view", "2");
+    await tick();
+    r.s.readyState = 0; // reconnecting
+    r.s.send("error");
+    r.s.readyState = 1;
+    r.s.send("open");
+    r.s.send("view", "1"); // a restarted zu serve counts from 1 again
+    await tick();
+    expect([r.said, r.shown]).toEqual([[OFFLINE, ""], ["b", "c"]]);
+  });
+  it("is silent when zu serve does not watch", () => {
+    const r = run([]);
+    r.s.readyState = 2; // /events answered 404: EventSource gives up
+    r.s.send("error");
+    expect(r.said).toEqual([]);
+  });
+  it("clears what it said when zu serve comes back without a watch", () => {
+    const r = run([]);
+    r.s.readyState = 0;
+    r.s.send("error");
+    r.s.readyState = 2; // restarted with -poll 0: /events answers 404
+    r.s.send("error");
+    expect(r.said).toEqual([OFFLINE, ""]);
+  });
+  it("keeps the drawing when the View cannot be read", async () => {
+    const r = run([[-1, "boom"]]);
+    r.s.send("view", "2");
+    await tick();
+    await tick();
+    expect([r.shown, r.said]).toEqual([[], ["zu serve: boom"]]);
+  });
+  it("closes the stream while the page is hidden, and fetches the latest View once shown", async () => {
+    const r = run([[3, view("b")]], { text: view("a"), gen: 3 });
+    r.s.send("view", "3");
+    await tick();
+    r.doc.set(true);
+    expect([r.s.closed, r.streams.length]).toEqual([true, 1]);
+    r.doc.set(false);
+    expect(r.streams.length).toBe(2);
+    r.streams[1].send("open");
+    r.streams[1].send("view", "3"); // the generation it drew, or a restarted zu serve's
+    await tick();
+    expect([r.l.asked, r.shown]).toEqual([[3], ["b"]]);
+  });
+  it("opens no second stream for a page shown twice", () => {
+    const r = run([]);
+    r.doc.set(false);
+    expect(r.streams.length).toBe(1);
+  });
+  it("stops", () => {
+    const r = run([]);
+    r.stop();
+    r.doc.set(true);
+    r.doc.set(false);
+    expect([r.s.closed, r.streams.length, r.doc.listeners()]).toEqual([true, 1, 0]);
+  });
+});
```

- [x] **Run:** `cd web && npx vitest run src/live.test.ts` Expected: FAIL (`Cannot find module './live'`)

- [x] **Implement**

```diff
diff --git a/web/src/live.ts b/web/src/live.ts
new file mode 100644
index 0000000..fc42c7a
--- /dev/null
+++ b/web/src/live.ts
@@ -0,0 +1,119 @@
+// The page's side of zu serve's watch (13): /events says a newer View exists,
+// or a notice for the reader; the page fetches view.json?latest and draws it
+// in place, keeping its view state. Every View it draws came from zu.
+import { parseView, type View } from "./data";
+
+// Stream is what follow needs of an EventSource.
+export type Stream = {
+  readonly readyState: number; // 0 reconnecting, 1 open, 2 closed for good
+  addEventListener(type: "open" | "error" | "view" | "notice", fn: (e: { data?: unknown }) => void): void;
+  close(): void;
+};
+
+// Visibility is what follow needs of the document.
+export type Visibility = {
+  readonly hidden: boolean;
+  addEventListener(type: "visibilitychange", fn: () => void): void;
+  removeEventListener(type: "visibilitychange", fn: () => void): void;
+};
+
+export const OFFLINE = "zu serve is not answering: the drawing may be out of date";
+
+const CLOSED = 2;
+
+// follow draws each newer View the stream open returns announces, fetched
+// with load, and says each notice. first is the View on the page: its text,
+// and the generation the watch had published when zu serve sent it. A View
+// whose text is the one drawn is not drawn again; generations that arrive
+// while a fetch runs cost one more fetch, not one each. A View the page
+// cannot read keeps the drawing and is said instead. While doc is hidden
+// the stream is closed, so hidden tabs hold none of the browser's few
+// connections to zu serve; shown again, a new stream fetches the latest
+// View once, and its text decides whether to draw. It returns a function
+// that stops.
+export function follow(
+  open: () => Stream,
+  load: () => Promise<Response>,
+  first: { text: string; gen: number },
+  show: (v: View) => void,
+  say: (text: string) => void,
+  doc: Visibility,
+): () => void {
+  let text = first.text;
+  // The page load rescans, so its View is at least as new as first.gen's: a
+  // stream that names first.gen asks for no fetch, which could step back.
+  let drawn = first.gen;
+  let wanted = 0;
+  let busy = false;
+  let lost = false; // the stream dropped; it reconnects on its own
+  let src: Stream | null = null; // null while the page is hidden
+  let paused = false; // the page was hidden since the stream last opened
+  const pull = async () => {
+    busy = true;
+    try {
+      while (wanted > drawn) {
+        const r = await load();
+        const body = await r.text();
+        if (!r.ok) throw new Error(`zu serve: ${body.trim() || r.status}`);
+        drawn = Number(r.headers.get("Zu-Generation")) || wanted;
+        if (body !== text) {
+          show(parseView(body));
+          text = body;
+        }
+      }
+    } catch (e) {
+      drawn = wanted;
+      say(e instanceof Error ? e.message : String(e));
+    } finally {
+      busy = false;
+    }
+  };
+  const connect = () => {
+    const s = open();
+    s.addEventListener("view", (e) => {
+      wanted = Number(e.data) || 0;
+      if (!busy && wanted > drawn) void pull();
+    });
+    s.addEventListener("notice", (e) => say(String(e.data ?? "")));
+    // zu serve sends its generation and notice on each connect. One that
+    // restarted counts from 1 again, so after a drop the drawn generation
+    // means nothing: the next one fetches, and its text decides whether to
+    // draw.
+    s.addEventListener("open", () => {
+      if (lost) drawn = 0;
+      lost = false;
+      say("");
+    });
+    s.addEventListener("error", () => {
+      if (s.readyState === CLOSED) {
+        // zu serve answered, without a stream: it runs without a watch.
+        if (lost) say("");
+        lost = false;
+        return;
+      }
+      lost = true;
+      say(OFFLINE);
+    });
+    return s;
+  };
+  const visible = () => {
+    if (doc.hidden) {
+      src?.close();
+      src = null;
+      paused = true;
+      return;
+    }
+    if (src) return;
+    // What changed while hidden is unknown, and zu serve may have restarted
+    // and counted from 1 again: fetch the latest View once.
+    if (paused) drawn = 0;
+    paused = false;
+    src = connect();
+  };
+  if (!doc.hidden) src = connect();
+  doc.addEventListener("visibilitychange", visible);
+  return () => {
+    doc.removeEventListener("visibilitychange", visible);
+    src?.close();
+  };
+}
```

- [x] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [x] **Commit:** `Follow zu serve's View stream in the page`

### Task 6: The page redraws on a save

- `fetchView` returns the View's text and `Zu-Generation` along with it.
- A page zu serve sent renders `Live`. `Live` runs `follow` over `EventSource("events")` and `document`, and holds the View and the notice banner (`#zu-live`).
- The browser check:
  1. saves a new function and waits for it to be drawn without a reload, with the hash unchanged;
  2. breaks the file and expects the notice and the kept drawing;
  3. fixes the file and expects the notice to clear;
  4. opens six pages in one browser context, hides them (`document.hidden` overridden, `visibilitychange` fired), and expects a seventh to load and draw (M2).

**Files:**
- Tests: `web/e2e/serve.mjs`, `web/src/data.test.ts`
- Code: `web/src/data.ts`, `web/src/main.tsx`, `web/src/styles.css`

**Steps:**

- [ ] **Write the failing browser check**

```diff
diff --git a/web/e2e/serve.mjs b/web/e2e/serve.mjs
index f2d87c6..d081b33 100644
--- a/web/e2e/serve.mjs
+++ b/web/e2e/serve.mjs
@@ -1,6 +1,6 @@
-// Browser acceptance for zu serve (10 Task 6). Not part of make check: it
-// needs browsers and a bin/zu built with the UI. Run from web/e2e after
-// `make build`: npm run accept-serve
+// Browser acceptance for zu serve (10 Task 6) and its watch (13). Not part
+// of make check: it needs browsers and a bin/zu built with the UI. Run from
+// web/e2e after `make build`: npm run accept-serve
 import { spawn } from "node:child_process";
 import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
 import { tmpdir } from "node:os";
@@ -65,6 +65,47 @@ async function run(name, b) {
   await settle(p);
   out.added = [before, await has(p, id)];
   await p.close();
+  // 13: a saved file is drawn without a reload, and the hash stays. A file
+  // that does not parse keeps the drawing and says so.
+  p = await b.newPage();
+  p.on("pageerror", (e) => errors.push("pageerror " + e.message.slice(0, 120)));
+  await p.goto(url + view);
+  await drawn(p);
+  await settle(p);
+  const hash = () => p.evaluate(() => location.hash);
+  const hash0 = await hash();
+  const live = `example.com/shop/internal/store.Live${name}`;
+  const file = join(dir, "internal", "store", `live${name}.go`);
+  const node = (id) => p.locator(`.react-flow__node[data-id="${id}"]`).waitFor({ timeout: 15000 }).then(() => true, () => false);
+  writeFileSync(file, `package store\n\nfunc Live${name}() {}\n`);
+  const came = await node(live);
+  await settle(p);
+  out.live = [came, (await hash()) === hash0];
+  const notice = p.locator("#zu-live");
+  writeFileSync(file, `package store\n\nfunc Live${name}( {}\n`);
+  const said = await notice.waitFor({ timeout: 15000 }).then(() => notice.textContent(), () => "");
+  out.broken = [said.includes(`live${name}.go`), await has(p, live)];
+  writeFileSync(file, `package store\n\nfunc Live${name}() {}\n\nfunc Again${name}() {}\n`);
+  out.fixed = [await node(`example.com/shop/internal/store.Again${name}`), await notice.count()];
+  await p.close();
+  // 13: a hidden page holds no stream, so a seventh page still loads,
+  // though a browser opens at most six connections to one host.
+  const ctx = await b.newContext();
+  const tabs = [];
+  for (let i = 0; i < 6; i++) {
+    tabs.push(await ctx.newPage());
+    await tabs[i].goto(url + view);
+    await drawn(tabs[i]);
+  }
+  for (const t of tabs) {
+    await t.evaluate(() => {
+      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
+      document.dispatchEvent(new Event("visibilitychange"));
+    });
+  }
+  const seventh = await ctx.newPage();
+  out.tabs = await seventh.goto(url + view, { timeout: 15000 }).then(() => drawn(seventh)).then(() => true, () => false);
+  await ctx.close();
   out.errors = errors;
   return out;
 }
@@ -74,6 +115,10 @@ const want = {
   hash: view,
   reopened: ".Get",
   added: [0, 1],
+  live: [true, true],
+  broken: [true, 1],
+  fixed: [true, 0],
+  tabs: true,
   errors: [],
 };
 
```

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node serve.mjs` Expected: FAIL (`live = [false,true]` in each engine: the page never redraws)

- [ ] **Write the failing unit test**

```diff
diff --git a/web/src/data.test.ts b/web/src/data.test.ts
index e443ece..1021780 100644
--- a/web/src/data.test.ts
+++ b/web/src/data.test.ts
@@ -31,13 +31,16 @@ describe("readEmbedded", () => {
 });
 
 describe("fetchView", () => {
-  const answer = (status: number, body: string) => async (url: RequestInfo | URL, init?: RequestInit) => {
+  const answer = (status: number, body: string, gen?: string) => async (url: RequestInfo | URL, init?: RequestInit) => {
     expect([url, init?.cache]).toEqual(["view.json", "no-store"]);
-    return new Response(body, { status });
+    return new Response(body, { status, headers: gen ? { "Zu-Generation": gen } : {} });
   };
-  it("reads the View zu serve sends", async () => {
-    const v = await fetchView(answer(200, JSON.stringify(golden)));
-    expect(v.nodes.length).toBe(golden.nodes.length);
+  it("reads the View zu serve sends, and its text (13)", async () => {
+    const { view, text, gen } = await fetchView(answer(200, JSON.stringify(golden)));
+    expect([view.nodes.length, text, gen]).toEqual([golden.nodes.length, JSON.stringify(golden), 0]);
+  });
+  it("reads the generation zu serve's watch had drawn when it sent the View (13)", async () => {
+    expect((await fetchView(answer(200, JSON.stringify(golden), "7"))).gen).toBe(7);
   });
   it("says why zu serve could not build it", async () => {
     await expect(fetchView(answer(500, "zu.policy.yaml: line 3: bad level\n"))).rejects.toThrow(
```

- [ ] **Run:** `cd web && npx vitest run src/data.test.ts` Expected: FAIL (`Cannot read properties of undefined (reading 'nodes')`)

- [ ] **Implement**

```diff
diff --git a/web/src/data.ts b/web/src/data.ts
index b9aeae0..7ccb1cf 100644
--- a/web/src/data.ts
+++ b/web/src/data.ts
@@ -70,10 +70,15 @@ export function readEmbedded(doc: Document): View | "live" | null {
 }
 
 // fetchView asks zu serve for the View, from the origin that sent the page
-// (the CSP allows no other). Each request rescans the working tree.
-export async function fetchView(get: typeof fetch = fetch): Promise<View> {
+// (the CSP allows no other). Each request rescans the working tree. The text
+// and the generation zu serve's watch had published come too (13, live.ts):
+// the page draws only a later generation, and only when its text differs.
+export async function fetchView(get: typeof fetch = fetch): Promise<Loaded> {
   const r = await get("view.json", { cache: "no-store" });
   const text = await r.text();
   if (!r.ok) throw new Error(`zu serve: ${text.trim() || r.status}`);
-  return parseView(text);
+  return { view: parseView(text), text, gen: Number(r.headers.get("Zu-Generation")) || 0 };
 }
+
+// Loaded is a View zu serve sent, with its text and generation (0 without a watch).
+export type Loaded = { view: View; text: string; gen: number };
diff --git a/web/src/main.tsx b/web/src/main.tsx
index c72c778..5277896 100644
--- a/web/src/main.tsx
+++ b/web/src/main.tsx
@@ -1,27 +1,59 @@
-import { StrictMode } from "react";
+import { StrictMode, useEffect, useState } from "react";
 import { createRoot } from "react-dom/client";
 import { App } from "./App";
-import { fetchView, parseView, readEmbedded, type View } from "./data";
+import { fetchView, parseView, readEmbedded, type Loaded, type View } from "./data";
+import { follow } from "./live";
 import "./styles.css";
 
-// loadView returns the View zu embedded, or the one zu serve sends. The dev
-// server, serving the bare template, falls back to the Go golden; the build
-// drops that branch.
-async function loadView(): Promise<View | null> {
+// loadView returns the View zu embedded, or the one zu serve sends with its
+// text. The dev server, serving the bare template, falls back to the Go
+// golden; the build drops that branch.
+async function loadView(): Promise<Loaded | { view: View } | null> {
   const embedded = readEmbedded(document);
   if (embedded === "live") return fetchView();
-  if (embedded || !import.meta.env.DEV) return embedded;
+  if (embedded || !import.meta.env.DEV) return embedded && { view: embedded };
   const golden = await import("../../internal/export/testdata/shop.view.golden.json");
-  return parseView(JSON.stringify(golden.default));
+  return { view: parseView(JSON.stringify(golden.default)) };
+}
+
+// Live is a page zu serve sent (13): it draws each newer View zu serve's watch
+// builds, in place, and says what zu serve says over the drawing. Without a
+// watch (-poll 0) /events answers 404 and the page stays as it loaded. A
+// hidden page closes its stream and catches up when shown.
+function Live({ first }: { first: Loaded }) {
+  const [view, setView] = useState(first.view);
+  const [notice, setNotice] = useState("");
+  useEffect(
+    () =>
+      follow(
+        () => new EventSource("events"),
+        () => fetch("view.json?latest", { cache: "no-store" }),
+        first,
+        setView,
+        setNotice,
+        document,
+      ),
+    [first],
+  );
+  return (
+    <>
+      {notice && (
+        <div className="live-notice" id="zu-live" role="status">
+          {notice}
+        </div>
+      )}
+      <App view={view} />
+    </>
+  );
 }
 
 const root = document.getElementById("root");
 if (!root) throw new Error("missing #root element");
 performance.mark("zu-parse-start");
-let view: View | null = null;
+let loaded: Awaited<ReturnType<typeof loadView>> = null;
 let failed = "";
 try {
-  view = await loadView();
+  loaded = await loadView();
 } catch (e) {
   failed = e instanceof Error ? e.message : String(e); // a View this page cannot read, or a failed rescan
 }
@@ -30,8 +62,10 @@ createRoot(root).render(
   <StrictMode>
     {failed ? (
       <p className="empty">{failed}</p>
-    ) : view ? (
-      <App view={view} />
+    ) : loaded && "text" in loaded ? (
+      <Live first={loaded} />
+    ) : loaded ? (
+      <App view={loaded.view} />
     ) : (
       <p className="empty">
         This page carries no zu data. Create one with <code>zu scan -html FILE</code>.
diff --git a/web/src/styles.css b/web/src/styles.css
index 0c6b2f9..548f1a8 100644
--- a/web/src/styles.css
+++ b/web/src/styles.css
@@ -697,6 +697,24 @@ button.st-removed {
   background: var(--mark);
 }
 
+/* 13: what zu serve's watch says over the drawing it keeps: a file that
+   does not parse, a failed rescan, or zu serve not answering. */
+.live-notice {
+  position: fixed;
+  z-index: 20;
+  top: 8px;
+  left: 50%;
+  transform: translateX(-50%);
+  max-width: calc(100% - 32px);
+  padding: 4px 10px;
+  font-size: 13px;
+  color: var(--fg);
+  background: var(--mark);
+  border: 1px solid var(--modified);
+  border-radius: 6px;
+  overflow-wrap: anywhere;
+}
+
 /* Deviation 8: the view was collapsed to fit the layout limit. */
 .notice {
   position: absolute;
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node serve.mjs` Expected: PASS (9 checks in each engine)

- [ ] **Commit:** `Redraw a served page when zu serve publishes a new View`

### Task 7: Keep pan, zoom and state across a redraw

- `App` keeps the last `Drawing` and draws it, in the same `ReactFlowProvider`, until a newer View's layout lands (Deviation 9).
- `Canvas` centres once per request.
- `useViewState` revalidates against each new View.

The browser check:
1. centres a pick through the search box;
2. zooms with the wheel away from the centre;
3. saves.

The flow's transform must not change. Without the `Drawing`, the provider remounts and the first view's fit runs. Without the centre guard, the new layout re-centres the pick. Either way the transform changes, in all three engines.

**Files:**
- Tests: `web/e2e/serve.mjs`, `web/src/proposal.test.ts`
- Code: `web/src/App.tsx`, `web/src/Canvas.tsx`, `web/src/useViewState.ts`, `web/src/proposal.ts`

**Steps:**

- [ ] **Write the failing browser check**

```diff
diff --git a/web/e2e/serve.mjs b/web/e2e/serve.mjs
index d081b33..4d231ad 100644
--- a/web/e2e/serve.mjs
+++ b/web/e2e/serve.mjs
@@ -65,26 +65,35 @@ async function run(name, b) {
   await settle(p);
   out.added = [before, await has(p, id)];
   await p.close();
-  // 13: a saved file is drawn without a reload, and the hash stays. A file
-  // that does not parse keeps the drawing and says so.
+  // 13: a saved file is drawn without a reload, in place: the hash, pan and
+  // zoom stay. A file that does not parse keeps the drawing and says so.
   p = await b.newPage();
   p.on("pageerror", (e) => errors.push("pageerror " + e.message.slice(0, 120)));
   await p.goto(url + view);
   await drawn(p);
   await settle(p);
+  await p.keyboard.press("/"); // a search centres its pick; a redraw must not centre it again
+  await p.keyboard.type("Repo.Get");
+  await p.keyboard.press("Enter");
+  await settle(p);
+  const pane = await p.locator(".react-flow").boundingBox();
+  await p.mouse.move(pane.x + pane.width / 3, pane.y + pane.height / 3);
+  await p.mouse.wheel(0, 300); // zoom out around the pointer: zoom and pan both change
+  await settle(p);
+  const frame = () => p.locator(".react-flow__viewport").getAttribute("style");
   const hash = () => p.evaluate(() => location.hash);
-  const hash0 = await hash();
+  const [frame0, hash0] = [await frame(), await hash()];
   const live = `example.com/shop/internal/store.Live${name}`;
   const file = join(dir, "internal", "store", `live${name}.go`);
   const node = (id) => p.locator(`.react-flow__node[data-id="${id}"]`).waitFor({ timeout: 15000 }).then(() => true, () => false);
   writeFileSync(file, `package store\n\nfunc Live${name}() {}\n`);
   const came = await node(live);
   await settle(p);
-  out.live = [came, (await hash()) === hash0];
+  out.live = [came, (await frame()) === frame0, (await hash()) === hash0];
   const notice = p.locator("#zu-live");
   writeFileSync(file, `package store\n\nfunc Live${name}( {}\n`);
   const said = await notice.waitFor({ timeout: 15000 }).then(() => notice.textContent(), () => "");
-  out.broken = [said.includes(`live${name}.go`), await has(p, live)];
+  out.broken = [said.includes(`live${name}.go`), await has(p, live), (await frame()) === frame0];
   writeFileSync(file, `package store\n\nfunc Live${name}() {}\n\nfunc Again${name}() {}\n`);
   out.fixed = [await node(`example.com/shop/internal/store.Again${name}`), await notice.count()];
   await p.close();
@@ -115,8 +124,8 @@ const want = {
   hash: view,
   reopened: ".Get",
   added: [0, 1],
-  live: [true, true],
-  broken: [true, 1],
+  live: [true, true, true],
+  broken: [true, 1, true],
   fixed: [true, 0],
   tabs: true,
   errors: [],
```

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node serve.mjs` Expected: FAIL (`live = [true,false,true]`: the transform changed)

- [ ] **Write the failing unit test**

```diff
diff --git a/web/src/proposal.test.ts b/web/src/proposal.test.ts
index 952eed3..02368c0 100644
--- a/web/src/proposal.test.ts
+++ b/web/src/proposal.test.ts
@@ -3,7 +3,7 @@ import { childrenOf } from "./cut";
 import type { View } from "./data";
 import { breadcrumb } from "./headline";
 import { pinFor } from "./policy";
-import { PROPOSAL_NOTICE, proposalView, readHash, UNASSIGNED } from "./proposal";
+import { PROPOSAL_NOTICE, proposalView, readHash, revalidate, UNASSIGNED } from "./proposal";
 import { knownIds, scene } from "./scene";
 import { DEFAULT_STATE, encodeHash, propose } from "./state";
 import { decl, edge, pkgs, view } from "./testkit";
@@ -89,6 +89,13 @@ describe("a Proposal in the URL hash (07)", () => {
     expect(readHash("#f=m%2Fapp&p=Nope", v)).toEqual({ ...DEFAULT_STATE, focus: "m/app" });
   });
 
+  it("is read again against a newer View, which drops what it lost (13)", () => {
+    const s = { ...DEFAULT_STATE, focus: "m/app", selected: "m/app/api" };
+    expect(revalidate(s, v)).toBe(s);
+    const lost: View = { ...v, nodes: v.nodes.filter((n) => n.id !== "m/app/api") };
+    expect(revalidate(s, lost)).toEqual({ ...DEFAULT_STATE, focus: "m/app" });
+  });
+
   it("is never read in a Change View, so a pasted link cannot draw one there", () => {
     const change: View = { ...v, kind: "change", changed: ["m/app/api"] };
     expect(knownIds(change).proposal?.("Flip")).toBe(false);
```

- [ ] **Run:** `cd web && npx vitest run src/proposal.test.ts` Expected: FAIL (`revalidate is not a function`)

- [ ] **Implement**

```diff
diff --git a/web/src/App.tsx b/web/src/App.tsx
index 8202a33..12cac03 100644
--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -15,7 +15,7 @@ import { pinFor } from "./policy";
 import { PROPOSAL_NOTICE, proposalView } from "./proposal";
 import { reveal } from "./search";
 import { SearchBox } from "./SearchBox";
-import { DRAW_LIMIT, fitDepth, HUBS, openFull, scene, type SceneNode } from "./scene";
+import { DRAW_LIMIT, fitDepth, HUBS, openFull, scene, type Scene, type SceneNode } from "./scene";
 import { deeper, drill, nextStage, select, shallower, toggle, up } from "./state";
 import { Toolbar } from "./Toolbar";
 import { useViewState } from "./useViewState";
@@ -111,6 +111,9 @@ function ChangedList({ view, onPick }: { view: View; onPick: (id: string) => voi
   );
 }
 
+// Drawing is a finished layout and what it was made for.
+type Drawing = { whole: View; view: View; sc: Scene; graph: string; at: Map<string, Placed> };
+
 export function App({ view: whole }: { view: View }) {
   const change = whole.kind === "change";
   const [state, update] = useViewState(whole);
@@ -177,16 +180,20 @@ export function App({ view: whole }: { view: View }) {
   // 11: likewise each node's level: graph holds the rows ranked made.
   const levels = useMemo(() => levelsOf(sc), [sc]);
   const ownTiers = useMemo(() => ownTiersOf(sc), [sc]); // 12: a merged row's order
-  const [placed, setPlaced] = useState<{ graph: string; at: Map<string, Placed> } | null>(null);
+  // 13: a layout keeps the View and scene it was made for, so while zu
+  // serve's newer View lays out the page goes on drawing the last one, in the
+  // same React Flow, and the reader's pan and zoom stay.
+  const [placed, setPlaced] = useState<Drawing | null>(null);
   const [failed, setFailed] = useState<string | null>(null);
   useEffect(() => {
     if (ask) return;
+    const made = { whole, view, sc };
     performance.mark("zu-layout-start");
     engine.layout(JSON.parse(graph)).then(
       (out) => {
         performance.mark("zu-layout-end");
         setFailed(null);
-        setPlaced({ graph: graph + "\n" + heads, at: arrange(out, order, new Map(JSON.parse(heads) as [string, number][]), levels, ownTiers) });
+        setPlaced({ ...made, graph: graph + "\n" + heads, at: arrange(out, order, new Map(JSON.parse(heads) as [string, number][]), levels, ownTiers) });
       },
       (e: Error) => {
         if (!(e instanceof Superseded)) setFailed(e.message);
@@ -242,6 +249,14 @@ export function App({ view: whole }: { view: View }) {
   const crap = sc.nodes.some((n) => n.crap); // 08: only with a coverprofile (A7)
   const boxes = sc.nodes.filter((n) => n.shape === "box" || n.shape === "decl").length;
   const pkg = sc.focus.endsWith(PKG) ? sc.focus.slice(0, -PKG.length) : sc.focus;
+  const frame = `${state.focus}\n${sc.depth}`; // a new one starts at the first view
+  const shown: Pick<Drawing, "view" | "sc" | "at"> | null = !placed
+    ? null
+    : placed.graph === key
+      ? { view, sc, at: placed.at }
+      : placed.whole !== whole && `${state.focus}\n${placed.sc.depth}` === frame
+        ? placed
+        : null;
 
   return (
     <div className={`app${change ? " change" : ""}${change && !full ? " subgraph" : ""}`}>
@@ -327,12 +342,12 @@ export function App({ view: whole }: { view: View }) {
           <div className="empty" id="zu-status">
             Layout failed: {failed}
           </div>
-        ) : placed && placed.graph === key ? (
-          <ReactFlowProvider key={`${state.focus}\n${sc.depth}`}>
+        ) : shown ? (
+          <ReactFlowProvider key={frame}>
             <Canvas
-              view={view}
-              sc={sc}
-              placed={placed.at}
+              view={shown.view}
+              sc={shown.sc}
+              placed={shown.at}
               edge={edgeId}
               onSelect={choose}
               onEdge={(id) => {
diff --git a/web/src/Canvas.tsx b/web/src/Canvas.tsx
index 5a5f8e0..b68845a 100644
--- a/web/src/Canvas.tsx
+++ b/web/src/Canvas.tsx
@@ -251,11 +251,16 @@ export function Canvas({ view, sc, placed, edge, onSelect, onOpen, onToggle, onE
   // and these are sized by the layout. The canvas is measured here, after the
   // commit that may have opened the panel beside it; setCenter would use React
   // Flow's stored width, which updates only after that resize is observed.
+  // Each request centres once (13): a new layout of the same boxes, such as
+  // one zu serve's watch sends, leaves the reader's pan and zoom alone.
+  const centred = useRef<string | null>(null);
   useEffect(() => {
     const p = target === null ? undefined : placed.get(target);
     const at = target === null ? null : absolute(placed, target);
     const r = box.current?.getBoundingClientRect();
-    if (!p || !at || !r || r.width === 0 || r.height === 0) return;
+    const asked = `${center?.seq}\n${target}`;
+    if (!p || !at || !r || r.width === 0 || r.height === 0 || centred.current === asked) return;
+    centred.current = asked;
     const zoom = Math.min(1.2, (0.8 * r.width) / p.w, (0.8 * r.height) / p.h);
     const cx = at.x + p.w / 2;
     const cy = at.y + p.h / 2;
diff --git a/web/src/proposal.ts b/web/src/proposal.ts
index 6bc9f48..54c1bc1 100644
--- a/web/src/proposal.ts
+++ b/web/src/proposal.ts
@@ -5,7 +5,7 @@
 // badges all work; the page never evaluates a rule itself.
 import type { View, ViewEdge, ViewNode } from "./data";
 import { knownIds } from "./scene";
-import { decodeHash, type ViewState } from "./state";
+import { decodeHash, encodeHash, type ViewState } from "./state";
 
 // PROPOSAL_NOTICE is uml-viewer's banner (policy.clj proposal-notice, l.62).
 export const PROPOSAL_NOTICE = "PROPOSAL — not instantiated in code";
@@ -93,3 +93,11 @@ export function readHash(hash: string, view: View): ViewState {
   const s = decodeHash(hash, knownIds(view));
   return s.proposal === null ? s : decodeHash(hash, knownIds(proposalView(view, s.proposal)));
 }
+
+// revalidate reads s again against a newer View (13), dropping what that View
+// no longer has, such as a deleted selection. It returns s itself when
+// nothing is dropped, so an unchanged state renders nothing again.
+export function revalidate(s: ViewState, view: View): ViewState {
+  const next = readHash(encodeHash(s), view);
+  return encodeHash(next) === encodeHash(s) ? s : next;
+}
diff --git a/web/src/useViewState.ts b/web/src/useViewState.ts
index 9848bc7..5786df4 100644
--- a/web/src/useViewState.ts
+++ b/web/src/useViewState.ts
@@ -1,9 +1,10 @@
 // The view state of the page, kept in the URL hash (Deviation 5): read once at
 // start, written after every change, and read again when the reader edits or
-// pastes a link (hashchange).
-import { useEffect, useState } from "react";
+// pastes a link (hashchange), or when zu serve's watch sends a new View (13),
+// which drops what the View no longer has, such as a deleted selection.
+import { useEffect, useRef, useState } from "react";
 import type { View } from "./data";
-import { readHash } from "./proposal";
+import { readHash, revalidate } from "./proposal";
 import { storeHash, type ViewState } from "./state";
 
 export function useViewState(view: View): [ViewState, (next: (s: ViewState) => ViewState) => void] {
@@ -11,6 +12,12 @@ export function useViewState(view: View): [ViewState, (next: (s: ViewState) => V
   useEffect(() => {
     storeHash(window.location, window.history, state);
   }, [state]);
+  const read = useRef(view);
+  useEffect(() => {
+    if (read.current === view) return;
+    read.current = view;
+    setState((s) => revalidate(s, view));
+  }, [view]);
   useEffect(() => {
     const onHash = () => setState(readHash(window.location.hash, view));
     window.addEventListener("hashchange", onHash);
```

- [ ] **Run:** `cd web && npx vitest run && npm run typecheck` Expected: PASS

- [ ] **Run:** `make build >/dev/null && cd web/e2e && node serve.mjs` Expected: PASS

- [ ] **Commit:** `Keep pan, zoom and the hash when a served page redraws`

## Acceptance

### Task 8: Acceptance

**Files:**
- Code: `docx/features/13-watch/measure.mjs`
- Record: `docx/features/13-watch/acceptance.md` (written by hand)

**Steps:**

- [ ] **Add the measurement script**

```diff
diff --git a/docx/features/13-watch/measure.mjs b/docx/features/13-watch/measure.mjs
new file mode 100644
index 0000000..46640f4
--- /dev/null
+++ b/docx/features/13-watch/measure.mjs
@@ -0,0 +1,66 @@
+// Measures zu serve's watch for 13's acceptance on a writable copy of a Go
+// tree: the CPU an idle zu serve spends over 30 s, and write → drawn, the time
+// from saving a file to its new function being on the page, in chromium.
+// Each round renames the function in one file the page shows, so the edit
+// path is measured: no new file, no relist. The file is removed at the end.
+// Usage, from the repo root after `make build` and `npm ci` in web/e2e:
+//   node docx/features/13-watch/measure.mjs TREE PKGDIR [POLL] [ROUNDS]
+// e.g. TREE a copy of kubernetes, PKGDIR pkg/util/env, POLL 1s, ROUNDS 11.
+import { execFileSync, spawn } from "node:child_process";
+import { readFileSync, rmSync, writeFileSync } from "node:fs";
+import { join } from "node:path";
+import { chromium } from "../../../web/e2e/node_modules/playwright-core/index.mjs";
+
+const [tree, rel, poll = "1s", rounds = "11"] = process.argv.slice(2);
+const bin = new URL("../../../bin/zu", import.meta.url).pathname;
+const file = join(tree, rel, "zzwatch.go");
+const name = rel.split("/").at(-1);
+const mod = readFileSync(join(tree, "go.mod"), "utf8").match(/^module\s+(\S+)/m)[1];
+const pkg = `${mod}/${rel}`;
+writeFileSync(file, `package ${name}\n\nfunc Zz0() {}\n`);
+const zu = spawn(bin, ["serve", tree, "-addr", "127.0.0.1:0", "-include", "./" + rel, "-poll", poll], {
+  stdio: ["ignore", "pipe", "pipe"],
+});
+let log = "";
+zu.stderr.on("data", (d) => (log += d));
+process.on("exit", () => {
+  zu.kill();
+  rmSync(file, { force: true });
+});
+const url = await new Promise((ok) => zu.stdout.once("data", (d) => ok(String(d).trim())));
+const cpu = () => {
+  const [m, s] = execFileSync("ps", ["-o", "time=", "-p", String(zu.pid)], { encoding: "utf8" }).trim().split(":");
+  return Number(m) * 60 + Number(s);
+};
+const b = await chromium.launch();
+const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
+await p.goto(`${url}#f=${pkg}`);
+await p.locator(`.react-flow__node[data-id="${pkg}.Zz0"]`).waitFor({ timeout: 120000 });
+await p.waitForTimeout(3000);
+const c0 = cpu();
+await p.waitForTimeout(30000);
+const idle = (cpu() - c0) / 30;
+const times = [];
+for (let i = 1; i <= Number(rounds); i++) {
+  // The page notes when the node is in the DOM: Playwright's own polling
+  // backs off to 500 ms and would round the times up.
+  await p.evaluate((sel) => {
+    window.zuSeen = new Promise((ok) => {
+      const o = new MutationObserver(() => {
+        if (document.querySelector(sel)) ok(Date.now(), o.disconnect());
+      });
+      o.observe(document.body, { subtree: true, childList: true });
+    });
+  }, `.react-flow__node[data-id="${pkg}.Zz${i}"]`);
+  const t0 = Date.now();
+  writeFileSync(file, `package ${name}\n\nfunc Zz${i}() {}\n`);
+  times.push((await p.evaluate(() => window.zuSeen)) - t0);
+  await p.waitForTimeout(1300 + 137 * i); // vary the write's phase against the poll
+}
+await b.close();
+const s = [...times].sort((x, y) => x - y);
+console.log(`poll ${poll}: idle ${(100 * idle).toFixed(1)}% of one core`);
+console.log(`write → drawn ms: ${times.join(" ")} | min ${s[0]} median ${s[s.length >> 1]} max ${s.at(-1)}`);
+const scans = [...log.matchAll(/watch: scanned in (\d+)ms/g)].map((m) => Number(m[1]));
+console.log(`watch rescans ms: min ${Math.min(...scans)} max ${Math.max(...scans)} (${scans.length})`);
+process.exit(0);
```

- [ ] **Run:** `make check` Expected: PASS (read the lint output)

- [ ] **Run:** `cd web/e2e && node accept.mjs` Expected: PASS (55 checks in each engine; nothing in 12's acceptance moved)

- [ ] **Run:** `cd web/e2e && node serve.mjs` Expected: PASS

- [ ] **Measure** (by hand; not a replay step). After `make build`:
  1. Make a writable copy of the Test Corpus's kubernetes. On APFS use `cp -cRp`, which is a clonefile copy with no extra blocks. Never clone it, and never write to `.zu/corpus/` itself.
  2. Run `node docx/features/13-watch/measure.mjs "$K" pkg/util/env 1s 11` twice.
  3. Check the budget: every watch rescan under 2 s, and the median save → drawn at most 2 s. Record the idle CPU, save → drawn (the worst case too) and the rescans in `acceptance.md`, next to the Measurements table.
  4. Delete the copy.

- [ ] **The user's check** (by hand):
  1. Run `zu serve` on this repository and open a package.
  2. Pan and zoom somewhere.
  3. Add a function in an editor and save. It appears in about 2 s, with pan and zoom unchanged.
  4. Delete a brace and save. The banner names the file, and the drawing stays.
  5. Undo and save. The banner goes.
  6. Switch to another tab for a while, save a change, and switch back. The change is drawn.

- [ ] **Commit:** `Record watch's acceptance`

---

## Risks

- **The rescan floor grows with the tree.** About 0.8 s of kubernetes' 0.9 s watch rescan is `assemble`, `ir.Sort`, `projectView` and `Marshal` over every file. A tree twice kubernetes' size would push the median save → drawn past 2 s at the default poll. Fix 1 (incremental `assemble`) is the remedy, and it is out of scope.
- **Idle CPU grows with the polled paths**: about 7 % of one core on kubernetes at 1 s. A laptop on battery will notice it more than a desktop. `-poll 0` turns the watch off, and `-poll 5s` makes it cheap.
- **Directories git ignores are polled** when the scan does not prune them by name, `node_modules` for one.
  - zu's own `web/node_modules` adds 311 directories after `npm ci`, which is cheap.
  - A tree with a very large ignored tree outside `vendor`, `testdata`, `.*` and `_*` pays for it on every poll.
  - An `npm ci` in such a tree churns directories, and each churn costs a relist (no rescan: the listing does not change).
  - Filtering them through `git check-ignore --stdin` is the remedy, and it is out of scope.
- **An editor or IDE that runs `git status` rewrites `.git/index`** (accepted). Each such rewrite is a meta change, which relists and rescans (trusted: about 0.9 s of CPU on kubernetes). An IDE that refreshes status every few seconds therefore keeps zu serve rescanning. The View does not change, so nothing is redrawn.
- **The step back is closed; its trace is kept here.** Once, in a hand-run check on firefox, a page stepped back (`added = [0,0]`). That was before the page seeded its generation from its load. Two races remained after the seed, and M1 closes both: the generation is read under the mutex, and the watch relists after a page scan (Deviation 7). Each has a test that fails without its fix.
- **Coarse or missing ctime.** On a filesystem without ctime, or after the system clock is set back, a same-size edit that keeps the mtime is missed until the next change or a reload (Deviation 4). Windows builds stamp only size and mtime.
- **A listed symlink to a Go file has no kept stamp**, so a tree with one rescans once at start. Its target's edits are seen only through the target's own path, if that is listed.
- **No heartbeat (ruled).** A stream that dies without an error event, such as a laptop that sleeps with the socket half-open, shows no `OFFLINE` until the browser notices. The next page show reconnects in any case, because a hidden page closes its stream.
- **Six visible tabs of one zu serve** still fill the browser's HTTP/1.1 pool, and a seventh waits (Deviation 10). Hidden tabs hold no connection.
- **The tests time real polls.** The watch and session tests poll every 10 ms, with 60 ms settles and multi-second deadlines, under `-race`. A heavily loaded CI box could stretch them. The deadlines are generous, and no test asserts an upper bound on latency.
- **The browser checks write into `serve.mjs`'s temporary copy of `testdata/shop`**, which it removes on exit. Each engine uses its own file names, so the three engines' runs cannot collide.

---

## Notes

- **Task count: 8**, within Quick mode's 10 and the lead's 9.
- **TDD:** every task writes its failing test first.
  - Task 6's browser check is red against Task 5: the page does not follow the stream yet.
  - Task 7's is red against Task 6: the transform changes.
  - These were shown necessary in scratch by removing each fix alone, which turned its test red:
    - the new-directory discovery (B1): the watch test, at the first file in a directory made after start;
    - the relist after a page scan (M1b), the generation read under the mutex (M1a), and the commit check on the hold: their session tests;
    - the pause while hidden (M2): the browser `tabs` check, in all three engines;
    - Task 7's centre guard: the browser check, in all three engines.
  - The Policy's base stamp was added because its failing test showed the ignored Policy being written before the watch's first poll.
- **Determinism:** the watch changes when a scan runs, not what it produces. Task 1's test compares a trusted rescan's IR with a cold scan's. The Hub publishes exactly the bytes `session.build` marshals, which are the bytes a page load returns for the same tree.
- **The model never authors the graph:** nothing here makes a node or an edge. The page draws only Views zu built.
- **Security:** `/events` sits behind 10's defences: loopback bind, Host check (DNS rebinding) and `Sec-Fetch-Site`.
  - It is read-only. It sends only a number and a notice made from zu's own parse errors, which are paths inside the tree and Go's messages.
  - `?latest` sends the same View `/view.json` would.
  - The watch runs no process beyond 10's git calls plus `rev-parse` and `symbolic-ref` at each relist. It opens no file itself: it calls `Lstat`, and `ReadDir` on changed directories.

## Replay record

Replayed 2026-09-25 with `replay.py` on a fresh `git archive` of `main` at 31fcff8, after `npm ci` in `web` and `web/e2e`. Every step passed, and the script exited 0:

| Task | Step | Result |
|---|---|---|
| 1 | red | exit 1: `undefined: Stamp` (and `unknown field TrustStamps`) |
| 1 | green | exit 0; `go vet` under `GOOS=linux` and `GOOS=windows` with `CGO_ENABLED=0` clean |
| 2 | red | exit 1: `undefined: Listing`, `undefined: Watcher` |
| 2 | green | exit 0 (`-race`) |
| 3 | red | exit 1: `undefined: Views` (and `Hub`, `NewHub`) |
| 3 | green | exit 0 |
| 4 | red | exit 1: `undefined: Meta`; `s.view` returns 2 values |
| 4 | green | exit 0; golangci-lint: no issues |
| 5 | red | exit 1: `Cannot find module './live'` |
| 5 | green | exit 0; 246 vitest tests after Task 7 |
| 6 | red, browser | exit 1: the page never redraws (`live = [false,true]`) |
| 6 | red, unit | exit 1: `Cannot read properties of undefined (reading 'nodes')` |
| 6 | green | vitest and typecheck exit 0; `serve.mjs` exit 0 |
| 7 | red, browser | exit 1: the transform changed (`live = [true,false,true]`) |
| 7 | red, unit | exit 1: `revalidate is not a function` |
| 7 | green | vitest and typecheck exit 0; `serve.mjs` exit 0 |
| 8 | `make check` | exit 0 |
| 8 | `accept.mjs` | exit 0: 55/55 checks in each of chromium, firefox and webkit |
| 8 | `serve.mjs` | exit 0: 9/9 checks in each engine |

The replay printed only each step's last line. The red reasons for the browser checks and the multi-error compiles were read from the same steps run in scratch.

On the replayed tree, a second run gave:
- `go test ./...`: 320 tests in 13 packages;
- vitest: 246 tests in 27 files;
- golangci-lint: no issues;
- `accept.mjs` and `serve.mjs` green in all three engines.

In that second `accept.mjs` run, firefox's page crashed once, and 12's own rerun-once passed it at 55/55. That is the crash 08 recorded, "Firefox, on reload, 2 of 8 runs", from before 13.

`diff -rq` of the replayed tree against the scratch branch the diffs were cut from shows no differences outside `node_modules`, `bin` and `dist`. Every hunk applied exactly: `patch` left no `.orig` or `.rej` file. `replay.py` is byte-identical to 12's.

Measurements were taken in scratch with the same code (see **Measurements**). They are not replay steps.
