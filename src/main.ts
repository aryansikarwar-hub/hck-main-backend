import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";

/**
 * Parses CORS_ORIGINS ("https://a.com,https://b.com").
 *
 * Previously this was `origin: true`, which reflects ANY origin and, combined
 * with credentials, lets any website on the internet call this API with a
 * logged-in user's browser. In production an explicit allowlist is required;
 * we refuse to boot without one rather than falling back to permissive.
 */
function resolveCorsOrigins(): string[] | boolean {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw) return raw.split(",").map((o) => o.trim()).filter(Boolean);

  if (process.env.NODE_ENV === "production") {
    throw new Error("CORS_ORIGINS must be set in production. Refusing to start with a permissive CORS policy.");
  }
  return ["http://localhost:3000"];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      // Apollo's playground needs to load its own assets in dev.
      contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
      crossOriginEmbedderPolicy: false,
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    })
  );

  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject unknown properties outright rather than silently stripping,
      // so a client sending e.g. { role: "admin" } gets a 400, not a surprise.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    })
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix("api", { exclude: ["graphql", "health"] });

  const port = process.env.PORT ?? 8000;
  await app.listen(port);
  Logger.log(
    `VigilEye AI backend listening on :${port} (GraphQL /graphql, REST /api, health /health)`,
    "Bootstrap"
  );
}

bootstrap();
