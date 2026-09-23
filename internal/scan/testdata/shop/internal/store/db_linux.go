//go:build linux

package store

func dialect() string { return "linux" }

func init() { register() }
