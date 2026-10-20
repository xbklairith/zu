package export

import (
	"bytes"
	"go/scanner"
	"go/token"
	"unicode/utf8"
)

// The classes of Syntax runs (19); web/src/code.ts names them.
const (
	tokKeyword = 1
	tokComment = 2
	tokString  = 3 // string and character literals
	tokNumber  = 4
)

// Syntax colours Go source for the Code panel (19): for each line of src, as
// strings.Split(src, "\n") cuts it, the runs [column, length, class] of its
// keywords, comments, literals and numbers, flat, with columns and lengths in
// UTF-16 code units, as the page's JavaScript counts them. A token across
// lines (a block comment, a raw string) has a run on each. It reads src with
// go/scanner, so src need not parse, nor be a whole file: what does not scan
// stays plain.
func Syntax(src []byte) [][]int {
	starts := []int{0} // each line's first byte
	for i, c := range src {
		if c == '\n' {
			starts = append(starts, i+1)
		}
	}
	out := make([][]int, len(starts))
	for i := range out {
		out[i] = []int{}
	}
	fset := token.NewFileSet()
	file := fset.AddFile("", fset.Base(), len(src))
	var s scanner.Scanner
	s.Init(file, src, func(token.Position, string) {}, scanner.ScanComments)
	line := 0 // the line of the last token, so the search starts there
	// column is byte b's column on line l, counted on from the last byte
	// asked of l, so a long line is counted once, not once per run.
	cur, at, col := -1, 0, 0
	column := func(l, b int) int {
		if l != cur {
			cur, at, col = l, starts[l], 0
		}
		col += utf16Len(src[at:b])
		at = b
		return col
	}
	for {
		pos, tok, lit := s.Scan()
		if tok == token.EOF {
			return out
		}
		class, n := classOf(tok, lit)
		if class == 0 {
			continue
		}
		start := file.Offset(pos)
		end := start + n
		if tok == token.COMMENT || tok == token.STRING && src[start] == '`' {
			end = tokenEnd(src, start, tok)
		}
		for line+1 < len(starts) && starts[line+1] <= start {
			line++
		}
		for l, from := line, start; from < end; l++ {
			stop := len(src)
			if l+1 < len(starts) {
				stop = starts[l+1] - 1 // the line's '\n'
			}
			to := min(end, stop)
			if to > from {
				out[l] = append(out[l], column(l, from), utf16Len(src[from:to]), class)
			}
			if l+1 >= len(starts) {
				break
			}
			from = starts[l+1]
		}
	}
}

// classOf is a token's class and its length in bytes when lit or the
// keyword gives it (0, 0 for a token Syntax leaves plain).
func classOf(tok token.Token, lit string) (int, int) {
	switch {
	case tok.IsKeyword():
		return tokKeyword, len(tok.String())
	case tok == token.COMMENT:
		return tokComment, len(lit)
	case tok == token.STRING, tok == token.CHAR:
		return tokString, len(lit)
	case tok == token.INT, tok == token.FLOAT, tok == token.IMAG:
		return tokNumber, len(lit)
	}
	return 0, 0
}

// tokenEnd is where the comment or raw string at start ends in src. The
// scanner drops a '\r' from either's text, so its length is not the span's.
// An unterminated one runs to the end.
func tokenEnd(src []byte, start int, tok token.Token) int {
	closer, from := "`", start+1
	switch {
	case tok == token.STRING:
	case src[start+1] == '/':
		closer = "\n"
	default:
		closer, from = "*/", start+2 // past "/*", so "/*/" does not close it
	}
	i := bytes.Index(src[from:], []byte(closer))
	if i < 0 {
		return len(src)
	}
	if closer == "\n" {
		return from + i
	}
	return from + i + len(closer)
}

// utf16Len counts b's UTF-16 code units: two for a rune past U+FFFF, and one
// for each byte that is not UTF-8, as encoding/json writes U+FFFD for it.
func utf16Len(b []byte) int {
	n := 0
	for len(b) > 0 {
		r, size := utf8.DecodeRune(b)
		n++
		if r > 0xFFFF {
			n++
		}
		b = b[size:]
	}
	return n
}
