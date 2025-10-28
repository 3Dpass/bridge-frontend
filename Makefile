.PHONY: test test-watch test-coverage test-file lint lint-fix help

# Run all tests once (CI mode)
test:
	CI=1 npm test -- --watch=false

# Run tests in watch mode (interactive development)
test-watch:
	npm test

# Run tests with coverage report
test-coverage:
	CI=1 npm test -- --coverage --watch=false

# Run a specific test file
# Usage: make test-file FILE=src/utils/__tests__/retry-with-fallback.test.js
test-file:
	@if [ -z "$(FILE)" ]; then \
		echo "Error: FILE parameter is required"; \
		echo "Usage: make test-file FILE=src/utils/__tests__/retry-with-fallback.test.js"; \
		exit 1; \
	fi
	CI=1 npm test -- --watch=false --testPathPattern="$(FILE)"

# Run ESLint
lint:
	npm run lint

# Auto-fix ESLint issues
lint-fix:
	npm run lint:fix

# Show available commands
help:
	@echo "Available make commands:"
	@echo "  make test             - Run all tests once (CI mode)"
	@echo "  make test-watch       - Run tests in watch mode (interactive)"
	@echo "  make test-coverage    - Run tests with coverage report"
	@echo "  make test-file FILE=<path> - Run specific test file"
	@echo "  make lint             - Run ESLint"
	@echo "  make lint-fix         - Auto-fix ESLint issues"
	@echo "  make help             - Show this help message"
