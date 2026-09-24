// Package version holds build identity, injected at link time:
//
//	go build -ldflags "-X $(go list -m)/internal/version.Version=v0.1.0 -X $(go list -m)/internal/version.Commit=$(git rev-parse HEAD)"
//
// A build without those flags (a plain go build or go run) falls back to what
// the go command recorded: the module version and the VCS revision.
package version

import "runtime/debug"

var (
	// Version is the application version.
	Version = "dev"
	// Commit is the source commit the binary was built from.
	Commit = "unknown"
)

func init() {
	bi, ok := debug.ReadBuildInfo()
	Version, Commit = fromBuildInfo(bi, ok, Version, Commit)
}

// fromBuildInfo fills the values the linker left at their defaults. Values
// set with -X always win.
func fromBuildInfo(bi *debug.BuildInfo, ok bool, version, commit string) (string, string) {
	if !ok || bi == nil {
		return version, commit
	}
	if version == "dev" && bi.Main.Version != "" && bi.Main.Version != "(devel)" {
		version = bi.Main.Version
	}
	if commit == "unknown" {
		var rev, modified string
		for _, s := range bi.Settings {
			switch s.Key {
			case "vcs.revision":
				rev = s.Value
			case "vcs.modified":
				modified = s.Value
			}
		}
		if rev != "" {
			commit = rev
			if modified == "true" {
				commit += "-dirty"
			}
		}
	}
	return version, commit
}
