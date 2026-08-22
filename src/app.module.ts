import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { TypeOrmModule } from "@nestjs/typeorm";
import { join } from "path";

import { StructuresModule } from "./structures/structures.module";
import { DetectionsModule } from "./detections/detections.module";
import { AlertsModule } from "./alerts/alerts.module";
import { AuthModule } from "./auth/auth.module";
import { MlModule } from "./ml/ml.module";
import { SeedModule } from "./database/seed.module";
import { Structure } from "./structures/structure.entity";
import { Detection } from "./detections/detection.entity";
import { Alert } from "./alerts/alert.entity";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Connects to Postgres using DATABASE_URL from backend/.env.
    // synchronize:true auto-creates the structures/detections/alerts tables
    // on first boot — fine for local/hackathon dev, swap for migrations later.
    // DATABASE_SSL=true in .env switches SSL on for hosted Postgres (e.g. Neon).
    TypeOrmModule.forRoot({
      type: "postgres",
      url: process.env.DATABASE_URL,
      entities: [Structure, Detection, Alert],
      synchronize: true,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), "src/schema.gql"),
      sortSchema: true,
      playground: true,
    }),
    AuthModule,
    StructuresModule,
    DetectionsModule,
    AlertsModule,
    MlModule,
    SeedModule,
  ],
})
export class AppModule {}
