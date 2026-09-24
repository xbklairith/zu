package scan

import (
	"crypto/sha256"
	"sync"
)

// Cache keeps each file's facts between scans, keyed by path and content
// hash, so a rescan parses only the files whose content changed (10). A
// file's facts depend on nothing but its path and content, so one Cache
// serves any Tree. Everything after extraction (modules, the index, the
// build) still runs over every file, which is what keeps a rescan's IR
// byte-identical to a cold scan's. Safe for concurrent use.
type Cache struct {
	mu    sync.Mutex
	files map[string]cached
}

type cached struct {
	sum   [sha256.Size]byte
	facts *fileFacts // shared between scans: nothing writes to it after extraction
}

// NewCache returns an empty Cache.
func NewCache() *Cache { return &Cache{files: map[string]cached{}} }

// extract returns rel's facts, from c when rel's content is what c last saw,
// and reports whether it parsed rel. A nil Cache parses every file. A read
// error is never cached: it says nothing about the content.
func (c *Cache) extract(t Tree, rel string) (f *fileFacts, parsed bool) {
	src, err := t.ReadFile(rel)
	if err != nil {
		return readFailed(rel, err), false
	}
	if c == nil {
		return extractSource(rel, src), true
	}
	sum := sha256.Sum256(src)
	c.mu.Lock()
	e, ok := c.files[rel]
	c.mu.Unlock()
	if ok && e.sum == sum {
		return e.facts, false
	}
	f = extractSource(rel, src)
	c.mu.Lock()
	c.files[rel] = cached{sum, f}
	c.mu.Unlock()
	return f, true
}

// keep drops every file not in files, so a deleted file's facts do not
// outlive it.
func (c *Cache) keep(files []string) {
	if c == nil {
		return
	}
	live := make(map[string]bool, len(files))
	for _, f := range files {
		live[f] = true
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for p := range c.files {
		if !live[p] {
			delete(c.files, p)
		}
	}
}
