# CyberJack

**CyberJack** 是一个微信数字人桥接层。它把微信消息接入 AI runtime（DeepSeek 或 Codex），再配合 Skill系统，让 AI 以指定人格在微信中与用户持续对话。

蒸馏内容来自Jack叔叔的粉丝切片，总计约70w字，制作成Skill。内容或有出入，实际以直播为主。

**抖音: Jack要加油**

**b站: Jack和Linda**

**小红书: Jack和Linda**

**本项目基于[cyberboss](https://github.com/WenXiaoWendy/cyberboss) 项目，感谢开源**



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
使用codex、claude code等agent工具，
将[项目地址](https://github.com/xiongchaoyong/CyberJack?tab=readme-ov-file)交给大模型,输入指令让ai部署项目，根据ai的指示完成登录、启动。


## 常规启动
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

## License

AGPL-3.0-only



## 写在最后

作者技术有限，若有不足之处，欢迎指正！
