.PHONY: test
test:
	pnpm test -- --no-watch --passWithNoTests --watchAll=false
