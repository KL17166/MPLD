import React, { useEffect, useState, useRef } from 'react';
import {
  Layers,
  Shield,
  Radio,
  BarChart3,
  Settings,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Check,
  X,
  Search,
  Sparkles,
  RefreshCw,
  Code,
  Globe,
  Lock,
  Play,
  Eye,
  Zap,
  HelpCircle,
  AlertTriangle,
  FileText,
  Smartphone,
  CheckCircle2,
  Terminal,
  Activity,
  Crown,
  Bot,
  ListFilter
} from 'lucide-react';
import { ProxyConfig, Rule, ExtensionSettings } from '../types';
import { PRESET_RULES } from '../presets';

type ActiveSection = 'rules' | 'vip' | 'ultra' | 'stats' | 'presets' | 'settings';

interface ProxyServerRule {
  id: string;
  name: string;
  find: string;
  replace: string;
  urlFilter?: string;
  enabled: boolean;
}

interface LogEntry {
  timestamp: string;
  method: string;
  url: string;
  status: number;
  modified: boolean;
  matchCount: number;
}

export const PanelApp: React.FC = () => {
  const [activeSection, setActiveSection] = useState<ActiveSection>('rules');
  const [rules, setRules] = useState<Rule[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [vipActive, setVipActive] = useState<boolean>(false);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>({
    enabled: false,
    host: '127.0.0.1',
    port: 8080,
    mode: 'fixed_servers',
    bypassList: ['localhost', '127.0.0.1', '<local>']
  });

  // Settings State
  const [settings, setSettings] = useState<ExtensionSettings>({
    autoApply: true,
    watchChanges: true,
    continuousMode: false,
    pollingInterval: 500,
    vipActive: false,
    highlightActive: false
  });

  // Proxy MITM Server State
  const [proxyServerOnline, setProxyServerOnline] = useState<boolean>(false);
  const [proxyServerRules, setProxyServerRules] = useState<ProxyServerRule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chromeProxyActive, setChromeProxyActive] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Modal State for Rule Editing/Creation
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formFind, setFormFind] = useState<string>('');
  const [formReplace, setFormReplace] = useState<string>('');
  const [formSelector, setFormSelector] = useState<string>('');
  const [formUrlFilter, setFormUrlFilter] = useState<string>('');
  const [formMode, setFormMode] = useState<'normal' | 'vip' | 'ultra'>('normal');
  const [formUseRegex, setFormUseRegex] = useState<boolean>(false);
  const [formCaseSensitive, setFormCaseSensitive] = useState<boolean>(false);

  // Status message feedback
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  useEffect(() => {
    loadAllData();
    checkProxyServerStatus();
    checkChromeProxyStatus();

    if (typeof chrome !== 'undefined' && chrome.storage) {
      const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
        if (area === 'local' && changes.rules) {
          setRules(changes.rules.newValue || []);
        }
      };
      chrome.storage.onChanged.addListener(storageListener);
      return () => chrome.storage.onChanged.removeListener(storageListener);
    }
  }, []);

  const loadAllData = () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.runtime.sendMessage({ action: 'getRules' }, (res) => {
        if (res && res.rules) setRules(res.rules);
      });

      chrome.runtime.sendMessage({ action: 'getVipStatus' }, (res) => {
        if (res) setVipActive(!!res.vipActive);
      });

      chrome.runtime.sendMessage({ action: 'getStats' }, (res) => {
        if (res && res.stats) setStats(res.stats);
      });

      chrome.runtime.sendMessage({ action: 'getProxyConfig' }, (res) => {
        if (res && res.config) setProxyConfig(res.config);
      });

      chrome.runtime.sendMessage({ action: 'getSettings' }, (res) => {
        if (res) {
          setSettings({
            autoApply: !!res.autoApply,
            watchChanges: res.watchChanges !== false,
            continuousMode: !!res.continuousMode,
            pollingInterval: res.pollingInterval || 500,
            vipActive: !!res.vipActive,
            highlightActive: !!res.highlightActive
          });
        }
      });
    }
  };

  const checkChromeProxyStatus = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'getProxyStatus' }, (res) => {
        if (res) setChromeProxyActive(!!res.active);
      });
    }
  };

  const checkProxyServerStatus = async () => {
    try {
      const res = await fetch('http://localhost:8888/status', { method: 'GET' });
      if (res.ok) {
        setProxyServerOnline(true);
        fetchProxyServerRules();
        connectProxyWs();
      } else {
        setProxyServerOnline(false);
      }
    } catch {
      setProxyServerOnline(false);
    }
  };

  const fetchProxyServerRules = async () => {
    try {
      const res = await fetch('http://localhost:8888/rules');
      if (res.ok) {
        const data = await res.json();
        setProxyServerRules(data);
      }
    } catch {
      // Ignored
    }
  };

  const connectProxyWs = () => {
    if (wsRef.current) return;
    try {
      const ws = new WebSocket('ws://localhost:8888');
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'request') {
            setLogs((prev) => [data, ...prev.slice(0, 99)]);
          }
        } catch {
          // Ignored
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
      };
      wsRef.current = ws;
    } catch {
      // Ignored
    }
  };

  const handleAddUltraServerRule = async () => {
    const find = prompt('Texto ou Regex para buscar na resposta da API:');
    if (!find) return;
    const replace = prompt('Substituir por (deixe vazio para remover):', '') ?? '';
    const name = prompt('Nome descritivo da regra:', 'Regra Proxy Server') || 'Regra Proxy Server';

    try {
      const res = await fetch('http://localhost:8888/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, find, replace, enabled: true })
      });
      if (res.ok) {
        fetchProxyServerRules();
        showStatus('Regra adicionada no servidor Proxy Node.js!', 'success');
      } else {
        showStatus('Erro ao comunicar com o servidor Proxy Node.js.', 'error');
      }
    } catch {
      showStatus('Servidor Proxy offline. Inicie o servidor em proxy-server/ primeiro.', 'error');
    }
  };

  const handleToggleUltraServerRule = async (id: string, enabled: boolean) => {
    try {
      await fetch(`http://localhost:8888/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      fetchProxyServerRules();
    } catch {
      // Ignored
    }
  };

  const handleDeleteUltraServerRule = async (id: string) => {
    if (!confirm('Excluir esta regra do servidor Proxy?')) return;
    try {
      await fetch(`http://localhost:8888/rules/${id}`, { method: 'DELETE' });
      fetchProxyServerRules();
      showStatus('Regra removida do servidor Proxy.', 'info');
    } catch {
      // Ignored
    }
  };

  const saveRulesToStorage = (updatedRules: Rule[]) => {
    setRules(updatedRules);
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'saveRules', rules: updatedRules });
    }
  };

  const saveSettingsToStorage = (newSettings: Partial<ExtensionSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'saveSettings', settings: newSettings });
    }
    showStatus('Configurações salvas!', 'success');
  };

  const handleOpenCreateModal = (mode: 'normal' | 'vip' | 'ultra' = 'normal') => {
    setEditingRuleId(null);
    setFormName('');
    setFormFind('');
    setFormReplace('');
    setFormSelector('');
    setFormUrlFilter('');
    setFormMode(mode);
    setFormUseRegex(false);
    setFormCaseSensitive(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rule: Rule) => {
    setEditingRuleId(rule.id);
    setFormName(rule.name || '');
    setFormFind(rule.find);
    setFormReplace(rule.replace);
    setFormSelector(rule.selector || '');
    setFormUrlFilter(rule.urlFilter || '');
    setFormMode(rule.mode || 'normal');
    setFormUseRegex(rule.useRegex);
    setFormCaseSensitive(rule.caseSensitive);
    setIsModalOpen(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFind.trim()) return;

    if (editingRuleId) {
      const updated = rules.map((r) =>
        r.id === editingRuleId
          ? {
              ...r,
              name: formName || formFind,
              find: formFind,
              replace: formReplace,
              selector: formSelector,
              urlFilter: formUrlFilter,
              mode: formMode,
              useRegex: formUseRegex,
              caseSensitive: formCaseSensitive
            }
          : r
      );
      saveRulesToStorage(updated);
    } else {
      const newRule: Rule = {
        id: 'rule-' + Date.now(),
        name: formName || formFind,
        find: formFind,
        replace: formReplace,
        selector: formSelector,
        urlFilter: formUrlFilter,
        mode: formMode,
        useRegex: formUseRegex,
        caseSensitive: formCaseSensitive,
        enabled: true,
        createdAt: Date.now()
      };
      saveRulesToStorage([newRule, ...rules]);
    }

    setIsModalOpen(false);
    showStatus('Regra salva com sucesso!', 'success');
  };

  const handleDeleteRule = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    saveRulesToStorage(updated);
    showStatus('Regra excluída.', 'info');
  };

  const handleToggleRule = (id: string) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    saveRulesToStorage(updated);
  };

  const handleToggleVipMaster = () => {
    const nextState = !vipActive;
    setVipActive(nextState);
    saveSettingsToStorage({ vipActive: nextState });
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'setVipStatus', vipActive: nextState });
    }
  };

  const handleToggleChromeProxy = () => {
    const nextState = !chromeProxyActive;
    setChromeProxyActive(nextState);
    const action = nextState ? 'activateProxy' : 'deactivateProxy';
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action }, () => {
        showStatus(`Proxy do Chrome ${nextState ? 'ativado' : 'desativado'}!`, 'success');
      });
    }
  };

  const handleAddPreset = (preset: typeof PRESET_RULES[0]) => {
    const newRule: Rule = {
      ...preset,
      id: 'preset-' + Date.now(),
      mode: 'normal',
      enabled: true,
      createdAt: Date.now()
    };
    saveRulesToStorage([newRule, ...rules]);
    showStatus(`Preset "${preset.name}" adicionado!`, 'success');
  };

  const handleClearStats = () => {
    if (!confirm('Deseja zerar todas as estatísticas acumuladas?')) return;
    setStats({});
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'clearStats' });
    }
    showStatus('Estatísticas zeradas.', 'info');
  };

  const handleWipeAllData = () => {
    if (!confirm('TEM CERTEZA? Esta ação apagará PERMANENTEMENTE todas as regras e configurações armazenadas!')) return;
    setRules([]);
    setStats({});
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'clearAllData' }, () => {
        showStatus('Todos os dados foram apagados.', 'error');
      });
    }
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rules, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `mpld_rules_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showStatus('Backup JSON exportado!', 'success');
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          saveRulesToStorage(imported);
          showStatus(`${imported.length} regras importadas com sucesso!`, 'success');
        }
      } catch {
        showStatus('Erro ao importar arquivo JSON.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleCopyStartCommand = () => {
    const cmd = 'cd proxy-server && npm start';
    navigator.clipboard.writeText(cmd);
    showStatus('Comando copiado para a área de transferência!', 'success');
  };

  const showStatus = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const filteredRules = rules.filter(
    (r) =>
      r.find.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.replace.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.name && r.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalReplacementsCount = Object.values(stats).reduce((acc, curr) => acc + curr, 0);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4 shrink-0">
        <div className="space-y-6">
          {/* Logo & Brand Header */}
          <div className="flex items-center space-x-3 px-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white">MPLD</h1>
              <p className="text-xs text-slate-400">Manipulador de Texto & Rede</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 text-xs">
            <button
              onClick={() => setActiveSection('rules')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-all ${
                activeSection === 'rules'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Code className="w-4 h-4" />
                <span>Regras de Texto (DOM)</span>
              </div>
              <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full text-[10px]">
                {rules.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSection('vip')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-all ${
                activeSection === 'vip'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Crown className="w-4 h-4 text-amber-400" />
                <span>VIP (XHR/Fetch)</span>
              </div>
              <span className={`px-1.5 py-0.5 rounded text-[10px] border font-bold ${
                vipActive ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {vipActive ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              onClick={() => setActiveSection('ultra')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-all ${
                activeSection === 'ultra'
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Radio className="w-4 h-4 text-indigo-400" />
                <span>VIP Ultra (Proxy MITM)</span>
              </div>
              <span className={`px-1.5 py-0.5 rounded text-[10px] border font-bold ${
                proxyServerOnline ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}>
                {proxyServerOnline ? 'ONLINE' : 'OFF'}
              </span>
            </button>

            <button
              onClick={() => setActiveSection('presets')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-all ${
                activeSection === 'presets'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-4 h-4" />
                <span>Presets & Modelos</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSection('stats')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-all ${
                activeSection === 'stats'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <BarChart3 className="w-4 h-4" />
                <span>Estatísticas & Analytics</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSection('settings')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-all ${
                activeSection === 'settings'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Settings className="w-4 h-4" />
                <span>Configurações & Backup</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between px-2">
          <span>Versão 2.0.0 (Release)</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {/* Header Toolbar */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/40 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
              {activeSection === 'rules' && <span>Regras de Substituição DOM</span>}
              {activeSection === 'vip' && (
                <>
                  <Crown className="w-5 h-5 text-amber-400" />
                  <span>Modo VIP — Interceptador XHR/Fetch Client-Side</span>
                </>
              )}
              {activeSection === 'ultra' && (
                <>
                  <Shield className="w-5 h-5 text-indigo-400" />
                  <span>VIP Ultra — Servidor Proxy MITM de Rede</span>
                </>
              )}
              {activeSection === 'presets' && <span>Biblioteca de Presets Prontos</span>}
              {activeSection === 'stats' && <span>Relatório de Estatísticas de Execução</span>}
              {activeSection === 'settings' && <span>Configurações Comportamentais & Sistema</span>}
            </h2>
            <p className="text-xs text-slate-400">
              {activeSection === 'rules' && 'Crie e gerencie substituições automáticas de texto em páginas web'}
              {activeSection === 'vip' && 'Intercepta chamadas API (XHR/Fetch) na raiz antes de renderizar'}
              {activeSection === 'ultra' && 'Interceptação total TCP/HTTP via servidor local Node.js e certificado CA'}
              {activeSection === 'presets' && 'Modelos prontos para mascarar valores, spoilers e moedas'}
              {activeSection === 'stats' && 'Métricas acumuladas de substituições em tempo real'}
              {activeSection === 'settings' && 'Controle MutationObserver, polling contínuo e backups'}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {activeSection === 'rules' && (
              <>
                <button
                  onClick={handleExportJSON}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar</span>
                </button>

                <label className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Importar</span>
                  <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                </label>

                <button
                  onClick={() => handleOpenCreateModal('normal')}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition-all shadow-sm shadow-emerald-950"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Regra</span>
                </button>
              </>
            )}

            {activeSection === 'vip' && (
              <button
                onClick={() => handleOpenCreateModal('vip')}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Regra VIP</span>
              </button>
            )}

            {activeSection === 'stats' && (
              <button
                onClick={handleClearStats}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs font-medium text-slate-300 hover:text-rose-400 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Zerar Contadores</span>
              </button>
            )}
          </div>
        </header>

        {/* Feedback Banner */}
        {statusMsg && (
          <div
            className={`px-8 py-2 text-xs flex items-center space-x-2 border-b ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                : statusMsg.type === 'error'
                ? 'bg-rose-950/80 border-rose-800 text-rose-300'
                : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Content View Router */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* SECTION: RULES (DOM) */}
          {activeSection === 'rules' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar regras por termo de busca, substituto ou nome..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition-colors"
                />
              </div>

              {/* Rules Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Modo</th>
                      <th className="py-3 px-4">Nome / Regra</th>
                      <th className="py-3 px-4">Buscar (Original)</th>
                      <th className="py-3 px-4">Substituir Por</th>
                      <th className="py-3 px-4">Seletor / URL</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                    {filteredRules.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                          Nenhuma regra cadastrada. Clique em "Nova Regra" ou adicione um Preset.
                        </td>
                      </tr>
                    ) : (
                      filteredRules.map((rule) => (
                        <tr key={rule.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-sans">
                            <button
                              onClick={() => handleToggleRule(rule.id)}
                              className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors ${
                                rule.enabled ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                              }`}
                            >
                              <span className="w-3 h-3 rounded-full bg-slate-950 shadow-sm" />
                            </button>
                          </td>
                          <td className="py-3 px-4 font-sans">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border flex items-center space-x-1 w-fit ${
                              rule.mode === 'vip'
                                ? 'bg-amber-950 text-amber-400 border-amber-800/60'
                                : rule.mode === 'ultra'
                                ? 'bg-indigo-950 text-indigo-400 border-indigo-800/60'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {rule.mode === 'vip' ? (
                                <>
                                  <Crown className="w-3 h-3 text-amber-400" />
                                  <span>VIP</span>
                                </>
                              ) : rule.mode === 'ultra' ? (
                                <>
                                  <Shield className="w-3 h-3 text-indigo-400" />
                                  <span>Ultra</span>
                                </>
                              ) : (
                                <>
                                  <FileText className="w-3 h-3 text-slate-400" />
                                  <span>DOM</span>
                                </>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-sans font-medium text-slate-200">
                            {rule.name || 'Sem nome'}
                          </td>
                          <td className="py-3 px-4 text-emerald-400 font-semibold">
                            {rule.find}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {rule.replace || <span className="text-slate-600 font-sans italic">(remover)</span>}
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-sans space-x-1">
                            {rule.selector && (
                              <span className="bg-slate-800 text-slate-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-700">
                                {rule.selector}
                              </span>
                            )}
                            {rule.urlFilter && (
                              <span className="bg-amber-950/60 text-amber-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-amber-800/40">
                                {rule.urlFilter}
                              </span>
                            )}
                            {!rule.selector && !rule.urlFilter && (
                              <span className="text-slate-600">Global</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-sans">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleOpenEditModal(rule)}
                                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="p-1.5 hover:bg-rose-950/60 rounded text-slate-400 hover:text-rose-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION: VIP (XHR/FETCH CLIENT-SIDE) */}
          {activeSection === 'vip' && (
            <div className="space-y-6">
              {/* VIP Hero Card */}
              <div className="relative overflow-hidden bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl p-6 shadow-xl">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                      <Crown className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-white">Modo VIP — Interceptação Client-Side de Rede</h3>
                      <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                        Injeta um monkey-patch direto nos protótipos de <code>XMLHttpRequest</code>, <code>window.fetch()</code> e <code>JSON.parse()</code>.
                        Todas as respostas de API do site são alteradas na memória <em>antes</em> de chegarem ao React, Vue ou Angular da página.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 bg-slate-900/80 px-4 py-3 rounded-xl border border-amber-500/20">
                    <span className="text-xs font-semibold text-slate-300">Status VIP:</span>
                    <button
                      onClick={handleToggleVipMaster}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5 ${
                        vipActive
                          ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-amber-900/30'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${vipActive ? 'bg-slate-950 animate-pulse' : 'bg-slate-500'}`} />
                      <span>{vipActive ? 'VIP ATIVO' : 'DESATIVADO'}</span>
                    </button>
                  </div>
                </div>

                {/* VIP Feature Cards */}
                <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-amber-500/20 text-xs">
                  <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-semibold text-amber-400 flex items-center space-x-1.5 mb-1">
                      <RefreshCw className="w-4 h-4" />
                      <span>Intercepta XHR & Fetch</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Sobrescreve chamadas AJAX nativas do browser. Funciona com Axios, jQuery, Fetch API e GraphQL.
                    </p>
                  </div>

                  <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-semibold text-amber-400 flex items-center space-x-1.5 mb-1">
                      <Zap className="w-4 h-4" />
                      <span>Antes do Render</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Modifica o payload bruto da API. O frontend recebe o dado já alterado como se fosse a resposta real da API.
                    </p>
                  </div>

                  <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-semibold text-amber-400 flex items-center space-x-1.5 mb-1">
                      <Shield className="w-4 h-4" />
                      <span>Single Page Apps (SPA)</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Perfeito para dashboards e sistemas bancários que atualizam via polling sem recarregar o HTML.
                    </p>
                  </div>
                </div>
              </div>

              {/* VIP Rules Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-white flex items-center space-x-2">
                    <Crown className="w-4 h-4 text-amber-400" />
                    <span>Regras Aplicadas no Modo VIP</span>
                  </h4>
                  <button
                    onClick={() => handleOpenCreateModal('vip')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Regra VIP</span>
                  </button>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Nome</th>
                        <th className="py-3 px-4">Buscar (Payload API)</th>
                        <th className="py-3 px-4">Substituir Por</th>
                        <th className="py-3 px-4">Filtro URL</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                      {rules.filter((r) => r.mode === 'vip' || (vipActive && r.enabled)).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                            Nenhuma regra VIP cadastrada. Clique em "Adicionar Regra VIP" para criar substituições de API.
                          </td>
                        </tr>
                      ) : (
                        rules
                          .filter((r) => r.mode === 'vip' || (vipActive && r.enabled))
                          .map((rule) => (
                            <tr key={rule.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-4 font-sans">
                                <button
                                  onClick={() => handleToggleRule(rule.id)}
                                  className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors ${
                                    rule.enabled ? 'bg-amber-500 justify-end' : 'bg-slate-700 justify-start'
                                  }`}
                                >
                                  <span className="w-3 h-3 rounded-full bg-slate-950 shadow-sm" />
                                </button>
                              </td>
                              <td className="py-3 px-4 font-sans font-medium text-slate-200">
                                {rule.name || 'Sem nome'}
                              </td>
                              <td className="py-3 px-4 text-amber-400 font-semibold">
                                {rule.find}
                              </td>
                              <td className="py-3 px-4 text-slate-300">
                                {rule.replace || <span className="text-slate-600 font-sans italic">(remover)</span>}
                              </td>
                              <td className="py-3 px-4 text-slate-400 font-sans">
                                {rule.urlFilter ? (
                                  <span className="bg-amber-950/60 text-amber-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-amber-800/40">
                                    {rule.urlFilter}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">Todas APIs</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-sans">
                                <div className="flex items-center justify-end space-x-2">
                                  <button
                                    onClick={() => handleOpenEditModal(rule)}
                                    className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRule(rule.id)}
                                    className="p-1.5 hover:bg-rose-950/60 rounded text-slate-400 hover:text-rose-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: VIP ULTRA (PROXY MITM) */}
          {activeSection === 'ultra' && (
            <div className="space-y-6">
              {/* Proxy MITM Header Card */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                      <Radio className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-base text-white">Servidor Proxy MITM (Ultra)</h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1.5 ${
                          proxyServerOnline
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border-rose-800'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${proxyServerOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                          <span>{proxyServerOnline ? 'SERVIDOR ONLINE' : 'SERVIDOR OFFLINE'}</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">Redireciona o tráfego TCP/HTTP/HTTPS via servidor Node.js local (porta 8080/8888)</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleToggleChromeProxy}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-semibold text-xs transition-all ${
                        chromeProxyActive
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <Radio className="w-4 h-4" />
                      <span>{chromeProxyActive ? 'Proxy no Chrome Ativo' : 'Ativar Proxy no Chrome'}</span>
                    </button>
                  </div>
                </div>

                {/* Quick Info & Actions Grid */}
                <div className="grid grid-cols-4 gap-4 text-xs">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-slate-500 font-sans block text-[10px]">Host Local</span>
                    <span className="text-indigo-400 font-mono font-semibold">127.0.0.1</span>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-slate-500 font-sans block text-[10px]">Porta Proxy MITM</span>
                    <span className="text-indigo-400 font-mono font-semibold">8080</span>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-slate-500 font-sans block text-[10px]">Porta Dashboard API</span>
                    <span className="text-indigo-400 font-mono font-semibold">8888</span>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-slate-500 font-sans block text-[10px]">Regras do Backend</span>
                    <span className="text-indigo-400 font-mono font-semibold">{proxyServerRules.length}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3 pt-2">
                  <a
                    href="http://localhost:8888/cert"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Certificado CA</span>
                  </a>

                  <button
                    onClick={handleCopyStartCommand}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Copiar Comando Iniciar Servidor</span>
                  </button>

                  <button
                    onClick={checkProxyServerStatus}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Verificar Conexão</span>
                  </button>

                  <button
                    onClick={handleAddUltraServerRule}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all ml-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Nova Regra Proxy Node</span>
                  </button>
                </div>
              </div>

              {/* Node Proxy Rules Interactive Table */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="font-bold text-sm text-white flex items-center space-x-2">
                    <ListFilter className="w-4 h-4 text-indigo-400" />
                    <span>Regras Ativas no Servidor Node.js</span>
                  </h4>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {proxyServerRules.length} regra(s) registradas
                  </span>
                </div>

                <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4">Nome</th>
                        <th className="py-2.5 px-4">Buscar (Payload TCP)</th>
                        <th className="py-2.5 px-4">Substituir Por</th>
                        <th className="py-2.5 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                      {proxyServerRules.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-500 font-sans">
                            {proxyServerOnline
                              ? 'Nenhuma regra configurada no servidor Node.js. Clique em "+ Nova Regra Proxy Node".'
                              : 'Servidor Proxy Node.js offline. Inicie o servidor para gerenciar regras.'}
                          </td>
                        </tr>
                      ) : (
                        proxyServerRules.map((pRule) => (
                          <tr key={pRule.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-2.5 px-4 font-sans">
                              <button
                                onClick={() => handleToggleUltraServerRule(pRule.id, !pRule.enabled)}
                                className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors ${
                                  pRule.enabled ? 'bg-indigo-500 justify-end' : 'bg-slate-700 justify-start'
                                }`}
                              >
                                <span className="w-3 h-3 rounded-full bg-slate-950 shadow-sm" />
                              </button>
                            </td>
                            <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                              {pRule.name}
                            </td>
                            <td className="py-2.5 px-4 text-indigo-400 font-semibold">{pRule.find}</td>
                            <td className="py-2.5 px-4 text-slate-300">{pRule.replace || '(remover)'}</td>
                            <td className="py-2.5 px-4 text-right font-sans">
                              <button
                                onClick={() => handleDeleteUltraServerRule(pRule.id)}
                                className="p-1.5 hover:bg-rose-950/60 rounded text-slate-400 hover:text-rose-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Live WebSocket Log Console */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="font-bold text-sm text-white flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    <span>Log de Requisições em Tempo Real (WebSocket)</span>
                  </h4>
                  <span className="text-[11px] text-slate-500 font-mono">ws://localhost:8888</span>
                </div>

                <div className="bg-slate-950 rounded-xl p-3 font-mono text-[11px] h-48 overflow-y-auto space-y-1 border border-slate-800/80">
                  {logs.length === 0 ? (
                    <div className="text-slate-600 italic py-4 text-center">
                      Aguardando tráfego HTTP/HTTPS pelo proxy...
                    </div>
                  ) : (
                    logs.map((log, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center space-x-3 ${
                          log.modified ? 'text-amber-400 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        <span className="text-slate-600 text-[10px]">{log.timestamp}</span>
                        <span className="w-12 text-slate-300">{log.method}</span>
                        <span className="w-10">{log.status}</span>
                        <span className="truncate flex-1">{log.url}</span>
                        {log.modified && (
                          <span className="bg-amber-950 text-amber-300 px-1.5 py-0.2 rounded text-[9px] border border-amber-800">
                            MODIFICADO ({log.matchCount})
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Device Setup Guide */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
                <h4 className="font-bold text-sm text-white flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  <span>Guia de Configuração para Celulares (Android / iOS)</span>
                </h4>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                    <span className="font-bold text-emerald-400 flex items-center space-x-1.5">
                      <Bot className="w-4 h-4 text-emerald-400" />
                      <span>Android</span>
                    </span>
                    <ol className="list-decimal list-inside space-y-1 text-slate-400">
                      <li>Conecte o celular na mesma rede Wi-Fi do computador.</li>
                      <li>Vá em Wi-Fi → Editar Rede → Proxy Manual.</li>
                      <li>Host: IP do seu PC, Porta: <code className="text-emerald-300 font-mono">8080</code>.</li>
                      <li>Acesse <code className="text-emerald-300 font-mono">http://[IP_DO_PC]:8888/cert</code> e baixe o certificado CA.</li>
                      <li>Instale o certificado em Configurações → Segurança → Certificados.</li>
                    </ol>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                    <span className="font-bold text-indigo-400 flex items-center space-x-1.5">
                      <Smartphone className="w-4 h-4 text-indigo-400" />
                      <span>iOS (iPhone / iPad)</span>
                    </span>
                    <ol className="list-decimal list-inside space-y-1 text-slate-400">
                      <li>Editar Wi-Fi → Proxy Manual → Configure o IP do PC e Porta 8080.</li>
                      <li>Abra o Safari e acesse <code className="text-indigo-300 font-mono">http://[IP_DO_PC]:8888/cert</code>.</li>
                      <li>Baixe o perfil de configuração e abra Ajustes → Perfil Baixado.</li>
                      <li>Ajustes → Geral → Sobre → Confiança em Certificados → Ativar chave.</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: PRESETS */}
          {activeSection === 'presets' && (
            <div className="grid grid-cols-2 gap-4">
              {PRESET_RULES.map((preset, idx) => (
                <div
                  key={idx}
                  className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/40">
                        {preset.category}
                      </span>
                      <Sparkles className="w-4 h-4 text-slate-500" />
                    </div>
                    <h3 className="font-bold text-sm text-white">{preset.name}</h3>
                    <div className="font-mono text-xs text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1">
                      <div><span className="text-slate-500">Find:</span> <span className="text-emerald-400">{preset.find}</span></div>
                      <div><span className="text-slate-500">Replace:</span> <span className="text-slate-300">{preset.replace}</span></div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddPreset(preset)}
                    className="w-full flex items-center justify-center space-x-1.5 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 py-2 rounded-lg text-xs font-medium transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar este Preset</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* SECTION: STATS */}
          {activeSection === 'stats' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Total de Substituições</span>
                  <div className="text-3xl font-bold text-emerald-400">{totalReplacementsCount}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Regras Cadastradas</span>
                  <div className="text-3xl font-bold text-white">{rules.length}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Regras Ativas</span>
                  <div className="text-3xl font-bold text-amber-400">
                    {rules.filter((r) => r.enabled).length}
                  </div>
                </div>
              </div>

              {/* Stats Breakdown Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="font-bold text-sm text-white">Detalhamento por Regra</h4>
                  <button
                    onClick={handleClearStats}
                    className="text-xs text-slate-400 hover:text-rose-400 transition-colors flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Zerar métricas</span>
                  </button>
                </div>

                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Regra</th>
                      <th className="py-3 px-4">Original (Find)</th>
                      <th className="py-3 px-4">Substituto (Replace)</th>
                      <th className="py-3 px-4 text-right">Execuções</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                    {Object.keys(stats).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500 font-sans">
                          Nenhuma substituição registrada ainda. Navegue em páginas com regras ativas para gerar estatísticas.
                        </td>
                      </tr>
                    ) : (
                      Object.entries(stats).map(([ruleId, count]) => {
                        const rule = rules.find((r) => r.id === ruleId);
                        return (
                          <tr key={ruleId} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-4 font-sans font-medium text-slate-200">
                              {rule?.name || ruleId}
                            </td>
                            <td className="py-3 px-4 text-emerald-400">{rule?.find || '—'}</td>
                            <td className="py-3 px-4 text-slate-300">{rule?.replace || '—'}</td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-400">{count}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION: SETTINGS */}
          {activeSection === 'settings' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {/* Auto Apply */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-white">Aplicação Automática (DOM Init)</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Executa as regras ativas no carregamento inicial da página. Recomendado para a maioria dos sites.
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-medium text-slate-300">Auto Apply:</span>
                    <button
                      onClick={() => saveSettingsToStorage({ autoApply: !settings.autoApply })}
                      className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                        settings.autoApply ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-slate-950 shadow-sm" />
                    </button>
                  </div>
                </div>

                {/* Watch DOM */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-white">Observar Mudanças no DOM (MutationObserver)</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Escuta novos elementos inseridos dinamicamente na página. Essencial para scroll infinito e SPAs.
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-medium text-slate-300">MutationObserver:</span>
                    <button
                      onClick={() => saveSettingsToStorage({ watchChanges: !settings.watchChanges })}
                      className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                        settings.watchChanges ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-slate-950 shadow-sm" />
                    </button>
                  </div>
                </div>

                {/* Continuous Mode */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-white flex items-center space-x-1.5">
                      <RefreshCw className="w-4 h-4 text-emerald-400" />
                      <span>Modo Contínuo (Polling Forçado)</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Re-aplica as regras em intervalo fixo (<code>setInterval</code>). Útil para sites agressivos que limpam o DOM.
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-medium text-slate-300">Polling Contínuo:</span>
                    <button
                      onClick={() => saveSettingsToStorage({ continuousMode: !settings.continuousMode })}
                      className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                        settings.continuousMode ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-slate-950 shadow-sm" />
                    </button>
                  </div>
                </div>

                {/* Polling Interval Slider (visible when continuous mode is active or always available) */}
                {settings.continuousMode && (
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-white">Intervalo do Polling Contínuo</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Tempo entre varreduras no modo contínuo (em ms). Valor atual: <code className="text-emerald-400 font-mono">{settings.pollingInterval}ms</code>
                      </p>
                    </div>
                    <div className="pt-2">
                      <input
                        type="range"
                        min={200}
                        max={3000}
                        step={100}
                        value={settings.pollingInterval}
                        onChange={(e) => saveSettingsToStorage({ pollingInterval: Number(e.target.value) })}
                        className="w-full accent-emerald-500 bg-slate-800 rounded"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Danger Zone / Reset */}
              <div className="bg-rose-950/40 border border-rose-900/60 p-6 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-rose-300 flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Apagar Todos os Dados (Hard Reset)</span>
                  </h4>
                  <p className="text-xs text-rose-300/70 mt-1">
                    Apaga permanentemente todas as regras, configurações e estatísticas do armazenamento local.
                  </p>
                </div>

                <button
                  onClick={handleWipeAllData}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-rose-950"
                >
                  Wipe Completo
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal for Rule Editing / Creation */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveModal}
            className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white">
                {editingRuleId ? 'Editar Regra' : 'Nova Regra de Substituição'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Nome Identificador</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Mascarar saldo, Alterar preço..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Texto para Encontrar *</label>
                  <input
                    type="text"
                    required
                    value={formFind}
                    onChange={(e) => setFormFind(e.target.value)}
                    placeholder="Ex: R$ 100"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Substituir Por</label>
                  <input
                    type="text"
                    value={formReplace}
                    onChange={(e) => setFormReplace(e.target.value)}
                    placeholder="Ex: R$ 0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Filtro de URL (Opcional)</label>
                <input
                  type="text"
                  value={formUrlFilter}
                  onChange={(e) => setFormUrlFilter(e.target.value)}
                  placeholder="Ex: mercadolivre.com.br ou google.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Seletor CSS Escopo (Opcional)</label>
                <input
                  type="text"
                  value={formSelector}
                  onChange={(e) => setFormSelector(e.target.value)}
                  placeholder="Ex: p.comment-body, h1, .price-tag"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Modo de Execução</label>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setFormMode('normal')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
                      formMode === 'normal'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Normal (DOM)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormMode('vip')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
                      formMode === 'vip'
                        ? 'bg-amber-950 text-amber-400 border-amber-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>VIP (XHR)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormMode('ultra')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
                      formMode === 'ultra'
                        ? 'bg-indigo-950 text-indigo-400 border-indigo-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Ultra (Proxy)</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-4 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formUseRegex}
                    onChange={(e) => setFormUseRegex(e.target.checked)}
                    className="accent-emerald-500 rounded bg-slate-800"
                  />
                  <span className="text-slate-300">Expressão Regular (Regex)</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formCaseSensitive}
                    onChange={(e) => setFormCaseSensitive(e.target.checked)}
                    className="accent-emerald-500 rounded bg-slate-800"
                  />
                  <span className="text-slate-300">Case Sensitive (Aa)</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500"
              >
                Salvar Regra
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
