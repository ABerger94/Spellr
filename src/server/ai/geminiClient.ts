import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration, type Schema, type GenerateContentResult } from '@google/generative-ai';
import { env } from '@/lib/env';
import { AI_ACTIONS, AI_SYSTEM_INSTRUCTION, type PlainParamSchema } from './aiTools';
import type { AITurnDriver, AITurnStep } from './aiDriver';

const PLAIN_TYPE_TO_SCHEMA_TYPE: Record<PlainParamSchema['type'], SchemaType> = {
  object: SchemaType.OBJECT,
  string: SchemaType.STRING,
  integer: SchemaType.INTEGER,
};

function toGeminiSchema(schema: PlainParamSchema): Schema {
  const base: Schema = { type: PLAIN_TYPE_TO_SCHEMA_TYPE[schema.type] };
  if ('description' in schema && schema.description) base.description = schema.description;
  if (schema.type === 'string' && schema.enum) {
    base.format = 'enum';
    base.enum = schema.enum;
  }
  if (schema.type === 'object') {
    base.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)]));
    if (schema.required) base.required = schema.required;
  }
  return base;
}

const AI_FUNCTION_DECLARATIONS: FunctionDeclaration[] = AI_ACTIONS.map((action) => ({
  name: action.name,
  description: action.description,
  parameters: toGeminiSchema(action.parameters) as FunctionDeclaration['parameters'],
}));

function getModel() {
  if (!env.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  const client = new GoogleGenerativeAI(env.geminiApiKey);
  return client.getGenerativeModel({
    model: env.geminiModel,
    systemInstruction: AI_SYSTEM_INSTRUCTION,
    tools: [{ functionDeclarations: AI_FUNCTION_DECLARATIONS }],
  });
}

function toStep(result: GenerateContentResult): AITurnStep {
  const response = result.response;
  const reasoningText = response.text().trim();
  const calls = response.functionCalls();
  const call = calls && calls.length > 0 ? calls[0] : null;
  return {
    reasoningText,
    // Gemini keys function responses by name, not a call id, so the name
    // doubles as the id here — sendToolResult below ignores the id anyway.
    toolCall: call ? { id: call.name, name: call.name, args: (call.args as Record<string, unknown>) ?? {} } : null,
  };
}

export function createGeminiDriver(): AITurnDriver {
  const model = getModel();
  const chat = model.startChat();

  return {
    async sendInitial(prompt) {
      return toStep(await chat.sendMessage(prompt));
    },
    async sendToolResult(_toolCallId, toolName, result) {
      return toStep(await chat.sendMessage([{ functionResponse: { name: toolName, response: result } }]));
    },
  };
}
