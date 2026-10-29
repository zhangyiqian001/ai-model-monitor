# AI 模型接口监控台（AI Model Interface Monitor）

多平台免费 AI 模型**统一网关 + 监控台**：聚合国内外厂商的免费模型 / 免费额度接口，提供 OpenAI 兼容 API（`/v1/chat/completions`），**自动按性能选择可用模型、欠费或额度用尽自动切换**；同时内置 38 家平台（国内 18 家 + 国外 20 家）的 Key 管理、健康检测、用量统计与模型比价。

> ⚠️ 本工具仅面向**官方合法免费渠道**（官方免费额度、新用户赠金、免费模型）。请勿用于盗用 Key、批量注册、绕过验证等灰色用途。

## ✨ 核心能力

### 1. 统一免费 API 网关（主打）
- **聚合路由**：自动汇集各平台已配置 Key、启用且健康检测正常的免费模型，形成一份「性能排序」的候选路由（如 `zhipu::glm-5.3` → `bailian::deepseek-v4-pro` → `openrouter::…:free`）
- **OpenAI 兼容接入**：`POST /v1/chat/completions` + `GET /v1/models`，任何 OpenAI SDK / 客户端（DeepSeek Harness、ChatBox、LobeChat 等）填 API 地址与 Key 即用
- **智能切换**：
  - `model=auto` → 按性能排序自动选当前可用模型
  - 指定模型（`平台ID::模型ID`）→ 该模型置顶优先，**失败/欠费后自动回落完整排序**
  - **欠费自动换平台**：账户级 400（`Access denied / overdue-payment`）识别后跳过整个平台（冷却 5 分钟），自动换其他平台免费模型
  - 额度不足/限流/鉴权失败/上游故障 → 自动切下一个候选
- **失败透明**：响应与「最近调用记录」透传上游真实错误（如 `Access denied…overdue-payment`），一眼看清原因
- **多模态/扩展参数宽容**：tools、developer 消息归一化、未知扩展参数忽略，非流式 + SSE 流式均支持

### 2. 模型列表与比价
- 按平台拉取**真实模型列表**（OpenRouter 全量含定价；OpenAI 兼容平台 `/v1/models`；Gemini `/v1beta/models`），展示模型 ID、上下文、输入/输出价格（$/1M）、免费标记
- **默认只看免费 + 按价格从低到高排序**，支持搜索 / 只看可用筛选
- **一键测试所有模型**：并发 4、单模型 10s 超时，批量返回可用性/延迟/错误
- **手动标记免费**：模型列表可手动标注免费，纳入免费候选

### 3. 平台管理与监控
- 38 家平台预置，Key 脱敏保存、启用/停用
- 真实健康检测（最小请求，正常 / Key 无效 / 额度耗尽 / 网络错误 / 超时）、响应延迟、历史留存
- 用量统计：调用官方用量接口或解析响应头速率限制，展示剩余额度 / 有效期 / 刷新周期
- 仪表盘：状态一览、可用/异常统计、Token 用量汇总、运行检查

## 🚀 快速开始（本地独立运行）

本仓库已改造为**本地独立版**：不依赖平台登录、平台数据库与平台内网域名；数据库使用 **SQLite**（零安装）。

```bash
# 1. 安装依赖
npm install

# 2. 编译 + 启动（自动完成 server/client 编译，单进程监听 3000）
npm run start:local
```

启动后访问 **http://127.0.0.1:3000** 打开监控台。

- 端口 / 本地用户 ID / SQLite 路径见 `.env.local`（默认 `127.0.0.1:3000`）
- 数据落盘：`./data/ai-model-monitor.db`（SQLite，刷新/重启不丢失）、`./data/gateway-state.json`（冷却状态）、`./data/gateway-log.json`（最近 300 次尝试记录）
- 首次使用：进入「平台管理」为平台配置 API Key 并启用 → 平台详情/模型列表做一次健康检测 → 网关自动纳入可用模型

### 开发模式（可选）

```bash
npm run dev:server   # 后端 NestJS（watch）
npm run dev:client   # 前端 Vite（8080，自动反代 /api 到 3000）
```

> 注：`npm run dev` / `scripts/dev.sh` 为平台原版启动脚本（依赖 lark-cli），本地请使用 `npm run start:local`。

## 🔌 客户端接入

以 DeepSeek Harness / ChatBox / LobeChat 等任意 OpenAI 兼容客户端为例：

| 字段 | 值 |
|------|------|
| Provider ID | `local-gateway` |
| 显示名称 | 本地免费网关 |
| API 地址 | `http://127.0.0.1:3000/v1` |
| API 协议 | OpenAI Chat Completions |
| API 密钥 | 在「统一 API 服务」页面复制（自动生成，保存在 `data/gateway.json`，勿外传） |
| 模型 | 填 `auto`（网关自动切换，最省心）；或指定 `平台ID::模型ID`（用完自动回落排序） |

管理入口仅接受本机同源请求（默认监听 127.0.0.1）；日志不保存提示词、正文或原始 Key。

## 🖥️ 页面结构

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 仪表盘 | 统计卡片 + 平台状态 + Token 用量趋势 + 运行检查 |
| `/platforms` | 平台管理 | 38 家平台卡片，Key 配置，启用/停用，搜索/筛选 |
| `/platforms/:platformKey` | 平台详情 | 健康状态 + 检测历史 + 用量记录 + 模型列表/一键测试 |
| `/models` | 模型列表 | 按平台拉取真实模型，免费/比价排序、搜索、一键测试、标记免费 |
| `/gateway` | 统一 API 服务 | 模型与切换顺序（性能排序、整行点击设为当前）、冷却状态、最近调用记录、客户端接入信息、一键测试全部模型 |

## 🗂️ 目录结构

```
client/                    # React 前端（Vite）
server/modules/gateway/    # 统一 API 网关（router 切换策略 + 模型性能排序 + 冷却/尝试记录）
server/modules/platforms/  # 平台管理（38 家预置）
server/modules/monitoring/ # 健康检测
server/modules/models/     # 模型列表/比价
server/modules/usage/      # 用量统计
server/local/              # 本地独立版基础设施（SQLite + 本地认证）
server/database/           # drizzle schema（SQLite 方言）
shared/                    # 前后端共享类型
scripts/                   # start-local.js 本地启动入口
data/                      # 本地运行时数据（SQLite / 网关状态，已 gitignore）
```

## ⚠️ 注意事项

- 免费额度政策变动频繁，以各平台官方控制台实时显示为准；模型清单不保证免费或额度充足
- 健康检测与用量查询为**真实 API 调用**，会产生少量调用量，注意各平台速率限制
- API Key 请妥善保管；`.gitignore` 已排除 `.env.local`、`data/`、`dist/` 等敏感与构建产物
- 网关独立服务 Key 自动写入被 Git 忽略的 `data/gateway.json`，勿提交或对外分享
- Cloudflare / Replicate / Hugging Face / Cohere / AI21 等专用协议暂未接入网关，已配置时在页面明确列出

## 📄 许可

个人学习与开发使用。
