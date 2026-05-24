import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import {
  BikeType,
  ComponentType,
  MaintenanceType,
  RecommendationAction,
  TrackingMode,
} from '../../../../prisma/generated/client';

const MIN_ALLOWED_MAINTENANCE_DATE = new Date('2000-01-01T00:00:00.000Z');

const parseAndValidateMaintenanceDate = (value: string, fieldName: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${fieldName} is invalid` });
  }

  const now = new Date();
  if (parsed < MIN_ALLOWED_MAINTENANCE_DATE || parsed > now) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${fieldName} must be between 2000-01-01 and today`,
    });
  }

  return parsed;
};

const parseOptionalMaintenanceDate = (value: string | null | undefined, fieldName: string) => {
  if (!value) return null;
  return parseAndValidateMaintenanceDate(value, fieldName);
};

export const bikeRouter = createTRPCRouter({
  // Get all bikes for the current user
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const recentActivitySince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    return ctx.db.bike.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        components: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
        suspensionSettings: true,
        maintenanceRecords: {
          orderBy: { performedAt: 'desc' },
          take: 5,
        },
        activities: {
          where: {
            startDate: { gte: recentActivitySince },
          },
          select: {
            distance: true,
            movingTime: true,
            totalElevationGain: true,
            type: true,
            averageSpeed: true,
            maxSpeed: true,
            averageHeartrate: true,
            averageWatts: true,
            weightedAverageWatts: true,
            workoutType: true,
            sufferScore: true,
            startDate: true,
          },
          orderBy: { startDate: 'desc' },
          take: 180,
        },
        _count: {
          select: { activities: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }),

  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    const trackedBikes = await ctx.db.bike.findMany({
      where: {
        userId: ctx.session.user.id,
        isTracking: true,
      },
      select: {
        id: true,
        totalMileage: true,
      },
    });

    if (trackedBikes.length === 0) {
      return {
        trackedBikes: 0,
        totalMileageKm: 0,
        monthlyMileageKm: 0,
        dueItems: 0,
        sinceMaintenanceKm: 0,
        sinceMaintenanceHours: 0,
        rideLoadScore: 0,
        rideLoadLabel: 'Easy',
      };
    }

    const trackedBikeIds = trackedBikes.map((bike) => bike.id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [dueItems, monthlyTotals, bikeMaintenanceMax, componentMaintenanceMax] = await Promise.all([
      ctx.db.component.count({
        where: {
          bikeId: { in: trackedBikeIds },
          isActive: true,
          needsMaintenance: true,
        },
      }),
      ctx.db.activity.aggregate({
        where: {
          bikeId: { in: trackedBikeIds },
          startDate: { gte: thirtyDaysAgo },
        },
        _sum: {
          distance: true,
          movingTime: true,
          totalElevationGain: true,
        },
      }),
      ctx.db.bike.aggregate({
        where: {
          id: { in: trackedBikeIds },
        },
        _max: {
          maintenanceBaselineDate: true,
        },
      }),
      ctx.db.component.aggregate({
        where: {
          bikeId: { in: trackedBikeIds },
          isActive: true,
        },
        _max: {
          lastMaintenanceAt: true,
        },
      }),
    ]);

    const baselineA = bikeMaintenanceMax._max.maintenanceBaselineDate;
    const baselineB = componentMaintenanceMax._max.lastMaintenanceAt;
    const latestMaintenanceDate =
      baselineA && baselineB ? (baselineA > baselineB ? baselineA : baselineB) : baselineA ?? baselineB ?? null;

    const sinceMaintenanceTotals = latestMaintenanceDate
      ? await ctx.db.activity.aggregate({
          where: {
            bikeId: { in: trackedBikeIds },
            startDate: { gte: latestMaintenanceDate },
          },
          _sum: {
            distance: true,
            movingTime: true,
          },
        })
      : null;

    const totalMileageKm = trackedBikes.reduce((sum, bike) => sum + bike.totalMileage, 0);
    const monthlyMileageKm = (monthlyTotals._sum.distance ?? 0) / 1000;
    const monthlyHours = (monthlyTotals._sum.movingTime ?? 0) / 3600;
    const monthlyElevationKm = (monthlyTotals._sum.totalElevationGain ?? 0) / 1000;

    const rideLoadScore = Math.min(
      100,
      Math.round(monthlyMileageKm * 0.08 + monthlyElevationKm * 1.4 + monthlyHours * 0.7)
    );

    const rideLoadLabel = rideLoadScore < 35 ? 'Easy' : rideLoadScore < 70 ? 'Moderate' : 'Hard';

    return {
      trackedBikes: trackedBikes.length,
      totalMileageKm,
      monthlyMileageKm,
      dueItems,
      sinceMaintenanceKm: ((sinceMaintenanceTotals?._sum.distance ?? 0) as number) / 1000,
      sinceMaintenanceHours: ((sinceMaintenanceTotals?._sum.movingTime ?? 0) as number) / 3600,
      rideLoadScore,
      rideLoadLabel,
    };
  }),

  // Get a single bike by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.bike.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        include: {
          components: {
            where: { isActive: true },
            orderBy: { type: 'asc' },
          },
          maintenanceRecords: {
            include: { component: true },
            orderBy: { performedAt: 'desc' },
          },
          suspensionSettings: true,
          activities: {
            orderBy: { startDate: 'desc' },
            take: 10,
          },
        },
      });
    }),

  // Create a new bike
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Name is required'),
        brand: z.string().optional(),
        model: z.string().optional(),
        year: z.number().optional(),
        type: z.nativeEnum(BikeType),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        isTracking: z.boolean().default(true),
        trackingMode: z.nativeEnum(TrackingMode).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.trackingMode) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tracking mode can only be set after enabling suspension settings.',
        });
      }

      const bike = await ctx.db.bike.create({
        data: {
          userId: ctx.session.user.id,
          ...input,
        },
      });

      // Create default components for new bikes
      const defaultComponents = [
        { name: 'Chain', type: ComponentType.CHAIN, maintenanceInterval: 3000 },
        { name: 'Cassette', type: ComponentType.CASSETTE, maintenanceInterval: 5000 },
        { name: 'Brake Pads (Front)', type: ComponentType.BRAKE_PADS, maintenanceInterval: 2000 },
        { name: 'Brake Pads (Rear)', type: ComponentType.BRAKE_PADS, maintenanceInterval: 2000 },
        { name: 'Front Tire', type: ComponentType.TIRES, maintenanceInterval: 8000 },
        { name: 'Rear Tire', type: ComponentType.TIRES, maintenanceInterval: 8000 },
      ];

      await ctx.db.component.createMany({
        data: defaultComponents.map((comp) => ({
          bikeId: bike.id,
          ...comp,
        })),
      });

      return bike;
    }),

  // Update a bike
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1, 'Name is required').optional(),
        brand: z.string().optional(),
        model: z.string().optional(),
        year: z.number().optional(),
        type: z.nativeEnum(BikeType).optional(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        isTracking: z.boolean().optional(),
        trackingMode: z.nativeEnum(TrackingMode).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      if (updateData.trackingMode) {
        const bike = await ctx.db.bike.findFirst({
          where: { id, userId: ctx.session.user.id },
          select: { suspensionSettingsEnabled: true },
        });

        if (!bike) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Bike not found' });
        }

        if (!bike.suspensionSettingsEnabled) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Enable suspension settings before changing tracking mode.',
          });
        }
      }

      return ctx.db.bike.update({
        where: { id, userId: ctx.session.user.id },
        data: updateData,
      });
    }),

  // Delete a bike
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.bike.delete({
        where: { id: input.id, userId: ctx.session.user.id },
      });
    }),

  setBaselineMaintenanceDate: protectedProcedure
    .input(
      z.object({
        bikeId: z.string(),
        date: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const baselineDate = parseAndValidateMaintenanceDate(input.date, 'Baseline maintenance date');

      const bike = await ctx.db.bike.findFirst({
        where: { id: input.bikeId, userId: ctx.session.user.id },
        include: { components: true },
      });

      if (!bike) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bike not found' });
      }


      await ctx.db.$transaction([
        ctx.db.bike.update({
          where: { id: bike.id },
          data: {
            maintenanceBaselineDate: baselineDate,
          },
        }),
        ctx.db.component.updateMany({
          where: { bikeId: bike.id },
          data: {
            lastMaintenanceAt: baselineDate,
            lastMaintenanceMileage: bike.totalMileage,
            needsMaintenance: false,
          },
        }),
        ctx.db.maintenanceRecord.create({
          data: {
            userId: ctx.session.user.id,
            bikeId: bike.id,
            type: MaintenanceType.INSPECT,
            description: 'Baseline maintenance date set',
            mileageAtMaintenance: bike.totalMileage,
            performedAt: baselineDate,
          },
        }),
      ]);

      return { success: true };
    }),

  toggleMaintenanceTracking: protectedProcedure
    .input(
      z.object({
        bikeId: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.bike.update({
        where: { id: input.bikeId, userId: ctx.session.user.id },
        data: { isTracking: input.enabled },
      });
    }),

  toggleSuspensionSettings: protectedProcedure
    .input(
      z.object({
        bikeId: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bike = await ctx.db.bike.update({
        where: { id: input.bikeId, userId: ctx.session.user.id },
        data: { suspensionSettingsEnabled: input.enabled },
      });

      if (input.enabled) {
        await ctx.db.suspensionSettings.upsert({
          where: { bikeId: bike.id },
          create: { bikeId: bike.id },
          update: {},
        });
      }

      return bike;
    }),

  setTrackingMode: protectedProcedure
    .input(
      z.object({
        bikeId: z.string(),
        mode: z.nativeEnum(TrackingMode),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bike = await ctx.db.bike.findFirst({
        where: { id: input.bikeId, userId: ctx.session.user.id },
        select: { id: true, suspensionSettingsEnabled: true },
      });

      if (!bike) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bike not found' });
      }

      if (!bike.suspensionSettingsEnabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Enable suspension settings before changing tracking mode.',
        });
      }

      return ctx.db.bike.update({
        where: { id: bike.id },
        data: { trackingMode: input.mode },
      });
    }),

  setAdvancedSuspensionSettings: protectedProcedure
    .input(
      z.object({
        bikeId: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bike = await ctx.db.bike.findFirst({
        where: { id: input.bikeId, userId: ctx.session.user.id },
        select: { id: true },
      });

      if (!bike) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bike not found' });
      }

      return ctx.db.suspensionSettings.upsert({
        where: { bikeId: bike.id },
        create: {
          bikeId: bike.id,
          advancedSettingsEnabled: input.enabled,
        },
        update: {
          advancedSettingsEnabled: input.enabled,
        },
      });
    }),

  upsertSuspensionSettings: protectedProcedure
    .input(
      z.object({
        bikeId: z.string(),
        model: z.string().optional(),
        airPressure: z.number().int().nullable().optional(),
        reboundHighSpeed: z.number().int().nullable().optional(),
        reboundLowSpeed: z.number().int().nullable().optional(),
        compressionHighSpeed: z.number().int().nullable().optional(),
        compressionLowSpeed: z.number().int().nullable().optional(),
        lastServiceDate: z.string().nullable().optional(),
        lastServicer: z.string().optional(),
        shockModel: z.string().optional(),
        shockAirPressure: z.number().int().nullable().optional(),
        shockReboundHighSpeed: z.number().int().nullable().optional(),
        shockReboundLowSpeed: z.number().int().nullable().optional(),
        shockCompressionHighSpeed: z.number().int().nullable().optional(),
        shockCompressionLowSpeed: z.number().int().nullable().optional(),
        shockLastServiceDate: z.string().nullable().optional(),
        shockLastServicer: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bike = await ctx.db.bike.findFirst({
        where: { id: input.bikeId, userId: ctx.session.user.id },
        select: { id: true },
      });

      if (!bike) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bike not found' });
      }

      const payload = {
        model: input.model,
        airPressure: input.airPressure ?? null,
        reboundHighSpeed: input.reboundHighSpeed ?? null,
        reboundLowSpeed: input.reboundLowSpeed ?? null,
        compressionHighSpeed: input.compressionHighSpeed ?? null,
        compressionLowSpeed: input.compressionLowSpeed ?? null,
        lastServiceDate: parseOptionalMaintenanceDate(input.lastServiceDate, 'Fork last service date'),
        lastServicer: input.lastServicer,
        shockModel: input.shockModel,
        shockAirPressure: input.shockAirPressure ?? null,
        shockReboundHighSpeed: input.shockReboundHighSpeed ?? null,
        shockReboundLowSpeed: input.shockReboundLowSpeed ?? null,
        shockCompressionHighSpeed: input.shockCompressionHighSpeed ?? null,
        shockCompressionLowSpeed: input.shockCompressionLowSpeed ?? null,
        shockLastServiceDate: parseOptionalMaintenanceDate(input.shockLastServiceDate, 'Shock last service date'),
        shockLastServicer: input.shockLastServicer,
      };

      return ctx.db.suspensionSettings.upsert({
        where: { bikeId: bike.id },
        create: {
          bikeId: bike.id,
          ...payload,
        },
        update: payload,
      });
    }),

  applyRecommendationAction: protectedProcedure
    .input(
      z.object({
        bikeId: z.string(),
        action: z.enum(['DONE', 'SNOOZE', 'UNSNOOZE']),
        snoozeDays: z.number().int().min(1).max(30).optional(),
        doneDate: z.string().optional(),
        doneScope: z.enum(['FULL_SERVICE']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bike = await ctx.db.bike.findFirst({
        where: { id: input.bikeId, userId: ctx.session.user.id },
        select: { id: true, totalMileage: true },
      });

      if (!bike) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bike not found' });
      }

      if (input.action === 'SNOOZE') {
        const snoozeDays = input.snoozeDays ?? 7;
        const snoozedUntil = new Date();
        snoozedUntil.setDate(snoozedUntil.getDate() + snoozeDays);

        await ctx.db.bike.update({
          where: { id: bike.id },
          data: {
            recommendationSnoozedUntil: snoozedUntil,
            recommendationLastActionAt: new Date(),
            recommendationLastAction: RecommendationAction.SNOOZE,
          },
        });

        return {
          success: true,
          action: input.action,
          snoozedUntil: snoozedUntil.toISOString(),
        };
      }

      if (input.action === 'UNSNOOZE') {
        await ctx.db.bike.update({
          where: { id: bike.id },
          data: {
            recommendationSnoozedUntil: null,
            recommendationLastActionAt: new Date(),
            recommendationLastAction: RecommendationAction.UNSNOOZE,
          },
        });

        return { success: true, action: input.action };
      }

      const doneScope = input.doneScope ?? 'FULL_SERVICE';

      let completedAt = new Date();
      if (input.doneDate) {
        completedAt = parseAndValidateMaintenanceDate(input.doneDate, 'Maintenance completion date');
      }

      await ctx.db.$transaction([
        ctx.db.bike.update({
          where: { id: bike.id },
          data: {
            maintenanceBaselineDate: completedAt,
            recommendationSnoozedUntil: null,
            recommendationLastActionAt: completedAt,
            recommendationLastAction: RecommendationAction.DONE,
          },
        }),
        ctx.db.component.updateMany({
          where: { bikeId: bike.id },
          data: {
            lastMaintenanceAt: completedAt,
            lastMaintenanceMileage: bike.totalMileage,
            needsMaintenance: false,
          },
        }),
        ctx.db.maintenanceRecord.create({
          data: {
            userId: ctx.session.user.id,
            bikeId: bike.id,
            type: MaintenanceType.INSPECT,
            description: 'AI recommendation full-service reset marked done',
            mileageAtMaintenance: bike.totalMileage,
            performedAt: completedAt,
          },
        }),
      ]);

      return {
        success: true,
        action: input.action,
        doneScope,
        completedAt: completedAt.toISOString(),
      };
    }),


  completeRecommendationComponent: protectedProcedure
    .input(
      z.object({
        bikeId: z.string(),
        componentId: z.string(),
        doneDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bike = await ctx.db.bike.findFirst({
        where: { id: input.bikeId, userId: ctx.session.user.id },
        select: { id: true, totalMileage: true },
      });

      if (!bike) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bike not found' });
      }

      const component = await ctx.db.component.findFirst({
        where: {
          id: input.componentId,
          bikeId: bike.id,
          isActive: true,
        },
        select: { id: true },
      });

      if (!component) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Component not found' });
      }

      let completedAt = new Date();
      if (input.doneDate) {
        completedAt = parseAndValidateMaintenanceDate(input.doneDate, 'Maintenance completion date');
      }

      await ctx.db.$transaction([
        ctx.db.bike.update({
          where: { id: bike.id },
          data: {
            recommendationSnoozedUntil: null,
            recommendationLastActionAt: completedAt,
            recommendationLastAction: RecommendationAction.DONE,
          },
        }),
        ctx.db.component.update({
          where: { id: component.id },
          data: {
            lastMaintenanceAt: completedAt,
            lastMaintenanceMileage: bike.totalMileage,
            currentMileage: bike.totalMileage,
            needsMaintenance: false,
          },
        }),
        ctx.db.maintenanceRecord.create({
          data: {
            userId: ctx.session.user.id,
            bikeId: bike.id,
            componentId: component.id,
            type: MaintenanceType.INSPECT,
            description: 'AI recommendation component completion marked done',
            mileageAtMaintenance: bike.totalMileage,
            performedAt: completedAt,
          },
        }),
      ]);

      return {
        success: true,
        action: 'DONE' as const,
        doneScope: 'COMPONENT' as const,
        componentId: component.id,
        completedAt: completedAt.toISOString(),
      };
    }),
  getActivityDefaults: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.userSettings.findUnique({
      where: { userId: ctx.session.user.id },
      select: {
        defaultRideBikeId: true,
        defaultMountainBikeRideBikeId: true,
        defaultGravelRideBikeId: true,
        defaultEBikeRideBikeId: true,
        defaultEMountainBikeRideBikeId: true,
        defaultVirtualRideBikeId: true,
      },
    });

    return {
      Ride: settings?.defaultRideBikeId ?? null,
      MountainBikeRide: settings?.defaultMountainBikeRideBikeId ?? null,
      GravelRide: settings?.defaultGravelRideBikeId ?? null,
      EBikeRide: settings?.defaultEBikeRideBikeId ?? null,
      EMountainBikeRide: settings?.defaultEMountainBikeRideBikeId ?? null,
      VirtualRide: settings?.defaultVirtualRideBikeId ?? null,
    };
  }),

  setActivityDefault: protectedProcedure
    .input(
      z.object({
        activityType: z.enum(['Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'EMountainBikeRide', 'VirtualRide']),
        bikeId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.bikeId) {
        const bike = await ctx.db.bike.findFirst({
          where: { id: input.bikeId, userId: ctx.session.user.id },
          select: { id: true },
        });

        if (!bike) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Bike not found' });
        }
      }

      const dataByType = {
        Ride: { defaultRideBikeId: input.bikeId },
        MountainBikeRide: { defaultMountainBikeRideBikeId: input.bikeId },
        GravelRide: { defaultGravelRideBikeId: input.bikeId },
        EBikeRide: { defaultEBikeRideBikeId: input.bikeId },
        EMountainBikeRide: { defaultEMountainBikeRideBikeId: input.bikeId },
        VirtualRide: { defaultVirtualRideBikeId: input.bikeId },
      } as const;

      return ctx.db.userSettings.upsert({
        where: { userId: ctx.session.user.id },
        create: {
          userId: ctx.session.user.id,
          ...dataByType[input.activityType],
        },
        update: dataByType[input.activityType],
      });
    }),

  // Update bike mileage
  updateMileage: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        mileage: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bike = await ctx.db.bike.update({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { totalMileage: input.mileage },
        include: { components: true },
      });

      // Update component mileages and check for maintenance needs
      await Promise.all(
        bike.components.map(async (component) => {
          const mileageSinceLastMaintenance = 
            input.mileage - component.lastMaintenanceMileage;
          
          const needsMaintenance = bike.isTracking &&
            mileageSinceLastMaintenance >= component.maintenanceInterval;

          await ctx.db.component.update({
            where: { id: component.id },
            data: {
              currentMileage: input.mileage,
              needsMaintenance,
            },
          });
        })
      );

      return bike;
    }),
});
