/** One model response: optional reasoning text plus at most one requested action. */
export interface AITurnStep {
  reasoningText: string;
  toolCall: { id: string; name: string; args: Record<string, unknown> } | null;
}

/** Provider-agnostic conversation handle for a single AI turn — geminiClient.ts
 * and groqClient.ts each implement this over their own SDK's chat/session
 * object, so aiController.ts's turn-taking loop never has to know which
 * provider it's talking to. */
export interface AITurnDriver {
  sendInitial(prompt: string): Promise<AITurnStep>;
  sendToolResult(toolCallId: string, toolName: string, result: Record<string, unknown>): Promise<AITurnStep>;
}
