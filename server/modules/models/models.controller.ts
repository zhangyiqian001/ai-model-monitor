import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { ModelsService } from './models.service';
import type {
  ModelListResponse,
} from '@shared/api.interface';

interface ListPlatformModelsBody {
  accessKey?: string;
  secretKey?: string;
}

@Controller('api/models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  /**
   * OpenRouter 全量模型列表（公开接口，自带缓存）
   */
  @NeedLogin()
  @Get('openrouter')
  async getOpenRouterModels(): Promise<ModelListResponse> {
    return this.modelsService.getOpenRouterModels();
  }

  /**
   * 指定平台模型列表
   * - 火山方舟：body 可选传 accessKey / secretKey
   * - 其他平台：从用户配置读取 API Key
   */
  @NeedLogin()
  @Post('platforms/:platformKey/list')
  async listPlatformModels(
    @Req() req: Request,
    @Param('platformKey') platformKey: string,
    @Body() body: ListPlatformModelsBody = {},
  ): Promise<ModelListResponse> {
    const { userId } = req.userContext;
    return this.modelsService.getPlatformModels(userId, platformKey, {
      accessKey: body.accessKey,
      secretKey: body.secretKey,
    });
  }
}
