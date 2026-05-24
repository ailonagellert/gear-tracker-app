import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/server/auth';
import { prisma } from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  await prisma.$transaction([
    prisma.account.deleteMany({
      where: {
        userId: session.user.id,
        provider: 'strava',
      },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        stravaId: null,
      },
    }),
  ]);

  return res.status(200).json({ message: 'Strava disconnected' });
}
