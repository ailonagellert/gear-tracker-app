import { type GetServerSidePropsContext } from 'next';
import { getServerSession, type NextAuthOptions, type DefaultSession } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import StravaProvider from 'next-auth/providers/strava';
import { prisma } from '@/lib/prisma';
import { type Adapter } from 'next-auth/adapters';
import { env } from '@/env';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: DefaultSession['user'] & {
      id: string;
      stravaId?: string;
    };
  }

  interface User {
    stravaId?: string;
  }
}

export const authOptions: NextAuthOptions = {
  secret: env.NEXTAUTH_SECRET,
  callbacks: {
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
        stravaId: user.stravaId,
      },
    }),
    signIn: async ({ account }) => {
      // Explicitly allow only Strava OAuth for now.
      return account?.provider === 'strava';
    },
  },
  events: {
    linkAccount: async ({ user, account }) => {
      if (account.provider !== 'strava') return;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          stravaId: account.providerAccountId,
        },
      });
    },
  },
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    StravaProvider({
      clientId: env.STRAVA_CLIENT_ID,
      clientSecret: env.STRAVA_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'read,activity:read_all',
        },
      },
    }),
  ],
};

export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext['req'];
  res: GetServerSidePropsContext['res'];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};
