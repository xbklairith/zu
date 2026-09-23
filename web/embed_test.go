package web

import (
	"io/fs"
	"testing"
)

func TestAssetsIsRootedAtDist(t *testing.T) {
	assets, err := Assets()
	if err != nil {
		t.Fatalf("Assets() error: %v", err)
	}
	if _, err := fs.Stat(assets, ".gitkeep"); err != nil {
		t.Errorf("expected dist contents at FS root: %v", err)
	}
}
