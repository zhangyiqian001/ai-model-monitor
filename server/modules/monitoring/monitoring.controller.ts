import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { MonitoringService } from './monitoring.service';
import type {
  DashboardStats,
  BatchHealthCheckResponse,
  HealthCheckResponse,
  HealthRecordListResponse,
  CheckWithModelRequest,
} from '@shared/api.interface';

@Controller('api/monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @NeedLogin()
  @Get('dashboard')
  async getDashboard(@Req() req: Request): Promise<DashboardStats> {
    const { userId } = req.userContext;
    return this.monitoringService.getDashboardStats(userId);
  }

  @NeedLogin()
  @Post('check/:platformKey')
  async checkPlatform(
    @Req() req: Request,
    @Param('platformKey') platformKey: string,
  ): Promise<HealthCheckResponse> {
    const { userId } = req.userContext;
    return this.monitoringService.checkPlatform(userId, platformKey);
  }

  @NeedLogin()
  @Post('check/:platformKey/with-model')
  async checkPlatformWithModel(
    @Req() req: Request,
    @Param('platformKey') platformKey: string,
    @Body() body: CheckWithModelRequest,
  ): Promise<HealthCheckResponse> {
    const { userId } = req.userContext;
    return this.monitoringService.checkPlatform(
      userId,
      platformKey,
      body.modelId,
    );
  }

  @NeedLogin()
  @Post('check-all')
  async checkAll(@Req() req: Request): Promise<BatchHealthCheckResponse> {
    const { userId } = req.userContext;
    return this.monitoringService.checkAllEnabled(userId);
  }

  @NeedLogin()
  @Get('records/:platformKey')
  async getRecords(
    @Req() req: Request,
    @Param('platformKey') platformKey: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<HealthRecordListResponse> {
    const { userId } = req.userContext;
    const pageNum = page ? parseInt(page, 10) : 1;
    const sizeNum = pageSize ? parseInt(pageSize, 10) : 20;
    return this.monitoringService.getRecords(
      platformKey,
      userId,
      pageNum,
      sizeNum,
    );
  }
}
