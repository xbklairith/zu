// Command zu renders a Go repository's component topology, and any change to
// it, as an interactive diagram.
package main

import (
	"os"

	"zu/internal/cli"
)

func main() {
	os.Exit(cli.Run(os.Args[1:], os.Stdout, os.Stderr))
}
