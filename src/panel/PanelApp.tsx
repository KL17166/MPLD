import React, { useEffect, useState } from 'react';
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
  Play
} from 'lucide-react';
import { ProxyConfig, Rule } from '../types';
import { PRESET_RULES } from '../presets';

type ActiveSection = 'rules' | 'vip' | 'ultra' | 'stats' | 'presets' | 'settings';

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

  // Modal State for Rule Editing/Creation
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formFind, setFormFind] = useState<string>('');
  const [formReplace, setFormReplace] = useState<string>('');
  const [formSelector, setFormSelector] = useState<string>('');
  const [formUrlFilter, setFormUrlFilter] = useState<string>('');
  const [formUseRegex, setFormUseRegex] = useState<boolean>(false);
  const [formCaseSensitive, setFormCaseSensitive] = useState<boolean>(false);

  // Status message feedback
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
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
    }
  }, []);

  const saveRulesToStorage = (updatedRules: Rule[]) => {
    setRules(updatedRules);
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'saveRules', rules: updatedRules });
    }
  };

  const handleOpenCreateModal = () => {
    setEditingRuleId(null);
    setFormName('');
    setFormFind('');
    setFormReplace('');
    setFormSelector('');
    setFormUrlFilter('');
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
        useRegex: formUseRegex,
        caseSensitive: formCaseSensitive,
        enabled: true,
        createdAt: Date.now()
      };
      saveRulesToStorage([newRule, ...rules]);
    }

    setIsModalOpen(false);
    showStatus('Regra salva com sucesso!');
  };

  const handleDeleteRule = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    saveRulesToStorage(updated);
    showStatus('Regra excluída.');
  };

  const handleToggleRule = (id: string) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    saveRulesToStorage(updated);
  };

  const handleAddPreset = (preset: typeof PRESET_RULES[0]) => {
    const newRule: Rule = {
      ...preset,
      id: 'preset-' + Date.now(),
      enabled: true,
      createdAt: Date.now()
    };
    saveRulesToStorage([newRule, ...rules]);
    showStatus(`Preset "${preset.name}" adicionado!`);
  };

  const handleToggleProxy = () => {
    const nextConfig = { ...proxyConfig, enabled: !proxyConfig.enabled };
    setProxyConfig(nextConfig);
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'setProxyConfig', config: nextConfig });
    }
    showStatus(`Proxy MITM ${nextConfig.enabled ? 'ativado' : 'desativado'}.`);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rules, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `mpld_rules_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showStatus('Backup JSON exportado!');
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
          showStatus(`${imported.length} regras importadas com sucesso!`);
        }
      } catch {
        showStatus('Erro ao importar arquivo JSON.');
      }
    };
    reader.readAsText(file);
  };

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
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
                <Shield className="w-4 h-4 text-amber-400" />
                <span>VIP (XHR/Fetch)</span>
              </div>
              <span className="bg-amber-950 text-amber-400 px-1.5 py-0.5 rounded text-[10px] border border-amber-800/40">
                PRO
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
              <span className="bg-indigo-950 text-indigo-400 px-1.5 py-0.5 rounded text-[10px] border border-indigo-800/40">
                MITM
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
            <h2 className="text-lg font-bold text-white tracking-tight">
              {activeSection === 'rules' && 'Regras de Substituição DOM'}
              {activeSection === 'vip' && 'VIP — Interceptador Client-Side (XHR/Fetch)'}
              {activeSection === 'ultra' && 'VIP Ultra — Servidor Proxy MITM de Rede'}
              {activeSection === 'presets' && 'Biblioteca de Presets Prontos'}
              {activeSection === 'stats' && 'Relatório de Estatísticas de Execução'}
              {activeSection === 'settings' && 'Configurações do Sistema & Backup'}
            </h2>
            <p className="text-xs text-slate-400">
              Gerencie regras ativas, escopo por seletor CSS e interceptação de chamadas API
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
                  onClick={handleOpenCreateModal}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition-all shadow-sm shadow-emerald-950"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Regra</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Feedback Banner */}
        {statusMsg && (
          <div className="bg-emerald-950/80 border-b border-emerald-800 text-emerald-300 px-8 py-2 text-xs flex items-center space-x-2">
            <Check className="w-4 h-4" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Content View Router */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* SECTION: RULES */}
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
                      <th className="py-3 px-4">Nome / Regra</th>
                      <th className="py-3 px-4">Buscar (Original)</th>
                      <th className="py-3 px-4">Substituir Por</th>
                      <th className="py-3 px-4">Seletor / Filtro</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                    {filteredRules.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
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
                          <td className="py-3 px-4 font-sans font-medium text-slate-200">
                            {rule.name || 'Sem nome'}
                          </td>
                          <td className="py-3 px-4 text-emerald-400 font-semibold">
                            {rule.find}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {rule.replace || <span className="text-slate-600 font-sans italic">(remover)</span>}
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-sans">
                            {rule.selector ? (
                              <span className="bg-slate-800 text-slate-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-700">
                                {rule.selector}
                              </span>
                            ) : (
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

          {/* SECTION: VIP ULTRA PROXY */}
          {activeSection === 'ultra' && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                      <Radio className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">Servidor Proxy MITM (Ultra)</h3>
                      <p className="text-xs text-slate-400">Redireciona tráfego HTTP/HTTPS local para interceptação total</p>
                    </div>
                  </div>

                  <button
                    onClick={handleToggleProxy}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-xs transition-all ${
                      proxyConfig.enabled
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/30'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Radio className="w-4 h-4" />
                    <span>{proxyConfig.enabled ? 'Proxy MITM Ativo' : 'Ativar Proxy MITM'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-2">
                  <div className="bg-slate-950 p-3 rounded border border-slate-800">
                    <span className="text-slate-500 font-sans block text-[10px]">Host do Servidor</span>
                    <span className="text-indigo-400 font-semibold">{proxyConfig.host}</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded border border-slate-800">
                    <span className="text-slate-500 font-sans block text-[10px]">Porta HTTP/S</span>
                    <span className="text-indigo-400 font-semibold">{proxyConfig.port}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: STATS */}
          {activeSection === 'stats' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Total de Substituições</span>
                  <div className="text-2xl font-bold text-emerald-400">{totalReplacementsCount}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Regras Cadastradas</span>
                  <div className="text-2xl font-bold text-white">{rules.length}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Regras Ativas</span>
                  <div className="text-2xl font-bold text-amber-400">
                    {rules.filter((r) => r.enabled).length}
                  </div>
                </div>
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
            className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-xl p-6 space-y-4 shadow-2xl"
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
                  placeholder="Ex: Ocultar Preços em Reais"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Texto para Encontrar</label>
                  <input
                    type="text"
                    required
                    value={formFind}
                    onChange={(e) => setFormFind(e.target.value)}
                    placeholder="Ex: R$ 100"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Substituir Por</label>
                  <input
                    type="text"
                    value={formReplace}
                    onChange={(e) => setFormReplace(e.target.value)}
                    placeholder="Ex: R$ 0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Seletor CSS Escopo (Opcional)</label>
                <input
                  type="text"
                  value={formSelector}
                  onChange={(e) => setFormSelector(e.target.value)}
                  placeholder="Ex: p.comment-body, h1, .price-tag"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center space-x-4 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formUseRegex}
                    onChange={(e) => setFormUseRegex(e.target.checked)}
                    className="accent-emerald-500 rounded bg-slate-800"
                  />
                  <span className="text-slate-300">Usar Expressão Regular (Regex)</span>
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
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500"
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
