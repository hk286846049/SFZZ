import { ResourceType } from './types';

export const PLAYERS_COUNT = 4;

export const RESOURCE_CONFIG = {
  [ResourceType.SOLDIER]: { min: 3, max: 8, color: 'bg-red-500', text: 'text-red-100', icon: '⚔️', label: '士兵' },
  [ResourceType.TOWER]: { min: 2, max: 6, color: 'bg-slate-500', text: 'text-slate-100', icon: '🏰', label: '塔防' },
  [ResourceType.FARM]: { min: 3, max: 8, color: 'bg-emerald-600', text: 'text-emerald-100', icon: '🌾', label: '农场' },
  [ResourceType.ORE]: { min: 3, max: 8, color: 'bg-indigo-500', text: 'text-indigo-100', icon: '💎', label: '矿石' },
};

export const MASH_PROBABILITIES = {
  SAME: 0.80,
  WORSE: 0.05,
  BETTER: 0.15
};

export const AI_DELAY_MS = 1200;