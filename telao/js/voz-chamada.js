/* ============================================================
   VIDA+ TELÃO — Voz das chamadas (voz-chamada.js)
   ------------------------------------------------------------
   Fala em voz alta cada NOVA senha chamada, usando a Web
   Speech API (speechSynthesis) do próprio navegador:
     - nenhum arquivo de áudio
     - nenhum serviço externo
     - funciona offline (as vozes locais do sistema)

   Frases faladas:
     triagem  → "Senha A cento e vinte e três. Dirija-se à
                 triagem, guichê 2."
     consulta → "Paciente Maria da Silva. Dirija-se ao
                 consultório 3. Com Dr. Carlos Pereira. Senha..."

   Configuração em TV_CONFIG (shared/js/config.js):
     VOZ_ATIVA           liga/desliga a voz
     VOZ_IDIOMA          idioma das vozes (padrão 'pt-BR')
     VOZ_REPETICOES      quantas vezes repete cada chamada
     VOZ_INTERVALO_MS    pausa entre as repetições
     VOZ_APOS_SOM_MS     espera o bip terminar antes de falar
     VOZ_VOLUME          0 a 1
     VOZ_VELOCIDADE      0.1 a 10 (padrão 1; 0.95 soa mais calmo)
     VOZ_DIGITO_A_DIGITO false = "cento e vinte e três"
                         true  = "um dois três"

   IMPORTANTE — autoplay: o navegador só libera áudio/voz depois
   de uma interação na página. Na TV em modo quiosque, abra o
   navegador com --autoplay-policy=no-user-gesture-required ou
   dê um clique/toque na tela depois de abrir o telão.
   ============================================================ */
var VozChamada = (function () {
  'use strict';

  var DIGITOS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco',
                 'seis', 'sete', 'oito', 'nove'];

  /* Voz escolhida (cache) e controle das repetições em andamento */
  var vozEscolhida = null;
  var geracao = 0;
  var timers = [];

  /* ---------- Configuração ---------- */
  function cfg() {
    var c = (typeof TV_CONFIG !== 'undefined' && TV_CONFIG) ? TV_CONFIG : {};
    return {
      ativa: c.VOZ_ATIVA !== false,
      idioma: c.VOZ_IDIOMA || 'pt-BR',
      repeticoes: Math.max(1, parseInt(c.VOZ_REPETICOES, 10) || 1),
      intervalo: c.VOZ_INTERVALO_MS != null ? Math.max(0, c.VOZ_INTERVALO_MS) : 1500,
      aposSom: c.VOZ_APOS_SOM_MS != null ? Math.max(0, c.VOZ_APOS_SOM_MS) : 1000,
      volume: c.VOZ_VOLUME != null ? Math.min(1, Math.max(0, c.VOZ_VOLUME)) : 1,
      velocidade: c.VOZ_VELOCIDADE != null ? Math.min(10, Math.max(0.1, c.VOZ_VELOCIDADE)) : 1,
      digitoADigito: c.VOZ_DIGITO_A_DIGITO === true
    };
  }

  function suportaVoz() {
    return typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance === 'function';
  }

  /* ---------- Texto falado ---------- */

  /* "A123" → "A 123" (lido como "A cento e vinte e três")
     ou "A um dois três" se VOZ_DIGITO_A_DIGITO = true */
  function senhaFalada(senha) {
    var texto = String(senha == null ? '' : senha).trim().toUpperCase();
    if (!texto) return '';

    if (!cfg().digitoADigito) {
      /* Separa a letra dos números para o sintetizador não ler "A123" de forma estranha */
      return texto.replace(/([A-Z])\s*-?\s*(\d)/g, '$1 $2').replace(/[-\/]/g, ' ');
    }

    var partes = [];
    for (var i = 0; i < texto.length; i++) {
      var ch = texto.charAt(i);
      if (/\d/.test(ch)) partes.push(DIGITOS[parseInt(ch, 10)]);
      else if (/[A-Z]/.test(ch)) partes.push(ch);
      /* hífen, espaço e afins são ignorados */
    }
    return partes.join(' ');
  }

  function simNao(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  /* Monta a frase da chamada a partir dos mesmos campos que
     aparecem no telão. */
  function textoDaChamada(chamada) {
    if (!chamada) return '';

    var tipo = chamada.tipo_chamada || 'triagem';
    var senha = senhaFalada(chamada.senha);
    var frase;

    if (tipo === 'consulta') {
      /* Chamada pelo nome (é o que já aparece na tela) */
      var nome = simNao(chamada.nome_chamado || chamada.nome_paciente);
      var consultorio = simNao(chamada.consultorio);
      var medico = simNao(chamada.medico_nome);

      frase = nome ? 'Paciente ' + nome + '.' : 'Paciente.';
      frase += consultorio
        ? ' Dirija-se ao consultório ' + consultorio + '.'
        : ' Dirija-se ao consultório indicado.';
      if (medico) frase += ' Com ' + medico + '.';
      if (senha) frase += ' Senha ' + senha + '.';
      return frase;
    }

    /* Triagem: chamada pelo código + guichê (sem nome, por privacidade) */
    frase = senha ? 'Senha ' + senha + '.' : 'Chamada para a triagem.';
    frase += ' Dirija-se à triagem';
    var guiche = simNao(chamada.guiche);
    if (guiche) frase += ', guichê ' + guiche;
    frase += '.';
    return frase;
  }

  /* ---------- Escolha da voz ---------- */

  /* Pontua as vozes disponíveis e fica com a melhor pt-BR.
     Vozes locais (localService) valem mais: funcionam sem internet. */
  function escolherVoz() {
    if (vozEscolhida) return vozEscolhida;
    if (!suportaVoz()) return null;

    var vozes = window.speechSynthesis.getVoices() || [];
    if (!vozes.length) return null; /* lista ainda vazia: tenta de novo depois */

    var alvo = String(cfg().idioma).toLowerCase().replace('_', '-');
    var base = alvo.split('-')[0];
    var melhor = null;
    var melhorPonto = -1;

    for (var i = 0; i < vozes.length; i++) {
      var v = vozes[i];
      var lang = String(v.lang || '').toLowerCase().replace('_', '-');
      var ponto;

      if (lang === alvo) ponto = 100;
      else if (lang.indexOf(base + '-') === 0 || lang === base) ponto = 60;
      else if (lang.indexOf(base) === 0) ponto = 40;
      else continue;

      if (v.localService) ponto += 10;
      /* nomes comuns de vozes pt-BR de boa qualidade */
      if (/luciana|francisca|fernanda|maria|joana|google/i.test(v.name || '')) ponto += 5;

      if (ponto > melhorPonto) { melhorPonto = ponto; melhor = v; }
    }

    vozEscolhida = melhor;
    return vozEscolhida;
  }

  /* ---------- Fala ---------- */

  function limparTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
  }

  /* Interrompe qualquer fala/repetição em andamento */
  function parar() {
    geracao++;
    limparTimers();
    if (suportaVoz()) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignora */ }
    }
  }

  function falarUmaVez(texto, aoTerminar, tentativa) {
    var c = cfg();
    var n = tentativa || 1;
    var utter = new window.SpeechSynthesisUtterance(texto);
    var voz = escolherVoz();
    var iniciou = false;

    if (voz) utter.voice = voz;
    utter.lang = c.idioma;
    utter.volume = c.volume;
    utter.rate = c.velocidade;
    utter.pitch = 1;

    utter.onstart = function () { iniciou = true; };

    utter.onend = function () {
      if (aoTerminar) aoTerminar();
    };

    utter.onerror = function (ev) {
      /* Mantém o erro visível no console — antes ele era engolido
         e não havia como saber por que o telão ficou mudo. */
      console.warn('[Telão] Voz não falou:', (ev && (ev.error || ev.message)) || 'erro desconhecido');
    };

    /* O Chrome às vezes "engole" a primeira fala, principalmente
       logo após um cancel() ou quando a voz ainda está carregando.
       Se em 2,5s nada começou e o motor está ocioso, tenta 1 vez. */
    timers.push(setTimeout(function () {
      if (iniciou) return;
      try {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) return;
      } catch (e) { return; }

      if (n >= 2) { if (aoTerminar) aoTerminar(); return; }
      falarUmaVez(texto, aoTerminar, n + 1);
    }, 2500));

    try {
      if (typeof window.speechSynthesis.resume === 'function') {
        window.speechSynthesis.resume();   /* destrava o motor parado */
      }
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn('[Telão] Falha ao acionar a síntese de voz:', e && e.message);
      if (aoTerminar) aoTerminar();
    }
  }

  /* Fala a chamada respeitando repetições e pausas. Uma chamada
     nova cancela a anterior (nunca falam juntas). */
  function falarChamada(chamada) {
    var c = cfg();
    if (!c.ativa) return false;

    if (!suportaVoz()) {
      console.warn('[Telão] Este navegador não tem síntese de voz (speechSynthesis).');
      return false;
    }

    var texto = textoDaChamada(chamada);
    if (!texto) return false;

    parar();                    /* cancela fala/repetições anteriores */
    var meuTurno = geracao;     /* geracao já foi incrementada em parar() */

    function falarRodada(restantes) {
      if (meuTurno !== geracao) return; /* outra chamada chegou: abandona */

      falarUmaVez(texto, function () {
        if (meuTurno !== geracao) return;
        if (restantes > 1) {
          timers.push(setTimeout(function () {
            falarRodada(restantes - 1);
          }, c.intervalo));
        }
      });
    }

    /* Espera o bip da chamada terminar antes de falar */
    timers.push(setTimeout(function () {
      if (meuTurno !== geracao) return;
      falarRodada(c.repeticoes);
    }, c.aposSom));

    return true;
  }

  /* Libera áudio/voz no primeiro gesto do usuário (política de
     autoplay dos navegadores). Chamado uma única vez. */
  function desbloquear() {
    if (!suportaVoz()) return;
    try {
      var utter = new window.SpeechSynthesisUtterance(' ');
      utter.volume = 0;
      window.speechSynthesis.speak(utter);
    } catch (e) { /* ignora */ }
  }

  function iniciarDesbloqueio() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    function aoInteragir() {
      desbloquear();
      document.removeEventListener('pointerdown', aoInteragir);
      document.removeEventListener('touchstart', aoInteragir);
      document.removeEventListener('keydown', aoInteragir);
    }

    document.addEventListener('pointerdown', aoInteragir);
    document.addEventListener('touchstart', aoInteragir);
    document.addEventListener('keydown', aoInteragir);
  }

  /* A lista de vozes costuma vir vazia na primeira consulta;
     este evento avisa quando ela está pronta. */
  function iniciarVozes() {
    if (!suportaVoz()) return;

    function recarregar() {
      vozEscolhida = null;
      escolherVoz();
    }

    try {
      if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', recarregar);
      } else {
        window.speechSynthesis.onvoiceschanged = recarregar;
      }
    } catch (e) { /* ignora */ }

    recarregar();
  }

  if (typeof window !== 'undefined') {
    iniciarVozes();
    iniciarDesbloqueio();
  }

  return {
    falarChamada: falarChamada,
    parar: parar,
    textoDaChamada: textoDaChamada,
    senhaFalada: senhaFalada,
    suportaVoz: suportaVoz,
    desbloquear: desbloquear
  };
})();
