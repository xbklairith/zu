package scan

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestWalkSkipsAndOrders(t *testing.T) {
	root := tree(t, map[string]string{
		"go.mod":              "module example.com/m\n",
		"b/b.go":              "package b\n",
		"a/a.go":              "package a\n",
		"a/a_test.go":         "package a\n",
		"vendor/v/v.go":       "package v\n",
		"x/testdata/t.go":     "package t\n",
		".hidden/h.go":        "package h\n",
		"_skip/s.go":          "package s\n",
		"main.go":             "package main\n",
		"README":              "no extension\n",
		"web/app.ts":          "x",
		"web/app.tsx":         "x",
		"web/b.ts":            "x",
		"vendor/v/ignored.py": "x",
		"notes.md":            "not source\n",
	})
	w, err := walk(root)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"a/a.go", "b/b.go", "main.go"}
	if !reflect.DeepEqual(w.Files, want) {
		t.Fatalf("Files = %v, want %v", w.Files, want)
	}
	wantU := map[string]int{".ts": 2, ".tsx": 1}
	if !reflect.DeepEqual(w.Unsupported, wantU) {
		t.Fatalf("Unsupported = %v, want %v", w.Unsupported, wantU)
	}
}

func TestWalkModulesAndImportPaths(t *testing.T) {
	root := tree(t, map[string]string{
		"go.mod":         "module example.com/m\n\nrequire (\n\tgithub.com/x/y v1.0.0\n\tgithub.com/x/y/v2 v2.0.0\n)\n",
		"root.go":        "package m\n",
		"svc/s.go":       "package svc\n",
		"tools/go.mod":   "module example.com/m/tools\n",
		"tools/gen/g.go": "package gen\n",
	})
	w, err := walk(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Modules) != 2 {
		t.Fatalf("Modules = %+v", w.Modules)
	}
	cases := map[string]string{
		".":         "example.com/m",
		"svc":       "example.com/m/svc",
		"tools":     "example.com/m/tools",
		"tools/gen": "example.com/m/tools/gen",
	}
	for dir, want := range cases {
		m := w.moduleFor(dir)
		if m == nil {
			t.Fatalf("no module for %q", dir)
		}
		if got := importPath(m, dir); got != want {
			t.Errorf("importPath(%q) = %q, want %q", dir, got, want)
		}
	}
	m := w.moduleFor(".")
	wantReq := []require{{Path: "github.com/x/y", Line: 4}, {Path: "github.com/x/y/v2", Line: 5}}
	if !reflect.DeepEqual(m.Requires, wantReq) {
		t.Fatalf("Requires = %+v, want %+v", m.Requires, wantReq)
	}
}

func TestWalkFileOutsideModuleIsAnError(t *testing.T) {
	root := tree(t, map[string]string{
		"loose/l.go": "package l\n",
		"mod/go.mod": "module example.com/mod\n",
		"mod/m.go":   "package mod\n",
	})
	w, err := walk(root)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(w.Files, []string{"mod/m.go"}) {
		t.Fatalf("Files = %v", w.Files)
	}
	if len(w.Errors) != 1 || w.Errors[0].Path != "loose/l.go" {
		t.Fatalf("Errors = %+v", w.Errors)
	}
}

func TestWalkMalformedGoModIsAnError(t *testing.T) {
	root := tree(t, map[string]string{
		"go.mod": "this is not a go.mod\n",
		"a.go":   "package a\n",
	})
	w, err := walk(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Errors) == 0 || w.Errors[0].Path != "go.mod" {
		t.Fatalf("Errors = %+v", w.Errors)
	}
}

func TestWalkSymlinks(t *testing.T) {
	outside := tree(t, map[string]string{"secret/s.go": "package secret\n", "o.go": "package o\n"})
	root := tree(t, map[string]string{
		"go.mod":  "module example.com/m\n",
		"in/i.go": "package in\n",
	})
	links := map[string]string{
		"linkdir":      filepath.Join(outside, "secret"),
		"in/escape.go": filepath.Join(outside, "o.go"),
		"in/inner.go":  filepath.Join(root, "in", "i.go"),
		"indir":        filepath.Join(root, "in"),
	}
	for name, target := range links {
		if err := os.Symlink(target, filepath.Join(root, filepath.FromSlash(name))); err != nil {
			t.Skipf("symlinks unsupported: %v", err)
		}
	}
	w, err := walk(root)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"in/i.go", "in/inner.go"}
	if !reflect.DeepEqual(w.Files, want) {
		t.Fatalf("Files = %v, want %v", w.Files, want)
	}
}

func TestWalkRootMustBeADirectory(t *testing.T) {
	root := tree(t, map[string]string{"f.go": "package f\n"})
	if _, err := walk(filepath.Join(root, "missing")); err == nil {
		t.Fatal("want error for missing root")
	}
	if _, err := walk(filepath.Join(root, "f.go")); err == nil {
		t.Fatal("want error for file root")
	}
}
