// Package web embeds the built UI (web/dist) into the binary.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Assets returns the built UI rooted at dist/.
func Assets() (fs.FS, error) {
	return fs.Sub(dist, "dist")
}
