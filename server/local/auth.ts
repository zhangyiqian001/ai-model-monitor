/**
 * 本地独立版认证
 *
 * 原平台版通过 AuthN/AuthZ 平台中间件把登录用户写入 req.userContext。
 * 本地版用固定本地用户替代（可通过环境变量 LOCAL_USER_ID 覆盖），
 * NeedLogin 装饰器保留原语义：要求请求已携带 userContext.userId。
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/** 本地固定用户 ID（可用环境变量覆盖） */
export const LOCAL_USER_ID =
  process.env.LOCAL_USER_ID || 'local-user';

/** 本地用户上下文（中间件注入） */
export interface LocalUserContext {
  userId: string;
}

// —— Express Request 类型扩展（原平台版由 core 提供，本地版自行声明）——
declare global {
  namespace Express {
    interface Request {
      userContext?: LocalUserContext;
      __platform_data__?: Record<string, unknown>;
    }
  }
}

/** 注入本地用户上下文到每个请求 */
@Injectable()
export class LocalUserContextMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    req.userContext = { userId: LOCAL_USER_ID };
    req.__platform_data__ = { local: true, userId: LOCAL_USER_ID };
    next();
  }
}

@Injectable()
export class LocalLoginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.userContext?.userId;
    if (!userId) {
      throw new UnauthorizedException('未登录');
    }
    return true;
  }
}

/**
 * 登录守卫装饰器（与原版 @NeedLogin() 行为兼容）
 * 本地版始终放行（固定用户已由中间件注入），保留装饰器是为了不改动控制器结构。
 */
export const NeedLogin = () => applyDecorators(UseGuards(LocalLoginGuard));

/** 取当前请求用户 ID（与原平台版 req.userContext.userId 等价） */
export const LocalUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.userContext?.userId || LOCAL_USER_ID;
  },
);
