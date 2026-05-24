import { prisma } from '@/lib/prisma';
import { env } from '@/env';

type StravaActivity = {
  id: number;
  name: string;
  type?: string;
  sport_type?: string;
  distance: number;
  moving_time: number;
  total_elevation_gain?: number;
  start_date: string;
  timezone?: string;
  location_city?: string;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  workout_type?: number;
  suffer_score?: number;
  gear_id?: string | null;
};

const STRAVA_OAUTH_URL = 'https://www.strava.com/oauth/token';
const STRAVA_ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities';
const STRAVA_GEAR_URL = 'https://www.strava.com/api/v3/gear';

export async function refreshStravaToken(userId: string, refreshToken: string) {
  const response = await fetch(STRAVA_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Strava token (${response.status})`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  await prisma.account.updateMany({
    where: { userId, provider: 'strava' },
    data: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    },
  });

  return data.access_token;
}

export async function getValidStravaAccessTokenForUser(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'strava' },
    select: {
      userId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account?.access_token || !account.refresh_token) {
    throw new Error('Strava is not connected for this user');
  }

  let accessToken = account.access_token;
  const expiresSoon = account.expires_at
    ? account.expires_at * 1000 < Date.now() + 5 * 60 * 1000
    : false;

  if (expiresSoon) {
    accessToken = await refreshStravaToken(account.userId, account.refresh_token);
  }

  return { accessToken, refreshToken: account.refresh_token };
}

export async function fetchStravaActivitiesForUser(userId: string, limit = 100) {
  const tokenState = await getValidStravaAccessTokenForUser(userId);
  let accessToken = tokenState.accessToken;

  const cappedLimit = Math.min(Math.max(limit, 1), 1000);
  const perPage = Math.min(cappedLimit, 200);
  const activities: StravaActivity[] = [];
  let page = 1;

  while (activities.length < cappedLimit) {
    let response = await fetch(
      `${STRAVA_ACTIVITIES_URL}?page=${page}&per_page=${perPage}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.status === 401) {
      accessToken = await refreshStravaToken(userId, tokenState.refreshToken);
      response = await fetch(
        `${STRAVA_ACTIVITIES_URL}?page=${page}&per_page=${perPage}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch Strava activities (${response.status})`);
    }

    const pageActivities = (await response.json()) as StravaActivity[];
    activities.push(...pageActivities);

    if (pageActivities.length < perPage) {
      break;
    }

    page += 1;
  }

  return activities.slice(0, cappedLimit);
}

export async function fetchStravaGear(accessToken: string, gearId: string) {
  const response = await fetch(`${STRAVA_GEAR_URL}/${gearId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    id: string;
    name?: string;
    brand_name?: string;
    model_name?: string;
  };

  return data;
}
