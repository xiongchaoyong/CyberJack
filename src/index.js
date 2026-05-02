const fs = require("fs");
const os = require("os");
const path = require("path");
const dotenv = require("dotenv");

const { readConfig } = require("./core/config");
const { renderInstructionTemplate } = require("./core/instructions-template");
const { CyberJackApp } = require("./core/app");
const {
  buildTerminalHelpText,
  buildTerminalTopicHelp,
} = require("./core/command-registry");

function ensureDefaultStateDirectory() {
  fs.mkdirSync(path.join(os.homedir(), ".cyberjack"), { recursive: true });
}

function loadEnv() {
  ensureDefaultStateDirectory();
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(os.homedir(), ".cyberjack", ".env"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) {
      continue;
    }
    dotenv.config({ path: envPath });
    return;
  }
  dotenv.config();
}

function ensureRuntimeEnv() {
  if (!process.env.CYBERJACK_HOME) {
    process.env.CYBERJACK_HOME = path.resolve(__dirname, "..");
  }
}

function ensureBootstrapFiles(config) {
  ensureInstructionsTemplate(config);
}

function ensureInstructionsTemplate(config) {
  const filePath = typeof config?.weixinInstructionsFile === "string"
    ? config.weixinInstructionsFile.trim()
    : "";
  if (!filePath || fs.existsSync(filePath)) {
    return;
  }

  const templatePath = typeof config?.weixinInstructionsTemplateFile === "string"
    && config.weixinInstructionsTemplateFile.trim()
    ? config.weixinInstructionsTemplateFile.trim()
    : path.resolve(__dirname, "..", "templates", "weixin-instructions.md");
  let template = "";
  try {
    template = fs.readFileSync(templatePath, "utf8");
  } catch {
    return;
  }

  const userName = String(config?.userName || "").trim() || "用户";
  const content = renderInstructionTemplate(template, {
    ...config,
    userName,
  }).trimEnd() + "\n";
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function printHelp() {
  console.log(buildTerminalHelpText());
}

let runtimeErrorHooksInstalled = false;

function installRuntimeErrorHooks() {
  if (runtimeErrorHooksInstalled) {
    return;
  }
  runtimeErrorHooksInstalled = true;

  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
    console.error(`[cyberJack] unhandled rejection ${message}`);
  });

  process.on("uncaughtException", (error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(`[cyberJack] uncaught exception ${message}`);
    process.exitCode = 1;
  });
}

async function main() {
  loadEnv();
  ensureRuntimeEnv();
  installRuntimeErrorHooks();
  const argv = process.argv.slice(2);
  const config = readConfig();
  ensureBootstrapFiles(config);
  const command = config.mode || "help";
  const subcommand = argv[1] || "";
  let app = null;
  const getApp = () => {
    if (!app) {
      app = new CyberJackApp(config);
    }
    return app;
  };

  if (command === "help" || command === "--help" || command === "-h") {
    const topicHelp = subcommand ? buildTerminalTopicHelp(subcommand) : "";
    console.log(topicHelp || buildTerminalHelpText());
    return;
  }

  if (command === "doctor") {
    getApp().printDoctor();
    return;
  }

  if (command === "login") {
    await getApp().login();
    return;
  }

  if (command === "accounts") {
    getApp().printAccounts();
    return;
  }

  if (command === "start") {
    await getApp().start();
    return;
  }

  throw new Error(`未知命令: ${command}。运行 npm run help 查看可用命令。`);
}

module.exports = { main };
