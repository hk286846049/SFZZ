import React, { useState } from 'react';
import { RequirementType, ResourceType, RoundRequirement } from '../types';
import { RESOURCE_CONFIG } from '../constants';

interface DealerModalProps {
  isOpen: boolean;
  onSubmit: (req: RoundRequirement) => void;
}

export const DealerModal: React.FC<DealerModalProps> = ({ isOpen, onSubmit }) => {
  const [selectedType, setSelectedType] = useState<RequirementType>(RequirementType.SINGLE_FIXED);
  const [resource, setResource] = useState<ResourceType>(ResourceType.SOLDIER);
  const [count, setCount] = useState<number>(1);

  if (!isOpen) return null;

  const handleSubmit = () => {
    let desc = "";
    if (selectedType === RequirementType.SINGLE_FIXED) desc = `固定: ${count} 张 ${RESOURCE_CONFIG[resource].label}`;
    else if (selectedType === RequirementType.SINGLE_ASC) desc = `递增: ${count} 张 ${RESOURCE_CONFIG[resource].label}`;
    else desc = `混合递增: 任意 ${count} 张`;

    onSubmit({
      type: selectedType,
      resourceType: selectedType !== RequirementType.MIXED_ASC ? resource : undefined,
      count,
      description: desc
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-600 shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
        <h2 className="text-2xl font-bold text-yellow-400 mb-4">你是领出者！</h2>
        <p className="text-slate-300 mb-6">请制定本轮规则。</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-400 mb-1">出牌模式</label>
            <select 
              value={selectedType} 
              onChange={(e) => setSelectedType(e.target.value as RequirementType)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
            >
              <option value={RequirementType.SINGLE_FIXED}>{RequirementType.SINGLE_FIXED}</option>
              <option value={RequirementType.SINGLE_ASC}>{RequirementType.SINGLE_ASC}</option>
              <option value={RequirementType.MIXED_ASC}>{RequirementType.MIXED_ASC}</option>
            </select>
          </div>

          {selectedType !== RequirementType.MIXED_ASC && (
            <div>
              <label className="block text-sm font-semibold text-slate-400 mb-1">指定资源</label>
              <div className="flex gap-2">
                {Object.values(ResourceType).map(r => (
                  <button
                    key={r}
                    onClick={() => setResource(r)}
                    className={`flex-1 p-2 rounded border ${resource === r ? 'bg-blue-600 border-blue-400' : 'bg-slate-900 border-slate-700 opacity-60'}`}
                  >
                    {RESOURCE_CONFIG[r].icon}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-400 mb-1">数量 ({count})</label>
            <input 
              type="range" 
              min="1" 
              max="5" 
              value={count} 
              onChange={(e) => setCount(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <button 
            onClick={handleSubmit}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-lg mt-4 transition-colors"
          >
            开始本轮
          </button>
        </div>
      </div>
    </div>
  );
};