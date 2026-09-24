//go:build unix

package cli

import (
	"bytes"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

// Opening a FIFO for reading blocks until something writes to it, so zu
// must refuse it before it opens it.
func TestScanCoverprofileRefusesAFIFO(t *testing.T) {
	withUI(t)
	fifo := filepath.Join(t.TempDir(), "cover.out")
	if err := syscall.Mkfifo(fifo, 0o600); err != nil {
		t.Skipf("mkfifo: %v", err)
	}
	dir := repo(t, small)
	done := make(chan string, 1)
	go func() {
		var stderr bytes.Buffer
		Run([]string{"scan", dir, "-html", "x.html", "-coverprofile", fifo}, &bytes.Buffer{}, &stderr)
		done <- stderr.String()
	}()
	select {
	case got := <-done:
		if !strings.Contains(got, "not a regular file") {
			t.Errorf("stderr = %q", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("zu blocked opening a FIFO")
	}
}
