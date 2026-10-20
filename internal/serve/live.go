package serve

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
)

// Hub holds what zu serve's watch last built (13): the latest View, its
// generation, a notice for the page, and (19) how many rescans published no
// View, and wakes every open stream when one changes. Safe for concurrent
// use.
type Hub struct {
	mu     sync.Mutex
	view   []byte
	gen    uint64
	notice string
	source uint64 // rescans that published no View
	subs   map[chan struct{}]bool
	closed bool
}

// NewHub starts at generation 1 with view.
func NewHub(view []byte) *Hub {
	return &Hub{view: view, gen: 1, subs: map[chan struct{}]bool{}}
}

// Publish makes view the latest View, under the next generation, and clears
// the notice.
func (h *Hub) Publish(view []byte) {
	h.set(func() { h.view, h.gen, h.notice = view, h.gen+1, "" })
}

// Keep says the watch rescanned and publishes no View (19): the View is the
// same, the rescan failed, or a file no longer parses. The page shows text
// over its drawing ("" clears it) and reads the files it shows again: a save
// can change a file's text and not the View.
func (h *Hub) Keep(text string) {
	h.set(func() { h.notice, h.source = text, h.source+1 })
}

// Latest returns the latest View, its generation and the notice.
func (h *Hub) Latest() (view []byte, gen uint64, notice string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.view, h.gen, h.notice
}

// Close ends every stream, now and later: zu serve is stopping.
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.closed = true
	for c := range h.subs {
		close(c)
	}
	clear(h.subs)
}

func (h *Hub) set(change func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	change()
	for c := range h.subs {
		select { // a stream that has not caught up yet reads the latest anyway
		case c <- struct{}{}:
		default:
		}
	}
}

// subscribe returns a channel that is signalled after each change and
// closed with the Hub, and a function to stop.
func (h *Hub) subscribe() (<-chan struct{}, func()) {
	c := make(chan struct{}, 1)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		close(c)
		return c, func() {}
	}
	h.subs[c] = true
	return c, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if h.subs[c] {
			delete(h.subs, c)
		}
	}
}

// stream is GET /events: Server-Sent Events, "view" with the latest
// generation, "notice" with the notice and (19) "source" with the count of
// rescans that published no View, each sent at once and again whenever it
// changes.
func (h *Hub) stream(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "zu serve cannot stream here", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	wake, stop := h.subscribe()
	defer stop()
	var sentGen uint64
	sentNotice := "\x00"     // never a notice, so the first is sent
	sentSource := ^uint64(0) // never a count, so the first is sent
	for {
		h.mu.Lock()
		gen, notice, source := h.gen, h.notice, h.source
		h.mu.Unlock()
		if gen != sentGen {
			fmt.Fprintf(w, "event: view\ndata: %d\n\n", gen)
			sentGen = gen
		}
		if notice != sentNotice {
			fmt.Fprintf(w, "event: notice\ndata: %s\n\n", strings.Join(strings.Fields(notice), " "))
			sentNotice = notice
		}
		if source != sentSource {
			fmt.Fprintf(w, "event: source\ndata: %d\n\n", source)
			sentSource = source
		}
		fl.Flush()
		select {
		case <-r.Context().Done():
			return
		case _, ok := <-wake:
			if !ok {
				return
			}
		}
	}
}
