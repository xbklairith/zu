// Package ir defines the intermediate representation: the only artifact the
// renderer reads. Its schema is versioned independently of the application.
package ir

// SchemaVersion is the IR format version. Readers refuse an IR whose version
// they do not understand rather than half-drawing it.
const SchemaVersion = "1"

// NodeKind names what a node stands for.
type NodeKind string

// Node kinds.
const (
	KindPackage  NodeKind = "package"
	KindType     NodeKind = "type"
	KindFunction NodeKind = "function"
	KindExternal NodeKind = "external"
)

// EdgeKind names the dependency an edge records.
type EdgeKind string

// Edge kinds. Edges are stored only at their finest level.
const (
	EdgeImports EdgeKind = "imports"
	EdgeCalls   EdgeKind = "calls"
	EdgeEmbeds  EdgeKind = "embeds"
)

// Type kinds recorded on type nodes.
const (
	TypeStruct    = "struct"
	TypeInterface = "interface"
	TypeOther     = "other"
)

// IR is one repository at one ref. Field order is part of the contract.
type IR struct {
	SchemaVersion     string         `json:"schemaVersion"`
	Ref               Ref            `json:"ref"`
	Grouping          string         `json:"grouping"`
	PolicyHash        string         `json:"policyHash"`
	Nodes             []Node         `json:"nodes"`
	Edges             []Edge         `json:"edges"`
	UnresolvedCalls   map[string]int `json:"unresolvedCalls"`
	UnresolvedImports map[string]int `json:"unresolvedImports"`
	ParseErrors       []ParseError   `json:"parseErrors"`
	Unsupported       map[string]int `json:"unsupported"`
}

// Ref identifies the source state the IR was scanned from. Commit is empty
// outside a git repository or before the first commit.
type Ref struct {
	Commit string `json:"commit"`
	Dirty  bool   `json:"dirty"`
}

// Node is a package, type, function (including methods) or external module.
// Optional fields are omitted for kinds they do not apply to.
type Node struct {
	ID        string     `json:"id"`
	Kind      NodeKind   `json:"kind"`
	Parent    string     `json:"parent,omitempty"`
	Module    string     `json:"module,omitempty"`
	Exported  *bool      `json:"exported,omitempty"`
	TypeKind  string     `json:"typeKind,omitempty"`
	Generated bool       `json:"generated,omitempty"`
	Hash      string     `json:"hash,omitempty"`
	Locations []Location `json:"locations"`
}

// Edge is one dependency with every source location that justifies it.
type Edge struct {
	From      string     `json:"from"`
	To        string     `json:"to"`
	Kind      EdgeKind   `json:"kind"`
	Locations []Location `json:"locations"`
}

// Location is a repo-relative, forward-slash path and a 1-based line.
type Location struct {
	Path string `json:"path"`
	Line int    `json:"line"`
}

// ParseError records a file the scanner could not parse.
type ParseError struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}
