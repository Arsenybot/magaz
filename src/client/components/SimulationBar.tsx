import React, { useState } from 'react';
import { User } from '../../core/types.ts';
import { UserCheck, Shield, ChevronDown, ChevronUp, Terminal } from 'lucide-react';

interface SimulationBarProps {
  currentUser: User | null;
  onSwitchUser: (userType: 'CUSTOMER' | 'ADMIN' | 'CUSTOM', customId?: string) => void;
  activeView: 'store' | 'orders' | 'admin';
  onChangeView: (view: 'store' | 'orders' | 'admin') => void;
}

export const SimulationBar: React.FC<SimulationBarProps> = ({
  currentUser,
  onSwitchUser,
  activeView,
  onChangeView,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [customTgId, setCustomTgId] = useState('');

  return (
    <aside aria-label="Панель тестирования" className="bg-neutral-900 text-neutral-200 border-b border-neutral-800 text-xs select-none">
      <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-mono text-neutral-400">Telegram Dev Mode</span>
          <span className="text-neutral-500">·</span>
          <span className="font-medium text-white truncate max-w-[140px] sm:max-w-none">
            {currentUser?.firstName || 'Пользователь'} ({currentUser?.role})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {currentUser?.role === 'ADMIN' ? (
            <button
              onClick={() => onChangeView(activeView === 'admin' ? 'store' : 'admin')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeView === 'admin'
                  ? 'bg-amber-500 text-neutral-950 font-semibold'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
              }`}
            >
              {activeView === 'admin' ? 'В магазин' : 'Админ-панель'}
            </button>
          ) : null}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
            title="Тестовый переключатель ролей"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="max-w-4xl mx-auto px-4 pb-3 pt-1 border-t border-neutral-800/60 flex flex-wrap items-center gap-3">
          <span className="text-neutral-400">Переключить аккаунт для теста:</span>

          <button
            onClick={() => onSwitchUser('CUSTOMER')}
            className={`px-3 py-1 rounded flex items-center gap-1.5 transition-colors ${
              currentUser?.role === 'CUSTOMER' ? 'bg-white text-neutral-900 font-medium' : 'bg-neutral-800 hover:bg-neutral-700'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Покупатель (Александр)</span>
          </button>

          <button
            onClick={() => onSwitchUser('ADMIN')}
            className={`px-3 py-1 rounded flex items-center gap-1.5 transition-colors ${
              currentUser?.role === 'ADMIN' ? 'bg-amber-400 text-neutral-950 font-semibold' : 'bg-neutral-800 hover:bg-neutral-700'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Администратор (Константин)</span>
          </button>

          <div className="flex items-center gap-1.5 ml-auto">
            <input
              type="text"
              placeholder="Custom TG ID"
              value={customTgId}
              onChange={(e) => setCustomTgId(e.target.value)}
              className="bg-neutral-950 border border-neutral-700 px-2 py-1 rounded w-28 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={() => {
                if (customTgId.trim()) onSwitchUser('CUSTOM', customTgId.trim());
              }}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded"
            >
              Войти
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
