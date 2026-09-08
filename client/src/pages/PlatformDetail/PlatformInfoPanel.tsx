import { ExternalLinkIcon } from 'lucide-react';
import type { PlatformInfo } from '@shared/api.interface';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';

interface PlatformInfoPanelProps {
  platform: PlatformInfo;
}

export function PlatformInfoPanel({ platform }: PlatformInfoPanelProps) {
  return (
    <div className="p-5 pt-0">
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <InfoRow label="区域">
          {platform.region === 'domestic' ? '国内' : '国外'}
        </InfoRow>
        <InfoRow label="测试模型">{platform.testModel}</InfoRow>
        <InfoRow label="认证方式">{platform.authType}</InfoRow>
        <InfoRow label="实名认证">
          {platform.requiresRealName ? '需要' : '不需要'}
        </InfoRow>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
        <LinkRow label="官网" url={platform.websiteUrl} />
        {platform.consoleUrl && (
          <LinkRow label="控制台" url={platform.consoleUrl} />
        )}
        {platform.apiDocUrl && (
          <LinkRow label="API 文档" url={platform.apiDocUrl} />
        )}
      </div>

      <InfoList title="免费额度" items={platform.freeTierInfo} />
      <InfoList title="速率限制" items={platform.rateLimitInfo} />
      <InfoList title="用量统计方式" items={platform.usageMethodInfo} />
      <InfoList title="有效期说明" items={platform.validityInfo} />
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-50 py-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-800">{children}</span>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-500">{label}</span>
      <UniversalLink
        to={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-sm text-[#1890ff] hover:underline"
      >
        查看
        <ExternalLinkIcon className="size-3" />
      </UniversalLink>
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs font-medium text-gray-500">{title}</div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default PlatformInfoPanel;
