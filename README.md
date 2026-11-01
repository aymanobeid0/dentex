# Dentex

React, Express 5, Prisma and PostgreSQL. The first vertical slice provides platform-administrator login and a clinic list; later slices add clinic operations.

## Development

1. Read `docs/development-database.md` before operating on the existing local database. Never reset it. Keep development and production databases separate.
2. Install dependencies with `npm ci`, then run `npm run db:generate`. Copy `.env.example` to an untracked `.env`, supply a local `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, and `APP_ORIGIN` matching the browser origin exactly (for example `http://127.0.0.1:5173`). Do not commit secrets.
3. For a new empty database, run `npm run db:deploy`. For the existing bootstrap database only, compare its schema to `prisma/schema.prisma`, then record the existing baseline with `npx prisma migrate resolve --applied 20261101000000_baseline`; do not apply the baseline twice or use reset. The baseline retains the SQL check and foreign-key constraints.
4. Run `npm run dev` and open the configured frontend origin. Secure cookies require HTTPS outside the browser's trusted localhost context. Production requires HTTPS, a reverse proxy, and the same exact origin configured on the API.

`npm run admin` creates or updates a platform administrator from process environment variables `PLATFORM_ADMIN_USERNAME`, `PLATFORM_ADMIN_EMAIL`, and `PLATFORM_ADMIN_PASSWORD`. Updating a password invalidates previous tokens. The script never prints those values. Do not run it against an existing account unless intentionally updating that account.

## Tests

`npm test` runs the anonymous access test; database integration tests require an explicitly configured `TEST_DATABASE_URL` pointing to an isolated database named `dentex_test`. Create and initialize that database separately with `database/bootstrap.sql`. `node scripts/test-local.mjs <path-to-local-env>` derives only the local host credentials and changes the database name to `dentex_test`; it refuses remote hosts. Tests create and remove their own fictional fixtures and do not touch `dentex_dev`.
