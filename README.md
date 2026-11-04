# Dentex

React, Express 5, Prisma and PostgreSQL. Clinic and platform administration, employee accounts, role permissions, and patient registration with a basic patient file are implemented. Clinic-scoped patient search, pagination, live search, and Radix UI primitives are implemented. Session identity and patient list/file reads use TanStack Query with session-isolated memory caches, visible/online polling, and stale-data notices. Patient registration uses a mutation with server confirmation, local draft protection, and manual server review after an uncertain response. Patient editing and archiving remain pending.

## Development

Use Node.js 22.13+, 24, or 26+ (see `engines` in `package.json`). Prisma 7 reads the CLI datasource from `prisma.config.ts`; the generated TypeScript client lives in ignored `generated/prisma/`.

1. Read `docs/development-database.md` before operating on the existing local database. Never reset it. Keep development and production databases separate.
2. Install dependencies with `npm ci`, then run `npm run db:generate`. For a new local setup, copy `.env.example` to an untracked `.env`, supply a local `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, and `APP_ORIGIN` matching the browser origin exactly (`http://127.0.0.1:5151` for the current local setup). Preserve the existing `.env` and accounts when resuming. Do not commit secrets.
3. For a new empty database, run `npm run db:deploy`. The existing local development database already has a migration history; follow `docs/development-database.md` and do not repeat its baseline. For a legacy bootstrap database without migration history, compare its schema and constraints against the migration files before marking any migration applied; see the documented legacy test-database procedure. Do not apply the baseline twice or use reset.
4. Run `npm run dev` and open the configured frontend origin. Secure cookies require HTTPS outside the browser's trusted localhost context. Production requires HTTPS, a reverse proxy, and the same exact origin configured on the API.

`npm run admin` creates or updates a platform administrator from process environment variables `PLATFORM_ADMIN_USERNAME`, `PLATFORM_ADMIN_EMAIL`, and `PLATFORM_ADMIN_PASSWORD`. Updating a password invalidates previous tokens. The script never prints those values. Do not run it against an existing account unless intentionally updating that account.


## Production build

For staging on Dokploy, use [the manual deployment guide](docs/staging-dokploy.md), `Dockerfile`, and `compose.staging.yaml`. The confirmed domain is `dentex.itlabservice.com`. CI only verifies the commit; deployment is manual from Dokploy with Auto Deploy disabled. The Compose setup keeps its own PostgreSQL volume and runs migrations before the application.

For deployment without Docker, build on the same OS and architecture as the server: run `npm ci`, `npm run db:generate`, then `npm run build`. Deploy `dist/`, `dist-server/`, `package.json`, `package-lock.json`, `prisma/`, and `prisma.config.ts`. In the deployment directory run `npm ci --omit=dev --omit=optional`. The generated Prisma client is bundled into the server and administration script during the build; it is not copied from `node_modules`. Set production environment variables, run the reviewed migrations separately with the Prisma CLI in the build/deployment environment, set `NODE_ENV=production`, and run `npm start`. The server defaults to `127.0.0.1` and serves the built frontend; Docker explicitly sets `HOST=0.0.0.0` inside its container. Terminate HTTPS at a reverse proxy. To provision a platform administrator use `npm run admin:production` with the documented environment variables; do not provide them on a command line or print them.

`TRUST_PROXY` is optional and defaults to no trusted proxy. When using a reverse proxy, set it to a comma-separated list of its specific IP addresses or CIDR ranges (for example `127.0.0.1,::1` for a local proxy). The proxy must overwrite incoming `X-Forwarded-For` rather than pass client-supplied values, and network controls must prevent untrusted clients from reaching the server through a trusted proxy address. Do not use `true`, a hop count, a wildcard network, or an untrusted network. With the trusted peer configured, login rate limiting keys requests by the client address.

Prisma 7 uses a PostgreSQL driver adapter and `prisma.config.ts` for CLI connection configuration. Generate the client before building or testing after a clean install. Dependency audit results are dated evidence in `.scratch/architecture/handoff.md`; run `npm audit` and `npm audit --omit=dev` for current results.

## Tests

Without `TEST_DATABASE_URL`, `npm test` skips database integration tests. For the full suite, use an isolated local database named `dentex_test`, initialized with all Prisma migrations. Follow [the test database setup](docs/development-database.md#قاعدة-الاختبار) for new databases and existing bootstrap databases; `database/bootstrap.sql` alone is not the current schema.

`node scripts/migrate-test.mjs <path-to-local-env>` derives the local connection and applies migrations only to `dentex_test`. Then `node scripts/test-local.mjs <path-to-local-env>` runs the full suite against it. Both default to `.env` and refuse remote hosts. Tests create and remove their own fictional fixtures and do not touch `dentex_dev`.

Run `npm run check:architecture` to check server boundaries with ESLint and dependency-cruiser. Completion requires this check, `npm run build`, and the full database-backed test run; a passing run with integration tests skipped is insufficient. The architectural rules are in [docs/architecture.md](docs/architecture.md).

The workflow definition in `.github/workflows/ci.yml` runs those checks on pull requests, pushes to `main`, and manual dispatch. It reuses npm download cache, cancels superseded runs, and runs architecture checks alongside the build before executing the full suite. It initializes a fresh PostgreSQL `dentex_test` with migrations and rejects failed, skipped, or todo tests. It does not deploy or build container images. Check the pull request's GitHub Checks for the actual run result; the workflow does not enable branch protection.

## Local preview and repository handoff

Run `npm run dev`, then open [the local app](http://127.0.0.1:5151/). Vite requires port5151 and forwards `/api` to the API port from `.env` (`PORT=5152` in the current local setup). Before reusing a listener, verify its process belongs to this checkout: another Dentex checkout may occupy5173/3000. Follow [the local runtime verification procedure](docs/development-database.md#التحقق-من-نسخة-التطبيق). Keep the processes running and preserve the existing database and accounts.

On Windows, run `npm run check:dev` for a read-only runtime check, or add `-- --json` for structured results. It checks process ownership, configuration, the development database/volume, HTTP, and origin acceptance. `--config-only` validates configuration on any supported Node platform and never declares the runtime ready. Neither mode verifies an account password or the user's browser access.

The repository is [aymanobeid0/dentex](https://github.com/aymanobeid0/dentex). PRs #1–#6 are merged. [PR #5](https://github.com/aymanobeid0/dentex/pull/5) reorganized the frontend; [PR #6](https://github.com/aymanobeid0/dentex/pull/6) added registration draft protection and isolated local ports. PR #6 passed CI with167 tests, the build, and both architecture checks. A merge does not establish deployment. The current checkout remains on `feat/patients-and-manual-staging`.

Start from [the current session handoff](dentex-session-handoff-2026-11-03-updated.md) and [the migration tracker](.scratch/frontend-state-migration/map.md). Migration tickets01–03 are complete;04–09 have not started. The separate patient feature tickets03–04 (editing/archiving) remain unimplemented. Session lessons and the earlier documentation inventory are in [the project retrospective](.scratch/project-docs/retro-2026-11-04.md). Staging deployment remains manual under [the deployment guide](docs/staging-dokploy.md).
