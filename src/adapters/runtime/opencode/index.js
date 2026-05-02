const { spawn } = require("child_process");
const os = require("os");
const WebSocket = require("ws");

const IS_WINDOWS = os.platform() === "win32";
const DEFAULT_OPENCODE_COMMAND = "opencode";

class OpenCodeRpcClient {
  constructor({ endpoint = "", env = process.env, opencodeCommand = "", extraWritableRoots = [] }) {
    this.endpoint = endpoint;
    this.env = env;
    this.opencodeCommand = opencodeCommand || resolveDefaultOpenCodeCommand(env);
    this.extraWritableRoots = extraWritableRoots;
    this.mode = endpoint ? "websocket" : "spawn";
    this.socket = null;
    this.child = null;
    this.stdoutBuffer = "";
    this.pending = new Map();
    this.isReady = false;
    this.messageListeners = new Set();
  }

  async connect() {
    if (this.mode === "websocket") {
      await this.connectWebSocket();
      return;
    }
    await this.connectSpawn();
  }

  async connectSpawn() {
    const commandCandidates = buildOpenCodeCommandCandidates(this.opencodeCommand);
    let child = null;
    let lastError = null;

    for (const command of commandCandidates) {
      try {
        const spawnSpec = buildSpawnSpec(command);
        child = spawn(spawnSpec.command, spawnSpec.args, {
          env: { ...this.env },
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
        });
        break;
      } catch (error) {
        lastError = error;
        if (error?.code !== "ENOENT" && error?.code !== "EINVAL") {
          throw error;
        }
      }
    }

    if (!child) {
      const attempted = commandCandidates.join(", ");
      const detail = lastError?.message ? `: ${lastError.message}` : "";
      throw new Error(`Unable to spawn OpenCode. Tried ${attempted}${detail}.`);
    }

    this.child = child;
    child.on("error", () => {
      this.isReady = false;
    });
    child.stdout.on("data", (chunk) => {
      this.stdoutBuffer += chunk.toString("utf8");
      const lines = this.stdoutBuffer.split("\n");
      this.stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          this.handleIncoming(trimmed);
        }
      }
    });
    child.on("close", () => {
      this.isReady = false;
    });
  }

  async connectWebSocket() {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      socket.on("open", () => resolve());
      socket.on("error", (error) => reject(error));
      socket.on("message", (chunk) => {
        const message = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        if (message.trim()) {
          this.handleIncoming(message);
        }
      });
      socket.on("close", () => {
        this.isReady = false;
      });
    });
  }

  onMessage(listener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  async initialize() {
    if (this.isReady) {
      return;
    }
    await this.sendRequest("initialize", {
      clientInfo: { name: "cyberjack_agent", title: "cyberJack Agent", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    await this.sendNotification("initialized", null);
    this.isReady = true;
  }

  async sendUserMessage({ threadId, text, model = null }) {
    return threadId
      ? this.sendRequest("turn/start", { threadId, input: [{ type: "text", text }], model })
      : this.sendRequest("thread/start", { input: [{ type: "text", text }] });
  }

  async startThread({ cwd }) {
    return this.sendRequest("thread/start", cwd ? { cwd } : {});
  }

  async resumeThread({ threadId }) {
    return this.sendRequest("thread/resume", { threadId });
  }

  async listModels() {
    return this.sendRequest("model/list", {});
  }

  async sendResponse(id, result) {
    this.sendRaw(JSON.stringify({ id, result }));
  }

  close() {
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    if (this.child) {
      try { this.child.kill(); } catch {}
      this.child = null;
    }
    this.isReady = false;
  }

  async sendRequest(method, params) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = JSON.stringify({ id, method, params });
    const responsePromise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.sendRaw(payload);
    return responsePromise;
  }

  sendRaw(payload) {
    if (this.mode === "websocket") {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        throw new Error("OpenCode websocket is not connected");
      }
      this.socket.send(payload);
      return;
    }
    if (!this.child || !this.child.stdin.writable) {
      throw new Error("OpenCode process stdin is not writable");
    }
    this.child.stdin.write(`${payload}\n`);
  }

  handleIncoming(rawMessage) {
    let parsed = null;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (parsed && parsed.id != null && this.pending.has(String(parsed.id))) {
      const { resolve, reject } = this.pending.get(String(parsed.id));
      this.pending.delete(String(parsed.id));
      if (parsed.error) {
        reject(new Error(parsed.error.message || "OpenCode RPC request failed"));
        return;
      }
      resolve(parsed);
      return;
    }

    for (const listener of this.messageListeners) {
      listener(parsed);
    }
  }
}

function resolveDefaultOpenCodeCommand(env) {
  return env.CYBERJACK_OPENCODE_COMMAND || DEFAULT_OPENCODE_COMMAND;
}

function buildOpenCodeCommandCandidates(configuredCommand) {
  const explicit = configuredCommand;
  if (explicit) {
    return [explicit];
  }
  return [DEFAULT_OPENCODE_COMMAND];
}

function buildSpawnSpec(command) {
  if (IS_WINDOWS) {
    return { command: "cmd.exe", args: ["/c", command, "app-server"] };
  }
  return { command, args: ["app-server"] };
}

module.exports = { OpenCodeRpcClient };
