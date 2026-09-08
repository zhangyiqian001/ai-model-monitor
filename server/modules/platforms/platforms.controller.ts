import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { PlatformsService } from './platforms.service';
import type {
  PlatformListResponse,
  PlatformWithConfig,
  UpdateConfigRequest,
  UserPlatformConfig,
} from '@shared/api.interface';

@Controller('api/platforms')
export class PlatformsController {
  constructor(private readonly platformsService: PlatformsService) {}

  @NeedLogin()
  @Get()
  async listPlatforms(
    @Req() req: Request,
    @Query('region') region?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ): Promise<PlatformListResponse> {
    const { userId } = req.userContext;
    return this.platformsService.listPlatformsWithConfig(userId, {
      region,
      status,
      keyword,
    });
  }

  @NeedLogin()
  @Get(':platformKey')
  async getPlatform(
    @Req() req: Request,
    @Param('platformKey') platformKey: string,
  ): Promise<PlatformWithConfig> {
    const { userId } = req.userContext;
    return this.platformsService.getPlatformWithConfig(userId, platformKey);
  }

  @NeedLogin()
  @Patch(':platformKey/config')
  async updateConfig(
    @Req() req: Request,
    @Param('platformKey') platformKey: string,
    @Body() body: UpdateConfigRequest,
  ): Promise<UserPlatformConfig> {
    const { userId } = req.userContext;
    return this.platformsService.upsertConfig(userId, platformKey, body);
  }

  @NeedLogin()
  @Delete(':platformKey/key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteApiKey(
    @Req() req: Request,
    @Param('platformKey') platformKey: string,
  ): Promise<void> {
    const { userId } = req.userContext;
    await this.platformsService.deleteApiKey(userId, platformKey);
  }
}
