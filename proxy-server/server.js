/**
 * ============================================================================
 * VIP ULTRA — MITM PROXY SERVER & REST API
 * ============================================================================
 * @file server.js
 * @description O coração do VIP Ultra. Este servidor inicia um daemon local (8080)
 * que atua como proxy "Man-in-the-Middle". Ele gera um Certificado CA (Autoridade
 * Certificadora) local, grampeia requisições HTTPS decodificando-as em texto
 * simples, aplica expressões regulares para mutação, re-comprime (gzip/brotli)
 * e assina de volta para o cliente. Simultaneamente, expõe uma API REST (8888)
 * para integração com o Painel UI da Extensão.
 * ============================================================================
 */
const { Proxy: MitmProxy } = require('http-mitm-proxy');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const iconv = require('iconv-lite');
const selfsigned = require('selfsigned');

/**
 * --------------------------------------------------------------------------
 * [1] CONSTANTES E AMBIENTE (CONFIGURAÇÕES GLOBAIS)
 * --------------------------------------------------------------------------
 */
const PROXY_PORT = 8080;
const DASHBOARD_PORT = 8888;
const RULES_FILE = path.join(__dirname, 'rules.json');
const CERTS_DIR = path.join(__dirname, 'certs');
const CA_KEY_PATH = path.join(CERTS_DIR, 'keys', 'ca.private.key');
const CA_CERT_PATH = path.join(CERTS_DIR, 'certs', 'ca.pem');

const verbose = process.argv.includes('--verbose');

// ─── Rules ───
let rules = [];
function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      rules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[!] Erro ao carregar regras:', e.message);
    rules = [];
  }
}

function saveRules() {
  fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
}

loadRules();

/**
 * --------------------------------------------------------------------------
 * [2] GERADOR DE CERTIFICADOS (PKI BOOTSTRAPPING)
 * --------------------------------------------------------------------------
 * Garante que a máquina possua uma chave Privada (ca-key.pem) e um Certificado
 * Público (ca-cert.pem) instalados. Necessário para evitar o erro "Not Secure" (NET::ERR_CERT_AUTHORITY_INVALID).
 */
function ensureCerts() {
  const keysDir = path.join(CERTS_DIR, 'keys');
  const certsSubDir = path.join(CERTS_DIR, 'certs');
  if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });
  if (!fs.existsSync(certsSubDir)) fs.mkdirSync(certsSubDir, { recursive: true });

  if (fs.existsSync(CA_KEY_PATH) && fs.existsSync(CA_CERT_PATH)) {
    console.log('[✓] Certificado CA encontrado');
    return;
  }

  console.log('[*] Gerando certificado CA...');
  const attrs = [{ name: 'commonName', value: 'VIP Ultra Proxy CA' }];
  const pems = selfsigned.generate(attrs, {
    keySize: 2048,
    days: 3650,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true, critical: true },
      {
        name: 'keyUsage',
        keyCertSign: true,
        cRLSign: true,
        critical: true
      }
    ]
  });

  fs.writeFileSync(CA_KEY_PATH, pems.private);
  fs.writeFileSync(CA_CERT_PATH, pems.cert);
  console.log('[✓] Certificado CA gerado em', CERTS_DIR);
}

ensureCerts();

/**
 * --------------------------------------------------------------------------
 * [3] WEBSOCKET BROADCASTER (REAL-TIME LOGGING)
 * --------------------------------------------------------------------------
 * Mantém uma Pool de conexões (WSS) com a aba de "Estatísticas" do Painel,
 * transmitindo em Streaming cada Request modificado ou bypassado.
 */
const wsClients = new Set();

function broadcastLog(entry) {
  const msg = JSON.stringify(entry);
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

/**
 * --------------------------------------------------------------------------
 * [4] MOTOR DE REGRAS V2 (REGULAR EXPRESSION ENGINE)
 * --------------------------------------------------------------------------
 * Aplica o Find & Replace sobre o String Descomprimido do servidor-alvo.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extrai o charset do header Content-Type.
 * Ex: "text/html; charset=iso-8859-1" → "iso-8859-1"
 * Fallback: "utf-8"
 */
function getCharset(contentType) {
  const match = (contentType || '').match(/charset=([^\s;]+)/i);
  if (match) {
    const cs = match[1].trim().replace(/["']/g, '').toLowerCase();
    // Verificar se iconv-lite suporta esse charset
    if (iconv.encodingExists(cs)) return cs;
  }
  return 'utf-8';
}

function applyRules(text, url) {
  if (!text || typeof text !== 'string' || rules.length === 0) {
    return { text, modified: false, matchCount: 0 };
  }

  let result = text;
  let totalMatches = 0;

  for (const rule of rules) {
    if (!rule.find || !rule.enabled) continue;

    // URL filter
    if (rule.urlFilter) {
      try {
        if (!new RegExp(rule.urlFilter).test(url)) continue;
      } catch {
        if (!url.includes(rule.urlFilter)) continue;
      }
    }

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

  return { text: result, modified: totalMatches > 0, matchCount: totalMatches };
}

/**
 * --------------------------------------------------------------------------
 * [5] ALGORITMOS DE COMPRESSÃO (ZLIB ADAPTERS)
 * --------------------------------------------------------------------------
 * Funções promissificadas que enxugam o buffer nos formatos da Web:
 * gzip, deflate ou brotli (br).
 */
function decompress(buffer, encoding) {
  return new Promise((resolve, reject) => {
    if (encoding === 'gzip') {
      zlib.gunzip(buffer, (err, result) => err ? reject(err) : resolve(result));
    } else if (encoding === 'deflate') {
      zlib.inflate(buffer, (err, result) => err ? reject(err) : resolve(result));
    } else if (encoding === 'br') {
      zlib.brotliDecompress(buffer, (err, result) => err ? reject(err) : resolve(result));
    } else {
      resolve(buffer);
    }
  });
}

function compress(buffer, encoding) {
  return new Promise((resolve, reject) => {
    if (encoding === 'gzip') {
      zlib.gzip(buffer, (err, result) => err ? reject(err) : resolve(result));
    } else if (encoding === 'deflate') {
      zlib.deflate(buffer, (err, result) => err ? reject(err) : resolve(result));
    } else if (encoding === 'br') {
      zlib.brotliCompress(buffer, (err, result) => err ? reject(err) : resolve(result));
    } else {
      resolve(buffer);
    }
  });
}

/**
 * --------------------------------------------------------------------------
 * [6] MITM PROXY PIPELINE (HTTP-MITM-PROXY INITIALIZATION)
 * --------------------------------------------------------------------------
 * A Alma do Interceptador. Faz o "Handshake" com o Target, abrevia os Chunks
 * de Buffer da resposta, converte em Texto, Repassa pro Motor de Regras e Refaz o Res.
 */
const proxy = new MitmProxy();

proxy.onError(function(ctx, err, errorKind) {
  if (verbose) {
    console.error(`[!] ${errorKind}:`, err.message);
  }
});

proxy.onRequest(function(ctx, callback) {
  const fullUrl = `${ctx.isSSL ? 'https' : 'http'}://${ctx.clientToProxyRequest.headers.host}${ctx.clientToProxyRequest.url}`;

  if (verbose) {
    console.log(`[→] ${ctx.clientToProxyRequest.method} ${fullUrl}`);
  }

  // Collect response body chunks
  const chunks = [];

  ctx.onResponseData(function(ctx, chunk, callback) {
    chunks.push(chunk);
    return callback(null, null); // Don't send yet, we'll send after modification
  });

  ctx.onResponseEnd(function(ctx, callback) {
    const contentType = (ctx.serverToProxyResponse.headers['content-type'] || '').toLowerCase();
    const isTextContent = contentType.includes('text') || contentType.includes('json') ||
                          contentType.includes('javascript') || contentType.includes('xml') ||
                          contentType.includes('html') || contentType.includes('form');

    if (!isTextContent || chunks.length === 0 || rules.length === 0) {
      // Not text or no rules — pass through
      const body = Buffer.concat(chunks);
      ctx.proxyToClientResponse.write(body);

      broadcastLog({
        type: 'request',
        method: ctx.clientToProxyRequest.method,
        url: fullUrl,
        status: ctx.serverToProxyResponse.statusCode,
        contentType,
        modified: false,
        size: body.length,
        timestamp: Date.now()
      });

      return callback();
    }

    // Text content — decompress, apply rules, recompress
    const encoding = ctx.serverToProxyResponse.headers['content-encoding'];
    const body = Buffer.concat(chunks);

    (async () => {
      try {
        let decompressed;
        try {
          decompressed = await decompress(body, encoding);
        } catch (e) {
          // If decompression fails, try raw
          decompressed = body;
        }

        const charset = getCharset(contentType);
        const text = iconv.decode(decompressed, charset);
        const result = applyRules(text, fullUrl);

        if (result.modified) {
          let outputBuffer = iconv.encode(result.text, charset);

          // Recompress if needed
          if (encoding) {
            try {
              outputBuffer = await compress(outputBuffer, encoding);
            } catch (e) {
              // If compression fails, send uncompressed
              delete ctx.serverToProxyResponse.headers['content-encoding'];
            }
          }

          // Update content-length
          ctx.serverToProxyResponse.headers['content-length'] = outputBuffer.length;
          ctx.proxyToClientResponse.write(outputBuffer);

          console.log(`[👑] ${fullUrl} — ${result.matchCount} substituição(ões)`);

          broadcastLog({
            type: 'request',
            method: ctx.clientToProxyRequest.method,
            url: fullUrl,
            status: ctx.serverToProxyResponse.statusCode,
            contentType,
            modified: true,
            matchCount: result.matchCount,
            size: outputBuffer.length,
            timestamp: Date.now()
          });
        } else {
          ctx.proxyToClientResponse.write(body);

          broadcastLog({
            type: 'request',
            method: ctx.clientToProxyRequest.method,
            url: fullUrl,
            status: ctx.serverToProxyResponse.statusCode,
            contentType,
            modified: false,
            size: body.length,
            timestamp: Date.now()
          });
        }

        callback();
      } catch (e) {
        // On error, pass through original
        ctx.proxyToClientResponse.write(body);
        callback();
      }
    })();
  });

  return callback();
});

/**
 * --------------------------------------------------------------------------
 * [7] API SERVER (INTEGRAÇÃO EXTENSÃO <-> PROXY)
 * --------------------------------------------------------------------------
 * Utiliza o Express para abrir uma API REST. O arquivo `panel.js` no Google
 * Chrome consome essa API local em http://localhost:8888.
 */
const app = express();
app.use(express.json());

// CORS — allow extension panel to call API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Compatibility routes
app.get('/status', (req, res) => {
  res.redirect('/api/info');
});

app.get('/rules', (req, res) => {
  res.redirect('/api/rules');
});

// Download CA certificate
app.get('/cert', (req, res) => {
  res.download(CA_CERT_PATH, 'vip-ultra-ca.crt');
});

app.get('/cert/pem', (req, res) => {
  res.download(CA_CERT_PATH, 'vip-ultra-ca.pem');
});

// Get local IP for mobile setup
app.get('/api/info', (req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  res.json({
    proxyPort: PROXY_PORT,
    dashboardPort: DASHBOARD_PORT,
    ips,
    certReady: fs.existsSync(CA_CERT_PATH),
    rulesCount: rules.length,
    activeRules: rules.filter(r => r.enabled).length
  });
});

// Rules CRUD
app.get('/api/rules', (req, res) => {
  res.json(rules);
});

app.post('/api/rules', (req, res) => {
  const rule = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name: req.body.name || 'Nova Regra',
    find: req.body.find || '',
    replace: req.body.replace || '',
    urlFilter: req.body.urlFilter || '',
    useRegex: !!req.body.useRegex,
    caseSensitive: !!req.body.caseSensitive,
    enabled: req.body.enabled !== false
  };
  rules.push(rule);
  saveRules();
  res.json(rule);
});

app.put('/api/rules/:id', (req, res) => {
  const rule = rules.find(r => r.id === req.params.id);
  if (!rule) return res.status(404).json({ error: 'Not found' });
  const allowed = ['name', 'find', 'replace', 'urlFilter', 'useRegex', 'caseSensitive', 'enabled'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) rule[key] = req.body[key];
  }
  saveRules();
  res.json(rule);
});

app.delete('/api/rules/:id', (req, res) => {
  rules = rules.filter(r => r.id !== req.params.id);
  saveRules();
  res.json({ success: true });
});

// ─── Start Servers ───
const dashboardServer = http.createServer(app);

// WebSocket on dashboard server
const wss = new WebSocketServer({ server: dashboardServer });
wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.send(JSON.stringify({ type: 'connected', message: 'Dashboard conectado ao proxy' }));
});

dashboardServer.listen(DASHBOARD_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║         👑 VIP Ultra — MITM Proxy            ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║  Proxy:      http://0.0.0.0:${PROXY_PORT}              ║`);
  console.log(`  ║  Dashboard:  http://localhost:${DASHBOARD_PORT}           ║`);
  console.log(`  ║  Cert:       http://localhost:${DASHBOARD_PORT}/cert      ║`);
  console.log(`  ║  Regras:     ${rules.length} carregada(s)                  ║`);
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});

proxy.listen({
  port: PROXY_PORT,
  host: '::',
  forceSNI: true,
  sslCaDir: CERTS_DIR,
  keepAlive: true
}, () => {
  console.log(`  [✓] Proxy MITM ativo na porta ${PROXY_PORT}`);
  console.log('');
});
