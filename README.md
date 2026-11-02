# Dentex

React, Express 5, Prisma and PostgreSQL. The first phase provides clinic and platform administration, employee accounts, and role permissions.

## Development

1. Read `docs/development-database.md` before operating on the existing local database. Never reset it. Keep development and production databases separate.
2. Install dependencies with `npm ci`, then run `npm run db:generate`. Copy `.env.example` to an untracked `.env`, supply a local `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, and `APP_ORIGIN` matching the browser origin exactly (for example `http://127.0.0.1:5173`). Do not commit secrets.
3. For a new empty database, run `npm run db:deploy`. For the existing bootstrap database only, compare its schema to `prisma/schema.prisma`, then record the existing baseline with `npx prisma migrate resolve --applied 20261101000000_baseline`; do not apply the baseline twice or use reset. The baseline retains the SQL check and foreign-key constraints.
4. Run `npm run dev` and open the configured frontend origin. Secure cookies require HTTPS outside the browser's trusted localhost context. Production requires HTTPS, a reverse proxy, and the same exact origin configured on the API.

`npm run admin` creates or updates a platform administrator from process environment variables `PLATFORM_ADMIN_USERNAME`, `PLATFORM_ADMIN_EMAIL`, and `PLATFORM_ADMIN_PASSWORD`. Updating a password invalidates previous tokens. The script never prints those values. Do not run it against an existing account unless intentionally updating that account.


## Production build

Build on the same OS and architecture as the server: run `npm ci`, `npm run db:generate`, then `npm run build`. Deploy `dist/`, `dist-server/`, `package.json`, `package-lock.json`, `prisma/`, and the generated `node_modules/.prisma/` directory. In the deployment directory run `npm ci --omit=dev --omit=optional`, then copy the generated `.prisma` directory from the build stage into `node_modules/.prisma/`. Set production environment variables, run the reviewed migrations separately with the Prisma CLI in the build/deployment environment, set `NODE_ENV=production`, and run `npm start`. The server binds `127.0.0.1` and serves the built frontend; terminate HTTPS at a reverse proxy on the same host. To provision a platform administrator use `npm run admin:production` with the documented environment variables; do not provide them on a command line or print them.

`TRUST_PROXY` is optional and defaults to no trusted proxy. When using a reverse proxy, set it to a comma-separated list of its specific IP addresses or CIDR ranges (for example `127.0.0.1,::1` for a local proxy). The proxy must overwrite incoming `X-Forwarded-For` rather than pass client-supplied values, and network controls must prevent untrusted clients from reaching the server through a trusted proxy address. Do not use `true`, a hop count, a wildcard network, or an untrusted network. With the trusted peer configured, login rate limiting keys requests by the client address.

The Prisma CLI 6.19 development dependency pins vulnerable `deepmerge-ts` 7.1.5 and `effect` 3.18.4; Vitest 3's development dependencies include vulnerable `tinypool` and `@vitest/mocker`. npm's proposed fixes require major upgrades. The tested production install omits optional dependencies as well as development tools, excludes the Prisma CLI, and reported zero audit findings; development and build environments should remain restricted to trusted code pending compatible upgrades.

## Tests

`npm test` runs the anonymous access test; database integration tests require an explicitly configured `TEST_DATABASE_URL` pointing to an isolated database named `dentex_test`. Create and initialize that database separately with `database/bootstrap.sql`. `node scripts/test-local.mjs <path-to-local-env>` derives only the local host credentials and changes the database name to `dentex_test`; it refuses remote hosts. Tests create and remove their own fictional fixtures and do not touch `dentex_dev`.
