import React, { useEffect, useState } from 'react';
import {
  Layers,
  Zap,
  Play,
  RotateCcw,
  Sliders,
  Shield,
  Eye,
  CheckCircle2,
  BookmarkPlus,
  ArrowRight
} from 'lucide-react';
import { Rule } from '../types';

export const PopupApp: React.FC = () => {
  const [currentHost, setCurrentHost] = useState<string>('carregando...');
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [vipActive, setVipActive] = useState<boolean>(false);
  const [highlightActive, setHighlightActive] = useState<boolean>(false);

  // Form State
  const [findText, setFindText] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [useRegex, setUseRegex] = useState<boolean>(false);
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  useEffect(() => {
    // Get active tab host
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
          try {
            const url = new URL(tabs[0].url);
            setCurrentHost(url.hostname);
            setCurrentTabId(tabs[0].id ?? null);
          } catch {
            setCurrentHost('Página local / Interna');
          }
        }
      });

      // Load initial rules & states
      chrome.runtime.sendMessage({ action: 'getRules' }, (res) => {
        if (res && res.rules) setRules(res.rules);
      });

      chrome.runtime.sendMessage({ action: 'getVipStatus' }, (res) => {
        if (res) setVipActive(!!res.vipActive);
      });

      chrome.runtime.sendMessage({ action: 'getHighlightStatus' }, (res) => {
        if (res) setHighlightActive(!!res.highlightActive);
      });
    }
  }, []);

  const handleApplyRules = () => {
    if (!currentTabId) return;

    let targetRules: Rule[] = rules.filter(r => r.enabled);
    if (findText) {
      const tempRule: Rule = {
        id: 'temp-' + Date.now(),
        find: findText,
        replace: replaceText,
        useRegex,
        caseSensitive,
        enabled: true,
        createdAt: Date.now()
      };
      targetRules = [tempRule, ...targetRules];
    }

    chrome.tabs.sendMessage(currentTabId, {
      action: 'applyRules',
      rules: targetRules
    }, (res) => {
      const count = res?.count ?? 0;
      setStatusMsg({
        text: `Substituição concluída! (${count} alterações)`,
        type: 'success'
      });
      setTimeout(() => setStatusMsg(null), 3000);
    });
  };

  const handleSaveRule = () => {
    if (!findText.trim()) {
      setStatusMsg({ text: 'Informe o texto no campo Buscar.', type: 'error' });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    const newRule: Rule = {
      id: 'rule-' + Date.now(),
      name: findText,
      find: findText,
      replace: replaceText,
      useRegex,
      caseSensitive,
      enabled: true,
      createdAt: Date.now()
    };

    const updated = [newRule, ...rules];
    setRules(updated);
    chrome.runtime.sendMessage({ action: 'saveRules', rules: updated }, () => {
      setStatusMsg({ text: 'Regra salva no Painel!', type: 'success' });
      setFindText('');
      setReplaceText('');
      setTimeout(() => setStatusMsg(null), 3000);
    });
  };

  const handleToggleVip = () => {
    const nextState = !vipActive;
    setVipActive(nextState);
    chrome.runtime.sendMessage({ action: 'setVipStatus', vipActive: nextState });
  };

  const handleToggleHighlight = () => {
    const nextState = !highlightActive;
    setHighlightActive(nextState);
    chrome.runtime.sendMessage({ action: 'setHighlightStatus', highlightActive: nextState });
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, { action: 'toggleHighlight', active: nextState }).catch(() => {});
    }
  };

  const handleReloadTab = () => {
    if (currentTabId && typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.reload(currentTabId);
    }
  };

  const handleOpenPanel = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'openPanel' });
    }
  };

  const activeRulesCount = rules.filter(r => r.enabled).length;

  return (
    <div className="flex flex-col min-h-[480px] bg-slate-950 text-slate-100 p-4 space-y-4 select-none">
      {/* Header */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-sm tracking-tight text-white">MPLD</span>
              <span className="text-[10px] font-medium bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">v2.0</span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[180px] font-mono" title={currentHost}>
              {currentHost}
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenPanel}
          className="flex items-center space-x-1 text-xs font-medium text-slate-300 hover:text-emerald-400 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2.5 py-1.5 rounded-md transition-all"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Painel</span>
        </button>
      </header>

      {/* Control Bar */}
      <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 text-xs">
        <div className="flex items-center justify-between px-2 py-1 bg-slate-900 rounded border border-slate-800">
          <div className="flex items-center space-x-1.5">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-300 font-medium">VIP XHR</span>
          </div>
          <button
            onClick={handleToggleVip}
            className={`w-7 h-4 flex items-center rounded-full p-0.5 transition-colors ${
              vipActive ? 'bg-amber-500 justify-end' : 'bg-slate-700 justify-start'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-slate-950 shadow-sm" />
          </button>
        </div>

        <div className="flex items-center justify-between px-2 py-1 bg-slate-900 rounded border border-slate-800">
          <div className="flex items-center space-x-1.5">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300 font-medium">Highlight</span>
          </div>
          <button
            onClick={handleToggleHighlight}
            className={`w-7 h-4 flex items-center rounded-full p-0.5 transition-colors ${
              highlightActive ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-slate-950 shadow-sm" />
          </button>
        </div>
      </div>

      {/* Quick Search & Replace Form */}
      <div className="space-y-2.5 bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Buscar na Página
          </label>
          <input
            type="text"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Texto ou padrão..."
            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition-colors font-mono"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Substituir Por
          </label>
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Novo valor (deixe vazio para remover)..."
            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition-colors font-mono"
          />
        </div>

        {/* Option Toggles */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="accent-emerald-500 rounded bg-slate-800 border-slate-700"
              />
              <span>Regex</span>
            </label>

            <label className="flex items-center space-x-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="accent-emerald-500 rounded bg-slate-800 border-slate-700"
              />
              <span>Aa (Case)</span>
            </label>
          </div>

          <button
            onClick={handleSaveRule}
            className="flex items-center space-x-1 text-slate-400 hover:text-emerald-400 transition-colors text-xs font-medium"
            title="Salvar como regra permanente no Painel"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>Salvar Regra</span>
          </button>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="flex space-x-2 pt-1">
        <button
          onClick={handleApplyRules}
          className="flex-1 flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2 rounded-md transition-all shadow-sm shadow-emerald-900/20 active:scale-[0.98]"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Substituir</span>
        </button>

        <button
          onClick={handleReloadTab}
          className="flex items-center justify-center px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-md transition-all active:scale-[0.98]"
          title="Recarregar aba para reverter alterações"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Status Feedback Banner */}
      {statusMsg && (
        <div
          className={`flex items-center space-x-2 text-xs p-2 rounded border ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : statusMsg.type === 'error'
              ? 'bg-rose-950/60 border-rose-800 text-rose-300'
              : 'bg-slate-900 border-slate-800 text-slate-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Active Rules Quick List */}
      <div className="flex-1 flex flex-col pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            Regras Salvas ({activeRulesCount} ativas)
          </span>
          <button
            onClick={handleOpenPanel}
            className="text-emerald-400 hover:underline text-[11px] flex items-center space-x-0.5"
          >
            <span>Gerenciar</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto max-h-32 space-y-1.5 pr-1 font-mono text-xs">
          {rules.length === 0 ? (
            <div className="text-center text-slate-500 py-4 text-xs font-sans">
              Nenhuma regra salva no Painel.
            </div>
          ) : (
            rules.slice(0, 4).map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800/60 hover:border-slate-700 transition-colors"
              >
                <div className="truncate max-w-[240px]">
                  <span className="text-emerald-400">{rule.find}</span>
                  <span className="text-slate-500 mx-1">→</span>
                  <span className="text-slate-300">{rule.replace || '""'}</span>
                </div>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded font-sans ${
                    rule.enabled
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {rule.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
