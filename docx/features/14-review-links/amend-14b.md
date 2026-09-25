# 14b: diff links that land

**Status:** APPROVED 2026-09-25 (lead, from zu's rehearsal and a browser study; advisor sign-off). It amends 14 and is built before 15.

**Why.** zu rehearsed step 1 of the user's check. The GitHub link `…/compare/a...b#diff-<sha256(path)>R60` names the right line, but a compare of 40 commits opens on its "Commits" tab. The files sit in a hidden "Files changed" tab, so the page never scrolls, not even after switching tabs. A browser study (2026-09-25; playwright-core 1.63 with chromium, firefox and webkit, plus native Chrome, all signed out) found the following. On GitHub, only a blob link lands on the line reliably. Compare and PR links name the line, and whether the page lands there depends on the browser, the motion setting, and whether the file is in the first batch the page loads.


| URL form | Lands on the line? |
|---|---|
| GitHub compare, 20 commits or fewer | The diff is inline. For a file in the first loaded batch, Firefox and Safari scroll to the line. Chrome stays at the top: GitHub sets `scroll-behavior: smooth` (inferred), and native Chrome also stays at the top. |
| GitHub compare, 21+ commits (with `?diff=unified` or `?w=1` too) | No, in any browser: the target is in the hidden tab. The cut-off is commit count, not file count. |
| GitHub `/pull/N/files#diff-<h>R<n>` / `L<n>` | Names the line at any commit count. With reduced motion it lands; with default motion it didn't in any browser when the file was past the first loaded batch (file 9 of 26). |
| GitHub `/commit/<sha>#diff-…` | Scrolls to the file only (no line ids). Not used. |
| GitHub `/blob/<sha>/<p>#L<n>` (14's "View at") | Yes, everywhere. |
| GitLab compare `?file_path=<p>#line_<sha1[:9]>_A<n>` | Yes, all engines (69 commits, file 34 of 110). |
| GitLab `/-/merge_requests/N/diffs?file_path=<p>#line_…` | Yes. |

## Changes (strict TDD, one commit each)

1. **`gitref.CommitCount(ctx, dir, base, head) (int, error)`**, which runs `git rev-list --count base..head`. It rejects refs starting with `-`, as `Diff` does. The test uses a temp repo with 3 commits and checks the count is 3.

2. **`-mr N` on `zu diff -html` and `zu serve -base`** (N is an integer ≥ 1; anything else exits 3 with a usage line). With `-mr`, every diff link, whether per node, per file or in the header, targets the MR:
   - GitHub: `https://<host>/<repo>/pull/N/files#diff-<sha256(p)>R<n>`, or `L<n>` for base lines. The file link is `…/pull/N/files#diff-<sha256(p)>`.
   - GitLab: `https://<host>/<repo>/-/merge_requests/N/diffs?file_path=<p>#line_<sha1(p)[:9]>_A<n>`, or `_<n>` for base lines, following 14's escaping.
   - The header link reads "MR !N on the host" (GitLab) or "PR #N on the host" (GitHub).
   - 14's OnRemote gate still applies.
   - `-mr` with `-link-template`, or without a hosted origin, exits 3: there's no MR page to point at.
   - Tests: both hosts' forms, from the anchors table test, and the flag's rejections.

3. **GitHub compares of more than 20 commits drop the per-node and per-file diff links** when `-mr` is absent. The header compare link stays, and so does "View at".
   - The limit is `githubInlineCommits = 20`; its comment cites this file and the date observed.
   - `zu diff` prints to stderr, once: `zu: <n> commits: GitHub shows this compare's files behind a tab, so line links are left out; pass -mr <number> to link the pull request`.
   - `zu serve -base` prints it once per session, the first time it happens.
   - GitLab is unaffected.
   - Tests: 21 commits gives no node links but the header link; 20 commits gives node links; `-mr` with 21 commits gives PR links.
   - If CommitCount fails, the links stay out: 14's Deviation 12 degrade, with a note.

4. **Wording and docs, exact text:**
   - Panel: keep "Diff on the host". Add a `title` tooltip: "Opens the diff at this line. Some browsers open it at the top; View at always lands on the declaration."
   - `docx/core/decisions.md`, the Links (B6) bullet: add "A diff link names the changed line: on a GitHub compare of at most 20 commits, on a pull or merge request with `-mr N`, or on any GitLab compare. Browsers may open it at the top (Chrome on GitHub). 'View at' always lands on the declaration. A GitHub compare of more than 20 commits hides its files behind a tab, so it gets no line links without `-mr` (14b)."
   - 14's acceptance.md: replace the user's check steps 1 and 2 with the check below, and record zu's rehearsal and this study.

## The user's check (replaces 14 Task 7 steps 1–2)

B6 is met when all four pass:
1. **GitHub, small compare:** `zu diff <sha of origin/main~5> -html` in a detached worktree of `origin/main`. Pick a function in a file among the first four the compare page lists, and click "Diff on the host". The compare opens with that file's diff, and the URL carries `#diff-…R<n>`. In Firefox or Safari the page lands on the line; Chrome may stay at the top.
2. **GitHub, PR:** repeat on a pull request of any public repository you have cloned, with `-mr <PR number>`. The PR's files page opens, with the anchor in the URL. It may not scroll to the line, and that doesn't fail this step.
3. **GitLab:** any GitLab repository, a compare link. It lands on the line in any browser.
4. **View at** on a changed function lands on the declaration.

## Risks
- The 20-commit cut-off rests on two observations dated 2026-09-25: 20 commits × 56 files rendered inline, and 21 × 43 showed tabs. GitHub may move it. zu's tests check zu's threshold, not GitHub's behaviour.
- The smooth-scroll cause is inferred; the native Chrome result was observed.
- Progressive loading means GitHub diff links past the first batch of files may open at the top. "View at" is the reliable landing.

## Out of scope
Bitbucket and Gitea (as 14). Detecting the MR number online. Working around GitHub's scrolling with a script on zu's page.
