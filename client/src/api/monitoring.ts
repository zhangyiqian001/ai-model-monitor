import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  HealthCheckResponse,
  BatchHealthCheckResponse,
  HealthRecordListResponse,
  DashboardStats,
} from '@shared/api.interface';

export async function getDashboardStats(): Promise<DashboardStats> {
  const response = await axiosForBackend.get('/api/monitoring/dashboard');
  return response.data;
}

export async function checkPlatform(
  platformKey: string,
): Promise<HealthCheckResponse> {
  const response = await axiosForBackend.post(
    `/api/monitoring/check/${platformKey}`,
  );
  return response.data;
}

export async function checkPlatformWithModel(
  platformKey: string,
  modelId: string,
): Promise<HealthCheckResponse> {
  const response = await axiosForBackend.post(
    `/api/monitoring/check/${platformKey}/with-model`,
    { modelId },
  );
  return response.data;
}

export async function checkAllPlatforms(): Promise<BatchHealthCheckResponse> {
  const response = await axiosForBackend.post('/api/monitoring/check-all');
  return response.data;
}

export async function getHealthRecords(params: {
  platformKey: string;
  limit?: number;
  page?: number;
}): Promise<HealthRecordListResponse> {
  const response = await axiosForBackend.get(
    `/api/monitoring/records/${params.platformKey}`,
    { params: { limit: params.limit, page: params.page } },
  );
  return response.data;
}
