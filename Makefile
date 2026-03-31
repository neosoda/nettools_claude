.PHONY: dev build test lint clean install-tools frontend-deps frontend-build frontend-lint ci

# Variables
APP_NAME := networktools
WAILS := wails

# Install development tools
install-tools:
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	cd frontend && npm install

# Install frontend dependencies
frontend-deps:
	cd frontend && npm install

# Run in development mode
dev:
	$(WAILS) dev

# Build production binary
build: frontend-build
	$(WAILS) build

# Build frontend only
frontend-build:
	cd frontend && npm run build

# Build for Windows
build-windows:
	GOOS=windows GOARCH=amd64 $(WAILS) build

# Run Go tests
test:
	mkdir -p frontend/dist && touch frontend/dist/.keep
	go test ./internal/... -v -count=1

# Run tests with coverage
test-cover:
	go test ./internal/... -coverprofile=coverage.out -count=1
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

# Run linter
lint:
	golangci-lint run ./...

# Run Go vet
vet:
	go vet ./...

# Frontend TypeScript check
frontend-lint:
	cd frontend && npx tsc --noEmit

# Format code
fmt:
	go fmt ./...

# Clean build artifacts
clean:
	rm -rf build/bin
	rm -f coverage.out coverage.html

# Full CI check (what GitHub Actions runs)
ci: vet test frontend-lint
	@echo "CI checks passed"
