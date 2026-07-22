/**
 * ============================================================================
 * TEXT MANIPULATOR — CONTENT SCRIPT (ISOLATED WORLD)
 * ============================================================================
 * @file content.js
 * @description Injetado em todas as guias válidas na fase "document_start".
 * Roda num ambiente isolado (Isolated World). É o responsável por vasculhar
 * a DOM Tree (Módulo 1) e também por criar uma ponte de comunicação com o
 * Interceptor.js que roda na Main World (Módulo 2).
 * ============================================================================
 */
(() => {
  let activeObserver = null;
  let activeRules = [];
  let pollingInterval = null;
  let isProcessing = false;

  // Wait for DOM to be ready
  function onDomReady(callback) {
    if (document.body) {
      callback();
    } else {
      const observer = new MutationObserver(() => {
        if (document.body) {
          observer.disconnect();
          callback();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
  }

  /**
   * --------------------------------------------------------------------------
   * [1] MÚCLEO DE MANIPULAÇÃO DO DOM (DOM TEXT REPLACEMENT)
   * --------------------------------------------------------------------------
   * Utiliza um TreeWalker nativo do navegador para percorrer apenas os TextNodes
   * da página de forma performática, ignorando SCRIPTs, STYLEs e inputs.
   */
  function replaceTextInNode(node, rules) {
    if (!node) return 0;
    let totalReplacements = 0;

    const walker = document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (n) => {
          const parent = n.parentNode;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let current;
    while ((current = walker.nextNode())) {
      textNodes.push(current);
    }

    for (const textNode of textNodes) {
      let text = textNode.textContent;
      let changed = false;

      for (const rule of rules) {
        if (!rule.find || rule.find === '') continue;

        let pattern;
        const flags = rule.caseSensitive ? 'g' : 'gi';

        if (rule.useRegex) {
          try {
            pattern = new RegExp(rule.find, flags);
          } catch (e) {
            continue;
          }
        } else {
          pattern = new RegExp(escapeRegex(rule.find), flags);
        }

        const matches = text.match(pattern);
        if (matches) {
          totalReplacements += matches.length;
          text = text.replace(pattern, rule.replace != null ? rule.replace : '');
          changed = true;
        }
      }

      if (changed) {
        isProcessing = true;
        textNode.textContent = text;
        isProcessing = false;
      }
    }

    return totalReplacements;
  }

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * --------------------------------------------------------------------------
   * [1.5] SUBSTITUIÇÃO AGRESSIVA EM ELEMENTOS DE DADOS
   * --------------------------------------------------------------------------
   * Passagem complementar que opera no nível de elemento (não text node).
   * Foca em <td>, <span>, <div> com data-label, data-bind, etc.
   * Mais resiliente a re-renders de frameworks (React/Vue/VTEX).
   */
  function replaceInDataElements(rules) {
    if (!document.body || rules.length === 0) return 0;
    let totalReplacements = 0;

    // Seletores de elementos de dados comuns em e-commerces
    const selectors = [
      'td[data-label]',
      'td[data-title]',
      'td[data-bind]',
      'span[data-bind]',
      'div[data-bind]',
      'td.monetary',
      'td.price',
      'span.price',
      '.cart-items td',
      'table td'
    ];

    const elements = document.querySelectorAll(selectors.join(','));

    for (const el of elements) {
      let text = el.textContent;
      let changed = false;

      for (const rule of rules) {
        if (!rule.find || rule.find === '') continue;

        let pattern;
        const flags = rule.caseSensitive ? 'g' : 'gi';

        if (rule.useRegex) {
          try { pattern = new RegExp(rule.find, flags); } catch (e) { continue; }
        } else {
          pattern = new RegExp(escapeRegex(rule.find), flags);
        }

        const matches = text.match(pattern);
        if (matches) {
          totalReplacements += matches.length;
          text = text.replace(pattern, rule.replace != null ? rule.replace : '');
          changed = true;
        }
      }

      if (changed) {
        isProcessing = true;
        // Se o elemento só tem um text node, altera direto no nodeValue
        if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
          el.childNodes[0].nodeValue = text;
        } else if (el.childNodes.length === 0) {
          el.textContent = text;
        } else {
          // Elemento complexo: percorre text nodes internos
          const innerWalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = innerWalker.nextNode())) {
            let nodeText = n.nodeValue;
            for (const rule of rules) {
              if (!rule.find || rule.find === '') continue;
              let p;
              const f = rule.caseSensitive ? 'g' : 'gi';
              if (rule.useRegex) {
                try { p = new RegExp(rule.find, f); } catch { continue; }
              } else {
                p = new RegExp(escapeRegex(rule.find), f);
              }
              nodeText = nodeText.replace(p, rule.replace != null ? rule.replace : '');
            }
            n.nodeValue = nodeText;
          }
        }
        isProcessing = false;
      }
    }

    return totalReplacements;
  }

  /**
   * --------------------------------------------------------------------------
   * [2] POLLING CONTÍNUO (FALLBACK PARA CONTEÚDO DINÂMICO)
   * --------------------------------------------------------------------------
   * Caso o usuário ative o continuousMode, dispara reavaliações do DOM
   * baseadas em setTimeout para escapar das falhas do MutationObserver.
   */
  function startPolling(rules, intervalMs = 500) {
    stopPolling();
    pollingInterval = setInterval(() => {
      if (activeRules.length > 0 && document.body) {
        replaceTextInNode(document.body, activeRules);
        replaceInDataElements(activeRules);
      }
    }, intervalMs);
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  /**
   * --------------------------------------------------------------------------
   * [3] PONTE DE COMUNICAÇÃO (ISOLATED <-> MAIN WORLD)
   * --------------------------------------------------------------------------
   * Transfere as regras ativadas no Painel para o `interceptor.js` (XHR Hooker)
   * utilizando postMessage e a variável mágica localStorage `__tm_vip_rules`.
   */
  function sendRulesToInterceptor(rules, active) {
    // Enviar TODAS as regras habilitadas para o interceptor (não só as VIP)
    const enabledRules = rules.filter(r => r.enabled);

    // Write to localStorage for SYNCHRONOUS access on next page load
    // This is the key — the interceptor reads this at document_start
    try {
      if (active && enabledRules.length > 0) {
        localStorage.setItem('__tm_vip_rules', JSON.stringify({
          active: true,
          rules: enabledRules
        }));
      } else {
        localStorage.removeItem('__tm_vip_rules');
      }
    } catch (e) {}

    // Also send via postMessage for immediate effect on current page
    window.postMessage({
      type: '__TM_VIP__',
      action: 'setRules',
      rules: enabledRules,
      active: active
    }, '*');
  }

  // Load and send VIP rules on startup
  function initVipInterceptor() {
    chrome.storage.local.get(['rules', 'vipActive'], (data) => {
      const rules = data.rules || [];
      const active = !!data.vipActive;

      // Always sync to localStorage (seed for this domain)
      const enabledRules = rules.filter(r => r.enabled);
      try {
        if (active && enabledRules.length > 0) {
          localStorage.setItem('__tm_vip_rules', JSON.stringify({
            active: true,
            rules: enabledRules
          }));
        } else {
          localStorage.removeItem('__tm_vip_rules');
        }
      } catch (e) {}

      // Send to interceptor for current session
      if (active && enabledRules.length > 0) {
        sendRulesToInterceptor(rules, true);
      }
    });
  }

  /**
   * --------------------------------------------------------------------------
   * [4] ORQUESTRADOR PRINCIPAL (APPLY RULES CHOREOGRAPHY)
   * --------------------------------------------------------------------------
   * Recebe as regras, aplica imediatamente no target node (body), agenda
   * chamadas subsequentes (burst timer) para burlar renders React/Vue assíncronos,
   * e assina um MutationObserver.
   */
  function applyRules(rules, observe = true) {
    activeRules = rules;

    onDomReady(() => {
      const count = replaceTextInNode(document.body, rules);
      // Passada extra focada em elementos de dados (<td>, etc.)
      const dataCount = replaceInDataElements(rules);

      // Report stats (total count attributed to first rule with id)
      const totalCount = count + dataCount;
      if (totalCount > 0) {
        const firstRule = rules.find(r => r.id);
        if (firstRule) {
          chrome.runtime.sendMessage({
            action: 'updateStats',
            ruleId: firstRule.id,
            count: totalCount
          }).catch(() => {});
        }
      }

      // Burst re-applications for sites that render data after async loads
      // Re-scan at 200ms, 500ms, 1s, 2s, 3s, 4s, 5s to catch late content
      const burstDelays = [200, 500, 1000, 2000, 3000, 4000, 5000];
      for (const delay of burstDelays) {
        setTimeout(() => {
          if (activeRules.length > 0 && document.body) {
            replaceTextInNode(document.body, activeRules);
            replaceInDataElements(activeRules);
          }
        }, delay);
      }

      // Start MutationObserver for dynamic content
      if (observe && !activeObserver) {
        let mutationTimer = null;

        activeObserver = new MutationObserver((mutations) => {
          if (isProcessing) return;

          // Debounce: batch rapid mutations into a single re-scan
          if (mutationTimer) clearTimeout(mutationTimer);
          mutationTimer = setTimeout(() => {
            if (activeRules.length > 0 && document.body) {
              replaceTextInNode(document.body, activeRules);
              replaceInDataElements(activeRules);
            }
          }, 30);
        });

        activeObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }

      // Continuous polling mode
      chrome.storage.local.get(['continuousMode', 'pollingInterval'], (data) => {
        if (data.continuousMode && rules.length > 0) {
          startPolling(rules, data.pollingInterval || 500);
        }
      });
    });

    // Also send VIP rules to interceptor
    chrome.storage.local.get(['vipActive'], (data) => {
      if (data.vipActive) {
        sendRulesToInterceptor(rules, true);
      }
    });
  }

  // Quick single replacement (from popup)
  function quickReplace(find, replace, options = {}) {
    if (!document.body || !find) return 0;
    const flags = options.caseSensitive ? 'g' : 'gi';
    let pattern;
    if (options.useRegex) {
      try { pattern = new RegExp(find, flags); } catch { return 0; }
    } else {
      pattern = new RegExp(escapeRegex(find), flags);
    }

    // If replaceAll is explicitly false, only replace first occurrence
    if (options.replaceAll === false) {
      const singlePattern = options.useRegex
        ? new RegExp(find, options.caseSensitive ? '' : 'i')
        : new RegExp(escapeRegex(find), options.caseSensitive ? '' : 'i');
      const rule = { find, replace, useRegex: options.useRegex, caseSensitive: options.caseSensitive };
      // Use TreeWalker but stop after first match
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (n) => {
            const parent = n.parentNode;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName;
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(tag)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      let node;
      while ((node = walker.nextNode())) {
        if (singlePattern.test(node.textContent)) {
          node.textContent = node.textContent.replace(singlePattern, replace != null ? replace : '');
          return 1;
        }
      }
      return 0;
    }

    // Default: replace all via existing engine
    const rule = {
      find,
      replace,
      useRegex: options.useRegex || false,
      caseSensitive: options.caseSensitive || false
    };
    return replaceTextInNode(document.body, [rule]);
  }

  /**
   * --------------------------------------------------------------------------
   * [5] LISTENERS DO SERVICE WORKER (IPC COMMUNICATION)
   * --------------------------------------------------------------------------
   * Aguarda comandos do background.js para iniciar mutações.
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'applyRules') {
      applyRules(message.rules);
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'countMatches') {
      const count = (function() {
        if (!document.body || !message.find) return 0;
        const flags = message.options?.caseSensitive ? 'g' : 'gi';
        let pattern;
        if (message.options?.useRegex) {
          try { pattern = new RegExp(message.find, flags); } catch { return 0; }
        } else {
          pattern = new RegExp(escapeRegex(message.find), flags);
        }
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (n) => {
              const parent = n.parentNode;
              if (!parent) return NodeFilter.FILTER_REJECT;
              const tag = parent.tagName;
              if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(tag)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        let total = 0, node;
        while ((node = walker.nextNode())) {
          const matches = node.textContent.match(pattern);
          if (matches) total += matches.length;
        }
        return total;
      })();
      sendResponse({ count });
      return true;
    }

    if (message.action === 'quickReplace') {
      const count = quickReplace(message.find, message.replace, message.options);
      sendResponse({ success: true, replacements: count });
      return true;
    }

    if (message.action === 'startPolling') {
      startPolling(activeRules, message.interval || 500);
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'stopPolling') {
      stopPolling();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'updateVipRules') {
      sendRulesToInterceptor(message.rules || [], message.active || false);
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'stopObserver') {
      if (activeObserver) {
        activeObserver.disconnect();
        activeObserver = null;
      }
      stopPolling();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'ping') {
      sendResponse({ alive: true });
      return true;
    }
  });

  // ─── Init: Send VIP rules immediately (interceptor is already loaded in MAIN world) ───
  initVipInterceptor();

  // ─── Init: Auto-apply rules on page load (self-contained per frame) ───
  // Each frame (including iframes) reads autoApply + rules from storage
  // and applies them independently, without waiting for background message.
  chrome.storage.local.get(['autoApply', 'rules', 'vipActive'], (data) => {
    if (!data.autoApply) return;
    const pageUrl = location.href;
    const rules = (data.rules || []).filter(r => {
      if (!r.enabled) return false;
      if (!r.urlFilter || r.urlFilter.trim() === '') return true;
      try {
        return new RegExp(r.urlFilter).test(pageUrl);
      } catch {
        return pageUrl.includes(r.urlFilter);
      }
    });
    if (rules.length > 0) {
      applyRules(rules);
    }
  });
})();
