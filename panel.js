/**
 * ============================================================================
 * TEXT MANIPULATOR — PANEL SCRIPT (Refactored)
 * ============================================================================
 * Gerencia a UI do Painel: navegação SPA, CRUD de regras, VIP, Ultra Proxy,
 * configurações, estatísticas e comunicação com o Background Service Worker.
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // [1] ESTADO GLOBAL
  // ──────────────────────────────────────────────────────────────────────────
  let rules = [];
  let editingRuleId = null;

  // ──────────────────────────────────────────────────────────────────────────
  // [2] CACHE DE ELEMENTOS DOM
  // ──────────────────────────────────────────────────────────────────────────
  const navBtns              = document.querySelectorAll('.nav-btn');
  const sections             = document.querySelectorAll('.section');
  const rulesList            = document.getElementById('rulesList');
  const emptyState           = document.getElementById('emptyState');
  const quickGuide           = document.getElementById('quickGuide');
  const ruleModal            = document.getElementById('ruleModal');
  const modalTitle           = document.getElementById('modalTitle');
  const statsGrid            = document.getElementById('statsGrid');
  const emptyStats           = document.getElementById('emptyStats');

  // Buttons
  const btnAddRule           = document.getElementById('btnAddRule');
  const btnAddRuleEmpty      = document.getElementById('btnAddRuleEmpty');
  const btnImport            = document.getElementById('btnImport');
  const btnExport            = document.getElementById('btnExport');
  const btnCloseModal        = document.getElementById('btnCloseModal');
  const btnCancelModal       = document.getElementById('btnCancelModal');
  const btnSaveRule          = document.getElementById('btnSaveRule');
  const btnClearAll          = document.getElementById('btnClearAll');
  const btnClearStats        = document.getElementById('btnClearStats');
  const fileImport           = document.getElementById('fileImport');

  // Settings
  const autoApplyToggle      = document.getElementById('autoApply');
  const watchChangesToggle   = document.getElementById('watchChanges');
  const continuousModeToggle = document.getElementById('continuousMode');
  const pollingIntervalSlider = document.getElementById('pollingInterval');
  const pollingIntervalValue = document.getElementById('pollingIntervalValue');
  const pollingIntervalCard  = document.getElementById('pollingIntervalCard');

  // VIP
  const vipToggle            = document.getElementById('vipToggle');
  const vipStatusLabel       = document.getElementById('vipStatusLabel');

  // Sidebar info
  const navRulesBadge        = document.getElementById('navRulesBadge');
  const sidebarRulesInfo     = document.getElementById('sidebarRulesInfo');

  // Modal fields
  const ruleName             = document.getElementById('ruleName');
  const ruleFind             = document.getElementById('ruleFind');
  const ruleReplace          = document.getElementById('ruleReplace');
  const ruleUrl              = document.getElementById('ruleUrl');
  const ruleRegex            = document.getElementById('ruleRegex');
  const ruleCaseSensitive    = document.getElementById('ruleCaseSensitive');
  const modeSelector         = document.getElementById('modeSelector');
  const modeHint             = document.getElementById('modeHint');
  let selectedMode           = 'normal';

  // ──────────────────────────────────────────────────────────────────────────
  // [3] NAVEGAÇÃO SPA
  // ──────────────────────────────────────────────────────────────────────────
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sections.forEach(s => s.classList.remove('active'));
      document.getElementById(`section-${section}`).classList.add('active');

      if (section === 'stats') loadStats();
      if (section === 'ultra') ultraInit();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // [4] DATA LOADING
  // ──────────────────────────────────────────────────────────────────────────
  function loadRules() {
    chrome.runtime.sendMessage({ action: 'getRules' }, (response) => {
      rules = response?.rules || [];
      renderRules();
      updateSidebarBadge();
    });
  }

  function loadSettings() {
    chrome.storage.local.get(
      ['autoApply', 'watchChanges', 'continuousMode', 'pollingInterval', 'vipActive'],
      (data) => {
        autoApplyToggle.checked      = !!data.autoApply;
        watchChangesToggle.checked   = data.watchChanges !== false;
        continuousModeToggle.checked = !!data.continuousMode;

        const interval = data.pollingInterval || 500;
        pollingIntervalSlider.value      = interval;
        pollingIntervalValue.textContent = interval + 'ms';
        pollingIntervalCard.style.display = data.continuousMode ? 'flex' : 'none';

        vipToggle.checked = !!data.vipActive;
        updateVipLabel(!!data.vipActive);
      }
    );
  }

  function loadStats() {
    chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
      renderStats(response?.stats || {});
    });
  }

  function saveRules() {
    chrome.runtime.sendMessage({ action: 'saveRules', rules }, () => {
      renderRules();
      updateSidebarBadge();
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // [5] RENDERIZAÇÃO
  // ──────────────────────────────────────────────────────────────────────────
  function updateSidebarBadge() {
    const enabled = rules.filter(r => r.enabled).length;
    const total   = rules.length;

    if (total === 0) {
      navRulesBadge.classList.add('hidden');
      sidebarRulesInfo.textContent = 'Nenhuma regra';
    } else {
      navRulesBadge.classList.remove('hidden');
      navRulesBadge.textContent = enabled;
      sidebarRulesInfo.textContent = `${enabled}/${total} ativas`;
    }
  }

  function renderRules() {
    rulesList.innerHTML = '';

    if (rules.length === 0) {
      emptyState.style.display = 'flex';
      quickGuide.classList.remove('hidden');
      return;
    }

    emptyState.style.display = 'none';
    quickGuide.classList.add('hidden');

    rules.forEach((rule) => {
      const card = document.createElement('div');
      const isVip = !!rule.interceptRequests;
      const isUltra = rule.mode === 'ultra';
      card.className = `rule-card${rule.enabled ? '' : ' disabled'}${isVip ? ' vip-rule' : ''}${isUltra ? ' ultra-rule' : ''}`;

      const badges = [];
      if (isUltra)              badges.push('<span class="badge badge-ultra">🛡️ Ultra</span>');
      else if (isVip)           badges.push('<span class="badge badge-vip">👑 VIP</span>');
      else                      badges.push('<span class="badge badge-normal">📄 Normal</span>');
      if (rule.useRegex)        badges.push('<span class="badge badge-regex">Regex</span>');
      if (rule.caseSensitive)   badges.push('<span class="badge badge-case">Aa</span>');
      if (rule.urlFilter)       badges.push(`<span class="badge badge-url" title="${escapeHtml(rule.urlFilter)}">🔗 URL</span>`);

      card.innerHTML = `
        <div class="rule-toggle">
          <label class="switch">
            <input type="checkbox" ${rule.enabled ? 'checked' : ''} data-id="${rule.id}" class="rule-enabled-toggle">
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="rule-info">
          <div class="rule-name">${escapeHtml(rule.name || 'Sem nome')}</div>
          <div class="rule-details">
            <span class="rule-detail">
              <span class="label">Busca:</span>
              <span class="value" title="${escapeHtml(rule.find)}">${escapeHtml(rule.find)}</span>
            </span>
            <span class="rule-detail">
              <span class="label">→</span>
              <span class="value" title="${escapeHtml(rule.replace || '(remove)')}">
                ${rule.replace ? escapeHtml(rule.replace) : '<em style="opacity:.4">remove</em>'}
              </span>
            </span>
          </div>
          ${badges.length > 0 ? `<div class="rule-badges">${badges.join('')}</div>` : ''}
        </div>
        <div class="rule-actions">
          <button class="btn-icon rule-edit" data-id="${rule.id}" title="Editar regra">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button class="btn-icon rule-delete" data-id="${rule.id}" title="Excluir regra">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3,6 5,6 21,6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      `;
      rulesList.appendChild(card);
    });

    // Bind events on cards
    document.querySelectorAll('.rule-enabled-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const rule = rules.find(r => r.id === e.target.dataset.id);
        if (rule) { rule.enabled = e.target.checked; saveRules(); }
      });
    });

    document.querySelectorAll('.rule-edit').forEach(btn => {
      btn.addEventListener('click', (e) => editRule(e.currentTarget.dataset.id));
    });

    document.querySelectorAll('.rule-delete').forEach(btn => {
      btn.addEventListener('click', (e) => deleteRule(e.currentTarget.dataset.id));
    });
  }

  function renderStats(stats) {
    statsGrid.innerHTML = '';
    const entries = Object.entries(stats);

    if (entries.length === 0) {
      emptyStats.style.display = 'flex';
      return;
    }

    emptyStats.style.display = 'none';

    // Total card
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    const totalCard = document.createElement('div');
    totalCard.className = 'stat-card';
    totalCard.innerHTML = `
      <div class="stat-name">Total Acumulado</div>
      <div class="stat-value">${total.toLocaleString()}</div>
      <div class="stat-label">substituições em todas as regras</div>
    `;
    statsGrid.appendChild(totalCard);

    // Per-rule cards
    entries.sort((a, b) => b[1] - a[1]).forEach(([ruleId, count]) => {
      const rule = rules.find(r => r.id === ruleId);
      const name = rule ? (rule.name || rule.find) : ruleId;

      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `
        <div class="stat-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <div class="stat-value">${count.toLocaleString()}</div>
        <div class="stat-label">substituições realizadas</div>
      `;
      statsGrid.appendChild(card);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // [6] MODAIS
  // ──────────────────────────────────────────────────────────────────────────
  function openModal(title = 'Nova Regra de Substituição', subtitle = 'Preencha os campos abaixo para criar uma substituição automática.') {
    modalTitle.textContent = title;
    const sub = document.querySelector('.modal-subtitle');
    if (sub) sub.textContent = subtitle;
    ruleModal.classList.remove('hidden');
    setTimeout(() => ruleFind.focus(), 80);
  }

  function closeModal() {
    ruleModal.classList.add('hidden');
    editingRuleId = null;
    clearModalFields();
  }

  function clearModalFields() {
    ruleName.value = '';
    ruleFind.value = '';
    ruleReplace.value = '';
    ruleUrl.value = '';
    ruleRegex.checked = false;
    ruleCaseSensitive.checked = false;
    setMode('normal');
  }

  function setMode(mode) {
    selectedMode = mode;
    modeSelector.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    const hints = {
      normal: 'A regra age diretamente nos elementos de texto da página (substituição visual via TreeWalker).',
      vip: 'Intercepta respostas XHR/Fetch antes do JavaScript da página processá-las. Requer VIP ativo.',
      ultra: 'A regra é enviada ao proxy MITM Node.js e aplicada em todo o tráfego HTTP/HTTPS do navegador.'
    };
    modeHint.textContent = hints[mode] || '';
  }

  // Mode selector clicks
  modeSelector.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // [7] CRUD DE REGRAS
  // ──────────────────────────────────────────────────────────────────────────
  function addRule() {
    editingRuleId = null;
    clearModalFields();
    openModal('Nova Regra de Substituição');
  }

  function editRule(id) {
    const rule = rules.find(r => r.id === id);
    if (!rule) return;

    editingRuleId = id;
    ruleName.value          = rule.name || '';
    ruleFind.value          = rule.find || '';
    ruleReplace.value       = rule.replace || '';
    ruleUrl.value           = rule.urlFilter || '';
    ruleRegex.checked       = !!rule.useRegex;
    ruleCaseSensitive.checked = !!rule.caseSensitive;

    // Determine mode from rule properties
    if (rule.mode === 'ultra') {
      setMode('ultra');
    } else if (rule.interceptRequests) {
      setMode('vip');
    } else {
      setMode('normal');
    }

    openModal('Editar Regra', 'Modifique os campos e salve para atualizar a regra.');
  }

  function deleteRule(id) {
    rules = rules.filter(r => r.id !== id);
    saveRules();
    showToast('Regra excluída com sucesso.', 'success');
  }

  function saveCurrentRule() {
    const find = ruleFind.value.trim();
    if (!find) {
      showToast('O campo "Buscar" é obrigatório.', 'error');
      ruleFind.focus();
      return;
    }

    const isVip   = selectedMode === 'vip';
    const isUltra = selectedMode === 'ultra';

    if (editingRuleId) {
      const rule = rules.find(r => r.id === editingRuleId);
      if (rule) {
        rule.name              = ruleName.value.trim();
        rule.find              = find;
        rule.replace           = ruleReplace.value;
        rule.urlFilter         = ruleUrl.value.trim();
        rule.useRegex          = ruleRegex.checked;
        rule.caseSensitive     = ruleCaseSensitive.checked;
        rule.interceptRequests = isVip;
        rule.mode              = selectedMode;
      }
    } else {
      rules.push({
        id:               generateId(),
        name:             ruleName.value.trim() || `Regra ${rules.length + 1}`,
        find,
        replace:          ruleReplace.value,
        urlFilter:        ruleUrl.value.trim(),
        useRegex:         ruleRegex.checked,
        caseSensitive:    ruleCaseSensitive.checked,
        interceptRequests: isVip,
        mode:             selectedMode,
        enabled:          true
      });
    }

    // If Ultra, also send to proxy server
    if (isUltra) {
      const proxyRule = {
        name:          ruleName.value.trim() || find.substring(0, 28),
        find,
        replace:       ruleReplace.value,
        urlFilter:     ruleUrl.value.trim(),
        useRegex:      ruleRegex.checked,
        caseSensitive: ruleCaseSensitive.checked,
        enabled:       true
      };
      fetch('http://localhost:8888/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyRule)
      }).catch(() => {
        showToast('⚠ Proxy offline — regra salva só localmente.', 'error');
      });
    }

    const wasEditing = !!editingRuleId;
    saveRules();
    closeModal();
    showToast(wasEditing ? '✓ Regra atualizada!' : '✓ Regra criada!', 'success');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // [8] IMPORTAÇÃO / EXPORTAÇÃO
  // ──────────────────────────────────────────────────────────────────────────
  function exportRules() {
    const data = JSON.stringify(rules, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `text-manipulator-rules-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ ${rules.length} regra(s) exportada(s)!`, 'success');
  }

  function importRules(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) throw new Error('Formato inválido');

        let count = 0;
        for (const rule of imported) {
          if (rule.find) {
            rules.push({
              id:               generateId(),
              name:             rule.name || `Importada ${count + 1}`,
              find:             rule.find,
              replace:          rule.replace || '',
              urlFilter:        rule.urlFilter || '',
              useRegex:         !!rule.useRegex,
              caseSensitive:    !!rule.caseSensitive,
              interceptRequests: !!rule.interceptRequests,
              enabled:          rule.enabled !== false
            });
            count++;
          }
        }

        saveRules();
        showToast(`✓ ${count} regra(s) importada(s)!`, 'success');
      } catch {
        showToast('Erro ao importar: arquivo JSON inválido.', 'error');
      }
    };
    reader.readAsText(file);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // [9] VIP MODE
  // ──────────────────────────────────────────────────────────────────────────
  function updateVipLabel(active) {
    vipStatusLabel.textContent = active ? 'Ativado — Hooker injetado' : 'Desativado';
    vipStatusLabel.classList.toggle('active', active);
  }

  vipToggle.addEventListener('change', () => {
    const active = vipToggle.checked;
    chrome.runtime.sendMessage({ action: 'setVipStatus', vipActive: active }, () => {
      updateVipLabel(active);
      showToast(
        active
          ? '👑 Modo VIP ativado! XHR/Fetch serão interceptados.'
          : 'Modo VIP desativado — interceptação removida.',
        'success'
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // [10] SETTINGS EVENTS
  // ──────────────────────────────────────────────────────────────────────────
  autoApplyToggle.addEventListener('change', () => {
    chrome.storage.local.set({ autoApply: autoApplyToggle.checked });
    showToast(
      autoApplyToggle.checked
        ? 'Aplicação automática ativada (window.onload).'
        : 'Aplicação automática desativada.',
      'success'
    );
  });

  watchChangesToggle.addEventListener('change', () => {
    chrome.storage.local.set({ watchChanges: watchChangesToggle.checked });
    showToast(
      watchChangesToggle.checked
        ? 'MutationObserver ativado — DOM dinâmico monitorado.'
        : 'MutationObserver desativado.',
      'success'
    );
  });

  continuousModeToggle.addEventListener('change', () => {
    const enabled = continuousModeToggle.checked;
    chrome.storage.local.set({ continuousMode: enabled });
    pollingIntervalCard.style.display = enabled ? 'flex' : 'none';
    showToast(
      enabled
        ? '🔄 Polling contínuo ativado. Configure o intervalo abaixo.'
        : 'Polling contínuo desativado.',
      'success'
    );
  });

  pollingIntervalSlider.addEventListener('input', () => {
    pollingIntervalValue.textContent = pollingIntervalSlider.value + 'ms';
  });

  pollingIntervalSlider.addEventListener('change', () => {
    const val = parseInt(pollingIntervalSlider.value);
    chrome.storage.local.set({ pollingInterval: val });
    showToast(`Intervalo de polling definido para ${val}ms.`, 'info');
  });

  btnClearAll.addEventListener('click', () => {
    if (confirm('⚠️ Wipe completo: todas as regras, configurações e estatísticas serão apagadas permanentemente.\n\nEssa ação não pode ser desfeita. Deseja continuar?')) {
      chrome.storage.local.clear(() => {
        rules = [];
        renderRules();
        loadSettings();
        showToast('Todos os dados foram apagados.', 'success');
      });
    }
  });

  btnClearStats.addEventListener('click', () => {
    chrome.storage.local.set({ stats: {} }, () => {
      loadStats();
      showToast('Contadores de estatísticas zerados.', 'success');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // [11] BUTTON BINDINGS
  // ──────────────────────────────────────────────────────────────────────────
  btnAddRule.addEventListener('click', addRule);
  if (btnAddRuleEmpty) btnAddRuleEmpty.addEventListener('click', addRule);
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);
  btnSaveRule.addEventListener('click', saveCurrentRule);
  btnExport.addEventListener('click', exportRules);
  btnImport.addEventListener('click', () => fileImport.click());

  fileImport.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      importRules(e.target.files[0]);
      e.target.value = '';
    }
  });

  // Close modal on overlay click or Escape
  ruleModal.addEventListener('click', (e) => { if (e.target === ruleModal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !ruleModal.classList.contains('hidden')) closeModal();
    if (e.key === 'Enter' && e.ctrlKey && !ruleModal.classList.contains('hidden')) saveCurrentRule();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // [12] VIP ULTRA — PROXY MITM
  // ──────────────────────────────────────────────────────────────────────────
  const PROXY_API = 'http://localhost:8888';
  let ultraRules = [];
  let ultraWs = null;

  async function ultraApi(method, path, body) {
    try {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(`${PROXY_API}/api${path}`, opts);
      return await res.json();
    } catch { return null; }
  }

  async function ultraCheckStatus() {
    const statusEl  = document.getElementById('ultraStatus');
    const infoEl    = document.getElementById('ultraServerInfo');
    const info      = await ultraApi('GET', '/info');

    if (!info) {
      if (statusEl) statusEl.innerHTML = '🔴 Proxy Offline';
      if (infoEl) infoEl.textContent = 'Servidor não encontrado. Clique em "🚀 Iniciar Servidor" abaixo para copiar o comando de inicialização.';
      return false;
    }

    const ip = info.ips?.[0] || 'localhost';
    if (statusEl) statusEl.innerHTML = '🟢 Proxy Ativo';
    if (infoEl)   infoEl.textContent = `Conectado e interceptando tráfego via ${ip}:${info.proxyPort}`;

    const proxyAddr  = document.getElementById('ultraProxyAddr');
    const dashAddr   = document.getElementById('ultraDashAddr');
    const rulesCount = document.getElementById('ultraRulesCount');
    const setupIp    = document.getElementById('ultraSetupIp');

    if (proxyAddr)  proxyAddr.textContent  = `${ip}:${info.proxyPort}`;
    if (dashAddr)   dashAddr.textContent   = `${ip}:${info.dashboardPort}`;
    if (rulesCount) rulesCount.textContent = `${info.activeRules}/${info.rulesCount}`;
    if (setupIp)    setupIp.textContent    = ip;

    return true;
  }

  async function ultraLoadRules() {
    ultraRules = (await ultraApi('GET', '/rules')) || [];
    ultraRenderRules();
  }

  function ultraRenderRules() {
    const list = document.getElementById('ultraRulesList');
    if (!list) return;

    if (ultraRules.length === 0) {
      list.innerHTML = '<div class="empty-state" style="padding:24px"><p>Nenhuma regra de proxy. Clique em <strong>+ Nova Regra Proxy</strong> acima.</p></div>';
      return;
    }

    list.innerHTML = ultraRules.map(rule => `
      <div class="rule-card ${rule.enabled ? '' : 'disabled'}">
        <div class="rule-toggle">
          <label class="switch">
            <input type="checkbox" class="ultra-rule-toggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="rule-info">
          <div class="rule-name">${escapeHtml(rule.name)}</div>
          <div class="rule-details">
            <span class="rule-detail">
              <span class="label">Busca:</span>
              <span class="value">${escapeHtml(rule.find)}</span>
            </span>
            <span class="rule-detail">
              <span class="label">→</span>
              <span class="value">${escapeHtml(rule.replace || '(vazio)')}</span>
            </span>
            ${rule.urlFilter ? `<span class="rule-detail"><span class="label">URL:</span><span class="value">${escapeHtml(rule.urlFilter)}</span></span>` : ''}
          </div>
        </div>
        <div class="rule-actions">
          <button class="btn-icon btn-delete-ultra-rule" data-id="${rule.id}" title="Excluir regra do proxy">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  // Event delegation for ultra rules list
  const ultraRulesList = document.getElementById('ultraRulesList');
  if (ultraRulesList) {
    ultraRulesList.addEventListener('change', (e) => {
      if (e.target.classList.contains('ultra-rule-toggle'))
        ultraToggleRule(e.target.dataset.id, e.target.checked);
    });
    ultraRulesList.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete-ultra-rule');
      if (btn) ultraDeleteRule(btn.dataset.id);
    });
  }

  // Ultra add rule button
  const btnUltraAddRule = document.getElementById('btnUltraAddRule');
  if (btnUltraAddRule) {
    btnUltraAddRule.addEventListener('click', async () => {
      const find = prompt('Texto ou Regex para buscar na resposta:');
      if (!find) return;
      const replace = prompt('Substituir por (deixe vazio para remover):', '');
      if (replace === null) return;
      const name      = prompt('Nome descritivo da regra:', 'Regra Proxy') || 'Regra Proxy';
      const urlFilter = prompt('Filtro de URL (opcional — deixe vazio para todos os domínios):', '') || '';

      const result = await ultraApi('POST', '/rules', { name, find, replace, urlFilter, enabled: true });
      if (result) {
        ultraLoadRules();
        ultraCheckStatus();
        showToast('✓ Regra do proxy criada!', 'success');
      } else {
        showToast('Erro ao criar regra. O servidor proxy está online?', 'error');
      }
    });
  }

  // Copy start server command
  const btnStartServer = document.getElementById('btnStartServer');
  if (btnStartServer) {
    btnStartServer.addEventListener('click', () => {
      const cmd = 'cd proxy-server && npm start';
      navigator.clipboard.writeText(cmd)
        .then(() => showToast('✓ Comando copiado! Cole no terminal e execute.', 'success'))
        .catch(() => prompt('Execute este comando no terminal:', cmd));
    });
  }

  async function ultraToggleRule(id, enabled) {
    await ultraApi('PUT', `/rules/${id}`, { enabled });
    ultraLoadRules();
  }

  async function ultraDeleteRule(id) {
    if (!confirm('Excluir esta regra do proxy permanentemente?')) return;
    await ultraApi('DELETE', `/rules/${id}`);
    ultraLoadRules();
    ultraCheckStatus();
    showToast('Regra do proxy excluída.', 'info');
  }

  // WebSocket live log
  function ultraConnectWs() {
    try {
      ultraWs = new WebSocket(`ws://localhost:8888`);

      ultraWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'request') ultraAddLogEntry(data);
        } catch {}
      };

      ultraWs.onclose = () => { setTimeout(ultraConnectWs, 3000); };
      ultraWs.onerror = () => { if (ultraWs) ultraWs.close(); };
    } catch {}
  }

  function ultraAddLogEntry(entry) {
    const log = document.getElementById('ultraLog');
    if (!log) return;

    if (log.textContent.startsWith('Aguardando')) log.textContent = '';

    const time  = new Date(entry.timestamp).toLocaleTimeString();
    const color = entry.modified ? '#f59e0b' : '#374151';
    const badge = entry.modified ? `✓ ${entry.matchCount} mod` : 'pass';

    const line = document.createElement('div');
    line.style.cssText = `padding:2px 0; color:${color};`;
    line.textContent = `${time}  ${entry.method}  ${entry.status}  [${badge}]  ${entry.url}`;
    log.appendChild(line);

    while (log.children.length > 100) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  // Proxy toggle (chrome.proxy API)
  const ultraProxyToggle = document.getElementById('ultraProxyToggle');
  const ultraProxyLabel  = document.getElementById('ultraProxyLabel');

  if (ultraProxyToggle) {
    ultraProxyToggle.addEventListener('change', () => {
      const activate = ultraProxyToggle.checked;
      const action   = activate ? 'activateProxy' : 'deactivateProxy';

      chrome.runtime.sendMessage({ action }, (res) => {
        if (res?.success) {
          if (activate) {
            ultraProxyLabel.textContent = '🟢 Proxy Ativado no Chrome';
            ultraProxyLabel.style.color = '#10b981';
            showToast('Proxy ativado — todo tráfego passa por localhost:8080', 'success');
          } else {
            ultraProxyLabel.textContent = 'Proxy Desativado';
            ultraProxyLabel.style.color = '';
            showToast('Proxy desativado — conexão direta restaurada', 'info');
          }
        }
      });
    });
  }

  function ultraCheckProxyActive() {
    chrome.runtime.sendMessage({ action: 'getProxyStatus' }, (res) => {
      if (res?.active && ultraProxyToggle) {
        ultraProxyToggle.checked = true;
        if (ultraProxyLabel) {
          ultraProxyLabel.textContent = '🟢 Proxy Ativado no Chrome';
          ultraProxyLabel.style.color = '#10b981';
        }
      }
    });
  }

  async function ultraInit() {
    ultraCheckProxyActive();
    const online = await ultraCheckStatus();
    if (online) {
      ultraLoadRules();
      ultraConnectWs();
      if (btnStartServer) btnStartServer.style.display = 'none';
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // [13] UTILITÁRIOS
  // ──────────────────────────────────────────────────────────────────────────
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 280);
    }, 2600);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // [14] INIT
  // ──────────────────────────────────────────────────────────────────────────
  loadRules();
  loadSettings();
});
