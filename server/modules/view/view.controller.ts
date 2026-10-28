import { Controller, Get, Render, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

@Controller()
export class ViewController {

  @Get(['/', '*'])
  @Render('index')
  async render(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ __platform__: string }>  {
    // HTML 不缓存：前端资源带 hash 由 express.static 长缓存，
    // 但 index.html 必须每次取最新，否则浏览器会用旧 HTML 引用旧 JS
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // you can add custom render params here
    const platformData = req.__platform_data__ ?? {};
    return {
      // don't delete this line, it's used by client to get platform info
      __platform__: JSON.stringify(platformData),
    };
  }
}
