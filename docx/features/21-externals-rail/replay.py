#!/usr/bin/env python3
"""Replay plan.md on a fresh checkout, task by task, the way an implementer would.

For each "### Task N": apply blocks in order (<!-- file: p --> fences are written,
```diff fences go through patch -p1). At each "**Run…**" step run its first
backticked command: "Expected: FAIL" must exit non-zero, anything else zero.
"""
import re, subprocess, sys, pathlib

plan, root = pathlib.Path(sys.argv[1]).read_text(), pathlib.Path(sys.argv[2])
tasks = re.split(r"^### (Task \d+[^\n]*)$", plan, flags=re.M)[1:]
fence = re.compile(r"(<!-- file: (\S+) -->\n)?([ \t]*)```(\w*)\n(.*?)\n\3```", re.S)
run = re.compile(r"\*\*Run[^*]*:\*\* `([^`]+)`[^\n]*")
failures = 0
for title, body in zip(tasks[::2], tasks[1::2]):
    events = sorted([(m.start(), "block", m) for m in fence.finditer(body)] +
                    [(m.start(), "run", m) for m in run.finditer(body)], key=lambda e: e[0])
    for _, kind, m in events:
        if kind == "block":
            path, ind, lang, text = m.group(2), m.group(3), m.group(4), m.group(5)
            # the fence regex consumed the first line's indent with the ``` line
            text = "\n".join(l[len(ind):] if l.startswith(ind) else l for l in text.split("\n"))
            if path:
                f = root / path
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(text + "\n")
            elif lang == "diff":
                r = subprocess.run(["patch", "-s", "-p1", "-d", str(root)], input=text + "\n", text=True, capture_output=True)
                if r.returncode:
                    print(f"FAIL {title}: patch\n{r.stdout}{r.stderr}")
                    failures += 1
        else:
            cmd, want_fail = m.group(1), "Expected: FAIL" in m.group(0)
            r = subprocess.run(cmd, shell=True, cwd=root, capture_output=True, text=True)
            ok = (r.returncode != 0) == want_fail
            failures += not ok
            out = (r.stdout + r.stderr).strip().splitlines()
            print(f"{'ok  ' if ok else 'FAIL'} {title[:48]:48} {'red  ' if want_fail else 'green'} exit={r.returncode} {cmd}  | {(out[-1:] or [''])[0][:110]}")
            if not ok:  # the last line alone can be a runtime's banner
                print("\n".join("    " + l[:160] for l in out[-10:]))
sys.exit(1 if failures else 0)
