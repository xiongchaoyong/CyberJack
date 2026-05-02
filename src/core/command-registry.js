const COMMAND_GROUPS = [
  {
    id: "lifecycle",
    label: "启动与诊断",
    actions: [
      {
        action: "app.login",
        summary: "发起微信扫码登录并保存账号",
        terminal: ["login"],
        weixin: [],
        status: "active",
      },
      {
        action: "app.accounts",
        summary: "查看本地已保存账号",
        terminal: ["accounts"],
        weixin: [],
        status: "active",
      },
      {
        action: "app.start",
        summary: "启动当前 channel/runtime 主循环",
        terminal: ["start"],
        weixin: [],
        status: "active",
      },
      {
        action: "app.shared_start",
        summary: "启动共享 app-server 与共享微信桥接",
        terminal: ["shared start"],
        weixin: [],
        status: "active",
      },
      {
        action: "app.shared_open",
        summary: "接入当前微信绑定的共享线程",
        terminal: ["shared open"],
        weixin: [],
        status: "active",
      },
      {
        action: "app.shared_status",
        summary: "查看共享 app-server 与共享桥接状态",
        terminal: ["shared status"],
        weixin: [],
        status: "active",
      },
      {
        action: "app.doctor",
        summary: "打印当前配置、边界和线程状态",
        terminal: ["doctor"],
        weixin: [],
        status: "active",
      },
    ],
  },
  {
    id: "workspace",
    label: "项目与线程",
    actions: [
      {
        action: "workspace.bind",
        summary: "绑定当前聊天使用的项目目录",
        terminal: [],
        weixin: ["/bind"],
        status: "active",
      },
      {
        action: "workspace.status",
        summary: "查看当前项目、线程、模型与上下文使用情况",
        terminal: [],
        weixin: ["/status"],
        status: "active",
      },
      {
        action: "thread.new",
        summary: "切到新线程草稿",
        terminal: [],
        weixin: ["/new"],
        status: "active",
      },
      {
        action: "thread.reread",
        summary: "让当前线程重新读取最新 instructions",
        terminal: [],
        weixin: ["/reread"],
        status: "active",
      },
      {
        action: "thread.switch",
        summary: "切换到指定线程",
        terminal: [],
        weixin: ["/switch <threadId>"],
        status: "active",
      },
      {
        action: "thread.stop",
        summary: "停止当前线程中的运行",
        terminal: [],
        weixin: ["/stop"],
        status: "active",
      },
    ],
  },
  {
    id: "approval",
    label: "授权与控制",
    actions: [
      {
        action: "approval.accept_once",
        summary: "允许当前待处理的授权请求一次",
        terminal: [],
        weixin: ["/yes"],
        status: "active",
      },
      {
        action: "approval.accept_workspace",
        summary: "在当前项目内持续允许同前缀命令",
        terminal: [],
        weixin: ["/always"],
        status: "active",
      },
      {
        action: "approval.reject_once",
        summary: "拒绝当前待处理的授权请求",
        terminal: [],
        weixin: ["/no"],
        status: "active",
      },
    ],
  },
  {
    id: "runtime",
    label: "运行控制",
    actions: [
      {
        action: "model.inspect",
        summary: "查看当前模型",
        terminal: [],
        weixin: ["/model"],
        status: "active",
      },
      {
        action: "model.select",
        summary: "切换到指定模型",
        terminal: [],
        weixin: ["/model <id>"],
        status: "active",
      },
      {
        action: "app.help",
        summary: "查看当前通道可用命令",
        terminal: ["help"],
        weixin: ["/help"],
        status: "active",
      },
    ],
  },
];

function listCommandGroups() {
  return COMMAND_GROUPS.map((group) => ({
    ...group,
    actions: group.actions.map((action) => ({ ...action })),
  }));
}

function buildTerminalHelpText() {
  const lines = [
    "用法: npm run <script>",
    "",
    "当前终端命令：",
    "  npm run login          登录微信 bot",
    "  npm run shared:start   启动共享 app-server 与共享微信桥接",
    "  npm run shared:open    在终端接入当前微信绑定线程",
    "  npm run shared:status  查看共享桥接状态",
  ];

  for (const group of COMMAND_GROUPS) {
    const activeActions = group.actions.filter((action) => action.status === "active" && action.terminal.length);
    if (!activeActions.length) {
      continue;
    }
    lines.push(`- ${group.label}`);
    for (const action of activeActions) {
      lines.push(`  ${formatTerminalExamples(action)}  ${action.summary}`);
    }
  }
  lines.push("");
  lines.push("微信侧可用命令见 /help 或 README。");
  return lines.join("\n");
}

function buildWeixinHelpText() {
  const lines = ["当前可用命令："];
  for (const group of COMMAND_GROUPS) {
    const activeActions = group.actions.filter((action) => action.status === "active" && action.weixin.length);
    if (!activeActions.length) {
      continue;
    }
    lines.push("");
    lines.push(`${group.label}：`);
    for (const action of activeActions) {
      lines.push(`- ${action.weixin.join(", ")}  ${action.summary}`);
    }
  }
  return lines.join("\n");
}

function buildTerminalTopicHelp(topic) {
  const normalizedTopic = normalizeTopic(topic);
  const actions = COMMAND_GROUPS
    .flatMap((group) => group.actions)
    .filter((action) => normalizeTopic(action.terminalGroup) === normalizedTopic && action.terminal.length);

  if (!actions.length) {
    return "";
  }

  const hasPlannedOnly = actions.every((action) => action.status === "planned");
  const lines = [
    `用法: ${buildTopicUsage(normalizedTopic)}`,
    "",
    hasPlannedOnly
      ? `当前 ${normalizedTopic} 命令仍在接入中，计划中的子命令：`
      : `当前 ${normalizedTopic} 命令：`,
  ];
  for (const action of actions) {
    lines.push(`- ${formatTerminalExamples(action)}  ${action.summary}`);
  }
  return lines.join("\n");
}

function normalizeTopic(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

module.exports = {
  buildTerminalHelpText,
  buildTerminalTopicHelp,
  buildWeixinHelpText,
  listCommandGroups,
};

function formatTerminalExamples(action) {
  const terminal = Array.isArray(action?.terminal) ? action.terminal : [];
  if (!terminal.length) {
    return "";
  }
  return terminal.map((commandText) => toNpmRunExample(commandText)).join(", ");
}

function buildTopicUsage(topic) {
  return "npm run <script>";
}

function toNpmRunExample(commandText) {
  const normalized = typeof commandText === "string" ? commandText.trim() : "";
  switch (normalized) {
    case "login":
    case "accounts":
    case "start":
    case "shared start":
    case "shared open":
    case "shared status":
    case "doctor":
    case "help":
      return `npm run ${normalized.replace(" ", ":")}`;
    default:
      return normalized;
  }
}
