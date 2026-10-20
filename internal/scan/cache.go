package scan

import (
	"crypto/sha256"
	"io/fs"
	"sync"

	"zu/internal/ir"
)

// Cache keeps each file's facts between scans, keyed by path and content
// hash, so a rescan parses only the files whose content changed (10). A
// file's facts depend on nothing but its path and content, so one Cache
// serves any Tree. It also keeps the last scan's assembly by package, so a
// rescan assembles again only the packages whose files changed, that are
// new, or that import a path whose package is new, gone or has a new
// surface, and every package when the modules (a path, a directory, or a
// require's path or line) changed (16). The rest of the IR is
// the last scan's, which is what a cold scan would build of it, byte for
// byte. Keep one Cache per sequence of scans of one tree: scanning another
// tree through it (serve's Base, say) replaces the kept assembly, and each
// scan after that assembles again, as a rescan would, every package the two
// trees differ in and its importers. Successive IRs share
// location lists with the kept parts: nothing may append to an IR's
// Locations in place, or sort them but through ir.Sort, which leaves sorted
// lists alone. Safe for concurrent use.
type Cache struct {
	mu    sync.Mutex
	files map[string]cached
	last  *assembly // the last scan's; nil when it assembled the whole tree at once
	built int       // how many packages the last scan assembled
}

type cached struct {
	sum   [sha256.Size]byte
	facts *fileFacts // shared between scans: nothing writes to it after extraction
	stamp Stamp      // as the Tree listed the file when it was last read; zero if unknown
}

// Stamp is what Lstat says of a regular file: size, modification time,
// status-change time and inode. An edit that keeps the size and puts the
// mtime back (touch -r, cp -p, rsync -t) still moves the ctime, and a file
// replaced by a rename has a new inode. The zero Stamp means "unknown": a
// symlink, or a Tree that did not Lstat. Ctime and Ino are zero on systems
// other than darwin and linux.
type Stamp struct {
	Size  int64
	Mod   int64 // UnixNano
	Ctime int64 // UnixNano
	Ino   uint64
}

// StampOf is fi's Stamp: zero for anything but a regular file, since a
// symlink's own Stamp says nothing of its target's content.
func StampOf(fi fs.FileInfo) Stamp {
	if fi == nil || !fi.Mode().IsRegular() {
		return Stamp{}
	}
	return Stat(fi)
}

// Stat is fi's Stamp whatever fi is: a directory's changes when an entry is
// added, removed or renamed. It is zero for a nil fi.
func Stat(fi fs.FileInfo) Stamp {
	if fi == nil {
		return Stamp{}
	}
	ctime, ino := sysStamp(fi)
	return Stamp{Size: fi.Size(), Mod: fi.ModTime().UnixNano(), Ctime: ctime, Ino: ino}
}

// stamper is a Tree that knows each file's Stamp from its listing.
type stamper interface {
	stamp(rel string) Stamp
}

// StampIn is rel's Stamp as t listed it: zero unless t is a ListTree whose
// Files ran. zu serve's watch starts from the first scan's (13).
func StampIn(t Tree, rel string) Stamp {
	if s, ok := t.(stamper); ok {
		return s.stamp(rel)
	}
	return Stamp{}
}

// NewCache returns an empty Cache.
func NewCache() *Cache { return &Cache{files: map[string]cached{}} }

// extract returns rel's facts, from c when rel's content is what c last saw,
// and reports whether it parsed rel. A nil Cache parses every file. A read
// error is never cached: it says nothing about the content. With trust, a
// file whose Stamp is the one c kept is not read at all (13): an edit that
// keeps both size and mtime then goes unseen until the file changes again.
func (c *Cache) extract(t Tree, rel string, trust bool) (f *fileFacts, parsed bool) {
	st := StampIn(t, rel)
	var e cached
	var ok bool
	if c != nil {
		c.mu.Lock()
		e, ok = c.files[rel]
		c.mu.Unlock()
		if trust && ok && st != (Stamp{}) && e.stamp == st {
			return e.facts, false
		}
	}
	src, err := t.ReadFile(rel)
	if err != nil {
		return readFailed(rel, err), false
	}
	if c == nil {
		return extractSource(rel, src), true
	}
	sum := sha256.Sum256(src)
	if ok && e.sum == sum {
		if e.stamp != st {
			c.mu.Lock()
			c.files[rel] = cached{sum, e.facts, st}
			c.mu.Unlock()
		}
		return e.facts, false
	}
	f = extractSource(rel, src)
	c.mu.Lock()
	c.files[rel] = cached{sum, f, st}
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

// assemble assembles facts from the last scan's parts where they hold (16),
// and reports how many packages it assembled. A nil Cache, or a tree whose
// node ids could meet, assembles the whole tree.
func (c *Cache) assemble(w *walkResult, facts []*fileFacts) (*ir.IR, Measures, int) {
	if c == nil {
		doc, ms := assemble(w, facts)
		return doc, ms, packages(doc)
	}
	c.mu.Lock()
	prev := c.last
	c.mu.Unlock()
	a, n := assembleParts(prev, w, facts)
	var doc *ir.IR
	var ms Measures
	if a == nil {
		doc, ms = assemble(w, facts)
		n = packages(doc)
	} else {
		doc, ms = a.ir(w, facts)
	}
	c.mu.Lock()
	c.last, c.built = a, n
	c.mu.Unlock()
	return doc, ms, n
}

// packages counts doc's package nodes.
func packages(doc *ir.IR) int {
	n := 0
	for _, x := range doc.Nodes {
		if x.Kind == ir.KindPackage {
			n++
		}
	}
	return n
}
