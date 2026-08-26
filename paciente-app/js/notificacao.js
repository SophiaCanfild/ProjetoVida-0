/* ============================================================
   VIDA+ PACIENTE — Sistema de notificação de chamada
   ------------------------------------------------------------
   Estratégia em 3 camadas (garante funcionamento na banca):

   1. PUSH REAL (OneSignal) — quando ONESIGNAL_APP_ID estiver
      preenchido no config.js. O telão dispara via Edge Function
      'enviar-notificacao' → push chega mesmo com o app fechado.

   2. NOTIFICAÇÃO DO NAVEGADOR (fallback) — API Notification.
      Funciona com o app aberto em outra aba ou celular.

   3. ALERTA EM TELA CHEIA DENTRO DO APP (sempre) — tela verde
      pulsante + som + vibração. Funciona offline, garantida.
   ============================================================ */

const Notificacao = (function () {

  /* ---------- Áudio de chamada (gerado em código, sem arquivo) ---------- */
  let ctx = null;
  function tocarSom() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const melodias = [
        [880, 0.0], [1174.66, 0.18], [880, 0.36], [1174.66, 0.54], [1567.98, 0.72]
      ];
      melodias.forEach(([freq, quando]) => {
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        ganho.gain.setValueAtTime(0.0001, ctx.currentTime + quando);
        ganho.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + quando + 0.03);
        ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + quando + 0.16);
        osc.connect(ganho).connect(ctx.destination);
        osc.start(ctx.currentTime + quando);
        osc.stop(ctx.currentTime + quando + 0.2);
      });
    } catch (e) { /* áudio indisponível — ignora */ }
  }

  /* ---------- Vibrar (celular) ---------- */
  function vibrar() {
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 500]); } catch (e) {}
  }

  /* ---------- Notificação do navegador ---------- */
  function notificarNavegador(nome, senha, onde) {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        new Notification('🔔 Sua vez chegou!', {
          body: `${nome} — Senha ${senha} • ${onde}`,
          tag: 'chamada', renotify: true,
          icon: 'icons/icon-192.png'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => { if (p === 'granted') notificarNavegador(nome, senha, onde); });
      }
    } catch (e) {}
  }

  /* ---------- Overlay em tela cheia dentro do app ---------- */
  function abrirOverlay({ nome, senha, onde, perfil }) {
    let overlay = document.querySelector('.overlay-chamada');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'overlay-chamada';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="icone">${UI.icone('sino')}</div>
      <div class="titulo">🔔 Sua vez de ser atendido</div>
      <div class="nome">${nome}</div>
      <div class="senha2">Senha ${senha}</div>
      <div class="onde">${onde}</div>
      <button class="btn btn-fechar" id="fechar-chamada">Entendi, estou indo</button>`;
    overlay.classList.add('aberto');
    document.getElementById('fechar-chamada').onclick = () => overlay.classList.remove('aberto');
  }

  /* ---------- Ponto de entrada ---------- */
  function dispararChamada(dados) {
    const { nome, senha, onde, perfil } = dados;
    tocarSom();
    vibrar();
    notificarNavegador(nome, senha, onde);
    abrirOverlay(dados);
    if (typeof dados.onCb === 'function') dados.onCb();
  }

  /* ---------- Configuração OneSignal (push real) ---------- */
  let umCarregado = false;
  function configurarOneSignal() {
    if (!APP_CONFIG.ONESIGNAL_APP_ID || umCarregado) return;
    umCarregado = true;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(function (OneSignal) {
      OneSignal.init({ appId: APP_CONFIG.ONESIGNAL_APP_ID, allowLocalhostAsSecureOrigin: true });
      OneSignal.on('subscriptionChange', function (isSubscribed) {
        if (isSubscribed && DB.getSessao()) {
          OneSignal.sendTag('cpf', DB.getSessao());
        }
      });
    });
  }

  /* ---------- Escuta do telão (modo Supabase) ----------
     Se houver uma consulta ativa e o telão a chamar, o app
     detecta a mudança de status e dispara a notificação. */
  function iniciarEscuta() {
    if (!SUPABASE_CONFIGURADO || !DB.getSessao()) return;
    const cpf = DB.getSessao();

    supabase
      .channel('consultas-app-' + cpf)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'consultas', filter: 'cpf=eq.' + cpf },
        async (payload) => {
          const c = payload.new;
          if (c.status === 'chamado' && c.chamado_em && c.nome_chamado) {
            dispararChamada({
              nome: c.nome_paciente, senha: c.senha,
              onde: 'Guichê ' + (c.guiche || '—') + ' • ' + c.unidade,
              perfil: 'paciente'
            });
          }
        })
      .subscribe();
  }

  /* ---------- API pública ---------- */
  return {
    configurarOneSignal,
    iniciarEscuta,
    dispararChamada,
    tocarSom
  };
})();
