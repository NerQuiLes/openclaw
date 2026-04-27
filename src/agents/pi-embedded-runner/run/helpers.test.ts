import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { resolveFinalAssistantRawText, resolveFinalAssistantVisibleText } from "./helpers.js";

function makeAssistantMessage(
  content: AssistantMessage["content"],
  phase?: string,
): AssistantMessage {
  return {
    api: "responses",
    provider: "openai",
    model: "gpt-5.4",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    role: "assistant",
    content,
    timestamp: Date.now(),
    stopReason: "stop",
    ...(phase ? { phase } : {}),
  };
}

describe("resolveFinalAssistantVisibleText", () => {
  it("prefers final_answer text over commentary blocks", () => {
    const lastAssistant = makeAssistantMessage([
      {
        type: "text",
        text: "Working...",
        textSignature: JSON.stringify({ v: 1, id: "item_commentary", phase: "commentary" }),
      },
      {
        type: "text",
        text: "Section 1\nSection 2",
        textSignature: JSON.stringify({ v: 1, id: "item_final", phase: "final_answer" }),
      },
    ]);

    expect(resolveFinalAssistantVisibleText(lastAssistant)).toBe("Section 1\nSection 2");
  });

  it("returns undefined when the final visible text is empty", () => {
    const lastAssistant = makeAssistantMessage([
      {
        type: "text",
        text: "Working...",
        textSignature: JSON.stringify({ v: 1, id: "item_commentary", phase: "commentary" }),
      },
      {
        type: "text",
        text: "   ",
        textSignature: JSON.stringify({ v: 1, id: "item_final", phase: "final_answer" }),
      },
    ]);

    expect(resolveFinalAssistantVisibleText(lastAssistant)).toBeUndefined();
  });

  it("returns HEARTBEAT_OK when the final marker is reasoning-only", () => {
    const lastAssistant = makeAssistantMessage([
      {
        type: "thinking",
        thinking: "HeARTBEAT_OK",
      },
    ]);

    expect(resolveFinalAssistantVisibleText(lastAssistant)).toBe("HEARTBEAT_OK");
  });

  it("does not expose arbitrary reasoning-only content", () => {
    const lastAssistant = makeAssistantMessage([
      {
        type: "thinking",
        thinking: "internal reasoning",
      },
    ]);

    expect(resolveFinalAssistantVisibleText(lastAssistant)).toBeUndefined();
  });

  it("preserves raw final answer text without visible-text sanitization", () => {
    const lastAssistant = makeAssistantMessage([
      {
        type: "text",
        text: "<final>keep this</final>",
        textSignature: JSON.stringify({ v: 1, id: "item_final", phase: "final_answer" }),
      },
    ]);

    expect(resolveFinalAssistantRawText(lastAssistant)).toBe("<final>keep this</final>");
  });
});
