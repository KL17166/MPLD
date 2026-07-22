/**
 * ============================================================================
 * TEXT MANIPULATOR — VIP REQUEST INTERCEPTOR (MAIN WORLD)
 * ============================================================================
 * @file interceptor.js
 * @description Injetado dinamicamente via script tag no CONTEXTO PRINCIPAL
 * da página. É o único meio de interceptar variáveis globais de rede nativas.
 * ============================================================================
 */
(() => {
  'use strict';

  // ─── State ───
  let vipRules = [];
  let vipActive = false;

  /**
   * --------------------------------------------------------------------------
   * [1] INICIALIZAÇÃO SÍNCRONA (AHEAD-OF-TIME BOOT)
   * --------------------------------------------------------------------------
   * Extrair regras salvas no disco (localStorage) pelo `content.js` na sessão
   * anterior. Devido à sua sincronicidade, regras já são aplicadas no 1º request
   * e antes mesmo dos frameworks Frontend (React/Angular) inicializarem.
   */

  try {
    const stored = localStorage.getItem('__tm_vip_rules');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.active && Array.isArray(parsed.rules)) {
        vipRules = parsed.rules;
        vipActive = true;
      }
    }
  } catch (e) {
    // localStorage might be blocked on some sites — that's ok
  }

  // ─── Utility ───
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function applyRules(text) {
    if (!text || typeof text !== 'string' || vipRules.length === 0 || !vipActive) return text;

    let result = text;
    let totalMatches = 0;

    for (const rule of vipRules) {
      if (!rule.find || rule.find === '') continue;
      if (!rule.enabled) continue;

      const flags = rule.caseSensitive ? 'g' : 'gi';
      let pattern;

      if (rule.useRegex) {
        try {
          pattern = new RegExp(rule.find, flags);
        } catch (e) {
          continue;
        }
      } else {
        pattern = new RegExp(escapeRegex(rule.find), flags);
      }

      const matches = result.match(pattern);
      if (matches) {
        totalMatches += matches.length;
        result = result.replace(pattern, rule.replace != null ? rule.replace : '');
      }
    }

    if (totalMatches > 0) {
      console.log(
        `%c👑 VIP%c interceptou ${totalMatches} valor(es)`,
        'background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
        'color: #f59e0b;'
      );
    }

    return result;
  }

  /**
   * --------------------------------------------------------------------------
   * [2] MONKEY-PATCH: JSON.PARSE
   * --------------------------------------------------------------------------
   * Interceptador de altíssima performance para interceptar payloads JSON puros.
   * Modificamos a string ANTES de o JS criar o Objeto.
   */

  const origJSONParse = JSON.parse;

  JSON.parse = function(text, reviver) {
    if (vipActive && vipRules.length > 0 && typeof text === 'string') {
      const modified = applyRules(text);
      return origJSONParse.call(this, modified, reviver);
    }
    return origJSONParse.call(this, text, reviver);
  };

  /**
   * --------------------------------------------------------------------------
   * [3] MONKEY-PATCH: XMLHTTPREQUEST (XHR/AJAX)
   * --------------------------------------------------------------------------
   * Intercepta bibliotecas pesadas de legado e abstrações complexas como Axios,
   * que disparam eventos sobre a propriedade `responseText` de `XMLHttpRequest`.
   */

  const XHR = XMLHttpRequest.prototype;
  const origResponseTextDesc = Object.getOwnPropertyDescriptor(XHR, 'responseText');
  const origResponseDesc = Object.getOwnPropertyDescriptor(XHR, 'response');

  const xhrCache = new WeakMap();

  function getModifiedXhr(xhr) {
    if (!vipActive || vipRules.length === 0 || xhr.readyState !== 4) return null;

    let cached = xhrCache.get(xhr);
    if (cached) return cached;

    const rt = xhr.responseType;

    if (!rt || rt === '' || rt === 'text') {
      try {
        const original = origResponseTextDesc.get.call(xhr);
        if (original && typeof original === 'string') {
          const modified = applyRules(original);
          if (modified !== original) {
            cached = { text: modified, type: 'text' };
            xhrCache.set(xhr, cached);
            return cached;
          }
        }
      } catch (e) {}
    }

    return null;
  }

  if (origResponseTextDesc && origResponseTextDesc.get) {
    Object.defineProperty(XHR, 'responseText', {
      get: function() {
        const cached = getModifiedXhr(this);
        if (cached && cached.type === 'text') return cached.text;
        return origResponseTextDesc.get.call(this);
      },
      configurable: true,
      enumerable: true
    });
  }

  if (origResponseDesc && origResponseDesc.get) {
    Object.defineProperty(XHR, 'response', {
      get: function() {
        const cached = getModifiedXhr(this);
        if (cached && cached.type === 'text') return cached.text;
        // For JSON responseType, the JSON.parse override already handles it
        return origResponseDesc.get.call(this);
      },
      configurable: true,
      enumerable: true
    });
  }

  /**
   * --------------------------------------------------------------------------
   * [4] MONKEY-PATCH: FETCH API NATIVA
   * --------------------------------------------------------------------------
   * Moderno método de requisição nativo. Clona o ReadableStream original
   * e reconstrói um objeto de Response substituto engolindo as mutações.
   */

  const origFetch = window.fetch;

  window.fetch = function(...args) {
    const result = origFetch.apply(this, args);

    if (!vipActive || vipRules.length === 0) return result;

    return result.then(async response => {
      if (!vipActive || vipRules.length === 0) return response;

      const ct = response.headers.get('content-type') || '';
      const isText = ct.includes('text') || ct.includes('json') ||
                     ct.includes('javascript') || ct.includes('xml') ||
                     ct.includes('html') || ct.includes('form');

      if (!isText) return response;

      try {
        const originalBody = await response.clone().text();
        const modifiedBody = applyRules(originalBody);

        if (modifiedBody === originalBody) return response;

        const newResponse = new Response(modifiedBody, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });

        Object.defineProperties(newResponse, {
          url: { value: response.url },
          type: { value: response.type },
          ok: { value: response.ok },
          redirected: { value: response.redirected }
        });

        return newResponse;
      } catch (e) {
        return response;
      }
    }).catch(() => result);
  };

  /**
   * --------------------------------------------------------------------------
   * [5] COMUNICAÇÃO DE RUNTIME (IPC BRIDGE)
   * --------------------------------------------------------------------------
   * Escuta mensagens de postMessage provindas do `content.js` que atualizam as
   * interceptações sem a necessidade de F5 no painel.
   */

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== '__TM_VIP__') return;

    const msg = event.data;

    if (msg.action === 'setRules') {
      vipRules = msg.rules || [];
      vipActive = !!msg.active;

      // Also update localStorage for next page load
      try {
        if (vipActive && vipRules.length > 0) {
          localStorage.setItem('__tm_vip_rules', JSON.stringify({
            active: true,
            rules: vipRules
          }));
        } else {
          localStorage.removeItem('__tm_vip_rules');
        }
      } catch (e) {}

      // Clear XHR cache
      // (WeakMap auto-collects, but new requests will use new rules)

      if (vipActive && vipRules.length > 0) {
        console.log(
          `%c👑 VIP%c ${vipRules.length} regra(s) ativa(s)`,
          'background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
          'color: #f59e0b;'
        );
      }
    }
  });

  // ── Startup log ──
  if (vipActive && vipRules.length > 0) {
    console.log(
      `%c👑 VIP%c ${vipRules.length} regra(s) carregada(s) do cache (instant)`,
      'background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
      'color: #10b981;'
    );
  }

  window.__textManipulatorVIP = true;
})();
