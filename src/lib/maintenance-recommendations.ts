export type RecommendationConfidence = 'low' | 'medium' | 'high';
export type RecommendationSeverity = 'low' | 'medium' | 'high' | 'urgent';

export type MaintenanceRecommendation = {
  status: 'active' | 'snoozed';
  severity: RecommendationSeverity;
  score: number;
  title: string;
  reason: string;
  confidence: RecommendationConfidence;
  nextAction: string;
  window: string;
  resumeAt?: string;
  checks: string[];
};

type BikeComponent = {
  name: string;
  needsMaintenance: boolean;
  maintenanceInterval: number;
  lastMaintenanceMileage: number;
  lastMaintenanceAt?: string | Date | null;
};

type BikeActivity = {
  distance: number;
  movingTime: number;
  totalElevationGain?: number | null;
  averageHeartrate?: number | null;
  averageWatts?: number | null;
  weightedAverageWatts?: number | null;
  workoutType?: number | null;
  sufferScore?: number | null;
  startDate: string | Date;
};

type BikeInput = {
  isTracking: boolean;
  totalMileage: number;
  maintenanceBaselineDate?: string | Date | null;
  recommendationSnoozedUntil?: string | Date | null;
  trackingMode?: 'FORK_ONLY' | 'FORK_AND_SHOCK';
  suspensionSettingsEnabled?: boolean;
  suspensionSettings?: {
    model?: string | null;
    shockModel?: string | null;
    lastServiceDate?: string | Date | null;
    shockLastServiceDate?: string | Date | null;
  } | null;
  components: BikeComponent[];
  activities: BikeActivity[];
};

const getRecentActivities = (activities: BikeActivity[], days: number, now: Date) => {
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  return activities.filter((activity) => new Date(activity.startDate) >= since);
};

const getActivitiesSinceDate = (activities: BikeActivity[], sinceDate: Date) => {
  return activities.filter((activity) => new Date(activity.startDate) >= sinceDate);
};

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

const getSeverityFromScore = (score: number): RecommendationSeverity => {
  if (score >= 80) return 'urgent';
  if (score >= 58) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
};

const getConfidenceFromSeverity = (severity: RecommendationSeverity): RecommendationConfidence => {
  if (severity === 'urgent' || severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
};

const getComponentHourChecks = (
  components: BikeComponent[],
  totalMileageKm: number,
  avgKph: number
) => {
  const effectiveKph = avgKph > 5 ? avgKph : 18;

  const ranked = components
    .map((component) => {
      const sinceLastKm = totalMileageKm - (component.lastMaintenanceMileage ?? 0);
      const remainingKm = component.maintenanceInterval - sinceLastKm;
      const hoursToCheck = Math.abs(remainingKm / effectiveKph);

      return {
        name: component.name,
        remainingKm,
        hoursToCheck,
      };
    })
    .sort((a, b) => a.remainingKm - b.remainingKm)
    .slice(0, 2);

  return ranked.map((item) => {
    if (item.remainingKm <= 0) {
      return `Also check ${item.name} now (overdue by ${Math.abs(item.remainingKm).toFixed(0)} km, ~${item.hoursToCheck.toFixed(1)} h).`;
    }

    return `Also check ${item.name} in ~${item.hoursToCheck.toFixed(1)} h of riding.`;
  });
};

export const getMaintenanceRecommendation = (
  bike: BikeInput,
  options?: { distanceUnit?: 'KM' | 'MI' },
  now = new Date()
): MaintenanceRecommendation => {
  const distanceUnit = options?.distanceUnit ?? 'KM';
  const toDisplayDistance = (km: number) =>
    distanceUnit === 'MI' ? km * 0.621371 : km;
  const unitLabel = distanceUnit.toLowerCase();

  if (!bike.isTracking) {
    return {
      status: 'active',
      severity: 'low',
      score: 0,
      title: 'Tracking is paused',
      reason: 'Recommendations are limited while maintenance tracking is disabled.',
      confidence: 'high',
      nextAction: 'Enable maintenance tracking',
      window: 'Re-enable tracking when ready',
      checks: ['Enable maintenance tracking to resume automatic suggestions.'],
    };
  }

  const dueComponents = bike.components.filter((component) => component.needsMaintenance);

  const baselineDateFromBike = bike.maintenanceBaselineDate ? new Date(bike.maintenanceBaselineDate) : null;
  const baselineDateFromComponents = bike.components.reduce<Date | null>((latest, component) => {
    if (!component.lastMaintenanceAt) return latest;
    const parsed = new Date(component.lastMaintenanceAt);
    if (Number.isNaN(parsed.getTime())) return latest;
    if (!latest) return parsed;
    return parsed > latest ? parsed : latest;
  }, null);

  const baselineDate =
    baselineDateFromBike && !Number.isNaN(baselineDateFromBike.getTime())
      ? baselineDateFromBike
      : baselineDateFromComponents;

  const analysisActivities = baselineDate
    ? getActivitiesSinceDate(bike.activities, baselineDate)
    : getRecentActivities(bike.activities, 30, now);

  const distanceKm = analysisActivities.reduce((sum, activity) => sum + activity.distance, 0) / 1000;
  const hours = analysisActivities.reduce((sum, activity) => sum + activity.movingTime, 0) / 3600;
  const avgKph = hours > 0 ? distanceKm / hours : 0;
  const elevationKm = analysisActivities.reduce((sum, activity) => sum + (activity.totalElevationGain ?? 0), 0) / 1000;
  const loadScore = clampScore(distanceKm * 0.08 + elevationKm * 1.4 + hours * 0.7);

  const powerSamples = analysisActivities
    .map((activity) => activity.weightedAverageWatts ?? activity.averageWatts ?? 0)
    .filter((watts) => watts > 0);
  const avgPower = powerSamples.length > 0
    ? powerSamples.reduce((sum, watts) => sum + watts, 0) / powerSamples.length
    : 0;

  const sufferTotal = analysisActivities.reduce((sum, activity) => sum + (activity.sufferScore ?? 0), 0);
  const hardWorkoutCount = analysisActivities.reduce((sum, activity) => {
    const workoutHard = activity.workoutType === 11 || activity.workoutType === 12;
    const sufferHard = (activity.sufferScore ?? 0) >= 80;
    return sum + (workoutHard || sufferHard ? 1 : 0);
  }, 0);

  const intensityScore = clampScore(
    sufferTotal / 5 + hardWorkoutCount * 6 + (avgPower > 0 ? Math.min(12, avgPower / 30) : 0)
  );

  const lastBaselineMileage = bike.components.reduce(
    (maxMileage, component) => Math.max(maxMileage, component.lastMaintenanceMileage ?? 0),
    0
  );
  const sinceBaselineKm = Math.max(0, bike.totalMileage - lastBaselineMileage);

  let nextComponent = bike.components[0];
  let nextDistance = Number.POSITIVE_INFINITY;

  for (const component of bike.components) {
    const sinceLast = bike.totalMileage - (component.lastMaintenanceMileage ?? 0);
    const remaining = component.maintenanceInterval - sinceLast;
    if (remaining < nextDistance) {
      nextDistance = remaining;
      nextComponent = component;
    }
  }

  const forkDaysSinceService = bike.suspensionSettings?.lastServiceDate
    ? Math.floor((now.getTime() - new Date(bike.suspensionSettings.lastServiceDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const shockDaysSinceService = bike.suspensionSettings?.shockLastServiceDate
    ? Math.floor((now.getTime() - new Date(bike.suspensionSettings.shockLastServiceDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const suspensionDaysSinceService = bike.trackingMode === 'FORK_ONLY'
    ? forkDaysSinceService
    : Math.max(forkDaysSinceService ?? 0, shockDaysSinceService ?? 0) || null;

  const suspensionModelText = `${bike.suspensionSettings?.model ?? ''} ${bike.suspensionSettings?.shockModel ?? ''}`.toLowerCase();
  const isFoxSuspension = suspensionModelText.includes('fox');
  const isRockShoxSuspension = suspensionModelText.includes('rockshox') || suspensionModelText.includes('rock shox');

  const overduePressure = bike.components.reduce((maxOverdue, component) => {
    const sinceLast = bike.totalMileage - (component.lastMaintenanceMileage ?? 0);
    if (component.maintenanceInterval <= 0) return maxOverdue;
    const overdue = Math.max(0, sinceLast - component.maintenanceInterval) / component.maintenanceInterval;
    return Math.max(maxOverdue, overdue);
  }, 0);

  const baselinePressure = Math.max(0, (sinceBaselineKm - 200) / 20);
  const suspensionPressure = bike.suspensionSettingsEnabled && suspensionDaysSinceService
    ? Math.max(0, (suspensionDaysSinceService - 120) / 4)
    : 0;
  const duePressure = dueComponents.length * 20;

  let score = clampScore(
    loadScore * 0.4 + intensityScore * 0.35 + baselinePressure + suspensionPressure + duePressure + overduePressure * 40
  );

  let severity = getSeverityFromScore(score);
  if (dueComponents.length > 0) {
    severity = 'urgent';
  }

  // Guardrails so meaningful usage after baseline cannot remain in "low" state.
  if (sinceBaselineKm >= 300 || hours >= 20) {
    score = Math.max(score, 35);
    severity = severity === 'low' ? 'medium' : severity;
  }
  if (sinceBaselineKm >= 700 || hours >= 45) {
    score = Math.max(score, 60);
    if (severity === 'low' || severity === 'medium') severity = 'high';
  }
  if (sinceBaselineKm >= 1200) {
    score = Math.max(score, 82);
    severity = 'urgent';
  }

  // Fox best-practice intervals: lower-leg service ~30h, full service ~125h (shorter for heavy conditions/use).
  if (bike.suspensionSettingsEnabled && isFoxSuspension) {
    const heavyUse = loadScore >= 65 || elevationKm >= 8;
    const lowerLegIntervalHours = heavyUse ? 25 : 30;
    const fullServiceIntervalHours = heavyUse ? 100 : 125;

    if (hours >= fullServiceIntervalHours) {
      score = Math.max(score, 82);
      severity = 'urgent';
    } else if (hours >= lowerLegIntervalHours && severity === 'low') {
      score = Math.max(score, 38);
      severity = 'medium';
    }
  }

  // RockShox best-practice intervals: 50h lower-leg/air-can, ~200h full service.
  if (bike.suspensionSettingsEnabled && isRockShoxSuspension) {
    const heavyUse = loadScore >= 65 || elevationKm >= 8;
    const lowerServiceIntervalHours = heavyUse ? 40 : 50;
    const fullServiceIntervalHours = heavyUse ? 170 : 200;

    if (hours >= fullServiceIntervalHours) {
      score = Math.max(score, 82);
      severity = 'urgent';
    } else if (hours >= lowerServiceIntervalHours && severity === 'low') {
      score = Math.max(score, 38);
      severity = 'medium';
    }
  }

  let title = 'No urgent service right now';
  let reason = `Maintenance load score is ${score}/100.`;
  let nextAction = 'Keep riding and re-check after next sync';
  let window = 'Continue normal riding';
  let checks: string[] = [
    baselineDate
      ? `Since baseline: ${toDisplayDistance(distanceKm).toFixed(0)} ${unitLabel}, ${hours.toFixed(1)} h`
      : `Last 30d: ${toDisplayDistance(distanceKm).toFixed(0)} ${unitLabel}, ${hours.toFixed(1)} h`,
    `Intensity: ${intensityScore}/100${avgPower > 0 ? ` (avg ${avgPower.toFixed(0)} W)` : ''}`,
  ];

  const componentHourChecks = getComponentHourChecks(bike.components, bike.totalMileage, avgKph);

  if (severity === 'urgent') {
    title = 'Service due now';
    reason =
      dueComponents.length > 0
        ? `${dueComponents.length} component(s) are currently overdue.`
        : `Maintenance score is critically high (${score}/100).`;
    nextAction = 'Complete maintenance now and mark Done';
    window = 'Now';
    checks = [
      ...dueComponents.slice(0, 3).map((component) => component.name),
      `Score: ${score}/100`,
      ...componentHourChecks,
    ];
  } else if (severity === 'high') {
    title = 'Maintenance strongly recommended';
    reason = `Maintenance score is elevated (${score}/100) with high recent wear indicators.`;
    nextAction = 'Plan service in the next few rides';
    window = 'within 7 days';
    checks = [
      `Score: ${score}/100`,
      `Since baseline: ${toDisplayDistance(sinceBaselineKm).toFixed(0)} ${unitLabel}`,
      ...componentHourChecks,
    ];
  } else if (severity === 'medium') {
    title = 'Service coming up soon';
    reason = `Maintenance score is moderate (${score}/100).`;
    nextAction = `Prepare for ${nextComponent?.name ?? 'next component'} service`;
    window = 'within 2 weeks';
    checks = [
      `Approx. ${toDisplayDistance(Math.max(0, Math.round(nextDistance))).toFixed(0)} ${unitLabel} until next interval`,
      `Score: ${score}/100`,
      ...componentHourChecks,
    ];
  }

  if (bike.suspensionSettingsEnabled && isFoxSuspension) {
    const heavyUse = loadScore >= 65 || elevationKm >= 8;
    const lowerLegIntervalHours = heavyUse ? 25 : 30;
    const fullServiceIntervalHours = heavyUse ? 100 : 125;

    if (hours >= fullServiceIntervalHours) {
      title = 'Fox full suspension service due';
      nextAction = 'Book full service now (fork and shock)';
      window = 'Now';
      reason = `Fox service window exceeded: ${hours.toFixed(1)} h since baseline (target ${fullServiceIntervalHours} h).`;
      checks = [
        `Use genuine Fox oils/seals and replace foam rings/crush washers.`,
        `Post-ride stanchion wipe-down helps seal life in dusty/muddy conditions.`,
        ...componentHourChecks,
      ];
    } else if (hours >= lowerLegIntervalHours && severity !== 'urgent') {
      if (severity === 'low') severity = 'medium';
      title = 'Fox lower-leg service coming due';
      nextAction = 'Plan lower-leg/air-can service soon';
      window = severity === 'high' ? 'within 7 days' : 'within 2 weeks';
      reason = `Fox lower-leg interval reached: ${hours.toFixed(1)} h since baseline (target ${lowerLegIntervalHours} h).`;
      checks = [
        `Use genuine Fox oils/seals and replace foam rings/crush washers.`,
        `Increase service frequency for park, mud, or dust-heavy riding.`,
        ...componentHourChecks,
      ];
    }
  }

  if (bike.suspensionSettingsEnabled && isRockShoxSuspension) {
    const heavyUse = loadScore >= 65 || elevationKm >= 8;
    const lowerServiceIntervalHours = heavyUse ? 40 : 50;
    const fullServiceIntervalHours = heavyUse ? 170 : 200;

    if (hours >= fullServiceIntervalHours) {
      title = 'RockShox full suspension service due';
      nextAction = 'Book full damper and spring overhaul now';
      window = 'Now';
      reason = `RockShox full-service window exceeded: ${hours.toFixed(1)} h since baseline (target ${fullServiceIntervalHours} h).`;
      checks = [
        'Complete 200h damper and spring service for fork/shock.',
        'Use fresh seals/oil and inspect for contamination or wear.',
        ...componentHourChecks,
      ];
    } else if (hours >= lowerServiceIntervalHours && severity !== 'urgent') {
      if (severity === 'low') severity = 'medium';
      title = 'RockShox 50-hour service due soon';
      nextAction = 'Plan lower-leg (fork) and air-can (shock) service';
      window = severity === 'high' ? 'within 7 days' : 'within 2 weeks';
      reason = `RockShox lower-service interval reached: ${hours.toFixed(1)} h since baseline (target ${lowerServiceIntervalHours} h).`;
      checks = [
        'Perform 50h lower-leg and rear shock air-can service.',
        'Keep stanchions clean and service earlier in mud/dust/park conditions.',
        ...componentHourChecks,
      ];
    }
  }

  const activeRecommendation: MaintenanceRecommendation = {
    status: 'active',
    severity,
    score,
    title,
    reason,
    confidence: getConfidenceFromSeverity(severity),
    nextAction,
    window,
    checks,
  };

  if (bike.recommendationSnoozedUntil) {
    const snoozeDate = new Date(bike.recommendationSnoozedUntil);
    if (!Number.isNaN(snoozeDate.getTime()) && snoozeDate > now) {
      return {
        ...activeRecommendation,
        status: 'snoozed',
        title: 'Recommendation snoozed',
        reason: `Current recommendation is snoozed until ${snoozeDate.toLocaleDateString()}.`,
        nextAction: activeRecommendation.nextAction,
        window: `Resumes ${snoozeDate.toLocaleDateString()}`,
        resumeAt: snoozeDate.toISOString(),
        checks: [
          `Pending severity: ${activeRecommendation.severity.toUpperCase()} (${activeRecommendation.score}/100)`,
        ],
      };
    }
  }

  return activeRecommendation;
};
