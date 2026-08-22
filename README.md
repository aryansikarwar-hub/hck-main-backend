# VigilEye AI Backend (NestJS)

The API layer between the Next.js dashboard (`../hck-main-frontend`) and the ML inference service (`../hck-main-ml-model`).

- **GraphQL** at `/graphql` — structures (query + create/update/delete), detections, alerts, users, ML status.
- **REST** at `/api/ingest/:structureId` — accepts an uploaded image, stores it, calls the ML service's `/predict` once, persists the resulting detections, and raises alerts for high/critical severity.
- **REST** at `/api/auth/{signup,login,refresh,me}` — issues the JWT the website and (later) mobile app both use.
- **REST** at `/health` — public uptime probe reporting database reachability.

## Structure

```
src/
├── main.ts, app.module.ts
├── structures/     Structure entity, resolver, CRUD service (map pins, list/detail)
├── detections/     Detection entity + resolver (crack instances, nested under a structure)
├── alerts/         Alert entity + resolver (severity-triggered alert inbox)
├── auth/           JWT strategy, roles guard/decorator, signup/login/refresh
├── users/          User entity, admin user-management resolver, first-admin bootstrap
├── ml/             HTTP client for the inference API, the /ingest endpoint, mlStatus query
├── storage/        Cloudinary upload + magic-byte validation
├── database/       Opt-in demo seed
└── common/         Shared GraphQL enums, pagination, throttler, exception filter
```

Data is persisted in **PostgreSQL via TypeORM** (`TypeOrmModule.forRoot` in `app.module.ts`). Every entity is TypeORM-annotated; `DB_SYNC=true` auto-creates tables from them on boot.

## Run

```bash
cp .env.example .env      # then fill in DATABASE_URL, JWT_SECRET, CORS_ORIGINS
npm install
npm run start:dev
```

`/api/ingest` needs `../hck-main-ml-model/service` running at `ML_SERVICE_URL` **with model weights loaded** — without weights the inference service answers 503 and every upload fails. See that repo's `ACCURACY.md`.

## Roles

Signup always creates an `inspector` and ignores any role in the request body, so nobody can self-promote.

| Role | Can |
|---|---|
| `public-read` | Read structures, detections, alerts |
| `inspector` | Above, plus register/update structures, upload inspection media, acknowledge alerts |
| `engineer` | Same as inspector today; kept as a distinct role for future engineering-only surfaces |
| `admin` | Everything, plus delete structures and manage user roles |

Registering a structure is deliberately open to any signed-in account. It was engineer/admin only, which in practice meant nobody: signup always issues `inspector`, and promoting anyone requires an admin that only exists if `BOOTSTRAP_ADMIN_*` was set — so every user got "Forbidden resource" and the map stayed permanently empty.

**The first admin comes from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.** There is no other path. You now only need it to manage roles or delete structures, not for day-to-day use. Set both vars, boot once, sign in, then remove the vars.

## Rate limiting

Auth endpoints are throttled per client IP. The browser never calls this API directly — the Next.js app proxies server-side — so the frontend forwards the real client address in `x-vigileye-client-ip` and `GqlThrottlerGuard` keys on it. Without that forwarding every user shares the proxy's egress IP and one person's attempts exhaust everyone's quota.
