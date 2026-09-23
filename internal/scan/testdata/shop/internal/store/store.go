// Package store keeps orders.
package store

import (
	"database/sql"
	"sync"

	"github.com/lib/pq"

	"example.com/shop/internal/money"
)

// Reader reads orders.
type Reader interface {
	Get(id int) (Order, error)
}

// ReadWriter reads and writes orders.
type ReadWriter interface {
	Reader
	Put(o Order) error
}

// Order is one order.
type Order struct {
	ID    int
	Total money.Cents
}

// Repo stores orders in memory.
type Repo struct {
	sync.Mutex
	*sql.DB
	pq.Driver
	cache map[int]Order
	hook  func()
}

// Open returns an empty Repo.
func Open() *Repo { return &Repo{cache: map[int]Order{}} }

// Get returns one order.
func (r *Repo) Get(id int) (Order, error) {
	r.Lock()
	defer r.Unlock()
	o := r.cache[id]
	r.hook()
	return o, r.check(o)
}

func (r *Repo) check(o Order) error {
	_ = money.Add(o.Total, money.Zero)
	return nil
}

// Reset replaces the receiver, so its calls are not certain.
func (r *Repo) Reset() {
	r = Open()
	r.check(Order{})
}

// Page is one page of results.
type Page[T any] struct {
	Items []T
}

// Len is the page size.
func (p *Page[T]) Len() int { return len(p.Items) }
