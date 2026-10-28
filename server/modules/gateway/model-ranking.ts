// 模型性能评分表：用于「模型与切换顺序」按性能从高到低排序。
// 分数为维护的手工基准（0-99），反映各模型家族的通用能力认知；
// 免费/轻量后缀会降权，未知模型给中性分。可随模型演进调整。
export interface ModelRank { score: number; tier: '旗舰' | '主流' | '轻量' | '入门'; }

// 家族基础分（key 越长越优先匹配，score 为家族代表分）
const FAMILY: [string, number][] = [
  ['claude-opus', 96],
  ['claude-sonnet', 88],
  ['claude-haiku', 70],
  ['claude', 80],
  ['gpt-5', 92],
  ['gpt-4o', 84],
  ['gpt-4', 82],
  ['gpt', 75],
  ['glm-5.3', 95],
  ['glm-5', 93],
  ['glm-4.7', 84],
  ['glm-4.6', 82],
  ['glm-4.5-air', 68],
  ['glm-4.5', 76],
  ['glm-z1', 66],
  ['glm-4-flashx', 62],
  ['glm-4-flash', 55],
  ['glm', 65],
  ['deepseek-v4-pro', 92],
  ['deepseek-v4.1', 90],
  ['deepseek-v4', 90],
  ['deepseek-r1', 88],
  ['deepseek-v3', 72],
  ['deepseek', 64],
  ['qwen3.8-max', 88],
  ['qwen3.8', 80],
  ['qwen-max', 85],
  ['qwen-plus', 75],
  ['qwen-turbo', 65],
  ['qwen', 70],
  ['kimi-k3', 84],
  ['kimi-k2', 82],
  ['kimi', 76],
  ['gemini-2', 84],
  ['gemini-pro', 85],
  ['gemini-flash', 72],
  ['gemini', 75],
  ['llama-3.3', 72],
  ['llama-3.1', 68],
  ['llama-3', 66],
  ['llama', 55],
  ['mistral-large', 78],
  ['mistral', 62],
  ['nemotron', 58],
  ['xingchen', 62],
  ['flint', 45],
  ['lfm', 45],
  ['dots', 48],
] as [string, number][];
FAMILY.sort((a, b) => b[0].length - a[0].length);

// 后缀降权（命中多项叠加）
const SUFFIX: [RegExp, number][] = [
  [/flashx/, -6],
  [/flash/, -12],
  [/lite/, -15],
  [/mini/, -10],
  [/tiny/, -18],
  [/nano/, -18],
  [/fast/, -8],
  [/air/, -6],
];

export function rankModel(modelId: string): ModelRank {
  let name = String(modelId || '').toLowerCase().replace(/_/g, '-');
  const isFree = name.includes(':free');
  name = name.replace(/:free$/, '').replace(/-\d{3,6}$/, '');
  let score = 40;
  for (const [key, base] of FAMILY) {
    if (name.includes(key)) { score = base; break; }
  }
  for (const [re, penalty] of SUFFIX) {
    if (re.test(name)) score += penalty;
  }
  if (isFree) score -= 4;
  score = Math.max(10, Math.min(99, score));
  const tier: ModelRank['tier'] = score >= 85 ? '旗舰' : score >= 72 ? '主流' : score >= 58 ? '轻量' : '入门';
  return { score, tier };
}
