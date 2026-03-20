.PHONY: dev build test lint frontend-build

dev:
	wails dev

build: frontend-build
	wails build

frontend-build:
	cd frontend && npm run build

test:
	mkdir -p frontend/dist && touch frontend/dist/.keep && go test ./...

lint:
	golangci-lint run
