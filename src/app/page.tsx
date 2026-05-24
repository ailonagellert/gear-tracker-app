'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { api } from '@/components/providers';
import { BikeCardSections } from '@/components/mobile/BikeCardSections';
import { MobileOverflowMenu } from '@/components/mobile/MobileOverflowMenu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMaintenanceRecommendation } from '@/lib/maintenance-recommendations';
import { Bike, Plus, Wrench, Activity, ShieldCheck, Mountain, RefreshCw, Settings2, ClipboardList } from 'lucide-react';

type MiniSwitchProps = {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
};

function MiniSwitch({ checked, onChange, disabled }: MiniSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border p-0.5 transition-all duration-200 ${
        checked
          ? 'border-emerald-400/80 bg-emerald-500/20 dark:border-emerald-600 dark:bg-emerald-500/25'
          : 'border-slate-400/50 bg-slate-400/15 dark:border-slate-600 dark:bg-slate-700/40'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span className="pointer-events-none absolute left-1 text-[9px] leading-none text-slate-500/70 dark:text-slate-300/60">
        -
      </span>
      <span className="pointer-events-none absolute right-1 text-[9px] leading-none text-emerald-700/80 dark:text-emerald-300/80">
        +
      </span>
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full border bg-white shadow-sm transition-transform duration-200 dark:bg-slate-100 ${
          checked ? 'translate-x-5 border-emerald-300' : 'translate-x-0 border-slate-300 dark:border-slate-500'
        }`}
      />
    </button>
  );
}

type DefaultActivityType = 'Ride' | 'MountainBikeRide' | 'GravelRide' | 'EBikeRide' | 'EMountainBikeRide' | 'VirtualRide';

type SuspensionDraft = {
  model?: string;
  airPressure?: string;
  reboundHighSpeed?: string;
  reboundLowSpeed?: string;
  compressionHighSpeed?: string;
  compressionLowSpeed?: string;
  lastServiceDate?: string;
  lastServicer?: string;
  shockModel?: string;
  shockAirPressure?: string;
  shockReboundHighSpeed?: string;
  shockReboundLowSpeed?: string;
  shockCompressionHighSpeed?: string;
  shockCompressionLowSpeed?: string;
  shockLastServiceDate?: string;
  shockLastServicer?: string;
};

export default function HomePage() {
  const { data: session, status } = useSession();
  const utils = api.useUtils();

  const trackEvent = (eventName: string, data?: Record<string, string | number | boolean | null | undefined>) => {
    if (typeof window === 'undefined') return;
    window.umami?.track(eventName, data);
  };
  const { data: bikes, isLoading: bikesLoading } = api.bike.getAll.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: dashboardStatsData } = api.bike.getDashboardStats.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: activityDefaults } = api.bike.getActivityDefaults.useQuery(undefined, {
    enabled: !!session,
  });

  const createBike = api.bike.create.useMutation({
    onSuccess: async () => {
      trackEvent('bike_created');
      await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
      setShowAddBike(false);
      setCreateState('idle');
      setBikeForm({
        name: '',
        brand: '',
        model: '',
        year: '',
        description: '',
        type: 'MOUNTAIN',
      });
    },
    onError: (error) => {
      setCreateState('error');
      setSyncMessage(getMutationErrorMessage(error, 'Could not create bike.'));
    },
  });

  const setActivityDefault = api.bike.setActivityDefault.useMutation({
    onSuccess: async (_, variables) => {
      trackEvent('default_gear_set', {
        activity_type: variables.activityType,
        has_default: !!variables.bikeId,
      });
      await utils.bike.getActivityDefaults.invalidate();
      setSyncMessage(`Default bike updated for ${variables.activityType}.`);
    },
    onError: (error) => {
      setSyncMessage(getMutationErrorMessage(error, 'Could not save default bike mapping.'));
    },
  });

  const setBaselineMaintenanceDate = api.bike.setBaselineMaintenanceDate.useMutation({
    onSuccess: async (_, variables) => {
      trackEvent('maintenance_baseline_saved', { bike_id: variables.bikeId });
      await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
      setSyncMessage('Baseline maintenance date saved. Tracking now starts from that date.');
    },
    onError: (error) => {
      setSyncMessage(getMutationErrorMessage(error, 'Could not save baseline maintenance date.'));
    },
  });

  const [showAddBike, setShowAddBike] = useState(false);
  const [createState, setCreateState] = useState<'idle' | 'error'>('idle');
  const [distanceUnit, setDistanceUnit] = useState<'KM' | 'MI'>('MI');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [maintenanceDates, setMaintenanceDates] = useState<Record<string, string>>({});
  const [suspensionDrafts, setSuspensionDrafts] = useState<Record<string, SuspensionDraft>>({});
  const [suspensionResetTokens, setSuspensionResetTokens] = useState<Record<string, number>>({});
  const [openRecommendationBikeId, setOpenRecommendationBikeId] = useState<string | null>(null);
  const [bikeForm, setBikeForm] = useState({
    name: '',
    brand: '',
    model: '',
    year: '',
    description: '',
    type: 'MOUNTAIN',
  });

  useEffect(() => {
    if (!syncMessage) return;
    const timeout = window.setTimeout(() => setSyncMessage(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [syncMessage]);

  const getMutationErrorMessage = (error: unknown, fallback: string) => {
    const code = (error as { data?: { code?: string } } | null)?.data?.code;
    if (code === 'UNAUTHORIZED') return 'Session expired. Please sign in again.';
    if (code === 'TOO_MANY_REQUESTS') return 'Too many requests. Please wait and try again.';
    if (code === 'BAD_REQUEST') return 'Some input is invalid. Please review and try again.';
    if (code === 'NOT_FOUND') return 'Item not found. Refresh and try again.';
    return fallback;
  };

  const convertKm = (km: number) => (distanceUnit === 'KM' ? km : km * 0.621371);

  const defaultActivityOptions: Array<{ value: DefaultActivityType; label: string }> = [
    { value: 'Ride', label: 'Ride' },
    { value: 'MountainBikeRide', label: 'Mountain Bike Ride' },
    { value: 'GravelRide', label: 'Gravel Ride' },
    { value: 'EBikeRide', label: 'E-Bike Ride' },
    { value: 'EMountainBikeRide', label: 'E-MTB Ride' },
    { value: 'VirtualRide', label: 'Virtual Ride' },
  ];

  const dashboardStats = dashboardStatsData ?? {
    trackedBikes: 0,
    totalMileageKm: 0,
    monthlyMileageKm: 0,
    dueItems: 0,
    sinceMaintenanceKm: 0,
    sinceMaintenanceHours: 0,
    rideLoadScore: 0,
    rideLoadLabel: 'Easy',
  };

  const bikeRecommendations = useMemo(() => {
    const recommendationMap: Record<string, ReturnType<typeof getMaintenanceRecommendation>> = {};

    (bikes ?? []).forEach((bike: any) => {
      recommendationMap[bike.id] = getMaintenanceRecommendation(bike, { distanceUnit });
    });

    return recommendationMap;
  }, [bikes, distanceUnit]);

  const trackedBikes = useMemo(() => {
    return [...(bikes ?? [])]
      .filter((bike: any) => bike.isTracking)
      .sort((a: any, b: any) => (b.totalMileage ?? 0) - (a.totalMileage ?? 0));
  }, [bikes]);

  const untrackedBikes = useMemo(() => {
    return [...(bikes ?? [])]
      .filter((bike: any) => !bike.isTracking)
      .sort((a: any, b: any) => (b.totalMileage ?? 0) - (a.totalMileage ?? 0));
  }, [bikes]);

  const persistedBaselineDates = useMemo(() => {
    const baselineMap: Record<string, string> = {};

    (bikes ?? []).forEach((bike: any) => {
      if (bike.maintenanceBaselineDate) {
        const parsed = new Date(bike.maintenanceBaselineDate);
        if (!Number.isNaN(parsed.getTime())) {
          baselineMap[bike.id] = parsed.toISOString().slice(0, 10);
          return;
        }
      }

      const latestBaseline = bike.components.reduce((latest: Date | null, component: any) => {
        if (!component.lastMaintenanceAt) return latest;
        const parsed = new Date(component.lastMaintenanceAt);
        if (Number.isNaN(parsed.getTime())) return latest;
        if (!latest) return parsed;
        return parsed > latest ? parsed : latest;
      }, null);

      if (latestBaseline) {
        baselineMap[bike.id] = latestBaseline.toISOString().slice(0, 10);
      }
    });

    return baselineMap;
  }, [bikes]);

  const updateSuspensionDraft = (bikeId: string, key: keyof SuspensionDraft, value: string) => {
    setSuspensionDrafts((prev) => ({
      ...prev,
      [bikeId]: {
        ...prev[bikeId],
        [key]: value,
      },
    }));
  };

  const getSuspensionDraftIsDirty = (bikeId: string) => {
    const draft = suspensionDrafts[bikeId];
    if (!draft) return false;
    return Object.keys(draft).length > 0;
  };

  const discardSuspensionDraft = (bikeId: string) => {
    setSuspensionDrafts((prev) => {
      if (!prev[bikeId]) return prev;
      const next = { ...prev };
      delete next[bikeId];
      return next;
    });
    setSuspensionResetTokens((prev) => ({
      ...prev,
      [bikeId]: (prev[bikeId] ?? 0) + 1,
    }));
  };

  const handleCreateBike = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateState('idle');

    createBike.mutate({
      name: bikeForm.name,
      brand: bikeForm.brand || undefined,
      model: bikeForm.model || undefined,
      year: bikeForm.year ? Number(bikeForm.year) : undefined,
      description: bikeForm.description || undefined,
      type: bikeForm.type as any,
      isTracking: true,
    });
  };

  const toggleMaintenanceTracking = api.bike.toggleMaintenanceTracking.useMutation({
    onSuccess: async (result) => {
      trackEvent('bike_tracking_toggled', { enabled: result.isTracking });
      await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
    },
  });

  const toggleSuspensionSettings = api.bike.toggleSuspensionSettings.useMutation({
    onSuccess: async (result) => {
      trackEvent('suspension_tracking_toggled', { enabled: result.suspensionSettingsEnabled });
      await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
    },
  });

  const setTrackingMode = api.bike.setTrackingMode.useMutation({
    onSuccess: async (_, variables) => {
      trackEvent('tracking_mode_changed', { mode: variables.mode });
      await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
      setSyncMessage(
        variables.mode === 'FORK_ONLY'
          ? 'Tracking mode set to Fork only. Shock settings are hidden.'
          : 'Tracking mode set to Fork + Shock.'
      );
    },
  });

  const setAdvancedSuspensionSettings = api.bike.setAdvancedSuspensionSettings.useMutation({
    onSuccess: async (_, variables) => {
      trackEvent('advanced_suspension_toggled', { enabled: variables.enabled });
      await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
      setSyncMessage(
        variables.enabled
          ? 'Advanced suspension settings enabled.'
          : 'Advanced suspension settings hidden.'
      );
    },
    onError: (error) => {
      setSyncMessage(getMutationErrorMessage(error, 'Could not update advanced suspension settings.'));
    },
  });

  const upsertSuspensionSettings = api.bike.upsertSuspensionSettings.useMutation({
    onSuccess: async (_, variables) => {
      trackEvent('suspension_settings_saved', { bike_id: variables.bikeId });
      await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
      setSyncMessage('Settings updated. Maintenance recommendations refreshed.');
    },
    onError: (error) => {
      setSyncMessage(getMutationErrorMessage(error, 'Could not save suspension settings.'));
    },
  });

  const applyRecommendationAction = api.bike.applyRecommendationAction.useMutation({
    onSuccess: async (result, variables) => {
      trackEvent('maintenance_action', {
        bike_id: variables.bikeId,
        action: variables.action,
        snooze_days: variables.snoozeDays,
      });
      await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
      if (variables.action === 'DONE') {
        const completedLabel = result?.completedAt
          ? new Date(result.completedAt).toLocaleDateString()
          : 'selected date';
        setSyncMessage(`Maintenance marked complete (full-service reset) for ${completedLabel}. Recommendation recalculated.`);
      } else if (variables.action === 'UNSNOOZE') {
        setSyncMessage('Recommendation unsnoozed.');
      } else {
        const resumeDate = result?.snoozedUntil
          ? new Date(result.snoozedUntil).toLocaleDateString()
          : null;
        setSyncMessage(
          resumeDate
            ? `Recommendation snoozed until ${resumeDate}.`
            : `Recommendation snoozed for ${variables.snoozeDays ?? 7} days.`
        );
      }
    },
    onError: (error) => {
      setSyncMessage(getMutationErrorMessage(error, 'Could not apply recommendation action.'));
    },
  });

  const completeRecommendationComponent = api.bike.completeRecommendationComponent.useMutation({
    onSuccess: async (_, variables) => {
      trackEvent('maintenance_action', {
        bike_id: variables.bikeId,
        action: 'DONE_COMPONENT',
        component_id: variables.componentId,
      });
      await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
      setSyncMessage('Component marked complete. Recommendation recalculated.');
    },
    onError: (error) => {
      setSyncMessage(getMutationErrorMessage(error, 'Could not mark component as complete.'));
    },
  });

  const handleBaselineDateCommit = async (bikeId: string, nextDate?: string) => {
    const candidate = nextDate ?? maintenanceDates[bikeId] ?? persistedBaselineDates[bikeId] ?? '';
    const trimmed = candidate.trim();
    if (!trimmed) return;

    if ((persistedBaselineDates[bikeId] ?? '') === trimmed) {
      return;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      setSyncMessage('Please enter a valid maintenance date.');
      return;
    }

    const minDate = new Date('2000-01-01T00:00:00.000Z');
    const today = new Date();
    if (parsed < minDate || parsed > today) {
      setSyncMessage('Maintenance date must be between 2000-01-01 and today.');
      return;
    }

    await setBaselineMaintenanceDate.mutateAsync({ bikeId, date: trimmed });
    setMaintenanceDates((prev) => {
      const next = { ...prev };
      delete next[bikeId];
      return next;
    });
  };

  const discardBaselineDateDraft = (bikeId: string) => {
    setMaintenanceDates((prev) => {
      if (!(bikeId in prev)) return prev;
      const next = { ...prev };
      delete next[bikeId];
      return next;
    });
  };

  const handleRefreshRecommendations = async () => {
    trackEvent('maintenance_recommendations_refreshed');
    await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
    setSyncMessage('Maintenance recommendations refreshed.');
  };

  const handleBaselineDateKeyDown = (event: KeyboardEvent<HTMLInputElement>, bikeId: string) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const inputValue = event.currentTarget.value;
    void handleBaselineDateCommit(bikeId, inputValue);
    event.currentTarget.blur();
  };

  const handleRecommendationAction = (
    bikeId: string,
    action: 'DONE' | 'SNOOZE' | 'UNSNOOZE',
    options?: { doneDate?: string; snoozeDays?: number }
  ) => {
    if (action === 'DONE') {
      const today = new Date().toISOString().slice(0, 10);
      const doneDate = options?.doneDate?.trim() || today;

      const parsed = new Date(doneDate);
      if (Number.isNaN(parsed.getTime())) {
        setSyncMessage('Please enter a valid date in YYYY-MM-DD format.');
        return;
      }

      const minDate = new Date('2000-01-01T00:00:00.000Z');
      const todayDate = new Date();
      if (parsed < minDate || parsed > todayDate) {
        setSyncMessage('Completion date must be between 2000-01-01 and today.');
        return;
      }

      applyRecommendationAction.mutate({ bikeId, action: 'DONE', doneDate, doneScope: 'FULL_SERVICE' });
      return;
    }

    if (action === 'SNOOZE') {
      applyRecommendationAction.mutate({ bikeId, action: 'SNOOZE', snoozeDays: options?.snoozeDays ?? 7 });
      return;
    }

    applyRecommendationAction.mutate({ bikeId, action: 'UNSNOOZE' });
  };

  const handleCompleteRecommendationComponent = (bikeId: string, componentId: string) => {
    const doneDate = new Date().toISOString().slice(0, 10);
    completeRecommendationComponent.mutate({ bikeId, componentId, doneDate });
  };

  const handleSaveSuspensionSettings = async (bike: any) => {
    const draft = suspensionDrafts[bike.id] ?? {};
    const current = bike.suspensionSettings ?? {};

    const pickText = (draftValue: string | undefined, currentValue?: string | null) => {
      if (draftValue !== undefined) return draftValue;
      return currentValue ?? undefined;
    };

    const pickNumericText = (draftValue: string | undefined, currentValue?: number | null) => {
      if (draftValue !== undefined) return draftValue;
      if (currentValue === null || currentValue === undefined) return '';
      return String(currentValue);
    };

    const pickDateText = (draftValue: string | undefined, currentValue?: string | Date | null) => {
      if (draftValue !== undefined) return draftValue;
      if (!currentValue) return '';
      const parsed = new Date(currentValue);
      if (Number.isNaN(parsed.getTime())) return '';
      return parsed.toISOString().slice(0, 10);
    };

    const merged = {
      model: pickText(draft.model, current.model),
      airPressure: pickNumericText(draft.airPressure, current.airPressure),
      reboundHighSpeed: pickNumericText(draft.reboundHighSpeed, current.reboundHighSpeed),
      reboundLowSpeed: pickNumericText(draft.reboundLowSpeed, current.reboundLowSpeed),
      compressionHighSpeed: pickNumericText(draft.compressionHighSpeed, current.compressionHighSpeed),
      compressionLowSpeed: pickNumericText(draft.compressionLowSpeed, current.compressionLowSpeed),
      lastServiceDate: pickDateText(draft.lastServiceDate, current.lastServiceDate),
      lastServicer: pickText(draft.lastServicer, current.lastServicer),
      shockModel: pickText(draft.shockModel, current.shockModel),
      shockAirPressure: pickNumericText(draft.shockAirPressure, current.shockAirPressure),
      shockReboundHighSpeed: pickNumericText(draft.shockReboundHighSpeed, current.shockReboundHighSpeed),
      shockReboundLowSpeed: pickNumericText(draft.shockReboundLowSpeed, current.shockReboundLowSpeed),
      shockCompressionHighSpeed: pickNumericText(draft.shockCompressionHighSpeed, current.shockCompressionHighSpeed),
      shockCompressionLowSpeed: pickNumericText(draft.shockCompressionLowSpeed, current.shockCompressionLowSpeed),
      shockLastServiceDate: pickDateText(draft.shockLastServiceDate, current.shockLastServiceDate),
      shockLastServicer: pickText(draft.shockLastServicer, current.shockLastServicer),
    };

    await upsertSuspensionSettings.mutateAsync({
      bikeId: bike.id,
      model: merged.model,
      airPressure: merged.airPressure ? Number(merged.airPressure) : null,
      reboundHighSpeed: merged.reboundHighSpeed ? Number(merged.reboundHighSpeed) : null,
      reboundLowSpeed: merged.reboundLowSpeed ? Number(merged.reboundLowSpeed) : null,
      compressionHighSpeed: merged.compressionHighSpeed ? Number(merged.compressionHighSpeed) : null,
      compressionLowSpeed: merged.compressionLowSpeed ? Number(merged.compressionLowSpeed) : null,
      lastServiceDate: merged.lastServiceDate || null,
      lastServicer: merged.lastServicer,
      shockModel: merged.shockModel,
      shockAirPressure: merged.shockAirPressure ? Number(merged.shockAirPressure) : null,
      shockReboundHighSpeed: merged.shockReboundHighSpeed ? Number(merged.shockReboundHighSpeed) : null,
      shockReboundLowSpeed: merged.shockReboundLowSpeed ? Number(merged.shockReboundLowSpeed) : null,
      shockCompressionHighSpeed: merged.shockCompressionHighSpeed ? Number(merged.shockCompressionHighSpeed) : null,
      shockCompressionLowSpeed: merged.shockCompressionLowSpeed ? Number(merged.shockCompressionLowSpeed) : null,
      shockLastServiceDate: merged.shockLastServiceDate || null,
      shockLastServicer: merged.shockLastServicer,
    });

    setSuspensionDrafts((prev) => {
      if (!prev[bike.id]) return prev;
      const next = { ...prev };
      delete next[bike.id];
      return next;
    });
    setSuspensionResetTokens((prev) => ({
      ...prev,
      [bike.id]: (prev[bike.id] ?? 0) + 1,
    }));
  };

  const handleSuspensionInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.currentTarget.blur();
  };


  const handleSyncStrava = async () => {
    setSyncing(true);
    setSyncMessage(null);
    trackEvent('strava_sync_started');

    try {
      const response = await fetch('/api/strava/sync', { method: 'POST' });
      const result = await response.json();

      if (!response.ok) {
        setSyncMessage(result.message ?? 'Sync failed');
        trackEvent('strava_sync_failed');
      } else {
        setSyncMessage(`Synced ${result.pulled} activities, added ${result.bikesCreated} bike(s).`);
        trackEvent('strava_sync_completed', { activities: result.pulled, bikes_added: result.bikesCreated });
        await Promise.all([utils.bike.getAll.invalidate(), utils.bike.getDashboardStats.invalidate()]);
      }
    } catch {
      setSyncMessage('Sync failed. Please try again.');
      trackEvent('strava_sync_error');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (status !== 'authenticated') return;
    const key = `umami_login_tracked_${session?.user?.email ?? 'unknown'}`;
    if (window.sessionStorage.getItem(key)) return;
    trackEvent('login_success', { provider: 'strava' });
    trackEvent('signup_completed', { provider: 'strava' });
    window.sessionStorage.setItem(key, '1');
  }, [session?.user?.email, status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (!session?.user?.stravaId) return;
    if (bikesLoading || syncing) return;
    if ((bikes?.length ?? 0) > 0) return;

    const key = `initial_strava_sync_started_${session.user.id}`;
    if (window.sessionStorage.getItem(key)) return;

    window.sessionStorage.setItem(key, '1');
    trackEvent('initial_strava_sync_started');
    void handleSyncStrava();
  }, [bikes, bikesLoading, session?.user?.id, session?.user?.stravaId, status, syncing]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-background to-indigo-100 text-foreground dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center max-w-4xl mx-auto">
            <div className="mb-12">
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-blue-600 rounded-full">
                  <Mountain className="h-12 w-12 text-white" />
                </div>
              </div>
              <h1 className="mb-6 text-5xl font-bold">Gear Tracker App</h1>
              <p className="mb-8 text-xl leading-relaxed text-muted-foreground">
                Suspension-first maintenance tracking for riders who care about performance,
                consistency, and safer service intervals.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button
                  onClick={() => {
                    trackEvent('signup_started', { method: 'strava' });
                    signIn('strava');
                  }}
                  size="lg"
                  className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 text-lg"
                >
                  Connect with Strava
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/help/strava-gear">Strava Gear Help</Link>
                </Button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-16">
              <Card className="bg-card dark:bg-slate-800/80 dark:border-slate-700">
                <CardHeader>
                  <Wrench className="h-8 w-8 text-blue-600 mb-2" />
                  <CardTitle>Suspension Service Focus</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Track fork and shock service intervals now, then expand to deeper suspension analytics.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card dark:bg-slate-800/80 dark:border-slate-700">
                <CardHeader>
                  <Activity className="h-8 w-8 text-blue-600 mb-2" />
                  <CardTitle>Ride-Synced Mileage</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Pull mileage from Strava so your maintenance timing reflects real-world use.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card dark:bg-slate-800/80 dark:border-slate-700">
                <CardHeader>
                  <ShieldCheck className="h-8 w-8 text-blue-600 mb-2" />
                  <CardTitle>Reliability First</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Keep service history, reduce guesswork, and avoid overdue wear items.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {syncMessage && (
        <div className="fixed right-4 top-4 z-50">
          <Card className="bg-card dark:bg-slate-800/90 dark:border-slate-700 shadow-lg">
            <CardContent className="py-3 text-sm">{syncMessage}</CardContent>
          </Card>
        </div>
      )}

      <header className="border-b border-border bg-card dark:bg-slate-800/80 dark:border-slate-700 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-3">
              <Bike className="h-8 w-8 text-blue-600" />
              <h1 className="text-xl font-bold whitespace-nowrap sm:text-2xl">Gear Tracker App</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-sm text-muted-foreground">Welcome, {session.user?.name ?? 'rider'}</span>
              <Button
                onClick={handleSyncStrava}
                variant="outline"
                size="sm"
                disabled={syncing}
                className="h-11 w-11 p-0 sm:w-auto sm:px-3"
                aria-label={syncing ? 'Syncing Strava' : 'Sync Strava'}
                title={syncing ? 'Syncing Strava' : 'Sync Strava'}
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                <span className="ml-1 hidden sm:inline">{syncing ? 'Syncing...' : 'Sync Strava'}</span>
              </Button>
              <Button asChild variant="outline" size="sm" className="hidden h-11 sm:inline-flex">
                <Link href="/help/strava-gear">Strava Gear Help</Link>
              </Button>
              <Button onClick={() => { trackEvent('signout_clicked'); signOut(); }} variant="outline" size="sm" className="hidden h-11 sm:inline-flex">
                Sign Out
              </Button>
              <MobileOverflowMenu onSignOut={() => { trackEvent('signout_clicked'); signOut(); }} />
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-0 pt-3 pb-8 sm:container sm:mx-auto sm:px-4 sm:pt-8 space-y-2 sm:space-y-6">
        <section className="flex snap-x gap-3 overflow-x-auto px-4 pb-0 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-5">
          <Card className="min-w-[156px] snap-start bg-card py-2 dark:border-slate-700 dark:bg-slate-800/80 sm:min-w-0">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardDescription className="text-xs">Total distance</CardDescription>
                <div className="inline-flex items-center rounded-full border border-border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setDistanceUnit('MI')}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                      distanceUnit === 'MI'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    aria-pressed={distanceUnit === 'MI'}
                  >
                    MI
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistanceUnit('KM')}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                      distanceUnit === 'KM'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    aria-pressed={distanceUnit === 'KM'}
                  >
                    KM
                  </button>
                </div>
              </div>
              <CardTitle className="text-xl">{convertKm(dashboardStats.totalMileageKm).toFixed(0)} {distanceUnit.toLowerCase()}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="min-w-[156px] snap-start bg-card py-2 dark:border-slate-700 dark:bg-slate-800/80 sm:min-w-0">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Distance (30d)</CardDescription>
              <CardTitle className="text-xl">{convertKm(dashboardStats.monthlyMileageKm).toFixed(0)} {distanceUnit.toLowerCase()}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="min-w-[156px] snap-start bg-card py-2 dark:border-slate-700 dark:bg-slate-800/80 sm:min-w-0">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Since latest maintenance</CardDescription>
              <CardTitle className="text-xl">
                {convertKm(dashboardStats.sinceMaintenanceKm).toFixed(0)} {distanceUnit.toLowerCase()} / {dashboardStats.sinceMaintenanceHours.toFixed(0)} hrs
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="min-w-[156px] snap-start bg-card py-2 dark:border-slate-700 dark:bg-slate-800/80 sm:min-w-0">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Ride load</CardDescription>
              <CardTitle className="text-xl">{dashboardStats.rideLoadLabel} ({dashboardStats.rideLoadScore}/100)</CardTitle>
            </CardHeader>
          </Card>
          <Card className="min-w-[156px] snap-start bg-card py-2 dark:border-slate-700 dark:bg-slate-800/80 sm:min-w-0">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Tracked bikes</CardDescription>
              <CardTitle className="text-xl">{dashboardStats.trackedBikes}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card className="gap-1 bg-card dark:bg-slate-800/80 dark:border-slate-700 sm:gap-2">
          <CardHeader className="px-4 pt-1.5 pb-1 sm:px-6 sm:pt-4 sm:pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="inline-flex items-center gap-2 text-xl sm:text-2xl"><Bike className="h-4 w-4" /> Your bikes</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => setShowAddBike((prev) => !prev)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {showAddBike ? 'Close' : 'Add bike'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            {showAddBike && (
              <form onSubmit={handleCreateBike} className="mb-6 grid gap-3 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-2">
                <input
                  className="rounded border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
                  placeholder="Bike name *"
                  value={bikeForm.name}
                  onChange={(event) => setBikeForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
                <select
                  className="rounded border border-input bg-background px-3 py-2 text-foreground"
                  value={bikeForm.type}
                  onChange={(event) => setBikeForm((prev) => ({ ...prev, type: event.target.value }))}
                >
                  <option value="MOUNTAIN">Mountain</option>
                  <option value="ROAD">Road</option>
                  <option value="GRAVEL">Gravel</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="ELECTRIC">Electric</option>
                  <option value="BMX">BMX</option>
                  <option value="OTHER">Other</option>
                </select>
                <input
                  className="rounded border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
                  placeholder="Brand"
                  value={bikeForm.brand}
                  onChange={(event) => setBikeForm((prev) => ({ ...prev, brand: event.target.value }))}
                />
                <input
                  className="rounded border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
                  placeholder="Model"
                  value={bikeForm.model}
                  onChange={(event) => setBikeForm((prev) => ({ ...prev, model: event.target.value }))}
                />
                <input
                  className="rounded border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
                  placeholder="Year"
                  type="number"
                  min={1980}
                  max={2100}
                  value={bikeForm.year}
                  onChange={(event) => setBikeForm((prev) => ({ ...prev, year: event.target.value }))}
                />
                <input
                  className="rounded border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
                  placeholder="Notes"
                  value={bikeForm.description}
                  onChange={(event) => setBikeForm((prev) => ({ ...prev, description: event.target.value }))}
                />
                <div className="md:col-span-2 flex items-center gap-3">
                  <Button type="submit" disabled={createBike.isPending || !bikeForm.name.trim()}>
                    {createBike.isPending ? 'Creating...' : 'Create bike'}
                  </Button>
                  {createState === 'error' && (
                    <p className="text-sm text-destructive">Could not create bike. Please check fields and try again.</p>
                  )}
                </div>
              </form>
            )}

            {bikesLoading ? (
              <p className="px-1 sm:px-0 text-sm text-muted-foreground">Loading your bikes...</p>
            ) : bikes && bikes.length > 0 ? (
              <>
                <div className="grid grid-cols-1 gap-4 px-1 sm:px-0 md:grid-cols-2 lg:grid-cols-3">
                  {trackedBikes.map((bike: any) => {
                  const dueComponents = bike.components.filter((component: any) => component.needsMaintenance);
                  const dueCount = dueComponents.length;
                  const recommendation = bikeRecommendations[bike.id];
                  const isAdvancedSuspensionEnabled = !!bike.suspensionSettings?.advancedSettingsEnabled;
                  const currentDefaultActivityForBike =
                    defaultActivityOptions.find((option) => ((activityDefaults as any)?.[option.value] ?? null) === bike.id)?.value ?? '';
                  const recommendationToneClass = recommendation?.status === 'snoozed'
                    ? 'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200'
                    : recommendation?.severity === 'urgent'
                      ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-100'
                      : recommendation?.severity === 'high'
                        ? 'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/60 dark:text-orange-100'
                        : recommendation?.severity === 'medium'
                          ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-100'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-100';
                  const maintenanceSectionToneClass = recommendation?.status === 'snoozed'
                    ? 'border-slate-300/70 bg-slate-100/40 dark:border-slate-700/80 dark:bg-slate-800/35'
                    : recommendation?.severity === 'urgent'
                      ? 'border-red-300/60 bg-red-100/35 dark:border-red-900/70 dark:bg-red-950/35'
                      : recommendation?.severity === 'high'
                        ? 'border-orange-300/60 bg-orange-100/35 dark:border-orange-900/70 dark:bg-orange-950/35'
                        : recommendation?.severity === 'medium'
                          ? 'border-amber-300/60 bg-amber-100/35 dark:border-amber-900/70 dark:bg-amber-950/35'
                          : 'border-emerald-300/60 bg-emerald-100/35 dark:border-emerald-900/70 dark:bg-emerald-950/35';

                  const getServiceIntervals = (modelValue?: string | null) => {
                    const modelText = (modelValue ?? '').toLowerCase();
                    const isRockShoxModel = modelText.includes('rockshox') || modelText.includes('rock shox');
                    if (isRockShoxModel) return { minor: 50, major: 170 };
                    return { minor: 30, major: 100 };
                  };

                  const getHoursSinceDate = (dateValue?: string | Date | null) => {
                    const fallbackDate = bike.maintenanceBaselineDate ? new Date(bike.maintenanceBaselineDate) : null;
                    const parsedDate = dateValue ? new Date(dateValue) : fallbackDate;
                    const hasValidDate = !!parsedDate && !Number.isNaN(parsedDate.getTime());

                    const hours = (bike.activities ?? [])
                      .filter((activity: any) => {
                        if (!hasValidDate || !parsedDate) return false;
                        return new Date(activity.startDate) >= parsedDate;
                      })
                      .reduce((sum: number, activity: any) => sum + (activity.movingTime ?? 0), 0) / 3600;

                    return { hours, hasValidDate };
                  };

                  const forkIntervals = getServiceIntervals(bike.suspensionSettings?.model);
                  const shockIntervals = getServiceIntervals(bike.suspensionSettings?.shockModel);
                  const forkStats = getHoursSinceDate(bike.suspensionSettings?.lastServiceDate);
                  const shockStats = getHoursSinceDate(bike.suspensionSettings?.shockLastServiceDate);

                  const getSuspensionStatus = (hours: number, minor: number, major: number, hasValidDate: boolean) => {
                    if (!bike.isTracking || !bike.suspensionSettingsEnabled) return 'paused';
                    if (!hasValidDate) return 'missing';
                    if (hours >= major) return 'major';
                    if (hours >= minor) return 'minor';
                    return 'good';
                  };

                  const forkStatus = getSuspensionStatus(forkStats.hours, forkIntervals.minor, forkIntervals.major, forkStats.hasValidDate);
                  const shockStatus = getSuspensionStatus(shockStats.hours, shockIntervals.minor, shockIntervals.major, shockStats.hasValidDate);
                  const showShockRecommendation = bike.trackingMode !== 'FORK_ONLY';

                  const getSuspensionToneClass = (status: string) => {
                    if (status === 'major') return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-100';
                    if (status === 'minor') return 'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/60 dark:text-orange-100';
                    if (status === 'missing') return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-100';
                    return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-100';
                  };

                  if (!bike.isTracking) {
                    return (
                      <Card key={bike.id} className="bg-muted/40 dark:bg-slate-900/90 dark:border-slate-700 transition-shadow hover:shadow-md opacity-90 py-2 gap-2 sm:py-6 sm:gap-6">
                        <CardHeader className="px-3 pt-2 pb-1.5 sm:px-6 sm:pt-6 sm:pb-3">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-xl sm:text-lg">{bike.name}</CardTitle>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">Tracking off</span>
                              <MiniSwitch
                                checked={bike.isTracking}
                                onChange={() =>
                                  toggleMaintenanceTracking.mutate({
                                    bikeId: bike.id,
                                    enabled: true,
                                  })
                                }
                                disabled={toggleMaintenanceTracking.isPending}
                              />
                            </div>
                          </div>
                          <div className="mt-2 flex items-start justify-between gap-3">
                            <CardDescription className="min-w-0 pr-2">
                              {[bike.brand, bike.model].filter(Boolean).join(' ')} {bike.year ? `(${bike.year})` : ''}
                            </CardDescription>
                            <div className="flex shrink-0 items-center gap-2 text-xs">
                              <span className="text-muted-foreground">Default for</span>
                              <select
                                className="h-8 min-w-[150px] rounded border border-input bg-card px-2 text-xs text-foreground"
                                value={currentDefaultActivityForBike}
                                disabled={setActivityDefault.isPending}
                                onChange={(event) => {
                                  const nextActivity = event.target.value as DefaultActivityType | '';
                                  if (!nextActivity) {
                                    if (currentDefaultActivityForBike) {
                                      setActivityDefault.mutate({
                                        activityType: currentDefaultActivityForBike as DefaultActivityType,
                                        bikeId: null,
                                      });
                                    }
                                    return;
                                  }

                                  setActivityDefault.mutate({
                                    activityType: nextActivity,
                                    bikeId: bike.id,
                                  });
                                }}
                              >
                                <option value="" className="text-slate-900">None</option>
                                {defaultActivityOptions.map((option) => (
                                  <option key={option.value} value={option.value} className="text-slate-900">
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                      </CardHeader>
                        <CardContent className="space-y-2 px-3 text-base sm:px-6 sm:text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Distance</span>
                            <span className="font-medium">{convertKm(bike.totalMileage).toFixed(0)} {distanceUnit.toLowerCase()}</span>
                          </div>
                          <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground">
                              Tracking is paused. Enable tracking to expand this card and resume recommendations.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }

                  return (
                    <Card key={bike.id} className="bg-muted/40 dark:bg-slate-900/90 dark:border-slate-700 transition-shadow hover:shadow-md py-2 gap-2 sm:py-6 sm:gap-6">
                      <CardHeader className="px-3 pt-2 pb-1.5 sm:px-6 sm:pt-6 sm:pb-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-xl sm:text-lg">{bike.name}</CardTitle>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-medium ${
                                bike.isTracking
                                  ? 'text-emerald-700 dark:text-emerald-300'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {bike.isTracking ? 'Tracking on' : 'Tracking off'}
                            </span>
                            <MiniSwitch
                              checked={bike.isTracking}
                              onChange={() =>
                                toggleMaintenanceTracking.mutate({
                                  bikeId: bike.id,
                                  enabled: !bike.isTracking,
                                })
                              }
                              disabled={toggleMaintenanceTracking.isPending}
                            />
                          </div>
                        </div>
                        <div className="mt-2 flex items-start justify-between gap-3">
                          <CardDescription className="min-w-0 pr-2">
                            {[bike.brand, bike.model].filter(Boolean).join(' ')} {bike.year ? `(${bike.year})` : ''}
                          </CardDescription>
                          <div className="flex shrink-0 items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Default for</span>
                            <select
                              className="h-8 min-w-[150px] rounded border border-input bg-card px-2 text-xs text-foreground"
                              value={currentDefaultActivityForBike}
                              disabled={setActivityDefault.isPending}
                              onChange={(event) => {
                                const nextActivity = event.target.value as DefaultActivityType | '';
                                if (!nextActivity) {
                                  if (currentDefaultActivityForBike) {
                                    setActivityDefault.mutate({
                                      activityType: currentDefaultActivityForBike as DefaultActivityType,
                                      bikeId: null,
                                    });
                                  }
                                  return;
                                }

                                setActivityDefault.mutate({
                                  activityType: nextActivity,
                                  bikeId: bike.id,
                                });
                              }}
                            >
                              <option value="" className="text-slate-900">None</option>
                              {defaultActivityOptions.map((option) => (
                                <option key={option.value} value={option.value} className="text-slate-900">
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 px-3 text-base sm:px-6 sm:text-sm">
                        <BikeCardSections
                          title="Maintenance"
                          icon={ClipboardList}
                          subtitle={recommendation ? `${recommendation.title} • ${recommendation.nextAction}` : 'No active recommendation'}
                          defaultOpenMobile={false}
                          defaultOpenDesktop={false}
                          className={maintenanceSectionToneClass}
                          contentClassName="bg-transparent"
                        >
                          {recommendation ? (
                            <div className={`rounded border p-2 ${recommendationToneClass}`}>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold">{recommendation.title}</p>
                                <span className="text-xs uppercase tracking-wide">
                                  {recommendation.severity} ({recommendation.score})
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-foreground/80">{recommendation.nextAction}</p>
                              {dueCount > 0 && (
                                <div className="mt-1 space-y-1">
                                  <p className="text-xs">{dueCount} component(s) currently need maintenance.</p>
                                  <div className="space-y-1">
                                    {dueComponents.slice(0, 3).map((component: any) => (
                                      <div key={component.id} className="flex items-center justify-between gap-2">
                                        <span className="text-xs">{component.name}</span>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs"
                                          disabled={
                                            applyRecommendationAction.isPending ||
                                            completeRecommendationComponent.isPending ||
                                            !bike.isTracking
                                          }
                                          onClick={() => handleCompleteRecommendationComponent(bike.id, component.id)}
                                        >
                                          Mark done
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="mt-3 grid grid-cols-3 gap-2">
                                {recommendation.status === 'snoozed' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-10 w-full col-span-2"
                                      disabled={applyRecommendationAction.isPending || !bike.isTracking}
                                      onClick={() => handleRecommendationAction(bike.id, 'UNSNOOZE')}
                                    >
                                      Unsnooze
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="h-10 w-full"
                                      disabled={applyRecommendationAction.isPending || completeRecommendationComponent.isPending || !bike.isTracking}
                                      onClick={() => handleRecommendationAction(bike.id, 'DONE')}
                                    >
                                      Done (full service)
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-10 w-full"
                                      disabled={applyRecommendationAction.isPending || !bike.isTracking}
                                      onClick={() => handleRecommendationAction(bike.id, 'SNOOZE')}
                                    >
                                      Snooze
                                    </Button>
                                  </>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-10 w-full justify-center"
                                  onClick={() =>
                                    setOpenRecommendationBikeId((prev) => (prev === bike.id ? null : bike.id))
                                  }
                                >
                                  {openRecommendationBikeId === bike.id ? 'Hide details' : 'Details'}
                                </Button>
                              </div>

                              {openRecommendationBikeId === bike.id && (
                                <div className="mt-2 rounded border border-border/70 bg-background/60 p-2 text-sm">
                                  <p className="text-foreground/90">{recommendation.reason}</p>
                                  <p className="mt-2 font-medium text-foreground">Window: {recommendation.window}</p>
                                  <ul className="mt-1 list-disc space-y-1 pl-4 text-foreground/90">
                                    {recommendation.checks.map((check: string) => (
                                      <li key={check}>{check}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No active recommendations right now.</p>
                          )}

                          <div>
                            <p className="mb-2 text-sm text-muted-foreground">Last maintenance date</p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <input
                                type="date"
                                className="w-full rounded border border-input bg-background px-2 py-2 text-sm text-foreground"
                                value={maintenanceDates[bike.id] ?? persistedBaselineDates[bike.id] ?? ''}
                                onChange={(event) =>
                                  setMaintenanceDates((prev) => ({ ...prev, [bike.id]: event.target.value }))
                                }
                                onKeyDown={(event) => handleBaselineDateKeyDown(event, bike.id)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleRefreshRecommendations}
                                className="h-11 w-full sm:w-auto"
                              >
                                Refresh recs
                              </Button>
                            </div>
                            {bike.id in maintenanceDates && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-10 w-full"
                                  disabled={setBaselineMaintenanceDate.isPending || !(maintenanceDates[bike.id] ?? '').trim()}
                                  onClick={() => handleBaselineDateCommit(bike.id)}
                                >
                                  Save date
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-10 w-full"
                                  onClick={() => discardBaselineDateDraft(bike.id)}
                                >
                                  Discard
                                </Button>
                              </div>
                            )}
                          </div>
                        </BikeCardSections>

                        <BikeCardSections
                          title="Suspension"
                          icon={Settings2}
                          subtitle={bike.suspensionSettingsEnabled ? `${forkStatus === 'good' ? 'Fork in range' : forkStatus === 'minor' ? 'Fork service warning' : forkStatus === 'major' ? 'Fork service due' : 'Fork service date missing'}${showShockRecommendation ? ` • ${shockStatus === 'good' ? 'Shock in range' : shockStatus === 'minor' ? 'Shock service warning' : shockStatus === 'major' ? 'Shock service due' : 'Shock service date missing'}` : ''}` : 'Suspension recommendations paused'}
                          defaultOpenDesktop={false}
                          className="bg-slate-100/35 dark:bg-slate-800/30"
                          contentClassName="bg-transparent"
                        >
                          <div className={`${!bike.isTracking ? 'opacity-55' : ''} space-y-3`}>
                            {bike.suspensionSettingsEnabled ? (
                              <div className="space-y-2">
                                <div className={`rounded border p-2 ${getSuspensionToneClass(forkStatus)}`}>
                                  <p className="text-sm font-semibold">Fork service status</p>
                                  <p className="mt-1 text-xs">
                                    {forkStatus === 'missing'
                                      ? 'Set a fork last-service date to start hour-based recommendations.'
                                      : forkStatus === 'major'
                                        ? `Major fork service due: ${forkStats.hours.toFixed(1)}h (target ${forkIntervals.major}h).`
                                        : forkStatus === 'minor'
                                          ? `Minor fork service warning: ${forkStats.hours.toFixed(1)}h (target ${forkIntervals.minor}h).`
                                          : `Fork is in range: ${forkStats.hours.toFixed(1)}h since last service.`}
                                  </p>
                                </div>

                                {showShockRecommendation && (
                                  <div className={`rounded border p-2 ${getSuspensionToneClass(shockStatus)}`}>
                                    <p className="text-sm font-semibold">Shock service status</p>
                                    <p className="mt-1 text-xs">
                                      {shockStatus === 'missing'
                                        ? 'Set a shock last-service date to start hour-based recommendations.'
                                        : shockStatus === 'major'
                                          ? `Major shock service due: ${shockStats.hours.toFixed(1)}h (target ${shockIntervals.major}h).`
                                          : shockStatus === 'minor'
                                            ? `Minor shock service warning: ${shockStats.hours.toFixed(1)}h (target ${shockIntervals.minor}h).`
                                            : `Shock is in range: ${shockStats.hours.toFixed(1)}h since last service.`}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="rounded border border-slate-300/70 bg-slate-100/40 p-2 text-slate-800 dark:border-slate-700/80 dark:bg-slate-800/40 dark:text-slate-200">
                                <p className="text-sm font-semibold">Suspension recommendations paused</p>
                                <p className="mt-1 text-xs">Enable suspension setup to get fork/shock service reminders.</p>
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-foreground">Suspension setup</span>
                              <MiniSwitch
                                checked={bike.suspensionSettingsEnabled}
                                onChange={() =>
                                  toggleSuspensionSettings.mutate({
                                    bikeId: bike.id,
                                    enabled: !bike.suspensionSettingsEnabled,
                                  })
                                }
                                disabled={!bike.isTracking || toggleSuspensionSettings.isPending}
                              />
                            </div>

                            {bike.suspensionSettingsEnabled && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={!bike.isTracking || setTrackingMode.isPending}
                                  onClick={() =>
                                    setTrackingMode.mutate({
                                      bikeId: bike.id,
                                      mode: 'FORK_ONLY',
                                    })
                                  }
                                  className={`h-10 rounded-full border px-3 text-sm font-medium transition ${
                                    bike.trackingMode === 'FORK_ONLY'
                                      ? 'border-emerald-300 bg-emerald-100/80 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                      : 'border-border bg-muted/80 text-muted-foreground'
                                  } ${!bike.isTracking ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  Fork only
                                </button>
                                <button
                                  type="button"
                                  disabled={!bike.isTracking || setTrackingMode.isPending}
                                  onClick={() =>
                                    setTrackingMode.mutate({
                                      bikeId: bike.id,
                                      mode: 'FORK_AND_SHOCK',
                                    })
                                  }
                                  className={`h-10 rounded-full border px-3 text-sm font-medium transition ${
                                    bike.trackingMode === 'FORK_AND_SHOCK'
                                      ? 'border-emerald-300 bg-emerald-100/80 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                      : 'border-border bg-muted/80 text-muted-foreground'
                                  } ${!bike.isTracking ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  Fork + Shock
                                </button>
                              </div>
                            )}
                          </div>

                          {bike.suspensionSettingsEnabled && (
                          <div key={`${bike.id}-${suspensionResetTokens[bike.id] ?? 0}`} className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">Suspension details</p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Advanced</span>
                                <MiniSwitch
                                  checked={isAdvancedSuspensionEnabled}
                                  onChange={() =>
                                    setAdvancedSuspensionSettings.mutate({
                                      bikeId: bike.id,
                                      enabled: !isAdvancedSuspensionEnabled,
                                    })
                                  }
                                  disabled={!bike.isTracking || setAdvancedSuspensionSettings.isPending}
                                />
                              </div>
                            </div>
                            <div className="space-y-3 rounded border border-border bg-muted/20 p-3">
                              <p className="text-sm font-semibold text-foreground">Fork</p>
                              <input
                                  className="w-full rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                placeholder="Fork model"
                                defaultValue={bike.suspensionSettings?.model ?? ''}
                                onChange={(event) => updateSuspensionDraft(bike.id, 'model', event.target.value)}
                                onKeyDown={handleSuspensionInputKeyDown}
                                disabled={!bike.isTracking}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                  placeholder="Air PSI"
                                  defaultValue={bike.suspensionSettings?.airPressure ?? ''}
                                  onChange={(event) => updateSuspensionDraft(bike.id, 'airPressure', event.target.value)}
                                  onKeyDown={handleSuspensionInputKeyDown}
                                  disabled={!bike.isTracking}
                                />
                                <input
                                  type="date"
                                  className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground"
                                  defaultValue={bike.suspensionSettings?.lastServiceDate ? new Date(bike.suspensionSettings.lastServiceDate).toISOString().slice(0, 10) : ''}
                                  onChange={(event) => updateSuspensionDraft(bike.id, 'lastServiceDate', event.target.value)}
                                  onKeyDown={handleSuspensionInputKeyDown}
                                  disabled={!bike.isTracking}
                                />
                              </div>
                              <input
                                className="w-full rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                placeholder="Last servicer"
                                defaultValue={bike.suspensionSettings?.lastServicer ?? ''}
                                onChange={(event) => updateSuspensionDraft(bike.id, 'lastServicer', event.target.value)}
                                onKeyDown={handleSuspensionInputKeyDown}
                                disabled={!bike.isTracking}
                              />
                              <div className={`grid grid-cols-2 gap-2 ${isAdvancedSuspensionEnabled ? '' : 'hidden'}`}>
                                  <input
                                    className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                    placeholder="Rebound high-speed"
                                    defaultValue={bike.suspensionSettings?.reboundHighSpeed ?? ''}
                                    onChange={(event) => updateSuspensionDraft(bike.id, 'reboundHighSpeed', event.target.value)}
                                    onKeyDown={handleSuspensionInputKeyDown}
                                    disabled={!bike.isTracking}
                                  />
                                  <input
                                    className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                    placeholder="Rebound low-speed"
                                    defaultValue={bike.suspensionSettings?.reboundLowSpeed ?? ''}
                                    onChange={(event) => updateSuspensionDraft(bike.id, 'reboundLowSpeed', event.target.value)}
                                    onKeyDown={handleSuspensionInputKeyDown}
                                    disabled={!bike.isTracking}
                                  />
                                  <input
                                    className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                    placeholder="Compression high-speed"
                                    defaultValue={bike.suspensionSettings?.compressionHighSpeed ?? ''}
                                    onChange={(event) => updateSuspensionDraft(bike.id, 'compressionHighSpeed', event.target.value)}
                                    onKeyDown={handleSuspensionInputKeyDown}
                                    disabled={!bike.isTracking}
                                  />
                                  <input
                                    className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                    placeholder="Compression low-speed"
                                    defaultValue={bike.suspensionSettings?.compressionLowSpeed ?? ''}
                                    onChange={(event) => updateSuspensionDraft(bike.id, 'compressionLowSpeed', event.target.value)}
                                    onKeyDown={handleSuspensionInputKeyDown}
                                    disabled={!bike.isTracking}
                                  />
                                </div>
                            </div>
                            {bike.trackingMode !== 'FORK_ONLY' && (
                              <div className="space-y-3 rounded border border-border bg-muted/20 p-3">
                                <p className="text-sm font-semibold text-foreground">Shock</p>
                                <input
                                  className="w-full rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                  placeholder="Shock model"
                                  defaultValue={bike.suspensionSettings?.shockModel ?? ''}
                                  onChange={(event) => updateSuspensionDraft(bike.id, 'shockModel', event.target.value)}
                                  onKeyDown={handleSuspensionInputKeyDown}
                                  disabled={!bike.isTracking}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                    placeholder="Air PSI"
                                    defaultValue={bike.suspensionSettings?.shockAirPressure ?? ''}
                                    onChange={(event) => updateSuspensionDraft(bike.id, 'shockAirPressure', event.target.value)}
                                    onKeyDown={handleSuspensionInputKeyDown}
                                    disabled={!bike.isTracking}
                                  />
                                  <input
                                    type="date"
                                    className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground"
                                    defaultValue={bike.suspensionSettings?.shockLastServiceDate ? new Date(bike.suspensionSettings.shockLastServiceDate).toISOString().slice(0, 10) : ''}
                                    onChange={(event) => updateSuspensionDraft(bike.id, 'shockLastServiceDate', event.target.value)}
                                    onKeyDown={handleSuspensionInputKeyDown}
                                    disabled={!bike.isTracking}
                                  />
                                </div>
                                <input
                                  className="w-full rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                  placeholder="Last servicer"
                                  defaultValue={bike.suspensionSettings?.shockLastServicer ?? ''}
                                  onChange={(event) => updateSuspensionDraft(bike.id, 'shockLastServicer', event.target.value)}
                                  onKeyDown={handleSuspensionInputKeyDown}
                                  disabled={!bike.isTracking}
                                />
                                <div className={`grid grid-cols-2 gap-2 ${isAdvancedSuspensionEnabled ? '' : 'hidden'}`}>
                                    <input
                                      className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                      placeholder="Rebound high-speed"
                                      defaultValue={bike.suspensionSettings?.shockReboundHighSpeed ?? ''}
                                      onChange={(event) => updateSuspensionDraft(bike.id, 'shockReboundHighSpeed', event.target.value)}
                                      onKeyDown={handleSuspensionInputKeyDown}
                                      disabled={!bike.isTracking}
                                    />
                                    <input
                                      className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                      placeholder="Rebound low-speed"
                                      defaultValue={bike.suspensionSettings?.shockReboundLowSpeed ?? ''}
                                      onChange={(event) => updateSuspensionDraft(bike.id, 'shockReboundLowSpeed', event.target.value)}
                                      onKeyDown={handleSuspensionInputKeyDown}
                                      disabled={!bike.isTracking}
                                    />
                                    <input
                                      className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                      placeholder="Compression high-speed"
                                      defaultValue={bike.suspensionSettings?.shockCompressionHighSpeed ?? ''}
                                      onChange={(event) => updateSuspensionDraft(bike.id, 'shockCompressionHighSpeed', event.target.value)}
                                      onKeyDown={handleSuspensionInputKeyDown}
                                      disabled={!bike.isTracking}
                                    />
                                    <input
                                      className="rounded border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                                      placeholder="Compression low-speed"
                                      defaultValue={bike.suspensionSettings?.shockCompressionLowSpeed ?? ''}
                                      onChange={(event) => updateSuspensionDraft(bike.id, 'shockCompressionLowSpeed', event.target.value)}
                                      onKeyDown={handleSuspensionInputKeyDown}
                                      disabled={!bike.isTracking}
                                    />
                                  </div>
                              </div>
                            )}

                            <div className="sticky bottom-0 z-10 grid grid-cols-1 gap-2 border-t border-border bg-background/95 px-3 py-2 backdrop-blur sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:grid-cols-2">
                              <Button
                                size="sm"
                                className="h-11 w-full border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60 sm:w-auto"
                                onClick={() => handleSaveSuspensionSettings(bike)}
                                disabled={upsertSuspensionSettings.isPending || !bike.isTracking || !getSuspensionDraftIsDirty(bike.id)}
                              >
                                Save changes
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-11 w-full sm:w-auto"
                                onClick={() => discardSuspensionDraft(bike.id)}
                                disabled={!getSuspensionDraftIsDirty(bike.id)}
                              >
                                Discard
                              </Button>
                            </div>
                            {getSuspensionDraftIsDirty(bike.id) && (
                              <p className="text-sm text-amber-700 dark:text-amber-300">Unsaved suspension changes</p>
                            )}
                          </div>
                        )}

                        </BikeCardSections>

                        <BikeCardSections
                          title="Bike details"
                          icon={Bike}
                          className="bg-slate-100/35 dark:bg-slate-800/30"
                          contentClassName="bg-transparent"
                        >
                          <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Distance</span>
                            <span className="font-medium">{convertKm(bike.totalMileage).toFixed(0)} {distanceUnit.toLowerCase()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Distance (30d)</span>
                            <span className="font-medium">
                              {convertKm(
                                bike.activities
                                  .filter((activity: any) => new Date(activity.startDate) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
                                  .reduce((sum: number, activity: any) => sum + activity.distance, 0) / 1000
                              ).toFixed(0)} {distanceUnit.toLowerCase()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Components</span>
                            <span className="font-medium">{bike.components.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total hours</span>
                            <span className="font-medium">{(bike.activities.reduce((sum: number, activity: any) => sum + activity.movingTime, 0) / 3600).toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total elevation</span>
                            <span className="font-medium">
                              {((bike.activities.reduce((sum: number, activity: any) => sum + (activity.totalElevationGain ?? 0), 0) * 3.28084)).toFixed(0)} ft
                            </span>
                          </div>
                          {bike.stravaGearId && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Gear ID</span>
                              <span className="font-medium">{bike.stravaGearId}</span>
                            </div>
                          )}
                          </div>
                        </BikeCardSections>
                      </CardContent>
                    </Card>
                  );
                  })}
                </div>

                {untrackedBikes.length > 0 && (
                  <div className="mt-4 space-y-3 px-1 sm:px-0">
                    <p className="text-sm font-medium text-muted-foreground">Untracked gear</p>
                    {untrackedBikes.map((bike: any) => {
                      const currentDefaultActivityForBike =
                        defaultActivityOptions.find((option) => ((activityDefaults as any)?.[option.value] ?? null) === bike.id)?.value ?? '';

                      return (
                        <Card key={`untracked-${bike.id}`} className="bg-muted/40 dark:bg-slate-900/90 dark:border-slate-700 opacity-90 py-2 gap-2 sm:py-6 sm:gap-6">
                          <CardHeader className="px-3 pt-2 pb-1.5 sm:px-6 sm:pt-6 sm:pb-3">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-xl sm:text-lg">{bike.name}</CardTitle>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Tracking off</span>
                                <MiniSwitch
                                  checked={bike.isTracking}
                                  onChange={() =>
                                    toggleMaintenanceTracking.mutate({
                                      bikeId: bike.id,
                                      enabled: true,
                                    })
                                  }
                                  disabled={toggleMaintenanceTracking.isPending}
                                />
                              </div>
                            </div>
                            <div className="mt-2 flex items-start justify-between gap-3">
                              <CardDescription className="min-w-0 pr-2">
                                {[bike.brand, bike.model].filter(Boolean).join(' ')} {bike.year ? `(${bike.year})` : ''}
                              </CardDescription>
                              <div className="flex shrink-0 items-center gap-2 text-xs">
                                <span className="text-muted-foreground">Default for</span>
                                <select
                                  className="h-8 min-w-[150px] rounded border border-input bg-card px-2 text-xs text-foreground"
                                value={currentDefaultActivityForBike}
                                disabled={setActivityDefault.isPending}
                                onChange={(event) => {
                                  const nextActivity = event.target.value as DefaultActivityType | '';
                                  if (!nextActivity) {
                                    if (currentDefaultActivityForBike) {
                                      setActivityDefault.mutate({
                                        activityType: currentDefaultActivityForBike as DefaultActivityType,
                                        bikeId: null,
                                      });
                                    }
                                    return;
                                  }

                                  setActivityDefault.mutate({
                                    activityType: nextActivity,
                                    bikeId: bike.id,
                                  });
                                }}
                              >
                                <option value="" className="text-slate-900">None</option>
                                {defaultActivityOptions.map((option) => (
                                  <option key={option.value} value={option.value} className="text-slate-900">
                                    {option.label}
                                  </option>
                                ))}
                                </select>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2 px-3 text-base sm:px-6 sm:text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Distance</span>
                              <span className="font-medium">{convertKm(bike.totalMileage).toFixed(0)} {distanceUnit.toLowerCase()}</span>
                            </div>
                            <div className="pt-2 border-t">
                              <p className="text-xs text-muted-foreground">
                                Tracking is paused. Enable tracking to move this bike back to active cards.
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="px-1 sm:px-0 text-sm text-muted-foreground">No bikes yet. Add your first bike to start tracking.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
