/* ============================================================
   VIDA+ TELÃO — Chamada por voz e controles de áudio
   ------------------------------------------------------------
   Usa Web Speech API (voz em português) e Web Audio API (sinal),
   sem arquivos externos. O teste é fictício e não altera a fila.
   ============================================================ */
var VozChamadaTV = (function () {
  'use strict';

  var CHAVE_SILENCIO = 'vidamais_tv_som_silenciado';
  var ATRASO_VOZ_MS = 1000;
  var CHAMADA_TESTE = {
    id: 'teste-de-chamada',
    senha: 'A001',
    tipo_chamada: 'triagem',
    guiche: '1'
  };

  var sintese = typeof window !== 'undefined' && window.speechSynthesis
    ? window.speechSynthesis
    : null;
  var vozPreferida = null;
  var contextoAudio = null;
  var osciladores = [];
  var temporizador = null;
  var falaAtual = null;
  var textoPendente = '';
  var ativo = false;
  var pausado = false;
  var emTeste = false;
  var iniciado = false;
  var statusAtual = '';
  var elementos = {};
  var silenciado = lerPreferenciaSilencio();

  function lerPreferenciaSilencio() {
    try {
      return window.localStorage.getItem(CHAVE_SILENCIO) === 'true';
    } catch (e) {
      return false;
    }
  }

  function salvarPreferenciaSilencio() {
    try {
      window.localStorage.setItem(CHAVE_SILENCIO, String(silenciado));
    } catch (e) {
      // O controle continua funcionando mesmo sem armazenamento local.
    }
  }

  function vozDisponivel() {
    return !!(sintese && typeof window !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance === 'function');
  }

  function escolherVoz() {
    if (!sintese || typeof sintese.getVoices !== 'function') return;

    var vozes = sintese.getVoices() || [];
    var portuguesas = vozes.filter(function (voz) {
      return /^pt([_-]|$)/i.test(voz.lang || '');
    });

    vozPreferida = portuguesas.find(function (voz) {
      return /^pt[_-]BR$/i.test(voz.lang || '') && voz.localService;
    }) || portuguesas.find(function (voz) {
      return /^pt[_-]BR$/i.test(voz.lang || '');
    }) || portuguesas[0] || null;
  }

  /* Separa letras e números para a senha não ser lida como uma palavra
     ou como um número único. Ex.: A001 → "a, zero, zero, um". */
  function formatarSenhaParaVoz(senha) {
    var letras = {
      A: 'a', B: 'bê', C: 'cê', D: 'dê', E: 'é', F: 'efe',
      G: 'gê', H: 'agá', I: 'i', J: 'jota', K: 'cá', L: 'ele',
      M: 'eme', N: 'ene', O: 'ó', P: 'pê', Q: 'quê', R: 'erre',
      S: 'esse', T: 'tê', U: 'u', V: 'vê', W: 'dáblio', X: 'xis',
      Y: 'ípsilon', Z: 'zê'
    };
    var numeros = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];

    return String(senha || '')
      .trim()
      .toUpperCase()
      .split('')
      .filter(function (caractere) { return /[A-Z0-9]/.test(caractere); })
      .map(function (caractere) {
        if (/\d/.test(caractere)) return numeros[Number(caractere)];
        return letras[caractere] || caractere;
      })
      .join(', ');
  }

  function acrescentarOrientacao(texto, chamada) {
    var orientacao = String(chamada.orientacao_voz || '').trim();
    if (!orientacao) return texto;
    if (!/[.!?]$/.test(orientacao)) orientacao += '.';
    return texto + ' ' + orientacao;
  }

  function montarTexto(chamada) {
    if (!chamada) return '';

    if ((chamada.tipo_chamada || 'triagem') === 'consulta') {
      var nome = String(chamada.nome_chamado || chamada.nome_paciente || 'Paciente').trim();
      var consultorio = String(chamada.consultorio || '').trim();
      var destinoConsulta = consultorio
        ? 'Por favor, dirija-se ao consultório ' + consultorio + '.'
        : 'Por favor, dirija-se ao consultório indicado no telão.';
      return acrescentarOrientacao(
        'Atenção, ' + (nome || 'Paciente') + '. ' + destinoConsulta,
        chamada
      );
    }

    var senha = formatarSenhaParaVoz(chamada.senha);
    var guiche = String(chamada.guiche || '').trim();
    var destinoTriagem = 'Por favor, dirija-se à triagem' +
      (guiche ? ', guichê ' + guiche : '') + '.';

    var texto = senha
      ? 'Atenção. Senha ' + senha + '. ' + destinoTriagem
      : 'Atenção, paciente. Sua senha foi chamada. ' + destinoTriagem;
    return acrescentarOrientacao(texto, chamada);
  }

  function definirStatus(texto) {
    statusAtual = texto;
    atualizarControles();
  }

  function statusPadrao() {
    if (silenciado) return 'Som silenciado';
    return vozDisponivel() ? 'Voz ativa' : 'Voz indisponível';
  }

  function atualizarControles() {
    if (!iniciado) return;

    var estado = silenciado ? 'muted' : (pausado ? 'paused' : (ativo ? 'playing' : 'ready'));
    if (elementos.painel) elementos.painel.dataset.estado = estado;
    if (elementos.status) elementos.status.textContent = statusAtual || statusPadrao();

    if (elementos.pausar) {
      elementos.pausar.disabled = !ativo || silenciado;
      elementos.pausar.setAttribute('aria-pressed', String(pausado));
      elementos.pausar.setAttribute('aria-label', pausado ? 'Retomar chamada por voz' : 'Pausar chamada por voz');
      elementos.pausar.title = pausado ? 'Retomar chamada' : 'Pausar chamada';
    }
    if (elementos.textoPausar) elementos.textoPausar.textContent = pausado ? 'Retomar' : 'Pausar';
    if (elementos.iconePausa) elementos.iconePausa.hidden = pausado;
    if (elementos.iconeRetomar) elementos.iconeRetomar.hidden = !pausado;

    if (elementos.silenciar) {
      elementos.silenciar.setAttribute('aria-pressed', String(silenciado));
      elementos.silenciar.setAttribute('aria-label', silenciado ? 'Ativar som do telão' : 'Silenciar som do telão');
      elementos.silenciar.title = silenciado ? 'Ativar som' : 'Silenciar som e voz';
    }
    if (elementos.textoSilenciar) elementos.textoSilenciar.textContent = silenciado ? 'Ativar som' : 'Silenciar';
    if (elementos.iconeSom) elementos.iconeSom.hidden = silenciado;
    if (elementos.iconeMudo) elementos.iconeMudo.hidden = !silenciado;

    if (elementos.testar) elementos.testar.disabled = ativo;
  }

  function pararSinal() {
    osciladores.slice().forEach(function (oscilador) {
      try { oscilador.stop(); } catch (e) { /* já finalizado */ }
    });
    osciladores = [];
  }

  function desbloquearAudio() {
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      if (!contextoAudio || contextoAudio.state === 'closed') {
        contextoAudio = new AudioContext();
      }
      if (contextoAudio.state === 'suspended') {
        var retomada = contextoAudio.resume();
        if (retomada && typeof retomada.catch === 'function') retomada.catch(function () {});
      }
      return contextoAudio;
    } catch (e) {
      return null;
    }
  }

  function tocarSinal() {
    var ctx = desbloquearAudio();
    if (!ctx) return;

    try {
      pararSinal();
      var notas = [[880, 0], [1174.66, 0.22], [880, 0.44], [1567.98, 0.66]];
      notas.forEach(function (nota) {
        var frequencia = nota[0];
        var quando = nota[1];
        var oscilador = ctx.createOscillator();
        var ganho = ctx.createGain();
        oscilador.type = 'sine';
        oscilador.frequency.value = frequencia;
        ganho.gain.setValueAtTime(0.0001, ctx.currentTime + quando);
        ganho.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + quando + 0.03);
        ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + quando + 0.18);
        oscilador.connect(ganho).connect(ctx.destination);
        oscilador.start(ctx.currentTime + quando);
        oscilador.stop(ctx.currentTime + quando + 0.25);
        osciladores.push(oscilador);
        oscilador.onended = function () {
          osciladores = osciladores.filter(function (item) { return item !== oscilador; });
        };
      });
    } catch (e) {
      // Se o sinal não for permitido, a fala ainda será tentada.
    }
  }

  function pararAnuncio() {
    if (temporizador) {
      window.clearTimeout(temporizador);
      temporizador = null;
    }

    ativo = false;
    pausado = false;
    emTeste = false;
    textoPendente = '';
    falaAtual = null;
    pararSinal();

    if (sintese) {
      try {
        sintese.cancel();
        sintese.resume();
      } catch (e) { /* síntese indisponível */ }
    }
  }

  function concluirAnuncio() {
    ativo = false;
    pausado = false;
    emTeste = false;
    textoPendente = '';
    falaAtual = null;
    definirStatus(statusPadrao());
  }

  function iniciarFala() {
    temporizador = null;
    if (!ativo || pausado || silenciado) return;

    if (!vozDisponivel()) {
      concluirAnuncio();
      definirStatus('Voz indisponível neste navegador');
      return;
    }

    try {
      if (!vozPreferida) escolherVoz();
      var fala = new window.SpeechSynthesisUtterance(textoPendente);
      fala.lang = 'pt-BR';
      fala.rate = 0.92;
      fala.pitch = 1;
      fala.volume = 1;
      if (vozPreferida) fala.voice = vozPreferida;
      falaAtual = fala;

      fala.onstart = function () {
        if (falaAtual !== fala || !ativo) return;
        definirStatus(emTeste ? 'Testando chamada...' : 'Anunciando chamada...');
      };

      fala.onend = function () {
        if (falaAtual !== fala) return;
        concluirAnuncio();
      };

      fala.onerror = function (evento) {
        if (falaAtual !== fala) return;
        var bloqueada = evento && evento.error === 'not-allowed';
        concluirAnuncio();
        definirStatus(bloqueada
          ? 'Clique em Testar chamada para liberar o áudio'
          : 'Não foi possível reproduzir a voz');
      };

      definirStatus(emTeste ? 'Testando chamada...' : 'Anunciando chamada...');
      sintese.speak(fala);
    } catch (e) {
      concluirAnuncio();
      definirStatus('Não foi possível reproduzir a voz');
    }
  }

  function iniciarAnuncio(chamada, teste) {
    var texto = montarTexto(chamada);
    if (!texto || silenciado) {
      if (silenciado) definirStatus('Som silenciado');
      return false;
    }

    pararAnuncio();
    ativo = true;
    emTeste = !!teste;
    textoPendente = texto;
    definirStatus(teste ? 'Preparando teste...' : 'Chamando paciente...');
    tocarSinal();
    temporizador = window.setTimeout(iniciarFala, ATRASO_VOZ_MS);
    return true;
  }

  function anunciar(chamada) {
    return iniciarAnuncio(chamada, false);
  }

  function testar() {
    // Este clique também libera o áudio em navegadores com autoplay bloqueado.
    desbloquearAudio();
    if (silenciado) {
      definirStatus('Ative o som para testar a chamada');
      return false;
    }
    if (ativo) return false;
    return iniciarAnuncio(CHAMADA_TESTE, true);
  }

  function alternarPausa() {
    if (!ativo || silenciado) return false;

    if (pausado) {
      pausado = false;
      desbloquearAudio();
      if (sintese) {
        try { sintese.resume(); } catch (e) { /* ignora */ }
      }
      // Se a pausa ocorreu durante o sinal, a fala ainda não foi criada.
      if (!falaAtual) iniciarFala();
      definirStatus(emTeste ? 'Testando chamada...' : 'Anunciando chamada...');
    } else {
      pausado = true;
      if (temporizador) {
        window.clearTimeout(temporizador);
        temporizador = null;
      }
      // Se ainda estava no sinal, a retomada começa diretamente na fala.
      if (!falaAtual) pararSinal();
      if (sintese) {
        try { sintese.pause(); } catch (e) { /* ignora */ }
      }
      definirStatus('Chamada pausada');
    }
    return true;
  }

  function alternarSilencio() {
    silenciado = !silenciado;
    salvarPreferenciaSilencio();

    if (silenciado) {
      pararAnuncio();
      definirStatus('Som silenciado');
    } else {
      desbloquearAudio();
      definirStatus(statusPadrao());
    }
    return silenciado;
  }

  function iniciar() {
    if (iniciado || typeof document === 'undefined') return;

    elementos = {
      painel: document.getElementById('controles-voz'),
      status: document.getElementById('voz-status'),
      pausar: document.getElementById('btn-pausar-voz'),
      textoPausar: document.getElementById('texto-pausar-voz'),
      iconePausa: document.getElementById('icone-pausar-voz'),
      iconeRetomar: document.getElementById('icone-retomar-voz'),
      silenciar: document.getElementById('btn-silenciar-voz'),
      textoSilenciar: document.getElementById('texto-silenciar-voz'),
      iconeSom: document.getElementById('icone-som-voz'),
      iconeMudo: document.getElementById('icone-mudo-voz'),
      testar: document.getElementById('btn-testar-voz')
    };

    if (!elementos.painel) return;
    iniciado = true;
    if (elementos.pausar) elementos.pausar.addEventListener('click', alternarPausa);
    if (elementos.silenciar) elementos.silenciar.addEventListener('click', alternarSilencio);
    if (elementos.testar) elementos.testar.addEventListener('click', testar);

    escolherVoz();
    if (sintese && typeof sintese.addEventListener === 'function') {
      sintese.addEventListener('voiceschanged', escolherVoz);
    }
    statusAtual = statusPadrao();
    atualizarControles();
  }

  if (typeof document !== 'undefined') {
    // O script é carregado ao final do body; nesse caso já pode iniciar.
    if (document.getElementById('controles-voz')) {
      iniciar();
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', iniciar);
    }
  }

  return {
    anunciar: anunciar,
    testar: testar,
    alternarPausa: alternarPausa,
    alternarSilencio: alternarSilencio,
    parar: pararAnuncio,
    montarTexto: montarTexto,
    formatarSenhaParaVoz: formatarSenhaParaVoz
  };
})();
