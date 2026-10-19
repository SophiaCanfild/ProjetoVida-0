/* ============================================================
   VIDA+ PACIENTE — Service Worker
   ------------------------------------------------------------
   - App shell em cache: o app abre mesmo offline
   - Navegação: tenta rede primeiro, cai para o cache
   - API do Supabase (rest/realtime/auth): SEMPRE rede
     (dados de saúde nunca ficam desatualizados no cache)
   - CDN (Supabase JS, Google Fonts): cache com
     atualização em segundo plano (stale-while-revalidate)
   - Push: mostra notificação de chamada mesmo com o app
     fechado (quando houver assinatura push ativa)

   Ao publicar nova versão do app, incremente CACHE_VERSION.
   ============================================================ */

const CACHE_VERSION = 'vidaplus-paciente-v1';
const STATIC_CACHE = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

/* ---------- App shell (precache na instalação) ---------- */
const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './fila.html',
  './consulta.html',
  './historico.html',
  './exames.html',
  './agendamentos.html',
  './notificacoes.html',
  './perfil.html',
  './css/app.css',
  './js/nav.js',
  './js/ui.js',
  './js/notificacao.js',
  '../shared/js/config.js',
  '../shared/js/db.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo.png'
];

/* ---------- Instalação: guarda o app shell ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[SW] Falha no precache:', err))
  );
});

/* ---------- Ativação: limpa caches antigos e assume ---------- */
self.addEventListener('activate', (event) => {
  const validos = [STATIC_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.map((nome) => {
          if (!validos.includes(nome) && nome.startsWith('vidaplus-')) {
            return caches.delete(nome);
          }
          return Promise.resolve(false);
        })
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- Respostas ---------- */
async function doCache(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: false });
  return { cache, hit };
}

/* Rede primeiro, cache como fallback (navegação e API não-crítica) */
async function networkFirst(req, fallbackUrl) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const { cache } = await doCache(req, RUNTIME_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const { hit } = await doCache(req, RUNTIME_CACHE);
    if (hit) return hit;
    const { cache } = await doCache(req, STATIC_CACHE);
    const estatico = await cache.match(req, { ignoreSearch: false });
    if (estatico) return estatico;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

/* Cache primeiro, atualiza em segundo plano (estáticos e CDN) */
async function staleWhileRevalidate(req, cacheName) {
  const { cache, hit } = await doCache(req, cacheName);
  const buscar = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(req, res.clone());
    }
    return res;
  }).catch(() => hit);
  return hit || buscar;
}

/* ---------- Intercepta requisições ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  /* Só GET; deixa POST/PUT/DELETE (Supabase) passarem direto */
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* 1. API Supabase: sempre rede, nunca cache */
  if (url.hostname.endsWith('.supabase.co')) {
    if (url.pathname.startsWith('/rest/') ||
        url.pathname.startsWith('/realtime/') ||
        url.pathname.startsWith('/auth/') ||
        url.pathname.startsWith('/storage/')) {
      return; /* network-only */
    }
  }

  /* 2. Navegação entre páginas: rede primeiro, index offline */
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }

  /* 3. Arquivos do app (mesma origem): cache + atualização */
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }

  /* 4. CDN (Supabase JS, Google Fonts): cache + atualização */
  if (url.hostname === 'cdn.jsdelivr.net' ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }

  /* 5. Qualquer outra origem externa: deixa passar */
});

/* ---------- Push: chamada de senha com app fechado ----------
   Exibe a notificação enviada pelo servidor (payload JSON com
   titulo, corpo e url). Requer assinatura push no app. */
self.addEventListener('push', (event) => {
  let dados = { titulo: 'Vida+', corpo: 'Você tem uma nova atualização.', url: './index.html' };
  try {
    if (event.data) {
      const payload = event.data.json();
      dados = {
        titulo: payload.titulo || dados.titulo,
        corpo: payload.corpo || payload.body || dados.corpo,
        url: payload.url || dados.url
      };
    }
  } catch (err) { /* payload inválido — usa padrão */ }

  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'vidaplus-chamada',
      renotify: true,
      vibrate: [300, 150, 300, 150, 500],
      data: { url: dados.url }
    })
  );
});

/* ---------- Clique na notificação: abre/foca o app ---------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || './index.html';
  const alvo = new URL(destino, self.location.origin + self.location.pathname).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url === alvo && 'focus' in janela) {
          return janela.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(alvo);
      }
      return null;
    })
  );
});
