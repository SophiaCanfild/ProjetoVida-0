/* ============================================================
   VIDA+ — Editor visual administrativo do mapa hospitalar
   ============================================================ */
var EditorMapaAdmin = (function () {
  'use strict';

  var estado = {
    unidade: '',
    mapa: null,
    equipe: null,
    pontoOriginal: '',
    arraste: null,
    salvandoEquipe: false,
    carregamento: 0,
    iniciado: false
  };

  function el(id) { return document.getElementById(id); }

  function escapar(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function feedback(mensagem, tipo) {
    var caixa = el('mapa-feedback');
    caixa.textContent = mensagem;
    caixa.className = 'alert alert-' + (tipo || 'info');
    caixa.hidden = !mensagem;
    if (mensagem) caixa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function normalizarMapa(mapa) {
    mapa = mapa || MapaHospitalStore.mapaPadrao(estado.unidade);
    mapa.nos = Array.isArray(mapa.nos) ? mapa.nos : [];
    mapa.ligacoes = Array.isArray(mapa.ligacoes) ? mapa.ligacoes : [];
    mapa.areas = Array.isArray(mapa.areas) ? mapa.areas : [];
    mapa.destinos = mapa.destinos || {};
    mapa.destinos.consultorios = mapa.destinos.consultorios || {};
    mapa.destinos.guiches = mapa.destinos.guiches || {};
    mapa.nos.forEach(function (no) {
      no.x = Number(no.x) || 0;
      no.y = Number(no.y) || 0;
      no.tipo = no.tipo || 'local';
    });
    return mapa;
  }

  function nomeNo(id) {
    var no = estado.mapa.nos.find(function (item) { return item.id === id; });
    return no ? no.nome : id || '—';
  }

  function definirStatus(texto, tipo) {
    var status = el('mapa-status');
    status.textContent = texto;
    status.className = 'badge badge-' + (tipo || 'secondary');
  }

  function atualizarOrigem() {
    var origem = estado.mapa && estado.mapa._origem;
    var texto = 'Modelo ilustrativo. Publique somente depois da conferência presencial.';
    if (origem === 'rascunho') {
      texto = 'Rascunho salvo neste navegador; o telão continua usando a última versão publicada.';
    } else if (origem === 'supabase') {
      texto = 'Versão publicada no Supabase e disponível para o telão desta unidade.';
    } else if (origem === 'local') {
      texto = 'Versão publicada neste navegador (modo demonstração/local).';
    }
    el('mapa-origem').textContent = texto;
  }

  function invalidarValidacao() {
    el('confirmacao-validacao').checked = false;
    el('lista-validacao').innerHTML = '<p>O rascunho mudou. Execute a validação novamente antes de publicar.</p>';
    el('teste-resultado').hidden = true;
  }

  function marcarAlterado() {
    definirStatus('Alterações no rascunho', 'warning');
    invalidarValidacao();
  }

  function salvarRascunho(silencioso) {
    if (!estado.mapa) return false;
    try {
      var salvo = MapaHospitalStore.salvarRascunho(estado.unidade, estado.mapa);
      salvo._origem = 'rascunho';
      estado.mapa = normalizarMapa(salvo);
      definirStatus('Rascunho salvo', 'info');
      atualizarOrigem();
      if (!silencioso) feedback('Rascunho salvo. O telão ainda não foi alterado.', 'success');
      return true;
    } catch (e) {
      feedback(e.message, 'danger');
      return false;
    }
  }

  function alterarESalvar() {
    marcarAlterado();
    return salvarRascunho(true);
  }

  function mostrarAba(nome) {
    document.querySelectorAll('.mapa-aba').forEach(function (botao) {
      var ativa = botao.getAttribute('data-aba') === nome;
      botao.classList.toggle('ativa', ativa);
      botao.setAttribute('aria-selected', String(ativa));
    });
    document.querySelectorAll('.mapa-aba-conteudo').forEach(function (painel) {
      painel.hidden = painel.id !== 'aba-' + nome;
    });
  }

  function preencherUnidades() {
    var unidades = [];
    if (typeof APP_CONFIG !== 'undefined' && Array.isArray(APP_CONFIG.UNIDADES)) {
      unidades = APP_CONFIG.UNIDADES.slice();
    }
    if (typeof MAPAS_HOSPITAL !== 'undefined' && MAPAS_HOSPITAL.unidades) {
      Object.keys(MAPAS_HOSPITAL.unidades).forEach(function (unidade) {
        if (unidades.indexOf(unidade) === -1) unidades.push(unidade);
      });
    }
    var select = el('mapa-unidade');
    select.innerHTML = '';
    unidades.forEach(function (unidade) {
      var option = document.createElement('option');
      option.value = unidade;
      option.textContent = unidade;
      select.appendChild(option);
    });
    return unidades;
  }

  async function carregarUnidade(unidade) {
    if (!unidade) return;
    var carregamento = ++estado.carregamento;
    if (estado.mapa && estado.unidade && estado.unidade !== unidade) salvarRascunho(true);
    estado.unidade = unidade;
    el('mapa-unidade').value = unidade;
    definirStatus('Carregando mapa…', 'secondary');
    feedback('', 'info');
    try {
      if (typeof DB !== 'undefined' && typeof DB.aguardarSincronizacao === 'function') {
        await DB.aguardarSincronizacao();
      }
      if (carregamento !== estado.carregamento) return;
      var carregados = await Promise.all([
        MapaHospitalStore.carregarRascunho(unidade),
        EquipeConsultorioStore.carregar(unidade)
      ]);
      if (carregamento !== estado.carregamento) return;
      estado.mapa = normalizarMapa(carregados[0]);
      estado.equipe = carregados[1];
      el('card-form-consultorio').hidden = true;
      estado.pontoOriginal = estado.mapa.ponto_inicial || (estado.mapa.nos[0] && estado.mapa.nos[0].id) || '';
      if (estado.mapa._origem === 'rascunho') definirStatus('Rascunho salvo', 'info');
      else if (estado.mapa.configurado) definirStatus('Versão publicada', 'success');
      else definirStatus('Exemplo ilustrativo', 'warning');
      renderizarTudo();
      preencherFormularioPonto();
      atualizarOrigem();
    } catch (e) {
      if (carregamento === estado.carregamento) feedback('Não foi possível carregar o mapa: ' + e.message, 'danger');
    }
  }

  /* ------------------------- Pontos e SVG ------------------------- */
  function renderizarMapa() {
    if (!estado.mapa) return;
    var rotaEditor = {
      mapa: estado.mapa,
      destinoId: null,
      destino: { nome: 'a planta da unidade' },
      ligacoes: []
    };
    el('editor-mapa').innerHTML = OrientacaoHospitalTV.renderizarSvg(rotaEditor);
    var svg = el('editor-mapa').querySelector('svg');
    if (svg) {
      svg.setAttribute('role', 'group');
      svg.setAttribute('aria-label', 'Planta interativa: selecione ou arraste os pontos');
    }
    el('editor-mapa').querySelectorAll('[data-no-id]').forEach(function (grupo) {
      var id = grupo.getAttribute('data-no-id');
      grupo.classList.toggle('selecionado', id === estado.pontoOriginal);
      grupo.setAttribute('tabindex', '0');
      grupo.setAttribute('role', 'button');
      grupo.setAttribute('aria-label', 'Editar ponto ' + nomeNo(id));
      grupo.addEventListener('pointerdown', iniciarArraste);
      grupo.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault();
          selecionarPonto(id);
        }
      });
    });
  }

  function selecionarPonto(id) {
    estado.pontoOriginal = id || '';
    preencherFormularioPonto();
    el('editor-mapa').querySelectorAll('[data-no-id]').forEach(function (grupo) {
      grupo.classList.toggle('selecionado', grupo.getAttribute('data-no-id') === estado.pontoOriginal);
    });
  }

  function proximoIdPonto() {
    var numero = estado.mapa.nos.length + 1;
    while (estado.mapa.nos.some(function (no) { return no.id === 'ponto_' + numero; })) numero++;
    return 'ponto_' + numero;
  }

  function preencherFormularioPonto() {
    var no = estado.mapa.nos.find(function (item) { return item.id === estado.pontoOriginal; });
    var novo = !no;
    if (!no) {
      no = {
        id: proximoIdPonto(), nome: '', tipo: 'local', x: 320, y: 165,
        bloco: estado.mapa.nos[0] ? estado.mapa.nos[0].bloco || '' : '',
        andar: estado.mapa.nos[0] ? estado.mapa.nos[0].andar || '' : ''
      };
    }
    el('ponto-id-original').value = novo ? '' : no.id;
    el('ponto-id').value = no.id;
    el('ponto-nome').value = no.nome || '';
    el('ponto-tipo').value = no.tipo || 'local';
    el('ponto-bloco').value = no.bloco || '';
    el('ponto-andar').value = no.andar || '';
    el('ponto-x').value = no.x;
    el('ponto-y').value = no.y;
    el('btn-excluir-ponto').disabled = novo;
    el('btn-ponto-inicial').disabled = novo;
    el('btn-ponto-inicial').textContent = !novo && no.id === estado.mapa.ponto_inicial
      ? 'Ponto inicial atual' : 'Definir como início';
  }

  function salvarPonto(evento) {
    evento.preventDefault();
    var original = el('ponto-id-original').value;
    var id = el('ponto-id').value.trim();
    var nome = el('ponto-nome').value.trim();
    var x = Number(el('ponto-x').value);
    var y = Number(el('ponto-y').value);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || !nome) {
      feedback('Informe um identificador válido e um nome para o ponto.', 'danger');
      return;
    }
    if (!isFinite(x) || !isFinite(y) || x < 15 || x > 625 || y < 25 || y > 305) {
      feedback('As coordenadas devem ficar dentro dos limites indicados.', 'danger');
      return;
    }
    if (estado.mapa.nos.some(function (no) { return no.id === id && no.id !== original; })) {
      feedback('Já existe um ponto com este identificador.', 'danger');
      return;
    }

    var dados = {
      id: id, nome: nome, tipo: el('ponto-tipo').value,
      bloco: el('ponto-bloco').value.trim(), andar: el('ponto-andar').value.trim(),
      x: Math.round(x), y: Math.round(y)
    };
    if (original) {
      var indice = estado.mapa.nos.findIndex(function (no) { return no.id === original; });
      estado.mapa.nos[indice] = dados;
      if (original !== id) {
        if (estado.mapa.ponto_inicial === original) estado.mapa.ponto_inicial = id;
        estado.mapa.ligacoes.forEach(function (ligacao) {
          if (ligacao.de === original) ligacao.de = id;
          if (ligacao.para === original) ligacao.para = id;
        });
        if (estado.mapa.destinos.triagem === original) estado.mapa.destinos.triagem = id;
        ['consultorios', 'guiches'].forEach(function (grupo) {
          Object.keys(estado.mapa.destinos[grupo]).forEach(function (chave) {
            if (estado.mapa.destinos[grupo][chave] === original) estado.mapa.destinos[grupo][chave] = id;
          });
        });
      }
    } else {
      estado.mapa.nos.push(dados);
    }
    estado.pontoOriginal = id;
    alterarESalvar();
    renderizarTudo();
    preencherFormularioPonto();
    feedback('Ponto salvo no rascunho.', 'success');
  }

  function excluirPonto() {
    var id = estado.pontoOriginal;
    if (!id) return;
    if (id === estado.mapa.ponto_inicial) {
      feedback('Defina outro ponto como início antes de excluir a recepção atual.', 'warning');
      return;
    }
    var salasOcupadas = Object.keys(estado.mapa.destinos.consultorios).filter(function (numero) {
      return estado.mapa.destinos.consultorios[numero] === id && medicosUsandoSala(numero).length;
    });
    if (salasOcupadas.length) {
      feedback('Reatribua os médicos dos Consultórios ' + salasOcupadas.join(', ') + ' antes de excluir este ponto.', 'warning');
      return;
    }
    if (!window.confirm('Excluir “' + nomeNo(id) + '”? As ligações e destinos associados também serão removidos.')) return;
    estado.mapa.nos = estado.mapa.nos.filter(function (no) { return no.id !== id; });
    estado.mapa.ligacoes = estado.mapa.ligacoes.filter(function (ligacao) {
      return ligacao.de !== id && ligacao.para !== id;
    });
    if (estado.mapa.destinos.triagem === id) estado.mapa.destinos.triagem = '';
    ['consultorios', 'guiches'].forEach(function (grupo) {
      Object.keys(estado.mapa.destinos[grupo]).forEach(function (chave) {
        if (estado.mapa.destinos[grupo][chave] === id) delete estado.mapa.destinos[grupo][chave];
      });
    });
    estado.pontoOriginal = estado.mapa.nos[0] ? estado.mapa.nos[0].id : '';
    alterarESalvar();
    renderizarTudo();
    preencherFormularioPonto();
    feedback('Ponto e referências associados foram removidos do rascunho.', 'success');
  }

  function definirPontoInicial() {
    if (!estado.pontoOriginal) return;
    estado.mapa.ponto_inicial = estado.pontoOriginal;
    alterarESalvar();
    renderizarTudo();
    preencherFormularioPonto();
    feedback(nomeNo(estado.pontoOriginal) + ' agora é o início das rotas.', 'success');
  }

  function coordenadasSvg(evento, svg) {
    if (svg.createSVGPoint && svg.getScreenCTM()) {
      var ponto = svg.createSVGPoint();
      ponto.x = evento.clientX;
      ponto.y = evento.clientY;
      return ponto.matrixTransform(svg.getScreenCTM().inverse());
    }
    var caixa = svg.getBoundingClientRect();
    return {
      x: (evento.clientX - caixa.left) * 640 / caixa.width,
      y: (evento.clientY - caixa.top) * 330 / caixa.height
    };
  }

  function iniciarArraste(evento) {
    if (evento.button !== 0) return;
    evento.preventDefault();
    var id = evento.currentTarget.getAttribute('data-no-id');
    selecionarPonto(id);
    estado.arraste = { id: id, pointerId: evento.pointerId, movido: false };
    document.addEventListener('pointermove', arrastarPonto);
    document.addEventListener('pointerup', finalizarArraste);
    document.addEventListener('pointercancel', finalizarArraste);
  }

  function arrastarPonto(evento) {
    var arraste = estado.arraste;
    if (!arraste || evento.pointerId !== arraste.pointerId) return;
    var svg = el('editor-mapa').querySelector('svg');
    var no = estado.mapa.nos.find(function (item) { return item.id === arraste.id; });
    if (!svg || !no) return;
    var ponto = coordenadasSvg(evento, svg);
    no.x = Math.max(15, Math.min(625, Math.round(ponto.x)));
    no.y = Math.max(25, Math.min(305, Math.round(ponto.y)));
    arraste.movido = true;

    var grupo = null;
    svg.querySelectorAll('[data-no-id]').forEach(function (item) {
      if (item.getAttribute('data-no-id') === no.id) grupo = item;
    });
    if (grupo) {
      var circulo = grupo.querySelector('circle');
      var texto = grupo.querySelector('text');
      circulo.setAttribute('cx', no.x);
      circulo.setAttribute('cy', no.y);
      texto.setAttribute('x', no.x);
      texto.setAttribute('y', no.y + 25);
    }
    svg.querySelectorAll('[data-de][data-para]').forEach(function (linha) {
      if (linha.getAttribute('data-de') === no.id) {
        linha.setAttribute('x1', no.x); linha.setAttribute('y1', no.y);
      }
      if (linha.getAttribute('data-para') === no.id) {
        linha.setAttribute('x2', no.x); linha.setAttribute('y2', no.y);
      }
    });
    el('ponto-x').value = no.x;
    el('ponto-y').value = no.y;
  }

  function finalizarArraste(evento) {
    if (!estado.arraste || evento.pointerId !== estado.arraste.pointerId) return;
    var moveu = estado.arraste.movido;
    estado.arraste = null;
    document.removeEventListener('pointermove', arrastarPonto);
    document.removeEventListener('pointerup', finalizarArraste);
    document.removeEventListener('pointercancel', finalizarArraste);
    if (moveu) {
      alterarESalvar();
      renderizarMapa();
    }
  }

  function gerarAreas() {
    var grupos = {};
    estado.mapa.nos.forEach(function (no) {
      var chave = (no.andar || 'Andar não informado') + '|' + (no.bloco || 'Área geral');
      if (!grupos[chave]) grupos[chave] = [];
      grupos[chave].push(no);
    });
    estado.mapa.areas = Object.keys(grupos).map(function (chave, indice) {
      var nos = grupos[chave];
      var xs = nos.map(function (no) { return no.x; });
      var ys = nos.map(function (no) { return no.y; });
      var partes = chave.split('|');
      var x = Math.max(4, Math.min.apply(null, xs) - 45);
      var y = Math.max(4, Math.min.apply(null, ys) - 45);
      return {
        id: 'area_' + (indice + 1), nome: partes.join(' • '),
        x: x, y: y,
        largura: Math.min(636 - x, Math.max.apply(null, xs) - Math.min.apply(null, xs) + 90),
        altura: Math.min(326 - y, Math.max.apply(null, ys) - Math.min.apply(null, ys) + 90),
        tipo: nos.some(function (no) { return no.tipo === 'consultorio'; }) ? 'consultas' : 'acolhimento'
      };
    });
    alterarESalvar();
    renderizarMapa();
    feedback('Fundos das áreas reorganizados conforme bloco e andar dos pontos.', 'success');
  }

  /* ------------------------- Equipe e salas ------------------------- */
  function medicosDaEquipe() {
    return DB.getUsuarios().filter(function (usuario) {
      return usuario && usuario.tipo === 'medico';
    }).sort(function (a, b) {
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
  }

  function vinculoMedico(usuario) {
    var central = EquipeConsultorioStore.obterVinculo(estado.equipe, usuario);
    if (central) return central;
    return {
      consultorio: MedicoConsultorios.consultorioPadrao(usuario),
      atualizado_em: null,
      origem: 'configuracao'
    };
  }

  function medicosUsandoSala(numero) {
    return medicosDaEquipe().filter(function (usuario) {
      return vinculoMedico(usuario).consultorio === String(numero);
    });
  }

  function renderizarEquipe() {
    if (!estado.mapa || !estado.equipe) return;
    var medicos = medicosDaEquipe();
    var salas = MedicoConsultorios.listar(estado.mapa);
    var corpo = el('lista-equipe-medicos');
    var vinculados = 0;

    el('total-medicos-equipe').textContent = medicos.length;
    el('total-consultorios-operacional').textContent = salas.length;
    if (!medicos.length) {
      corpo.innerHTML = '<tr><td colspan="5" class="mapa-equipe-vazio">Nenhum médico cadastrado. Use “Cadastrar médico” para incluir o primeiro.</td></tr>';
      el('total-medicos-vinculados').textContent = '0';
      return;
    }

    corpo.innerHTML = medicos.map(function (usuario) {
      var documento = String(usuario.cpf || '').replace(/\D/g, '');
      var vinculo = vinculoMedico(usuario);
      var atual = String(vinculo.consultorio || '');
      var salaValida = salas.some(function (sala) { return sala.numero === atual; });
      if (atual && salaValida) vinculados++;
      var iniciais = String(usuario.nome || 'M').split(' ').filter(Boolean).map(function (parte) {
        return parte.charAt(0);
      }).join('').substring(0, 2).toUpperCase();
      var opcoes = '<option value=""' + (!atual ? ' selected' : '') + '>Não atribuído</option>';
      opcoes += salas.map(function (sala) {
        var local = [sala.bloco, sala.andar].filter(Boolean).join(' • ');
        return '<option value="' + escapar(sala.numero) + '"' + (atual === sala.numero ? ' selected' : '') + '>' +
          escapar(sala.nome + (local ? ' — ' + local : '')) + '</option>';
      }).join('');
      if (atual && !salaValida) {
        opcoes += '<option value="' + escapar(atual) + '" selected>Consultório ' + escapar(atual) + ' (não mapeado)</option>';
      }
      var aviso = atual && !salaValida
        ? '<small class="mapa-equipe-vinculo-inconsistente">Sala ausente neste rascunho</small>' : '';
      return '<tr>' +
        '<td><div class="mapa-equipe-medico"><span class="mapa-equipe-avatar">' + escapar(iniciais) + '</span><div><strong>' +
          escapar(usuario.nome || 'Médico') + '</strong><small>CPF ' + escapar(documento) + ' • ' + (usuario.ativo === false ? 'Inativo' : 'Ativo') + '</small></div></div></td>' +
        '<td>' + escapar(usuario.especialidade || 'Não informada') + '</td>' +
        '<td>' + escapar(usuario.crm || usuario.registroProfissional || usuario.registro_profissional || '—') + '</td>' +
        '<td><select class="mapa-equipe-select" data-equipe-select="' + documento + '" aria-label="Consultório de ' + escapar(usuario.nome) + '">' +
          opcoes + '</select>' + aviso + '</td>' +
        '<td><button type="button" class="btn btn-secondary btn-sm" data-salvar-equipe="' + documento + '">Salvar</button></td>' +
      '</tr>';
    }).join('');
    el('total-medicos-vinculados').textContent = vinculados;
  }

  async function salvarVinculoEquipe(documento, botao) {
    if (estado.salvandoEquipe) return;
    var usuario = medicosDaEquipe().find(function (item) {
      return String(item.cpf || '').replace(/\D/g, '') === documento;
    });
    var select = document.querySelector('[data-equipe-select="' + documento + '"]');
    if (!usuario || !select) return;
    var consultorio = select.value;
    if (consultorio && !MedicoConsultorios.listar(estado.mapa).some(function (sala) {
      return sala.numero === consultorio;
    })) {
      feedback('Cadastre esse consultório no mapa antes de vinculá-lo ao médico.', 'warning');
      return;
    }

    var unidade = estado.unidade;
    estado.salvandoEquipe = true;
    if (botao) {
      botao.disabled = true;
      botao.textContent = 'Salvando…';
    }
    try {
      var equipe = await EquipeConsultorioStore.salvarVinculo(unidade, usuario, consultorio);
      if (estado.unidade !== unidade) return;
      estado.equipe = equipe;
      renderizarEquipe();
      renderizarConsultoriosOperacional();
      feedback(consultorio
        ? usuario.nome + ' foi vinculado ao Consultório ' + consultorio + ' em ' + unidade + '.'
        : 'O vínculo de ' + usuario.nome + ' foi removido nesta unidade.', 'success');
    } catch (e) {
      if (estado.unidade === unidade) feedback(e.message, 'danger');
    } finally {
      estado.salvandoEquipe = false;
      if (botao) {
        botao.disabled = false;
        botao.textContent = 'Salvar';
      }
    }
  }

  /* ------------------------- Ligações ------------------------- */
  function renderizarCaminhos() {
    el('total-caminhos').textContent = estado.mapa.ligacoes.length;
    var corpo = el('lista-caminhos');
    if (!estado.mapa.ligacoes.length) {
      corpo.innerHTML = '<tr><td colspan="6" class="mapa-tabela-vazia">Nenhuma ligação cadastrada. Crie a primeira para formar uma rota.</td></tr>';
      return;
    }
    corpo.innerHTML = estado.mapa.ligacoes.map(function (ligacao, indice) {
      return '<tr><td>' + escapar(nomeNo(ligacao.de)) + '</td><td>' + escapar(nomeNo(ligacao.para)) +
        '<small>' + escapar(ligacao.instrucao || 'Sem instrução') + '</small></td><td>' + escapar(ligacao.peso) +
        '</td><td>' + escapar(ligacao.tempo || 0) + ' s</td><td>' +
        (ligacao.acessivel === false ? '<span class="badge badge-warning">Não</span>' : '<span class="badge badge-success">Sim</span>') +
        '</td><td><div class="mapa-tabela-acoes"><button type="button" class="btn btn-secondary btn-sm" data-editar-ligacao="' + indice + '">Editar</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-excluir-ligacao="' + indice + '">Excluir</button></div></td></tr>';
    }).join('');
  }

  function novaLigacao() {
    el('ligacao-indice').value = '';
    el('titulo-form-ligacao').textContent = 'Nova ligação';
    el('ligacao-de').value = estado.mapa.ponto_inicial;
    if (el('ligacao-de').selectedIndex < 0) el('ligacao-de').selectedIndex = 0;
    el('ligacao-para').selectedIndex = estado.mapa.nos.length > 1 ? 1 : 0;
    el('ligacao-peso').value = '1';
    el('ligacao-tempo').value = '30';
    el('ligacao-acessivel').checked = true;
    el('ligacao-instrucao').value = '';
  }

  function editarLigacao(indice) {
    var ligacao = estado.mapa.ligacoes[indice];
    if (!ligacao) return;
    el('ligacao-indice').value = String(indice);
    el('titulo-form-ligacao').textContent = 'Editar ligação';
    el('ligacao-de').value = ligacao.de;
    el('ligacao-para').value = ligacao.para;
    el('ligacao-peso').value = ligacao.peso;
    el('ligacao-tempo').value = ligacao.tempo || 0;
    el('ligacao-acessivel').checked = ligacao.acessivel !== false;
    el('ligacao-instrucao').value = ligacao.instrucao || '';
    el('ligacao-de').focus();
  }

  function salvarLigacao(evento) {
    evento.preventDefault();
    var de = el('ligacao-de').value;
    var para = el('ligacao-para').value;
    var peso = Number(el('ligacao-peso').value);
    var tempo = Number(el('ligacao-tempo').value);
    var instrucao = el('ligacao-instrucao').value.trim();
    var textoIndice = el('ligacao-indice').value;
    var indice = textoIndice === '' ? -1 : Number(textoIndice);
    if (!de || !para || de === para) {
      feedback('Escolha dois pontos diferentes para criar a ligação.', 'danger');
      return;
    }
    if (!isFinite(peso) || peso <= 0 || !isFinite(tempo) || tempo < 0 || !instrucao) {
      feedback('Informe peso positivo, tempo válido e a instrução do percurso.', 'danger');
      return;
    }
    var duplicada = estado.mapa.ligacoes.some(function (ligacao, i) {
      return i !== indice && ligacao.de === de && ligacao.para === para;
    });
    if (duplicada) {
      feedback('Já existe uma ligação neste sentido. Edite a ligação existente.', 'warning');
      return;
    }
    var dados = {
      de: de, para: para, peso: peso, tempo: Math.round(tempo),
      acessivel: el('ligacao-acessivel').checked, instrucao: instrucao
    };
    if (indice >= 0) estado.mapa.ligacoes[indice] = dados;
    else estado.mapa.ligacoes.push(dados);
    alterarESalvar();
    renderizarMapa();
    renderizarCaminhos();
    novaLigacao();
    feedback('Ligação salva no rascunho.', 'success');
  }

  /* --------------------- Cadastro rápido de consultórios --------------------- */
  function posicaoNovoConsultorio() {
    var candidatos = [];
    [55, 115, 175, 235, 285].forEach(function (y) {
      [555, 450, 345, 240, 135, 75].forEach(function (x) { candidatos.push({ x: x, y: y }); });
    });
    return candidatos.find(function (ponto) {
      return estado.mapa.nos.every(function (no) {
        return Math.hypot(Number(no.x) - ponto.x, Number(no.y) - ponto.y) >= 62;
      });
    }) || { x: 555, y: Math.min(285, 55 + estado.mapa.nos.length * 12) };
  }

  function preencherOrigemConsultorio(destinoId) {
    var select = el('consultorio-origem');
    var anterior = select.value;
    select.innerHTML = '<option value="">Selecione a origem</option>';
    estado.mapa.nos.filter(function (no) { return no.id !== destinoId; }).forEach(function (no) {
      var option = document.createElement('option');
      option.value = no.id;
      option.textContent = no.nome;
      select.appendChild(option);
    });
    if (anterior && estado.mapa.nos.some(function (no) { return no.id === anterior && no.id !== destinoId; })) {
      select.value = anterior;
    }
    if (!select.value && destinoId) {
      var existente = estado.mapa.ligacoes.find(function (ligacao) { return ligacao.para === destinoId; });
      if (existente) select.value = existente.de;
    }
    if (!select.value) {
      var corredor = estado.mapa.nos.find(function (no) { return no.tipo === 'corredor' && no.id !== destinoId; });
      var inicial = estado.mapa.ponto_inicial !== destinoId ? estado.mapa.ponto_inicial : '';
      select.value = corredor ? corredor.id : inicial;
    }
    if (!select.value && select.options.length > 1) select.selectedIndex = 1;
  }

  function abrirFormularioConsultorio(numero) {
    var original = numero ? String(numero) : '';
    var destinoId = original ? estado.mapa.destinos.consultorios[original] : null;
    var no = destinoId ? estado.mapa.nos.find(function (item) { return item.id === destinoId; }) : null;
    if (original && !no) {
      feedback('O ponto desse consultório não existe mais. Corrija-o na edição avançada.', 'warning');
      return;
    }
    var ligacao = destinoId ? estado.mapa.ligacoes.find(function (item) { return item.para === destinoId; }) : null;
    var form = el('form-consultorio-rapido');
    form.reset();
    var novoNumero = original || proximaChave(estado.mapa.destinos.consultorios);
    el('consultorio-original').value = original;
    el('consultorio-numero').value = novoNumero;
    el('consultorio-nome').value = no ? no.nome : 'Consultório ' + novoNumero;
    el('consultorio-bloco').value = no ? no.bloco || '' : (estado.mapa.nos[0] && estado.mapa.nos[0].bloco) || '';
    el('consultorio-andar').value = no ? no.andar || '' : (estado.mapa.nos[0] && estado.mapa.nos[0].andar) || '';
    el('consultorio-tempo').value = ligacao ? Number(ligacao.tempo) || 0 : 30;
    el('consultorio-acessivel').checked = ligacao ? ligacao.acessivel !== false : true;
    el('consultorio-instrucao').value = ligacao ? ligacao.instrucao || '' : '';
    el('consultorio-origem').value = '';
    preencherOrigemConsultorio(destinoId);
    el('titulo-form-consultorio').textContent = original ? 'Editar Consultório ' + original : 'Novo consultório';
    el('card-form-consultorio').hidden = false;
    el('consultorio-numero').focus();
  }

  function renderizarConsultoriosOperacional() {
    if (!estado.mapa || !estado.equipe) return;
    var salas = MedicoConsultorios.listar(estado.mapa);
    var container = el('lista-consultorios-operacional');
    el('total-consultorios-operacional').textContent = salas.length;
    if (!salas.length) {
      container.innerHTML = '<div class="mapa-consultorio-vazio">Nenhum consultório cadastrado. Clique em “Novo consultório” para criar ponto, destino e caminho em uma única etapa.</div>';
      return;
    }
    container.innerHTML = salas.map(function (sala) {
      var nomes = medicosUsandoSala(sala.numero).map(function (usuario) { return usuario.nome; });
      var local = [sala.bloco, sala.andar].filter(Boolean).join(' • ') || 'Bloco e andar não informados';
      return '<article class="mapa-consultorio-card">' +
        '<div class="mapa-consultorio-topo"><h3>' + escapar(sala.nome) + '</h3><span class="mapa-consultorio-numero">Sala ' + escapar(sala.numero) + '</span></div>' +
        '<div class="mapa-consultorio-local">' + escapar(local) + '</div>' +
        '<div class="mapa-consultorio-equipe"><strong>Equipe:</strong> ' + escapar(nomes.length ? nomes.join(', ') : 'Nenhum médico vinculado') + '</div>' +
        '<div class="mapa-consultorio-acoes"><button type="button" class="btn btn-secondary btn-sm" data-editar-consultorio="' + escapar(sala.numero) + '">Editar</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-remover-consultorio="' + escapar(sala.numero) + '">Excluir</button></div>' +
      '</article>';
    }).join('');
  }

  function salvarConsultorioRapido(evento) {
    evento.preventDefault();
    var original = el('consultorio-original').value;
    var numero = el('consultorio-numero').value.trim();
    var nome = el('consultorio-nome').value.trim();
    var bloco = el('consultorio-bloco').value.trim();
    var andar = el('consultorio-andar').value.trim();
    var origem = el('consultorio-origem').value;
    var tempo = Number(el('consultorio-tempo').value);
    if (!/^[A-Za-z0-9_-]+$/.test(numero) || !nome) {
      feedback('Informe número e nome. No número, use somente letras, números, hífen ou sublinhado, sem espaços.', 'danger');
      return;
    }
    if (original !== numero && Object.prototype.hasOwnProperty.call(estado.mapa.destinos.consultorios, numero)) {
      feedback('Já existe um Consultório ' + numero + '. Escolha outro número.', 'warning');
      return;
    }
    if (original && original !== numero && medicosUsandoSala(original).length) {
      feedback('Reatribua os médicos desta sala antes de alterar o número do consultório.', 'warning');
      return;
    }
    if (!origem || !estado.mapa.nos.some(function (no) { return no.id === origem; })) {
      feedback('Selecione de qual ponto o paciente sairá para chegar ao consultório.', 'danger');
      return;
    }
    if (!isFinite(tempo) || tempo < 0) {
      feedback('Informe um tempo de percurso igual ou maior que zero.', 'danger');
      return;
    }

    var destinoId = original ? estado.mapa.destinos.consultorios[original] : null;
    if (!destinoId) {
      var base = 'consultorio_' + numero.toLowerCase();
      destinoId = base;
      var sequencia = 2;
      while (estado.mapa.nos.some(function (no) { return no.id === destinoId; })) {
        destinoId = base + '_' + sequencia;
        sequencia++;
      }
    }
    if (origem === destinoId) {
      feedback('A origem do caminho precisa ser diferente do consultório.', 'danger');
      return;
    }

    var indiceNo = estado.mapa.nos.findIndex(function (no) { return no.id === destinoId; });
    var anterior = indiceNo >= 0 ? estado.mapa.nos[indiceNo] : null;
    var posicao = anterior || posicaoNovoConsultorio();
    var dadosNo = {
      id: destinoId, nome: nome, tipo: 'consultorio', bloco: bloco, andar: andar,
      x: anterior ? anterior.x : posicao.x, y: anterior ? anterior.y : posicao.y
    };
    if (indiceNo >= 0) estado.mapa.nos[indiceNo] = dadosNo;
    else estado.mapa.nos.push(dadosNo);
    if (original && original !== numero) delete estado.mapa.destinos.consultorios[original];
    estado.mapa.destinos.consultorios[numero] = destinoId;

    var local = [bloco, andar].filter(Boolean).join(', ');
    var instrucao = el('consultorio-instrucao').value.trim() ||
      'A partir de ' + nomeNo(origem) + ', siga as placas para ' + nome + (local ? ', ' + local : '') + '.';
    var dadosLigacao = {
      de: origem, para: destinoId, peso: 1, tempo: Math.round(tempo),
      acessivel: el('consultorio-acessivel').checked, instrucao: instrucao,
      cadastro_rapido: true
    };
    var indiceLigacao = estado.mapa.ligacoes.findIndex(function (ligacao) {
      return (ligacao.de === origem && ligacao.para === destinoId) ||
        (ligacao.cadastro_rapido && ligacao.para === destinoId);
    });
    if (indiceLigacao >= 0) estado.mapa.ligacoes[indiceLigacao] = dadosLigacao;
    else estado.mapa.ligacoes.push(dadosLigacao);

    if (!alterarESalvar()) {
      feedback('O consultório foi alterado na tela, mas o rascunho não pôde ser salvo. Verifique o armazenamento do navegador e tente novamente.', 'danger');
      return;
    }
    el('card-form-consultorio').hidden = true;
    renderizarTudo();
    feedback('Consultório ' + numero + ' salvo no rascunho com ponto, destino e caminho. Revise e publique o mapa para liberá-lo no telão.', 'success');
  }

  function removerConsultorioRapido(numero) {
    var vinculados = medicosUsandoSala(numero);
    if (vinculados.length) {
      feedback('Reatribua ' + vinculados.map(function (usuario) { return usuario.nome; }).join(', ') +
        ' antes de excluir o Consultório ' + numero + '.', 'warning');
      return;
    }
    var destinoId = estado.mapa.destinos.consultorios[numero];
    if (!destinoId || !window.confirm('Excluir o Consultório ' + numero + ' do rascunho?')) return;
    delete estado.mapa.destinos.consultorios[numero];
    var usadoEmOutroDestino = estado.mapa.ponto_inicial === destinoId || estado.mapa.destinos.triagem === destinoId ||
      Object.keys(estado.mapa.destinos.consultorios).some(function (chave) {
        return estado.mapa.destinos.consultorios[chave] === destinoId;
      }) || Object.keys(estado.mapa.destinos.guiches).some(function (chave) {
        return estado.mapa.destinos.guiches[chave] === destinoId;
      });
    if (!usadoEmOutroDestino) {
      estado.mapa.nos = estado.mapa.nos.filter(function (no) { return no.id !== destinoId; });
      estado.mapa.ligacoes = estado.mapa.ligacoes.filter(function (ligacao) {
        return ligacao.de !== destinoId && ligacao.para !== destinoId;
      });
    }
    if (estado.pontoOriginal === destinoId) {
      estado.pontoOriginal = estado.mapa.ponto_inicial || (estado.mapa.nos[0] && estado.mapa.nos[0].id) || '';
    }
    if (!alterarESalvar()) {
      feedback('A exclusão não pôde ser salva no rascunho. Verifique o armazenamento do navegador e tente novamente.', 'danger');
      return;
    }
    el('card-form-consultorio').hidden = true;
    renderizarTudo();
    preencherFormularioPonto();
    feedback('Consultório ' + numero + ' removido do rascunho.', 'success');
  }

  /* ------------------------- Destinos ------------------------- */
  function opcoesNos(select, valor, textoVazio) {
    var anterior = valor != null ? valor : select.value;
    select.innerHTML = '';
    if (textoVazio != null) {
      var vazia = document.createElement('option');
      vazia.value = '';
      vazia.textContent = textoVazio;
      select.appendChild(vazia);
    }
    estado.mapa.nos.forEach(function (no) {
      var option = document.createElement('option');
      option.value = no.id;
      option.textContent = no.nome + ' (' + no.id + ')';
      select.appendChild(option);
    });
    if (anterior && !estado.mapa.nos.some(function (no) { return no.id === anterior; })) {
      var ausente = document.createElement('option');
      ausente.value = anterior;
      ausente.textContent = 'Ponto removido (' + anterior + ') — selecione outro';
      ausente.disabled = true;
      select.appendChild(ausente);
    }
    select.value = anterior || '';
    if (select.value !== (anterior || '') && select.options.length) select.selectedIndex = 0;
  }

  function preencherSelects() {
    opcoesNos(el('ligacao-de'), el('ligacao-de').value);
    opcoesNos(el('ligacao-para'), el('ligacao-para').value);
    opcoesNos(el('mapa-ponto-inicial'), estado.mapa.ponto_inicial);
    opcoesNos(el('destino-triagem'), estado.mapa.destinos.triagem, 'Selecione um ponto');

    var consultorio = el('teste-consultorio');
    var anteriorConsultorio = consultorio.value;
    consultorio.innerHTML = '';
    Object.keys(estado.mapa.destinos.consultorios).sort().forEach(function (numero) {
      var option = document.createElement('option');
      option.value = numero;
      option.textContent = 'Consultório ' + numero;
      consultorio.appendChild(option);
    });
    consultorio.value = anteriorConsultorio;
    if (consultorio.selectedIndex < 0 && consultorio.options.length) consultorio.selectedIndex = 0;

    var guiche = el('teste-guiche');
    var anteriorGuiche = guiche.value;
    guiche.innerHTML = '<option value="">Destino geral da triagem</option>';
    Object.keys(estado.mapa.destinos.guiches).sort().forEach(function (numero) {
      var option = document.createElement('option');
      option.value = numero;
      option.textContent = 'Guichê ' + numero;
      guiche.appendChild(option);
    });
    guiche.value = anteriorGuiche;
  }

  function linhaDestino(grupo, chave, noId) {
    var linha = document.createElement('div');
    linha.className = 'mapa-destino-linha';
    linha.setAttribute('data-grupo-destino', grupo);
    linha.setAttribute('data-chave-original', chave);

    var campoChave = document.createElement('div');
    campoChave.className = 'form-group';
    var label = document.createElement('label');
    label.textContent = grupo === 'consultorios' ? 'Número' : 'Guichê';
    var input = document.createElement('input');
    input.className = 'destino-chave';
    input.value = chave;
    input.required = true;
    input.setAttribute('aria-label', label.textContent);
    campoChave.appendChild(label);
    campoChave.appendChild(input);

    var campoNo = document.createElement('div');
    campoNo.className = 'form-group';
    var labelNo = document.createElement('label');
    labelNo.textContent = 'Ponto de destino';
    var select = document.createElement('select');
    select.className = 'destino-no';
    select.setAttribute('aria-label', labelNo.textContent);
    campoNo.appendChild(labelNo);
    campoNo.appendChild(select);
    linha.appendChild(campoChave);
    linha.appendChild(campoNo);

    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'btn btn-danger btn-sm';
    botao.textContent = 'Remover';
    botao.setAttribute('data-remover-destino', grupo);
    botao.setAttribute('data-chave', chave);
    linha.appendChild(botao);
    opcoesNos(select, noId);
    return linha;
  }

  function renderizarListaDestinos(grupo) {
    var container = el(grupo === 'consultorios' ? 'lista-destinos-consultorios' : 'lista-destinos-guiches');
    var destinos = estado.mapa.destinos[grupo];
    container.innerHTML = '';
    var chaves = Object.keys(destinos).sort();
    if (!chaves.length) {
      container.innerHTML = '<div class="mapa-destino-vazio">Nenhum destino cadastrado nesta seção.</div>';
      return;
    }
    chaves.forEach(function (chave) {
      container.appendChild(linhaDestino(grupo, chave, destinos[chave]));
    });
  }

  function renderizarDestinos() {
    el('mapa-nome').value = estado.mapa.nome || '';
    el('mapa-ponto-inicial').value = estado.mapa.ponto_inicial || '';
    el('destino-triagem').value = estado.mapa.destinos.triagem || '';
    renderizarListaDestinos('consultorios');
    renderizarListaDestinos('guiches');
    preencherSelects();
  }

  function salvarMapeamentos(exibirFeedback) {
    var consultorios = {};
    var guiches = {};
    var erro = '';
    document.querySelectorAll('[data-grupo-destino]').forEach(function (linha) {
      var grupo = linha.getAttribute('data-grupo-destino');
      var chaveOriginal = linha.getAttribute('data-chave-original');
      var chave = linha.querySelector('.destino-chave').value.trim();
      var noId = linha.querySelector('.destino-no').value;
      var destino = grupo === 'consultorios' ? consultorios : guiches;
      if (grupo === 'consultorios' && chaveOriginal && chaveOriginal !== chave && medicosUsandoSala(chaveOriginal).length) {
        erro = 'Reatribua os médicos do Consultório ' + chaveOriginal + ' antes de alterar seu número.';
      }
      if (!chave || !noId) erro = 'Preencha o número e o ponto de todos os destinos.';
      else if (Object.prototype.hasOwnProperty.call(destino, chave)) erro = 'Há números repetidos em ' + (grupo === 'consultorios' ? 'consultórios.' : 'guichês.');
      else destino[chave] = noId;
    });
    if (erro) {
      feedback(erro, 'danger');
      return false;
    }
    estado.mapa.nome = el('mapa-nome').value.trim() || ('Mapa de ' + estado.unidade);
    estado.mapa.ponto_inicial = el('mapa-ponto-inicial').value;
    estado.mapa.destinos.triagem = el('destino-triagem').value;
    estado.mapa.destinos.consultorios = consultorios;
    estado.mapa.destinos.guiches = guiches;
    if (exibirFeedback) {
      alterarESalvar();
      renderizarMapa();
      renderizarDestinos();
      renderizarEquipe();
      renderizarConsultoriosOperacional();
      preencherFormularioPonto();
      feedback('Configuração dos destinos salva no rascunho.', 'success');
    }
    return true;
  }

  function proximaChave(destinos) {
    var numero = 1;
    while (Object.prototype.hasOwnProperty.call(destinos, String(numero))) numero++;
    return String(numero);
  }

  function adicionarDestino(grupo) {
    if (!salvarMapeamentos(false)) return;
    var destinos = estado.mapa.destinos[grupo];
    var usados = Object.keys(destinos).map(function (chave) { return destinos[chave]; });
    var tipo = grupo === 'consultorios' ? 'consultorio' : 'guiche';
    var no = estado.mapa.nos.find(function (item) { return item.tipo === tipo && usados.indexOf(item.id) === -1; }) ||
      estado.mapa.nos.find(function (item) { return item.tipo === tipo; }) ||
      estado.mapa.nos.find(function (item) { return item.id !== estado.mapa.ponto_inicial; }) || estado.mapa.nos[0];
    if (!no) {
      feedback('Cadastre um ponto antes de adicionar destinos.', 'warning');
      return;
    }
    destinos[proximaChave(destinos)] = no.id;
    alterarESalvar();
    renderizarDestinos();
    renderizarEquipe();
    renderizarConsultoriosOperacional();
  }

  function removerDestino(grupo, chave) {
    if (grupo === 'consultorios' && medicosUsandoSala(chave).length) {
      feedback('Reatribua os médicos do Consultório ' + chave + ' antes de remover este destino.', 'warning');
      return;
    }
    delete estado.mapa.destinos[grupo][chave];
    alterarESalvar();
    renderizarDestinos();
    renderizarEquipe();
    renderizarConsultoriosOperacional();
  }

  /* ------------------------- Teste e validação ------------------------- */
  function testarRota() {
    if (!salvarMapeamentos(false)) return;
    var tipo = el('teste-tipo').value;
    var chamada = {
      id: 'teste-admin', tipo_chamada: tipo,
      consultorio: el('teste-consultorio').value,
      guiche: tipo === 'triagem' ? el('teste-guiche').value : ''
    };
    var rota = OrientacaoHospitalTV.calcularRota(chamada, estado.mapa);
    var resultado = el('teste-resultado');
    resultado.hidden = false;
    el('teste-mapa').innerHTML = '';
    el('teste-passos').innerHTML = '';
    if (!rota) {
      el('teste-titulo').textContent = 'Rota não encontrada';
      el('teste-resumo').textContent = 'Confira o destino e as ligações entre o ponto inicial e o local chamado.';
      el('teste-passos').innerHTML = '<li>Não foi possível formar um percurso com este rascunho.</li>';
    } else {
      el('teste-titulo').textContent = rota.destino.nome;
      el('teste-resumo').textContent = (rota.local || 'Local não informado') + ' • ' +
        (rota.acessivel ? 'rota totalmente acessível' : 'rota com obstáculos') +
        (rota.minutos ? ' • aproximadamente ' + rota.minutos + ' min' : ' • tempo não informado');
      el('teste-mapa').innerHTML = OrientacaoHospitalTV.renderizarSvg(rota);
      rota.instrucoes.forEach(function (instrucao) {
        var item = document.createElement('li');
        item.textContent = instrucao;
        el('teste-passos').appendChild(item);
      });
      if (!rota.instrucoes.length) el('teste-passos').innerHTML = '<li>O destino é o próprio ponto inicial.</li>';
    }
    resultado.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function validarCompleto() {
    var erros = [];
    var avisos = [];
    var testadas = 0;
    var mapa = estado.mapa;
    if (!OrientacaoHospitalTV.validarMapa(mapa)) {
      erros.push('A estrutura básica é inválida: confira ponto inicial, identificadores únicos e referências das ligações.');
    }
    if (mapa.nos.length < 2) erros.push('Cadastre pelo menos dois pontos.');
    if (!mapa.ponto_inicial) erros.push('Selecione o ponto inicial das rotas.');
    if (!mapa.destinos.triagem) erros.push('Selecione o destino geral da triagem.');

    mapa.nos.forEach(function (no) {
      if (!no.id || !no.nome) erros.push('Há um ponto sem identificador ou nome.');
      if (!isFinite(Number(no.x)) || !isFinite(Number(no.y))) erros.push('O ponto ' + (no.nome || no.id) + ' tem coordenadas inválidas.');
    });
    mapa.ligacoes.forEach(function (ligacao, indice) {
      if (!(Number(ligacao.peso) > 0)) erros.push('A ligação ' + (indice + 1) + ' precisa de peso positivo.');
      if (!(Number(ligacao.tempo) >= 0)) erros.push('A ligação ' + (indice + 1) + ' precisa de tempo igual ou maior que zero.');
      if (!String(ligacao.instrucao || '').trim()) erros.push('A ligação ' + (indice + 1) + ' não tem instrução para o paciente.');
      if (ligacao.de === ligacao.para) erros.push('A ligação ' + (indice + 1) + ' liga um ponto a ele mesmo.');
    });

    if (!erros.length) {
      var chamadas = [{ rotulo: 'Triagem geral', chamada: { tipo_chamada: 'triagem' } }];
      Object.keys(mapa.destinos.consultorios).forEach(function (numero) {
        chamadas.push({ rotulo: 'Consultório ' + numero, chamada: { tipo_chamada: 'consulta', consultorio: numero } });
      });
      Object.keys(mapa.destinos.guiches).forEach(function (numero) {
        chamadas.push({ rotulo: 'Guichê ' + numero, chamada: { tipo_chamada: 'triagem', guiche: numero } });
      });
      chamadas.forEach(function (item) {
        var rota = OrientacaoHospitalTV.calcularRota(item.chamada, mapa);
        if (!rota) erros.push(item.rotulo + ': não existe rota a partir de ' + nomeNo(mapa.ponto_inicial) + '.');
        else {
          testadas++;
          if (!rota.acessivel) avisos.push(item.rotulo + ': a única rota disponível contém escada ou obstáculo.');
          if (!rota.minutos) avisos.push(item.rotulo + ': o tempo estimado não foi informado.');
        }
      });
    }
    if (!Object.keys(mapa.destinos.consultorios).length) avisos.push('Nenhum consultório foi mapeado; chamadas médicas ainda orientarão o paciente a procurar a recepção.');
    if (mapa.ligacoes.some(function (ligacao) { return ligacao.acessivel === false; })) {
      avisos.push('Existem ligações com obstáculos. Confirme se há alternativa acessível para todos os destinos.');
    }
    return { erros: erros, avisos: avisos, testadas: testadas };
  }

  function renderizarValidacao(resultado) {
    var html = '';
    if (!resultado.erros.length) {
      html += '<div class="sucesso">✓ Estrutura válida e ' + resultado.testadas + ' destino(s) com rota calculada.</div>';
    }
    if (resultado.erros.length) {
      html += '<strong>Não publique antes de corrigir:</strong><ul class="erros">' + resultado.erros.map(function (erro) {
        return '<li>' + escapar(erro) + '</li>';
      }).join('') + '</ul>';
    }
    if (resultado.avisos.length) {
      html += '<strong>Avisos para a conferência presencial:</strong><ul class="avisos">' + resultado.avisos.map(function (aviso) {
        return '<li>' + escapar(aviso) + '</li>';
      }).join('') + '</ul>';
    }
    el('lista-validacao').innerHTML = html;
  }

  function validar() {
    if (!salvarMapeamentos(false)) return null;
    var resultado = validarCompleto();
    renderizarValidacao(resultado);
    if (!resultado.erros.length) feedback('Validação técnica concluída. Faça também a conferência presencial antes de publicar.', 'success');
    else feedback('A validação encontrou ' + resultado.erros.length + ' problema(s). Corrija-os antes de publicar.', 'danger');
    return resultado;
  }

  async function publicar() {
    var resultado = validar();
    if (!resultado || resultado.erros.length) return;
    if (!el('confirmacao-validacao').checked) {
      feedback('Para publicar, marque a confirmação de que os percursos foram validados presencialmente.', 'warning');
      el('confirmacao-validacao').focus();
      return;
    }
    var botoes = [el('btn-publicar'), el('btn-publicar-topo')];
    botoes.forEach(function (botao) { botao.disabled = true; });
    el('btn-publicar').textContent = 'Publicando…';
    try {
      salvarRascunho(true);
      estado.mapa = normalizarMapa(await MapaHospitalStore.publicar(estado.unidade, estado.mapa));
      estado.mapa._origem = MapaHospitalStore.temSupabase() ? 'supabase' : 'local';
      definirStatus('Publicado no telão', 'success');
      el('confirmacao-validacao').checked = false;
      atualizarOrigem();
      renderizarTudo();
      preencherFormularioPonto();
      feedback(MapaHospitalStore.temSupabase()
        ? 'Mapa publicado no Supabase. O telão desta unidade receberá a nova versão na próxima atualização.'
        : 'Mapa publicado neste navegador. No modo demonstração, outros dispositivos exigem Supabase ou configuração local.',
        'success');
    } catch (e) {
      feedback(e.message, 'danger');
      definirStatus('Rascunho preservado', 'warning');
    } finally {
      botoes.forEach(function (botao) { botao.disabled = false; });
      el('btn-publicar').textContent = 'Publicar no telão';
    }
  }

  /* ------------------------- Geral ------------------------- */
  function renderizarTudo() {
    renderizarMapa();
    renderizarCaminhos();
    renderizarDestinos();
    renderizarEquipe();
    renderizarConsultoriosOperacional();
    novaLigacao();
  }

  async function descartarRascunho() {
    if (!window.confirm('Descartar o rascunho e recarregar a última versão publicada/modelo?')) return;
    MapaHospitalStore.descartarRascunho(estado.unidade);
    estado.mapa = normalizarMapa(await MapaHospitalStore.carregarPublicado(estado.unidade));
    estado.pontoOriginal = estado.mapa.ponto_inicial || '';
    invalidarValidacao();
    renderizarTudo();
    preencherFormularioPonto();
    atualizarOrigem();
    definirStatus(estado.mapa.configurado ? 'Versão publicada' : 'Exemplo ilustrativo', estado.mapa.configurado ? 'success' : 'warning');
    feedback('Rascunho descartado. A versão publicada no telão não foi alterada.', 'success');
  }

  function exportar() {
    if (!salvarMapeamentos(false)) return;
    salvarRascunho(true);
    var copia = MapaHospitalStore.clonar(estado.mapa);
    delete copia._origem;
    delete copia._publicado_em;
    var blob = new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'mapa-hospital-' + estado.unidade.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-rascunho.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    feedback('Arquivo JSON do rascunho exportado.', 'success');
  }

  function aoTrocarTipoTeste() {
    var consulta = el('teste-tipo').value === 'consulta';
    el('grupo-teste-consultorio').hidden = !consulta;
    el('grupo-teste-guiche').hidden = consulta;
  }

  function vincularEventos() {
    document.querySelectorAll('.mapa-aba').forEach(function (botao) {
      botao.addEventListener('click', function () { mostrarAba(botao.getAttribute('data-aba')); });
    });
    el('mapa-unidade').addEventListener('change', function (evento) { carregarUnidade(evento.target.value); });
    el('btn-salvar-rascunho').addEventListener('click', function () {
      if (salvarMapeamentos(false)) salvarRascunho(false);
    });
    el('btn-descartar').addEventListener('click', descartarRascunho);
    el('btn-exportar').addEventListener('click', exportar);
    el('btn-publicar-topo').addEventListener('click', function () {
      mostrarAba('destinos');
      validar();
      el('confirmacao-validacao').focus();
    });
    el('btn-publicar').addEventListener('click', publicar);
    el('btn-validar').addEventListener('click', validar);

    el('form-ponto').addEventListener('submit', salvarPonto);
    el('btn-novo-ponto').addEventListener('click', function () {
      selecionarPonto('');
      el('ponto-nome').focus();
    });
    el('btn-excluir-ponto').addEventListener('click', excluirPonto);
    el('btn-ponto-inicial').addEventListener('click', definirPontoInicial);
    el('btn-gerar-areas').addEventListener('click', gerarAreas);

    el('form-ligacao').addEventListener('submit', salvarLigacao);
    el('btn-nova-ligacao').addEventListener('click', novaLigacao);
    el('btn-cancelar-ligacao').addEventListener('click', novaLigacao);
    el('lista-caminhos').addEventListener('click', function (evento) {
      var editar = evento.target.closest('[data-editar-ligacao]');
      var excluir = evento.target.closest('[data-excluir-ligacao]');
      if (editar) editarLigacao(Number(editar.getAttribute('data-editar-ligacao')));
      if (excluir) {
        var indice = Number(excluir.getAttribute('data-excluir-ligacao'));
        if (window.confirm('Excluir esta ligação do rascunho?')) {
          estado.mapa.ligacoes.splice(indice, 1);
          alterarESalvar();
          renderizarMapa();
          renderizarCaminhos();
          novaLigacao();
        }
      }
    });

    el('form-consultorio-rapido').addEventListener('submit', salvarConsultorioRapido);
    el('btn-novo-consultorio-rapido').addEventListener('click', function () { abrirFormularioConsultorio(); });
    el('btn-cancelar-consultorio').addEventListener('click', function () { el('card-form-consultorio').hidden = true; });
    el('lista-consultorios-operacional').addEventListener('click', function (evento) {
      var editar = evento.target.closest('[data-editar-consultorio]');
      var remover = evento.target.closest('[data-remover-consultorio]');
      if (editar) abrirFormularioConsultorio(editar.getAttribute('data-editar-consultorio'));
      if (remover) removerConsultorioRapido(remover.getAttribute('data-remover-consultorio'));
    });
    el('lista-equipe-medicos').addEventListener('click', function (evento) {
      var botao = evento.target.closest('[data-salvar-equipe]');
      if (botao) salvarVinculoEquipe(botao.getAttribute('data-salvar-equipe'), botao);
    });
    el('lista-equipe-medicos').addEventListener('change', function (evento) {
      if (evento.target.matches('[data-equipe-select]')) {
        var documento = evento.target.getAttribute('data-equipe-select');
        salvarVinculoEquipe(documento, document.querySelector('[data-salvar-equipe="' + documento + '"]'));
      }
    });

    el('btn-salvar-destinos-basicos').addEventListener('click', function () { salvarMapeamentos(true); });
    ['mapa-nome', 'mapa-ponto-inicial', 'destino-triagem'].forEach(function (id) {
      el(id).addEventListener('change', function () {
        if (salvarMapeamentos(false)) {
          alterarESalvar();
          renderizarMapa();
          renderizarDestinos();
          renderizarEquipe();
          renderizarConsultoriosOperacional();
          preencherFormularioPonto();
        }
      });
    });
    el('btn-add-consultorio').addEventListener('click', function () { adicionarDestino('consultorios'); });
    el('btn-add-guiche').addEventListener('click', function () { adicionarDestino('guiches'); });
    ['lista-destinos-consultorios', 'lista-destinos-guiches'].forEach(function (id) {
      el(id).addEventListener('click', function (evento) {
        var botao = evento.target.closest('[data-remover-destino]');
        if (botao) removerDestino(botao.getAttribute('data-remover-destino'), botao.getAttribute('data-chave'));
      });
      el(id).addEventListener('change', function () {
        if (salvarMapeamentos(false)) {
          alterarESalvar();
          renderizarDestinos();
          renderizarEquipe();
          renderizarConsultoriosOperacional();
        }
      });
    });

    el('teste-tipo').addEventListener('change', aoTrocarTipoTeste);
    el('btn-testar-rota').addEventListener('click', testarRota);
  }

  function iniciar() {
    if (estado.iniciado) return;
    estado.iniciado = true;
    var unidades = preencherUnidades();
    el('mapa-modo-armazenamento').textContent = MapaHospitalStore.temSupabase()
      ? 'Supabase + cache local' : 'Demonstração • armazenamento local';
    vincularEventos();
    if (typeof DB !== 'undefined' && typeof DB.on === 'function') {
      ['usuario_cadastrado', 'usuario_atualizado'].forEach(function (evento) {
        DB.on(evento, function () {
          if (estado.mapa && estado.equipe) {
            renderizarEquipe();
            renderizarConsultoriosOperacional();
          }
        });
      });
    }
    aoTrocarTipoTeste();
    carregarUnidade(unidades[0]);
  }

  return {
    iniciar: iniciar,
    validarCompleto: validarCompleto,
    carregarUnidade: carregarUnidade
  };
})();
