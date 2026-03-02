.PHONY: code-coverage-report tests install build demo

code-coverage-report:
	@echo "Clearing previous code coverage report..."
	@rm -rf code-coverage-report
	@echo "Running tests with coverage for all packages..."
	@cd packages/core && pnpm vitest run --coverage --coverage.reporter=json --coverage.reporter=html
	@cd packages/react && pnpm vitest run --coverage --coverage.reporter=json --coverage.reporter=html
	@cd packages/auth-clerk && pnpm vitest run --coverage --coverage.reporter=json --coverage.reporter=html
	@echo "Creating code-coverage-report directory..."
	@mkdir -p code-coverage-report
	@echo "Copying JSON coverage files..."
	@cp packages/core/coverage/coverage-final.json code-coverage-report/core-coverage.json
	@cp packages/react/coverage/coverage-final.json code-coverage-report/react-coverage.json
	@cp packages/auth-clerk/coverage/coverage-final.json code-coverage-report/auth-clerk-coverage.json
	@echo "Copying HTML reports..."
	@cp -r packages/core/coverage code-coverage-report/core-html
	@cp -r packages/react/coverage code-coverage-report/react-html
	@cp -r packages/auth-clerk/coverage code-coverage-report/auth-clerk-html
	@echo "Generating unified HTML report..."
	@node scripts/generate-report.js
	@echo ""
	@echo "✅ Code coverage report generated successfully!"
	@echo "   Open code-coverage-report/index.html to view the unified report"
	@echo ""
	@echo "Reports available:"
	@echo "   - code-coverage-report/index.html          (Unified HTML report)"
	@echo "   - code-coverage-report/core-html/         (Core package HTML)"
	@echo "   - code-coverage-report/react-html/        (React package HTML)"
	@echo "   - code-coverage-report/auth-clerk-html/   (Auth-clerk package HTML)"

tests:
	@echo "Running all tests..."
	@pnpm test

install:
	@echo "Installing all packages..."
	@pnpm install

build:
	@echo "Building all packages..."
	@pnpm build

demo:
	@echo "Running demo"
	$(MAKE) install
	$(MAKE) build
	@cd demo && pnpm install && pnpm dev
