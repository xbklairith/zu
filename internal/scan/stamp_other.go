//go:build !darwin && !linux

package scan

import "io/fs"

// sysStamp is zero where zu does not read the system's stat: a Stamp is
// then size and mtime only.
func sysStamp(fs.FileInfo) (ctime int64, ino uint64) { return 0, 0 }
