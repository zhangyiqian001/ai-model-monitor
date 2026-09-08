import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { UsageService } from './usage.service';
import type {
  UsageQueryResponse,
  UsageRecordListResponse,
} from '@shared/api.interface';

@Controller('api/usage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @NeedLogin()
  @Post('query/:platformKey')
  async queryUsage(
    @Req() req: Request,
    @Param('platformKey') platformKey: string,
  ): Promise<UsageQueryResponse> {
    const { userId } = req.userContext;
    return this.usageService.queryUsage(userId, platformKey);
  }

  @NeedLogin()
  @Get('records/:platformKey')
  async getRecords(
    @Req() req: Request,
    @Param('platformKey') platformKey: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<UsageRecordListResponse> {
    const { userId } = req.userContext;
    const pageNum = page ? parseInt(page, 10) : 1;
    const sizeNum = pageSize ? parseInt(pageSize, 10) : 20;
    return this.usageService.getHistory(
      platformKey,
      userId,
      pageNum,
      sizeNum,
    );
  }

  @NeedLogin()
  @Post('export')
  async exportReport(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { userId } = req.userContext;
    const { csvContent, filename } = await this.usageService.exportReport(userId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(csvContent);
  }
}
