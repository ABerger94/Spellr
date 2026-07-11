function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get nextAuthSecret() {
    return required('NEXTAUTH_SECRET');
  },
  get geminiApiKey(): string | undefined {
    return process.env.GEMINI_API_KEY || undefined;
  },
  get geminiModel(): string {
    return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  },
  get groqApiKey(): string | undefined {
    return process.env.GROQ_API_KEY || undefined;
  },
  get groqModel(): string {
    return process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  },
  get cerebrasApiKey(): string | undefined {
    return process.env.CEREBRAS_API_KEY || undefined;
  },
  get cerebrasModel(): string {
    return process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
  },
  get openRouterApiKey(): string | undefined {
    return process.env.OPENROUTER_API_KEY || undefined;
  },
  get openRouterModel(): string {
    // "openrouter/free" auto-routes to whichever free model is currently
    // available and supports tool calling, so it doesn't rot as OpenRouter's
    // free model lineup changes.
    return process.env.OPENROUTER_MODEL || 'openrouter/free';
  },
  get pusherAppId() {
    return required('PUSHER_APP_ID');
  },
  get pusherKey() {
    return required('NEXT_PUBLIC_PUSHER_KEY');
  },
  get pusherSecret() {
    return required('PUSHER_SECRET');
  },
  get pusherCluster() {
    return required('NEXT_PUBLIC_PUSHER_CLUSTER');
  },
};
