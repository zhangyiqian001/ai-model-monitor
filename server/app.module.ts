import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';

import { LocalModule } from './local/local.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { UsageModule } from './modules/usage/usage.module';
import { ModelsModule } from './modules/models/models.module';

@Module({
  imports: [
    // 本地独立版：替代原平台 PlatformModule.forRoot()
    // （原版依赖平台登录/授权/平台数据库/平台内网域名，无法本机独立运行）
    LocalModule,
    // ====== @route-section: business-modules START ======
    PlatformsModule,
    MonitoringModule,
    UsageModule,
    ModelsModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
