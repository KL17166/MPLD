// Popup Script — Text Manipulator Extension (Enhanced)

document.addEventListener('DOMContentLoaded', () => {
    // ─── DOM refs ───
    const findInput         = document.getElementById('findInput');
    const replaceInput      = document.getElementById('replaceInput');
    const useRegex          = document.getElementById('useRegex');
    const caseSensitive     = document.getElementById('caseSensitive');
    const replaceAll        = document.getElementById('replaceAll');
    const btnReplace        = document.getElementById('btnReplace');
    const btnPanel          = document.getElementById('btnPanel');
    const btnPreview        = document.getElementById('btnPreview');
    const btnSaveRule       = document.getElementById('btnSaveRule');
    const btnUndo           = document.getElementById('btnUndo');
    const btnClearHistory   = document.getElementById('btnClearHistory');
    const statusBar         = document.getElementById('statusBar');
    const statusText        = document.getElementById('statusText');
    const vipBadge          = document.getElementById('vipBadge');
    const proxyBadge        = document.getElementById('proxyBadge');
    const pageHost          = document.getElementById('pageHost');
    const rulesCount        = document.getElementById('rulesCount');
    const totalReplacements = document.getElementById('totalReplacements');
    const matchBadge        = document.getElementById('matchBadge');
    const autoApplyQuick    = document.getElementById('autoApplyQuick');
    const vipQuickToggle    = document.getElementById('vipQuickToggle');
    const historySection    = document.getElementById('historySection');
    const historyList       = document.getElementById('historyList');
    const activeRulesSection = document.getElementById('activeRulesSection');
    const activeRulesList   = document.getElementById('activeRulesList');

    // ─── State ───
    const MAX_HISTORY = 5;
    let currentTabUrl = '';

    // ═══════════════════════════════════════════════════════════════
    // [1] INICIALIZAÇÃO
    // ═══════════════════════════════════════════════════════════════
    chrome.storage.local.get(['vipActive', 'autoApply', 'popupHistory', 'proxyActive'], (data) => {
        vipQuickToggle.checked = !!data.vipActive;
        autoApplyQuick.checked = !!data.autoApply;
        if (data.vipActive) vipBadge.classList.remove('hidden');
        if (data.proxyActive) proxyBadge.classList.remove('hidden');
        renderHistory(data.popupHistory || []);
    });

    // Proxy status
    chrome.runtime.sendMessage({ action: 'getProxyStatus' }, (res) => {
        if (res?.active) proxyBadge.classList.remove('hidden');
    });

    // Tab hostname
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        try {
            const url = new URL(tabs[0].url);
            pageHost.textContent = url.hostname || tabs[0].url;
            currentTabUrl = tabs[0].url;
        } catch {
            pageHost.textContent = 'página local';
        }
    });

    // Rule count + active rules list
    chrome.runtime.sendMessage({ action: 'getRules' }, (response) => {
        const rules = response?.rules || [];
        const enabled = rules.filter(r => r.enabled).length;
        rulesCount.textContent = `${enabled} regra${enabled !== 1 ? 's' : ''}`;
        renderActiveRules(rules);
    });

    // Stats
    chrome.storage.local.get(['stats'], (data) => {
        const stats = data.stats || {};
        const total = Object.values(stats).reduce((a, b) => a + b, 0);
        totalReplacements.textContent = `${total.toLocaleString()} subst.`;
    });

    // ═══════════════════════════════════════════════════════════════
    // [2] TOGGLE VIP RÁPIDO
    // ═══════════════════════════════════════════════════════════════
    vipQuickToggle.addEventListener('change', () => {
        const active = vipQuickToggle.checked;
        chrome.runtime.sendMessage({ action: 'setVipStatus', vipActive: active }, () => {
            if (active) {
                vipBadge.classList.remove('hidden');
                showStatus('👑 VIP ativado — XHR/Fetch interceptados', 'success');
            } else {
                vipBadge.classList.add('hidden');
                showStatus('VIP desativado', 'info');
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // [3] TOGGLE AUTO-APPLY
    // ═══════════════════════════════════════════════════════════════
    autoApplyQuick.addEventListener('change', () => {
        chrome.storage.local.set({ autoApply: autoApplyQuick.checked });
        showStatus(
            autoApplyQuick.checked
                ? '✓ Aplicação automática ativada'
                : 'Aplicação automática desativada',
            autoApplyQuick.checked ? 'success' : 'info'
        );
    });

    // ═══════════════════════════════════════════════════════════════
    // [4] PREVIEW (COUNT MATCHES)
    // ═══════════════════════════════════════════════════════════════
    btnPreview.addEventListener('click', async () => {
        const find = findInput.value.trim();
        if (!find) { showStatus('Digite o texto para buscar!', 'error'); return; }

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await ensureContentScript(tab.id);

            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'countMatches',
                find,
                options: { useRegex: useRegex.checked, caseSensitive: caseSensitive.checked }
            });

            const count = response?.count ?? 0;
            matchBadge.textContent = `${count} resultado${count !== 1 ? 's' : ''}`;
            matchBadge.classList.remove('hidden');
        } catch {
            showStatus('Erro ao acessar esta página.', 'error');
        }
    });

    findInput.addEventListener('input', () => matchBadge.classList.add('hidden'));

    // ═══════════════════════════════════════════════════════════════
    // [5] SUBSTITUIR (REPLACE + AUTO SAVE)
    // ═══════════════════════════════════════════════════════════════
    btnReplace.addEventListener('click', async () => {
        const find = findInput.value.trim();
        if (!find) { showStatus('Digite o texto para buscar!', 'error'); return; }

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) { showStatus('Nenhuma aba ativa encontrada.', 'error'); return; }

            await ensureContentScript(tab.id);

            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'quickReplace',
                find,
                replace: replaceInput.value,
                options: {
                    useRegex: useRegex.checked,
                    caseSensitive: caseSensitive.checked,
                    replaceAll: replaceAll.checked
                }
            });

            if (response?.success) {
                const count = response.replacements || 0;
                if (count > 0) {
                    matchBadge.classList.add('hidden');
                    saveHistory(find, replaceInput.value, count);
                    saveOrUpdateRule(find, replaceInput.value, {
                        useRegex: useRegex.checked,
                        caseSensitive: caseSensitive.checked
                    }, (msg) => showStatus(`✓ ${count} substituiç${count > 1 ? 'ões' : 'ão'} — ${msg}`));

                    // Update stats display
                    chrome.storage.local.get(['stats'], (data) => {
                        const stats = data.stats || {};
                        const total = Object.values(stats).reduce((a, b) => a + b, 0);
                        totalReplacements.textContent = `${(total + count).toLocaleString()} subst.`;
                    });
                } else {
                    showStatus('Nenhuma ocorrência encontrada.', 'error');
                }
            }
        } catch (err) {
            showStatus('Erro: Não foi possível acessar esta página.', 'error');
            console.error(err);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // [6] SALVAR REGRA MANUAL
    // ═══════════════════════════════════════════════════════════════
    btnSaveRule.addEventListener('click', () => {
        const find = findInput.value.trim();
        if (!find) { showStatus('Preencha o campo Buscar antes de salvar.', 'error'); return; }

        saveOrUpdateRule(find, replaceInput.value, {
            useRegex: useRegex.checked,
            caseSensitive: caseSensitive.checked
        }, (msg) => showStatus(`✓ ${msg}`, 'success'));
    });

    // ═══════════════════════════════════════════════════════════════
    // [7] DESFAZER (RECARREGA A ABA)
    // ═══════════════════════════════════════════════════════════════
    btnUndo.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                chrome.tabs.reload(tab.id);
                showStatus('↺ Página recarregada — substituições revertidas.', 'info');
            }
        } catch {
            showStatus('Erro ao recarregar a aba.', 'error');
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // [8] ABRIR PAINEL
    // ═══════════════════════════════════════════════════════════════
    btnPanel.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openPanel' });
        window.close();
    });

    // ═══════════════════════════════════════════════════════════════
    // [9] REGRAS ATIVAS DO SITE ATUAL
    // ═══════════════════════════════════════════════════════════════
    function renderActiveRules(rules) {
        const matching = rules.filter(r => {
            if (!r.enabled) return false;
            if (!r.urlFilter || r.urlFilter.trim() === '') return true;
            try {
                return new RegExp(r.urlFilter).test(currentTabUrl);
            } catch {
                return currentTabUrl.includes(r.urlFilter);
            }
        });

        if (matching.length === 0) {
            activeRulesSection.classList.add('hidden');
            return;
        }

        activeRulesSection.classList.remove('hidden');
        activeRulesList.innerHTML = '';

        matching.forEach(rule => {
            const el = document.createElement('div');
            el.className = 'active-rule-item';
            const isVip = !!rule.interceptRequests;
            el.innerHTML = `
                <input type="checkbox" class="active-rule-toggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
                <span class="active-rule-name" title="${escapeHtml(rule.name || rule.find)}">${escapeHtml(rule.name || rule.find)}</span>
                <span class="active-rule-find" title="${escapeHtml(rule.find)}">${escapeHtml(rule.find.substring(0, 20))}</span>
                ${isVip ? '<span class="active-rule-badge active-rule-badge-vip">👑</span>' : '<span class="active-rule-badge active-rule-badge-normal">DOM</span>'}
            `;
            activeRulesList.appendChild(el);
        });

        // Toggle rule from popup
        activeRulesList.querySelectorAll('.active-rule-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                chrome.runtime.sendMessage({ action: 'getRules' }, (res) => {
                    const allRules = res?.rules || [];
                    const rule = allRules.find(r => r.id === id);
                    if (rule) {
                        rule.enabled = e.target.checked;
                        chrome.runtime.sendMessage({ action: 'saveRules', rules: allRules }, () => {
                            const n = allRules.filter(r => r.enabled).length;
                            rulesCount.textContent = `${n} regra${n !== 1 ? 's' : ''}`;
                            showStatus(e.target.checked ? '✓ Regra ativada' : 'Regra desativada', 'info');
                        });
                    }
                });
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // [10] HISTÓRICO
    // ═══════════════════════════════════════════════════════════════
    function saveHistory(find, replace, count) {
        chrome.storage.local.get(['popupHistory'], (data) => {
            let history = data.popupHistory || [];
            history = history.filter(h => h.find !== find);
            history.unshift({ find, replace, count, ts: Date.now() });
            history = history.slice(0, MAX_HISTORY);
            chrome.storage.local.set({ popupHistory: history });
            renderHistory(history);
        });
    }

    function renderHistory(history) {
        if (!history || history.length === 0) {
            historySection.classList.add('hidden');
            return;
        }
        historySection.classList.remove('hidden');
        historyList.innerHTML = '';
        history.forEach(item => {
            const el = document.createElement('div');
            el.className = 'history-item';
            el.title = `Clique para reutilizar: "${item.find}" → "${item.replace}"`;
            el.innerHTML = `
                <span class="history-find">${escapeHtml(item.find)}</span>
                <span class="history-arrow">→</span>
                <span class="history-replace">${item.replace ? escapeHtml(item.replace) : '<em style="opacity:.4">removido</em>'}</span>
                <span class="history-count">×${item.count}</span>
            `;
            el.addEventListener('click', () => {
                findInput.value = item.find;
                replaceInput.value = item.replace;
                matchBadge.classList.add('hidden');
                findInput.focus();
            });
            historyList.appendChild(el);
        });
    }

    btnClearHistory.addEventListener('click', () => {
        chrome.storage.local.set({ popupHistory: [] });
        historySection.classList.add('hidden');

        chrome.runtime.sendMessage({ action: 'getRules' }, (res) => {
            const allRules = res?.rules || [];
            const filtered = allRules.filter(r => !r.name || !r.name.startsWith('Popup: '));
            chrome.runtime.sendMessage({ action: 'saveRules', rules: filtered }, () => {
                const n = filtered.filter(r => r.enabled).length;
                rulesCount.textContent = `${n} regra${n !== 1 ? 's' : ''}`;
                renderActiveRules(filtered);
                showStatus('✓ Histórico e regras do popup removidos.', 'success');
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // [11] HELPERS
    // ═══════════════════════════════════════════════════════════════

    // Deduplicated: save or update a rule by find value
    function saveOrUpdateRule(find, replace, options, onDone) {
        chrome.runtime.sendMessage({ action: 'getRules' }, (res) => {
            const rules = res?.rules || [];
            const existing = rules.find(r => r.find === find);

            if (existing) {
                existing.replace = replace;
                existing.useRegex = options.useRegex;
                existing.caseSensitive = options.caseSensitive;
                existing.enabled = true;
                chrome.runtime.sendMessage({ action: 'saveRules', rules }, () => {
                    const n = rules.filter(r => r.enabled).length;
                    rulesCount.textContent = `${n} regra${n !== 1 ? 's' : ''}`;
                    if (onDone) onDone('regra atualizada!');
                });
            } else {
                rules.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    name: `Popup: ${find.substring(0, 28)}`,
                    find,
                    replace,
                    urlFilter: '',
                    useRegex: options.useRegex || false,
                    caseSensitive: options.caseSensitive || false,
                    interceptRequests: false,
                    enabled: true
                });
                chrome.runtime.sendMessage({ action: 'saveRules', rules }, () => {
                    const n = rules.filter(r => r.enabled).length;
                    rulesCount.textContent = `${n} regra${n !== 1 ? 's' : ''}`;
                    if (onDone) onDone('regra salva!');
                });
            }
        });
    }

    async function ensureContentScript(tabId) {
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        } catch {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            });
        }
    }

    function showStatus(msg, type = 'success') {
        statusBar.className = `status-bar ${type}`;
        statusText.textContent = msg;
        statusBar.classList.remove('hidden');
        clearTimeout(showStatus._timer);
        showStatus._timer = setTimeout(() => statusBar.classList.add('hidden'), 3200);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Enter = replace
    [findInput, replaceInput].forEach(inp => {
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnReplace.click();
        });
    });

    findInput.focus();
});
