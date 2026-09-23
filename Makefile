VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT  ?= $(shell git rev-parse --verify -q HEAD 2>/dev/null || echo unknown)
LDFLAGS := -s -w -X zu/internal/version.Version=$(VERSION) -X zu/internal/version.Commit=$(COMMIT)

.PHONY: build web test lint fmt check clean

build: web ## Build the zu binary with the UI embedded
	CGO_ENABLED=0 go build -trimpath -ldflags '$(LDFLAGS)' -o bin/zu ./cmd/zu

web: ## Build the UI into web/dist
	cd web && npm ci --silent && npm run build

test: ## Run Go tests
	go test -race ./...

lint: ## Lint Go and type-check the UI
	golangci-lint run ./...
	cd web && npm run typecheck

fmt: ## Format Go sources
	gofmt -w cmd internal web/*.go

check: lint test ## Everything CI runs

clean:
	rm -rf bin web/dist/assets web/dist/index.html
