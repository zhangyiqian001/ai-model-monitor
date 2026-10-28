# AI 模型接口监控台（AI Model Interface Monitor）

多平台 AI 大模型接口健康检测与用量统计工具。内置 **38 家** AI 平台（国内 18 家 + 国外 20 家）的免费额度、速率限制、有效期与用量统计方式，支持配置 API Key 后一键检测接口可用性、统计用量，并可按价格拉取各厂商模型列表。

> ⚠️ 本工具仅面向**官方合法免费渠道**（官方免费额度、新用户赠金、免费模型）。请勿用于盗用 Key、批量注册、绕过验证等灰色用途。

## ✨ 功能特性

- **38 家平台预置**：国内（智谱、百度千帆、阿里百炼、腾讯混元、讯飞星火、火山方舟/豆包、DeepSeek、MiniMax、Kimi、硅基流动等）+ 国外（Google Gemini、Groq、OpenRouter、Cohere、Cloudflare Workers AI、GitHub Models 等），每家含免费额度、速率限制、有效期、来源
- **API Key 管理**：为平台配置 Key，脱敏展示，支持启用/停用，后端妥善保管
- **真实健康检测**：通过后端代理真实调用各平台接口（最小请求），记录状态（正常 / Key 无效 / 额度耗尽 / 网络错误 / 超时）、响应延迟、检测时间；支持一键全部检测、单平台检测
- **用量统计**：调用各平台官方用量接口（OpenRouter credits、智谱 monitor/usage 等）或解析响应头速率限制信息，展示剩余额度、已用 Token、有效期与刷新周期，历史趋势留存
- **模型列表 / 模型比价**：拉取各厂商真实模型列表，展示模型 ID、上下文、输入/输出价格（$/1M tokens）、免费标记，**默认按价格从低到高排序**（免费模型排最前）；支持搜索、只看免费、只看可用；「选用此模型」一键用于健康检测
- **仪表盘**：各平台状态一览、可用/异常统计、最近检测时间、今日用量汇总
- **CSV 报告导出**、**全量数据持久化**（刷新不丢失）

## 🚀 快速开始

### 本机独立运行（推荐，零平台依赖）

本仓库已改造为**本地独立版**：不再依赖豆包平台登录、平台数据库与平台内网域名，数据库使用 **SQLite**（零安装），一条命令完成编译与启动：

```bash
# 1. 安装依赖
npm install

# 2. 编译 + 启动（自动完成 server/client 编译，单进程监听 3000 端口）
npm run start:local
```

启动后访问 **http://127.0.0.1:3000** 即可打开监控台。

- 环境变量见 `.env.local`（端口、本地用户 ID、SQLite 文件路径均可修改）
- 数据默认落在 `./data/ai-monitor.db`（SQLite，WAL 模式，刷新/重启不丢失）
- 首次使用：进入「平台管理」为平台配置 API Key 并启用 → 一键检测 / 单平台检测 / 模型列表均可真实调用

### 开发模式（可选）

```bash
npm run dev:server   # 后端 NestJS（watch）
npm run dev:client   # 前端 Vite（8080，自动反代 /api 到 3000）
```

> 注：`npm run dev` / `scripts/dev.sh` 为平台原版启动脚本，依赖 lark-cli 与平台配置，本地请使用 `npm run start:local`。

## 🖥️ 页面结构

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 仪表盘 | 统计卡片 + 平台状态表格 + 最近检测记录 + 一键全部检测 |
| `/platforms` | 平台管理 | 38 家平台卡片网格，搜索/区域/状态筛选，Key 配置，启用/停用 |
| `/platforms/:platformKey` | 平台详情 | 免费额度/速率限制/有效期 + 健康状态 + 检测历史图表 + 用量记录 + 自定义模型测试 |
| `/models` | 模型列表 | 按平台拉取真实模型列表，按费用从低到高排序、筛选、选用模型 |

## 🔌 模型列表数据源说明

- **OpenRouter**：`GET /api/v1/models`（无需 Key），返回全量模型含 `pricing`、上下文、免费标记，是跨厂商比价的核心数据源
- **OpenAI 兼容平台**：`GET {base_url}/v1/models`（DeepSeek、Groq、智谱等）
- **Google Gemini**：`GET /v1beta/models?key=xxx`
- **火山方舟**：官方 `ListFoundationModels` 仅支持 Access Key 签名鉴权，未配置 AK/SK 时展示**内置官方模型清单**（标注更新日期）

## 🗂️ 目录结构

```
client/            # React 前端（Vite）
server/            # NestJS 后端（模块：platforms / monitoring / models / usage）
server/local/      # 本地独立版基础设施（SQLite 数据库 + 本地认证，替代平台 PlatformModule）
server/database/   # drizzle schema（SQLite 方言）
shared/            # 前后端共享类型
scripts/           # 开发与构建脚本（start-local.js 为本地启动入口）
data/              # 本地 SQLite 数据文件（运行时生成）
```

## ⚠️ 注意事项

- 免费额度政策变动频繁，各平台信息以官方控制台实时显示为准（内置清单核实日期见各平台卡片）
- 健康检测与用量查询为**真实 API 调用**，会产生少量调用量，注意各平台速率限制
- API Key 请妥善保管，勿提交到公开仓库；本仓库已配置 `.gitignore` 排除环境变量与构建产物

## 📄 许可

个人学习与开发使用。
