.PHONY: dev build build-widget build-all deploy test test-watch test-e2e test-e2e-ui test-e2e-shard lint lint-fix format format-check typecheck knip audit check ci clean install install-playwright help

# Development
dev:
	npm run dev

# Build
build:
	npm run build

build-widget:
	npm run build:widget

build-all: build-widget build

deploy: build-all
	npm run deploy

# Testing
test:
	npm run test

test-watch:
	npm run test:watch

test-e2e:
	npm run test:e2e

test-e2e-ui:
	npm run test:e2e:ui

test-e2e-shard:
	@if [ -z "$(SHARD)" ]; then \
		echo "Usage: make test-e2e-shard SHARD=1/2"; \
		exit 1; \
	fi
	npx playwright test --project=chromium --shard=$(SHARD)

# Code Quality
lint:
	npx eslint .

lint-fix:
	npx eslint . --fix

format:
	npm run format

format-check:
	npm run format:check

audit:
	npm audit --audit-level=critical

typecheck:
	npm run typecheck

knip:
	npx knip

# Combined Commands
check: lint format-check typecheck knip audit
	@echo "✓ All checks passed"

ci: check test build-all test-e2e
	@echo "✓ Full CI passed"

# Utilities
clean:
	rm -rf dist node_modules/.cache playwright-report test-results .wrangler/tmp public/widget*.js public/versions.json

install:
	npm ci

install-playwright:
	npx playwright install --with-deps chromium

# Help (default target)
help:
	@echo "Available commands:"
	@echo ""
	@echo "  Development:"
	@echo "    make dev              - Start development server"
	@echo "    make build            - Build TypeScript"
	@echo "    make build-widget     - Build widget bundle"
	@echo "    make build-all        - Build widget and TypeScript"
	@echo "    make deploy           - Deploy to Cloudflare"
	@echo ""
	@echo "  Testing:"
	@echo "    make test             - Run unit tests"
	@echo "    make test-watch       - Run unit tests in watch mode"
	@echo "    make test-e2e         - Run E2E tests"
	@echo "    make test-e2e-ui      - Run E2E tests with UI"
	@echo "    make test-e2e-shard SHARD=1/2  - Run E2E test shard"
	@echo ""
	@echo "  Code Quality:"
	@echo "    make lint             - Run ESLint"
	@echo "    make lint-fix         - Run ESLint with auto-fix"
	@echo "    make format           - Format code with Prettier"
	@echo "    make format-check     - Check formatting (no write)"
	@echo "    make typecheck        - Run TypeScript type checking"
	@echo "    make knip             - Check for dead code"
	@echo "    make audit            - Run npm security audit"
	@echo ""
	@echo "  Combined:"
	@echo "    make check            - Run lint, typecheck, knip, and audit"
	@echo "    make ci               - Run full CI pipeline locally"
	@echo ""
	@echo "  Utilities:"
	@echo "    make clean            - Clean build artifacts"
	@echo "    make install          - Install dependencies"
	@echo "    make install-playwright - Install Playwright browsers"
