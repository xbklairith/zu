package export

import (
	"errors"
	"net/url"
	"strings"

	"zu/internal/ir"
)

// ForRepo returns link templates for head, or nil when a link would mislead:
// no commit, uncommitted changes, or an origin zu cannot map and no template.
// Only host and path of origin are used, so credentials in it never reach the
// file. prefix is the scan root's path inside the repository ("" at the top,
// else "sub/dir/"), because IR paths are relative to the scan root.
func ForRepo(origin string, head ir.Ref, template, prefix string) (*Links, error) {
	if template != "" {
		if !strings.HasPrefix(template, "https://") || !strings.Contains(template, "{path}") {
			return nil, errors.New("-link-template must start with https:// and contain {path}")
		}
	}
	if head.Commit == "" || head.Dirty {
		return nil, nil
	}
	if template != "" {
		t := strings.ReplaceAll(template, "{commit}", head.Commit)
		return &Links{Blob: strings.ReplaceAll(t, "{path}", prefix+"{path}")}, nil
	}
	host, repo := parseRemote(origin)
	switch {
	case host == "github.com":
		return &Links{Blob: "https://github.com/" + repo + "/blob/" + head.Commit + "/" + prefix + "{path}#L{line}"}, nil
	case host == "gitlab.com":
		return &Links{Blob: "https://gitlab.com/" + repo + "/-/blob/" + head.Commit + "/" + prefix + "{path}#L{line}"}, nil
	}
	return nil, nil
}

// BaseBlob is ForRepo's blob template at base, the Change View's
// merge-base, for what the change removed (14), or "". A template without
// {commit} gives none: it would open head's file.
func BaseBlob(origin string, base ir.Ref, template string) string {
	if template != "" && !strings.Contains(template, "{commit}") {
		return ""
	}
	l, err := ForRepo(origin, base, template, "")
	if err != nil || l == nil {
		return ""
	}
	return l.Blob
}

// CompareURL returns the host's page comparing base with head, or "" when
// either side is not a clean commit or the origin is not GitHub or GitLab.
func CompareURL(origin string, base, head ir.Ref) string {
	if base.Commit == "" || base.Dirty || head.Commit == "" || head.Dirty {
		return ""
	}
	host, repo := parseRemote(origin)
	switch host {
	case "github.com":
		return "https://github.com/" + repo + "/compare/" + base.Commit + "..." + head.Commit
	case "gitlab.com":
		return "https://gitlab.com/" + repo + "/-/compare/" + base.Commit + "..." + head.Commit
	}
	return ""
}

// parseRemote returns host and repository path from an https, ssh or scp-style
// remote URL, dropping any user or password.
func parseRemote(origin string) (host, repo string) {
	s := strings.TrimSuffix(strings.TrimSpace(origin), ".git")
	if strings.Contains(s, "://") {
		u, err := url.Parse(s)
		if err != nil {
			return "", ""
		}
		return u.Hostname(), strings.Trim(u.Path, "/")
	}
	at, colon := strings.Index(s, "@"), strings.Index(s, ":")
	if colon < 0 || at > colon {
		return "", ""
	}
	return s[at+1 : colon], strings.Trim(s[colon+1:], "/")
}
