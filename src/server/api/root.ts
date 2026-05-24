import { createTRPCRouter } from '@/server/api/trpc';
import { bikeRouter } from '@/server/api/routers/bike';

export const appRouter = createTRPCRouter({
  bike: bikeRouter,
});

export type AppRouter = typeof appRouter;
