import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/server/auth';
import { prisma } from '@/lib/prisma';
import {
  fetchStravaActivitiesForUser,
  fetchStravaGear,
  getValidStravaAccessTokenForUser,
} from '@/server/strava';
import { env } from '@/env';
import { BikeType, ComponentType } from '../../../../prisma/generated/client';

type StravaLikeActivity = {
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

const DEFAULT_COMPONENTS = [
  { name: 'Chain', type: ComponentType.CHAIN, maintenanceInterval: 3000 },
  { name: 'Cassette', type: ComponentType.CASSETTE, maintenanceInterval: 5000 },
  { name: 'Brake Pads (Front)', type: ComponentType.BRAKE_PADS, maintenanceInterval: 2000 },
  { name: 'Brake Pads (Rear)', type: ComponentType.BRAKE_PADS, maintenanceInterval: 2000 },
  { name: 'Front Tire', type: ComponentType.TIRES, maintenanceInterval: 8000 },
  { name: 'Rear Tire', type: ComponentType.TIRES, maintenanceInterval: 8000 },
];

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: safeConcurrency }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) break;
        results[index] = await worker(items[index] as T);
      }
    })
  );

  return results;
}

const toActivityPayload = (incoming: StravaLikeActivity, bikeId: string | null) => ({
  bikeId,
  name: incoming.name,
  type: incoming.sport_type ?? incoming.type ?? null,
  distance: incoming.distance,
  movingTime: incoming.moving_time,
  totalElevationGain: incoming.total_elevation_gain ?? null,
  startDate: new Date(incoming.start_date),
  timezone: incoming.timezone ?? null,
  location: incoming.location_city ?? null,
  averageSpeed: incoming.average_speed ?? null,
  maxSpeed: incoming.max_speed ?? null,
  averageHeartrate: incoming.average_heartrate ?? null,
  maxHeartrate: incoming.max_heartrate ?? null,
  averageCadence: incoming.average_cadence ?? null,
  averageWatts: incoming.average_watts ?? null,
  weightedAverageWatts: incoming.weighted_average_watts ?? null,
  workoutType: incoming.workout_type ?? null,
  sufferScore: incoming.suffer_score ?? null,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userId = session.user.id;

  const cooldownMs = env.STRAVA_SYNC_COOLDOWN_MINUTES * 60 * 1000;
  const claimedSyncAt = new Date();
  const syncLockExpiresAt = new Date(claimedSyncAt.getTime() + 30 * 60 * 1000);
  const cooldownThreshold = new Date(Date.now() - cooldownMs);
  const claimResult = await prisma.user.updateMany({
    where: {
      id: userId,
      AND: [
        {
          OR: [
            { syncLockExpiresAt: null },
            { syncLockExpiresAt: { lt: claimedSyncAt } },
          ],
        },
        {
          OR: [
            { lastSyncAt: null },
            { lastSyncAt: { lt: cooldownThreshold } },
          ],
        },
      ],
    },
    data: {
      lastSyncAt: claimedSyncAt,
      syncLockExpiresAt,
    },
  });

  if (claimResult.count === 0) {
    const userSyncState = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastSyncAt: true, syncLockExpiresAt: true },
    });

    if (!userSyncState) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (userSyncState.syncLockExpiresAt && userSyncState.syncLockExpiresAt > claimedSyncAt) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((userSyncState.syncLockExpiresAt.getTime() - Date.now()) / 1000)
      );
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      return res.status(429).json({
        message: 'A Strava sync is already in progress. Please wait before trying again.',
        retryAfterSeconds,
      });
    }

    const elapsedMs = userSyncState?.lastSyncAt
      ? Date.now() - userSyncState.lastSyncAt.getTime()
      : 0;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((cooldownMs - elapsedMs) / 1000)
    );
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    return res.status(429).json({
      message: `Please wait before syncing again (${env.STRAVA_SYNC_COOLDOWN_MINUTES} min cooldown).`,
      retryAfterSeconds,
    });
  }

  try {
    const fetchedActivities = await fetchStravaActivitiesForUser(userId, 800);

    const cyclingSportTypes = new Set([
      'Ride',
      'MountainBikeRide',
      'GravelRide',
      'EBikeRide',
      'EMountainBikeRide',
      'VirtualRide',
    ]);

    const activities = fetchedActivities.filter((activity) => {
      const sport = activity.sport_type ?? activity.type ?? '';
      return cyclingSportTypes.has(sport);
    }) as StravaLikeActivity[];

    const userDefaults = await prisma.userSettings.findUnique({
      where: { userId },
      select: {
        defaultRideBikeId: true,
        defaultMountainBikeRideBikeId: true,
        defaultGravelRideBikeId: true,
        defaultEBikeRideBikeId: true,
        defaultEMountainBikeRideBikeId: true,
        defaultVirtualRideBikeId: true,
      },
    });

    const defaultBikeIdBySport = {
      Ride: userDefaults?.defaultRideBikeId ?? null,
      MountainBikeRide: userDefaults?.defaultMountainBikeRideBikeId ?? null,
      GravelRide: userDefaults?.defaultGravelRideBikeId ?? null,
      EBikeRide: userDefaults?.defaultEBikeRideBikeId ?? null,
      EMountainBikeRide: userDefaults?.defaultEMountainBikeRideBikeId ?? null,
      VirtualRide: userDefaults?.defaultVirtualRideBikeId ?? null,
    } as const;

    const validDefaultBikeIds = new Set<string>();
    const configuredDefaultBikeIds = Array.from(
      new Set(Object.values(defaultBikeIdBySport).filter((id): id is string => Boolean(id)))
    );

    if (configuredDefaultBikeIds.length > 0) {
      const defaultsFound = await prisma.bike.findMany({
        where: {
          userId,
          id: { in: configuredDefaultBikeIds },
        },
        select: { id: true },
      });
      for (const bike of defaultsFound) validDefaultBikeIds.add(bike.id);
    }

    const gearIds = Array.from(
      new Set(
        activities
          .map((activity) => activity.gear_id)
          .filter((gearId): gearId is string => Boolean(gearId))
      )
    );

    const existingBikes = await prisma.bike.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        brand: true,
        model: true,
        stravaGearId: true,
      },
    });

    const bikesByGearId = new Map<string, { id: string; name: string }>();
    for (const bike of existingBikes) {
      if (bike.stravaGearId) {
        bikesByGearId.set(bike.stravaGearId, { id: bike.id, name: bike.name });
      }
    }

    let bikesCreated = 0;
    let bikesRenamed = 0;

    const { accessToken } = await getValidStravaAccessTokenForUser(userId);

    const gearDetailRows = await mapWithConcurrency(gearIds, 5, async (gearId) => {
      const details = await fetchStravaGear(accessToken, gearId);
      return { gearId, details };
    });
    const gearDetailsById = new Map(gearDetailRows.map((row) => [row.gearId, row.details] as const));

    for (const gearId of gearIds) {
      const existing = bikesByGearId.get(gearId);
      const details = gearDetailsById.get(gearId) ?? null;
      const bikeName = details?.name ?? `Strava Bike ${gearId.slice(0, 6)}`;

      if (!existing) {
        const createdBike = await prisma.bike.create({
          data: {
            userId,
            name: bikeName,
            brand: details?.brand_name ?? undefined,
            model: details?.model_name ?? undefined,
            type: BikeType.OTHER,
            stravaGearId: gearId,
            isTracking: true,
          },
        });

        await prisma.component.createMany({
          data: DEFAULT_COMPONENTS.map((component) => ({
            bikeId: createdBike.id,
            ...component,
          })),
        });

        bikesByGearId.set(gearId, { id: createdBike.id, name: createdBike.name });
        bikesCreated += 1;
        continue;
      }

      if (existing.name.startsWith('Strava Bike') && bikeName !== existing.name) {
        await prisma.bike.update({
          where: { id: existing.id },
          data: {
            name: bikeName,
            brand: details?.brand_name ?? undefined,
            model: details?.model_name ?? undefined,
          },
        });

        bikesByGearId.set(gearId, { id: existing.id, name: bikeName });
        bikesRenamed += 1;
      }
    }

    const incomingStravaIds = Array.from(new Set(activities.map((activity) => String(activity.id))));
    const existingActivities = incomingStravaIds.length
      ? await prisma.activity.findMany({
          where: {
            userId,
            stravaId: { in: incomingStravaIds },
          },
          select: {
            id: true,
            stravaId: true,
            bikeId: true,
          },
        })
      : [];

    const existingByStravaId = new Map(existingActivities.map((row) => [row.stravaId ?? '', row] as const));

    const touchedBikeIds = new Set<string>();
    const createData: Array<{
      userId: string;
      bikeId: string | null;
      stravaId: string;
      name: string;
      type: string | null;
      distance: number;
      movingTime: number;
      totalElevationGain: number | null;
      startDate: Date;
      timezone: string | null;
      location: string | null;
      averageSpeed: number | null;
      maxSpeed: number | null;
      averageHeartrate: number | null;
      maxHeartrate: number | null;
      averageCadence: number | null;
      averageWatts: number | null;
      weightedAverageWatts: number | null;
      workoutType: number | null;
      sufferScore: number | null;
    }> = [];
    const updateData: Array<{ id: string; data: ReturnType<typeof toActivityPayload> }> = [];

    for (const incoming of activities) {
      const stravaId = String(incoming.id);
      const sportType = incoming.sport_type ?? incoming.type ?? 'Ride';

      const defaultBikeId = defaultBikeIdBySport[sportType as keyof typeof defaultBikeIdBySport] ?? null;
      const defaultBikeIdIfValid = defaultBikeId && validDefaultBikeIds.has(defaultBikeId) ? defaultBikeId : null;
      const linkedBikeId = incoming.gear_id
        ? (bikesByGearId.get(incoming.gear_id)?.id ?? null)
        : defaultBikeIdIfValid;

      const existing = existingByStravaId.get(stravaId);
      const payload = toActivityPayload(incoming, linkedBikeId);

      if (existing) {
        updateData.push({ id: existing.id, data: payload });
        if (existing.bikeId) touchedBikeIds.add(existing.bikeId);
      } else {
        createData.push({
          userId,
          stravaId,
          ...payload,
        });
      }

      if (linkedBikeId) touchedBikeIds.add(linkedBikeId);
    }

    if (createData.length > 0) {
      await prisma.activity.createMany({
        data: createData,
      });
    }

    await mapWithConcurrency(updateData, 25, async (row) => {
      await prisma.activity.update({
        where: { id: row.id },
        data: row.data,
      });
      return true;
    });

    const touchedBikeIdList = Array.from(touchedBikeIds);
    if (touchedBikeIdList.length > 0) {
      const [totalsByBike, bikes, components] = await Promise.all([
        prisma.activity.groupBy({
          by: ['bikeId'],
          where: {
            bikeId: { in: touchedBikeIdList },
          },
          _sum: { distance: true },
        }),
        prisma.bike.findMany({
          where: { id: { in: touchedBikeIdList } },
          select: { id: true, isTracking: true },
        }),
        prisma.component.findMany({
          where: { bikeId: { in: touchedBikeIdList } },
          select: {
            id: true,
            bikeId: true,
            lastMaintenanceMileage: true,
            maintenanceInterval: true,
          },
        }),
      ]);

      const bikeTotalKmById = new Map<string, number>();
      for (const row of totalsByBike) {
        if (!row.bikeId) continue;
        bikeTotalKmById.set(row.bikeId, (row._sum.distance ?? 0) / 1000);
      }

      const bikeTrackingById = new Map(bikes.map((bike) => [bike.id, bike.isTracking] as const));

      await mapWithConcurrency(bikes, 20, async (bike) => {
        const totalMileageKm = bikeTotalKmById.get(bike.id) ?? 0;
        await prisma.bike.update({
          where: { id: bike.id },
          data: { totalMileage: totalMileageKm },
        });
        return true;
      });

      await mapWithConcurrency(components, 50, async (component) => {
        const totalMileageKm = bikeTotalKmById.get(component.bikeId) ?? 0;
        const bikeIsTracking = bikeTrackingById.get(component.bikeId) ?? false;
        const mileageSinceLastMaintenance = totalMileageKm - component.lastMaintenanceMileage;
        const needsMaintenance = bikeIsTracking && mileageSinceLastMaintenance >= component.maintenanceInterval;

        await prisma.component.update({
          where: { id: component.id },
          data: {
            currentMileage: totalMileageKm,
            needsMaintenance,
          },
        });

        return true;
      });
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((claimedSyncAt.getTime() + cooldownMs - Date.now()) / 1000)
    );

    await prisma.user.updateMany({
      where: { id: userId, lastSyncAt: claimedSyncAt },
      data: { syncLockExpiresAt: null },
    });

    return res.status(200).json({
      message: 'Sync complete',
      pulled: activities.length,
      created: createData.length,
      updated: updateData.length,
      touchedBikes: touchedBikeIds.size,
      bikesCreated,
      bikesRenamed,
      retryAfterSeconds,
    });
  } catch (error) {
    await prisma.user.updateMany({
      where: { id: userId, lastSyncAt: claimedSyncAt },
      data: { lastSyncAt: cooldownThreshold, syncLockExpiresAt: null },
    });

    return res.status(500).json({
      message: 'Sync failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
