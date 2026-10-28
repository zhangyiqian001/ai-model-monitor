import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '../../local/auth';
import {
  ModelsService,
  mergeFreeOverrides,
  readFreeOverrides,
  writeFreeOverride,
} from './models.service';
import type {
  ModelListResponse,
} from '@shared/api.interface';

interface ListPlatformModelsBody {
  accessKey?: string;
  secretKey?: string;
}

interface FreeOverrideBody {
  modelId: string;
  /** true=标记免费，false=强制付费，null/缺省=恢复自动判定 */
  isFree?: boolean | null;
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
    const res = await this.modelsService.getPlatformModels(userId, platformKey, {
      accessKey: body.accessKey,
      secretKey: body.secretKey,
    });
    res.items = mergeFreeOverrides(res.items, platformKey);
    return res;
  }

  /**
   * 当前平台的手动免费标记：{ modelId: boolean }
   */
  @NeedLogin()
  @Get('platforms/:platformKey/free-overrides')
  async getFreeOverrides(
    @Param('platformKey') platformKey: string,
  ): Promise<Record<string, boolean>> {
    const all = readFreeOverrides();
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(platformKey + '::')) {
        out[key.slice(platformKey.length + 2)] = value;
      }
    }
    return out;
  }

  /**
   * 手动标记/取消模型免费
   */
  @NeedLogin()
  @Put('platforms/:platformKey/free-override')
  async setFreeOverride(
    @Param('platformKey') platformKey: string,
    @Body() body: FreeOverrideBody,
  ): Promise<{ ok: boolean }> {
    if (!body || typeof body.modelId !== 'string' || !body.modelId) {
      throw Object.assign(new Error('modelId 必填'), { status: 400 });
    }
    writeFreeOverride(
      platformKey,
      body.modelId,
      body.isFree === true ? true : body.isFree === false ? false : null,
    );
    return { ok: true };
  }
}
