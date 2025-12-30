import { Card, Player, ResourceType, RoundRequirement, RequirementType, PlayedSet } from '../types';
import { RESOURCE_CONFIG, MASH_PROBABILITIES } from '../constants';

// --- Generation Helpers ---

export const generateId = () => Math.random().toString(36).substr(2, 9);

const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const generateHand = (): Card[] => {
  let hand: Card[] = [];
  Object.values(ResourceType).forEach((type) => {
    const config = RESOURCE_CONFIG[type];
    const count = getRandomInt(config.min, config.max);
    for (let i = 0; i < count; i++) {
      hand.push({
        id: generateId(),
        type,
        level: getRandomInt(1, 7), // Level 1-7
      });
    }
  });
  return hand.sort((a, b) => (a.type === b.type ? a.level - b.level : a.type.localeCompare(b.type)));
};

export const createPlayers = (): Player[] => {
  return Array.from({ length: 4 }).map((_, i) => ({
    id: `P${i + 1}`,
    name: i === 0 ? '玩家 1 (你)' : `电脑 ${i}`,
    isHuman: i === 0,
    hand: generateHand(),
    medals: 0,
    passedThisRound: false,
  }));
};

// --- Logic Helpers ---

export const calculateHandValue = (hand: Card[]) => hand.reduce((sum, c) => sum + c.level, 0);

export const validateMove = (
  selectedCards: Card[],
  lastPlayed: PlayedSet | null,
  req: RoundRequirement | null
): { valid: boolean; reason?: string } => {
  if (!req) return { valid: false, reason: "未设置本轮规则。" };
  
  // 1. Check Count
  if (selectedCards.length !== req.count) {
    return { valid: false, reason: `必须打出 ${req.count} 张牌。` };
  }

  // 2. Check Type Requirement
  if (req.type === RequirementType.SINGLE_FIXED || req.type === RequirementType.SINGLE_ASC) {
    const invalidType = selectedCards.find(c => c.type !== req.resourceType);
    if (invalidType) return { valid: false, reason: `所有牌必须是 ${RESOURCE_CONFIG[req.resourceType!].label}。` };
  }

  // 3. Check Ascending Logic
  if (req.type === RequirementType.SINGLE_ASC || req.type === RequirementType.MIXED_ASC) {
    const levels = selectedCards.map(c => c.level).sort((a, b) => a - b);
    for (let i = 0; i < levels.length - 1; i++) {
      if (levels[i] >= levels[i+1]) {
        return { valid: false, reason: "牌点数必须严格递增 (如 1, 2, 3)。" };
      }
    }
  }

  // 4. Compare with Last Played (Match or Beat)
  if (lastPlayed) {
    const currentSum = selectedCards.reduce((acc, c) => acc + c.level, 0);
    const lastSum = lastPlayed.cards.reduce((acc, c) => acc + c.level, 0);

    // Rule: Must be >= previous sum
    if (currentSum < lastSum) {
      return { valid: false, reason: `总点数 (${currentSum}) 必须 >= 上一家 (${lastSum})。` };
    }
  }

  return { valid: true };
};

// --- AI Logic ---

export const getAIMove = (player: Player, lastPlayed: PlayedSet | null, req: RoundRequirement): Card[] | null => {
  // Simple AI: Try to find the lowest valid combination
  // If no requirement (AI is dealer setting cards), AI just plays a random valid single card to start (handled in main loop logic usually, but here handled by separate dealer logic).
  
  if (!req) return null;

  // Filter possible cards based on type requirement
  let candidateCards = [...player.hand];
  if (req.type === RequirementType.SINGLE_FIXED || req.type === RequirementType.SINGLE_ASC) {
    candidateCards = candidateCards.filter(c => c.type === req.resourceType);
  }

  // Generate combinations of size req.count
  const combinations = getCombinations(candidateCards, req.count);

  // Filter for valid moves
  const validMoves = combinations.filter(combo => validateMove(combo, lastPlayed, req).valid);

  if (validMoves.length === 0) return null; // Pass

  // Sort valid moves by "cost" (sum of levels), pick the cheapest one to save strong cards
  validMoves.sort((a, b) => {
    const sumA = a.reduce((sum, c) => sum + c.level, 0);
    const sumB = b.reduce((sum, c) => sum + c.level, 0);
    return sumA - sumB;
  });

  return validMoves[0];
};

export const getAIDealerRequirement = (player: Player): RoundRequirement => {
  // AI Dealer Strategy: Look at hand, pick the most abundant type or random
  const counts = {
    [ResourceType.SOLDIER]: 0,
    [ResourceType.TOWER]: 0,
    [ResourceType.FARM]: 0,
    [ResourceType.ORE]: 0,
  };
  player.hand.forEach(c => counts[c.type]++);

  // Find most abundant
  let bestType = ResourceType.SOLDIER;
  let maxCount = -1;
  (Object.keys(counts) as ResourceType[]).forEach(t => {
    if (counts[t] > maxCount) {
      maxCount = counts[t];
      bestType = t;
    }
  });

  // Decide mode randomly but weighted towards simple
  const rand = Math.random();
  let type = RequirementType.SINGLE_FIXED;
  let count = 1;

  if (rand > 0.8 && player.hand.length >= 3) {
      type = RequirementType.MIXED_ASC;
      count = 3;
  } else if (rand > 0.6 && maxCount >= 2) {
      type = RequirementType.SINGLE_ASC;
      count = Math.min(maxCount, 2);
  } else {
      type = RequirementType.SINGLE_FIXED;
      count = Math.min(maxCount, 2); // Play 1 or 2 cards
  }

  return {
    type,
    resourceType: bestType,
    count: Math.max(1, count),
    description: `电脑选择: ${type} (${count} 张)`
  };
};

// Helper: combinatorics
function getCombinations<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];

  function backtrack(start: number, current: T[]) {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      backtrack(i + 1, [...current, array[i]]);
    }
  }

  backtrack(0, []);
  return result;
}

export const mashCard = (card: Card): Card => {
  const rand = Math.random();
  let newLevel = card.level;

  // Use thresholds based on cumulative probability
  // 0 ... BETTER ... (BETTER+WORSE) ... 1
  
  if (rand < MASH_PROBABILITIES.BETTER) {
    // Better (Probability: BETTER)
    newLevel = Math.min(7, card.level + 1); // Max Level 7
  } else if (rand < MASH_PROBABILITIES.BETTER + MASH_PROBABILITIES.WORSE) { 
    // Worse (Probability: WORSE)
    newLevel = Math.max(1, card.level - 1);
  }
  // Else Same (Probability: SAME)

  return { ...card, level: newLevel };
};