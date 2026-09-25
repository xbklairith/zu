package scan

import (
	"io/fs"
	"syscall"
)

// sysStamp is fi's status-change time and inode.
func sysStamp(fi fs.FileInfo) (ctime int64, ino uint64) {
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		return 0, 0
	}
	return st.Ctimespec.Nano(), st.Ino
}
