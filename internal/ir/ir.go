// Package ir defines the intermediate representation: the only artifact the
// renderer reads. Its schema is versioned independently of the application.
package ir

// SchemaVersion is the IR format version. Readers refuse an IR whose version
// they do not understand rather than half-drawing it.
const SchemaVersion = "0"
