# 24 · Proposal Arrows — dropped

**Dropped 2026-10-25** (the user, on the lead's recommendation after scrutiny). The plan was written, built in a scratch repo and replayed, then reviewed. It is not committed: only this record is.

**What it was.** A Proposal (ADR 0008) would declare the arrows a hand-drawn architecture diagram draws, such as "CLI → HTTP". The Proposal view would draw each line between layers with a status against the code: in code, not in code (declared, no import behind it), missing (imports with no declared arrow), climbing (imports against the order). The source was the baseline comparison of 2026-10-22: agent-orchestrator's `docs/backend-code-structure.md` draws seven arrows over six layers.

**The plan.** 5 tasks (Policy, View, scene, canvas, acceptance), 20 files, +1,240/−29. The base was main at da92a30 with 21 replayed. All 22 steps replayed as stated. On agent-orchestrator it drew 19 lines (6 in code, 1 not in code, 6 missing, 6 climbing), and each matched the comparison's data. The 6 climbing lines held 57 pairs, the same 57 that `zu check` reports.

**Why it was dropped.** Scrutiny's verdict was rework:
- **Blocker: a declared arrow hid Level violations.** When a declared arrow's imports climbed, the line was drawn black (in code) or purple (reversed), not red, because the arrow styles outranked the violation style. On the shop fixture, the same edge was red without arrows and not red with them. The fixture had no climbing declared arrow, so the tests missed it.
- **Major: clicks opened the wrong line.** Lines that skip a layer overlap. On agent-orchestrator, a real click at a label's centre opened that label's own line for 4 of 17 labels, in Chromium, WebKit and Firefox alike. The e2e check dispatched its clicks, which skips hit testing. Drawing needs routing for lines that skip a layer first.
- **Major: the Policy format stayed "1"** although only 24 reads `arrows:`, so the format no longer said which files a build reads (N4).
- **The value was small for its size.** Of the three baseline repos, only agent-orchestrator has package-level layers. Without 24, it loses 13 of its 19 statuses: 6 in code (92 pairs), 6 missing (239 pairs) and 1 not in code (CLI → HTTP). The 6 climbing lines are already red today, and the bundle panel lists their pairs. 26's `-proposal` export draws the imports between layers with their pair counts.

**What survives.**
- **The banner fix.** The Proposal banner, drawn over the legend chips since 07, gets a row of its own: CSS only, in `styles.css`. It ships in v0.1.1, beside 21's `pre.source` fix.
- **Statuses as text** (backlog). This is 24's Task 1 alone, `arrows:` and the lines with their statuses, printed by the CLI, with no canvas and no View JSON. It would cost about a third of the plan and keep all 19 statuses, though not the drawing. It would need a decision on the Policy format first.

25's and 26's plans name 24 in their build order and Overlap. Those lines are now history; this record supersedes them.
