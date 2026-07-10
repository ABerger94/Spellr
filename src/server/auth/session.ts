import { getServerSession } from 'next-auth';
import { authOptions } from './authOptions';

export async function requireSession() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  return { userId, session };
}
