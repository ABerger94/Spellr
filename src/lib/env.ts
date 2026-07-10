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
