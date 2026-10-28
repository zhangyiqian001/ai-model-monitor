import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import express from 'express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });

  // —— 本地独立版通用中间件（替代平台 configureApp）——
  app.use(
    express.json({ limit: process.env.BODY_SIZE_LIMIT || '1mb' }),
  );
  app.use(
    express.urlencoded({
      limit: process.env.BODY_SIZE_LIMIT || '1mb',
      extended: true,
    }),
  );
  app.use(cookieParser());

  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || 'localhost';
  const port = Number(process.env.SERVER_PORT || '3000');

  // 生产模式静态资源（vite build 产物 dist/client，index.html 引用 /assets/* 等根路径资源）
  const clientRoot = join(process.cwd(), 'dist', 'client');
  app.use(express.static(clientRoot));

  // 注册视图引擎, 渲染 client 产物目录下的 html 文件（产物 html 位于 dist/client/client/）
  const viewsDir = join(clientRoot, 'client');
  app.setBaseViewsDir(viewsDir);
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
