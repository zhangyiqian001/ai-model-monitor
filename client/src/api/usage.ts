import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  UsageQueryResponse,
  UsageRecordListResponse,
  ExportReportResponse,
} from '@shared/api.interface';

export async function queryUsage(
  platformKey: string,
): Promise<UsageQueryResponse> {
  const response = await axiosForBackend.post(
    `/api/usage/query/${platformKey}`,
  );
  return response.data;
}

export async function getUsageHistory(params: {
  platformKey: string;
  limit?: number;
  page?: number;
}): Promise<UsageRecordListResponse> {
  const response = await axiosForBackend.get(
    `/api/usage/records/${params.platformKey}`,
    { params: { limit: params.limit, page: params.page } },
  );
  return response.data;
}

export async function exportReport(): Promise<ExportReportResponse> {
  const response = await axiosForBackend.post('/api/usage/export');
  return response.data;
}
