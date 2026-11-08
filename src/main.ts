import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.js';

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port);
};
await bootstrap();
