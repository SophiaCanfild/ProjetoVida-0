/* ============================================================
   VIDA+ TELÃO — Orientação hospitalar e cálculo de rotas
   ------------------------------------------------------------
   O mapa é um grafo configurável. A chamada informa apenas o
   destino (triagem/consultório); este módulo encontra o caminho,
   prioriza acessibilidade e desenha o esquema sem bibliotecas.
   ============================================================ */
var OrientacaoHospitalTV = (function () {
  'use strict';

  var ultimaChave = null;
  var mapaPublicado = null;

  function unidadeAtual() {
    if (typeof TV_CONFIG !== 'undefined' && TV_CONFIG.UNIDADE) {
      return TV_CONFIG.UNIDADE;
    }
    if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.UNIDADES) {
      return APP_CONFIG.UNIDADES[0];
    }
    return '';
  }

  function obterMapa(unidade) {
    if (mapaPublicado) return mapaPublicado;
    if (typeof MAPAS_HOSPITAL === 'undefined' || !MAPAS_HOSPITAL.unidades) {
      return null;
    }
    return MAPAS_HOSPITAL.unidades[unidade || unidadeAtual()] || null;
  }

  // O telão injeta aqui a versão publicada pelo Administrativo.
  // Passar null remove a injeção e restaura o mapa demonstrativo.
  function definirMapa(mapa) {
    if (mapa && !validarMapa(mapa)) {
      mapaPublicado = null;
      ultimaChave = null;
      return false;
    }
    mapaPublicado = mapa || null;
    ultimaChave = null;
    return !!mapaPublicado;
  }

  function indiceDeNos(mapa) {
    var indice = Object.create(null);
    (mapa && mapa.nos || []).forEach(function (no) {
      if (no && no.id) indice[no.id] = no;
    });
    return indice;
  }

  function validarMapa(mapa) {
    if (!mapa || !mapa.ponto_inicial || !Array.isArray(mapa.nos) ||
        !Array.isArray(mapa.ligacoes) || !mapa.destinos) {
      return false;
    }

    var indice = indiceDeNos(mapa);
    if (!indice[mapa.ponto_inicial]) return false;
    if (Object.keys(indice).length !== mapa.nos.length) return false;

    return mapa.ligacoes.every(function (ligacao) {
      return ligacao && indice[ligacao.de] && indice[ligacao.para];
    });
  }

  function resolverDestinoId(mapa, chamada) {
    var indice = indiceDeNos(mapa);
    if (chamada.destino_id && indice[chamada.destino_id]) {
      return chamada.destino_id;
    }

    if ((chamada.tipo_chamada || 'triagem') === 'consulta') {
      var consultorio = String(chamada.consultorio || '').trim();
      return mapa.destinos.consultorios &&
        mapa.destinos.consultorios[consultorio] || null;
    }

    if (chamada.guiche && mapa.destinos.guiches &&
        mapa.destinos.guiches[String(chamada.guiche)]) {
      return mapa.destinos.guiches[String(chamada.guiche)];
    }
    return mapa.destinos.triagem || null;
  }

  /* Dijkstra com pesos positivos. Em plantas hospitalares pequenas,
     esta implementação simples é suficiente e fácil de auditar. */
  function menorCaminho(mapa, destinoId, somenteAcessiveis) {
    var inicio = mapa.ponto_inicial;
    var indice = indiceDeNos(mapa);
    if (!indice[destinoId]) return null;
    if (inicio === destinoId) return { ids: [inicio], ligacoes: [] };

    var adjacentes = Object.create(null);
    mapa.ligacoes.forEach(function (ligacao) {
      if (somenteAcessiveis && ligacao.acessivel === false) return;
      if (!adjacentes[ligacao.de]) adjacentes[ligacao.de] = [];
      adjacentes[ligacao.de].push(ligacao);
    });

    var distancia = Object.create(null);
    var anterior = Object.create(null);
    var visitados = Object.create(null);
    mapa.nos.forEach(function (no) { distancia[no.id] = Infinity; });
    distancia[inicio] = 0;

    while (true) {
      var atual = null;
      var menor = Infinity;
      mapa.nos.forEach(function (no) {
        if (!visitados[no.id] && distancia[no.id] < menor) {
          atual = no.id;
          menor = distancia[no.id];
        }
      });

      if (atual === null) return null;
      if (atual === destinoId) break;
      visitados[atual] = true;

      (adjacentes[atual] || []).forEach(function (ligacao) {
        var peso = Number(ligacao.peso);
        if (!isFinite(peso) || peso <= 0) peso = 1;
        var alternativa = distancia[atual] + peso;
        if (alternativa < distancia[ligacao.para]) {
          distancia[ligacao.para] = alternativa;
          anterior[ligacao.para] = { de: atual, ligacao: ligacao };
        }
      });
    }

    var ids = [destinoId];
    var ligacoes = [];
    var cursor = destinoId;
    while (cursor !== inicio) {
      var passo = anterior[cursor];
      if (!passo) return null;
      ligacoes.unshift(passo.ligacao);
      ids.unshift(passo.de);
      cursor = passo.de;
    }
    return { ids: ids, ligacoes: ligacoes };
  }

  function calcularRota(chamada, mapaFornecido) {
    if (!chamada) return null;
    var mapa = mapaFornecido || obterMapa();
    if (!validarMapa(mapa)) return null;

    var destinoId = resolverDestinoId(mapa, chamada);
    if (!destinoId) return null;

    // Primeiro tenta uma rota totalmente acessível; se não existir,
    // usa a melhor rota disponível e informa que há obstáculos.
    var caminho = menorCaminho(mapa, destinoId, true) ||
      menorCaminho(mapa, destinoId, false);
    if (!caminho) return null;

    var indice = indiceDeNos(mapa);
    var destino = indice[destinoId];
    var instrucoes = caminho.ligacoes.map(function (ligacao) {
      return String(ligacao.instrucao || '').trim();
    }).filter(Boolean);

    var temTodosOsTempos = caminho.ligacoes.length > 0 &&
      caminho.ligacoes.every(function (ligacao) {
        return Number(ligacao.tempo) > 0;
      });
    var segundos = temTodosOsTempos
      ? caminho.ligacoes.reduce(function (total, ligacao) {
          return total + Number(ligacao.tempo);
        }, 0)
      : 0;

    var local = [destino.bloco, destino.andar].filter(Boolean).join(' • ');
    var localVoz = [destino.bloco, destino.andar].filter(Boolean).join(', ');
    var textoVoz = '';
    if (mapa.configurado === true) {
      var partesVoz = instrucoes.slice(0, 2);
      if (instrucoes.length > 2) {
        partesVoz.push('Depois, siga as placas para ' + destino.nome + '.');
      }
      textoVoz = (localVoz ? 'Destino: ' + localVoz + '. ' : '') +
        partesVoz.join(' ');
    }

    return {
      mapa: mapa,
      configurado: mapa.configurado === true,
      destinoId: destinoId,
      destino: destino,
      nos: caminho.ids.map(function (id) { return indice[id]; }),
      ligacoes: caminho.ligacoes,
      instrucoes: instrucoes,
      local: local,
      acessivel: caminho.ligacoes.every(function (ligacao) {
        return ligacao.acessivel !== false;
      }),
      minutos: segundos ? Math.max(1, Math.ceil(segundos / 60)) : null,
      textoVoz: textoVoz.trim()
    };
  }

  function prepararChamadaParaVoz(chamada) {
    if (!chamada) return chamada;
    var copia = Object.assign({}, chamada);
    var rota = calcularRota(chamada);
    if (rota && rota.configurado && rota.textoVoz) {
      copia.orientacao_voz = rota.textoVoz;
    }
    return copia;
  }

  function escapar(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (caractere) {
      return {
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;'
      }[caractere];
    });
  }

  function numero(valor) {
    var convertido = Number(valor);
    return isFinite(convertido) ? convertido : 0;
  }

  function renderizarSvg(rota) {
    var mapa = rota.mapa;
    var indice = indiceDeNos(mapa);
    var areas = (mapa.areas || []).map(function (area) {
      return '<g class="mapa-area ' + escapar(area.tipo || '') + '">' +
        '<rect x="' + numero(area.x) + '" y="' + numero(area.y) + '" width="' + numero(area.largura) +
        '" height="' + numero(area.altura) + '" rx="16"></rect>' +
        '<text x="' + (numero(area.x) + 12) + '" y="' + (numero(area.y) + 19) + '">' +
        escapar(area.nome) + '</text></g>';
    }).join('');

    function desenharLigacao(ligacao, ativa) {
      var de = indice[ligacao.de];
      var para = indice[ligacao.para];
      if (!de || !para) return '';
      var classes = 'mapa-ligacao' + (ativa ? ' ativa' : '') +
        (ligacao.acessivel === false ? ' com-obstaculo' : '');
      return '<line class="' + classes + '" data-de="' + escapar(ligacao.de) +
        '" data-para="' + escapar(ligacao.para) + '" x1="' + numero(de.x) +
        '" y1="' + numero(de.y) + '" x2="' + numero(para.x) + '" y2="' + numero(para.y) + '"' +
        (ativa ? ' marker-end="url(#seta-rota)"' : '') + '></line>';
    }

    var base = mapa.ligacoes.filter(function (ligacao) {
      return rota.ligacoes.indexOf(ligacao) === -1;
    }).map(function (ligacao) { return desenharLigacao(ligacao, false); }).join('');
    var ativas = rota.ligacoes.map(function (ligacao) {
      return desenharLigacao(ligacao, true);
    }).join('');

    var nos = mapa.nos.map(function (no) {
      var classes = 'mapa-no tipo-' + escapar(no.tipo || 'local') +
        (no.id === mapa.ponto_inicial ? ' inicio' : '') +
        (no.id === rota.destinoId ? ' destino' : '');
      return '<g class="' + classes + '" data-no-id="' + escapar(no.id) + '">' +
        '<circle cx="' + numero(no.x) + '" cy="' + numero(no.y) + '" r="' +
        (no.id === rota.destinoId ? 12 : 9) + '"></circle>' +
        '<text x="' + numero(no.x) + '" y="' + (numero(no.y) + 25) + '">' +
        escapar(no.nome) + '</text></g>';
    }).join('');

    return '<svg viewBox="0 0 640 330" preserveAspectRatio="xMidYMid meet" role="img" ' +
      'aria-label="Rota da recepção até ' + escapar(rota.destino.nome) + '">' +
      '<defs><marker id="seta-rota" viewBox="0 0 10 10" refX="8" refY="5" ' +
      'markerWidth="5" markerHeight="5" orient="auto-start-reverse">' +
      '<path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>' +
      areas + base + ativas + nos + '</svg>';
  }

  function instrucoesResumidas(rota) {
    if (rota.instrucoes.length <= 4) return rota.instrucoes;
    return rota.instrucoes.slice(0, 3).concat([
      rota.instrucoes[rota.instrucoes.length - 1]
    ]);
  }

  function atualizar(chamada) {
    if (typeof document === 'undefined') return;
    var chave = chamada
      ? [unidadeAtual(), chamada.id, chamada.chamado_em, chamada.tipo_chamada,
         chamada.consultorio, chamada.guiche].join(':')
      : 'sem-chamada:' + unidadeAtual();
    if (chave === ultimaChave) return;
    ultimaChave = chave;

    function el(id) { return document.getElementById(id); }
    var aviso = el('aviso-atual');
    var painelRota = el('orientacao-rota');
    if (!aviso || !painelRota) return;

    var titulo = el('painel-orientacao-titulo');
    var localDestaque = el('chamada-destino-local');

    if (!chamada) {
      painelRota.hidden = true;
      aviso.hidden = false;
      if (titulo) titulo.textContent = '💬 Avisos';
      if (localDestaque) localDestaque.textContent = '';
      return;
    }

    aviso.hidden = true;
    painelRota.hidden = false;
    if (titulo) titulo.textContent = '🧭 Como chegar';

    var rota = calcularRota(chamada);
    var nomeDestino = (chamada.tipo_chamada || 'triagem') === 'consulta'
      ? 'Consultório ' + (chamada.consultorio || 'indicado')
      : 'Triagem';
    if (rota) nomeDestino = rota.destino.nome;

    el('rota-destino').textContent = nomeDestino;
    el('rota-local').textContent = rota
      ? (rota.local || 'Local indicado no mapa') + (rota.configurado ? '' : ' • exemplo')
      : 'Destino ainda não mapeado';
    if (localDestaque) {
      localDestaque.textContent = rota
        ? (rota.local || '') + (rota.configurado ? '' : ' • exemplo')
        : '';
    }

    var tempo = el('rota-tempo');
    tempo.hidden = !(rota && rota.configurado && rota.minutos);
    if (rota && rota.minutos) tempo.textContent = '≈ ' + rota.minutos + ' min';

    var acessibilidade = el('rota-acessibilidade');
    acessibilidade.hidden = !rota;
    if (rota) {
      acessibilidade.textContent = rota.acessivel ? 'Rota acessível' : 'Rota com obstáculos';
      acessibilidade.classList.toggle('com-obstaculos', !rota.acessivel);
    }

    el('mapa-aviso-config').hidden = !rota || rota.configurado;
    el('rota-sem-mapa').hidden = !!rota;
    el('mapa-hospital').hidden = !rota;
    el('rota-passos').hidden = !rota;

    if (rota) {
      el('mapa-hospital').innerHTML = renderizarSvg(rota);
      var lista = el('rota-passos');
      lista.innerHTML = '';
      instrucoesResumidas(rota).forEach(function (instrucao) {
        var item = document.createElement('li');
        item.textContent = instrucao;
        lista.appendChild(item);
      });
    } else {
      el('mapa-hospital').innerHTML = '';
      el('rota-passos').innerHTML = '';
      el('rota-sem-mapa').textContent =
        'A rota para este destino ainda não foi configurada. Por favor, procure a recepção.';
    }
  }

  return {
    obterMapa: obterMapa,
    definirMapa: definirMapa,
    validarMapa: validarMapa,
    calcularRota: calcularRota,
    renderizarSvg: renderizarSvg,
    prepararChamadaParaVoz: prepararChamadaParaVoz,
    atualizar: atualizar
  };
})();
