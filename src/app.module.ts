import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { TypeOrmModule } from "@nestjs/typeorm";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { join } from "path";
import { env, envBool, isProduction } from "./config/env";

import { StructuresModule } from "./structures/structures.module";
import { DetectionsModule } from "./detections/detections.module";
import { AlertsModule } from "./alerts/alerts.module";
import { AuthModule } from "./auth/auth.module";
import { MlModule } from "./ml/ml.module";
import { UsersModule } from "./users/users.module";
import { SeedModule } from "./database/seed.module";
import { HealthModule } from "./health/health.module";
import { Structure } from "./structures/structure.entity";
import { Detection } from "./detections/detection.entity";
import { Alert } from "./alerts/alert.entity";
import { User } from "./users/user.entity";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { GqlThrottlerGuard } from "./common/gql-throttler.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: "postgres",
      url: env("DATABASE_URL"),
      entities: [Structure, Detection, Alert, User],
      // synchronize auto-creates tables, which is convenient in dev but will
      // happily drop columns on a schema change. Never enable it in prod —
      // DB_SYNC must stay unset/false there and migrations used instead.
      synchronize: envBool("DB_SYNC", !isProduction()),
      ssl: envBool("DATABASE_SSL", (env("DATABASE_URL") ?? "").includes("sslmode=require"))
        ? { rejectUnauthorized: false }
        : false,
    }),
    // Baseline rate limit for every endpoint; auth routes tighten this further
    // with their own @Throttle decorators.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 100 }]),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), "src/schema.gql"),
      sortSchema: true,
      // Playground/introspection expose the full schema — dev only.
      playground: !isProduction(),
      introspection: !isProduction(),
      context: ({ req }: { req: unknown }) => ({ req }),
    }),
    AuthModule,
    UsersModule,
    StructuresModule,
    DetectionsModule,
    AlertsModule,
    MlModule,
    SeedModule,
    HealthModule,
  ],
  providers: [
    // Order matters: authenticate, then authorize, then rate-limit.
    // Registering these globally makes "locked down" the default for every
    // endpoint — opting out requires an explicit @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
  ],
})
export class AppModule {}
