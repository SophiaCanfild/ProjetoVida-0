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
     A equipe grava a chamada em consultas; o Realtime envia a
     mesma linha ao app, sem depender do localStorage do telão. */
  let canalChamada = null;
  let ultimaChamadaNotificada = null;

  function iniciarEscuta() {
    if (!SUPABASE_CONFIGURADO || !DB.getSessao() || canalChamada) return;

    // Offline o CDN pode não carregar. Nunca acesse um global ausente.
    const cliente = (typeof supabaseClient !== 'undefined' && supabaseClient)
      ? supabaseClient
      : (typeof supabase !== 'undefined' && supabase && supabase.channel ? supabase : null);
    if (!cliente || typeof cliente.channel !== 'function') return;

    const cpf = DB.getSessao();
    canalChamada = cliente.channel('consultas-app-' + cpf);
    canalChamada
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'consultas', filter: 'cpf=eq.' + cpf },
        (payload) => {
          const c = payload.new;
          if (!c || c.status !== 'chamado' || !c.chamado_em || !c.nome_chamado) return;

          // Outros UPDATEs na mesma consulta não repetem o aviso sonoro.
          const identificacao = c.id + ':' + c.chamado_em;
          if (identificacao === ultimaChamadaNotificada) return;
          ultimaChamadaNotificada = identificacao;

          const destino = c.tipo_chamada === 'consulta'
            ? (/^(?:local_|loc_)/.test(c.consultorio || '') ? 'Consultório indicado' : 'Consultório ' + (c.consultorio || '—'))
            : 'Triagem' + (c.guiche ? ' — Guichê ' + c.guiche : '');

          dispararChamada({
            nome: c.nome_chamado,
            senha: c.senha,
            onde: destino + (c.unidade ? ' • ' + c.unidade : ''),
            perfil: 'paciente'
          });
        })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Paciente] Realtime da chamada indisponível:', status);
        }
      });
  }

  /* ---------- API pública ---------- */
  return {
    configurarOneSignal,
    iniciarEscuta,
    dispararChamada,
    tocarSom
  };
})();
