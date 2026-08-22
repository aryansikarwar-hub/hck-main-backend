# VigilEye AI Backend (NestJS)

The API layer between the website (`../website`) and the ML model (`../ml-model`).

- **GraphQL** at `/graphql` — structures, detections, alerts (queried by the Next.js dashboard via `graphql-request` + TanStack Query).
- **REST** at `/api/ingest/:structureId` — accepts an uploaded image, calls the ML model's `/predict` endpoint once, persists the resulting detections, and raises alerts for high/critical severity.
- **REST** at `/api/auth/login` — issues the JWT the website and (later) mobile app both use.

## Structure

```
src/
├── main.ts, app.module.ts
├── structures/     Structure entity + GraphQL resolver (map pins, structure list/detail)
├── detections/      Detection entity + resolver (crack instances, nested under a structure)
├── alerts/           Alert entity + resolver (severity-triggered alert inbox)
├── auth/             JWT strategy, roles guard/decorator, login endpoint
├── ml/                HTTP client for the ML inference API + the /ingest upload endpoint
└── common/           Shared GraphQL enums (Severity, StructureType, CaptureSource)
```

Data currently lives in in-memory seed arrays per service (matching `website/src/lib/mock-data.ts` 1:1). Swap in `TypeOrmModule.forRoot(...)` in `app.module.ts` against Postgres+PostGIS to persist for real — every entity is already TypeORM-annotated.

## Run

```bash
cp .env.example .env
npm install
npm run start:dev
```

Requires `../ml-model/service` running on `ML_SERVICE_URL` (default `http://localhost:9000`) for `/api/ingest` to return real predictions.
