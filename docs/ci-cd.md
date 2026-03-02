# CI/CD

## GitHub Actions Pipeline

The repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on every push and pull request:

```
Install → Build → Lint → Test → (Publish)
```

### Pipeline Stages

1. **Install** — `pnpm install` with dependency caching
2. **Build** — `pnpm build` (all packages via Turborepo)
3. **Lint** — `pnpm lint` (ESLint across all packages)
4. **Test** — `pnpm test` (Vitest, 289 tests)
5. **Publish** *(tagged releases only)* — Publishes `@web2bridge/core`, `@web2bridge/react`, and `@web2bridge/auth-clerk` to npm

### Configuration Required

To enable npm publishing on tagged releases, add the following repository secret:

| Secret | Description |
|---|---|
| `NPM_TOKEN` | npm access token with publish permissions for the `@web2bridge` scope |

### Publishing a Release

1. Bump versions in each package's `package.json`
2. Commit and tag: `git tag v0.1.0 && git push --tags`
3. The CI pipeline will build, test, and publish all public packages to npm

### Website Deployment

The `website/` directory contains a static HTML/CSS site. The CI workflow deploys it to GitHub Pages on pushes to `main`:

1. Go to **Settings → Pages → Source** and select **GitHub Actions**
2. The workflow handles the rest — no additional configuration needed
