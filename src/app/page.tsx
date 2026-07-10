import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/server/auth/authOptions';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  redirect(session?.user ? '/lobby' : '/login');
}
