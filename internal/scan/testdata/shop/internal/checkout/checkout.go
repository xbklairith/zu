// Package checkout prices carts.
package checkout

import (
	"errors"

	. "example.com/shop/internal/money"
	st "example.com/shop/internal/store"
	"golang.org/x/sync/errgroup"
)

// Cart is what a customer buys.
type Cart struct {
	st.Order
	Lines []Line
}

// Line is one priced item.
type Line struct{ Price Cents }

// Total sums a cart.
func Total(c *Cart) Cents {
	if c == nil {
		return 0
	}
	var sum Cents
	for _, l := range c.Lines {
		sum = Add(sum, l.Price)
	}
	return sum
}

// Place validates and stores a cart.
func Place(c *Cart) error {
	repo := st.Open()
	if _, err := repo.Get(c.ID); err != nil {
		return err
	}
	var g errgroup.Group
	g.Go(func() error { return validate(c) })
	return errors.New("todo")
}

func validate(c *Cart) error {
	validate := func(*Cart) error { return nil }
	return validate(c)
}
