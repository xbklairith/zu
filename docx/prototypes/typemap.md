# Type Map — prototype record

**Question.** The user found the diagram still hard to understand (2026-10-21). They asked for coding patterns, abstraction patterns and Evans' data model, and said some repos spend most of the canvas on external dependencies. Would a Type Map read better than today's declaration view? It would draw types as cards with their fields, "holds" lines between them, which types implement an interface, and labels for Go idioms of an exact shape. And can zu find implements from parsed code alone, as ADR 0002 requires, with no type-checker?

**Verdict: yes, with the user's five choices below.**
- **cobra reads better.** Opening `cobra` today draws one box of 154 method names over about 90 small boxes, and lines only on hover. The Type Map draws `Command` as a card labelled `tree` and `hooks ×16`, holding `Group` (many) and `PositionalArgs` (one), which is labelled `×10 swappable`. `ShellCompDirective` is labelled `enum ×8`. All of it shows without hovering.
- **Implements from parsed code is accurate enough to draw.** A type implements an interface when its method set (its own methods and its embeds') matches the interface's by name and signature text. On hugo v0.166.0, against `go/types` with the standard library type-checked from source:
  - precision 99.8% (906 of 908 pairs); both misses are `identity.ManagerIdentity`;
  - recall 86.6% (906 of 1,046), and 94.2% leaving out the 84 pairs whose interface is a type-parameter constraint;
  - 56 other misses: 31 through methods promoted from a standard-library type, 19 through interfaces that embed one, 6 more;
  - 11,000 pairs could not be checked, because a signature names a third-party type the check left opaque; 878 of them matched by signature;
  - 162 pairs are stated in code (`var _ I = (*T)(nil)`): 155 also match by signature, 7 match by the assertion only. None of the six types behind hugo's main converter interface (`Converter`) is asserted.
  - Reading hugo's types took 0.93 s.
- **cobra has nothing to check:** it has one interface with methods, and its one candidate pair names a third-party type.

**The user's choices (2026-10-21, each the recommended one, from a page that drew every option):**
1. Outside packages go in a strip along the bottom, each a chip with how many files use it; hovering one draws its lines. Today they are boxes in the layout: on cobra 4 of 6 boxes, on hugo 113.
2. Opening a package shows the Type Map. Today's view stays one click away.
3. Implements lines are drawn when the methods match (dotted) or the code asserts it (solid), one interface at a time.
4. Labels only for Go idioms of an exact shape, each linked to the lines that earned it: tree, hooks ×N, interchangeable ×N, options ×N, adapter, enum ×N, wraps. No guessed design patterns.
5. Evans' terms (aggregate, entity, value object, repository, layers) are declared in the Policy (`model:`), and zu checks the code against them, as reflexion models do (Murphy and Notkin). zu never infers them from names.

**Engineering calls that follow, stated on the page:**
- The IR's schema goes from "1" to "2" to hold fields and method signatures. A scan from v0.1.0 needs one rescan, and `zu diff` refuses to compare scans of two schemas.
- ADR 0002 gets an amendment: implements is found from parsed signatures, with no type-checker.
- Cards show names and types only, never doc comments (decisions.md, Product focus).
- Build order: 21, the strip (no format change); 22, the Type Map; 23, the declared model.

**The code.** Three throwaway programs in the session's scratchpad, not committed:
- `load` lists a module's packages and parses them with `go/parser`;
- `cmd/typemap` writes each type's fields, methods, func types, const blocks, assertions, edges and idiom labels, with the location behind each, as JSON;
- `cmd/truth` checks typemap's implements edges against `go/types`.

The user has not asked for them on a branch. If they are lost, `cmd/truth`'s method is the part worth rebuilding: type-check the module's own packages and the standard library from source, leave third-party packages opaque, and count a pair as unverifiable when either side's method set touches an opaque type.
