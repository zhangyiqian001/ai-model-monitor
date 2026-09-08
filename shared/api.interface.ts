export type PlatformRegion = 'domestic' | 'overseas';

export type HealthStatus =
  | 'healthy'
  | 'invalid_key'
  | 'quota_exceeded'
  | 'network_error'
  | 'timeout'
  | 'not_configured'
  | 'disabled'
  | 'checking';

export interface PlatformInfo {
  key: string;
  name: string;
  region: PlatformRegion;
  websiteUrl: string;
  consoleUrl?: string;
  apiDocUrl?: string;
  freeTierInfo: string[];
  rateLimitInfo: string[];
  usageMethodInfo: string[];
  validityInfo: string[];
  requiresRealName: boolean;
  status: string;
  statusNote?: string;
  testModel: string;
  apiBaseUrl: string;
  authType: 'bearer' | 'query' | 'header-custom';
  hasUsageApi: boolean;
  usageApiNote?: string;
  modelsApiType: 'openai-compatible' | 'gemini' | 'openrouter' | 'volcengine-ark' | 'none';
  modelsApiUrl?: string;
  supportsAkSk?: boolean;
  builtinModels?: ModelInfo[];
  builtinModelsUpdatedAt?: string;
}

export interface UserPlatformConfig {
  id: string;
  platformKey: string;
  apiKeyMasked: string;
  isEnabled: boolean;
  notes: string;
  hasKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformWithConfig extends PlatformInfo {
  config: UserPlatformConfig | null;
  latestHealthStatus: HealthStatus;
  latestLatencyMs?: number;
  latestCheckAt?: string;
}

export interface HealthCheckRecord {
  id: string;
  platformKey: string;
  status: HealthStatus;
  latencyMs?: number;
  errorMessage?: string;
  modelTested: string;
  checkedAt: string;
}

export interface UsageRecord {
  id: string;
  platformKey: string;
  remainingCredits?: string;
  usedTokens?: string;
  rateLimitInfo?: string;
  quotaInfo?: string;
  recordedAt: string;
}

export interface DashboardStats {
  totalPlatforms: number;
  configuredPlatforms: number;
  enabledPlatforms: number;
  healthyCount: number;
  warningCount: number;
  errorCount: number;
  lastCheckAt?: string;
}

export interface PlatformListResponse {
  items: PlatformWithConfig[];
  total: number;
}

export interface HealthCheckResponse {
  platformKey: string;
  status: HealthStatus;
  latencyMs?: number;
  errorMessage?: string;
  modelTested: string;
  checkedAt: string;
}

export interface BatchHealthCheckResponse {
  results: HealthCheckResponse[];
  total: number;
  successCount: number;
}

export interface UsageQueryResponse {
  platformKey: string;
  remainingCredits?: string;
  usedTokens?: string;
  rateLimitInfo?: string;
  quotaInfo?: string;
  recordedAt: string;
  errorMessage?: string;
}

export interface HealthRecordListResponse {
  items: HealthCheckRecord[];
  total: number;
}

export interface UsageRecordListResponse {
  items: UsageRecord[];
  total: number;
}

export interface UpdateConfigRequest {
  apiKey?: string;
  isEnabled?: boolean;
  notes?: string;
}

export interface ExportReportResponse {
  exportUrl: string;
  generatedAt: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength?: number;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  isFree?: boolean;
  isDeprecated?: boolean;
  isAvailable?: boolean;
  pricingNote?: string;
  description?: string;
}

export interface ModelListResponse {
  items: ModelInfo[];
  source: 'api' | 'builtin' | 'mixed';
  sourceNote?: string;
  lastUpdated?: string;
  errorMessage?: string;
  modelsApiUrl?: string;
}

export interface CheckWithModelRequest {
  modelId: string;
}

export interface VolcengineArkConfig {
  hasAccessKey: boolean;
  hasSecretKey: boolean;
}
