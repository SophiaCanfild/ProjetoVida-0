/* ============================================================
   VIDA+ — Service Worker (PWA) — raiz do site
   ------------------------------------------------------------
   Escopo: o site inteiro (/), assim consegue cachear também
   /shared/, /sistema-medico/ e /telao/.

   Estratégias:
   • Navegações (HTML)  → rede primeiro, cache como reserva
                           (se a internet cair na banca, abre igual)
   • Assets do site     → cache primeiro, rede atualiza
   • CDNs externos      → cache primeiro p/ scripts, css, fontes e
                           imagens (supabase-js, Font Awesome…)
   • API do Supabase    → SEMPRE rede (dados em tempo real)

   Publicou versão nova? Aumente CACHE_VERSION.
   ============================================================ */

const CACHE_VERSION = 'v1';
const CACHE = 'vidamais-' + CACHE_VERSION;

const APP_SHELL = [
  /* Portal */
  './',
  './index.html',

  /* Compartilhado */
  './shared/js/config.js',
  './shared/js/db.js',

  /* App do paciente */
  './paciente-app/index.html',
  './paciente-app/login.html',
  './paciente-app/fila.html',
  './paciente-app/consulta.html',
  './paciente-app/historico.html',
  './paciente-app/exames.html',
  './paciente-app/agendamentos.html',
  './paciente-app/notificacoes.html',
  './paciente-app/perfil.html',
  './paciente-app/css/app.css',
  './paciente-app/js/ui.js',
  './paciente-app/js/nav.js',
  './paciente-app/js/notificacao.js',
  './paciente-app/manifest.json',
  './paciente-app/icons/icon-192.png',
  './paciente-app/icons/icon-512.png',
  './paciente-app/icons/icon-maskable-512.png',
  './paciente-app/icons/apple-touch-icon.png',
  './paciente-app/icons/favicon-32.png',

  /* Sistema médico */
  './sistema-medico/css/global.css',
  './sistema-medico/css/mobile.css',
  './sistema-medico/js/mobile.js',
  './sistema-medico/login/admin.html',
  './sistema-medico/login/funcionario.html',
  './sistema-medico/admin/index.html',
  './sistema-medico/medico/index.html',
  './sistema-medico/enfermeiro/index.html',
  './sistema-medico/recepcionista/index.html',
  './sistema-medico/img/logo.png',

  /* Telão */
  './telao/index.html',
  './telao/css/tv.css',
  './telao/js/relogio.js',
  './telao/js/tv-dados.js'
];

/* Instalar: pré-carrega o app shell */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) =>
        /* addAll abortaria tudo se 1 arquivo falhasse; aqui é um a um */
        Promise.allSettled(APP_SHELL.map((u) => cache.add(u)))
      )
      .then(() => self.skipWaiting())
  );
});

/* Ativar: apaga caches de versões antigas */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const externo = url.hostname !== self.location.hostname;

  /* ---------- EXTERNO ---------- */
  if (externo) {
    /* Scripts/CSS/fontes/imagens de CDN → cache primeiro, rede atualiza.
       (inclui o supabase-js e o Font Awesome: o sistema abre offline) */
    const estatico = ['script', 'style', 'font', 'image'].includes(req.destination);
    if (!estatico) return; /* chamadas de API (Supabase realtime etc.) → rede */

    event.respondWith(
      caches.match(req).then((hit) => {
        const rede = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copia = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return res;
          })
          .catch(() => hit);
        return hit || rede;
      })
    );
    return;
  }

  /* ---------- NAVEGAÇÃO (HTML) ---------- */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => {
            if (r) return r;
            /* offline sem cache daquela página → volta pro portal */
            const fallback = url.pathname.includes('/paciente-app/')
              ? './paciente-app/index.html'
              : './index.html';
            return caches.match(fallback);
          })
        )
    );
    return;
  }

  /* ---------- ASSETS DO PRÓPRIO SITE ---------- */
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      });
    })
  );
});
