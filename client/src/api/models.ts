import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { ModelListResponse } from '@shared/api.interface';

// 获取 OpenRouter 全量模型（公开，无需登录态但接口需鉴权走后端代理）
export function getOpenRouterModels(): Promise<ModelListResponse> {
  return axiosForBackend
    .get('/api/models/openrouter')
    .then((res) => res.data);
}

// 获取指定平台的模型列表
// 对于火山方舟（platformKey === 'doubao'），可选传 ak/sk
export function getPlatformModels(
  platformKey: string,
  options?: { accessKey?: string; secretKey?: string },
): Promise<ModelListResponse> {
  return axiosForBackend
    .post(`/api/models/platforms/${platformKey}/list`, options || {})
    .then((res) => res.data);
}
