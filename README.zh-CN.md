# cyberJack

cyberJack 是一个微信数字人桥接层。它把微信消息接入 AI runtime（DeepSeek 或 Codex），再配合 Skill 系统，让 AI 以指定人格在微信中与用户持续对话。

## 核心逻辑

```
微信 → 长轮询收消息 → channel adapter → app.js 主循环 → runtime adapter → AI 回复 → 发回微信
                                                         ↓
                                                   Skill 系统 + references 注入
```

- **Channel 层**：负责微信协议，收消息、发消息、维护登录态
- **Runtime 层**：负责 AI 推理，支持 DeepSeek（直连 API）和 Codex（本地 app-server）两种模式
- **Skill 层**：注入人格、价值观、回复风格到 AI 上下文中，决定 AI "以什么身份说话"

## 前置条件

- Node.js >= 22
- npm install 已完成
- 一个可用的微信账号

## 极速启动

### 1. 配置环境变量

项目根目录的 `.env` 文件是配置入口。至少需要：

```dotenv
CYBERJACK_RUNTIME=deepseek
CYBERJACK_DEEPSEEK_API_KEY=sk-your-key-here
CYBERJACK_DEEPSEEK_MODEL=deepseek-chat
CYBERJACK_WECHAT_SKILL_PATH=/absolute/path/to/cyberJack/skills/jack-digital-avatar
CYBERJACK_DISABLE_DEFAULT_INSTRUCTIONS=true
CYBERJACK_WEIXIN_INSTRUCTIONS_FILE=-
CYBERJACK_WEIXIN_OPERATIONS_FILE=-
CYBERJACK_WORKSPACE_ROOT=/absolute/path/to/cyberJack
```

> `.env` 包含 API Key 和账号 ID，已被 `.gitignore` 排除，不会提交到 Git。

完整配置参考 `.env.example`。

### 2. 登录微信

```bash
npm run login
```

终端会显示二维码，用微信扫码授权。成功后账号信息保存在 `~/.cyberjack/accounts/`。

> 如果之前登录过的账号已过期，会提示 `微信会话已失效`，重新执行 `npm run login` 即可。

### 3. 启动

```bash
npm run shared:start
```

启动成功后日志类似：

```
shared app-server deepseek_mode listen=ws://127.0.0.1:8765
[cyberJack] bootstrap ok
[cyberJack] channel=weixin
[cyberJack] runtime=deepseek
[cyberJack] account=27deb3d843b2-im.bot
[cyberJack] baseUrl=https://ilinkai.weixin.qq.com
[cyberJack] workspaceRoot=/path/to/cyberJack
[cyberJack] 最小消息链路已启动，正在等待微信消息。
```

> `runtime=deepseek` 表示不走本地 Codex 服务，直接调用 DeepSeek API。
> `runtime=codex` 则需要本地安装 Codex 并配置 `CYBERJACK_CODEX_COMMAND`。

### 4. 在微信中绑定项目

启动后，给微信中的机器人发送：

```
/bind /绝对路径/of/cyberJack
```

绑定后，普通文字消息会自动发给 AI 处理并回复。

## 运行时模式

### DeepSeek 模式（推荐）

配置 `CYBERJACK_RUNTIME=deepseek`，直连 DeepSeek API。特点：

- 无需本地安装 Codex
- 启动更快
- 通过 `CYBERJACK_DEEPSEEK_API_KEY` 配置密钥
- 通过 `CYBERJACK_DEEPSEEK_MODEL` 选择模型

### Codex 模式

配置 `CYBERJACK_RUNTIME=codex`，连接本地 Codex app-server。特点：

- 需要本地安装 Codex
- 支持线程持久化、授权审批、工具执行
- 适合需要 AI 执行终端命令的场景

## 微信命令

| 命令 | 作用 |
|---|---|
| `/bind /绝对路径` | 绑定当前聊天到指定项目目录 |
| `/status` | 查看当前工作区、线程、模型和上下文状态 |
| `/new` | 切换到新线程 |
| `/reread` | 重新加载人格模板到当前线程 |
| `/switch <threadId>` | 切换到指定线程 |
| `/stop` | 停止当前正在执行的 turn |
| `/yes` | 允许一次授权请求 |
| `/always` | 记住授权，当前项目相同命令前缀自动放行 |
| `/no` | 拒绝授权请求 |
| `/model` | 查看当前模型 |
| `/model <id>` | 切换模型 |
| `/help` | 显示帮助信息 |

## 终端命令

| 命令 | 作用 |
|---|---|
| `npm run login` | 微信扫码登录 |
| `npm run accounts` | 列出已保存的微信账号 |
| `npm run shared:start` | 启动共享模式（推荐） |
| `npm run shared:open` | 在终端打开当前绑定线程 |
| `npm run shared:status` | 查看共享模式状态 |
| `npm run doctor` | 诊断当前配置和状态 |
| `npm run help` | 显示帮助信息 |

## 启动流程详解

```
npm run shared:start
  ↓
scripts/shared-start.js
  ├── 检查 runtime 模式：deepseek 则跳过 app-server 启动
  ├── 确保没有旧 bridge 进程在运行
  ├── 启动 bin/cyberjack.js start（子进程）
  │     ↓
  │   src/index.js → readConfig() → new CyberJackApp()
  │     ├── createWeixinChannelAdapter()  ← 微信通道
  │     └── createRuntimeAdapter()        ← DeepSeek / Codex
  │     ↓
  │   app.start()
  │     ├── resolveAccount()     ← 读取本地保存的微信账号
  │     ├── runtime.initialize() ← 初始化 AI runtime
  │     └── 进入长轮询循环：
  │           channel.getUpdates() → 收消息
  │           → handleIncomingMessage()
  │             → runtime.sendTextTurn() → AI 回复
  │             → channel.sendText()     → 发回微信
  └── 子进程退出时清理 PID 文件
```

## 项目结构

```
cyberJack/
├── bin/cyberjack.js          CLI 入口
├── scripts/
│   ├── shared-start.js       共享模式启动
│   ├── shared-open.js        终端打开绑定线程
│   ├── shared-status.js      查看共享模式状态
│   └── shared-common.js      共享脚本公用逻辑
├── src/
│   ├── index.js              总入口，路由各命令
│   ├── core/
│   │   ├── app.js            主循环：收消息 → runtime → 回消息
│   │   ├── config.js         读取环境变量
│   │   ├── stream-delivery.js runtime 流式输出投递回微信
│   │   ├── thread-state-store.js  线程状态追踪
│   │   ├── command-registry.js    命令帮助文案
│   │   └── instructions-template.js 模板渲染
│   └── adapters/
│       ├── channel/weixin/   微信通道适配器
│       │   ├── index.js      主适配器
│       │   ├── login.js      扫码登录
│       │   ├── account-store.js  账号持久化
│       │   ├── api.js / api-v2.js 微信 API 封装
│       │   ├── context-token-store.js 会话上下文
│       │   ├── message-utils*.js 消息归一化
│       │   ├── media-*.js    附件收发
│       │   └── sync-buffer-store.js 同步游标持久化
│       └── runtime/
│           ├── deepseek/     DeepSeek API 适配器
│           │   └── index.js  对话管理 + Skill 注入
│           └── codex/        Codex 适配器
│               ├── index.js  Codex 主适配器
│               ├── rpc-client.js 连接 codex app-server
│               ├── events.js    事件映射
│               ├── session-store.js 会话状态持久化
│               └── model-catalog.js 模型列表
├── skills/
│   └── jack-digital-avatar/  数字人 Skill
│       ├── SKILL.md          Skill 总入口
│       ├── scripts/          附带脚本
│       └── references/       人格资料库
│           ├── persona.md    人设、口吻、价值观
│           ├── life-story.md 人生叙事主线
│           ├── worldview.md  核心认知框架
│           ├── money-framework.md 财富观
│           ├── reply-patterns.md  回复结构
│           ├── wechat-style.md    微信表达规则
│           ├── comfort-cases.md   安慰场景
│           ├── wake-up-cases.md   点醒场景
│           └── ...
├── templates/
│   ├── weixin-instructions-generic.md  通用指令模板
│   └── weixin-operations-generic.md    通用操作模板
├── .env                     本地配置（已 gitignore）
├── .env.example             配置模板
└── package.json
```

## 状态目录

默认路径：`~/.cyberjack`（可通过 `CYBERJACK_STATE_DIR` 修改）

```
.cyberjack/
├── accounts/           微信登录账号（含 token）
├── sync-buffers/       消息同步游标
├── sessions.json       线程绑定关系
└── logs/               shared 模式日志
```

> 此目录包含登录凭证，不应提交到 Git。

## 常见问题

**Q: 启动报 "微信会话已失效"？**
A: 重新执行 `npm run login`。

**Q: 启动报 "检测到多个微信账号"？**
A: 在 `.env` 中设置 `CYBERJACK_ACCOUNT_ID=你的账号ID`。

**Q: AI 不回复或回复失败？**
A: 检查 `CYBERJACK_DEEPSEEK_API_KEY` 是否正确，以及网络能否访问 `api.deepseek.com`。

## License

AGPL-3.0-only
