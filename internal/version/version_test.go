package version

import (
	"runtime/debug"
	"testing"
)

func info(version string, settings ...string) *debug.BuildInfo {
	bi := &debug.BuildInfo{Main: debug.Module{Path: "github.com/xbklairith/zu", Version: version}}
	for i := 0; i+1 < len(settings); i += 2 {
		bi.Settings = append(bi.Settings, debug.BuildSetting{Key: settings[i], Value: settings[i+1]})
	}
	return bi
}

func TestFromBuildInfo(t *testing.T) {
	for _, tc := range []struct {
		name               string
		bi                 *debug.BuildInfo
		ok                 bool
		v, c, wantV, wantC string
	}{
		{"module version", info("v0.1.0"), true, "dev", "unknown", "v0.1.0", "unknown"},
		{"checkout build", info("(devel)", "vcs.revision", "abc123", "vcs.modified", "false"), true, "dev", "unknown", "dev", "abc123"},
		{"dirty checkout", info("(devel)", "vcs.revision", "abc123", "vcs.modified", "true"), true, "dev", "unknown", "dev", "abc123-dirty"},
		{"ldflags win", info("v0.0.9", "vcs.revision", "abc123"), true, "v0.1.0", "def456", "v0.1.0", "def456"},
		{"no build info", nil, false, "dev", "unknown", "dev", "unknown"},
		{"empty main version", info(""), true, "dev", "unknown", "dev", "unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			v, c := fromBuildInfo(tc.bi, tc.ok, tc.v, tc.c)
			if v != tc.wantV || c != tc.wantC {
				t.Errorf("got (%q, %q), want (%q, %q)", v, c, tc.wantV, tc.wantC)
			}
		})
	}
}
