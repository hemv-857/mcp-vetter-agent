/**
 * TrueForge Agent API client.
 *
 * Creates sessions, sends turns, and streams events from the TrueForge agent.
 * The agent orchestrates the audit using the probe server's MCP tools.
 */

const TRUEFORGE_URL = "/trueforge";
const AGENT_NAME = "tf"; // matches the agent we created

export interface TrueForgeEvent {
  type: string;
  id?: string;
  turn_id?: string;
  thread_id?: string | null;
  state?: { status: string; message?: string };
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
    tool_info?: { type: string; name: string };
  }>;
  [key: string]: unknown;
}

export interface TrueForgeSession {
  id: string;
  agent: { type: string; id: string; name: string };
}

export interface TrueForgeTurn {
  id: string;
  state: { status: string };
}

/** Create a new session with the agent. */
export async function createSession(): Promise<TrueForgeSession> {
  const res = await fetch(`${TRUEFORGE_URL}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: { name: AGENT_NAME } }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  const data = await res.json();
  return data.data;
}

/** Send a user message and stream events back. */
export async function* streamTurn(
  sessionId: string,
  message: string,
  signal?: AbortSignal,
): AsyncGenerator<TrueForgeEvent> {
  const res = await fetch(`${TRUEFORGE_URL}/api/v1/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      input: [{ type: "user.message", content: message }],
    }),
    signal,
  });

  if (!res.ok) throw new Error(`Turn failed: ${res.status}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr) as TrueForgeEvent;
            yield event;
          } catch {
            // skip malformed events
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.startsWith("data: ")) {
      const jsonStr = buffer.slice(6).trim();
      if (jsonStr) {
        try {
          const event = JSON.parse(jsonStr) as TrueForgeEvent;
          yield event;
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Approve a tool call that requires approval. */
export async function approveToolCall(
  sessionId: string,
  turnId: string,
  toolCallId: string,
  threadId: string,
): Promise<void> {
  const res = await fetch(`${TRUEFORGE_URL}/api/v1/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      previous_turn_id: turnId,
      input: [{
        type: "user.tool_approval",
        thread_id: threadId,
        tool_call_id: toolCallId,
        approval: { status: "allow" },
      }],
    }),
  });
  if (!res.ok) throw new Error(`Approval failed: ${res.status}`);
}

/** Decline a tool call that requires approval. */
export async function declineToolCall(
  sessionId: string,
  turnId: string,
  toolCallId: string,
  threadId: string,
): Promise<void> {
  const res = await fetch(`${TRUEFORGE_URL}/api/v1/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      previous_turn_id: turnId,
      input: [{
        type: "user.tool_approval",
        thread_id: threadId,
        tool_call_id: toolCallId,
        approval: { status: "deny" },
      }],
    }),
  });
  if (!res.ok) throw new Error(`Decline failed: ${res.status}`);
}

/** Check if TrueForge is reachable. */
export async function checkTrueForgeHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${TRUEFORGE_URL}/api/v1/agents`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
