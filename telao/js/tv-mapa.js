/* VIDA+ — resolução de destino e orientação do telão.
 * O modo textual não calcula trajetos. O grafo antigo é preservado somente
 * quando sua versão foi publicada e há um caminho real com coordenadas.
 */
var OrientacaoHospitalTV = (function () {
  'use strict';
  var mapaPublicado = null;
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function escapar(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function obterMapa() { return mapaPublicado; }
  function indiceDeNos(mapa) {
    var indice = Object.create(null);
    (mapa && mapa.nos || []).forEach(function (n) { if (n && n.id) indice[n.id] = n; });
    return indice;
  }
  function validarMapa(mapa) {
    if (!mapa || !Array.isArray(mapa.nos) || !mapa.destinos || typeof mapa.destinos !== 'object') return false;
    var indice = indiceDeNos(mapa);
    return Object.keys(indice).length === mapa.nos.length;
  }
  function definirMapa(mapa) {
    mapaPublicado = mapa && validarMapa(mapa) ? mapa : null;
    return !!mapaPublicado;
  }
  function resolverDestinoId(mapa, chamada) {
    if (!mapa || !chamada) return null;
    var indice = indiceDeNos(mapa), destinos = mapa.destinos || {};
    if (chamada.destino_id && indice[chamada.destino_id]) return chamada.destino_id;
    if ((chamada.tipo_chamada || 'triagem') === 'consulta') {
      var chave = texto(chamada.consultorio);
      var id = (destinos.consultorios || {})[chave];
      return id && indice[id] ? id : null;
    }
    var guiche = texto(chamada.guiche);
    var idGuiche = guiche && (destinos.guiches || {})[guiche];
    if (idGuiche) return indice[idGuiche] ? idGuiche : null;
    return destinos.triagem && indice[destinos.triagem] ? destinos.triagem : null;
  }
  function coordenadasValidas(no) {
    return no && no.x !== null && no.x !== undefined && no.x !== '' &&
      no.y !== null && no.y !== undefined && no.y !== '' &&
      Number.isFinite(Number(no.x)) && Number.isFinite(Number(no.y)) &&
      Number(no.x) >= 15 && Number(no.x) <= 625 && Number(no.y) >= 25 && Number(no.y) <= 305;
  }
  function menorCaminho(mapa, inicio, destinoId, somenteAcessiveis) {
    var indice = indiceDeNos(mapa);
    if (!indice[inicio] || !indice[destinoId]) return null;
    if (inicio === destinoId) return null; // um ponto isolado não é um percurso
    var adj = Object.create(null);
    (Array.isArray(mapa.ligacoes) ? mapa.ligacoes : []).forEach(function (l) {
      if (!l || !indice[l.de] || !indice[l.para] || !coordenadasValidas(indice[l.de]) || !coordenadasValidas(indice[l.para]) || l.de === l.para ||
          !(Number(l.peso) > 0) || !texto(l.instrucao)) return;
      if (somenteAcessiveis && l.acessivel !== true) return;
      (adj[l.de] || (adj[l.de] = [])).push(l);
    });
    var dist = Object.create(null), anterior = Object.create(null), visitados = Object.create(null);
    mapa.nos.forEach(function (n) { if (n && n.id) dist[n.id] = Infinity; });
    dist[inicio] = 0;
    while (true) {
      var atual = null, menor = Infinity;
      mapa.nos.forEach(function (n) {
        if (n && !visitados[n.id] && dist[n.id] < menor) { atual = n.id; menor = dist[n.id]; }
      });
      if (atual === null) return null;
      if (atual === destinoId) break;
      visitados[atual] = true;
      (adj[atual] || []).forEach(function (l) {
        var alternativa = dist[atual] + Number(l.peso);
        if (alternativa < dist[l.para]) { dist[l.para] = alternativa; anterior[l.para] = { de: atual, ligacao: l }; }
      });
    }
    var ids = [destinoId], ligacoes = [], cursor = destinoId;
    while (cursor !== inicio) {
      var passo = anterior[cursor];
      if (!passo) return null;
      ligacoes.unshift(passo.ligacao); ids.unshift(passo.de); cursor = passo.de;
    }
    return { ids: ids, ligacoes: ligacoes };
  }
  function calcularCaminhoGrafico(mapa, destinoId, inicio) {
    if (!validarMapa(mapa)) return null;
    var origem = inicio || mapa.ponto_inicial;
    var caminho = menorCaminho(mapa, origem, destinoId, true) || menorCaminho(mapa, origem, destinoId, false);
    var indice = indiceDeNos(mapa);
    return caminho && caminho.ids.every(function (id) { return coordenadasValidas(indice[id]); }) ? caminho : null;
  }
  function passos(textoBruto) {
    if (typeof RotasUnidade !== 'undefined') return RotasUnidade.passos(textoBruto);
    return texto(textoBruto) ? [texto(textoBruto)] : [];
  }
  function formatarLocalizacao(no) {
    if (typeof RotasUnidade !== 'undefined') return RotasUnidade.localizacao(no);
    return [texto(no && no.bloco), texto(no && no.andar)].filter(Boolean).join(' — ');
  }
  function resumirAcessibilidade(a) {
    if (!a || typeof a !== 'object') return null;
    var partes = [];
    if (a.possui_escadas === 'sim' || a.possui_escadas === true) partes.push('Há escadas no percurso.');
    if (a.alternativa_sem_escadas === 'sim' || a.alternativa_sem_escadas === true) partes.push('Há alternativa sem escadas, conforme informado pela unidade.');
    else if (a.alternativa_sem_escadas === 'nao' || a.alternativa_sem_escadas === false) partes.push('Não há alternativa sem escadas informada.');
    if (a.elevador_acessivel === 'sim' || a.elevador_acessivel === true) partes.push('Elevador acessível informado.');
    var perfisTexto = { cadeirante: 'pessoas em cadeira de rodas', mobilidade_reduzida: 'pessoas com mobilidade reduzida',
      maca: 'transporte em maca', deficiencia_visual: 'pessoas com deficiência visual', outro: 'outros perfis' };
    var perfis = (Array.isArray(a.perfis_restritos) ? a.perfis_restritos : []).map(function (p) { return perfisTexto[p] || texto(p); }).filter(Boolean);
    if (perfis.length) partes.push('Restrição informada para: ' + perfis.join(', ') + '.');
    else if (a.restricoes_conhecidas === 'possui') partes.push('Há restrições conhecidas; consulte a equipe.');
    if (texto(a.restricoes_detalhes)) partes.push(texto(a.restricoes_detalhes));
    if (texto(a.observacoes)) partes.push(texto(a.observacoes));
    if (!partes.length) return null;
    return { rotulo: 'Acessibilidade informada pela unidade', observacao: partes.join(' '),
      possuiRestricao: perfis.length > 0 || a.restricoes_conhecidas === 'possui' ||
        a.possui_escadas === 'sim' && a.alternativa_sem_escadas === 'nao' };
  }
  function calcularRota(chamada, mapaFornecido) {
    var mapa = mapaFornecido || obterMapa();
    if (!chamada || !validarMapa(mapa)) return null;
    var destinoId = resolverDestinoId(mapa, chamada);
    if (!destinoId) return null;
    var indice = indiceDeNos(mapa), destino = indice[destinoId];
    var o = mapa.orientacoes && mapa.orientacoes[destinoId];
    var textoOrientacao = o ? [texto(o.texto_orientacao || o.texto), texto(o.complemento_especifico)].filter(Boolean).join('\n') : '';
    var instrucoes = passos(textoOrientacao);
    if (!instrucoes.length && o && Array.isArray(o.passos)) instrucoes = o.passos.map(texto).filter(Boolean);
    var inicio = o && o.ponto_inicial_id || mapa.ponto_inicial;
    var caminho = calcularCaminhoGrafico(mapa, destinoId, inicio);
    var legado = !Object.prototype.hasOwnProperty.call(mapa, 'orientacoes') && mapa.modo_simplificado !== true;
    /* Versões publicadas do editor anterior podem continuar usando o grafo;
       não se usa um grafo antigo para inventar uma orientação no novo modo. */
    if (!instrucoes.length && legado && caminho) instrucoes = caminho.ligacoes.map(function (l) { return texto(l.instrucao); });
    var info = o ? resumirAcessibilidade(o.acessibilidade) : null;
    if (!info && legado && caminho && caminho.ligacoes.some(function (l) { return l.acessivel === false; })) {
      info = { rotulo: 'Percurso com obstáculos informados', observacao: 'Consulte a equipe para obter auxílio.', possuiRestricao: true };
    }
    var usarGrafico = !!caminho && ((legado && mapa.usar_mapa_grafico !== false) || (mapa.usar_mapa_grafico === true && !!mapa.grafico_validado_em));
    var segundos = legado && caminho && caminho.ligacoes.every(function (l) { return Number(l.tempo) > 0; })
      ? caminho.ligacoes.reduce(function (s, l) { return s + Number(l.tempo); }, 0) : 0;
    var local = formatarLocalizacao(destino);
    return {
      mapa: mapa, configurado: mapa.configurado === true, temOrientacao: instrucoes.length > 0,
      usarMapaGrafico: usarGrafico, destinoId: destinoId, destino: destino, orientacao: o || null,
      nos: caminho ? caminho.ids.map(function (id) { return indice[id]; }) : [destino],
      ligacoes: caminho ? caminho.ligacoes : [], instrucoes: instrucoes, local: local,
      acessibilidadeInfo: info, acessivel: info ? !info.possuiRestricao : null,
      minutos: segundos ? Math.max(1, Math.ceil(segundos / 60)) : null,
      textoVoz: instrucoes.join(' ')
    };
  }
  function prepararChamadaParaVoz(chamada) {
    if (!chamada) return chamada;
    var copia = Object.assign({}, chamada), rota = calcularRota(chamada);
    if (rota && rota.configurado) {
      copia.destino_nome = rota.destino.nome;
      if (rota.temOrientacao) copia.orientacao_voz = rota.textoVoz;
    }
    return copia;
  }
  function numero(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function renderizarSvg(rota) {
    var mapa = rota.mapa, indice = indiceDeNos(mapa), ativas = rota.ligacoes || [];
    var areas = (mapa.areas || []).map(function (a) {
      return '<g class="mapa-area ' + escapar(a.tipo || '') + '"><rect x="' + numero(a.x) + '" y="' + numero(a.y) +
        '" width="' + numero(a.largura) + '" height="' + numero(a.altura) + '" rx="16"></rect><text x="' +
        (numero(a.x) + 12) + '" y="' + (numero(a.y) + 19) + '">' + escapar(a.nome) + '</text></g>';
    }).join('');
    function desenharLigacao(l, ativa) {
      var de = indice[l.de], para = indice[l.para];
      if (!coordenadasValidas(de) || !coordenadasValidas(para)) return '';
      var classes = 'mapa-ligacao' + (ativa ? ' ativa' : '') + (l.acessivel === false ? ' com-obstaculo' : '');
      return '<line class="' + classes + '" data-de="' + escapar(l.de) + '" data-para="' + escapar(l.para) +
        '" x1="' + numero(de.x) + '" y1="' + numero(de.y) + '" x2="' + numero(para.x) + '" y2="' + numero(para.y) + '"' +
        (ativa ? ' marker-end="url(#seta-rota)"' : '') + '></line>';
    }
    var linhas = (mapa.ligacoes || []).map(function (l) { return desenharLigacao(l, ativas.indexOf(l) !== -1); }).join('');
    var nos = mapa.nos.filter(coordenadasValidas).map(function (n) {
      return '<g class="mapa-no tipo-' + escapar(n.tipo || 'local') + (n.id === mapa.ponto_inicial ? ' inicio' : '') +
        (n.id === rota.destinoId ? ' destino' : '') + '" data-no-id="' + escapar(n.id) + '"><circle cx="' + numero(n.x) +
        '" cy="' + numero(n.y) + '" r="' + (n.id === rota.destinoId ? 12 : 9) + '"></circle><text x="' + numero(n.x) +
        '" y="' + (numero(n.y) + 25) + '">' + escapar(n.nome) + '</text></g>';
    }).join('');
    return '<svg viewBox="0 0 640 330" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Planta esquemática para ' +
      escapar(rota.destino && rota.destino.nome || 'a unidade') + '"><defs><marker id="seta-rota" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>' + areas + linhas + nos + '</svg>';
  }
  function nomeDestino(chamada, mapa) {
    var rota = calcularRota(chamada, mapa);
    if (rota && rota.configurado && rota.destino) return texto(rota.destino.nome);
    if ((chamada.tipo_chamada || 'triagem') === 'consulta') {
      var sala = texto(chamada.consultorio);
      return sala && !/^(?:local_|loc_)/.test(sala) ? 'Consultório ' + sala : 'Consultório indicado';
    }
    return chamada.guiche ? 'Triagem — guichê ' + texto(chamada.guiche) : 'Triagem';
  }
  function atualizar(chamada) {
    if (typeof document === 'undefined') return;
    function el(id) { return document.getElementById(id); }
    var aviso = el('aviso-atual'), painel = el('orientacao-rota');
    if (!aviso || !painel) return;
    if (!chamada) {
      painel.hidden = true; aviso.hidden = false;
      if (el('painel-orientacao-titulo')) el('painel-orientacao-titulo').textContent = '💬 Avisos';
      if (el('chamada-destino-local')) el('chamada-destino-local').textContent = '';
      return;
    }
    aviso.hidden = true; painel.hidden = false;
    if (el('painel-orientacao-titulo')) el('painel-orientacao-titulo').textContent = '🧭 Como chegar';
    var rota = calcularRota(chamada), publicada = !!(rota && rota.configurado), nome = nomeDestino(chamada);
    if (el('chamada-destino-rotulo')) el('chamada-destino-rotulo').textContent = 'Destino';
    if (el('chamada-destino-valor')) el('chamada-destino-valor').textContent = nome;
    if (el('chamada-destino-local')) el('chamada-destino-local').textContent = publicada && rota.local ? rota.local : '';
    el('rota-destino').textContent = nome;
    el('rota-local').textContent = publicada && rota.local ? 'Localização: ' + rota.local : '';
    // O profissional já aparece no destaque; evita repetir dados e reduz o corte das instruções.
    if (el('rota-medico')) el('rota-medico').hidden = true;
    var valida = publicada && rota.temOrientacao;
    var info = valida && rota.acessibilidadeInfo;
    var badge = el('rota-acessibilidade'), obs = el('rota-acessibilidade-obs'), tempo = el('rota-tempo');
    if (badge) { badge.hidden = !info; if (info) { badge.textContent = info.rotulo; badge.classList.toggle('com-obstaculos', info.possuiRestricao); } }
    if (obs) { obs.hidden = !info || !info.observacao; obs.textContent = info ? info.observacao : ''; }
    if (tempo) { tempo.hidden = !(valida && rota.minutos); if (!tempo.hidden) tempo.textContent = '≈ ' + rota.minutos + ' min'; }
    if (el('mapa-aviso-config')) el('mapa-aviso-config').hidden = true;
    var sem = el('rota-sem-mapa'), passosEl = el('rota-passos'), mapaEl = el('mapa-hospital');
    var wrap = el('rota-como-chegar-wrap'), grade = el('mapa-e-passos') || document.querySelector('.mapa-e-passos');
    sem.hidden = valida;
    sem.textContent = valida ? '' : 'Consulte a recepção para obter orientações.';
    if (wrap) wrap.hidden = !valida;
    passosEl.hidden = !valida;
    var chavePassos = valida ? JSON.stringify(rota.instrucoes) : '';
    if (passosEl.dataset.conteudo !== chavePassos) {
      passosEl.innerHTML = '';
      passosEl.dataset.conteudo = chavePassos;
      if (wrap) wrap.scrollTop = 0;
      if (valida) rota.instrucoes.forEach(function (passo) { var li = document.createElement('li'); li.textContent = passo; passosEl.appendChild(li); });
    }
    mapaEl.hidden = !(valida && rota.usarMapaGrafico);
    mapaEl.innerHTML = mapaEl.hidden ? '' : renderizarSvg(rota);
    if (grade) grade.classList.toggle('sem-mapa-grafico', mapaEl.hidden);
  }
  return { obterMapa: obterMapa, definirMapa: definirMapa, validarMapa: validarMapa,
    resolverDestinoId: resolverDestinoId, calcularRota: calcularRota, calcularCaminhoGrafico: calcularCaminhoGrafico,
    coordenadasValidas: coordenadasValidas, formatarLocalizacao: formatarLocalizacao,
    extrairPassosDeTexto: passos, resumirAcessibilidade: resumirAcessibilidade,
    renderizarSvg: renderizarSvg, nomeDestino: nomeDestino, prepararChamadaParaVoz: prepararChamadaParaVoz, atualizar: atualizar };
})();
