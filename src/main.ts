import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SpanishExceptionFilter } from './shared/spanish-exception.filter';
import {
  flattenValidationMessages,
  translateValidationMessages,
} from './shared/validation-messages.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new SpanishExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Every DTO in this app relies on class-validator's own decorator
      // messages, which are English by default — translated here, in the
      // one place every validation failure passes through, instead of a
      // custom `message` on every decorator in every DTO (see
      // validation-messages.util.ts for why regex-matching the rendered
      // message, not reimplementing it, is the deliberate choice).
      exceptionFactory: (errors) =>
        new BadRequestException(
          translateValidationMessages(flattenValidationMessages(errors)),
        ),
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
