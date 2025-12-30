import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Player, Card, GamePhase, RoundRequirement, PlayedSet, LogEntry, ResourceType 
} from './types';
import { 
  createPlayers, calculateHandValue, validateMove, getAIMove, 
  getAIDealerRequirement, generateId, mashCard 
} from './services/gameLogic';
import { PLAYERS_COUNT, AI_DELAY_MS, RESOURCE_CONFIG } from './constants';
import { PlayerHand } from './components/PlayerHand';
import { CardItem } from './components/CardItem';
import { GameLog } from './components/GameLog';
import { DealerModal } from './components/DealerModal';

export default function App() {
  // --- State ---
  const [players, setPlayers] = useState<Player[]>([]);
  const [phase, setPhase] = useState<GamePhase>(GamePhase.INIT);
  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(0);
  const [dealerIndex, setDealerIndex] = useState<number>(0);
  const [roundRequirement, setRoundRequirement] = useState<RoundRequirement | null>(null);
  const [tableStack, setTableStack] = useState<PlayedSet[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [roundNumber, setRoundNumber] = useState(1);
  const [winner, setWinner] = useState<Player | null>(null);

  const addLog = (text: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { id: generateId(), text, type }]);
  };

  // --- Initialization ---
  useEffect(() => {
    if (phase === GamePhase.INIT) {
      const newPlayers = createPlayers();
      setPlayers(newPlayers);
      
      // Determine Initial Dealer (Highest total points)
      let maxPoints = -1;
      let startIdx = 0;
      newPlayers.forEach((p, idx) => {
        const val = calculateHandValue(p.hand);
        if (val > maxPoints) {
          maxPoints = val;
          startIdx = idx;
        }
      });

      setDealerIndex(startIdx);
      setActivePlayerIndex(startIdx);
      addLog("游戏初始化完成，已发牌。", 'info');
      addLog(`${newPlayers[startIdx].name} 资源最多，成为首轮领出者。`, 'action');
      setPhase(GamePhase.DEALER_SELECTION);
    }
  }, [phase]);

  // --- AI Logic Loop ---
  useEffect(() => {
    // Only run AI logic if players are initialized
    if (players.length === 0) return;

    if (phase !== GamePhase.PLAYING && phase !== GamePhase.DEALER_SELECTION) return;

    const currentPlayer = players[activePlayerIndex];
    if (!currentPlayer) return;
    
    // AI Dealer Turn
    if (phase === GamePhase.DEALER_SELECTION && !currentPlayer.isHuman) {
      const timer = setTimeout(() => {
        const aiReq = getAIDealerRequirement(currentPlayer);
        handleDealerSubmit(aiReq);
      }, AI_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // AI Playing Turn
    if (phase === GamePhase.PLAYING && !currentPlayer.isHuman && !currentPlayer.passedThisRound) {
      const timer = setTimeout(() => {
        if (!roundRequirement) return;
        const lastMove = tableStack.length > 0 ? tableStack[tableStack.length - 1] : null;
        
        // Check if AI is the stack owner (meaning everyone else passed back to AI)
        // In that case, AI wins the round.
        if (lastMove && lastMove.playerId === currentPlayer.id) {
           handleRoundEnd(currentPlayer.id);
           return;
        }

        const move = getAIMove(currentPlayer, lastMove, roundRequirement);

        if (move) {
          executePlay(currentPlayer.id, move);
        } else {
          executePass(currentPlayer.id);
        }
      }, AI_DELAY_MS);
      return () => clearTimeout(timer);
    } else if (phase === GamePhase.PLAYING && currentPlayer.passedThisRound) {
        // Skip passed player immediately (with small delay for visual clarity or instant)
        // Need to pass current state to advanceTurn
        advanceTurn(players, tableStack, activePlayerIndex);
    }
  }, [phase, activePlayerIndex, players, tableStack, roundRequirement]);


  // --- Logic Helpers ---

  const advanceTurn = (currentPlayers: Player[], currentStack: PlayedSet[], currentActiveIndex: number) => {
    let nextIndex = (currentActiveIndex + 1) % PLAYERS_COUNT;
    let foundNext = false;
    let winnerFound: string | null = null;

    const lastStackItem = currentStack.length > 0 ? currentStack[currentStack.length - 1] : null;

    // We loop up to PLAYERS_COUNT times to find the next eligible player
    for (let i = 0; i < PLAYERS_COUNT; i++) {
      const p = currentPlayers[nextIndex];

      // Win Condition: The turn returns to the player who owns the top of the stack.
      // This means everyone else has passed since their last play.
      if (lastStackItem && p.id === lastStackItem.playerId) {
        winnerFound = p.id;
        break;
      }

      // Found a player who hasn't passed
      if (!p.passedThisRound) {
        setActivePlayerIndex(nextIndex);
        foundNext = true;
        break;
      }

      nextIndex = (nextIndex + 1) % PLAYERS_COUNT;
    }

    if (winnerFound) {
      handleRoundEnd(winnerFound);
    } else if (!foundNext) {
      // Edge case: Everyone passed? (Should be covered by winnerFound logic if stack not empty)
      // If stack is empty and everyone passes (dealer passes?), dealer wins?
      // Or if stack has items, the owner wins.
      if (lastStackItem) {
         handleRoundEnd(lastStackItem.playerId);
      } else {
         // Should not happen in normal flow, but safety net:
         // If dealer passes on empty stack, next player becomes dealer effectively? 
         // Let's just pass turn.
         const nextIdx = (currentActiveIndex + 1) % PLAYERS_COUNT;
         setActivePlayerIndex(nextIdx);
      }
    }
  };

  // --- Actions ---

  const handleDealerSubmit = (req: RoundRequirement) => {
    setRoundRequirement(req);
    addLog(`${players[dealerIndex].name} 制定规则: ${req.description}`, 'alert');
    setPhase(GamePhase.PLAYING);
    setTableStack([]);
    
    // Reset passes for new round
    setPlayers(prev => prev.map(p => ({ ...p, passedThisRound: false })));
  };

  const executePlay = (playerId: string, cards: Card[]) => {
    // Calculate new states
    const playerIdx = players.findIndex(p => p.id === playerId);
    const player = players[playerIdx];
    const cardIds = cards.map(c => c.id);
    const newHand = player.hand.filter(c => !cardIds.includes(c.id));

    const updatedPlayers = [...players];
    updatedPlayers[playerIdx] = { ...updatedPlayers[playerIdx], hand: newHand };

    const newStackItem: PlayedSet = { playerId, cards, timestamp: Date.now() };
    const updatedStack = [...tableStack, newStackItem];

    // Apply updates
    setPlayers(updatedPlayers);
    setTableStack(updatedStack);
    setSelectedCardIds([]); 
    addLog(`${player.name} 打出了 ${cards.length} 张牌。`, 'action');

    // Check for Game End (Hand Empty)
    if (newHand.length === 0) {
      handleGameEnd(playerId);
      return;
    }

    // Advance
    advanceTurn(updatedPlayers, updatedStack, activePlayerIndex);
  };

  const executePass = (playerId: string) => {
    const playerIdx = players.findIndex(p => p.id === playerId);
    
    const updatedPlayers = [...players];
    updatedPlayers[playerIdx] = { ...updatedPlayers[playerIdx], passedThisRound: true };
    
    setPlayers(updatedPlayers);
    addLog(`${players[playerIdx].name} 选择放弃 (Pass)。`, 'info');
    
    advanceTurn(updatedPlayers, tableStack, activePlayerIndex);
  };

  const handleRoundEnd = (winnerId: string) => {
    const winnerName = players.find(p => p.id === winnerId)?.name || '未知';
    addLog(`第 ${roundNumber} 轮结束！获胜者: ${winnerName}`, 'success');
    
    // Award Medal
    setPlayers(prev => prev.map(p => 
      p.id === winnerId ? { ...p, medals: p.medals + 1 } : p
    ));

    // Set new dealer
    const winnerIdx = players.findIndex(p => p.id === winnerId);
    setDealerIndex(winnerIdx);
    setActivePlayerIndex(winnerIdx);
    setRoundNumber(r => r + 1);
    
    // Reset Round
    setPhase(GamePhase.DEALER_SELECTION);
    setRoundRequirement(null);
    setTableStack([]);
    setPlayers(prev => prev.map(p => ({ ...p, passedThisRound: false })));
  };

  const handleGameEnd = (winnerId: string) => {
    setPhase(GamePhase.GAME_END);
    
    setPlayers(currentPlayers => {
        const sorted = [...currentPlayers].sort((a, b) => b.medals - a.medals);
        setWinner(sorted[0]);
        addLog(`游戏结束！最终赢家: ${sorted[0].name}`, 'success');
        return currentPlayers;
    });
  };

  // --- Interaction Handlers ---

  const handleToggleCard = (card: Card) => {
    if (phase !== GamePhase.PLAYING || activePlayerIndex !== 0) return;
    
    setSelectedCardIds(prev => 
      prev.includes(card.id) ? prev.filter(id => id !== card.id) : [...prev, card.id]
    );
  };

  const handleHumanPlay = () => {
    const player = players[0];
    const selectedCards = player.hand.filter(c => selectedCardIds.includes(c.id));
    const lastMove = tableStack.length > 0 ? tableStack[tableStack.length - 1] : null;

    const validation = validateMove(selectedCards, lastMove, roundRequirement);
    if (!validation.valid) {
      addLog(`出牌无效: ${validation.reason}`, 'alert');
      return;
    }

    executePlay(player.id, selectedCards);
  };

  const handleHumanMash = (card: Card) => {
    const newCard = mashCard(card);
    setPlayers(prev => {
      const copy = [...prev];
      const p1 = { ...copy[0] };
      p1.hand = p1.hand.map(c => c.id === card.id ? newCard : c);
      copy[0] = p1;
      return copy;
    });

    const diff = newCard.level - card.level;
    if (diff > 0) addLog("搓牌成功！点数升级！", 'success');
    else if (diff < 0) addLog("搓牌失败！点数下降...", 'alert');
  };

  // --- Render Guards ---
  
  // Guard against uninitialized state
  if (players.length === 0) {
    return (
      <div className="h-screen bg-slate-900 text-slate-100 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
           <div className="text-4xl mb-4">🃏</div>
           <div className="text-xl font-bold">正在初始化资源对战...</div>
        </div>
      </div>
    );
  }

  // --- UI Helpers ---
  const activePlayer = players[activePlayerIndex];
  const isHumanTurn = activePlayerIndex === 0 && phase === GamePhase.PLAYING;
  const isHumanDealer = activePlayerIndex === 0 && phase === GamePhase.DEALER_SELECTION;

  // Calculate Last Played Cards UI
  const lastPlayedCards = tableStack.length > 0 ? tableStack[tableStack.length - 1].cards : [];
  const lastPlayedPlayer = tableStack.length > 0 ? players.find(p => p.id === tableStack[tableStack.length - 1].playerId) : null;

  if (phase === GamePhase.GAME_END) {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
              <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl text-center max-w-2xl w-full border border-slate-700">
                  <h1 className="text-5xl font-bold text-yellow-400 mb-6">游戏结束</h1>
                  <div className="text-2xl text-white mb-8">
                      获胜者: <span className="font-bold text-emerald-400">{winner?.name}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-4 mb-8">
                      {players.map(p => (
                          <div key={p.id} className="bg-slate-700 p-4 rounded-lg">
                              <div className="font-bold text-slate-300">{p.name}</div>
                              <div className="text-3xl mt-2">🏅 {p.medals}</div>
                          </div>
                      ))}
                  </div>
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold"
                  >
                      再玩一次
                  </button>
              </div>
          </div>
      )
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-100 overflow-hidden">
      
      {/* --- Top Bar --- */}
      <header className="flex-none bg-slate-800 p-3 shadow-md flex justify-between items-center z-10 border-b border-slate-700">
        <div className="flex items-center space-x-6">
          <div className="bg-slate-700 px-3 py-1 rounded text-sm font-mono">第 {roundNumber} 轮</div>
          <div className="text-sm">
             领出者: <span className="text-yellow-400 font-bold">{players[dealerIndex]?.name}</span>
          </div>
          {roundRequirement && (
            <div className="flex items-center gap-2 bg-blue-900/40 px-3 py-1 rounded border border-blue-500/30">
               <span className="text-blue-300 text-xs uppercase tracking-wider font-bold">本轮规则</span>
               <span className="font-medium text-blue-100">{roundRequirement.description}</span>
            </div>
          )}
        </div>
        <div className="text-xs text-slate-400">终局资源博弈 Demo</div>
      </header>

      {/* --- Main Game Area --- */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left/Center: Battle Area */}
        <div className="flex-1 flex flex-col relative">
          
          {/* Opponents Area (Top of Play Area) */}
          <div className="flex justify-around p-4">
            {players.slice(1).map((p, idx) => (
              <div key={p.id} className={`
                 flex flex-col items-center p-3 rounded-lg transition-all
                 ${activePlayerIndex === idx + 1 ? 'bg-yellow-500/10 ring-2 ring-yellow-500' : 'bg-slate-800/50'}
                 ${p.passedThisRound ? 'opacity-40 grayscale' : ''}
              `}>
                 <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center mb-2 shadow-inner">
                    Bot
                 </div>
                 <div className="text-sm font-bold">{p.name}</div>
                 <div className="text-xs text-slate-400 mt-1">手牌: {p.hand.length}</div>
                 <div className="text-xs text-yellow-500 mt-1">🏅 {p.medals}</div>
                 {p.passedThisRound && <span className="text-red-400 font-bold text-xs mt-1">已放弃</span>}
              </div>
            ))}
          </div>

          {/* Table Center (Played Stack) */}
          <div className="flex-1 flex flex-col items-center justify-center relative">
            {tableStack.length === 0 ? (
               <div className="text-slate-600 font-bold text-2xl border-4 border-dashed border-slate-700 rounded-2xl p-8">
                  桌面空空如也
               </div>
            ) : (
               <div className="relative animate-in zoom-in duration-300">
                  <div className="absolute -top-10 left-0 w-full text-center text-sm text-slate-400">
                     上一手出牌: <span className="text-white font-bold">{lastPlayedPlayer?.name}</span>
                  </div>
                  <div className="flex -space-x-4">
                     {lastPlayedCards.map(c => (
                        <CardItem key={c.id} card={c} />
                     ))}
                  </div>
               </div>
            )}
            
            {/* Active Player Indicator */}
            {activePlayer && (
                <div className="absolute bottom-4 text-center animate-pulse">
                    <span className="text-xs uppercase tracking-widest text-slate-500">当前回合</span>
                    <div className="text-xl font-bold text-yellow-400">{activePlayer.name}</div>
                </div>
            )}
          </div>

          {/* Player Hand Area (Bottom) */}
          <div className="flex-none bg-slate-850 border-t border-slate-700 z-20">
             
             {/* Action Bar */}
             <div className="flex justify-between items-center px-6 py-2 bg-slate-800 border-b border-slate-700 h-14">
                <div className="text-sm text-slate-400">
                   你的奖牌: <span className="text-yellow-400 font-bold text-lg ml-1">{players[0].medals}</span>
                </div>
                
                <div className="flex gap-3">
                   <button 
                     onClick={() => executePass(players[0].id)}
                     disabled={!isHumanTurn}
                     className="px-4 py-1.5 rounded bg-red-600/20 text-red-200 border border-red-600 hover:bg-red-600 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                   >
                     放弃 (Pass)
                   </button>
                   <button 
                     onClick={handleHumanPlay}
                     disabled={!isHumanTurn || selectedCardIds.length === 0}
                     className="px-6 py-1.5 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition shadow-lg disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
                   >
                     出牌
                   </button>
                </div>
             </div>

             {/* Cards */}
             <PlayerHand 
               hand={players[0].hand} 
               selectedCards={selectedCardIds}
               onToggleCard={handleToggleCard}
               onMashCard={handleHumanMash}
               disabled={!isHumanTurn && !isHumanDealer} 
             />
          </div>
        </div>

        {/* Right: Sidebar */}
        <div className="w-64 bg-slate-900 border-l border-slate-700 p-4 flex flex-col gap-4">
           {/* Requirement Summary */}
           <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
              <h3 className="text-xs uppercase font-bold text-slate-500 mb-2">当前规则</h3>
              {roundRequirement ? (
                  <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                          <span className="text-slate-400">类型:</span>
                          <span className="text-right text-white">{roundRequirement.type.split('(')[0]}</span>
                      </div>
                      {roundRequirement.resourceType && (
                        <div className="flex justify-between">
                            <span className="text-slate-400">资源:</span>
                            <span className="text-right text-white">{RESOURCE_CONFIG[roundRequirement.resourceType].label}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                          <span className="text-slate-400">数量:</span>
                          <span className="text-right text-yellow-400 font-bold">{roundRequirement.count}</span>
                      </div>
                  </div>
              ) : (
                  <div className="text-slate-500 text-sm italic">等待领出者制定规则...</div>
              )}
           </div>

           {/* Logs */}
           <div className="flex-1 min-h-0">
               <GameLog logs={logs} />
           </div>
        </div>

      </main>

      {/* Dealer Modal */}
      <DealerModal 
        isOpen={isHumanDealer}
        onSubmit={handleDealerSubmit}
      />
    </div>
  );
}