package scan

import (
	"context"
	"strings"
	"testing"

	"zu/internal/ir"
)

// The Policy's exclude globs drop files before parsing. go.mod files are
// always read, so an excluded directory still fences off a nested module.
func TestRunExcludesFilesAndStampsThePolicy(t *testing.T) {
	root := fixture(t, "shop")
	excluded := func(rel string) bool {
		return strings.HasSuffix(rel, "zz_generated.go") || strings.HasPrefix(rel, "tools/") ||
			strings.HasPrefix(rel, "web/")
	}
	doc, _, err := Run(context.Background(), Options{Tree: dirOf(t, root), Exclude: excluded, PolicyHash: "sha256:p"})
	if err != nil {
		t.Fatal(err)
	}
	if doc.PolicyHash != "sha256:p" {
		t.Errorf("PolicyHash = %q, want the caller's", doc.PolicyHash)
	}
	for _, n := range doc.Nodes {
		for _, l := range n.Locations {
			if excluded(l.Path) {
				t.Errorf("node %s located in excluded %s", n.ID, l.Path)
			}
		}
		if n.ID == "example.com/shop/tools/gen" {
			t.Error("the tools module's package was scanned")
		}
		if strings.HasPrefix(n.ID, "example.com/shop/tools") && n.Kind == ir.KindPackage {
			t.Errorf("excluded nested module leaked into the root module as %s", n.ID)
		}
	}
	if doc.Unsupported[".ts"] != 0 {
		t.Errorf("excluded web/app.ts still counted: %v", doc.Unsupported)
	}

	plain, _, err := Run(context.Background(), Options{Tree: dirOf(t, root)})
	if err != nil {
		t.Fatal(err)
	}
	if plain.PolicyHash != DefaultPolicyHash {
		t.Errorf("no policy: PolicyHash = %q, want DefaultPolicyHash", plain.PolicyHash)
	}
}
