import React, { useEffect, useState } from 'react';
import {
  Layers,
  Play,
  RotateCcw,
  Sliders,
  Shield,
  Eye,
  CheckCircle2,
  BookmarkPlus,
  ArrowRight,
  Trash2,
  History
} from 'lucide-react';
import { Rule } from '../types';

interface HistoryItem {
  find: string;
  replace: string;
  count: number;
  ts: number;
}

export const PopupApp: React.FC = () => {
  const [currentHost, setCurrentHost] = useState<string>('carregando...');
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [vipActive, setVipActive] = useState<boolean>(false);
  const [highlightActive, setHighlightActive] = useState<boolean>(false);

  // Form State
  const [findText, setFindText] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [useRegex, setUseRegex] = useState<boolean>(false);
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false);
  const [replaceAll, setReplaceAll] = useState<boolean>(true);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  useEffect(() => {
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

      chrome.storage.local.get(['popupHistory'], (data) => {
        if (data.popupHistory) setHistory(data.popupHistory);
      });

      // Sync storage changes to state in real time
      const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
        if (area === 'local' && changes.rules) {
          setRules(changes.rules.newValue || []);
        }
      };

      chrome.storage.onChanged.addListener(storageListener);
      return () => chrome.storage.onChanged.removeListener(storageListener);
    }
  }, []);

  // Live match counter on active tab as user types
  useEffect(() => {
    if (!findText.trim() || !currentTabId) {
      setMatchCount(null);
      return;
    }

    const timer = setTimeout(() => {
      chrome.tabs.sendMessage(
        currentTabId,
        {
          action: 'countMatches',
          find: findText,
          options: { useRegex, caseSensitive }
        },
        (res) => {
          if (chrome.runtime.lastError) {
            setMatchCount(null);
          } else {
            setMatchCount(res?.count ?? 0);
          }
        }
      );
    }, 150);

    return () => clearTimeout(timer);
  }, [findText, useRegex, caseSensitive, currentTabId]);

  const saveHistory = (find: string, replace: string, count: number) => {
    const updated = [{ find, replace, count, ts: Date.now() }, ...history.filter((h) => h.find !== find)].slice(0, 10);
    setHistory(updated);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ popupHistory: updated });
    }
  };

  const handleApplyRules = () => {
    if (!currentTabId) return;

    if (findText) {
      chrome.tabs.sendMessage(
        currentTabId,
        {
          action: 'quickReplace',
          find: findText,
          replace: replaceText,
          options: { useRegex, caseSensitive, replaceAll }
        },
        (res) => {
          const count = res?.replacements ?? 0;
          saveHistory(findText, replaceText, count);
          setStatusMsg({
            text: `Substituição concluída! (${count} alterações)`,
            type: 'success'
          });
          setTimeout(() => setStatusMsg(null), 3000);
        }
      );
    } else {
      const activeRules = rules.filter((r) => r.enabled);
      chrome.tabs.sendMessage(
        currentTabId,
        { action: 'applyRules', rules: activeRules },
        (res) => {
          setStatusMsg({ text: 'Regras ativas aplicadas!', type: 'success' });
          setTimeout(() => setStatusMsg(null), 3000);
        }
      );
    }
  };

  const handleSaveRule = () => {
    const searchTarget = findText.trim();
    if (!searchTarget) {
      setStatusMsg({ text: 'Informe o texto no campo Buscar.', type: 'error' });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    const existingIndex = rules.findIndex(
      (r) => r.find.trim().toLowerCase() === searchTarget.toLowerCase()
    );

    let updatedRules: Rule[];

    if (existingIndex >= 0) {
      updatedRules = rules.map((r, idx) =>
        idx === existingIndex
          ? { ...r, replace: replaceText, useRegex, caseSensitive, replaceAll, enabled: true }
          : r
      );
    } else {
      const newRule: Rule = {
        id: 'rule-' + Date.now(),
        name: searchTarget,
        find: searchTarget,
        replace: replaceText,
        useRegex,
        caseSensitive,
        replaceAll,
        enabled: true,
        mode: 'normal',
        createdAt: Date.now()
      };
      updatedRules = [newRule, ...rules];
    }

    setRules(updatedRules);

    // Save directly to chrome.storage.local for instant persistence
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ rules: updatedRules });
    }

    // Broadcast to background script & active tab
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'saveRules', rules: updatedRules }).catch(() => {});
      if (currentTabId) {
        chrome.tabs.sendMessage(currentTabId, {
          action: 'applyRules',
          rules: updatedRules.filter((r) => r.enabled)
        }).catch(() => {});
      }
    }

    setStatusMsg({
      text: existingIndex >= 0 ? 'Regra atualizada!' : 'Regra salva com sucesso!',
      type: 'success'
    });

    setFindText('');
    setReplaceText('');
    setMatchCount(null);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleToggleRule = (id: string) => {
    chrome.runtime.sendMessage({ action: 'getRules' }, (res) => {
      const currentRules: Rule[] = res?.rules || [];
      const updated = currentRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
      setRules(updated);
      chrome.runtime.sendMessage({ action: 'saveRules', rules: updated });
    });
  };

  const handleDeleteRule = (id: string) => {
    chrome.runtime.sendMessage({ action: 'getRules' }, (res) => {
      const currentRules: Rule[] = res?.rules || [];
      const updated = currentRules.filter((r) => r.id !== id);
      setRules(updated);
      chrome.runtime.sendMessage({ action: 'saveRules', rules: updated });
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ popupHistory: [] });
    }
    // Clean temporary quick rules (IDs starting with 'quick-') from storage
    chrome.runtime.sendMessage({ action: 'getRules' }, (res) => {
      const currentRules: Rule[] = res?.rules || [];
      const cleaned = currentRules.filter((r) => !r.id.startsWith('quick-'));
      setRules(cleaned);
      chrome.runtime.sendMessage({ action: 'saveRules', rules: cleaned });
    });
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setFindText(item.find);
    setReplaceText(item.replace);
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
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/panel/index.html') });
    }
  };

  const activeRulesCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="flex flex-col min-h-[500px] w-[360px] bg-slate-950 text-slate-100 p-4 space-y-3.5 select-none font-sans">
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
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Buscar na Página
            </label>
            {matchCount !== null && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                {matchCount} match{matchCount !== 1 ? 'es' : ''}
              </span>
            )}
          </div>
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
          <div className="flex items-center space-x-2">
            <label className="flex items-center space-x-1 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="accent-emerald-500 rounded bg-slate-800 border-slate-700"
              />
              <span>Regex</span>
            </label>

            <label className="flex items-center space-x-1 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="accent-emerald-500 rounded bg-slate-800 border-slate-700"
              />
              <span>Aa</span>
            </label>

            <label className="flex items-center space-x-1 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={replaceAll}
                onChange={(e) => setReplaceAll(e.target.checked)}
                className="accent-emerald-500 rounded bg-slate-800 border-slate-700"
              />
              <span>Todas</span>
            </label>
          </div>

          <button
            type="button"
            onClick={handleSaveRule}
            disabled={useRegex && findText.trim() !== '' && (()=>{ try { new RegExp(findText, caseSensitive ? 'g':'gi'); return false; } catch { return true; } })()}
            className="flex items-center space-x-1 text-slate-400 hover:text-emerald-400 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors text-xs font-medium cursor-pointer"
            title="Salvar como regra permanente no Painel"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Salvar Regra</span>
          </button>
        </div>

        {useRegex && findText.trim() !== '' && (()=>{ try { new RegExp(findText, caseSensitive ? 'g':'gi'); return null; } catch (e) { return (e as Error).message; } })() && (
          <div className="p-2 rounded bg-rose-950/80 border border-rose-800 text-rose-300 text-[11px] font-sans">
            <strong>Regex Inválido:</strong> {(()=>{ try { new RegExp(findText, caseSensitive ? 'g':'gi'); return ''; } catch (e) { return (e as Error).message; } })()}
          </div>
        )}
      </div>

      {/* Primary Actions */}
      <div className="flex space-x-2">
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

      {/* History Section */}
      {history.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-800/80 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] flex items-center space-x-1">
              <History className="w-3 h-3 text-slate-500" />
              <span>Histórico Recente</span>
            </span>
            <button
              onClick={handleClearHistory}
              className="text-[10px] text-slate-500 hover:text-rose-400 transition-colors"
            >
              Limpar
            </button>
          </div>
          <div className="flex space-x-1.5 overflow-x-auto pb-1 text-[11px] font-mono scrollbar-none">
            {history.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectHistory(item)}
                className="shrink-0 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded px-2 py-1 text-slate-300 transition-colors"
                title={`Clique para carregar "${item.find}" → "${item.replace}"`}
              >
                <span className="text-emerald-400">{item.find}</span>
                <span className="text-slate-500 mx-1">→</span>
                <span className="text-slate-400">{item.replace || '""'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Rules Quick List (Filtered for current site) */}
      <div className="flex-1 flex flex-col pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            Regras Aplicáveis ({rules.filter((r) => r.enabled && (!r.urlFilter || currentHost.includes(r.urlFilter))).length} ativas)
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
            rules
              .filter((r) => {
                if (!r.urlFilter || r.urlFilter.trim() === '') return true;
                if (!currentHost || currentHost === 'carregando...' || currentHost.includes('Página local')) return true;
                try {
                  return new RegExp(r.urlFilter).test(currentHost);
                } catch {
                  return currentHost.includes(r.urlFilter);
                }
              })
              .slice(0, 5)
              .map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800/60 hover:border-slate-700 transition-colors"
                >
                  <div className="truncate max-w-[170px]" title={`${rule.find} → ${rule.replace}`}>
                    <span className="text-emerald-400">{rule.find}</span>
                    <span className="text-slate-500 mx-1">→</span>
                    <span className="text-slate-300">{rule.replace || '""'}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 font-sans">
                    <button
                      onClick={() => handleToggleRule(rule.id)}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                        rule.enabled
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      {rule.enabled ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-slate-500 hover:text-rose-400 p-0.5 transition-colors"
                      title="Excluir regra"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};
