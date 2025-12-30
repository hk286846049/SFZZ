import React from 'react';
import { Card } from '../types';
import { RESOURCE_CONFIG } from '../constants';

interface CardItemProps {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
}

export const CardItem: React.FC<CardItemProps> = ({ card, selected, onClick, small }) => {
  const config = RESOURCE_CONFIG[card.type];
  const sizeClasses = small 
    ? "w-10 h-14 text-xs" 
    : "w-16 h-24 sm:w-20 sm:h-28 text-sm sm:text-base";

  return (
    <div 
      onClick={onClick}
      className={`
        relative rounded-lg shadow-md border-2 transition-all duration-200 cursor-pointer select-none
        flex flex-col items-center justify-center
        ${config.color} ${config.text}
        ${selected ? 'border-yellow-400 -translate-y-4 ring-2 ring-yellow-400 z-20' : 'border-slate-700 hover:-translate-y-4 hover:z-10'}
        ${sizeClasses}
      `}
    >
      <div className="font-bold">{card.level}</div>
      <div className="text-lg sm:text-2xl">{config.icon}</div>
    </div>
  );
};