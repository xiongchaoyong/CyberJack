const os = require("os");
const path = require("path");

function readConfig() {
  const argv = process.argv.slice(2);
  const mode = argv[0] || "";
  const stateDir = readTextEnv("CYBERJACK_STATE_DIR") || path.join(os.homedir(), ".cyberjack");
  const skillPath = readPathEnv("CYBERJACK_WECHAT_SKILL_PATH");
  const hasSkillPath = Boolean(skillPath);
  const disableDefaultInstructions = readBoolEnv("CYBERJACK_DISABLE_DEFAULT_INSTRUCTIONS");
  const defaultInstructionsTemplate = hasSkillPath
    ? path.resolve(__dirname, "..", "..", "templates", "weixin-instructions-generic.md")
    : path.resolve(__dirname, "..", "..", "templates", "weixin-instructions.md");
  const defaultOperationsTemplate = hasSkillPath
    ? path.resolve(__dirname, "..", "..", "templates", "weixin-operations-generic.md")
    : path.resolve(__dirname, "..", "..", "templates", "weixin-operations.md");
  const customInstructionsFile = readOptionalPathEnv("CYBERJACK_WEIXIN_INSTRUCTIONS_FILE");
  const customOperationsFile = readOptionalPathEnv("CYBERJACK_WEIXIN_OPERATIONS_FILE");
  const weixinInstructionsFile = disableDefaultInstructions
    ? customInstructionsFile
    : (customInstructionsFile || path.join(stateDir, "weixin-instructions.md"));
  const weixinOperationsFile = disableDefaultInstructions
    ? (customOperationsFile || "")
    : (customOperationsFile || defaultOperationsTemplate);

  return {
    mode,
    argv,
    stateDir,
    workspaceId: readTextEnv("CYBERJACK_WORKSPACE_ID") || "default",
    workspaceRoot: readTextEnv("CYBERJACK_WORKSPACE_ROOT") || process.cwd(),
    userName: readTextEnv("CYBERJACK_USER_NAME") || "用户",
    userGender: readTextEnv("CYBERJACK_USER_GENDER") || "female",
    allowedUserIds: readListEnv("CYBERJACK_ALLOWED_USER_IDS"),
    channel: readTextEnv("CYBERJACK_CHANNEL") || "weixin",
    runtime: readTextEnv("CYBERJACK_RUNTIME") || "deepseek",
    deepseekApiKey: readTextEnv("CYBERJACK_DEEPSEEK_API_KEY"),
    deepseekModel: readTextEnv("CYBERJACK_DEEPSEEK_MODEL") || "deepseek-v4-flash",
    accountId: readTextEnv("CYBERJACK_ACCOUNT_ID"),
    weixinBaseUrl: readTextEnv("CYBERJACK_WEIXIN_BASE_URL") || "https://ilinkai.weixin.qq.com",
    weixinCdnBaseUrl: readTextEnv("CYBERJACK_WEIXIN_CDN_BASE_URL") || "https://novac2c.cdn.weixin.qq.com/c2c",
    weixinAdapterVariant: readTextEnv("CYBERJACK_WEIXIN_ADAPTER") || "v2",
    weixinQrBotType: readTextEnv("CYBERJACK_WEIXIN_QR_BOT_TYPE") || "3",
    wechatSkillPath: skillPath,
    accountsDir: path.join(stateDir, "accounts"),
    weixinInstructionsFile,
    weixinInstructionsTemplateFile: defaultInstructionsTemplate,
    weixinOperationsFile,
    syncBufferDir: path.join(stateDir, "sync-buffers"),
    codexEndpoint: readTextEnv("CYBERJACK_CODEX_ENDPOINT"),
    codexCommand: readTextEnv("CYBERJACK_CODEX_COMMAND"),
    sessionsFile: path.join(stateDir, "sessions.json"),
  };
}

function readListEnv(...names) {
  return String(readTextEnv(...names) || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readTextEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readPathEnv(...names) {
  const value = readTextEnv(...names);
  return value ? path.resolve(value) : "";
}

function readOptionalPathEnv(...names) {
  const value = readTextEnv(...names);
  if (!value) {
    return "";
  }
  const normalized = value.toLowerCase();
  if (normalized === "none" || normalized === "off" || normalized === "false" || normalized === "-") {
    return "";
  }
  return path.resolve(value);
}

module.exports = { readConfig };

function readBoolEnv(...names) {
  const value = readTextEnv(...names).toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}
