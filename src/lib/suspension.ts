export type SuspensionServiceTier = 'LOWER_LEG_OR_AIR_CAN' | 'DAMPER_OR_FULL';

export type SuspensionProfile = {
  key: string;
  label: string;
  tier: SuspensionServiceTier;
  everyKm: number;
  note: string;
};

export const defaultSuspensionProfiles: SuspensionProfile[] = [
  {
    key: 'fork-lower-leg',
    label: 'Fork lower leg service',
    tier: 'LOWER_LEG_OR_AIR_CAN',
    everyKm: 2000,
    note: 'Baseline interval. Shorten for wet/muddy riding conditions.',
  },
  {
    key: 'shock-air-can',
    label: 'Shock air can service',
    tier: 'LOWER_LEG_OR_AIR_CAN',
    everyKm: 2000,
    note: 'Matches common air can service guidance for trail riding.',
  },
  {
    key: 'fork-damper',
    label: 'Fork damper/full service',
    tier: 'DAMPER_OR_FULL',
    everyKm: 6000,
    note: 'Recommended full interval for reliability and performance.',
  },
  {
    key: 'shock-full',
    label: 'Shock full service',
    tier: 'DAMPER_OR_FULL',
    everyKm: 6000,
    note: 'Use shorter intervals for heavy use or bike-park days.',
  },
];

export const getNextServiceKm = (lastServiceKm: number, intervalKm: number) => {
  if (lastServiceKm < 0 || intervalKm <= 0) return 0;
  return Math.round(lastServiceKm + intervalKm);
};
