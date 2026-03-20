# Contributing

## Setup
- Install Go per `go.mod` and Node.js 22.
- Run `cd frontend && npm ci`.
- Run `make test` before opening a PR.

## Workflow
- Keep backend changes covered by focused Go tests when logic changes.
- Prefer small PRs with a clear operational impact.
- Document any security-sensitive tradeoff in the PR description.
