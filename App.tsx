import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Player, Card, GamePhase, RoundRequirement, RequirementType, PlayedSet, LogEntry, ResourceType 
} from './types';
import { 
  createPlayers, calculateHandValue, validateMove, getAIMove, 
  getAIDealerRequirement, generateId, mashCard 
} from './services/gameLogic';
import { PLAYERS_COUNT, AI_DELAY_MS, RESOURCE_CONFIG, MASH_COOLDOWN_MS } from './constants';
import { PlayerHand } from './components/PlayerHand';
import { CardItem } from './components/CardItem';
import { GameLog } from './components/GameLog';

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

  // Timer State
  const [timeLeft, setTimeLeft] = useState(15);

  // Mash Mechanics State
  const [mashCooldown, setMashCooldown] = useState(false);
  const [mashProgress, setMashProgress] = useState(0);
  const [lastMashKey, setLastMashKey] = useState<string | null>(null);

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

  // --- Timer Logic ---
  useEffect(() => {
    if ((phase !== GamePhase.PLAYING && phase !== GamePhase.DEALER_SELECTION) || players.length === 0) return;
    
    // Reset time when active player changes
    setTimeLeft(15);
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Trigger timeout action
          handleTurnTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activePlayerIndex, phase, roundNumber]); // Depend on turn change indicators

  const handleTurnTimeout = () => {
    const player = players[activePlayerIndex];
    if (!player) return;

    // Only handle for Human here (Bots have their own delay loop, but this acts as safety fallback or UI sync)
    if (player.isHuman) {
       addLog("⏰ 操作超时！自动托管中...", 'alert');
       
       if (phase === GamePhase.DEALER_SELECTION) {
           // Auto-play the smallest single card to start
           const sortedHand = [...player.hand].sort((a, b) => a.level - b.level);
           const smallestCard = sortedHand[0];
           
           if (smallestCard) {
               const autoReq = {
                   type: RequirementType.SINGLE_FIXED,
                   resourceType: smallestCard.type,
                   count: 1,
                   description: `超时自动: 1 张 ${RESOURCE_CONFIG[smallestCard.type].label}`
               };
               setRoundRequirement(autoReq);
               setPhase(GamePhase.PLAYING);
               setTableStack([]);
               setPlayers(prev => prev.map(p => ({ ...p, passedThisRound: false })));
               // Use current 'players' state as it is human turn and no race with bot logic
               executePlay(player.id, [smallestCard], players); 
           }
       } else {
           // Auto Play Best Move or Pass
           if (roundRequirement) {
                const lastMove = tableStack.length > 0 ? tableStack[tableStack.length - 1] : null;
                const bestMove = getAIMove(player, lastMove, roundRequirement);

                if (bestMove) {
                    executePlay(player.id, bestMove, players);
                } else {
                    executePass(player.id, players);
                }
           } else {
                executePass(player.id, players);
           }
       }
    }
  };

  // --- Keyboard Listener for Human Mashing ---
  useEffect(() => {
    // Allow mashing if it's human turn (Play or Dealer)
    const isHumanTurn = activePlayerIndex === 0 && (phase === GamePhase.PLAYING || phase === GamePhase.DEALER_SELECTION);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Logic: Must be human turn, 1 card selected, not on cooldown
      if (!isHumanTurn || selectedCardIds.length !== 1 || mashCooldown) return;

      const key = e.key.toLowerCase();
      if (key === 'a' || key === 'd') {
        // Must alternate keys
        if (key !== lastMashKey) {
          setLastMashKey(key);
          setMashProgress(prev => {
             const next = prev + 15; // ~7 presses to complete
             if (next >= 100) {
               // Trigger Mash
               const card = players[0].hand.find(c => c.id === selectedCardIds[0]);
               if (card) handleHumanMash(card);
               return 0;
             }
             return next;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePlayerIndex, phase, selectedCardIds, mashCooldown, lastMashKey, players]);

  // --- AI Logic Loop ---
  useEffect(() => {
    if (players.length === 0) return;
    if (phase !== GamePhase.PLAYING && phase !== GamePhase.DEALER_SELECTION) return;

    const currentPlayer = players[activePlayerIndex];
    if (!currentPlayer || currentPlayer.isHuman) return;

    // AI Logic Wrapper
    const runAITurn = () => {
        // Create a snapshot of players to modify in this turn
        let currentPlayersSnapshot = [...players];
        let currentPlayerState = { ...currentPlayersSnapshot[activePlayerIndex] };
        
        // --- Bot Cheating Logic ---
        // Increased probability to 40% for visibility
        if (Math.random() < 0.40 && currentPlayerState.hand.length > 0) {
           const cardIdx = Math.floor(Math.random() * currentPlayerState.hand.length);
           const originalCard = currentPlayerState.hand[cardIdx];
           const mashedCard = mashCard(originalCard);

           // Apply change locally to the snapshot
           currentPlayerState.hand = [...currentPlayerState.hand];
           currentPlayerState.hand[cardIdx] = mashedCard;
           
           // Update snapshot
           currentPlayersSnapshot[activePlayerIndex] = currentPlayerState;

           // Log if beneficial
           if (mashedCard.level > originalCard.level) {
             addLog(`${currentPlayer.name} 似乎在袖子里藏了什么东西... (出千成功)`, 'alert');
           }
        }

        // --- AI Dealer Phase ---
        if (phase === GamePhase.DEALER_SELECTION) {
            const aiReq = getAIDealerRequirement(currentPlayerState);
            handleDealerSubmit(aiReq);
            
            // NOTE: handleDealerSubmit sets state async. 
            // We need to re-find the move with the *new* requirement.
            // Since AI just derived aiReq from its hand, it definitely has the cards.
            const move = getAIMove(currentPlayerState, null, aiReq);
            if (move) {
                 executePlay(currentPlayerState.id, move, currentPlayersSnapshot);
            }
            return;
        }

        // --- AI Playing Phase ---
        if (phase === GamePhase.PLAYING && !currentPlayerState.passedThisRound) {
            if (!roundRequirement) return;

            const lastMove = tableStack.length > 0 ? tableStack[tableStack.length - 1] : null;
            
            // Check if AI is the stack owner
            if (lastMove && lastMove.playerId === currentPlayerState.id) {
               handleRoundEnd(currentPlayerState.id);
               return;
            }

            const move = getAIMove(currentPlayerState, lastMove, roundRequirement);

            if (move) {
              executePlay(currentPlayerState.id, move, currentPlayersSnapshot);
            } else {
              executePass(currentPlayerState.id, currentPlayersSnapshot);
            }
        }
    };

    const timer = setTimeout(runAITurn, AI_DELAY_MS);
    return () => clearTimeout(timer);

  }, [phase, activePlayerIndex, players, tableStack, roundRequirement]);


  // --- Logic Helpers ---

  const advanceTurn = (currentPlayers: Player[], currentStack: PlayedSet[], currentActiveIndex: number) => {
    let nextIndex = (currentActiveIndex + 1) % PLAYERS_COUNT;
    let foundNext = false;
    let winnerFound: string | null = null;

    const lastStackItem = currentStack.length > 0 ? currentStack[currentStack.length - 1] : null;

    for (let i = 0; i < PLAYERS_COUNT; i++) {
      const p = currentPlayers[nextIndex];

      if (lastStackItem && p.id === lastStackItem.playerId) {
        winnerFound = p.id;
        break;
      }

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
      if (lastStackItem) {
         handleRoundEnd(lastStackItem.playerId);
      } else {
         const nextIdx = (currentActiveIndex + 1) % PLAYERS_COUNT;
         setActivePlayerIndex(nextIdx);
      }
    }
  };

  const inferRequirement = (cards: Card[]): RoundRequirement | null => {
      if (cards.length === 0) return null;
      
      const count = cards.length;
      const types = new Set(cards.map(c => c.type));
      const levels = cards.map(c => c.level).sort((a, b) => a - b);
      
      let isStrictlyAscending = true;
      for (let i = 0; i < levels.length - 1; i++) {
          if (levels[i] >= levels[i+1]) isStrictlyAscending = false;
      }
      
      // Case 1: Single Type
      if (types.size === 1) {
           const type = Array.from(types)[0];
           if (count === 1) {
               return { type: RequirementType.SINGLE_FIXED, resourceType: type, count, description: `固定: ${count} 张 ${RESOURCE_CONFIG[type].label}` };
           }
           if (isStrictlyAscending) {
               return { type: RequirementType.SINGLE_ASC, resourceType: type, count, description: `递增: ${count} 张 ${RESOURCE_CONFIG[type].label}` };
           } else {
               return { type: RequirementType.SINGLE_FIXED, resourceType: type, count, description: `固定: ${count} 张 ${RESOURCE_CONFIG[type].label}` };
           }
      } 
      // Case 2: Mixed Types
      else {
           if (isStrictlyAscending) {
               return { type: RequirementType.MIXED_ASC, count, description: `混合递增: ${count} 张` };
           } else {
               return null; 
           }
      }
  };

  // --- Actions ---

  const handleDealerSubmit = (req: RoundRequirement) => {
    setRoundRequirement(req);
    addLog(`${players[dealerIndex].name} 制定规则: ${req.description}`, 'alert');
    setPhase(GamePhase.PLAYING);
    setTableStack([]);
    setPlayers(prev => prev.map(p => ({ ...p, passedThisRound: false })));
  };

  const executePlay = (playerId: string, cards: Card[], currentPlayersState: Player[] = players) => {
    const playerIdx = currentPlayersState.findIndex(p => p.id === playerId);
    const player = currentPlayersState[playerIdx];
    const cardIds = cards.map(c => c.id);
    const newHand = player.hand.filter(c => !cardIds.includes(c.id));

    const updatedPlayers = [...currentPlayersState];
    updatedPlayers[playerIdx] = { ...updatedPlayers[playerIdx], hand: newHand };

    const newStackItem: PlayedSet = { playerId, cards, timestamp: Date.now() };
    const updatedStack = [...tableStack, newStackItem];

    setPlayers(updatedPlayers);
    setTableStack(updatedStack);
    setSelectedCardIds([]); 
    addLog(`${player.name} 打出了 ${cards.length} 张牌。`, 'action');

    if (newHand.length === 0) {
      handleGameEnd(playerId);
      return;
    }

    advanceTurn(updatedPlayers, updatedStack, activePlayerIndex);
  };

  const executePass = (playerId: string, currentPlayersState: Player[] = players) => {
    const playerIdx = currentPlayersState.findIndex(p => p.id === playerId);
    const updatedPlayers = [...currentPlayersState];
    updatedPlayers[playerIdx] = { ...updatedPlayers[playerIdx], passedThisRound: true };
    setPlayers(updatedPlayers);
    addLog(`${currentPlayersState[playerIdx].name} 选择放弃 (Pass)。`, 'info');
    advanceTurn(updatedPlayers, tableStack, activePlayerIndex);
  };

  const handleRoundEnd = (winnerId: string) => {
    const winnerName = players.find(p => p.id === winnerId)?.name || '未知';
    addLog(`第 ${roundNumber} 轮结束！获胜者: ${winnerName}`, 'success');
    
    setPlayers(prev => prev.map(p => 
      p.id === winnerId ? { ...p, medals: p.medals + 1 } : p
    ));

    const winnerIdx = players.findIndex(p => p.id === winnerId);
    setDealerIndex(winnerIdx);
    setActivePlayerIndex(winnerIdx);
    setRoundNumber(r => r + 1);
    
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
    if (activePlayerIndex !== 0) return;
    if (phase !== GamePhase.PLAYING && phase !== GamePhase.DEALER_SELECTION) return;
    
    setMashProgress(0);
    setLastMashKey(null);
    
    setSelectedCardIds(prev => 
      prev.includes(card.id) ? prev.filter(id => id !== card.id) : [...prev, card.id]
    );
  };

  const handleHumanPlay = () => {
    const player = players[0];
    const selectedCards = player.hand.filter(c => selectedCardIds.includes(c.id));
    
    // --- Dealer Mode: Infer Rules ---
    if (phase === GamePhase.DEALER_SELECTION) {
        const inferredReq = inferRequirement(selectedCards);
        if (!inferredReq) {
            addLog("当前出牌组合无法构成有效规则 (混合类型需递增)。", 'alert');
            return;
        }
        
        setRoundRequirement(inferredReq);
        addLog(`${player.name} 制定规则: ${inferredReq.description}`, 'alert');
        setPhase(GamePhase.PLAYING);
        setTableStack([]);
        setPlayers(prev => prev.map(p => ({ ...p, passedThisRound: false })));
        
        // Pass current players state explicitly to avoid race condition with phase update
        executePlay(player.id, selectedCards, players);
        return;
    }

    // --- Normal Playing Mode ---
    const lastMove = tableStack.length > 0 ? tableStack[tableStack.length - 1] : null;
    const validation = validateMove(selectedCards, lastMove, roundRequirement);
    if (!validation.valid) {
      addLog(`出牌无效: ${validation.reason}`, 'alert');
      return;
    }

    executePlay(player.id, selectedCards, players);
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

    setMashCooldown(true);
    setTimeout(() => setMashCooldown(false), MASH_COOLDOWN_MS);

    const diff = newCard.level - card.level;
    if (diff > 0) addLog("搓牌成功！点数升级！", 'success');
    else if (diff < 0) addLog("搓牌失败！点数下降...", 'alert');
    else addLog("搓牌无变化...", 'info');
  };

  // --- Render Guards ---
  
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
  const isHumanTurn = activePlayerIndex === 0 && (phase === GamePhase.PLAYING || phase === GamePhase.DEALER_SELECTION);
  const isHumanDealer = activePlayerIndex === 0 && phase === GamePhase.DEALER_SELECTION;
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
                  <button onClick={() => window.location.reload()} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold">再玩一次</button>
              </div>
          </div>
      )
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-100 overflow-hidden">
      
      {/* Large Countdown Overlay */}
      {timeLeft <= 5 && isHumanTurn && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50">
            <div className="text-9xl font-bold text-red-500/50 animate-ping">
              {timeLeft}
            </div>
          </div>
      )}

      {/* --- Top Bar --- */}
      <header className="flex-none bg-slate-800 p-3 shadow-md flex justify-between items-center z-10 border-b border-slate-700">
        <div className="flex items-center space-x-6">
          <div className="bg-slate-700 px-3 py-1 rounded text-sm font-mono">第 {roundNumber} 轮</div>
          <div className="text-sm">
             领出者: <span className="text-yellow-400 font-bold">{players[dealerIndex]?.name}</span>
          </div>
          {roundRequirement ? (
            <div className="flex items-center gap-2 bg-blue-900/40 px-3 py-1 rounded border border-blue-500/30">
               <span className="text-blue-300 text-xs uppercase tracking-wider font-bold">本轮规则</span>
               <span className="font-medium text-blue-100">{roundRequirement.description}</span>
            </div>
          ) : (
             <div className="flex items-center gap-2 bg-yellow-900/40 px-3 py-1 rounded border border-yellow-500/30">
               <span className="text-yellow-300 text-xs uppercase tracking-wider font-bold">等待制定规则</span>
             </div>
          )}
        </div>
        <div className="flex items-center gap-4">
             {/* Timer */}
             <div className={`text-xl font-mono font-bold ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
                {timeLeft}s
             </div>
             <div className="text-xs text-slate-400">终局资源博弈 Demo</div>
        </div>
      </header>

      {/* --- Main Game Area --- */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left/Center: Battle Area */}
        <div className="flex-1 flex flex-col relative">
          
          {/* Opponents Area */}
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

          {/* Table Center */}
          <div className="flex-1 flex flex-col items-center justify-center relative">
            {tableStack.length === 0 ? (
               <div className="text-slate-600 font-bold text-2xl border-4 border-dashed border-slate-700 rounded-2xl p-8">
                  {isHumanDealer ? "请出牌以制定规则" : "等待领出者制定规则..."}
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
            
            {activePlayer && (
                <div className="absolute bottom-4 text-center animate-pulse flex flex-col items-center gap-1">
                    <span className="text-xs uppercase tracking-widest text-slate-500">当前回合</span>
                    <div className="text-xl font-bold text-yellow-400">{activePlayer.name}</div>
                </div>
            )}
          </div>

          {/* Player Hand Area */}
          <div className="flex-none bg-slate-850 border-t border-slate-700 z-20 relative">
             
             {/* Mash Visual Feedback Overlay */}
             {selectedCardIds.length === 1 && (isHumanTurn || isHumanDealer) && !mashCooldown && (
                <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 bg-slate-800/90 border border-slate-600 p-3 rounded-xl shadow-xl flex flex-col items-center gap-2 animate-in slide-in-from-bottom-2 fade-in backdrop-blur-sm z-30">
                   <div className="text-xs font-bold text-purple-300 uppercase tracking-wider">搓牌模式 (Cheat)</div>
                   <div className="flex gap-4">
                      <div className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold text-lg transition-all ${lastMashKey === 'a' ? 'bg-purple-600 border-purple-400 text-white scale-110 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-slate-700 border-slate-500 text-slate-400'}`}>A</div>
                      <div className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold text-lg transition-all ${lastMashKey === 'd' ? 'bg-purple-600 border-purple-400 text-white scale-110 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-slate-700 border-slate-500 text-slate-400'}`}>D</div>
                   </div>
                   <div className="w-40 h-2 bg-slate-700 rounded-full overflow-hidden border border-slate-600">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-100" style={{ width: `${mashProgress}%` }}></div>
                   </div>
                   <div className="text-[10px] text-slate-400">交替狂按 A / D 键来改变点数</div>
                </div>
             )}
             {mashCooldown && selectedCardIds.length === 1 && (
                  <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 text-red-300 font-bold text-xs bg-red-900/80 px-4 py-2 rounded-full border border-red-500/50 animate-pulse">
                      ⚠️ 冷却中...
                  </div>
             )}

             {/* Action Bar */}
             <div className="flex justify-between items-center px-6 py-2 bg-slate-800 border-b border-slate-700 h-14">
                <div className="text-sm text-slate-400">
                   你的奖牌: <span className="text-yellow-400 font-bold text-lg ml-1">{players[0].medals}</span>
                </div>
                
                <div className="flex gap-3">
                   <button 
                     onClick={() => executePass(players[0].id, players)}
                     disabled={!isHumanTurn}
                     className="px-4 py-1.5 rounded bg-red-600/20 text-red-200 border border-red-600 hover:bg-red-600 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed hidden sm:block"
                   >
                     放弃 (Pass)
                   </button>
                   <button 
                     onClick={handleHumanPlay}
                     disabled={(!isHumanTurn && !isHumanDealer) || selectedCardIds.length === 0}
                     className="px-6 py-1.5 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition shadow-lg disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
                   >
                     {isHumanDealer ? "制定规则并出牌" : "出牌"}
                   </button>
                </div>
             </div>

             {/* Cards */}
             <PlayerHand 
               hand={players[0].hand} 
               selectedCards={selectedCardIds}
               onToggleCard={handleToggleCard}
               disabled={!isHumanTurn && !isHumanDealer} 
             />
          </div>
        </div>

        {/* Right: Sidebar */}
        <div className="w-72 bg-slate-900 border-l border-slate-700 p-4 flex flex-col gap-4">
           
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
                  <div className="text-slate-500 text-sm italic">
                    {isHumanDealer ? "请出牌以设定本轮规则" : "等待领出者制定规则..."}
                  </div>
              )}
           </div>

           {/* Game Rules Info */}
           <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 text-xs space-y-2">
              <h3 className="uppercase font-bold text-slate-500">游戏规则</h3>
              <ul className="list-disc pl-4 space-y-1 text-slate-300">
                <li><span className="text-slate-400">点数范围:</span> 1-7</li>
                <li><span className="text-slate-400">出牌:</span> 必须符合当前轮次类型和数量。</li>
                <li><span className="text-slate-400">压制:</span> 总点数必须 <span className="text-yellow-400 font-bold">&ge;</span> 上一家。</li>
                <li><span className="text-purple-400 font-bold">搓牌 (出千):</span> 选中 <span className="text-white font-bold">1</span> 张牌，交替狂按 <span className="font-mono bg-slate-700 px-1 rounded text-white">A</span> / <span className="font-mono bg-slate-700 px-1 rounded text-white">D</span> 键。</li>
                <li><span className="text-slate-400">风险:</span> 成功升级点数，失败则降低。Bot 也会尝试出千。</li>
              </ul>
           </div>

           {/* Logs */}
           <div className="flex-1 min-h-0">
               <GameLog logs={logs} />
           </div>
        </div>

      </main>
    </div>
  );
}