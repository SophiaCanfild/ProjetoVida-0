/* ============================================================
   VIDA+ TELÃO — Voz das chamadas (voz-chamada.js)
   ------------------------------------------------------------
   Fala em voz alta cada NOVA senha chamada, usando a Web
   Speech API (speechSynthesis) do próprio navegador:
     - nenhum arquivo de áudio
     - nenhum serviço externo
     - funciona offline (as vozes locais do sistema)

   Tom de "voz de hospital" (anúncio de recepção):
     - preâmbulo "Atenção." antes de cada chamada
     - frases curtas, faladas uma de cada vez, com pausa entre elas
     - ritmo mais lento e tom um pouco mais grave que o padrão

   Frases faladas:
     triagem  → "Atenção. Senha A cento e vinte e três.
                 Dirija-se à triagem, guichê 2."
     consulta → "Atenção. Paciente Maria da Silva.
                 Dirija-se ao consultório 3.
                 Com Dr. Carlos Pereira."

   Configuração em TV_CONFIG (shared/js/config.js):
     VOZ_ATIVA           liga/desliga a voz
     VOZ_IDIOMA          idioma das vozes (padrão 'pt-BR')
     VOZ_REPETICOES      quantas vezes repete cada chamada
     VOZ_INTERVALO_MS    pausa entre as repetições
     VOZ_APOS_SOM_MS     espera o bip terminar antes de falar
     VOZ_VOLUME          0 a 1
     VOZ_VELOCIDADE      0.1 a 10 (padrão 0.88: fala pausada de anúncio)
     VOZ_TONO            0 a 2 (padrão 0.9: um pouco mais grave)
     VOZ_PREAMBULO       texto antes da chamada (padrão 'Atenção';
                         '' ou false desliga)
     VOZ_PAUSA_FRASES_MS pausa entre as partes da frase (padrão 320)
     VOZ_NOME            força uma voz pelo nome; '' = escolhe a melhor
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
      /* 0.88 = ritmo de anúncio de recepção; 1 seria a fala corrida do padrão */
      velocidade: c.VOZ_VELOCIDADE != null ? Math.min(10, Math.max(0.1, c.VOZ_VELOCIDADE)) : 0.88,
      /* tom levemente grave deixa a voz menos "de GPS" e mais de hospital */
      tono: c.VOZ_TONO != null ? Math.min(2, Math.max(0, c.VOZ_TONO)) : 0.9,
      preambulo: (function () {
        if (c.VOZ_PREAMBULO === false || c.VOZ_PREAMBULO === '') return '';
        if (typeof c.VOZ_PREAMBULO === 'string') return c.VOZ_PREAMBULO.trim();
        return 'Atenção';
      })(),
      pausaFrases: c.VOZ_PAUSA_FRASES_MS != null ? Math.max(0, c.VOZ_PAUSA_FRASES_MS) : 320,
      nomeVoz: typeof c.VOZ_NOME === 'string' ? c.VOZ_NOME.trim() : '',
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

  /* Monta as PARTES da chamada, a partir dos mesmos campos que
     aparecem no telão.

     Cada parte vira uma fala separada, com uma pausa curta entre
     elas — é o que dá o ritmo de anúncio de recepção, em vez de
     uma frase corrida. O preâmbulo ("Atenção") entra depois. */
  function partesDaChamada(chamada) {
    if (!chamada) return [];

    var tipo = chamada.tipo_chamada || 'triagem';
    var senha = senhaFalada(chamada.senha);
    var partes = [];

    if (tipo === 'consulta') {
      /* Chamada pelo nome (é o que já aparece na tela) */
      var nome = simNao(chamada.nome_chamado || chamada.nome_paciente);
      var consultorio = simNao(chamada.consultorio);
      var medico = simNao(chamada.medico_nome);

      partes.push(nome ? 'Paciente ' + nome + '.' : 'Próximo paciente.');
      partes.push(consultorio
        ? 'Dirija-se ao consultório ' + consultorio + '.'
        : 'Dirija-se ao consultório indicado.');
      if (medico) partes.push('Com ' + medico + '.');
      return partes;
    }

    /* Triagem: chamada pelo código + guichê (sem nome, por privacidade) */
    partes.push(senha ? 'Senha ' + senha + '.' : 'Chamada para a triagem.');
    var guiche = simNao(chamada.guiche);
    partes.push(guiche
      ? 'Dirija-se à triagem, guichê ' + guiche + '.'
      : 'Dirija-se à triagem.');
    return partes;
  }

  /* Todas as partes, já com o preâmbulo na frente */
  function roteiroDaChamada(chamada) {
    var partes = partesDaChamada(chamada);
    if (!partes.length) return [];

    var preambulo = cfg().preambulo;
    if (preambulo) {
      partes = [preambulo.replace(/\.+$/, '') + '.'].concat(partes);
    }
    return partes;
  }

  /* Frase inteira, numa linha só (usada no log e na página de teste) */
  function textoDaChamada(chamada) {
    return roteiroDaChamada(chamada).join(' ');
  }

  /* ---------- Escolha da voz ---------- */

  /* Vozes que soam como anúncio de recepção/hospital: femininas,
     adultas e bem articuladas. São as pt-BR mais comuns por sistema. */
  var VOZES_DE_ANUNCIO = /luciana|francisca|fernanda|maria|joana|ines|inês|google/i;
  /* Vozes que soam robóticas ou infantis demais para uma chamada */
  var VOZES_EVITAR = /albert|zira|shelley|bells|boing|bad news|good news|jester|organ|superstar|wobble/i;

  /* Pontua as vozes disponíveis e fica com a melhor pt-BR.
     Vozes locais (localService) valem mais: funcionam sem internet.
     VOZ_NOME força uma voz específica pelo nome (busca parcial). */
  function escolherVoz() {
    if (vozEscolhida) return vozEscolhida;
    if (!suportaVoz()) return null;

    var vozes = window.speechSynthesis.getVoices() || [];
    if (!vozes.length) return null; /* lista ainda vazia: tenta de novo depois */

    var c = cfg();

    /* Voz pedida na configuração: usa se existir */
    if (c.nomeVoz) {
      var pedida = String(c.nomeVoz).toLowerCase();
      for (var k = 0; k < vozes.length; k++) {
        if (String(vozes[k].name || '').toLowerCase().indexOf(pedida) !== -1) {
          vozEscolhida = vozes[k];
          return vozEscolhida;
        }
      }
      console.warn('[Telão] VOZ_NOME não encontrada:', c.nomeVoz, '— escolhendo a melhor disponível.');
    }

    var alvo = String(c.idioma).toLowerCase().replace('_', '-');
    var base = alvo.split('-')[0];
    var melhor = null;
    var melhorPonto = -1;

    for (var i = 0; i < vozes.length; i++) {
      var v = vozes[i];
      var lang = String(v.lang || '').toLowerCase().replace('_', '-');
      var nome = v.name || '';
      var ponto;

      if (lang === alvo) ponto = 100;
      else if (lang.indexOf(base + '-') === 0 || lang === base) ponto = 60;
      else if (lang.indexOf(base) === 0) ponto = 40;
      else continue;

      if (v.localService) ponto += 10;
      /* vozes de locução ("Enhanced"/"Premium") soam muito melhores */
      if (/enhanced|premium|neural|natural/i.test(nome)) ponto += 12;
      if (VOZES_DE_ANUNCIO.test(nome)) ponto += 6;
      if (VOZES_EVITAR.test(nome)) ponto -= 15;

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

  /* Fala uma lista de frases em ordem, com uma pausa curta entre elas
     (é isso que faz soar como anúncio, e não como leitura corrida).
     'vivo' devolve false quando outra chamada já tomou o lugar. */
  function falarSequencia(frases, indice, aoTerminar, vivo) {
    if (!frases.length || indice >= frases.length) {
      if (aoTerminar) aoTerminar();
      return;
    }
    if (vivo && !vivo()) return;

    falarUmaVez(frases[indice], function () {
      if (vivo && !vivo()) return;
      if (indice + 1 >= frases.length) {
        if (aoTerminar) aoTerminar();
        return;
      }
      timers.push(setTimeout(function () {
        falarSequencia(frases, indice + 1, aoTerminar, vivo);
      }, cfg().pausaFrases));
    });
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
    utter.pitch = c.tono;

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

    var frases = roteiroDaChamada(chamada);
    if (!frases.length) return false;

    parar();                    /* cancela fala/repetições anteriores */
    var meuTurno = geracao;     /* geracao já foi incrementada em parar() */

    function vivo() { return meuTurno === geracao; }

    function falarRodada(restantes) {
      if (!vivo()) return;      /* outra chamada chegou: abandona */

      falarSequencia(frases, 0, function () {
        if (!vivo()) return;
        if (restantes > 1) {
          timers.push(setTimeout(function () {
            falarRodada(restantes - 1);
          }, c.intervalo));
        }
      }, vivo);
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
    partesDaChamada: partesDaChamada,
    roteiroDaChamada: roteiroDaChamada,
    senhaFalada: senhaFalada,
    suportaVoz: suportaVoz,
    desbloquear: desbloquear
  };
})();
