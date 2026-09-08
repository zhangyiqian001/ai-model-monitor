import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  PlatformListResponse,
  PlatformWithConfig,
  UpdateConfigRequest,
  UserPlatformConfig,
} from '@shared/api.interface';

export async function getPlatforms(params?: {
  region?: string;
  status?: string;
  keyword?: string;
}): Promise<PlatformListResponse> {
  const response = await axiosForBackend.get('/api/platforms', { params });
  return response.data;
}

export async function getPlatformDetail(
  platformKey: string,
): Promise<PlatformWithConfig> {
  const response = await axiosForBackend.get(
    `/api/platforms/${platformKey}`,
  );
  return response.data;
}

export async function updatePlatformConfig(
  platformKey: string,
  data: UpdateConfigRequest,
): Promise<UserPlatformConfig> {
  const response = await axiosForBackend.patch(
    `/api/platforms/${platformKey}/config`,
    data,
  );
  return response.data;
}

export async function deletePlatformKey(
  platformKey: string,
): Promise<void> {
  await axiosForBackend.delete(`/api/platforms/${platformKey}/key`);
}
