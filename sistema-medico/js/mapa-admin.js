/* VIDA+ — configuração simplificada de locais e orientações.
 * As referências antigas (IDs dos pontos e chaves de consultórios) são mantidas.
 * Todas as gravações oficiais são aguardadas no Supabase antes de confirmar.
 */
var EditorMapaAdmin = (function () {
  'use strict';
  var estado = {
    unidade: '', mapa: null, publicado: null, equipe: null, aba: 'locais',
    carregado: false, ocupado: false, carregamento: 0, iniciado: false,
    destino: '', formularios: Object.create(null), sujos: Object.create(null),
    mostrarTodas: false, previaTemporaria: null, pendenciasBase: []
  };
  function el(id) { return document.getElementById(id); }
  function texto(v) { return RotasUnidade.texto(v); }
  function copia(v) { return RotasUnidade.clone(v); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var timerFeedback = null;
  function feedback(msg, tipo) {
    if (timerFeedback) clearTimeout(timerFeedback);
    var alvo = !el('modal-local').hidden ? el('modal-local-feedback') :
      !el('modal-publicacao').hidden ? el('modal-publicacao-feedback') : el('mapa-feedback');
    alvo.textContent = msg || '';
    alvo.className = 'alert alert-' + (tipo || 'info');
    alvo.hidden = !msg;
    if (msg && alvo.id === 'mapa-feedback' && (tipo === 'success' || tipo === 'info')) {
      timerFeedback = setTimeout(function () { alvo.hidden = true; }, 6000);
    }
  }
  function limparFeedback() {
    ['mapa-feedback', 'modal-local-feedback', 'modal-publicacao-feedback'].forEach(function (id) { el(id).hidden = true; });
  }
  function ocupar(valor) {
    estado.ocupado = valor;
    ['btn-salvar-local', 'btn-salvar-orientacao', 'btn-salvar-rascunho', 'btn-salvar-rascunho-revisao',
      'btn-validar-publicar', 'btn-publicar', 'btn-descartar', 'mapa-unidade'].forEach(function (id) {
      el(id).disabled = valor;
    });
  }
  function definirStatus() {
    if (!estado.mapa) return;
    var origem = estado.mapa._origem, naoSincronizado = estado.mapa._nao_sincronizado;
    var label = naoSincronizado ? 'Não sincronizado' : origem === 'rascunho' || origem === 'rascunho_local'
      ? 'Rascunho' : origem === 'supabase' && estado.mapa.configurado ? 'Publicado' : 'Não publicado';
    el('mapa-status').textContent = label;
    el('mapa-status').className = 'badge badge-' + (naoSincronizado ? 'danger' : label === 'Publicado' ? 'success' : label === 'Rascunho' ? 'info' : 'secondary');
    el('mapa-origem').textContent = naoSincronizado
      ? 'Há alterações somente neste navegador. Verifique a conexão e salve novamente no banco.'
      : label === 'Rascunho' ? 'Rascunho salvo separadamente. O telão usa apenas a última versão publicada.'
      : label === 'Publicado' ? 'Esta é a versão publicada; novas alterações serão salvas como rascunho.'
      : 'Cadastre os locais e orientações. O telão só será alterado após a publicação.';
  }
  function mostrarAba(nome) {
    if (estado.ocupado) return;
    if (estado.destino && estado.aba === 'orientacoes' && estado.sujos[estado.destino]) {
      estado.formularios[estado.destino] = coletarFormulario(estado.destino);
    }
    estado.aba = nome;
    var titulos = { locais: 'Locais e consultórios', orientacoes: 'Orientações', revisao: 'Revisar e publicar' };
    var numeros = { locais: 1, orientacoes: 2, revisao: 3 };
    document.querySelectorAll('.mapa-aba').forEach(function (b) {
      var ativo = b.dataset.aba === nome;
      b.classList.toggle('ativa', ativo);
      b.setAttribute('aria-selected', String(ativo));
      if (ativo) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.mapa-aba-conteudo').forEach(function (p) { p.hidden = p.id !== 'aba-' + nome; });
    el('mapa-progresso-texto').textContent = 'Etapa ' + numeros[nome] + ' de 3 — ' + titulos[nome];
    el('mapa-progresso-barra').style.width = (numeros[nome] / 3 * 100) + '%';
    if (estado.mapa && nome === 'revisao') renderRevisao();
    if (estado.mapa && nome === 'orientacoes') renderMenuDestinos();
  }
  async function preencherUnidades() {
    var unidades = await MapaHospitalStore.listarUnidades();
    el('mapa-unidade').innerHTML = unidades.map(function (u) { return '<option value="' + esc(u) + '">' + esc(u) + '</option>'; }).join('');
    return unidades;
  }
  async function carregarUnidade(unidade) {
    if (!unidade) return;
    var token = ++estado.carregamento;
    estado.unidade = unidade;
    estado.carregado = false;
    estado.mapa = null;
    estado.equipe = null;
    estado.publicado = null;
    estado.destino = '';
    estado.formularios = Object.create(null);
    estado.sujos = Object.create(null);
    estado.previaTemporaria = null;
    el('mapa-status').textContent = 'Carregando…';
    limparFeedback();
    try {
      if (typeof DB !== 'undefined' && typeof DB.aguardarSincronizacao === 'function') {
        await Promise.race([DB.aguardarSincronizacao(), new Promise(function (resolve) { setTimeout(resolve, 5000); })]);
      }
      var dados = await Promise.all([
        MapaHospitalStore.carregarRascunho(unidade),
        EquipeConsultorioStore.carregar(unidade, { exigirRemoto: true })
      ]);
      if (token !== estado.carregamento) return;
      var mapa = dados[0];
      /* Preserva a opção gráfica de uma publicação antiga, em vez de desligá-la silenciosamente. */
      if (mapa.configurado && !Object.prototype.hasOwnProperty.call(mapa, 'orientacoes') && mapa.usar_mapa_grafico === undefined) {
        mapa.usar_mapa_grafico = true;
      }
      estado.mapa = RotasUnidade.normalizar(mapa, unidade);
      estado.publicado = MapaHospitalStore.obterPublicadoCarregado(unidade);
      estado.equipe = dados[1];
      estado.carregado = true;
      el('mapa-modo-armazenamento').textContent = 'Banco de dados disponível';
      renderTudo(true);
      if (estado.mapa._nao_sincronizado) {
        feedback('Há uma cópia de rascunho não sincronizada neste navegador. Salve novamente; se outra sessão tiver alterado a configuração, exporte a cópia antes de recarregar.', 'warning');
      } else if (estado.mapa._publicacao_desatualizada) {
        feedback('A versão publicada mudou desde que este rascunho foi criado. Exporte o rascunho e recarregue para evitar sobrescrever outra publicação.', 'warning');
      }
    } catch (e) {
      if (token !== estado.carregamento) return;
      el('mapa-modo-armazenamento').textContent = 'Banco de dados indisponível';
      estado.mapa = RotasUnidade.normalizar(MapaHospitalStore.mapaVazio(unidade), unidade);
      estado.equipe = { vinculos: {} };
      renderTudo(true);
      el('mapa-status').textContent = 'Conexão indisponível';
      feedback('Não foi possível carregar as configurações desta unidade. Nenhuma alteração foi feita. Confira a conexão e as permissões e recarregue a página. ' + e.message, 'danger');
    }
  }
  async function salvarMapa(candidato) {
    if (!estado.carregado) throw new Error('As configurações não foram carregadas do banco. Recarregue a página.');
    estado.mapa = RotasUnidade.normalizar(candidato, estado.unidade);
    try {
      var salvo = await MapaHospitalStore.salvarRascunho(estado.unidade, estado.mapa);
      estado.mapa = RotasUnidade.normalizar(salvo, estado.unidade);
      estado.mapa._nao_sincronizado = false;
      renderTudo(false);
      return true;
    } catch (e) {
      estado.mapa._nao_sincronizado = true;
      renderTudo(false);
      throw e;
    }
  }
  async function salvarRascunho() {
    if (estado.ocupado) return;
    if (Object.keys(estado.sujos).some(function (id) { return estado.sujos[id]; })) {
      feedback('Existem alterações não salvas no formulário de orientação. Salve ou cancele cada orientação antes de salvar o rascunho.', 'warning');
      mostrarAba('orientacoes');
      return;
    }
    ocupar(true);
    try { await salvarMapa(estado.mapa); feedback('Rascunho salvo no banco. O telão não foi alterado.', 'success'); }
    catch (e) { feedback(e.message, 'danger'); }
    finally { ocupar(false); }
  }
  function obterPendencias() {
    var pendencias = RotasUnidade.validar(estado.mapa, estado.equipe);
    estado.pendenciasBase = pendencias.slice();
    Object.keys(estado.sujos).forEach(function (id) {
      if (estado.sujos[id]) {
        var no = RotasUnidade.noPorId(estado.mapa, id);
        pendencias.push({ texto: 'Alterações não salvas em ' + (no ? no.nome : 'orientação'),
          detalhe: 'Salve ou cancele as alterações do formulário.', aba: 'orientacoes', id: id });
      }
    });
    if (estado.mapa._nao_sincronizado) pendencias.push({ texto: 'Rascunho não sincronizado', detalhe: 'Confira a conexão e salve o rascunho novamente.', aba: 'salvar', id: '' });
    if (estado.mapa._publicacao_desatualizada) pendencias.push({ texto: 'Publicação alterada em outra sessão', detalhe: 'Exporte o rascunho e recarregue antes de publicar.', aba: 'recarregar', id: '' });
    if (estado.mapa.usar_mapa_grafico) {
      estado.mapa.nos.filter(function (n) { return RotasUnidade.ehDestino(estado.mapa, n); }).forEach(function (no) {
        var o = estado.mapa.orientacoes[no.id];
        if (!o || !OrientacaoHospitalTV.calcularCaminhoGrafico(estado.mapa, no.id, o.ponto_inicial_id)) {
          pendencias.push({ texto: 'Percurso gráfico de ' + no.nome + ' incompleto',
            detalhe: 'Configure pontos e ligações ou desative a planta gráfica.', aba: 'avancado', id: no.id });
        }
      });
    }
    return pendencias;
  }
  function orientacaoCompleta(no) {
    var o = no && estado.mapa.orientacoes[no.id];
    if (!o || !RotasUnidade.textoOrientacao(o) || o.revisao_necessaria) return false;
    return !estado.pendenciasBase.some(function (p) {
      return p.id === no.id && p.aba === 'orientacoes';
    });
  }
  function renderIndicadores() {
    var locais = estado.mapa.nos, destinos = locais.filter(function (n) { return RotasUnidade.ehDestino(estado.mapa, n); });
    var sem = destinos.filter(function (n) {
      return !orientacaoCompleta(n);
    }).length;
    el('ind-total-locais').textContent = locais.length;
    el('ind-total-consultorios').textContent = locais.filter(function (n) { return RotasUnidade.tipo(n) === 'consultorio'; }).length;
    el('ind-destinos-sem-orientacao').textContent = sem;
    el('ind-status-configuracao').textContent = sem ? 'Com pendências' : locais.length ? 'Em revisão' : 'Não iniciada';
    definirStatus();
  }
  function renderLocais() {
    var filtro = el('filtro-tipo-local').value;
    var locais = estado.mapa.nos.filter(function (no) {
      var destino = RotasUnidade.ehDestino(estado.mapa, no);
      return !filtro || (filtro === 'consultorio' && RotasUnidade.tipo(no) === 'consultorio') ||
        (filtro === 'atendimento' && destino) || (filtro === 'apoio' && !destino);
    });
    if (!locais.length) {
      el('lista-locais-unidade').innerHTML = '<tr><td colspan="7" class="mapa-tabela-vazia">Nenhum local encontrado. Use “Adicionar local” para começar.</td></tr>';
      return;
    }
    el('lista-locais-unidade').innerHTML = locais.map(function (no) {
      var destino = RotasUnidade.ehDestino(estado.mapa, no);
      var status = !destino ? '<span class="badge badge-secondary">Não se aplica</span>' :
        orientacaoCompleta(no)
          ? '<span class="badge badge-success">Configurada</span>' : '<span class="badge badge-warning">Pendente</span>';
      var numero = RotasUnidade.numeroSala(estado.mapa, no);
      return '<tr><td class="mapa-local-nome-celula"><strong>' + esc(no.nome) + '</strong>' +
        (no.observacoes ? '<small>' + esc(no.observacoes) + '</small>' : '') + '</td><td>' + esc(RotasUnidade.nomeTipo(no)) +
        '</td><td>' + esc(no.bloco || (no.sem_bloco || no.sem_divisao ? 'Não se aplica' : '—')) + '</td><td>' +
        esc(no.andar || (no.sem_andar || no.sem_divisao ? 'Não se aplica' : '—')) + '</td><td>' + esc(numero || '—') +
        '</td><td>' + status + '</td><td><div class="mapa-acoes-celula">' +
        '<button class="btn btn-outline btn-sm" type="button" data-orientar-local="' + esc(no.id) + '">Orientar</button>' +
        '<button class="btn btn-outline btn-sm" type="button" data-editar-local="' + esc(no.id) + '">Editar</button>' +
        '<button class="btn btn-ghost btn-sm mapa-excluir" type="button" data-excluir-local="' + esc(no.id) + '" aria-label="Excluir ' + esc(no.nome) + '">Excluir</button></div></td></tr>';
    }).join('');
  }
  function medicos() {
    return typeof DB !== 'undefined' && DB.getUsuarios ? DB.getUsuarios().filter(function (u) { return u && u.tipo === 'medico'; })
      .sort(function (a, b) { return texto(a.nome).localeCompare(texto(b.nome), 'pt-BR'); }) : [];
  }
  function vinculo(usuario) {
    return EquipeConsultorioStore.obterVinculo(estado.equipe, usuario) ||
      { consultorio: MedicoConsultorios.consultorioPadrao(usuario) };
  }
  function medicosUsandoChave(chave) {
    var centrais = Object.keys(estado.equipe && estado.equipe.vinculos || {}).filter(function (doc) {
      return texto(estado.equipe.vinculos[doc].consultorio) === texto(chave);
    }).map(function (doc) { return estado.equipe.vinculos[doc].nome || 'Médico vinculado'; });
    medicos().forEach(function (u) {
      if (texto(vinculo(u).consultorio) === texto(chave) && centrais.indexOf(u.nome) === -1) centrais.push(u.nome);
    });
    return centrais;
  }
  function renderEquipe() {
    var lista = medicos(), salas = MedicoConsultorios.listar(estado.mapa), vinculados = 0;
    el('total-medicos-equipe').textContent = lista.length;
    el('total-consultorios-operacional').textContent = salas.length;
    if (!lista.length) {
      el('lista-equipe-medicos').innerHTML = '<tr><td colspan="5" class="mapa-equipe-vazio">Nenhum médico cadastrado. O cadastro existente pode ser usado para adicionar profissionais.</td></tr>';
      el('total-medicos-vinculados').textContent = '0'; return;
    }
    el('lista-equipe-medicos').innerHTML = lista.map(function (u) {
      var doc = texto(u.cpf).replace(/\D/g, ''), atual = texto(vinculo(u).consultorio);
      var valido = salas.some(function (s) { return s.numero === atual; });
      if (atual && valido) vinculados++;
      var iniciais = texto(u.nome).split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase() || 'M';
      var opcoes = '<option value="">Não atribuído</option>' + salas.map(function (s) {
        var local = RotasUnidade.localizacao(s.no);
        return '<option value="' + esc(s.numero) + '"' + (s.numero === atual ? ' selected' : '') + '>' + esc(s.nome + (local ? ' — ' + local : '')) + '</option>';
      }).join('');
      if (atual && !valido) opcoes += '<option value="' + esc(atual) + '" selected>Consultório indisponível — reatribua</option>';
      return '<tr><td><div class="mapa-equipe-medico"><span class="mapa-equipe-avatar">' + esc(iniciais) + '</span><div><strong>' + esc(u.nome) +
        '</strong><small>' + (u.ativo === false ? 'Inativo' : 'Ativo') + '</small></div></div></td><td>' + esc(u.especialidade || 'Não informada') +
        '</td><td>' + esc(u.crm || u.registroProfissional || u.registro_profissional || '—') + '</td><td><select class="mapa-equipe-select" data-equipe-select="' + esc(doc) +
        '" aria-label="Consultório de ' + esc(u.nome) + '">' + opcoes + '</select>' + (atual && !valido ? '<small class="mapa-equipe-vinculo-inconsistente">Revise este vínculo</small>' : '') +
        '</td><td><button type="button" class="btn btn-outline btn-sm" data-salvar-equipe="' + esc(doc) + '">Salvar vínculo</button></td></tr>';
    }).join('');
    el('total-medicos-vinculados').textContent = vinculados;
  }
  async function salvarEquipe(doc) {
    if (estado.ocupado) return;
    var u = medicos().find(function (x) { return texto(x.cpf).replace(/\D/g, '') === doc; });
    var seletor = document.querySelector('[data-equipe-select="' + doc + '"]');
    if (!u || !seletor) return;
    var sala = seletor.value;
    if (sala && !MedicoConsultorios.listar(estado.mapa).some(function (s) { return s.numero === sala; })) {
      feedback('Selecione um consultório cadastrado nesta unidade.', 'warning'); return;
    }
    ocupar(true);
    try {
      estado.equipe = await EquipeConsultorioStore.salvarVinculo(estado.unidade, u, sala);
      renderEquipe(); renderRevisao();
      feedback('Vínculo salvo no banco. Consultórios novos ficam disponíveis nas chamadas após a publicação.', 'success');
    } catch (e) { feedback('Não foi possível salvar o vínculo: ' + e.message, 'danger'); }
    finally { ocupar(false); }
  }
  function setTipoLocal() {
    var tipo = el('local-tipo').value;
    el('grupo-tipo-personalizado').hidden = tipo !== 'outro';
    el('local-tipo-personalizado').required = tipo === 'outro';
    el('grupo-local-triagem-principal').hidden = tipo !== 'triagem';
  }
  function atualizarCamposSemDivisao() {
    el('local-bloco').disabled = el('local-sem-bloco').checked;
    el('local-andar').disabled = el('local-sem-andar').checked;
  }
  function abrirLocal(id) {
    if (estado.ocupado || !estado.carregado) return;
    var no = id ? RotasUnidade.noPorId(estado.mapa, id) : null;
    el('form-local').reset();
    el('local-id-edicao').value = no ? no.id : '';
    el('local-numero-original').value = no ? RotasUnidade.numeroSala(estado.mapa, no) : '';
    el('local-nome').value = no ? texto(no.nome) : '';
    el('local-tipo').value = no ? RotasUnidade.tipo(no) : 'consultorio';
    el('local-tipo-personalizado').value = no ? texto(no.tipo_personalizado) || (no.tipo === 'guiche' ? 'Guichê' : '') : '';
    el('local-bloco').value = no ? texto(no.bloco) : '';
    el('local-andar').value = no ? texto(no.andar) : '';
    el('local-sem-bloco').checked = !!(no && (no.sem_bloco || no.sem_divisao));
    el('local-sem-andar').checked = !!(no && (no.sem_andar || no.sem_divisao));
    el('local-numero-sala').value = no ? RotasUnidade.numeroSala(estado.mapa, no) : '';
    el('local-observacoes').value = no ? texto(no.observacoes) : '';
    el('local-recebe-pacientes').checked = no ? RotasUnidade.ehDestino(estado.mapa, no) : true;
    el('local-triagem-principal').checked = no ? estado.mapa.destinos.triagem === no.id : !estado.mapa.destinos.triagem;
    el('titulo-modal-local').textContent = no ? 'Editar local' : 'Adicionar local';
    setTipoLocal(); atualizarCamposSemDivisao();
    limparFeedback(); el('modal-local').hidden = false; el('local-nome').focus();
  }
  function fecharLocal() { if (!estado.ocupado) { el('modal-local').hidden = true; limparFeedback(); } }
  function novoId() {
    var id;
    do {
      id = 'local_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') :
        Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    } while (RotasUnidade.noPorId(estado.mapa, id));
    return id;
  }
  function marcarRevisao(mapa, id) {
    Object.keys(mapa.orientacoes).forEach(function (destino) {
      var o = mapa.orientacoes[destino];
      if (destino === id || o.ponto_inicial_id === id || o.reutiliza_de === id) o.revisao_necessaria = true;
    });
  }
  function temConsultasAtivas(chave) {
    if (typeof DB === 'undefined' || !DB.getConsultas) return false;
    return DB.getConsultas().some(function (c) {
      return c && c.unidade === estado.unidade && texto(c.consultorio) === texto(chave) &&
        ['em_fila', 'chamado', 'em_consulta'].indexOf(c.status) !== -1;
    });
  }
  async function salvarLocal(evento) {
    evento.preventDefault();
    if (estado.ocupado) return;
    var nome = texto(el('local-nome').value), tipo = el('local-tipo').value;
    var personalizado = texto(el('local-tipo-personalizado').value), numero = texto(el('local-numero-sala').value);
    if (!nome || !tipo || (tipo === 'outro' && !personalizado)) { feedback('Informe o nome e o tipo do local. Para “Outro”, descreva o tipo.', 'danger'); return; }
    var mapa = copia(estado.mapa), id = el('local-id-edicao').value || novoId();
    var anterior = RotasUnidade.noPorId(mapa, id), chaves = anterior ? RotasUnidade.chavesConsultorio(mapa, id) : [];
    if (tipo === 'consultorio' && numero && mapa.nos.some(function (n) {
      return n.id !== id && RotasUnidade.tipo(n) === 'consultorio' && RotasUnidade.numeroSala(mapa, n).toLowerCase() === numero.toLowerCase();
    })) { feedback('Já existe um consultório com este número. Informe outro número ou deixe o campo em branco.', 'warning'); return; }
    if (tipo !== 'consultorio' && chaves.length) {
      var bloqueio = chaves.some(function (chave) { return medicosUsandoChave(chave).length || temConsultasAtivas(chave); });
      if (bloqueio) { feedback('Este consultório possui vínculos ou chamadas ativas. Reatribua os médicos e conclua as chamadas antes de mudar seu tipo.', 'warning'); return; }
      chaves.forEach(function (chave) { delete mapa.destinos.consultorios[chave]; });
    }
    var tiposInternos = { recepcao: 'inicio', triagem: 'triagem', consultorio: 'consultorio', corredor: 'corredor', elevador: 'elevador', escada: 'escada' };
    var no = Object.assign({}, anterior || {}, {
      id: id, nome: nome, tipo: tiposInternos[tipo] || (anterior && anterior.tipo === 'guiche' ? 'guiche' : 'local'),
      tipo_exibicao: tipo, tipo_personalizado: tipo === 'outro' ? personalizado : '',
      bloco: el('local-sem-bloco').checked ? '' : texto(el('local-bloco').value),
      andar: el('local-sem-andar').checked ? '' : texto(el('local-andar').value),
      sem_bloco: el('local-sem-bloco').checked, sem_andar: el('local-sem-andar').checked,
      sem_divisao: false, numero_sala: numero, observacoes: texto(el('local-observacoes').value),
      recebe_pacientes: el('local-recebe-pacientes').checked
    });
    if (!anterior) { no.x = null; no.y = null; mapa.nos.push(no); }
    else {
      var mudou = ['nome', 'bloco', 'andar', 'numero_sala', 'sem_bloco', 'sem_andar'].some(function (k) { return (anterior[k] || '') !== (no[k] || ''); });
      mapa.nos[mapa.nos.indexOf(anterior)] = no;
      if (mudou) marcarRevisao(mapa, id);
    }
    if (tipo === 'consultorio' && !chaves.length) {
      // consultas.consultorio é VARCHAR(10). A chave curta é interna e estável;
      // o número/nome visível permanece no local, podendo inclusive ser alterado.
      var chave = numero && numero.length <= 10 && !/^(?:local_|loc_)/i.test(numero) &&
        !Object.prototype.hasOwnProperty.call(mapa.destinos.consultorios, numero) ? numero : '';
      while (!chave || Object.prototype.hasOwnProperty.call(mapa.destinos.consultorios, chave)) {
        chave = 'loc_' + Math.random().toString(36).slice(2, 8).padEnd(6, '0');
      }
      mapa.destinos.consultorios[chave] = id;
    }
    if (mapa.destinos.triagem === id && (tipo !== 'triagem' || !el('local-triagem-principal').checked)) mapa.destinos.triagem = '';
    if (tipo === 'triagem' && el('local-triagem-principal').checked) mapa.destinos.triagem = id;
    if (!mapa.ponto_inicial && tipo === 'recepcao') mapa.ponto_inicial = id;
    mapa.modo_simplificado = true;
    el('local-id-edicao').value = id; // uma tentativa posterior não duplica o local se a rede falhar
    ocupar(true);
    try {
      await salvarMapa(mapa); el('modal-local').hidden = true; limparFeedback();
      feedback('Local salvo no rascunho do banco. Revise as orientações antes de publicar.', 'success');
    } catch (e) { feedback(e.message, 'danger'); }
    finally { ocupar(false); }
  }
  async function excluirLocal(id) {
    if (estado.ocupado || !estado.carregado) return;
    var no = RotasUnidade.noPorId(estado.mapa, id);
    if (!no) return;
    var chaves = RotasUnidade.chavesConsultorio(estado.mapa, id);
    if (chaves.some(function (chave) { return medicosUsandoChave(chave).length || temConsultasAtivas(chave); })) {
      feedback('Reatribua os médicos e conclua chamadas ativas antes de excluir este consultório.', 'warning'); return;
    }
    if (!window.confirm('Excluir “' + no.nome + '” do rascunho? Ligações e referências a este local também serão removidas. A versão publicada só mudará após nova publicação.')) return;
    var mapa = copia(estado.mapa);
    mapa.nos = mapa.nos.filter(function (n) { return n.id !== id; });
    mapa.ligacoes = mapa.ligacoes.filter(function (l) { return l.de !== id && l.para !== id; });
    if (mapa.ponto_inicial === id) mapa.ponto_inicial = '';
    if (mapa.destinos.triagem === id) mapa.destinos.triagem = '';
    ['consultorios', 'guiches'].forEach(function (grupo) {
      Object.keys(mapa.destinos[grupo]).forEach(function (k) { if (mapa.destinos[grupo][k] === id) delete mapa.destinos[grupo][k]; });
    });
    delete mapa.orientacoes[id];
    Object.keys(mapa.orientacoes).forEach(function (dest) {
      var o = mapa.orientacoes[dest];
      if (o.ponto_inicial_id === id) { o.ponto_inicial_id = ''; o.revisao_necessaria = true; }
      if (o.reutiliza_de === id) { o.reutiliza_de = ''; o.revisao_necessaria = true; }
    });
    delete estado.formularios[id]; delete estado.sujos[id];
    if (estado.destino === id) estado.destino = '';
    ocupar(true);
    try { await salvarMapa(mapa); feedback('Local removido do rascunho. O telão não foi alterado.', 'success'); }
    catch (e) { feedback(e.message, 'danger'); }
    finally { ocupar(false); }
  }

  /* ------------------------- Orientações textuais ------------------------- */
  function opcoesLocais(selecionado, excluir, inicial) {
    return '<option value="">' + esc(inicial || 'Selecione...') + '</option>' + estado.mapa.nos.filter(function (n) {
      return n.id !== excluir;
    }).map(function (n) {
      var local = RotasUnidade.localizacao(n);
      return '<option value="' + esc(n.id) + '"' + (n.id === selecionado ? ' selected' : '') + '>' +
        esc(n.nome + (local ? ' — ' + local : '')) + '</option>';
    }).join('');
  }
  function dadosVazios(id) {
    return { destino_id: id, ponto_inicial_id: '', localizacao_tipo: '', como_chegar: [], outra_instrucao: '',
      usar_reutilizacao: false, reutiliza_de: '', complemento_especifico: '', texto_orientacao: '',
      acessibilidade: { elevador_acessivel: 'nao_informado', possui_escadas: 'nao_informado',
        alternativa_sem_escadas: 'nao_informado', restricoes_conhecidas: 'nao_informado',
        perfis_restritos: [], restricoes_detalhes: '', observacoes: '' } };
  }
  function dadosParaFormulario(id) {
    if (estado.formularios[id]) return copia(estado.formularios[id]);
    var base = dadosVazios(id), o = estado.mapa.orientacoes[id];
    if (!o) return base;
    var resultado = Object.assign(base, copia(o));
    resultado.destino_id = id;
    resultado.usar_reutilizacao = !!o.reutiliza_de;
    resultado.acessibilidade = Object.assign(base.acessibilidade, o.acessibilidade || {});
    if (!resultado.texto_orientacao && Array.isArray(o.passos)) resultado.texto_orientacao = o.passos.join('\n');
    return resultado;
  }
  function coletarFormulario(id) {
    var selecionadas = Array.from(document.querySelectorAll('input[name="como_chegar"]:checked')).map(function (i) { return i.value; });
    var perfis = el('acess-restricoes').value === 'possui'
      ? Array.from(document.querySelectorAll('input[name="acess_perfil"]:checked')).map(function (i) { return i.value; }) : [];
    return {
      destino_id: id, ponto_inicial_id: el('orientacao-ponto-inicial').value,
      localizacao_tipo: el('orientacao-localizacao').value, como_chegar: selecionadas,
      outra_instrucao: texto(el('orientacao-outra-instrucao').value),
      usar_reutilizacao: el('orientacao-reutilizar').checked,
      reutiliza_de: el('orientacao-reutilizar').checked ? el('orientacao-base-destino').value : '',
      complemento_especifico: el('orientacao-reutilizar').checked ? texto(el('orientacao-complemento').value) : '',
      texto_orientacao: texto(el('orientacao-texto').value),
      acessibilidade: {
        elevador_acessivel: el('acess-elevador').value, possui_escadas: el('acess-escadas').value,
        alternativa_sem_escadas: el('acess-alternativa').value, restricoes_conhecidas: el('acess-restricoes').value,
        perfis_restritos: perfis, restricoes_detalhes: el('acess-restricoes').value === 'possui' ? texto(el('acess-restricoes-detalhes').value) : '',
        observacoes: texto(el('acess-observacoes').value)
      }
    };
  }
  function renderMenuDestinos() {
    var lista = estado.mapa.nos;
    if (!lista.length) {
      el('lista-lateral-destinos').innerHTML = '<div class="mapa-tabela-vazia">Cadastre um local na primeira etapa.</div>'; return;
    }
    el('lista-lateral-destinos').innerHTML = lista.map(function (no) {
      var destino = RotasUnidade.ehDestino(estado.mapa, no);
      var status = estado.sujos[no.id] ? 'Não salva' : orientacaoCompleta(no) ? 'Configurada' : destino ? 'Pendente' : 'Opcional';
      return '<button type="button" class="mapa-destino-item-menu' + (no.id === estado.destino ? ' ativo' : '') + '" data-selecionar-orientacao="' + esc(no.id) +
        '"><span><strong>' + esc(no.nome) + '</strong><small>' + esc(RotasUnidade.localizacao(no) || RotasUnidade.nomeTipo(no)) +
        '</small></span><span class="badge badge-' + (status === 'Configurada' ? 'success' : status === 'Opcional' ? 'secondary' : 'warning') + '">' + status + '</span></button>';
    }).join('');
  }
  function relacaoSugerida(origem, destino) {
    if (!origem || !destino) return '';
    var a = texto(origem.andar).toLocaleLowerCase('pt-BR'), b = texto(destino.andar).toLocaleLowerCase('pt-BR');
    if (a && b) return a === b ? 'mesmo_andar' : 'outro_andar';
    if ((origem.sem_andar || origem.sem_divisao) && (destino.sem_andar || destino.sem_divisao)) return 'sem_divisao';
    var c = texto(origem.bloco).toLocaleLowerCase('pt-BR'), d = texto(destino.bloco).toLocaleLowerCase('pt-BR');
    if (c && d && c !== d) return 'outro_bloco';
    return '';
  }
  function erroRelacao(dados) { return RotasUnidade.erroRelacao(estado.mapa, dados); }
  function atualizarOpcoesComoChegar() {
    var tipos = estado.mapa.nos.map(RotasUnidade.tipo);
    var disponiveis = { seguir_corredor: tipos.indexOf('corredor') !== -1, utilizar_elevador: tipos.indexOf('elevador') !== -1,
      utilizar_escada: tipos.indexOf('escada') !== -1, passar_recepcao: tipos.indexOf('recepcao') !== -1 };
    document.querySelectorAll('[data-opcao-chegar]').forEach(function (label) {
      var chave = label.dataset.opcaoChegar, input = label.querySelector('input');
      var conhecida = !Object.prototype.hasOwnProperty.call(disponiveis, chave) || disponiveis[chave];
      label.hidden = !estado.mostrarTodas && !conhecida && !input.checked;
      label.classList.toggle('selecionado', input.checked);
    });
    el('texto-btn-opcoes-como-chegar').textContent = estado.mostrarTodas ? 'Mostrar opções compatíveis' : 'Mostrar todas as opções';
    el('grupo-outra-instrucao').hidden = !document.querySelector('input[name="como_chegar"][value="outra_instrucao"]').checked;
    el('grupo-perfis-restritos').hidden = el('acess-restricoes').value !== 'possui';
    el('grupo-restricoes-detalhes').hidden = el('acess-restricoes').value !== 'possui';
    el('painel-reutilizar-orientacao').hidden = !el('orientacao-reutilizar').checked;
  }
  function atualizarPassosForm() {
    var conteudo = [texto(el('orientacao-texto').value), el('orientacao-reutilizar').checked ? texto(el('orientacao-complemento').value) : ''].filter(Boolean).join('\n');
    var lista = RotasUnidade.passos(conteudo);
    el('orientacao-passos-previa-box').hidden = !lista.length;
    el('orientacao-passos-previa-lista').innerHTML = lista.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
  }
  function atualizarLocalizacaoOpcoes() {
    var origem = RotasUnidade.noPorId(estado.mapa, el('orientacao-ponto-inicial').value);
    var destino = RotasUnidade.noPorId(estado.mapa, estado.destino);
    var valor = el('orientacao-localizacao').value;
    Array.from(el('orientacao-localizacao').options).forEach(function (op) {
      if (!op.value) return;
      var dados = { destino_id: destino && destino.id, ponto_inicial_id: origem && origem.id, localizacao_tipo: op.value };
      var impossivel = !!erroRelacao(dados);
      op.hidden = impossivel && op.value !== valor;
      op.disabled = impossivel && op.value !== valor;
    });
    el('orientacao-localizacao-ajuda').textContent = origem && destino
      ? (erroRelacao({ destino_id: destino.id, ponto_inicial_id: origem.id, localizacao_tipo: valor }) ||
        'Verifique a relação entre os locais. Se necessário, corrija os dados cadastrados.')
      : 'Selecione o ponto inicial e confira o bloco e o andar cadastrados.';
  }
  function carregarFormularioOrientacao(id) {
    estado.destino = id || '';
    var dados = dadosParaFormulario(estado.destino), no = RotasUnidade.noPorId(estado.mapa, estado.destino);
    el('orientacao-destino').innerHTML = opcoesLocais(estado.destino, '', 'Selecione um local');
    el('orientacao-ponto-inicial').innerHTML = opcoesLocais(dados.ponto_inicial_id, estado.destino, 'Selecione o ponto inicial');
    el('orientacao-localizacao').value = dados.localizacao_tipo || '';
    el('orientacao-reutilizar').checked = !!dados.usar_reutilizacao;
    var fontes = estado.mapa.nos.filter(function (n) {
      return n.id !== estado.destino && estado.mapa.orientacoes[n.id] && RotasUnidade.textoOrientacao(estado.mapa.orientacoes[n.id]);
    });
    el('orientacao-base-destino').innerHTML = '<option value="">Selecione uma orientação...</option>' + fontes.map(function (n) {
      return '<option value="' + esc(n.id) + '"' + (n.id === dados.reutiliza_de ? ' selected' : '') + '>' + esc(n.nome) + '</option>';
    }).join('');
    el('orientacao-complemento').value = dados.complemento_especifico || '';
    document.querySelectorAll('input[name="como_chegar"]').forEach(function (i) { i.checked = (dados.como_chegar || []).indexOf(i.value) !== -1; });
    el('orientacao-outra-instrucao').value = dados.outra_instrucao || '';
    el('orientacao-texto').value = dados.texto_orientacao || '';
    var a = dados.acessibilidade || {};
    el('acess-elevador').value = a.elevador_acessivel || 'nao_informado';
    el('acess-escadas').value = a.possui_escadas || 'nao_informado';
    el('acess-alternativa').value = a.alternativa_sem_escadas || 'nao_informado';
    el('acess-restricoes').value = a.restricoes_conhecidas || 'nao_informado';
    document.querySelectorAll('input[name="acess_perfil"]').forEach(function (i) { i.checked = (a.perfis_restritos || []).indexOf(i.value) !== -1; });
    el('acess-restricoes-detalhes').value = a.restricoes_detalhes || '';
    el('acess-observacoes').value = a.observacoes || '';
    el('titulo-orientacao-atual').textContent = no ? 'Orientação — ' + no.nome : 'Configurar orientação do destino';
    el('orientacao-destino-detalhe').textContent = no ? (RotasUnidade.localizacao(no) || 'Localização não informada no cadastro.') : 'Selecione um local cadastrado.';
    var o = no && estado.mapa.orientacoes[id], status = estado.sujos[id] ? 'Alterações não salvas' : o && RotasUnidade.textoOrientacao(o) ? 'Orientação salva' : 'Pendente';
    el('badge-status-orientacao-atual').textContent = status;
    el('badge-status-orientacao-atual').className = 'badge badge-' + (status === 'Orientação salva' ? 'success' : 'warning');
    atualizarOpcoesComoChegar(); atualizarLocalizacaoOpcoes(); atualizarPassosForm(); renderMenuDestinos();
  }
  function selecionarOrientacao(id) {
    if (estado.ocupado || !estado.mapa) return;
    if (estado.destino && estado.sujos[estado.destino]) estado.formularios[estado.destino] = coletarFormulario(estado.destino);
    estado.previaTemporaria = null;
    carregarFormularioOrientacao(id);
  }
  function marcarFormularioSujo() {
    if (!estado.destino) return;
    estado.sujos[estado.destino] = true;
    estado.formularios[estado.destino] = coletarFormulario(estado.destino);
    el('badge-status-orientacao-atual').textContent = 'Alterações não salvas';
    el('badge-status-orientacao-atual').className = 'badge badge-warning';
    atualizarOpcoesComoChegar(); atualizarLocalizacaoOpcoes(); atualizarPassosForm(); renderMenuDestinos();
  }
  function gerarSugestao() {
    var dados = coletarFormulario(estado.destino), resultado = RotasUnidade.sugestao(estado.mapa, dados);
    var erro = erroRelacao(dados);
    if (erro) resultado.erros.push(erro);
    if (resultado.erros.length) { feedback(resultado.erros.join(' '), 'warning'); return; }
    if (texto(el('orientacao-texto').value) && !window.confirm('Substituir o texto atual pela sugestão? Você poderá editá-la antes de salvar.')) return;
    el('orientacao-texto').value = resultado.texto;
    marcarFormularioSujo();
    feedback('Sugestão criada somente com as informações selecionadas. Revise o texto antes de salvar.', 'info');
  }
  function validarFormulario(dados) {
    var no = RotasUnidade.noPorId(estado.mapa, dados.destino_id);
    if (!no) return 'Selecione um destino cadastrado.';
    if (!RotasUnidade.noPorId(estado.mapa, dados.ponto_inicial_id)) return 'Selecione um ponto inicial cadastrado.';
    if (dados.destino_id === dados.ponto_inicial_id) return 'O ponto inicial deve ser diferente do destino.';
    if (!dados.localizacao_tipo) return 'Informe a localização do destino em relação ao ponto inicial.';
    var erro = erroRelacao(dados);
    if (erro) return erro;
    if (!dados.texto_orientacao) return 'Escreva ou gere uma orientação para o paciente.';
    if (dados.como_chegar.indexOf('outra_instrucao') !== -1 && !dados.outra_instrucao) return 'Descreva a outra instrução selecionada.';
    if (dados.usar_reutilizacao && (!dados.reutiliza_de || !estado.mapa.orientacoes[dados.reutiliza_de])) return 'Escolha uma orientação existente para reutilizar.';
    var a = dados.acessibilidade;
    if (a.restricoes_conhecidas === 'possui' && !a.perfis_restritos.length && !a.restricoes_detalhes && !a.observacoes) {
      return 'Descreva as restrições conhecidas ou selecione os perfis afetados.';
    }
    return '';
  }
  async function salvarOrientacao(evento) {
    if (evento) evento.preventDefault();
    if (estado.ocupado) return false;
    var dados = coletarFormulario(estado.destino), erro = validarFormulario(dados);
    if (erro) { feedback(erro, 'danger'); return false; }
    if (dados.reutiliza_de) {
      var origem = RotasUnidade.noPorId(estado.mapa, dados.reutiliza_de);
      if (origem && texto(origem.nome) && dados.texto_orientacao.toLocaleLowerCase('pt-BR').indexOf(texto(origem.nome).toLocaleLowerCase('pt-BR')) !== -1 &&
          !window.confirm('O texto reutilizado ainda menciona “' + origem.nome + '”. Confirme que essa referência também está correta para o novo destino.')) return false;
    }
    var mapa = copia(estado.mapa), id = dados.destino_id;
    delete dados.usar_reutilizacao;
    dados.revisao_necessaria = false;
    dados.atualizado_em = new Date().toISOString();
    mapa.orientacoes[id] = dados;
    mapa.modo_simplificado = true;
    ocupar(true);
    try {
      await salvarMapa(mapa);
      delete estado.formularios[id]; delete estado.sujos[id]; estado.previaTemporaria = null;
      carregarFormularioOrientacao(id); renderRevisao();
      feedback('Orientação salva no rascunho do banco. Ela ainda não aparece no telão até a publicação.', 'success');
      return true;
    } catch (e) { estado.sujos[id] = true; estado.formularios[id] = coletarFormulario(id); feedback(e.message, 'danger'); return false; }
    finally { ocupar(false); }
  }
  function cancelarOrientacao() {
    if (!estado.destino) return;
    if (estado.sujos[estado.destino] && !window.confirm('Descartar as alterações não salvas desta orientação?')) return;
    delete estado.sujos[estado.destino]; delete estado.formularios[estado.destino]; estado.previaTemporaria = null;
    carregarFormularioOrientacao(estado.destino); feedback('Alterações não salvas descartadas.', 'info');
  }
  function copiarBase() {
    var idBase = el('orientacao-base-destino').value, base = estado.mapa.orientacoes[idBase];
    if (!base) { marcarFormularioSujo(); return; }
    if (texto(el('orientacao-texto').value) && !window.confirm('Usar o texto da orientação escolhida como base? O texto atual será substituído.')) {
      el('orientacao-base-destino').value = ''; return;
    }
    el('orientacao-texto').value = texto(base.texto_orientacao || base.texto) || (base.passos || []).join('\n');
    /* Origem, localização e acessibilidade são verificadas para o novo destino,
       nunca presumidas a partir da proximidade com outra sala. */
    marcarFormularioSujo();
    feedback('Orientação copiada como base. Revise o destino, o ponto inicial e as condições de acessibilidade antes de salvar.', 'warning');
  }

  /* ------------------------- Revisão e publicação ------------------------- */
  function renderRevisao() {
    if (!estado.mapa) return;
    var locais = estado.mapa.nos, pendencias = obterPendencias();
    var destinos = locais.filter(function (n) { return RotasUnidade.ehDestino(estado.mapa, n); });
    var configurados = destinos.filter(function (n) {
      return orientacaoCompleta(n);
    }).length;
    var pendentes = destinos.filter(function (n) { return pendencias.some(function (p) { return p.id === n.id; }); }).length;
    el('rev-total-locais').textContent = locais.length;
    el('rev-destinos-configurados').textContent = configurados;
    el('rev-destinos-pendentes').textContent = pendentes;
    var publicado = estado.publicado && estado.publicado.configurado === true;
    el('rev-status-publicacao').textContent = publicado ? 'Publicado' : 'Não publicado';
    var data = estado.publicado && estado.publicado.publicado_em;
    el('rev-data-publicacao').textContent = data && !isNaN(Date.parse(data))
      ? new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    el('lista-pendencias-revisao').innerHTML = pendencias.length ? pendencias.map(function (p) {
      return '<div class="mapa-pendencia-item"><div class="mapa-pendencia-texto"><i class="fas fa-exclamation-circle" aria-hidden="true"></i><div><strong>' +
        esc(p.texto) + '</strong><small>' + esc(p.detalhe) + '</small></div></div><button type="button" class="btn btn-outline btn-sm" data-corrigir="' +
        esc(p.aba) + '" data-corrigir-id="' + esc(p.id || '') + '">Corrigir</button></div>';
    }).join('') : '<div class="mapa-sem-pendencias"><i class="fas fa-check-circle" aria-hidden="true"></i> Nenhuma pendência encontrada. Confira a prévia antes de publicar.</div>';
    var select = el('previa-destino-select'), selecionado = select.value;
    if (!selecionado || !RotasUnidade.noPorId(estado.mapa, selecionado)) selecionado = estado.destino || (destinos[0] && destinos[0].id) || (locais[0] && locais[0].id) || '';
    select.innerHTML = opcoesLocais(selecionado, '', 'Selecione um destino');
    select.value = selecionado;
    renderPrevia();
  }
  function renderPrevia() {
    if (!estado.mapa) return;
    var id = el('previa-destino-select').value, no = RotasUnidade.noPorId(estado.mapa, id);
    var mapa = copia(estado.mapa);
    var temporaria = !!(estado.previaTemporaria && estado.previaTemporaria.destino_id === id);
    if (temporaria) mapa.orientacoes[id] = estado.previaTemporaria;
    mapa.configurado = true; // somente para a prévia; nunca grava esta marcação
    var rota = no ? OrientacaoHospitalTV.calcularRota({ destino_id: id }, mapa) : null;
    el('previa-tv-unidade').textContent = 'VIDA+ — ' + estado.unidade.toLocaleUpperCase('pt-BR');
    el('previa-tv-destino').textContent = no ? no.nome : 'Selecione um local';
    var local = no ? RotasUnidade.localizacao(no) : '';
    var numero = no ? RotasUnidade.numeroSala(mapa, no) : '';
    if (numero && no.nome.toLocaleLowerCase('pt-BR').indexOf(numero.toLocaleLowerCase('pt-BR')) === -1) local += (local ? ' — ' : '') + 'Sala ' + numero;
    el('previa-tv-localizacao').textContent = local || 'Não informada';
    var chaves = no ? RotasUnidade.chavesConsultorio(mapa, no.id) : [];
    var nomes = Object.keys(estado.equipe && estado.equipe.vinculos || {}).map(function (doc) { return estado.equipe.vinculos[doc]; })
      .filter(function (v) { return chaves.indexOf(texto(v.consultorio)) !== -1 && texto(v.nome); })
      .map(function (v) { return v.nome; });
    el('previa-tv-linha-medico').hidden = !nomes.length;
    el('previa-tv-medico').textContent = nomes.join(', ');
    var ok = rota && rota.temOrientacao;
    el('previa-tv-passos').hidden = !ok;
    el('previa-tv-passos').innerHTML = ok ? rota.instrucoes.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') : '';
    el('previa-tv-sem-orientacao').hidden = !!ok;
    var info = ok && rota.acessibilidadeInfo;
    el('previa-tv-acessibilidade').hidden = !info;
    el('previa-tv-acessibilidade').textContent = info ? info.observacao : '';
    var nota = el('previa-aviso-rascunho');
    nota.textContent = temporaria ? 'Prévia das alterações ainda não salvas deste formulário.' : 'Prévia do rascunho. A senha é apenas ilustrativa.';
  }
  function resumoAlteracoes() {
    var anterior = estado.publicado && estado.publicado.nos || [], atual = estado.mapa.nos || [];
    var porIdAntigo = Object.create(null), porIdAtual = Object.create(null);
    anterior.forEach(function (n) { porIdAntigo[n.id] = n; }); atual.forEach(function (n) { porIdAtual[n.id] = n; });
    var adicionados = atual.filter(function (n) { return !porIdAntigo[n.id]; });
    var alterados = atual.filter(function (n) { return porIdAntigo[n.id] && JSON.stringify(n) !== JSON.stringify(porIdAntigo[n.id]); });
    var removidos = anterior.filter(function (n) { return !porIdAtual[n.id]; });
    var antigas = estado.publicado && estado.publicado.orientacoes || {}, novas = estado.mapa.orientacoes || {};
    var orientacoesAlteradas = Object.keys(novas).filter(function (id) { return JSON.stringify(novas[id]) !== JSON.stringify(antigas[id]); }).length +
      Object.keys(antigas).filter(function (id) { return !novas[id]; }).length;
    function nomes(lista) { return lista.slice(0, 5).map(function (n) { return esc(n.nome); }).join(', ') + (lista.length > 5 ? ' e outros' : ''); }
    return '<strong>Unidade: ' + esc(estado.unidade) + '</strong><ul>' +
      '<li>' + adicionados.length + ' local(is) adicionado(s)' + (adicionados.length ? ': ' + nomes(adicionados) : '') + '.</li>' +
      '<li>' + alterados.length + ' local(is) alterado(s)' + (alterados.length ? ': ' + nomes(alterados) : '') + '.</li>' +
      '<li>' + removidos.length + ' local(is) removido(s)' + (removidos.length ? ': ' + nomes(removidos) : '') + '.</li>' +
      '<li>' + orientacoesAlteradas + ' orientação(ões) adicionada(s), alterada(s) ou removida(s).</li>' +
      '<li>Planta gráfica: ' + (estado.mapa.usar_mapa_grafico ? 'ativada — exige validação presencial' : 'não utilizada') + '.</li></ul>';
  }
  function abrirPublicacao() {
    if (estado.ocupado) return;
    mostrarAba('revisao');
    if (!estado.carregado) { feedback('Carregue as configurações do banco antes de publicar.', 'danger'); return; }
    var pendencias = obterPendencias();
    renderRevisao();
    if (pendencias.length) {
      feedback('Há ' + pendencias.length + ' pendência(s). Use “Corrigir” em cada item antes de publicar.', 'warning');
      el('lista-pendencias-revisao').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    el('resumo-alteracoes-publicacao').innerHTML = resumoAlteracoes();
    el('confirmacao-validacao').checked = false;
    limparFeedback(); el('modal-publicacao').hidden = false;
    el('confirmacao-validacao').focus();
  }
  function fecharPublicacao() { if (!estado.ocupado) { el('modal-publicacao').hidden = true; limparFeedback(); } }
  async function publicar() {
    if (estado.ocupado) return;
    if (!el('confirmacao-validacao').checked) { feedback('Confirme que os locais, orientações e acessibilidade foram conferidos na unidade.', 'warning'); return; }
    var pendencias = obterPendencias();
    if (pendencias.length) { feedback('O rascunho tem pendências. Volte à revisão e corrija antes de publicar.', 'danger'); return; }
    ocupar(true);
    try {
      var rascunho = await MapaHospitalStore.salvarRascunho(estado.unidade, estado.mapa);
      estado.mapa = RotasUnidade.normalizar(rascunho, estado.unidade);
      var publicado = await MapaHospitalStore.publicar(estado.unidade, estado.mapa);
      estado.mapa = RotasUnidade.normalizar(publicado, estado.unidade);
      estado.publicado = copia(publicado);
      estado.formularios = Object.create(null); estado.sujos = Object.create(null); estado.previaTemporaria = null;
      el('modal-publicacao').hidden = true; limparFeedback(); renderTudo(true);
      feedback(publicado._aviso || 'Configuração publicada no banco. O telão da unidade receberá a nova versão na próxima atualização.', publicado._aviso ? 'warning' : 'success');
    } catch (e) {
      feedback(e.message + ' Verifique a conexão e as permissões; se necessário, exporte o rascunho antes de recarregar.', 'danger');
    } finally { ocupar(false); }
  }
  async function descartarRascunho() {
    if (estado.ocupado || !estado.carregado) return;
    if (!window.confirm('Descartar o rascunho desta unidade e voltar à última versão publicada? O telão não será alterado.')) return;
    ocupar(true);
    try {
      await MapaHospitalStore.descartarRascunho(estado.unidade);
      var unidade = estado.unidade;
      ocupar(false);
      await carregarUnidade(unidade);
      feedback('Rascunho descartado. A versão publicada não foi alterada.', 'success');
    } catch (e) { feedback('Não foi possível descartar o rascunho: ' + e.message, 'danger'); }
    finally { ocupar(false); }
  }
  function exportar() {
    if (!estado.mapa) return;
    var pacote = copia(estado.mapa);
    Object.keys(pacote).forEach(function (k) { if (k.charAt(0) === '_') delete pacote[k]; });
    var link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' }));
    link.href = url; link.download = 'vida-rotas-rascunho.json'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    feedback('Cópia do rascunho exportada. Ela não substitui o salvamento no banco.', 'info');
  }
  function renderTudo(inicial) {
    if (!estado.mapa) return;
    estado.pendenciasBase = RotasUnidade.validar(estado.mapa, estado.equipe);
    renderIndicadores(); renderLocais(); renderEquipe();
    if (!estado.destino || !RotasUnidade.noPorId(estado.mapa, estado.destino)) {
      var primeiro = estado.mapa.nos.find(function (n) { return RotasUnidade.ehDestino(estado.mapa, n); }) || estado.mapa.nos[0];
      estado.destino = primeiro ? primeiro.id : '';
      inicial = true;
    }
    if (inicial || estado.destino) carregarFormularioOrientacao(estado.destino);
    else { el('orientacao-destino').innerHTML = opcoesLocais('', '', 'Cadastre um local primeiro'); renderMenuDestinos(); }
    renderRevisao();
    if (typeof EditorMapaAvancado !== 'undefined') EditorMapaAvancado.renderizar();
  }
  function corrigir(aba, id) {
    if (aba === 'orientacoes') { selecionarOrientacao(id); mostrarAba('orientacoes'); el('orientacao-texto').focus(); }
    else if (aba === 'local') { mostrarAba('locais'); abrirLocal(id); }
    else if (aba === 'equipe') { mostrarAba('locais'); el('lista-equipe-medicos').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (aba === 'avancado') { abrirAvancado(true); el('painel-mapeamento-avancado').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (aba === 'salvar') salvarRascunho();
    else if (aba === 'recarregar') feedback('Exporte o rascunho pelo botão no topo e recarregue a página para obter a versão mais recente.', 'warning');
    else { mostrarAba('locais'); el('btn-adicionar-local').focus(); }
  }
  function abrirAvancado(abrir) {
    var painel = el('painel-mapeamento-avancado');
    var aberto = abrir === undefined ? painel.hidden : abrir;
    painel.hidden = !aberto;
    el('btn-abrir-mapeamento-avancado').setAttribute('aria-expanded', String(aberto));
    el('texto-btn-mapeamento-avancado').textContent = aberto ? 'Fechar mapeamento avançado' : 'Abrir mapeamento avançado';
    if (aberto && typeof EditorMapaAvancado !== 'undefined') EditorMapaAvancado.renderizar();
  }

  function vincularEventos() {
    document.querySelectorAll('[data-aba]').forEach(function (b) { b.addEventListener('click', function () { mostrarAba(b.dataset.aba); }); });
    document.querySelectorAll('[data-ir-aba]').forEach(function (b) { b.addEventListener('click', function () { mostrarAba(b.dataset.irAba); }); });
    el('mapa-unidade').addEventListener('change', function (e) {
      var nova = e.target.value;
      if (Object.keys(estado.sujos).some(function (id) { return estado.sujos[id]; }) &&
          !window.confirm('Há orientações ainda não salvas nesta unidade. Trocar de unidade e descartá-las?')) {
        e.target.value = estado.unidade; return;
      }
      carregarUnidade(nova);
    });
    el('btn-salvar-rascunho').addEventListener('click', salvarRascunho);
    el('btn-salvar-rascunho-revisao').addEventListener('click', salvarRascunho);
    el('btn-descartar').addEventListener('click', descartarRascunho);
    el('btn-exportar').addEventListener('click', exportar);
    el('btn-publicar-topo').addEventListener('click', abrirPublicacao);
    el('btn-validar-publicar').addEventListener('click', abrirPublicacao);
    el('btn-revalidar-pendencias').addEventListener('click', function () { renderRevisao(); feedback('Pendências atualizadas.', 'info'); });
    el('btn-publicar').addEventListener('click', publicar);
    el('btn-fechar-modal-publicacao').addEventListener('click', fecharPublicacao);
    el('btn-cancelar-publicacao').addEventListener('click', fecharPublicacao);
    el('lista-pendencias-revisao').addEventListener('click', function (e) {
      var b = e.target.closest('[data-corrigir]'); if (b) corrigir(b.dataset.corrigir, b.dataset.corrigirId);
    });
    el('previa-destino-select').addEventListener('change', function () { estado.previaTemporaria = null; renderPrevia(); });

    el('btn-adicionar-local').addEventListener('click', function () { abrirLocal(); });
    el('btn-fechar-modal-local').addEventListener('click', fecharLocal);
    el('btn-cancelar-local').addEventListener('click', fecharLocal);
    el('form-local').addEventListener('submit', salvarLocal);
    el('local-tipo').addEventListener('change', function () {
      var tipo = this.value;
      el('local-recebe-pacientes').checked = RotasUnidade.DESTINOS.indexOf(tipo) !== -1;
      setTipoLocal();
    });
    ['local-sem-bloco', 'local-sem-andar'].forEach(function (id) { el(id).addEventListener('change', atualizarCamposSemDivisao); });
    el('filtro-tipo-local').addEventListener('change', renderLocais);
    el('lista-locais-unidade').addEventListener('click', function (e) {
      var editar = e.target.closest('[data-editar-local]'), excluir = e.target.closest('[data-excluir-local]'), orientar = e.target.closest('[data-orientar-local]');
      if (editar) abrirLocal(editar.dataset.editarLocal);
      else if (excluir) excluirLocal(excluir.dataset.excluirLocal);
      else if (orientar) { selecionarOrientacao(orientar.dataset.orientarLocal); mostrarAba('orientacoes'); }
    });
    el('lista-equipe-medicos').addEventListener('click', function (e) {
      var b = e.target.closest('[data-salvar-equipe]'); if (b) salvarEquipe(b.dataset.salvarEquipe);
    });
    el('lista-lateral-destinos').addEventListener('click', function (e) {
      var b = e.target.closest('[data-selecionar-orientacao]'); if (b) selecionarOrientacao(b.dataset.selecionarOrientacao);
    });
    el('orientacao-destino').addEventListener('change', function () { selecionarOrientacao(this.value); });
    el('orientacao-ponto-inicial').addEventListener('change', function () {
      var origem = RotasUnidade.noPorId(estado.mapa, this.value), destino = RotasUnidade.noPorId(estado.mapa, estado.destino);
      el('orientacao-localizacao').value = relacaoSugerida(origem, destino);
      marcarFormularioSujo();
    });
    el('orientacao-base-destino').addEventListener('change', copiarBase);
    el('form-orientacao').addEventListener('input', function (e) {
      if (e.target.id !== 'orientacao-destino' && e.target.id !== 'orientacao-base-destino' && e.target.id !== 'orientacao-ponto-inicial') marcarFormularioSujo();
    });
    el('form-orientacao').addEventListener('change', function (e) {
      if (e.target.id !== 'orientacao-destino' && e.target.id !== 'orientacao-base-destino' && e.target.id !== 'orientacao-ponto-inicial') marcarFormularioSujo();
    });
    el('form-orientacao').addEventListener('submit', salvarOrientacao);
    el('btn-gerar-sugestao').addEventListener('click', gerarSugestao);
    el('btn-cancelar-orientacao').addEventListener('click', cancelarOrientacao);
    el('btn-alternar-opcoes-como-chegar').addEventListener('click', function () { estado.mostrarTodas = !estado.mostrarTodas; atualizarOpcoesComoChegar(); });
    el('btn-visualizar-telao').addEventListener('click', function () {
      if (!estado.destino) { feedback('Selecione um destino para visualizar.', 'warning'); return; }
      estado.previaTemporaria = estado.sujos[estado.destino] ? coletarFormulario(estado.destino) : null;
      mostrarAba('revisao');
      el('previa-destino-select').value = estado.destino;
      renderPrevia();
      el('card-previa-telao').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    el('btn-abrir-mapeamento-avancado').addEventListener('click', function () { abrirAvancado(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!el('modal-local').hidden) fecharLocal();
      else if (!el('modal-publicacao').hidden) fecharPublicacao();
    });
    window.addEventListener('beforeunload', function (e) {
      if (estado.ocupado || Object.keys(estado.sujos).some(function (id) { return estado.sujos[id]; })) { e.preventDefault(); e.returnValue = ''; }
    });
  }
  async function iniciar() {
    if (estado.iniciado) return;
    estado.iniciado = true;
    el('mapa-modo-armazenamento').textContent = MapaHospitalStore.temSupabase() ? 'Verificando conexão…' : 'Banco de dados indisponível';
    vincularEventos();
    if (typeof EditorMapaAvancado !== 'undefined') {
      EditorMapaAvancado.iniciar({
        obterMapa: function () { return estado.mapa; },
        ocupado: function () { return estado.ocupado; },
        feedback: feedback,
        excluirLocal: excluirLocal,
        chaveEmUso: function (k) { return medicosUsandoChave(k).length > 0 || temConsultasAtivas(k); },
        podeRenomear: function () { return !Object.keys(estado.sujos).some(function (id) { return estado.sujos[id]; }); },
        marcarRevisao: marcarRevisao,
        salvar: async function (mapa, mensagem) {
          if (estado.ocupado) return false;
          ocupar(true);
          try { await salvarMapa(mapa); if (mensagem) feedback(mensagem, 'success'); return true; }
          catch (e) { feedback(e.message, 'danger'); return false; }
          finally { ocupar(false); }
        }
      });
    }
    if (typeof DB !== 'undefined' && DB.on) {
      ['usuario_cadastrado', 'usuario_atualizado'].forEach(function (evento) {
        DB.on(evento, function () { if (estado.mapa && estado.equipe) renderEquipe(); });
      });
    }
    var unidades = await preencherUnidades();
    if (!unidades.length) { feedback('Nenhuma unidade está disponível para este usuário. Solicite acesso ao administrador responsável.', 'danger'); return; }
    carregarUnidade(unidades[0]);
  }
  return { iniciar: iniciar, carregarUnidade: carregarUnidade, validarCompleto: obterPendencias };
})();
