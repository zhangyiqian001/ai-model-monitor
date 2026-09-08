import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { UsageModule } from './modules/usage/usage.module';
import { ModelsModule } from './modules/models/models.module';

@Module({
  imports: [
    PlatformModule.forRoot(),
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
