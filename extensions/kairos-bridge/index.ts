/**
 * Kairos Bridge - OpenClaw extension to call KAIROS-EVO Bridge API.
 * Registers tools: kairos_recall, kairos_think, kairos_insight, kairos_experience.
 * Requires KAIROS_BRIDGE_URL (default http://mcp_gateway:3000) and MOLTBOT_API_KEY in env.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getSessionManager, resetSessionManager } from "./session-manager.js";

const DEFAULT_BASE_URL = "http://mcp_gateway:3000";
const BRIDGE_PREFIX = "/kairos/bridge";
const DEFAULT_AACT_URL = "http://aact-server:9998";

function getAactUrl(): string {
  return process.env.AACT_DIRECT_URL?.trim() ?? DEFAULT_AACT_URL;
}

function getAactApiKey(): string {
  return process.env.AACT_API_KEY?.trim() ?? "";
}

async function aactGet(
  baseUrl: string,
  path: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const apiKey = getAactApiKey();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  try {
    const res = await fetch(url, { method: "GET", headers });
    const json = (await res.json()) as { success?: boolean; [k: string]: unknown };
    if (!res.ok) {
      const raw = json?.error ?? `HTTP ${res.status}`;
      return { success: false, error: errorToReadableString(raw) };
    }
    return { success: true, data: json };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function aactPost(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const apiKey = getAactApiKey();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { success?: boolean; [k: string]: unknown };
    if (!res.ok) {
      const raw = json?.error ?? `HTTP ${res.status}`;
      return { success: false, error: errorToReadableString(raw) };
    }
    return { success: json.success !== false, data: json };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function getBaseUrl(api: OpenClawPluginApi): string {
  const fromEnv = process.env.KAIROS_BRIDGE_URL?.trim();
  const fromConfig = (api.pluginConfig as { baseUrl?: string } | undefined)?.baseUrl?.trim();
  return fromConfig ?? fromEnv ?? DEFAULT_BASE_URL;
}

function getApiKey(): string {
  return process.env.MOLTBOT_API_KEY?.trim() ?? "";
}

function toolsHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    h["X-MOLTBOT-API-KEY"] = apiKey;
    h["X-API-Key"] = apiKey;
  }
  return h;
}

/**
 * Converts gateway error payload (string, object, or array) to a single readable string.
 * Avoids "[object Object]" when detail/error is an object (e.g. FastAPI validation or bridge security).
 */
function errorToReadableString(err: unknown): string {
  if (err == null) return "unknown";
  if (typeof err === "string") return err;
  if (Array.isArray(err)) {
    const parts = err.map((e) =>
      typeof e === "object" && e != null && "msg" in e
        ? String((e as { msg: string }).msg)
        : typeof e === "object"
          ? JSON.stringify(e)
          : String(e),
    );
    return parts.join("; ");
  }
  if (typeof err === "object") return JSON.stringify(err);
  return String(err);
}

/** GET request to MCP Gateway (e.g. /tools/discovery). */
async function gatewayGet(
  baseUrl: string,
  apiKey: string,
  path: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, { method: "GET", headers: toolsHeaders(apiKey) });
  const json = (await res.json()) as { success?: boolean; [k: string]: unknown };
  if (!res.ok) {
    const raw = json?.detail ?? json?.error ?? `HTTP ${res.status}`;
    return {
      success: false,
      error: errorToReadableString(raw),
    };
  }
  return { success: true, data: json };
}

/** POST request to MCP Gateway (e.g. /tools/execute). */
async function gatewayPost(
  baseUrl: string,
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: toolsHeaders(apiKey),
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success?: boolean; [k: string]: unknown };
  if (!res.ok) {
    const raw = json?.detail ?? json?.error ?? `HTTP ${res.status}`;
    return {
      success: false,
      error: errorToReadableString(raw),
    };
  }
  return { success: json.success !== false, data: json };
}

async function bridgeFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string; took_ms?: number }> {
  const url = `${baseUrl.replace(/\/$/, "")}${BRIDGE_PREFIX}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-MOLTBOT-API-KEY": apiKey } : {}),
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: unknown;
    error?: string;
    took_ms?: number;
  };
  if (!res.ok) {
    return {
      success: false,
      error: json?.error ?? `HTTP ${res.status}`,
      took_ms: json?.took_ms,
    };
  }
  return {
    success: json.success !== false,
    data: json.data,
    error: json.error,
    took_ms: json.took_ms,
  };
}

export default function register(api: OpenClawPluginApi) {
  const baseUrl = getBaseUrl(api);
  const apiKey = getApiKey();

  if (!apiKey) {
    api.logger.warn(
      "kairos-bridge: MOLTBOT_API_KEY not set; tools will return auth error when called.",
    );
  } else {
    api.logger.info(`kairos-bridge: registered (baseUrl=${baseUrl}, aactUrl=${getAactUrl()})`);
  }

  // Initialize session manager for DM handling
  const sessionsDir =
    process.env.OPENCLAW_SESSIONS_DIR ?? "/home/node/.openclaw/agents/main/sessions";
  const sessionManager = getSessionManager(sessionsDir);
  api.logger.info(`kairos-bridge: session manager initialized (timeout=30min, maxInteractions=50)`);

  // Cleanup on shutdown
  process.on("SIGTERM", () => {
    resetSessionManager();
  });

  api.registerTool(
    {
      name: "kairos_recall",
      label: "Kairos Recall",
      description:
        "Search KAIROS-EVO memory (hybrid search). Use when you need context about the user, past decisions, or projects.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          limit: {
            type: "number",
            description: "Max results 1-20 (default 5)",
          },
        },
        required: ["query"],
      },
      async execute(_toolCallId, params) {
        const { query, limit = 5 } = params as { query: string; limit?: number };
        const result = await bridgeFetch(baseUrl, apiKey, "/recall", { query, limit });
        if (!result.success) {
          return {
            content: [
              { type: "text" as const, text: `Kairos recall failed: ${result.error ?? "unknown"}` },
            ],
            details: {},
          };
        }
        const data = result.data as
          | {
              episodes?: Array<{ content?: string; content_summary?: string; score?: number }>;
              count?: number;
            }
          | undefined;
        const episodes = data?.episodes ?? [];
        const text =
          episodes.length === 0
            ? "No relevant memories found in Kairos."
            : episodes
                .map(
                  (e, i) =>
                    `${i + 1}. ${e.content_summary ?? e.content ?? ""} ${e.score != null ? `(score ${(e.score * 100).toFixed(0)}%)` : ""}`,
                )
                .join("\n");
        return {
          content: [
            { type: "text" as const, text: `Kairos recall (${episodes.length}):\n${text}` },
          ],
          details: { count: data?.count ?? episodes.length },
        };
      },
    },
    { name: "kairos_recall" },
  );

  api.registerTool(
    {
      name: "kairos_think",
      label: "Kairos Think",
      description: "Save a thought/reflection to KAIROS-EVO memory.",
      parameters: {
        type: "object",
        properties: {
          thought: {
            type: "string",
            description: "The thought to save",
          },
          importance: {
            type: "number",
            description: "1-10 (default 5)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["thought"],
      },
      async execute(_toolCallId, params) {
        const {
          thought,
          importance = 5,
          tags = [],
        } = params as { thought: string; importance?: number; tags?: string[] };
        const result = await bridgeFetch(baseUrl, apiKey, "/think", { thought, importance, tags });
        if (!result.success) {
          return {
            content: [
              { type: "text" as const, text: `Kairos think failed: ${result.error ?? "unknown"}` },
            ],
            details: {},
          };
        }
        const data = result.data as { message?: string } | undefined;
        return {
          content: [{ type: "text" as const, text: data?.message ?? "Thought saved to Kairos." }],
          details: {},
        };
      },
    },
    { name: "kairos_think" },
  );

  api.registerTool(
    {
      name: "kairos_insight",
      label: "Kairos Insight",
      description: "Save an insight to KAIROS-EVO memory.",
      parameters: {
        type: "object",
        properties: {
          insight: {
            type: "string",
            description: "The insight to save",
          },
          learned_from: {
            type: "string",
          },
          impact: {
            type: "string",
          },
          importance: {
            type: "number",
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["insight"],
      },
      async execute(_toolCallId, params) {
        const body = params as {
          insight: string;
          learned_from?: string;
          impact?: string;
          importance?: number;
          tags?: string[];
        };
        const result = await bridgeFetch(baseUrl, apiKey, "/insight", {
          ...body,
          importance: body.importance ?? 5,
          tags: body.tags ?? [],
        });
        if (!result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Kairos insight failed: ${result.error ?? "unknown"}`,
              },
            ],
            details: {},
          };
        }
        const data = result.data as { message?: string } | undefined;
        return {
          content: [{ type: "text" as const, text: data?.message ?? "Insight saved to Kairos." }],
          details: {},
        };
      },
    },
    { name: "kairos_insight" },
  );

  api.registerTool(
    {
      name: "kairos_experience",
      label: "Kairos Experience",
      description: "Save an experience/learning to KAIROS-EVO memory.",
      parameters: {
        type: "object",
        properties: {
          experience: {
            type: "string",
            description: "The experience to save",
          },
          emotional_tone: {
            type: "string",
            description: "neutral, positive, negative, mixed",
          },
          what_learned: {
            type: "string",
          },
          importance: {
            type: "number",
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["experience"],
      },
      async execute(_toolCallId, params) {
        const body = params as {
          experience: string;
          emotional_tone?: string;
          what_learned?: string;
          importance?: number;
          tags?: string[];
        };
        const result = await bridgeFetch(baseUrl, apiKey, "/experience", {
          ...body,
          emotional_tone: body.emotional_tone ?? "neutral",
          importance: body.importance ?? 5,
          tags: body.tags ?? [],
        });
        if (!result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Kairos experience failed: ${result.error ?? "unknown"}`,
              },
            ],
            details: {},
          };
        }
        const data = result.data as { message?: string } | undefined;
        return {
          content: [
            { type: "text" as const, text: data?.message ?? "Experience saved to Kairos." },
          ],
          details: {},
        };
      },
    },
    { name: "kairos_experience" },
  );

  api.registerTool(
    {
      name: "mcp_discover",
      label: "MCP Discover",
      description:
        "List all MCP tools and apps from KAIROS-EVO: ~80 native tools + 500+ catalog tools (Slack, Gmail, Notion, etc.). Use first to see available tool_id and apps before calling mcp_execute.",
      parameters: {
        type: "object",
        properties: {},
      },
      async execute(_toolCallId) {
        const result = await gatewayGet(baseUrl, apiKey, "/tools/discovery");
        if (!result.success) {
          const errMsg = errorToReadableString(result.error ?? "unknown");
          return {
            content: [{ type: "text" as const, text: `MCP discover failed: ${errMsg}` }],
            details: {},
          };
        }
        const data = result.data as {
          native?: { kai_tools?: string[]; mcp_tools?: string[]; other_tools?: string[] };
          mcp_catalog?: Record<
            string,
            Array<{ tool_id: string; name: string; description?: string; risk_level?: string }>
          >;
          summary?: { native_total?: number; mcp_total?: number; categories_count?: number };
        };
        const native = data?.native ?? {};
        const kai = (native.kai_tools ?? []).join(", ");
        const mcp = (native.mcp_tools ?? []).join(", ");
        const other = (native.other_tools ?? []).join(", ");
        const catalog = data?.mcp_catalog ?? {};
        const byApp = Object.entries(catalog)
          .map(
            ([app, tools]) =>
              `${app} (${tools.length}): ${tools
                .slice(0, 5)
                .map((t) => t.tool_id)
                .join(", ")}${tools.length > 5 ? "…" : ""}`,
          )
          .join("\n");
        const summary = data?.summary ?? {};
        const text = [
          `Native: kai_tools=[${kai}], mcp_tools=[${mcp}], other=[${other}].`,
          `Summary: native_total=${summary.native_total ?? 0}, mcp_total=${summary.mcp_total ?? 0}, categories=${summary.categories_count ?? 0}.`,
          "Catalog by app:\n" + byApp,
          "Use mcp_execute(tool_id, parameters) to run any tool_id from the list above.",
        ].join("\n");
        return {
          content: [{ type: "text" as const, text }],
          details: { native: data?.native, mcp_catalog: data?.mcp_catalog },
        };
      },
    },
    { name: "mcp_discover" },
  );

  api.registerTool(
    {
      name: "mcp_execute",
      label: "MCP Execute",
      description:
        "Execute any MCP tool by tool_id (from mcp_discover). Examples: slack.chat_postMessage, gmail.users_messages_send, monday.list_boards, kai_think, kai_recall. Pass parameters as a JSON object.",
      parameters: {
        type: "object",
        properties: {
          tool_id: {
            type: "string",
            description:
              "Tool ID (e.g. slack.chat_postMessage, gmail.users_messages_send, kai_recall)",
          },
          parameters: {
            type: "object",
            description: "Parameters for the tool (object; keys depend on the tool)",
          },
        },
        required: ["tool_id"],
      },
      async execute(_toolCallId, params) {
        const { tool_id, parameters = {} } = params as {
          tool_id: string;
          parameters?: Record<string, unknown>;
        };
        const result = await gatewayPost(baseUrl, apiKey, "/tools/execute", {
          tool_id,
          parameters,
        });
        if (!result.success) {
          const errMsg = errorToReadableString(result.error ?? "unknown");
          return {
            content: [{ type: "text" as const, text: `MCP execute failed: ${errMsg}` }],
            details: {},
          };
        }
        const data = result.data as {
          result?: unknown;
          output?: string;
          success?: boolean;
          tool_id?: string;
          tool_type?: string;
        };
        const toolResult = data?.result ?? data?.output ?? {};
        const output =
          typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult, null, 2);
        return {
          content: [{ type: "text" as const, text: output }],
          details: toolResult,
        };
      },
    },
    { name: "mcp_execute" },
  );

  // Register session management tool
  // === AACT DIRECT TOOLS ===
  const aactUrl = getAactUrl();

  api.registerTool(
    {
      name: "aact_discover",
      label: "AACT Discover",
      description:
        "List AACT apps and tools. Call without appId to see all available apps (monday, gmail, notion, kairos-evo, kairos-evo_memory, slack, etc.). Pass appId to see the tools of a specific app with their toolId. Use toolIds with aact_execute.",
      parameters: {
        type: "object",
        properties: {
          appId: {
            type: "string",
            description:
              "App ID to list its tools (e.g. 'monday', 'gmail', 'notion', 'kairos-evo', 'kairos-evo_memory'). Omit to list all apps.",
          },
        },
      },
      async execute(_toolCallId, params) {
        const { appId } = params as { appId?: string };
        if (appId) {
          const result = await aactGet(aactUrl, `/api/apps/${encodeURIComponent(appId)}/tools`);
          if (!result.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `AACT discover tools failed for '${appId}': ${result.error ?? "unknown"}`,
                },
              ],
              details: {},
            };
          }
          const data = result.data as
            | {
                appId?: string;
                appName?: string;
                tools?: Array<{ id: string; name: string; description?: string }>;
              }
            | undefined;
          const tools = data?.tools ?? [];
          const lines = tools.map(
            (t) =>
              `  - toolId: "${appId}.${t.id}"  →  ${t.name}${t.description ? `: ${t.description}` : ""}`,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `AACT app '${data?.appName ?? appId}' has ${tools.length} tools:\n${lines.join("\n")}\n\nUse aact_execute(toolId, parameters) to run any tool.`,
              },
            ],
            details: { appId, tools: data?.tools },
          };
        } else {
          const result = await aactGet(aactUrl, "/api/apps");
          if (!result.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `AACT discover apps failed: ${result.error ?? "unknown"}`,
                },
              ],
              details: {},
            };
          }
          const data = result.data as
            | {
                apps?: Array<{
                  id: string;
                  name: string;
                  description?: string;
                  toolsCount?: number;
                  category?: string;
                }>;
              }
            | undefined;
          const apps = data?.apps ?? [];
          const lines = apps.map(
            (a) =>
              `  - appId: "${a.id}"  (${a.toolsCount ?? 0} tools)  ${a.name}${a.description ? ` — ${a.description}` : ""}`,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `AACT has ${apps.length} apps available:\n${lines.join("\n")}\n\nCall aact_discover(appId) to see tools of a specific app.`,
              },
            ],
            details: { apps: data?.apps },
          };
        }
      },
    },
    { name: "aact_discover" },
  );

  api.registerTool(
    {
      name: "aact_recommend",
      label: "AACT Recommend",
      description:
        "Find the right AACT tool by describing what you want to do in natural language. Returns tool IDs ready to use with aact_execute.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "What you want to do (e.g. 'send an email', 'create a Monday task', 'save memory episode', 'search Notion database')",
          },
        },
        required: ["query"],
      },
      async execute(_toolCallId, params) {
        const { query } = params as { query: string };
        const result = await aactPost(aactUrl, "/api/recommend", { query });
        if (!result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `AACT recommend failed: ${result.error ?? "unknown"}`,
              },
            ],
            details: {},
          };
        }
        const data = result.data as
          | {
              recommendations?: Array<{
                toolId: string;
                toolName: string;
                confidence: number;
                description?: string;
                reasoning?: string;
              }>;
              context?: { intentType?: string; domain?: string };
            }
          | undefined;
        const recs = data?.recommendations ?? [];
        if (recs.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No AACT tools found for: "${query}"` }],
            details: {},
          };
        }
        const lines = recs.map(
          (r, i) =>
            `${i + 1}. toolId: "${r.toolId}"  (confidence: ${(r.confidence * 100).toFixed(0)}%)\n   ${r.toolName}${r.description ? `: ${r.description}` : ""}${r.reasoning ? `\n   Reason: ${r.reasoning}` : ""}`,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `AACT tool recommendations for "${query}":\n\n${lines.join("\n\n")}\n\nUse aact_execute(toolId, parameters) to run the chosen tool.`,
            },
          ],
          details: { recommendations: data?.recommendations, context: data?.context },
        };
      },
    },
    { name: "aact_recommend" },
  );

  api.registerTool(
    {
      name: "aact_execute",
      label: "AACT Execute",
      description:
        "Execute any AACT tool directly (bypasses MCP Gateway). Use toolId from aact_discover or aact_recommend. Format: 'appId.toolName' (e.g. 'monday.list_boards', 'kairos-evo.kai_think', 'kairos-evo_memory.memory_episode_create', 'gmail.users_messages_send', 'notion.search').",
      parameters: {
        type: "object",
        properties: {
          toolId: {
            type: "string",
            description:
              "Tool ID in format appId.toolName (e.g. 'monday.list_boards', 'kairos-evo.kai_recall')",
          },
          parameters: {
            type: "object",
            description:
              "Parameters for the tool (keys depend on the tool — use aact_discover to see schema)",
          },
        },
        required: ["toolId"],
      },
      async execute(_toolCallId, params) {
        const { toolId, parameters: toolParams = {} } = params as {
          toolId: string;
          parameters?: Record<string, unknown>;
        };
        const result = await aactPost(aactUrl, "/api/execute", { toolId, parameters: toolParams });
        if (!result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `AACT execute failed for '${toolId}': ${result.error ?? "unknown"}`,
              },
            ],
            details: { toolId },
          };
        }
        const data = result.data as
          | {
              success?: boolean;
              toolId?: string;
              data?: unknown;
              result?: unknown;
              error?: string;
              executionTime?: number;
            }
          | undefined;
        if (data?.success === false) {
          return {
            content: [
              {
                type: "text" as const,
                text: `AACT tool '${toolId}' returned error: ${data.error ?? "unknown"}`,
              },
            ],
            details: data,
          };
        }
        const toolResult = data?.data ?? data?.result ?? data ?? {};
        const output =
          typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult, null, 2);
        return {
          content: [{ type: "text" as const, text: output }],
          details: { toolId, result: toolResult, executionTime: data?.executionTime },
        };
      },
    },
    { name: "aact_execute" },
  );

  api.registerTool(
    {
      name: "kairos_session_status",
      label: "Kairos Session Status",
      description:
        "Check session status: active sessions, interaction counts, and limits. Use to monitor session health.",
      parameters: {
        type: "object",
        properties: {},
      },
      async execute(_toolCallId) {
        const stats = sessionManager.getStats();
        return {
          content: [
            {
              type: "text" as const,
              text: `Session Status: ${stats.activeSessions} active sessions, ${stats.totalInteractions} total interactions. Max per session: 50, Timeout: 30min.`,
            },
          ],
          details: stats,
        };
      },
    },
    { name: "kairos_session_status" },
  );
}
