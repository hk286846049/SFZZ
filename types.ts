export enum ResourceType {
  SOLDIER = 'Soldier',
  TOWER = 'Tower',
  FARM = 'Farm',
  ORE = 'Ore',
}

export interface Card {
  id: string;
  type: ResourceType;
  level: number; // 1-7
}

export interface Player {
  id: string;
  name: string;
  isHuman: boolean;
  hand: Card[];
  medals: number;
  passedThisRound: boolean;
}

export enum RequirementType {
  SINGLE_FIXED = '单类型 (固定数量)',
  SINGLE_ASC = '单类型 (点数递增)',
  MIXED_ASC = '混合类型 (点数递增)',
}

export interface RoundRequirement {
  type: RequirementType;
  resourceType?: ResourceType; // For Single types
  count: number; // How many cards required
  description: string;
}

export interface PlayedSet {
  playerId: string;
  cards: Card[];
  timestamp: number;
}

export enum GamePhase {
  INIT = 'INIT',
  DEALER_SELECTION = 'DEALER_SELECTION', // Dealer picks requirement
  PLAYING = 'PLAYING',
  ROUND_END = 'ROUND_END',
  GAME_END = 'GAME_END',
}

export interface LogEntry {
  id: string;
  text: string;
  type: 'info' | 'action' | 'alert' | 'success';
}