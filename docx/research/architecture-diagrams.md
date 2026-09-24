# How large projects draw architecture, and what zu should do without a Policy

**Question.** Users find zu's Project View of hugo and kubernetes hard to read. How do big open-source projects, the architecture frameworks and code-to-diagram tools layer and group a system? From that, what should zu draw **automatically** when a repository has no Policy?

**Scope and method.** Researched 2026-09-25. Web sources were accessed that day unless a version or date is given. Quotes are verbatim; "[unverified]" marks what could not be checked against a primary source. Local measurements use the pinned Test Corpus:
- kubernetes v1.37.0 @ `f54c212e3a2f`
- hugo v0.166.0

They were taken from zu's own IRs (`.zu/corpus/*.disk.json`) and the checked-out trees.

**Baseline.** Feature 11's prototype (`docx/features/11-readable-overview/plan.md`) already does four things:
- ranks sibling boxes into tier rows, with dependencies below;
- hides lines at rest;
- opens at a "home" box;
- shortens labels.

This note takes those as given and asks what is still missing.

---

## 1. Findings: how projects draw themselves

| Project | Layered? | Top-view boxes | Grouped by | Edges | Made how | Enforced by |
|---|---|---|---|---|---|---|
| Kubernetes | No: control plane vs nodes | 7 component kinds | where it runs | yes, undefined, inconsistent | draw.io / Inkscape | import-boss, in code only |
| Chromium | Yes, 6 rows | 7 | top-level source dir | "depends on" | hand-drawn PNG | DEPS + checkdeps |
| Android | Yes, 5 tiers | 6 blocks (~40 inner) | tier | **none**, position only | illustration | API tiers elsewhere |
| VS Code | Yes, 4 layers + 2 entry points | 6 | `src/vs/<layer>` | dependency arrows | hand-drawn | ESLint `code-import-patterns`, `code-layering` |
| LLVM | No: pipeline | 3 or 7 | phase | data flow | book figure | Unix linker + CMake `LINK_COMPONENTS` |
| PostgreSQL | Partly: flow + support band | 17 | `src/backend` dir | control/data flow | xfig, hand | none found |
| Linux kernel map | Grid, 7 layers × 6 functions | 42 cells | layer × function | calls (undeclared) | Inkscape | none |
| Grafana | Yes, 3 subgraphs | 12 | responsibility tier | labelled | hand-written Mermaid | golangci `depguard` |
| Istio | Planes | ~5 in 3 bands | plane | labelled traffic | Google Slides | n/a (runtime view) |
| rustc | 5 tiers, prose | none drawn | crate | none | prose | Cargo (acyclic crates) |
| Go std | Partial order, ~15 named levels | none drawn | lattice point | implicit `<` | text DSL | `TestDependencies` |

### Kubernetes
- **Sources.**
  - https://kubernetes.io/docs/concepts/overview/components/ ("Last modified May 30, 2026")
  - https://kubernetes.io/docs/concepts/architecture/ ("Last modified March 27, 2026")
- **Layout and elements.** Both diagrams show deployment topology, not layers: a "Control Plane" group and "Node" groups inside a cluster frame. There are 7 component kinds: api, etcd, sched, c-m, c-c-m, kubelet, k-proxy.
- **How it was drawn.**
  - `components-of-kubernetes.svg` is a draw.io export.
  - `kubernetes-cluster-architecture.svg` was edited in Inkscape 1.3.2.
  - Arrows are undefined, and they run in opposite directions in the two drawings.
  - The page calls the diagram "an example reference architecture".
- **What those boxes are in code.** They are **binaries**, and 6 of them are directories under `cmd/`: kube-apiserver, kube-controller-manager, kube-scheduler, cloud-controller-manager, kubelet and kube-proxy. The v1.37.0 `cmd/` holds 26 directories; most of the rest are developer tools (`gen*`, `*check`, `import-boss`, `importverifier`, `prune-junit-xml`).
- **The code layering Kubernetes actually enforces** (checked locally at v1.37.0) is declarative and module-shaped:
  - `staging/README.md`: "This directory is the staging area for packages that have been split to their own repository." It lists 33 staged repos. `go.work` `use`s the root plus all 33.
  - `staging/publishing/import-restrictions.yaml` holds 33 `baseImportPath` allow-lists, checked by `hack/verify-imports.sh` → `cmd/importverifier`. Example: `./staging/src/k8s.io/api` may import only `k8s.io/api`, `k8s.io/apimachinery` and `k8s.io/klog`. A comment on `./pkg/apis/core` reads: "Main goal: pkg/apis should be as self-contained as possible."
  - 70 `.import-restrictions` files, checked by `hack/verify-import-boss.sh` → `cmd/import-boss`. Its README: "`import-boss` looks for a file called `.import-restrictions` in the same directory and all parent directories, up to the module root". It also has `InverseRules` for "semi-private packages" that "are more sophisticated than Go's `internal` convention".
  - These are **allow-lists, not ranks**. No layer names appear anywhere.

### Chromium
- **Sources.**
  - https://chromium.googlesource.com/chromium/src/+/main/content/README.md
  - https://chromium.googlesource.com/chromium/src/+/main/components/README.md
- **The diagram.** A hand-drawn layer diagram with 7 boxes, top to bottom: Embedder (//chrome…), //components, //content, //net + //third_party/blink, //v8, //base.
- **What the edges mean:** "A module can include code directly from lower modules. However, a module can not include code from a module that is higher than it. This is enforced through DEPS rules."
- **The components README:**
  - "Components **cannot** depend on the higher layers of the Chromium codebase".
  - "Circular dependencies are not allowed".
- **It is the one project whose drawn layers are machine-enforced:** DEPS `include_rules` plus checkdeps on bots and presubmit.
- **Upward calls go through embedder interfaces:** "Modules can implement embedder APIs so that modules lower than them can call them."

### Android
- **Sources.**
  - https://developer.android.com/guide/platform ("Last updated 2024-05-20")
  - https://source.android.com/docs/core/architecture ("Last updated 2026-06-17")
- **The stack.** Five tiers, top to bottom: System Apps / Java API Framework / Native C/C++ Libraries | Android Runtime / HAL / Linux Kernel. That is 6 labelled blocks and about 40 inner boxes.
- **Edges.** **No arrows**: dependency is shown by vertical position only.
- **How it was made.** An illustration, not generated.

### VS Code
- **Source:** the wiki page "Source Code Organization" (last changed 2025-10-11).
- **The layers.** "The `core` is partitioned into the following layers": `base`, `platform`, `editor`, `workbench`, plus the entry points `code` and `server`.
- **The diagram.** 6 boxes, hand-drawn, with arrows from each dependent to its dependency.
- **The second axis.** "Inside each layer the code is organised by the target runtime environment": common, browser, node, electron-*. For example, browser "may use code from: `common`".
- **Enforcement,** in `eslint.config.js` at `ceeb50ecd8`:
  - `local/code-import-patterns` has per-glob allow-lists. It opens with "!!! Do not relax these rules !!!".
  - `local/code-layering` handles the environments.
  - Both are `warn`, but `build/eslint.ts` fails the build on any warning.
- **Word collision.** The ESLint config says "layer" for the *environment* axis, while the wiki uses it for base/platform/editor/workbench.

### LLVM, PostgreSQL, Linux, Grafana, Istio, rustc
- **LLVM.** The picture is the three-phase pipeline (Lattner, AOSA vol. 1, https://aosabook.org/en/v1/llvm.html): "the front end, the optimizer and the back end". Its edges are **data flow**.
  - The code rule in https://llvm.org/docs/CodingStandards.html (LLVM 24.0.0git): "One library … should only use things from the libraries listed in its dependencies." It is enforced by the Unix linker ("no circular dependencies between libraries can exist").
- **PostgreSQL.** The "Backend Flowchart" (https://www.postgresql.org/developer/backend/) has 17 hand-drawn boxes (originally `src/tools/backend/flow.fig`, removed in 2012). The query pipeline sits above a band of support modules. Every box is a `src/backend` directory.
- **Linux kernel map** (https://makelinux.github.io/kernel/map/, repo `makelinux/linux_kernel_map`, map labelled 2.6.36):
  - 7 "layers" × 6 "functionalities", 42 cells.
  - "Edited with Inkscape 0.46". Hundreds of labels. It is the outlier for density.
- **Grafana** (`contribute/architecture/k8s-inspired-backend-arch.md` at `d0eb9ec262`):
  - A Mermaid diagram with 12 nodes in "API Layer" / "Service & Internal Logic" / "Storage Layer".
  - Each box carries its code path, e.g. `pkg/services/.../service.go`.
  - `depguard` rules include "apiserver is not allowed to import grafana core".
- **Istio** (https://istio.io/latest/docs/ops/deployment/architecture/, v1.31.1): "logically split into a data plane and a control plane". About 5 boxes in 3 bands, drawn in Google Slides.
- **rustc** (https://rustc-dev-guide.rust-lang.org/compiler-src.html): 5 tiers in prose only.
  - `rustc` → `rustc_driver` → `rustc_interface` → `rustc_middle` ("Most of the other rustc_* crates depend on rustc_middle") → "rustc_data_structures, rustc_span, rustc_errors, etc."
  - No diagram.

### Go itself
- **Source:** `src/go/build/deps_test.go` at `beaf715aaa`.
- **What it says:** "depsRules defines the expected dependencies between packages in the Go source tree. It is a statement of policy. … "a < b" means package b can import package a. … All-caps names are pseudo-names for specific points in the dependency lattice."
- **The named points, bottom up:** NONE, RUNTIME, SYSCALL, TIME, MATH, STR, OS, FMT, then DEBUG, CGO, NET, CRYPTO…. Each is "X plus …", i.e. **cumulative levels**. Negative assertions look like `reflect !< OS;`.
- **Enforcement:** `TestDependencies`, which covers std only and skips `cmd`.
- **`internal/`** (https://go.dev/doc/go1.4#internalpackages): "a package `.../a/b/c/internal/d/e/f` can be imported only by code in the directory tree rooted at `.../a/b/c`"; enforced for all repositories "from 1.5 and onward".

### What the project survey says, together
1. **Top views are small.** Chromium 7, VS Code 6, Android 6, Istio ~5, LLVM 3–7, Grafana 12, PostgreSQL 17. Only the Linux map is dense.
2. **Every picture is hand-drawn.** None is generated from code, and in none of them does the picture read the enforced rules. Only Chromium states that its drawn layers are the enforced ones.
3. **The layered ones are stacks of 4–7 rows**, with the foundation at the bottom (Chromium, Android, VS Code, Linux, Go's lattice).
4. **Edges are few or none.** Android draws none, because position carries direction. Chromium and VS Code draw one arrow per layer pair, not per dependency.
5. **Layer names are human judgement**: "platform", "content", "HAL". Code-level rule sets are allow-lists or partial orders, never named tiers, with Go's pseudo-nodes as the exception.

---

## 2. Findings: frameworks

### C4 model (https://c4model.com, accessed 2026-09-25)
- **No numeric cap on c4model.com.** The FAQ says: "large diagrams are usually hard to interpret and comprehend because the cognitive load is too high" and "don't be afraid to split that single complex diagram into a larger number of simpler diagrams … at the same level of abstraction".
- **The number comes from Simon Brown elsewhere.** "Diagramming distributed architectures with the C4 model", https://dev.to/simonbrown/diagramming-distributed-architectures-with-the-c4-model-51cm (2021-05-19): "Any diagram with 20+ elements (perhaps fewer) starts to get complicated quickly".
- **Notation** (https://c4model.com/diagrams/notation):
  - "Every diagram should have a title describing the diagram type and scope".
  - "Every diagram should have a key/legend explaining the notation being used".
  - "Every line should represent a unidirectional relationship".
- **Components vs packages** (FAQ): is a package or folder a component? "Perhaps but, again, typically not."
- **Generation.** Code-level diagrams: "Ideally this diagram would be automatically generated". Component diagrams: "Consider automating their creation for long-lived documentation" (https://c4model.com/diagrams/component).

### arc42 building block view (https://docs.arc42.org/section-5/)
- **Level 1** is "the white box description of the overall system together with black box descriptions of all contained building blocks".
- **Level 2** "zooms into some building blocks of level 1".
- **Selection:** "Specify important, surprising, risky, complex or volatile building blocks. Leave out normal, simple, boring or standardized parts". There is no numeric cap.

### Layers, onion and hexagonal
- **Layers (POSA).** From Buschmann & Henney's tutorial (http://www.dre.vanderbilt.edu/~schmidt/POSA-tutorial.pdf, 2008): "Define one or more layers … with each layer having a distinct and specific responsibility". Higher layers use lower ones. The strict ("J uses only J−1") vs relaxed wording in POSA1 itself is [unverified].
- **Onion** (Palermo, 2008-07-29): "all coupling is toward the center".
- **Hexagonal** (Cockburn, 2005-09-04 v0.9): "code pertaining to the inside part should not leak into the outside part". The hexagon was chosen "to get away from the one-dimensional layered picture".
- **Implication for zu.** All three are **dependency-direction** rules, which is exactly what a rank-ordered picture shows. None can be named from syntax: "domain" versus "adapter" is judgement.

---

## 3. Findings: tools that generate diagrams from code

### Tools that layer automatically (tree + condense cycles + level)
- **SonarQube Cloud "Architecture"** (https://docs.sonarsource.com/sonarqube-cloud/architecture) is the closest existing zero-config analogue:
  - "There is no special setup or input needed to view and use the map."
  - "Classes/files are recursively grouped within their packages/folders/modules."
  - "Containers that have no outgoing relationships are located on the right. Every container in a column has at least one dependency on the next column on the right. Containers in a column have no dependencies between themselves."
  - "To display direct relationships to/from selected containers, click on the container."
  - In short: a levelized layout, edges on demand, and grouping by the code's own tree.
- **Sonargraph** (https://eclipse.hello2morrow.com/doc/standalone/content/exploration_view_visual_aspects.html) supports Go:
  - "horizontal grey lines. These are the level lines. Non-cyclic elements on the same level are not depending on each other. Cyclic elements of a cycle group are on the same level", shaded red.
  - User-declared architecture uses an ordered artifact list with "strict" or "relaxed" layering.
- **Lattix / DSM** (https://docs.lattix.com/lattix/userGuide/Applying_Algorithms):
  - "The partitions are listed alphabetically. This is the default".
  - "Component" partitioning "groups strongly connected components into virtual partitions".
  - "Reachability implements the Warfield algorithm … It yields layers".
- **Sangal et al., OOPSLA 2005** (https://groups.csail.mit.edu/sdg/pubs/2005/oopsla05-dsm.pdf):
  - "Partitioning finds layers and highlights cycles."
  - "The default decomposition used by LDM is based on the code organization: the Java package structure."
  - A limit: this "usually does not reflect the important architectural structure fully".
- **NDepend** (docs for v2026.1.6):
  - "Depending on the size of the application the default application map is made of application assemblies, namespaces, types or members … it attempts to have around 1.000 elements."
  - Clustering "applies to all sub-graphs … that contain more than 20 elements".
  - Its Level metric is Lakos's: "Level = 1 + (Max Level over namespace it uses direcly)", and "N/A" for anything in or above a cycle.
- **JetBrains DSM** (https://www.jetbrains.com/help/idea/dsm-analysis.html, IDEA 2026.2):
  - "Everything is collapsed now, and only modules are shown".
  - "classes, which are used most are moved to the bottom".
  - Cells hold counts, shown as "…" above 99.

### Tools that group but do not layer
- **dependency-cruiser** (v18.4.0, 2026-09-20):
  - It nests every module in Graphviz clusters by folder.
  - `archi` "can summarise (or 'collapse') dependencies to folders of your own choosing. Great if you want to have a high level overview". It collapses by a fixed default regex; in source it is `^(node_modules|packages|src|lib|app|test|spec)/[^/]+`, and the two docs disagree with it and with each other.
  - Collapsed edges are deduplicated **without a count**.
  - The docs advise: "Using max-depth is typically a terrible idea."
- **goda** (v0.10.1): `-cluster` groups by **module** (Repo → Module → Package), not by directory; `-short` drops the parent path.
- **go-callvis:** `-group pkg,type`.
- **spaghetti** (adonovan): a directory tree plus a dominator tree, "grouped hierarchically by import path and containing module".
- **Madge and godepgraph:** flat graphs, no clusters.
- **go-arch-lint** (v1.19.0): components are user-defined only. Its `graph` draws the *declared* allowed dependencies, not the code's.
- **Graphviz** (https://graphviz.org/docs/attrs/newrank/): the classic ranking "is recursive on clusters… a node cannot be in a cluster and also be constrained by `rank=same` with a node not in the cluster". This is the same obstacle zu's 07 hit with ELK: ranks and clusters fight.

### Tools where a person defines the groups
- **Structurizr** (https://docs.structurizr.com/java/component/introduction): "it's almost impossible to create a generic set of rules that can be blindly applied to all codebases".
- **ArchUnit** `layeredArchitecture()` and `onionArchitecture()` (User Guide v1.5.0): the user declares the layers.
- **CodeScene:** glob-defined components, with an auto-mapping for when "the directory structure maps to the component view". Its edges are change coupling, not imports.
- **Sourcetrail** (archived 2021-12-14): edge bundles whose "thickness gives an impression of how many edges are bundled".

### What the tools have in common
1. **The default grouping is the code's own tree.** No mainstream tool clusters by algorithm for its default view.
2. **Layering is computed: condense cycles, then take the longest path.** Every tool that layers does it this way.
3. **Edges are rolled up as counts** (Lattix "strength", IntelliJ cells, NDepend "Weight on Cells"), and SonarQube hides them until clicked.
4. **Named groups always come from the user.**
5. **The ceiling is about 20 elements** (NDepend's clustering threshold).

### Automatic clustering research
- **Bunch/MQ** (Mancoridis et al. IWPC 1998; Mitchell & Mancoridis TSE 2006):
  - Hill-climbing from a random partition. In 10 runs, "Half of the runs produced … the optimal solution".
  - It removes "omnipresent modules" and puts libraries in special clusters.
- **ACDC** (Tzerpos & Holt, WCRE 2000):
  - Pattern-based: source file, directory structure, body-header, leaf collection, support library, central dispatcher, subgraph dominator.
  - "We should strive to keep the size of the clusters at a more manageable level (up to 20 objects or so)"; "clusters of low cardinality (between 5 and 20)".
- **Garcia, Ivkovic, Medvidovic, ASE 2013** (doi:10.1109/ASE.2013.6693106). This is the abstract; the full text is paywalled:
  - The study compared six techniques on eight verified architectures.
  - "two of the techniques routinely outperform the rest, but even the best of the lot has surprisingly low accuracy".
  - Per Lutellier 2018 (secondary), the two are ARC and ACDC.
  - Link et al. 2019 (arXiv 1903.06895, secondary) report an average MoJoFM of ARC 58.76 and ACDC 55.94 on the same systems.
- **Lutellier et al., TSE 2018** (doi:10.1109/TSE.2017.2671865):
  - Symbol-level dependencies help, "Despite this improvement, the overall accuracy is low for all recovery techniques".
  - "ACDC is the only algorithm that produces equivalent or better results than K-means consistently".
  - Against a **directory-structure baseline**: "For ArchStudio and Hadoop, the directory structure-based architecture consistently outperforms architectures recovered with other algorithms". The baseline won on 2 of 5 systems.
  - On Chromium: "most of the ACDC clusters did not make sense", and the developer "suggested that we start by considering module organization".
- **Stability, Tzerpos & Holt, IWPC 2000:** a stable algorithm is one where "small changes in its input … produce small changes in its output". Complete-linkage stability fell to 12.5% / 10.4% at CL90.
- **Stability, Wu, Hassan & Holt, ICSM 2005:**
  - The stability order was "Bunch, CL90, CL75, ACDC, SL75 and SL90", with Bunch the least stable.
  - "all six algorithms are ranked as having of low quality".
  - "the clusterings from the most stable algorithm bear little similarity to the implemented system structure, while the clusterings from the least stable algorithm has the best cluster distribution".

**The research on its own terms:** automatic clustering is both inaccurate and a trade-off against stability. The directory and module structure is the usual proxy for ground truth and sometimes beats every algorithm. This confirms ADR 0001/0008's rejection of auto-clustering with external evidence, not only zu's own determinism argument.

---

## 4. Findings: Go conventions an automatic rule can use

**Official conventions** (https://go.dev/doc/modules/layout; https://pkg.go.dev/cmd/go, Go 1.27.1):
- `cmd/`: "A common convention is placing all commands in a repository into a `cmd` directory".
- `internal/`: "Since other projects cannot import code from our `internal` directory, we're free to refactor its API". This is compiler-enforced visibility.
- `pkg/` is **not** mentioned by the Go team.
- The go tool ignores directories named `testdata`, and files whose names begin with `_` or `.`.
- Generated files carry a line matching `^// Code generated .* DO NOT EDIT\.$` "before the first non-comment, non-blank text in the file".

**Community convention, not official.** golang-standards/project-layout says "This is **`NOT an official standard defined by the core Go dev team`**". It names `/cmd`, `/internal`, `/pkg`, `/api` (specs), `/test`, `/tools`, `/scripts`, `/build`, `/deployments` and `/third_party`.

**Measured on the Test Corpus** (zu's IRs; tests excluded, vendor and testdata pruned, as zu scans today):

| | hugo v0.166.0 | kubernetes v1.37.0 |
|---|---|---|
| Modules / packages | 1 / 193 | 38 / 2,963 (root + 33 staged + `hack/tools` modules) |
| Largest module | the only one | `k8s.io/kubernetes`: 1,282 packages, 39,061 decls |
| Package import graph | acyclic, height 36 | acyclic, height 46 |
| **Module** import graph | — | **acyclic, 10 longest-path ranks** |
| Top-level boxes in the default view | 37 segments | 38 (module roots) |
| Largest strongly connected component among those boxes | **25 of 37** | none (modules are acyclic) |
| Boxes matched by R2's name list (§5) | 2 (`scripts`, `htesting`); `docshelper` and `releaser` are tooling too, but by names no convention covers | 7 (`sample-*` ×3, `code-generator/examples`, `hack/tools` ×3) |
| Boxes nothing else imports ("fan-in 0") | `(root)` (package main), `scripts` | 7: `k8s.io/kubernetes` + 6 of the 7 above (all but `sample-apiserver`) |
| Files with the generated marker (non-vendor) | 11 of 908 | 3,799 of 13,415 (28%) |
| Directories whose non-test Go files are all generated | — | 464 of 2,966 (16%); 267 of client-go's 386 packages |

**The Kubernetes module ranks, top to bottom** (longest path over the module DAG; counts are packages):
- 9: kubernetes (1,282)
- 8: kube-controller-manager
- 7: cloud-provider, kube-scheduler
- 6: apiextensions-apiserver, controller-manager, dynamic-resource-allocation, kube-aggregator, pod-security-admission, sample-apiserver
- 5: apiserver (249), kubectl (88), kubelet, kube-proxy, cri-client, endpointslice, instrumentation, sample-cli-plugin
- 4: component-base, component-helpers, cli-runtime, metrics, sample-controller, code-generator/examples
- 3: client-go (386), cluster-bootstrap, csi-translation-lib
- 2: api (61), code-generator
- 1: apimachinery (98), cri-streaming
- 0: cri-api, externaljwt, kms, mount-utils, streaming, `hack/tools`, `golangci-lint`

This reproduces the story Kubernetes's `import-restrictions.yaml` tells (apimachinery < api < client-go < apiserver < kubernetes) with no heuristic and no configuration.

**hugo cannot be layered by boxes alone.**
- Its packages form a DAG, but top-level boxes mix packages from far-apart ranks: `tpl` spans ranks 0–31, `common` 0–14, `config` 11–28. That makes 25 of its 37 boxes mutually reachable.
- Feature 11's Eades ordering sets aside 39 of 260 arcs to produce 17 rows. That is the best an order can do here, and it is still 17 rows of 37 boxes.

---

## 5. Recommendation for zu

> This section is a recommendation, not a decision. It assumes feature 11 lands: tier rows, lines hidden at rest, the home box and short labels. It keeps ADR 0008: nothing is invented, and the tree stays the code's own.

**The three findings that change what zu should do:**

1. **Every generated tool that layers does it the same way, and it is what zu already has: tree + condensed cycles + longest-path rows + edges on demand.** SonarQube Cloud, Sonargraph and Lattix all show this, and the clustering literature (Garcia 2013, Lutellier 2018, Wu 2005) says not to replace the tree with clusters. What hand-drawn diagrams have and zu lacks is **a small number of boxes (6–17; C4's author says 20+ "starts to get complicated") and noise removed**. The next step is a **box budget with honest folding**, not a new grouping.
2. **In multi-module repos, the module is the right top-level box, and its graph is exactly layerable.** kubernetes's 38 modules form an acyclic graph whose 10 ranks match its own enforced import rules. goda clusters by module for the same reason. But the repo-root module `k8s.io/kubernetes` is the biggest by far: 43% of packages and 36% of declarations, twice the next module (client-go). Kubernetes's own diagram shows its **binaries**, 6 of the 26 `cmd/` directories, which sit *inside* that module. The top view must open that module in place.
3. **Noise is conventional and nameable from paths and file markers.** A rule that treats boxes nothing imports as "entry points" would pick 7 boxes in kubernetes. 6 of them are samples, examples or tooling (§4 table), and the only real one is `k8s.io/kubernetes`. 16% of its directories are fully generated. Go and the community name these directories consistently (`cmd`, `internal`, `testdata`, `hack`, `tools`, `scripts`, `examples`, `sample-*`, `third_party`, `// Code generated … DO NOT EDIT.`). These should be **demoted** by default, with counts, before any ranking.

### Rules for the automatic top view (no Policy)

**R1. Level 1 = modules when there is more than one, else the home box's children.** This is feature 11's home rule, unchanged for single-module repos (hugo).

**R2. Demote conventional noise before ranking.** The rule applies to *any* path segment below the module root, so `hack/tools/instrumentation` is caught by `hack`. Demoting means taking a box out of the ranked rows and showing it as a count, like the externals oval. It is **not** a synthetic box.
- **What is demoted.** A box is demoted when its last path segment matches the built-in list:
  - `testdata`, `test`, `tests`, `*testing`, `e2e`, `examples`, `example`, `sample-*`, `hack`, `tools`, `scripts`, `third_party`;
  - or it is a directory whose every non-test file carries the generated marker.
- **Where demoted boxes go.** They sit in one strip under the rows, headed by a count such as "7 tooling and samples · 464 generated". Each can be expanded in place.
- **Lines to them.** Their lines are counted, never drawn at rest.
- **Changes needed.** The generated check needs the scan to record the marker per package. That adds one boolean to the IR, which is deterministic and comes from the file header only (gap G3).

**R3. Rows = tiers (feature 11), capped at 7.** Seven matches the tallest hand-drawn stacks: Chromium 6, Android 5, VS Code 4+2, the Linux map 7. When tiers exceed 7, merge adjacent tiers from the bottom up so that each row holds about the same number of boxes. A merged row draws a faint rule where the tiers join, so the true order is still readable. The cap applies to the view only; tiers stay the ones feature 11 computes.

**R4. At most about 15 boxes on screen, the rest folded per row.** The budget sits under Brown's 20, NDepend's 20 and ACDC's 5–20.
- **Which boxes stay.** Keep, in order:
  1. the boxes the Policy names;
  2. the boxes no sibling imports (entry points, e.g. hugo's `(root)`, which is `package main` with only 31 declarations and would fold by size alone);
  3. the rest by declaration count, ties broken by id.
- **The rest.** Fold them into one "+N" chip in *their own row*, so their rank is still visible. Double-click expands the chip.
- **Measured** with `.zu/corpus` IRs, R2's list as stated, budget 15:
  - hugo keeps 15 of 35 boxes, holding 92% of declarations. The fold takes 20 small ones such as `bufferpool`, `compare` and `watcher`.
  - kubernetes keeps 15 of 31 modules, holding 95%. Its fold takes `kube-scheduler`, `kube-proxy` and `kube-controller-manager`: small staged config and API modules whose code lives in `k8s.io/kubernetes`, which is why R5 exists.
- **Size, not fan-in.** Ranking the rest by fan-in instead dropped `commands`, hugo's CLI, so size is the better key for step 3.
- **Determinism.** In a Change View, the fold is computed on head and applied to both sides, the same stance as ADR 0004.

**R5. Open the repository-root module in place when the other modules are nested inside it.** This is the staging pattern: kubernetes's 33 staged modules live under `staging/` inside `k8s.io/kubernetes`. A size threshold does not work. `k8s.io/kubernetes` is the largest module but holds only 36% of the repo's declarations (39,061 of 107,196) and 43% of its packages, so "more than half" never fires. Draw it open in the top view as a frame around its own children:
- its children are `pkg`, `cmd` and `plugin`, after R2 demotes `test`, `hack`, `third_party`, `build` and `cluster`;
- the frame keeps its row;
- this is feature 11's "home" rule, generalised from "only child" to "the module the others are nested in".

It invents nothing. It does mix depths on one screen, and that is the trade-off to review (gap G5). The trigger is structural (a nested `go.mod`), so it is deterministic.

**R6. Row labels are structural, never semantic.**
- **Automatic labels:**
  - the top row: "entry points" when every box in it contains `cmd/` or a `main` package;
  - the bottom row: "depends on nothing here";
  - the other rows: "tier k".
- **Badges** on boxes carry path roles: `cmd`, `internal`, and the share of generated code. These are the only facts the code states.
- **Semantic names come only from the Policy.** Names such as "API types", "client" or "platform" appear only when the Policy gives Levels, whose labels then replace the tier labels. Every project that names its layers (Chromium, VS Code, Android, Go's `deps_test.go`) wrote the names by hand.

**R7. Edges: none at rest, the direction shown by position, the exceptions counted.**
- Keep feature 11's hidden-at-rest lines with hover and select, and bundle pair counts on the drawn lines (Lattix, IntelliJ, NDepend).
- Add one number to the header: "N dependencies run against the order". These are the arcs feature 11's Eades pass sets aside (39 on hugo, 0 on kubernetes modules). They are what Sonargraph and Lattix highlight, and they are the only thing position cannot say.
- Red stays reserved for Policy violations (decisions.md "violations stay red").

**R8. What the Policy overrides:**
- **Levels** replace tiers for a sibling set, as today, and give rows their names (R6).
- **`order`** pins boxes, and pinned boxes are exempt from folding (R4).
- **`omit`** removes boxes entirely.
- **A new key to un-demote or add demotions:** e.g. a `demote:` glob list whose `!glob` form un-demotes. This is so a repo whose real code lives in `tools/` is not hidden.
- **A new `budget:` integer** for R4.

Proposals stay as they are, for invented regroupings. Clustering stays out, including as a suggestion for `policy init`. Stability research gives no algorithm that is both stable and accurate (Wu 2005).

**What 10 seconds should show**, and what is new here:

| Repo | Header | Rows | Strip |
|---|---|---|---|
| kubernetes | "38 modules · 7 tooling and samples · 464 generated packages" | ≤ 7. Top: `kubernetes`, opened (`cmd`, `pkg`, `plugin`). Bottom: apimachinery, cri-api, kms…. About 15 boxes, plus a "+N" per row. | demoted modules |
| hugo | "35 boxes · 2 tooling · N dependencies against the order" (39 before demotion; not re-measured) | ≤ 7. Top: `(root)` and `commands`. Bottom: `common`, `identity`, … | `scripts`, `htesting` |

Neither view draws a line at rest.

---

## 6. Gaps

- **G1. No empirical 10-second threshold.**
  - The ~20-element figure is expert opinion (Brown's blog post, NDepend's product threshold, ACDC's design choice), not a user study. Cognitive-load literature (e.g. Miller's 7±2) was not researched.
  - The 7-row cap is inferred from hand-drawn diagrams, not tested.
  - Both need the author's own timed test (decisions.md "5-minute criterion").
- **G2. Rules R3–R5 are measured only partly.**
  - R2 and R4 were measured by declaration share on two repos.
  - The Eades tiers were **not** recomputed after demotion and folding, so the row counts after R2–R4 are unknown.
  - R5 was not prototyped.
- **G3. The IR lacks two facts these rules need:** whether a package is `main`, for R6's "entry points", and whether a file is generated, for R2. The IR records package ids, modules, hashes and locations, not the package name. The "entry points" label can use `cmd/` alone until then.
- **G4. Demotion by name misfires in some cases.** Some repos keep real code under `tools/` or `test/`. Even kubernetes's `test/` (242 packages) is imported by production code: `cmd/kube-apiserver`, `pkg/controlplane`, `pkg/kubemark` and `pkg/scheduler` import packages under it. Demoting `test/` hides those dependencies behind a count. The Policy override in R8 is the escape hatch, but the default list is a judgement call. R2's list also misses hugo's `docshelper` and `releaser`, which are tooling by name that no convention covers.
- **G5. The nested-root-module case (R5) has no precedent in the tools surveyed, and it is untested on repos other than kubernetes.** A repo whose root module is only tooling, with the real code in nested modules, would open the wrong box. NDepend changes the level of detail globally (to about 1,000 elements), not per box. Opening one box in place mixes depths and may confuse "Esc goes up".
- **G6. Kubernetes's components are not distinguishable from its developer tools under `cmd/`.** Only 6 of 26 are the diagram's components; `gen*` and `*check` would need name heuristics, which are rejected here as fragile.
- **G7. Source limits.**
  - Garcia et al. 2013 (paywalled) and Anquetil & Lethbridge 1999 were read as abstracts only. The MoJoFM numbers are secondary (Link et al. 2019).
  - Lakos (1996) levelization definitions are via NDepend's attribution, not the book.
  - POSA1's strict/relaxed wording is unverified.
  - Structurizr's Dagre remark and CodeSee's shutdown come from secondary sources.
  - hugo publishes no architecture diagram that I found (not exhaustively searched).
- **G8. Word collisions.** The glossary's **Band** is the CRAP risk bucket, and VS Code uses "layer" for two axes. Rows computed from ranks should keep feature 11's term *tier* and never be called Level (a Policy term) or Band. "Demoted" and "folded" would be new glossary terms.
