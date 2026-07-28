import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  // Bind a real ephemeral port up front. Left unlistened, supertest binds
  // and tears down a port per call on the shared http.Server, which races
  // under true concurrency (exactly what the pooling test needs) and shows
  // up as spurious ECONNRESET.
  await app.listen(0);
  return app;
}
