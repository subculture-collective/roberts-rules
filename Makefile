SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
DEV_POSTGRES_PORT ?= 55433
DEV_DATABASE_URL ?= postgres://roberts_rules:change-me@localhost:$(DEV_POSTGRES_PORT)/roberts_rules?sslmode=disable

.PHONY: help deps dev dev-db dev-api dev-web dev-fixture dev-status dev-logs dev-down \
	verify fmt lint test test-e2e test-e2e-ui test-e2e-install build backup-test \
	compose-config open-pilot-check

help:
	@awk 'BEGIN {FS = ":.*##"; printf "Commands:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

deps:
	pnpm install --frozen-lockfile

dev: dev-db ## Start PostgreSQL, API, and web development servers
	@trap 'kill $$api_pid 2>/dev/null || true' EXIT INT TERM; \
		DATABASE_URL='$(DEV_DATABASE_URL)' pnpm --filter @subculture/roberts-rules-api dev & api_pid=$$!; \
		pnpm --filter @subculture/roberts-rules-web dev; \
		wait $$api_pid

dev-db: ## Start PostgreSQL and wait until it is healthy
	POSTGRES_PORT='$(DEV_POSTGRES_PORT)' docker compose up -d --wait postgres

dev-api: ## Start the API development server (requires dev-db)
	DATABASE_URL='$(DEV_DATABASE_URL)' pnpm --filter @subculture/roberts-rules-api dev

dev-web: ## Start the Vite development server
	pnpm --filter @subculture/roberts-rules-web dev

dev-fixture: ## Create a disposable open meeting and print enrollment tokens once
	DATABASE_URL='$(DEV_DATABASE_URL)' CONFIRM_DEV_FIXTURE=local-only pnpm --filter @subculture/roberts-rules-api dev:fixture

dev-status: ## Show development service status
	docker compose ps

dev-logs: ## Follow PostgreSQL development logs
	docker compose logs -f postgres

dev-down: ## Stop development containers without deleting data
	docker compose down

verify: deps fmt lint test backup-test build compose-config open-pilot-check ## Run all checks

fmt:
	pnpm run format

lint:
	pnpm run lint

test:
	pnpm run test

test-e2e: dev-db ## Run Playwright across desktop and mobile browser projects
	pnpm test:e2e

test-e2e-ui: ## Open the interactive Playwright test runner
	pnpm test:e2e:ui

test-e2e-install: ## Install Playwright browser runtimes
	pnpm test:e2e:install

backup-test: ## Run private journal backup and restore script tests
	pnpm exec bats tests/backup-private-journal.bats tests/restore-private-journal.bats

build:
	pnpm run build

compose-config:
	docker compose config --quiet

open-pilot-check:
	@test -f .gitea/ISSUE_TEMPLATE/open-pilot-task.yaml
	@grep -q 'Test Command' .gitea/ISSUE_TEMPLATE/open-pilot-task.yaml
