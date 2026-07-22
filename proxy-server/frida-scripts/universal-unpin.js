// Universal SSL Unpinning — Frida Script
// Use com: frida -U -l universal-unpin.js -f com.app.target --no-pause
//
// Este script faz hook nas funções de validação SSL do Android
// para aceitar qualquer certificado, bypass de certificate pinning.

Java.perform(function () {
  console.log('[👑 VIP Ultra] Iniciando SSL Unpinning...');

  // ─── 1. TrustManager — Bypass padrão Android ───
  try {
    var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
    TrustManagerImpl.verifyChain.implementation = function (untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
      console.log('[✓] TrustManagerImpl.verifyChain() bypassed para: ' + host);
      return untrustedChain;
    };
  } catch (e) {
    console.log('[i] TrustManagerImpl não encontrado (normal em algumas versões)');
  }

  // ─── 2. X509TrustManager — Interface genérica ───
  try {
    var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
    var TrustManager = Java.registerClass({
      name: 'com.vipultra.TrustManager',
      implements: [X509TrustManager],
      methods: {
        checkClientTrusted: function (chain, authType) { },
        checkServerTrusted: function (chain, authType) { },
        getAcceptedIssuers: function () { return []; }
      }
    });
  } catch (e) { }

  // ─── 3. SSLContext — Forçar TrustManager custom ───
  try {
    var SSLContext = Java.use('javax.net.ssl.SSLContext');
    SSLContext.init.overload('[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom').implementation = function (keyManager, trustManager, secureRandom) {
      console.log('[✓] SSLContext.init() interceptado — usando TrustManager custom');
      var customTrustManager = [Java.cast(TrustManager.$new(), Java.use('javax.net.ssl.X509TrustManager'))];
      this.init(keyManager, customTrustManager, secureRandom);
    };
  } catch (e) { }

  // ─── 4. OkHttp3 CertificatePinner ───
  try {
    var CertificatePinner = Java.use('okhttp3.CertificatePinner');
    CertificatePinner.check.overload('java.lang.String', 'java.util.List').implementation = function (hostname, peerCertificates) {
      console.log('[✓] OkHttp3 CertificatePinner.check() bypassed: ' + hostname);
    };
  } catch (e) {
    console.log('[i] OkHttp3 CertificatePinner não encontrado');
  }

  // ─── 5. OkHttp3 CertificatePinner (variante) ───
  try {
    var CertificatePinner2 = Java.use('okhttp3.CertificatePinner');
    CertificatePinner2.check$okhttp.implementation = function (hostname, cleanedCertificateChainFn) {
      console.log('[✓] OkHttp3 check$okhttp() bypassed: ' + hostname);
    };
  } catch (e) { }

  // ─── 6. WebView SSL Errors ───
  try {
    var WebViewClient = Java.use('android.webkit.WebViewClient');
    WebViewClient.onReceivedSslError.implementation = function (webView, handler, error) {
      console.log('[✓] WebView SSL error bypassed');
      handler.proceed();
    };
  } catch (e) { }

  // ─── 7. HostnameVerifier ───
  try {
    var HostnameVerifier = Java.use('javax.net.ssl.HostnameVerifier');
    var AllowAll = Java.registerClass({
      name: 'com.vipultra.AllowAllHostnames',
      implements: [HostnameVerifier],
      methods: {
        verify: function (hostname, session) {
          return true;
        }
      }
    });

    var HttpsURLConnection = Java.use('javax.net.ssl.HttpsURLConnection');
    HttpsURLConnection.setDefaultHostnameVerifier(AllowAll.$new());
    console.log('[✓] HostnameVerifier global bypassed');
  } catch (e) { }

  // ─── 8. Network Security Config ───
  try {
    var NetworkSecurityConfig = Java.use('android.security.net.config.NetworkSecurityConfig');
    NetworkSecurityConfig.isCleartextTrafficPermitted.implementation = function () {
      console.log('[✓] Cleartext traffic permitido');
      return true;
    };
  } catch (e) { }

  console.log('[👑 VIP Ultra] SSL Unpinning ativo!');
  console.log('[👑 VIP Ultra] Todas as conexões HTTPS serão aceitas');
});
