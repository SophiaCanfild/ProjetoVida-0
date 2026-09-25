/* ============================================================
   VIDA+ PACIENTE — Service Worker (PWA)
   ------------------------------------------------------------
   A "memória" do app: guarda as telas no celular para abrir
   rápido e funcionar até sem internet (o paciente continua
   vendo a última fila/cadastro salvo). Os DADOS do Supabase
   nunca são servidos do cache — quando há internet, o app
   sempre busca o estado fresquinho do banco.

   Ao publicar mudanças no app, aumente a versão abaixo
   (v1 → v2) para os celulares baixarem a versão nova.
   ============================================================ */
const CACHE = 'vida-paciente-v1';

/* Arquivos essenciais do "esqueleto" do app */
const ESENCIAIS = [
  './', 'index.html', 'login.html', 'manifest.json',
  'css/app.css', 'js/nav.js', 'js/ui.js', 'js/notificacao.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'img/logo.png', 'icons/logo.png'
];

/* Instalação: baixa e guarda o esqueleto */
self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ESENCIAIS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

/* Ativação: apaga caches de versões antigas */
self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Pedidos: estratégia por tipo de requisição */
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return; /* gravações vão direto para a rede */

  const url = new URL(req.url);

  /* Banco de dados (REST/Realtime do Supabase): SEMPRE ao vivo, sem cache */
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.com')) return;

  /* Navegação entre telas: tenta a rede, cai no cache, cai no index */
  if (req.mode === 'navigate') {
    ev.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  /* Arquivos parados (css/js/fontes/ícones): usa o cache na hora e
     atualiza por trás (stale-while-revalidate) */
  const cdnOk = url.hostname === 'cdn.jsdelivr.net' ||
                url.hostname === 'fonts.googleapis.com' ||
                url.hostname === 'fonts.gstatic.com';
  if (url.origin === self.location.origin || cdnOk) {
    ev.respondWith(
      caches.match(req).then((emCache) => {
        if (emCache) {
          fetch(req).then((resp) => {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }).catch(() => {});
          return emCache;
        }
        return fetch(req).then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return resp;
        });
      })
    );
  }
});
