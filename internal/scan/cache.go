package scan

import (
	"crypto/sha256"
	"io/fs"
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
