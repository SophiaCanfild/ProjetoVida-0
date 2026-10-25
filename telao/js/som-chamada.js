/* ============================================================
   VIDA+ TELÃO — Som da chamada (som-chamada.js)
   ------------------------------------------------------------
   Bip de 4 notas gerado por WebAudio (sem arquivo de áudio).

   IMPORTANTE (correção): antes este código criava um
   `new AudioContext()` a cada chamada e nunca o fechava. O Chrome
   limita a quantidade de AudioContexts por página; a partir de
   algumas chamadas o construtor lança erro — e o `catch (e) {}`
   engolia a falha em silêncio, deixando o telão mudo para sempre.
   Agora existe UM contexto reaproveitado por toda a sessão.

   O navegador também só libera áudio depois de uma interação na
   página (política de autoplay). Por isso há desbloquear(): ele
   resume o contexto no primeiro clique/toque/tecla.
   ============================================================ */
var NotificarTV = (function () {
  'use strict';

  var ctx = null;
  var ganhou = false;
  var avisouBloqueio = false;

  /* Contexto único, criado sob demanda */
  function contexto() {
    if (ctx) return ctx;

    var AC = (typeof window !== 'undefined') &&
      (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;

    try {
      ctx = new AC();
    } catch (e) {
      console.warn('[Telão] Não foi possível criar o AudioContext:', e && e.message);
      ctx = null;
    }
    return ctx;
  }

  /* Resume o contexto (autoplay). Idempotente: pode ser chamado
     quantas vezes quiser. */
  function desbloquear() {
    var c = contexto();
    if (!c) return Promise.resolve(false);

    if (c.state !== 'suspended') {
      avisouBloqueio = false;   /* voltou a rodar */
      return Promise.resolve(true);
    }

    try {
      return Promise.resolve(c.resume())
        .then(function () { return c.state === 'running'; })
        .catch(function (e) {
          /* Avisa uma única vez: sem gesto do usuário o navegador
             bloqueia; repetir o aviso a cada chamada só polui. */
          if (!avisouBloqueio) {
            avisouBloqueio = true;
            console.warn('[Telão] Áudio bloqueado pelo navegador (falta um clique na página):',
              e && e.message);
          }
          return false;
        });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /* Bip da chamada: 4 notas curtas */
  function somChamada() {
    var c = contexto();
    if (!c) return false;

    /* Se ainda estiver suspenso, tenta liberar e toca assim que rodar */
    if (c.state === 'suspended') {
      desbloquear().then(function (rodando) {
        if (rodando) tocarNotas(c);
      });
      return true;
    }

    tocarNotas(c);
    return true;
  }

  function tocarNotas(c) {
    try {
      var notas = [[880, 0], [1174.66, 0.22], [880, 0.44], [1567.98, 0.66]];
      var agora = c.currentTime;

      notas.forEach(function (nota) {
        var freq = nota[0];
        var t = nota[1];
        var o = c.createOscillator();
        var g = c.createGain();

        o.type = 'sine';
        o.frequency.value = freq;

        g.gain.setValueAtTime(0.0001, agora + t);
        g.gain.exponentialRampToValueAtTime(0.4, agora + t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, agora + t + 0.18);

        o.connect(g);
        g.connect(c.destination);

        o.start(agora + t);
        o.stop(agora + t + 0.25);
        /* libera os nós depois de tocar */
        o.onended = function () {
          try { o.disconnect(); g.disconnect(); } catch (e) { /* ignora */ }
        };
      });

      ganhou = true;
    } catch (e) {
      console.warn('[Telão] Falha ao tocar o bip:', e && e.message);
    }
  }

  /* Libera o áudio no primeiro gesto do usuário */
  function iniciarDesbloqueio() {
    if (typeof document === 'undefined') return;

    function aoInteragir() {
      desbloquear();
      document.removeEventListener('pointerdown', aoInteragir);
      document.removeEventListener('touchstart', aoInteragir);
      document.removeEventListener('keydown', aoInteragir);
    }

    document.addEventListener('pointerdown', aoInteragir);
    document.addEventListener('touchstart', aoInteragir);
    document.addEventListener('keydown', aoInteragir);

    /* Se a página já recebeu interação antes deste script rodar,
       o contexto pode nascer liberado; tenta de todo modo. */
    desbloquear();
  }

  if (typeof window !== 'undefined') iniciarDesbloqueio();

  return {
    somChamada: somChamada,
    desbloquear: desbloquear,
    /* diagnóstico (usado pela página teste-voz.html) */
    estado: function () {
      var c = contexto();
      return {
        disponivel: !!c,
        estado: c ? c.state : 'indisponível',
        jaTocou: ganhou
      };
    },
    _contexto: contexto
  };
})();
