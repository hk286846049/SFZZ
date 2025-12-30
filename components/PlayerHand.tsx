import React from 'react';
import { Card, ResourceType } from '../types';
import { CardItem } from './CardItem';

interface PlayerHandProps {
  hand: Card[];
  selectedCards: string[];
  onToggleCard: (card: Card) => void;
  disabled: boolean;
}

export const PlayerHand: React.FC<PlayerHandProps> = ({ 
  hand, selectedCards, onToggleCard, disabled 
}) => {
  
  // Group cards by type for better UX
  const groupedCards: Record<string, Card[]> = {
    [ResourceType.SOLDIER]: [],
    [ResourceType.TOWER]: [],
    [ResourceType.FARM]: [],
    [ResourceType.ORE]: [],
  };

  hand.forEach(c => groupedCards[c.type].push(c));

  return (
    <div className={`p-4 bg-slate-800 rounded-t-xl transition-opacity ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex flex-wrap justify-center gap-6">
        {Object.entries(groupedCards).map(([type, cards]) => {
          if (cards.length === 0) return null;
          return (
            <div key={type} className="flex -space-x-4 hover:-space-x-3 transition-all duration-300">
              {cards.map(card => (
                <CardItem 
                  key={card.id} 
                  card={card} 
                  selected={selectedCards.includes(card.id)}
                  onClick={() => onToggleCard(card)}
                />
              ))}
            </div>
          );
        })}
        {hand.length === 0 && (
          <div className="text-slate-500 italic">手牌已耗尽</div>
        )}
      </div>
    </div>
  );
};