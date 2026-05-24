import { z } from 'zod';

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),
    NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL').optional(),
    STRAVA_CLIENT_ID: z.string().min(1, 'STRAVA_CLIENT_ID is required'),
    STRAVA_CLIENT_SECRET: z.string().min(1, 'STRAVA_CLIENT_SECRET is required'),
    ADMIN_EMAILS: z.string().optional(),
    STRAVA_SYNC_COOLDOWN_MINUTES: z.coerce
      .number()
      .int()
      .positive('STRAVA_SYNC_COOLDOWN_MINUTES must be a positive integer')
      .default(5),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.NEXTAUTH_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NEXTAUTH_URL'],
        message: 'NEXTAUTH_URL is required in production',
      });
    }
  });

export const env = serverEnvSchema.parse(process.env);

const adminEmails = new Set(
  (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

export const isAdminEmail = (email?: string | null) => {
  if (!email) return false;
  if (adminEmails.size === 0) return false;
  return adminEmails.has(email.toLowerCase());
};
