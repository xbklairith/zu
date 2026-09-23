// Package money holds amounts.
package money

// Cents is an amount in cents.
type Cents int64

// Currency is an ISO code.
type Currency = string

// Zero is no money.
const Zero Cents = 0

// Add returns the sum.
func Add(a, b Cents) Cents { return a + b }
