/**
 * ============================================================================
 * TEXT MANIPULATOR — BACKGROUND SERVICE WORKER
 * ============================================================================
 * @file background.js
 * @description O Service Worker atua como o "cérebro" invisível da extensão.
 * Permanece ativo em background lidando com permissões sistêmicas (Proxy API),
 * persistência de dados (Storage) e comunicação assíncrona com os injetores
 * de código nas páginas (Content Scripts).
 * ============================================================================
 */
/**
 * --------------------------------------------------------------------------
 * [1] ROTEADOR DE MENSAGENS E CRUD STORAGE
 * --------------------------------------------------------------------------
 * Escuta requisições disparadas pelo Painel UI ou pelos injetores.
 * Gerencia o banco de dados interno da extensão `chrome.storage.local`.
 */
const PROXY_CONFIG = {
  mode: 'fixed_servers',
  rules: {
    singleProxy: {
      scheme: 'http',
      host: 'localhost',
      port: 8080
    },
    bypassList: ['localhost', '127.0.0.1', '<local>']
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openPanel') {
        chrome.tabs.create({ url: chrome.runtime.getURL('panel.html') });
        sendResponse({ success: true });
        return true;
    }

    if (message.action === 'applyRulesToTab') {
        const tabId = message.tabId;
        chrome.storage.local.get(['rules'], (data) => {
            const rules = (data.rules || []).filter(r => r.enabled);
            if (rules.length > 0) {
                chrome.tabs.sendMessage(tabId, {
                    action: 'applyRules',
                    rules: rules
                }).catch(() => { });
            }
        });
        sendResponse({ success: true });
        return true;
    }

    if (message.action === 'getRules') {
        chrome.storage.local.get(['rules'], (data) => {
            sendResponse({ rules: data.rules || [] });
        });
        return true;
    }

    if (message.action === 'saveRules') {
        chrome.storage.local.set({ rules: message.rules }, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (message.action === 'getStats') {
        chrome.storage.local.get(['stats'], (data) => {
            sendResponse({ stats: data.stats || {} });
        });
        return true;
    }

    if (message.action === 'updateStats') {
        chrome.storage.local.get(['stats'], (data) => {
            const stats = data.stats || {};
            const ruleId = message.ruleId;
            const count = message.count || 0;
            stats[ruleId] = (stats[ruleId] || 0) + count;
            chrome.storage.local.set({ stats }, () => {
                sendResponse({ success: true });
            });
        });
        return true;
    }

    /**
     * ----------------------------------------------------------------------
     * [2] GERENCIAMENTO DE ESTADO VIP (CLIENT-SIDE HOOK)
     * ----------------------------------------------------------------------
     * Sincroniza abas abertas sobre ativação do XHR Hooker.
     */
    if (message.action === 'getVipStatus') {
        chrome.storage.local.get(['vipActive'], (data) => {
            sendResponse({ vipActive: !!data.vipActive });
        });
        return true;
    }

    if (message.action === 'setVipStatus') {
        chrome.storage.local.set({ vipActive: message.vipActive }, () => {
            // Notify all tabs to update VIP interceptor rules
            chrome.storage.local.get(['rules'], (data) => {
                const allRules = data.rules || [];
                chrome.tabs.query({}, (tabs) => {
                    for (const tab of tabs) {
                        if (tab.url && !tab.url.startsWith('chrome')) {
                            chrome.tabs.sendMessage(tab.id, {
                                action: 'updateVipRules',
                                rules: allRules,
                                active: message.vipActive
                            }).catch(() => {});
                        }
                    }
                });
            });
            sendResponse({ success: true });
        });
        return true;
    }

    /**
     * ----------------------------------------------------------------------
     * [3] CONFIGURAÇÕES DE COMPORTAMENTO
     * ----------------------------------------------------------------------
     */
    if (message.action === 'getSettings') {
        chrome.storage.local.get(['autoApply', 'watchChanges', 'continuousMode', 'pollingInterval', 'vipActive'], (data) => {
            sendResponse({
                autoApply: !!data.autoApply,
                watchChanges: data.watchChanges !== false,
                continuousMode: !!data.continuousMode,
                pollingInterval: data.pollingInterval || 500,
                vipActive: !!data.vipActive
            });
        });
        return true;
    }

    /**
     * ----------------------------------------------------------------------
     * [5] VIP ULTRA — GERENCIADOR DO PROXY SYSTEM (NETWORK LEVEL)
     * ----------------------------------------------------------------------
     * Exige a permissão "proxy" no Manifest V3. 
     * Redireciona todo o tráfego HTTP/HTTPS do navegador Desktop
     * através do porto local que está rodando o script Node.js (8080).
     */
    if (message.action === 'activateProxy') {
        chrome.proxy.settings.set(
            { value: PROXY_CONFIG, scope: 'regular' },
            () => {
                chrome.storage.local.set({ proxyActive: true });
                sendResponse({ success: true });
            }
        );
        return true;
    }

    if (message.action === 'deactivateProxy') {
        chrome.proxy.settings.clear(
            { scope: 'regular' },
            () => {
                chrome.storage.local.set({ proxyActive: false });
                sendResponse({ success: true });
            }
        );
        return true;
    }

    if (message.action === 'getProxyStatus') {
        chrome.proxy.settings.get({ incognito: false }, (config) => {
            const isActive = config.value && config.value.mode === 'fixed_servers';
            sendResponse({ active: isActive });
        });
        return true;
    }
});

/**
 * --------------------------------------------------------------------------
 * [4] OBSERVAÇÃO DE NAVEGAÇÃO / INJEÇÃO ATIVA
 * --------------------------------------------------------------------------
 * Dispara automaticamente a injeção das métricas VIP e Regras do DOM
 * assim que o Status da Aba transita para "complete" (onload).
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome')) {
        chrome.storage.local.get(['rules', 'autoApply', 'vipActive'], (data) => {
            if (!data.autoApply) return;
            const rules = (data.rules || []).filter(r => {
                if (!r.enabled) return false;
                if (!r.urlFilter || r.urlFilter.trim() === '') return true;
                try {
                    return new RegExp(r.urlFilter).test(tab.url);
                } catch {
                    return tab.url.includes(r.urlFilter);
                }
            });
            if (rules.length > 0) {
                chrome.tabs.sendMessage(tabId, {
                    action: 'applyRules',
                    rules: rules
                }).catch(() => { });
            }

            // Send VIP rules to interceptor if active
            if (data.vipActive) {
                chrome.tabs.sendMessage(tabId, {
                    action: 'updateVipRules',
                    rules: data.rules || [],
                    active: true
                }).catch(() => {});
            }
        });
    }
});
