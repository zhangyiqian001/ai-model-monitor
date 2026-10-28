/**
 * 本地独立版基础设施模块
 *
 * 替代原平台 PlatformModule.forRoot()，只提供本应用真正需要的最小设施：
 * - ConfigModule：读取 .env.local / .env
 * - DRIZZLE_DATABASE：本地 SQLite 数据库
 * - LocalUserContextMiddleware：为每个请求注入固定本地用户上下文
 */
import { Module, MiddlewareConsumer, NestModule, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DRIZZLE_DATABASE, createLocalDatabase } from './db';
import { LocalUserContextMiddleware } from './auth';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [
    {
      provide: DRIZZLE_DATABASE,
      useFactory: createLocalDatabase,
    },
  ],
  exports: [DRIZZLE_DATABASE, ConfigModule],
})
export class LocalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LocalUserContextMiddleware).forRoutes('*');
  }
}
