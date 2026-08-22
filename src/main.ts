import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix("api", { exclude: ["graphql"] });

  const port = process.env.PORT ?? 8000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`VigilEye AI backend listening on :${port}  (GraphQL at /graphql, REST at /api)`);
}
bootstrap();
