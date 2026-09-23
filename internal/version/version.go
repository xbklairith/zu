// Package version holds build identity, injected at link time:
//
//	go build -ldflags "-X zu/internal/version.Version=v0.1.0 -X zu/internal/version.Commit=$(git rev-parse HEAD)"
package version

var (
	// Version is the application version.
	Version = "dev"
	// Commit is the source commit the binary was built from.
	Commit = "unknown"
)
