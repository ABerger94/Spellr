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
  get port(): number {
    return Number(process.env.PORT) || 3000;
  },
};
