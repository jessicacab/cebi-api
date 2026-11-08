# Cebi API

Backend for Cebi. Two clients use it:

- **Mobile app** (`cebi-app`): creators and local businesses.
- **Admin CRM** (Next.js): the Cebi team.

Accounts live in **Supabase Auth**, but the clients never call Supabase: they sign in through `/v1/auth/*` here and send the returned access token as `Authorization: Bearer <token>`. All data goes through this API.

**Stack:** NestJS 12 · Prisma 7 · Supabase (Postgres + Auth) · Swagger · Vitest · Node 24

## Run it locally

```bash
nvm use                      # Node 24 (see .nvmrc)
npm install                  # also generates the Prisma client
cp .env.example .env         # then fill in the YOUR_… values (see below)
npm run db:migrate           # create/update tables in Supabase
npm run start:dev            # http://localhost:4000
```

- API docs: http://localhost:4000/docs (raw spec: `/docs/json`)
- Health check: http://localhost:4000/health

## Supabase setup (one time)

1. **Fill in `.env`:** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `DATABASE_URL`. The comments in `.env.example` say where to find each value.
2. **Create a `prisma` database user.** Supabase recommends one; see their Prisma guide (Database → Prisma) for the SQL.
3. **Use asymmetric JWT signing keys** (Project Settings → JWT Keys). New projects have them by default. The API checks tokens with the project's public keys, so no secret is stored here.
4. **Run `npm run db:migrate`** to create the tables.
5. **Send 6-digit codes, not links.** The app types codes in; it never opens email links. In Authentication, Emails, Templates, put `{{ .Token }}` in "Confirm signup", "Magic Link" and "Reset Password". Keep "Confirm email" on (Authentication, Sign In / Providers, Email).
6. **Mobile numbers need an SMS provider** (Authentication, Sign In / Providers, Phone; for example Twilio). Without it, sign-up and login with a mobile number fail with `SMS_FAILED` or `SIGNUP_DISABLED`; email still works.
7. **Raise the Auth rate limits** (Authentication, Rate Limits) before launch. Every sign-in call reaches Supabase from this API's server, so Supabase's per-IP limits apply to all users together. This API limits each phone's IP itself (set `TRUST_PROXY` when hosted behind a load balancer).
8. **Make the first admin.** Sign in once from the app so your user record exists, then run `npm run db:studio` and set `role` to `ADMIN`. After that, admins can change roles through the API.

## Tests

Tests never touch Supabase. They read `.env.test`, which points at a **local** Postgres database (`cebi_test`), and they fake the sign-in step. If you don't have Postgres installed, run `docker compose up -d` and change the URL in `.env.test` to `postgresql://cebi:cebi@localhost:5433/cebi`. `npm run test:e2e` applies migrations to the test database first.

## How it works

```
request → AuthGuard → RolesGuard → ValidationPipe → controller → service → Prisma
            │            │
            │            └ @Roles('ADMIN') routes only
            └ verifies the Supabase token, loads the user (creates it on first call),
              blocks suspended users. @Public() skips it.
```

**Every success response:** `{ "data": … }`. Paginated lists add `"meta": { total, page, pageSize, totalPages }`.

**Every error response:**
```json
{ "error": { "statusCode": 400, "code": "VALIDATION_ERROR", "message": "Some fields are invalid", "details": ["name must be a string"] } }
```
Clients should switch on `code`, not on `message`.

**Versioning:** routes live under `/v1/...`. Released app versions can't be forced to update, so a breaking change goes into `/v2` and `/v1` keeps working. `/health` is not versioned.

**Route naming:** routes for the mobile app use plain names (`/v1/users/me`). Routes for the admin CRM go under `/v1/admin/...` and carry `@Roles('ADMIN')`.

## Endpoints so far

| Method | Path | Who |
| --- | --- | --- |
| GET | `/health` | anyone |
| POST | `/v1/auth/signup` | anyone. `{ contact, password, name? }` (contact = email or mobile number), sends a 6-digit code |
| POST | `/v1/auth/signup/resend` | anyone. `{ contact }` |
| POST | `/v1/auth/verify` | anyone. `{ contact, code }` for sign-up and one-time login codes, returns tokens and user |
| POST | `/v1/auth/login` | anyone. `{ contact, password }` |
| POST | `/v1/auth/login/code` | anyone. `{ contact }`, sends a one-time login code |
| POST | `/v1/auth/refresh` | anyone. `{ refreshToken }` |
| POST | `/v1/auth/logout` | signed in |
| POST | `/v1/auth/password/forgot` | anyone. `{ contact }`, sends a reset code |
| POST | `/v1/auth/password/reset` | anyone. `{ contact, code, password }`, signs in |
| GET | `/v1/onboarding/options` | anyone. Roles, platforms, niches and categories for the sign-up steps |
| GET | `/v1/onboarding/handles/:handle` | signed in. `{ available }` |
| POST | `/v1/onboarding` | signed in. Finishes sign-up: role, name and creator or business profile |
| GET | `/v1/users/me` | signed in. Includes `creatorProfile` / `businessProfile`; `onboardedAt: null` means sign-up is unfinished |
| PATCH | `/v1/users/me` | signed in. Sets name and avatar |
| GET | `/v1/admin/users` | admin. Filters: `role`, `status`, `search`, `page`, `pageSize` |
| GET | `/v1/admin/users/:id` | admin |
| PATCH | `/v1/admin/users/:id` | admin. Changes `role` and `status` (suspend) |

## Folder layout

```
prisma/
  schema.prisma        database tables
  migrations/          generated by `npm run db:migrate`, commit these
src/
  main.ts              starts the server
  app.setup.ts         helmet, CORS, versioning, Swagger (shared with tests)
  app.module.ts        wires modules, validation, response/error format
  config/env.ts        .env rules; the app won't start if something's missing
  prisma/              database connection
  auth/                token check + role check (global guards)
  common/              decorators (@Public, @Roles, @CurrentUser), filters, pagination, apiError, contact parsing
  modules/<feature>/   one folder per feature: module, controller, service, dto/
  integrations/        one adapter per outside service (supabase/: Supabase Auth calls)
  generated/prisma/    Prisma client (generated, not committed)
test/                  end-to-end tests (local test DB, faked sign-in and fake Supabase Auth)
```

## Adding a feature

1. Add the tables to `prisma/schema.prisma`, then run `npm run db:migrate -- --name <what-changed>`.
2. Create `src/modules/<feature>/` with a module, controller, service and `dto/`.
3. Register the module in `app.module.ts`.
4. Put rules in the service, not the controller, so mobile and admin routes share them.
5. Add e2e tests in `test/`.

**Integrations** (payments, social platforms, video, push) will live in `src/integrations/<provider>/`, one adapter per provider, so features never call a provider's SDK directly. Webhook routes are `@Public()` and verify the provider's signature instead. The background-job queue (BullMQ + Redis) arrives with the first integration that needs it.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run start:dev` | dev server, restarts on change |
| `npm run build` / `start:prod` | build to `dist/` and run it |
| `npm test` | unit tests |
| `npm run test:e2e` | end-to-end tests (local test database) |
| `npm run db:test:setup` | apply migrations to the test database |
| `npm run typecheck` / `lint` | TypeScript and oxlint |
| `npm run db:migrate` | create and apply a migration (development) |
| `npm run db:deploy` | apply migrations (production) |
| `npm run db:studio` | browse the database |
