import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Health } from "../types";

/**
 * The MCP SDK is by far the heaviest thing this app depends on and nothing can
 * be audited before the shell is on screen, so it is fetched on first connect
 * rather than bundled into the entry chunk. /health uses plain fetch, which
 * means the connection indicator works before the SDK has landed.
 */
async function loadSdk() {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
  ]);
  return { Client, StreamableHTTPClientTransport };
}

const SERVER_ORIGIN = import.meta.env.VITE_PROBE_ORIGIN ?? "http://127.0.0.1:8000";
export const SERVER_URL = `${SERVER_ORIGIN}/mcp`;
export const HEALTH_URL = `${SERVER_ORIGIN}/health`;
/** The port this console is actually pointed at, so recovery advice matches reality. */
export const SERVER_PORT = (() => {
  try {
    return new URL(SERVER_ORIGIN).port || "8000";
  } catch {
    return "8000";
  }
})();

let client: Client | null = null;
let connecting: Promise<Client> | null = null;

/** Tool call failed at the transport or the tool returned an `error` key. */
export class ToolError extends Error {
  readonly payload: Record<string, unknown>;
  constructor(message: string, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = "ToolError";
    this.payload = payload;
  }
}

async function open(): Promise<Client> {
  const { Client, StreamableHTTPClientTransport } = await loadSdk();
  const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL));
  const next = new Client({ name: "mcp-vetting-console", version: "1.0.0" });
  next.onclose = () => {
    if (client === next) client = null;
  };
  await next.connect(transport);
  return next;
}

/** Connect, with three attempts and exponential backoff, deduped across callers. */
export async function connect(): Promise<Client> {
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        client = await open();
        return client;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("could not reach the probe server");
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export function disconnect(): void {
  client?.close().catch(() => {});
  client = null;
}

export async function checkHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch(HEALTH_URL, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`health check failed: ${response.status}`);
  const data = (await response.json()) as Record<string, unknown>;
  return {
    status: typeof data.status === "string" ? data.status : "unknown",
    dockerAvailable: data.docker_available === true,
    devFixtures: data.dev_fixtures === true,
    githubConfigured: data.github_configured === true,
  };
}

/**
 * Every tool returns a JSON object serialised into the first text content
 * block. Errors are values inside that object, not thrown — so unwrap both
 * layers here and let callers deal in one shape.
 */
export async function callTool<T extends Record<string, unknown>>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const active = await connect();

  let result;
  try {
    result = await active.callTool({ name, arguments: args });
  } catch (error) {
    client = null; // force a fresh session on the next call
    throw new ToolError(
      error instanceof Error ? error.message : `${name} failed at the transport`,
    );
  }

  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.find(
    (block): block is { type: "text"; text: string } =>
      typeof block === "object" &&
      block !== null &&
      (block as { type?: unknown }).type === "text",
  )?.text;

  if (typeof text !== "string") {
    throw new ToolError(`${name} returned no readable content`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ToolError(`${name} returned malformed JSON`, { raw: text.slice(0, 500) });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ToolError(`${name} returned an unexpected payload`);
  }

  const payload = parsed as Record<string, unknown>;
  if (typeof payload.error === "string") {
    throw new ToolError(payload.error, payload);
  }
  return payload as T;
}
