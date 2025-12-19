import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: origins.length ? origins : true,
    allowedHeaders: ['Content-Type', 'x-admin-key', 'Authorization'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
