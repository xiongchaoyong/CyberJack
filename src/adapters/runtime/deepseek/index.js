const fs = require("fs");
const https = require("https");
const path = require("path");
const { renderInstructionTemplate } = require("../../../core/instructions-template");

function createDeepSeekRuntimeAdapter(config) {
  const threadMessagesMap = new Map();
  const listeners = [];
  
  const API_BASE = "https://api.deepseek.com";
  const MODEL = config.deepseekModel || "deepseek-chat";

  return {
    describe() {
      return {
        id: "deepseek",
        kind: "runtime",
        endpoint: API_BASE,
        model: MODEL,
      };
    },

    createClient() {
      return null;
    },

    onEvent(listener) {
      if (typeof listener === "function") {
        listeners.push(listener);
      }
      return () => {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    },

    emitEvent(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (e) {
          console.error("[deepseek] event listener error:", e);
        }
      }
    },

    getSessionStore() {
      return {
        getThreadIdForWorkspace: (bindingKey, workspaceRoot) => {
          const key = `${bindingKey}:${workspaceRoot}`;
          return threadMessagesMap.get(key)?.threadId || null;
        },
        setThreadIdForWorkspace: (bindingKey, workspaceRoot, threadId, extra) => {
          const key = `${bindingKey}:${workspaceRoot}`;
          threadMessagesMap.set(key, { threadId, ...extra });
        },
        clearThreadIdForWorkspace: (bindingKey, workspaceRoot) => {
          const key = `${bindingKey}:${workspaceRoot}`;
          threadMessagesMap.delete(key);
        },
        listBindings: () => {
          const bindings = [];
          for (const [key, value] of threadMessagesMap.entries()) {
            const [bindingKey, workspaceRoot] = key.split(":");
            bindings.push({
              bindingKey,
              threadIdByWorkspaceRoot: { [workspaceRoot]: value.threadId },
            });
          }
          return bindings;
        },
        getBinding: (bindingKey) => {
          for (const [key, value] of threadMessagesMap.entries()) {
            if (key.startsWith(bindingKey + ":")) {
              const [, workspaceRoot] = key.split(":");
              return {
                bindingKey,
                threadIdByWorkspaceRoot: { [workspaceRoot]: value.threadId },
                senderId: value.senderId || "",
              };
            }
          }
          return null;
        },
        buildBindingKey: ({ workspaceId, accountId, senderId }) => {
          return `${workspaceId}:${accountId}:${senderId}`;
        },
        setActiveWorkspaceRoot: () => {},
        getActiveWorkspaceRoot: () => "",
        getCodexParamsForWorkspace: () => ({ model: "" }),
        setCodexParamsForWorkspace: () => {},
        findBindingForThreadId: (threadId) => {
          for (const [key, value] of threadMessagesMap.entries()) {
            if (value.threadId === threadId) {
              const [bindingKey, workspaceRoot] = key.split(":");
              return {
                bindingKey,
                workspaceRoot,
              };
            }
          }
          return null;
        },
        getApprovalCommandAllowlistForWorkspace: () => [],
        getApprovalPromptState: () => null,
        clearApprovalPrompt: () => {},
        rememberApprovalPrompt: () => {},
        getAvailableModelCatalog: () => ({ models: [{ id: MODEL, model: MODEL }] }),
        setAvailableModelCatalog: () => {},
      };
    },

    async initialize() {
      return {
        endpoint: API_BASE,
        models: [{ id: MODEL, model: MODEL }],
      };
    },

    async close() {},

    async sendTextTurn({ bindingKey, workspaceRoot, text, metadata = {}, model = "", threadId: preallocatedThreadId }) {
      const apiKey = config.deepseekApiKey;
      if (!apiKey) {
        throw new Error("DeepSeek API key not configured");
      }

      const key = `${bindingKey}:${workspaceRoot}`;
      const state = threadMessagesMap.get(key) || { messages: [] };
      state.messages.push({ role: "user", content: text });

      const threadId = preallocatedThreadId || state.threadId || `thread-${Date.now()}`;
      const turnId = `turn-${Date.now()}`;
      state.threadId = threadId;

      threadMessagesMap.set(key, { ...state, ...metadata });

      this.emitEvent({
        type: "runtime.turn.started",
        payload: { threadId, turnId },
      });

      try {
        const systemPrompt = loadWechatInstructions(config, workspaceRoot);
        const allMessages = systemPrompt
          ? [{ role: "system", content: systemPrompt }, ...state.messages]
          : state.messages;

        const response = await deepSeekChat({
          apiKey,
          baseUrl: API_BASE,
          model: model || MODEL,
          messages: allMessages,
        });

        const assistantReply = response.choices?.[0]?.message?.content || "抱歉，我暂时无法生成回复。";

        state.messages.push({ role: "assistant", content: assistantReply });
        threadMessagesMap.set(key, state);

        const itemId = "item-1";
        this.emitEvent({
          type: "runtime.reply.completed",
          payload: { threadId, turnId, itemId, text: assistantReply },
        });

        this.emitEvent({
          type: "runtime.turn.completed",
          payload: { threadId, turnId },
        });
      } catch (error) {
        this.emitEvent({
          type: "runtime.turn.failed",
          payload: { threadId, turnId, text: error.message || "执行失败" },
        });
        throw error;
      }

      return { threadId };
    },

    async resumeThread({ threadId }) {
      return { threadId };
    },

    async refreshThreadInstructions({ threadId, workspaceRoot, model }) {
      return { threadId };
    },

    async respondApproval({ requestId, decision }) {
      return { requestId, decision };
    },

    async cancelTurn({ threadId, turnId }) {
      return { threadId, turnId };
    },
  };
}

async function deepSeekChat({ apiKey, baseUrl, model, messages }) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model, messages, stream: false });

    const options = {
      hostname: new URL(baseUrl).hostname,
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
            return;
          }
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function loadWechatInstructions(config, workspaceRoot) {
  const persona = loadInstructionFile(config.weixinInstructionsFile, config);
  const operations = loadInstructionFile(config.weixinOperationsFile, config);
  const skillBundle = loadWechatSkillBundle(config);
  const sections = [];
  if (persona) sections.push(persona);
  if (operations) sections.push(operations);
  if (skillBundle) sections.push(skillBundle);
  return sections.join("\n\n").trim();
}

function loadInstructionFile(filePath, config) {
  const normalizedPath = typeof filePath === "string" ? filePath.trim() : "";
  if (!normalizedPath || normalizedPath === "-") {
    return "";
  }
  try {
    const raw = fs.readFileSync(normalizedPath, "utf8");
    return renderInstructionTemplate(raw, config).trim();
  } catch {
    return "";
  }
}

function loadWechatSkillBundle(config) {
  const skillPath = config.wechatSkillPath;
  if (!skillPath) return "";

  const skillFile = resolveSkillFile(skillPath);
  if (!skillFile) return "";

  const rootDir = path.dirname(skillFile);
  const sections = [];
  const primarySkill = loadRawFile(skillFile);
  if (primarySkill) {
    sections.push(`LOCAL SKILL:\n${primarySkill}`);
  }

  const referenceCandidates = [
    "references/reply-patterns.md",
    "references/banned-patterns.md",
    "references/worldview.md",
    "references/money-framework.md",
  ];

  for (const relativePath of referenceCandidates) {
    const absolutePath = path.join(rootDir, relativePath);
    const content = loadRawFile(absolutePath);
    if (!content) continue;
    sections.push(`SKILL REFERENCE: ${relativePath}\n${content}`);
  }

  return sections.join("\n\n").trim();
}

function resolveSkillFile(skillPath) {
  const normalizedPath = skillPath.trim();
  if (!normalizedPath || !fs.existsSync(normalizedPath)) return "";
  const stat = fs.statSync(normalizedPath);
  if (stat.isFile()) return normalizedPath;
  if (!stat.isDirectory()) return "";
  const candidate = path.join(normalizedPath, "SKILL.md");
  return fs.existsSync(candidate) ? candidate : "";
}

function loadRawFile(filePath) {
  const normalizedPath = filePath?.trim();
  if (!normalizedPath || !fs.existsSync(normalizedPath)) return "";
  try {
    return fs.readFileSync(normalizedPath, "utf8").trim();
  } catch {
    return "";
  }
}

module.exports = { createDeepSeekRuntimeAdapter };