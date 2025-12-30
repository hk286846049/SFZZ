import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

export const GameLog: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-slate-800 rounded-lg p-2 border border-slate-700">
      <h3 className="text-slate-400 text-xs uppercase font-bold mb-2 tracking-wider">战斗日志</h3>
      <div className="flex-1 overflow-y-auto scrollbar-hide space-y-1">
        {logs.map((log) => (
          <div key={log.id} className={`text-xs p-1.5 rounded border-l-2 ${
            log.type === 'action' ? 'border-blue-500 bg-blue-900/20 text-blue-200' :
            log.type === 'alert' ? 'border-red-500 bg-red-900/20 text-red-200' :
            log.type === 'success' ? 'border-yellow-500 bg-yellow-900/20 text-yellow-200' :
            'border-slate-500 text-slate-300'
          }`}>
            {log.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};