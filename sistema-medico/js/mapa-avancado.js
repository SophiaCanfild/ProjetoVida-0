/* VIDA+ — editor opcional de planta e grafo.
 * Compartilha o mesmo rascunho da configuração textual, sem gerar caminhos.
 */
var EditorMapaAvancado = (function () {
  'use strict';
  var api = null, selecionado = '', arraste = null, iniciado = false;
  function el(id) { return document.getElementById(id); }
  function mapa() { return api && api.obterMapa(); }
  function clone(v) { return RotasUnidade.clone(v); }
  function txt(v) { return RotasUnidade.texto(v); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nomeNo(id) { var n = RotasUnidade.noPorId(mapa(), id); return n ? n.nome : id || '—'; }
  function opcoes(valor, vazio) {
    return (vazio ? '<option value="">' + esc(vazio) + '</option>' : '') + mapa().nos.map(function (n) {
      return '<option value="' + esc(n.id) + '"' + (n.id === valor ? ' selected' : '') + '>' + esc(n.nome) + '</option>';
    }).join('');
  }
  function desenhar() {
    if (!mapa()) return;
    el('editor-mapa').innerHTML = OrientacaoHospitalTV.renderizarSvg({ mapa: mapa(), destinoId: null, destino: { nome: 'a unidade' }, ligacoes: [] });
    el('editor-mapa').querySelectorAll('[data-no-id]').forEach(function (grupo) {
      var id = grupo.getAttribute('data-no-id');
      grupo.classList.toggle('selecionado', id === selecionado);
      grupo.setAttribute('tabindex', '0'); grupo.setAttribute('role', 'button'); grupo.setAttribute('aria-label', 'Editar ' + nomeNo(id));
      grupo.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || api.ocupado()) return;
        e.preventDefault(); selecionar(id);
        arraste = { id: id, pointerId: e.pointerId, movido: false };
        document.addEventListener('pointermove', mover); document.addEventListener('pointerup', soltar); document.addEventListener('pointercancel', soltar);
      });
      grupo.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selecionar(id); } });
    });
  }
  function proximoId() {
    var n = 1; while (RotasUnidade.noPorId(mapa(), 'ponto_' + n)) n++; return 'ponto_' + n;
  }
  function preencherPonto() {
    if (!mapa()) return;
    var n = RotasUnidade.noPorId(mapa(), selecionado), novo = !n;
    el('selecionar-ponto-avancado').innerHTML = opcoes(selecionado, 'Selecione um local');
    el('ponto-id-original').value = n ? n.id : '';
    el('ponto-id').value = n ? n.id : proximoId();
    el('ponto-nome').value = n ? n.nome || '' : '';
    el('ponto-tipo').value = n && ['local', 'inicio', 'corredor', 'triagem', 'consultorio', 'guiche', 'elevador', 'escada'].indexOf(n.tipo) !== -1 ? n.tipo : 'local';
    el('ponto-bloco').value = n ? n.bloco || '' : '';
    el('ponto-andar').value = n ? n.andar || '' : '';
    el('ponto-x').value = n && n.x != null ? n.x : '';
    el('ponto-y').value = n && n.y != null ? n.y : '';
    el('btn-excluir-ponto').disabled = novo;
    el('btn-ponto-inicial').disabled = novo;
    el('btn-ponto-inicial').textContent = n && n.id === mapa().ponto_inicial ? 'Ponto inicial atual' : 'Definir como início';
  }
  function selecionar(id) { selecionado = id || ''; preencherPonto(); desenhar(); }
  function mover(e) {
    if (!arraste || e.pointerId !== arraste.pointerId) return;
    var svg = el('editor-mapa').querySelector('svg'), no = RotasUnidade.noPorId(mapa(), arraste.id);
    if (!svg || !no) return;
    var rect = svg.getBoundingClientRect();
    var x, y;
    if (svg.createSVGPoint && svg.getScreenCTM()) {
      var ponto = svg.createSVGPoint(); ponto.x = e.clientX; ponto.y = e.clientY;
      var transformado = ponto.matrixTransform(svg.getScreenCTM().inverse()); x = transformado.x; y = transformado.y;
    } else { x = (e.clientX - rect.left) * 640 / rect.width; y = (e.clientY - rect.top) * 330 / rect.height; }
    no.x = Math.max(15, Math.min(625, Math.round(x))); no.y = Math.max(25, Math.min(305, Math.round(y)));
    arraste.movido = true; el('ponto-x').value = no.x; el('ponto-y').value = no.y; desenhar();
  }
  async function soltar(e) {
    if (!arraste || e.pointerId !== arraste.pointerId) return;
    var moveu = arraste.movido; arraste = null;
    document.removeEventListener('pointermove', mover); document.removeEventListener('pointerup', soltar); document.removeEventListener('pointercancel', soltar);
    if (moveu) await api.salvar(clone(mapa()), 'Posição gráfica salva no rascunho.');
  }
  async function salvarPonto(e) {
    e.preventDefault(); if (api.ocupado()) return;
    var original = el('ponto-id-original').value, id = txt(el('ponto-id').value), nome = txt(el('ponto-nome').value);
    var x = Number(el('ponto-x').value), y = Number(el('ponto-y').value);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || !nome) { api.feedback('Informe um nome e identificador técnico válido.', 'danger'); return; }
    if (el('ponto-x').value === '' || el('ponto-y').value === '' || !Number.isFinite(x) || !Number.isFinite(y) || x < 15 || x > 625 || y < 25 || y > 305) {
      api.feedback('Informe coordenadas dentro dos limites da planta.', 'warning'); return;
    }
    var m = clone(mapa()), anterior = RotasUnidade.noPorId(m, original);
    if (m.nos.some(function (n) { return n.id === id && n.id !== original; })) { api.feedback('Este identificador já existe.', 'warning'); return; }
    if (original && original !== id && !api.podeRenomear()) {
      api.feedback('Salve ou cancele as orientações em edição antes de alterar um identificador.', 'warning'); return;
    }
    var tipo = el('ponto-tipo').value;
    if (anterior && anterior.tipo !== tipo && (RotasUnidade.chavesConsultorio(m, original).length || m.destinos.triagem === original)) {
      api.feedback('Para alterar o tipo de um destino já vinculado, use a edição de locais.', 'warning'); return;
    }
    var no = Object.assign({}, anterior || {}, { id: id, nome: nome, tipo: tipo,
      bloco: txt(el('ponto-bloco').value), andar: txt(el('ponto-andar').value), x: Math.round(x), y: Math.round(y) });
    if (!anterior || anterior.tipo !== tipo) {
      no.tipo_exibicao = { inicio: 'recepcao', local: 'outro', guiche: 'outro' }[tipo] || tipo;
      if (no.tipo_exibicao === 'outro') no.tipo_personalizado = tipo === 'guiche' ? 'Guichê' : 'Local / passagem';
      if (!anterior) no.recebe_pacientes = false;
    }
    if (no.bloco) no.sem_bloco = false;
    if (no.andar) no.sem_andar = false;
    if (anterior) {
      m.nos[m.nos.indexOf(anterior)] = no;
      if (original !== id) {
        if (m.ponto_inicial === original) m.ponto_inicial = id;
        m.ligacoes.forEach(function (l) { if (l.de === original) l.de = id; if (l.para === original) l.para = id; });
        if (m.destinos.triagem === original) m.destinos.triagem = id;
        ['consultorios', 'guiches'].forEach(function (g) { Object.keys(m.destinos[g]).forEach(function (k) { if (m.destinos[g][k] === original) m.destinos[g][k] = id; }); });
        if (m.orientacoes[original]) { m.orientacoes[id] = m.orientacoes[original]; m.orientacoes[id].destino_id = id; delete m.orientacoes[original]; }
        Object.keys(m.orientacoes).forEach(function (k) { var o = m.orientacoes[k]; if (o.ponto_inicial_id === original) o.ponto_inicial_id = id; if (o.reutiliza_de === original) o.reutiliza_de = id; });
      }
      if (anterior.nome !== nome || anterior.bloco !== no.bloco || anterior.andar !== no.andar) api.marcarRevisao(m, id);
    } else m.nos.push(no);
    selecionado = id;
    await api.salvar(m, 'Ponto gráfico salvo no rascunho.');
    preencherPonto();
  }
  async function definirInicio() {
    if (!selecionado || api.ocupado()) return;
    var m = clone(mapa()); m.ponto_inicial = selecionado;
    await api.salvar(m, 'Ponto inicial do mapa salvo no rascunho.');
  }
  async function gerarAreas() {
    if (api.ocupado()) return;
    var m = clone(mapa()), grupos = {};
    m.nos.filter(OrientacaoHospitalTV.coordenadasValidas).forEach(function (n) {
      var chave = [n.bloco, n.andar].filter(Boolean).join(' • ') || 'Área da unidade';
      (grupos[chave] || (grupos[chave] = [])).push(n);
    });
    m.areas = Object.keys(grupos).map(function (chave, i) {
      var xs = grupos[chave].map(function (n) { return Number(n.x); }), ys = grupos[chave].map(function (n) { return Number(n.y); });
      var x = Math.max(4, Math.min.apply(null, xs) - 45), y = Math.max(4, Math.min.apply(null, ys) - 45);
      return { id: 'area_' + (i + 1), nome: chave, x: x, y: y,
        largura: Math.min(636 - x, Math.max.apply(null, xs) - Math.min.apply(null, xs) + 90),
        altura: Math.min(326 - y, Math.max.apply(null, ys) - Math.min.apply(null, ys) + 90), tipo: 'acolhimento' };
    });
    await api.salvar(m, 'Áreas gráficas reorganizadas no rascunho.');
  }

  function renderCaminhos() {
    if (!mapa()) return;
    el('total-caminhos').textContent = mapa().ligacoes.length;
    el('lista-caminhos').innerHTML = mapa().ligacoes.length ? mapa().ligacoes.map(function (l, i) {
      var acess = l.acessivel === true ? 'Sim' : l.acessivel === false ? 'Não' : 'Não informado';
      return '<tr><td>' + esc(nomeNo(l.de)) + '</td><td>' + esc(nomeNo(l.para)) + '<small>' + esc(l.instrucao) +
        '</small></td><td>' + esc(l.peso) + '</td><td>' + esc(l.tempo == null ? '—' : l.tempo + ' s') + '</td><td>' + esc(acess) +
        '</td><td><div class="mapa-tabela-acoes"><button type="button" class="btn btn-outline btn-sm" data-editar-ligacao="' + i + '">Editar</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-excluir-ligacao="' + i + '">Excluir</button></div></td></tr>';
    }).join('') : '<tr><td colspan="6" class="mapa-tabela-vazia">Nenhuma ligação configurada. A orientação textual funciona sem ligações.</td></tr>';
  }
  function limparLigacao() {
    el('ligacao-indice').value = ''; el('titulo-form-ligacao').textContent = 'Nova ligação';
    el('ligacao-de').innerHTML = opcoes(mapa().ponto_inicial, 'Selecione a origem');
    el('ligacao-para').innerHTML = opcoes('', 'Selecione o destino');
    el('ligacao-peso').value = '1'; el('ligacao-tempo').value = '30';
    el('ligacao-acessivel').value = 'nao_informado'; el('ligacao-instrucao').value = '';
  }
  function editarLigacao(i) {
    var l = mapa().ligacoes[i]; if (!l) return;
    el('ligacao-indice').value = String(i); el('titulo-form-ligacao').textContent = 'Editar ligação';
    el('ligacao-de').value = l.de; el('ligacao-para').value = l.para;
    el('ligacao-peso').value = l.peso; el('ligacao-tempo').value = l.tempo == null ? '' : l.tempo;
    el('ligacao-acessivel').value = l.acessivel === true ? 'sim' : l.acessivel === false ? 'nao' : 'nao_informado';
    el('ligacao-instrucao').value = l.instrucao || ''; el('ligacao-instrucao').focus();
  }
  async function salvarLigacao(e) {
    e.preventDefault(); if (api.ocupado()) return;
    var de = el('ligacao-de').value, para = el('ligacao-para').value, peso = Number(el('ligacao-peso').value), tempo = Number(el('ligacao-tempo').value), instrucao = txt(el('ligacao-instrucao').value);
    var indice = el('ligacao-indice').value === '' ? -1 : Number(el('ligacao-indice').value);
    if (!de || !para || de === para || !(peso > 0) || el('ligacao-tempo').value === '' || !(tempo >= 0) || !instrucao) {
      api.feedback('Informe origem e destino diferentes, peso positivo, tempo e instrução real do trecho.', 'warning'); return;
    }
    var m = clone(mapa());
    if (m.ligacoes.some(function (l, i) { return i !== indice && l.de === de && l.para === para; })) {
      api.feedback('Já existe uma ligação neste sentido. Edite a ligação existente.', 'warning'); return;
    }
    var acess = el('ligacao-acessivel').value;
    var dados = Object.assign({}, indice >= 0 ? m.ligacoes[indice] : {}, { de: de, para: para, peso: peso, tempo: Math.round(tempo),
      acessivel: acess === 'sim' ? true : acess === 'nao' ? false : null, instrucao: instrucao });
    if (indice >= 0) m.ligacoes[indice] = dados; else m.ligacoes.push(dados);
    if (await api.salvar(m, 'Ligação salva no rascunho.')) limparLigacao();
  }
  function renderMapeamentos(grupo) {
    var container = el(grupo === 'consultorios' ? 'lista-destinos-consultorios' : 'lista-destinos-guiches');
    var itens = mapa().destinos[grupo] || {}, chaves = Object.keys(itens).sort();
    container.innerHTML = chaves.length ? chaves.map(function (chave) {
      return '<div class="mapa-destino-linha" data-grupo="' + grupo + '" data-original="' + esc(chave) + '">' +
        '<div class="form-group"><label>' + (grupo === 'consultorios' ? 'Chave de chamada' : 'Guichê') + '</label><input class="destino-chave" maxlength="10" value="' + esc(chave) + '"></div>' +
        '<div class="form-group"><label>Local de destino</label><select class="destino-no">' + opcoes(itens[chave], 'Selecione o local') + '</select></div>' +
        '<button type="button" class="btn btn-danger btn-sm" data-remover-grupo="' + grupo + '" data-chave="' + esc(chave) + '">Remover</button></div>';
    }).join('') : '<div class="mapa-destino-vazio">Nenhum destino configurado nesta seção.</div>';
  }
  function renderParametros() {
    if (!mapa()) return;
    el('mapa-nome').value = mapa().nome || '';
    el('mapa-ponto-inicial').innerHTML = opcoes(mapa().ponto_inicial, 'Selecione o início');
    el('destino-triagem').innerHTML = opcoes(mapa().destinos.triagem, 'Selecione a triagem');
    renderMapeamentos('consultorios'); renderMapeamentos('guiches');
    var valor = el('teste-consultorio').value;
    el('teste-consultorio').innerHTML = '<option value="">Selecione...</option>' + Object.keys(mapa().destinos.consultorios).map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === valor ? ' selected' : '') + '>' + esc(nomeNo(mapa().destinos.consultorios[k])) + '</option>';
    }).join('');
    valor = el('teste-guiche').value;
    el('teste-guiche').innerHTML = '<option value="">Destino geral da triagem</option>' + Object.keys(mapa().destinos.guiches).map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === valor ? ' selected' : '') + '>' + esc(k) + '</option>';
    }).join('');
  }
  async function salvarParametros() {
    if (api.ocupado()) return;
    var m = clone(mapa());
    m.nome = txt(el('mapa-nome').value) || m.nome;
    m.ponto_inicial = el('mapa-ponto-inicial').value;
    m.destinos.triagem = el('destino-triagem').value;
    await api.salvar(m, 'Parâmetros gráficos salvos no rascunho.');
  }
  async function alterarMapeamentos(grupo) {
    if (api.ocupado()) return;
    var m = clone(mapa()), novo = {}, erro = '';
    el(grupo === 'consultorios' ? 'lista-destinos-consultorios' : 'lista-destinos-guiches').querySelectorAll('[data-grupo]').forEach(function (linha) {
      var original = linha.dataset.original, chave = txt(linha.querySelector('.destino-chave').value), id = linha.querySelector('.destino-no').value;
      if (!chave || chave.length > 10 || !id) erro = 'Preencha a chave (até 10 caracteres) e o local de cada destino.';
      else if (Object.prototype.hasOwnProperty.call(novo, chave)) erro = 'Há chaves de destino repetidas.';
      else if (grupo === 'consultorios' && api.chaveEmUso(original) && (original !== chave || m.destinos.consultorios[original] !== id)) erro = 'Reatribua médicos e conclua chamadas ativas antes de alterar este vínculo.';
      else novo[chave] = id;
    });
    if (erro) { api.feedback(erro, 'warning'); renderMapeamentos(grupo); return; }
    m.destinos[grupo] = novo;
    await api.salvar(m, 'Vínculos de destinos salvos no rascunho.');
  }
  function proximaChave(obj) { var n = 1; while (Object.prototype.hasOwnProperty.call(obj, String(n))) n++; return String(n); }
  async function adicionarDestino(grupo) {
    if (api.ocupado()) return;
    var m = clone(mapa());
    var usado = Object.keys(m.destinos[grupo]).map(function (k) { return m.destinos[grupo][k]; });
    var no = m.nos.find(function (n) { return usado.indexOf(n.id) === -1 && (grupo === 'consultorios' ? RotasUnidade.tipo(n) === 'consultorio' : n.tipo === 'guiche'); });
    if (!no) { api.feedback('Cadastre um local disponível antes de adicionar o vínculo.', 'warning'); return; }
    m.destinos[grupo][proximaChave(m.destinos[grupo])] = no.id;
    await api.salvar(m, 'Destino adicionado ao rascunho.');
  }
  async function removerDestino(grupo, chave) {
    if (api.ocupado()) return;
    if (grupo === 'consultorios' && api.chaveEmUso(chave)) { api.feedback('Reatribua médicos e conclua chamadas ativas antes de remover este vínculo.', 'warning'); return; }
    if (!window.confirm('Remover o vínculo de chamada deste destino no rascunho?')) return;
    var m = clone(mapa()); delete m.destinos[grupo][chave];
    await api.salvar(m, 'Vínculo removido do rascunho.');
  }
  function alterarTipoTeste() {
    var consulta = el('teste-tipo').value === 'consulta';
    el('grupo-teste-consultorio').hidden = !consulta; el('grupo-teste-guiche').hidden = consulta;
  }
  function testar() {
    var m = mapa(), tipo = el('teste-tipo').value;
    var chamada = { tipo_chamada: tipo, consultorio: el('teste-consultorio').value, guiche: el('teste-guiche').value };
    var destino = OrientacaoHospitalTV.resolverDestinoId(m, chamada);
    var caminho = destino && OrientacaoHospitalTV.calcularCaminhoGrafico(m, destino, m.ponto_inicial);
    var no = destino && RotasUnidade.noPorId(m, destino);
    el('teste-resultado').hidden = false;
    el('teste-mapa').innerHTML = ''; el('teste-passos').innerHTML = '';
    if (!caminho || !no) {
      el('teste-titulo').textContent = 'Percurso gráfico não encontrado';
      el('teste-resumo').textContent = 'Confira a origem, as coordenadas e as ligações em cada trecho.';
      return;
    }
    el('teste-titulo').textContent = no.nome;
    el('teste-resumo').textContent = 'Prévia do grafo do rascunho; confirme o percurso presencialmente antes de publicar.';
    el('teste-mapa').innerHTML = OrientacaoHospitalTV.renderizarSvg({ mapa: m, destinoId: destino, destino: no, ligacoes: caminho.ligacoes });
    caminho.ligacoes.forEach(function (l) { var li = document.createElement('li'); li.textContent = l.instrucao; el('teste-passos').appendChild(li); });
  }
  function mostrarSubaba(nome) {
    document.querySelectorAll('[data-subaba-avancada]').forEach(function (b) { b.classList.toggle('ativa', b.dataset.subabaAvancada === nome); });
    document.querySelectorAll('.mapa-subaba-conteudo').forEach(function (p) { p.hidden = p.id !== 'subaba-' + nome; });
  }
  function renderizar() {
    if (!api || !mapa()) return;
    if (selecionado && !RotasUnidade.noPorId(mapa(), selecionado)) selecionado = '';
    el('chk-usar-mapa-grafico').checked = mapa().usar_mapa_grafico === true;
    desenhar(); preencherPonto(); renderCaminhos(); renderParametros(); limparLigacao();
  }
  function iniciar(hooks) {
    if (iniciado) return; iniciado = true; api = hooks;
    document.querySelectorAll('[data-subaba-avancada]').forEach(function (b) { b.addEventListener('click', function () { mostrarSubaba(b.dataset.subabaAvancada); }); });
    el('chk-usar-mapa-grafico').addEventListener('change', async function () {
      var m = clone(mapa()); m.usar_mapa_grafico = this.checked;
      await api.salvar(m, 'Opção de planta gráfica salva no rascunho.');
    });
    el('selecionar-ponto-avancado').addEventListener('change', function () { selecionar(this.value); });
    el('btn-novo-ponto').addEventListener('click', function () { selecionar(''); el('ponto-nome').focus(); });
    el('form-ponto').addEventListener('submit', salvarPonto);
    el('btn-ponto-inicial').addEventListener('click', definirInicio);
    el('btn-excluir-ponto').addEventListener('click', function () { if (selecionado) api.excluirLocal(selecionado); });
    el('btn-gerar-areas').addEventListener('click', gerarAreas);
    el('btn-nova-ligacao').addEventListener('click', limparLigacao);
    el('btn-cancelar-ligacao').addEventListener('click', limparLigacao);
    el('form-ligacao').addEventListener('submit', salvarLigacao);
    el('lista-caminhos').addEventListener('click', async function (e) {
      var editar = e.target.closest('[data-editar-ligacao]'), excluir = e.target.closest('[data-excluir-ligacao]');
      if (editar) editarLigacao(Number(editar.dataset.editarLigacao));
      if (excluir && window.confirm('Excluir esta ligação do rascunho?')) {
        var m = clone(mapa()); m.ligacoes.splice(Number(excluir.dataset.excluirLigacao), 1); await api.salvar(m, 'Ligação excluída do rascunho.');
      }
    });
    el('btn-salvar-destinos-basicos').addEventListener('click', salvarParametros);
    el('btn-add-consultorio').addEventListener('click', function () { adicionarDestino('consultorios'); });
    el('btn-add-guiche').addEventListener('click', function () { adicionarDestino('guiches'); });
    ['consultorios', 'guiches'].forEach(function (grupo) {
      var cont = el(grupo === 'consultorios' ? 'lista-destinos-consultorios' : 'lista-destinos-guiches');
      cont.addEventListener('change', function () { alterarMapeamentos(grupo); });
      cont.addEventListener('click', function (e) { var b = e.target.closest('[data-remover-grupo]'); if (b) removerDestino(grupo, b.dataset.chave); });
    });
    el('teste-tipo').addEventListener('change', alterarTipoTeste); el('btn-testar-rota').addEventListener('click', testar); alterarTipoTeste();
  }
  return { iniciar: iniciar, renderizar: renderizar };
})();
