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

   IMPORTANTE — escopo do SW:
   O service worker é registrado em /paciente-app/, então só
   controla requisições DENTRO dessa pasta. Por isso config.js
   e db.js foram copiados para paciente-app/js/ — antes eles
   ficavam em ../shared/js/ (fora do escopo) e eram servidos
   direto da rede; offline o app quebrava.

   Cache:
   - STATIC_CACHE  : app shell gravado na instalação (precache)
   - RUNTIME_CACHE : atualizações obtidas em segundo plano
   As leituras usam matchAny(), que procura nos DOIS caches
   (antes o staleWhileRevalidate só lia o RUNTIME_CACHE e
   ignorava o precache).

   Ao publicar nova versão do app, incremente CACHE_VERSION.
   ============================================================ */

const CACHE_VERSION = 'vidaplus-paciente-v3';
const STATIC_CACHE = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

/* Ordem de leitura: RUNTIME (cópias mais recentes, vindas da
   rede) primeiro; STATIC (precache) como fallback offline. */
const CACHES_APP = [RUNTIME_CACHE, STATIC_CACHE];

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
  './js/config.js',
  './js/db.js',
  './js/nav.js',
  './js/ui.js',
  './js/notificacao.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/logo.png'
];

/* ---------- Utilidades de cache ---------- */

/* Procura a requisição em TODOS os caches do app (runtime e
   precache), não só em um. Retorna Response ou null. */
async function matchAny(req, opcoes) {
  for (const nome of CACHES_APP) {
    const cache = await caches.open(nome);
    const hit = await cache.match(req, opcoes);
    if (hit) return hit;
  }
  return null;
}

/* Grava uma cópia no cache em segundo plano. O clone é feito
   de forma SÍNCRONA, antes de o navegador começar a consumir o
   corpo da resposta devolvida ao cliente. */
function guardar(req, res, cacheName) {
  if (!res || (!res.ok && res.type !== 'opaque')) return Promise.resolve(false);

  let copia;
  try { copia = res.clone(); } catch (err) { return Promise.resolve(false); }

  return caches.open(cacheName || RUNTIME_CACHE)
    .then((cache) => cache.put(req, copia))
    .catch(() => false);
}

/* ---------- Instalação: guarda o app shell ----------
   Usa allSettled: um arquivo faltando/404 não derruba o
   precache inteiro (com addAll, um erro descartava tudo). */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(STATIC_CACHE);
      const resultados = await Promise.allSettled(
        APP_SHELL.map((url) => {
          const destino = new URL(url, self.registration.scope).href;
          /* cache: 'reload' ignora o cache HTTP e busca a versão nova */
          return cache.add(new Request(destino, { cache: 'reload' }));
        })
      );

      const falhas = APP_SHELL.filter((_, i) => resultados[i].status === 'rejected');
      if (falhas.length) {
        console.warn('[SW] Itens não precacheados (seguindo mesmo assim):', falhas);
      } else {
        console.info('[SW] Precache completo:', APP_SHELL.length, 'itens');
      }
    } catch (err) {
      console.error('[SW] Falha ao abrir o cache de precache:', err);
    }

    await self.skipWaiting();
  })());
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

/* ---------- Estratégias ---------- */

/* Rede primeiro, cache como fallback (navegação) */
async function networkFirst(req, fallbackUrl) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      /* grava em segundo plano, sem atrasar a resposta */
      guardar(req, res, RUNTIME_CACHE).catch(() => {});
    }
    return res;
  } catch (err) {
    /* Navegação: ignora query string ao procurar no cache */
    const opcoes = req.mode === 'navigate' ? { ignoreSearch: true } : undefined;
    const hit = await matchAny(req, opcoes);
    if (hit) return hit;

    /* Ainda offline: entrega o app shell (index) cacheado */
    if (fallbackUrl) {
      const shellUrl = new URL(fallbackUrl, self.registration.scope).href;
      const shell = await matchAny(new Request(shellUrl), { ignoreSearch: true });
      if (shell) return shell;
    }

    throw err;
  }
}

/* Cache primeiro, atualiza em segundo plano (estáticos e CDN) */
async function staleWhileRevalidate(req) {
  const hit = await matchAny(req);

  const buscar = fetch(req)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        /* Atualização em segundo plano — não bloqueia a resposta */
        guardar(req, res, RUNTIME_CACHE).catch(() => {});
      }
      return res;
    })
    .catch((err) => {
      if (hit) return hit;
      throw err;
    });

  return hit || buscar;
}

/* ---------- Intercepta requisições ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  /* Só GET; deixa POST/PUT/DELETE (Supabase) passarem direto */
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const escopo = new URL(self.registration.scope).pathname;

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

  /* 3. Arquivos do app (mesma origem, dentro do escopo): cache + atualização */
  if (url.origin === self.location.origin && url.pathname.startsWith(escopo)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  /* 4. CDN (Supabase JS, Google Fonts): cache + atualização */
  if (url.hostname === 'cdn.jsdelivr.net' ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req));
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
