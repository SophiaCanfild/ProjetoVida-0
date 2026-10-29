/* VIDA+ — regras comuns do cadastro de locais e orientações.
 * Os IDs e destinos do mapa antigo continuam sendo as referências canônicas.
 */
var RotasUnidade = (function () {
  'use strict';
  var TIPOS = {
    recepcao: 'Recepção', triagem: 'Triagem', consultorio: 'Consultório',
    sala_vacinacao: 'Sala de vacinação', sala_procedimentos: 'Sala de procedimentos',
    laboratorio: 'Laboratório', farmacia: 'Farmácia', elevador: 'Elevador',
    escada: 'Escada', corredor: 'Corredor', outro: 'Outro'
  };
  var DESTINOS = ['triagem', 'consultorio', 'sala_vacinacao', 'sala_procedimentos', 'laboratorio', 'farmacia'];
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function normalizar(mapa, unidade) {
    mapa = clone(mapa) || {};
    mapa.nome = texto(mapa.nome) || 'Orientações — ' + texto(unidade);
    mapa.nos = Array.isArray(mapa.nos) ? mapa.nos : [];
    mapa.ligacoes = Array.isArray(mapa.ligacoes) ? mapa.ligacoes : [];
    mapa.areas = Array.isArray(mapa.areas) ? mapa.areas : [];
    mapa.destinos = mapa.destinos && typeof mapa.destinos === 'object' ? mapa.destinos : {};
    mapa.destinos.consultorios = mapa.destinos.consultorios || {};
    mapa.destinos.guiches = mapa.destinos.guiches || {};
    mapa.destinos.triagem = mapa.destinos.triagem || '';
    mapa.orientacoes = mapa.orientacoes && typeof mapa.orientacoes === 'object' ? mapa.orientacoes : {};
    return mapa;
  }
  function tipo(no) {
    var t = texto(no && (no.tipo_exibicao || no.tipo));
    if (t === 'inicio') return 'recepcao';
    if (t === 'guiche' || t === 'local' || !TIPOS[t]) return 'outro';
    return t;
  }
  function nomeTipo(no) {
    return tipo(no) === 'outro' ? (texto(no && no.tipo_personalizado) || (no && no.tipo === 'guiche' ? 'Guichê' : 'Outro')) : TIPOS[tipo(no)];
  }
  function noPorId(mapa, id) { return (mapa.nos || []).find(function (n) { return n && n.id === id; }) || null; }
  function chavesConsultorio(mapa, id) {
    var c = mapa.destinos && mapa.destinos.consultorios || {};
    return Object.keys(c).filter(function (chave) { return c[chave] === id; });
  }
  function numeroSala(mapa, no) {
    if (no && Object.prototype.hasOwnProperty.call(no, 'numero_sala')) return texto(no.numero_sala);
    if (tipo(no) === 'consultorio') {
      var keys = chavesConsultorio(mapa, no.id);
      /* Evita revelar uma chave gerada automaticamente como número da sala. */
      return keys.length && !/^(?:local_|loc_)/.test(keys[0]) ? keys[0] : '';
    }
    return '';
  }
  function ehDestino(mapa, no) {
    if (!no) return false;
    var destinos = mapa.destinos || {};
    if (destinos.triagem === no.id || chavesConsultorio(mapa, no.id).length ||
        Object.keys(destinos.guiches || {}).some(function (k) { return destinos.guiches[k] === no.id; })) return true;
    if (typeof no.recebe_pacientes === 'boolean') return no.recebe_pacientes;
    return DESTINOS.indexOf(tipo(no)) !== -1;
  }
  function localizacao(no) {
    var partes = [texto(no && no.bloco), texto(no && no.andar)].filter(Boolean);
    if (!partes.length && no && (no.sem_divisao || (no.sem_bloco && no.sem_andar))) return 'Sem divisão por blocos ou andares';
    return partes.join(' — ');
  }
  function localizacaoPendente(no) {
    if (!no) return true;
    var bloco = texto(no.bloco) || no.sem_bloco === true || no.sem_divisao === true;
    var andar = texto(no.andar) || no.sem_andar === true || no.sem_divisao === true;
    return !bloco || !andar;
  }
  function textoOrientacao(o) {
    if (!o) return '';
    return [texto(o.texto_orientacao || o.texto), texto(o.complemento_especifico)].filter(Boolean).join('\n');
  }
  function passos(textoBruto) {
    var limpo = texto(textoBruto);
    if (!limpo) return [];
    var linhas = limpo.split(/\r?\n+/).map(function (l) {
      return l.replace(/^\s*(?:\d+[.)]|[•*-])\s*/, '').trim();
    }).filter(Boolean);
    if (linhas.length > 1) return linhas;
    /* Não remova prefixos nem crie passos que a unidade não forneceu. */
    return limpo.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map(texto).filter(Boolean);
  }
  function erroRelacao(mapa, dados) {
    var origem = noPorId(mapa, dados.ponto_inicial_id), destino = noPorId(mapa, dados.destino_id);
    if (!origem || !destino) return '';
    var a = texto(origem.andar).toLocaleLowerCase('pt-BR'), b = texto(destino.andar).toLocaleLowerCase('pt-BR');
    var c = texto(origem.bloco).toLocaleLowerCase('pt-BR'), d = texto(destino.bloco).toLocaleLowerCase('pt-BR');
    if (dados.localizacao_tipo === 'mesmo_andar' && a && b && a !== b) return 'Os locais cadastrados estão em andares diferentes. Corrija a localização do percurso ou os locais.';
    if (dados.localizacao_tipo === 'outro_andar' && !b) return 'Informe o andar do destino no cadastro do local antes de configurar outro andar.';
    if (dados.localizacao_tipo === 'outro_andar' && a && a === b) return 'Os locais cadastrados estão no mesmo andar. Corrija a localização do percurso ou os locais.';
    if (dados.localizacao_tipo === 'outro_bloco' && !d) return 'Informe o bloco do destino no cadastro do local antes de configurar outro bloco.';
    if (dados.localizacao_tipo === 'outro_bloco' && c && c === d) return 'Os locais cadastrados estão no mesmo bloco. Corrija a localização do percurso ou os locais.';
    if (dados.localizacao_tipo === 'sem_divisao' && !(destino.sem_andar || destino.sem_divisao)) return 'Confirme no cadastro do destino que não há divisão por andares.';
    return '';
  }
  function sugestao(mapa, dados) {
    var destino = noPorId(mapa, dados.destino_id);
    var inicio = noPorId(mapa, dados.ponto_inicial_id);
    var erros = [];
    if (!destino) erros.push('Selecione um destino cadastrado.');
    if (!inicio) erros.push('Selecione o ponto inicial.');
    if (inicio && destino && inicio.id === destino.id) erros.push('O ponto inicial deve ser diferente do destino.');
    if (!texto(dados.localizacao_tipo)) erros.push('Informe a localização do destino em relação ao ponto inicial.');
    if (dados.localizacao_tipo === 'outro_andar' && destino && !texto(destino.andar)) erros.push('Informe o andar do destino no cadastro do local.');
    if (dados.localizacao_tipo === 'outro_bloco' && destino && !texto(destino.bloco)) erros.push('Informe o bloco do destino no cadastro do local.');
    var escolhidas = Array.isArray(dados.como_chegar) ? dados.como_chegar : [];
    if (!escolhidas.length) erros.push('Selecione pelo menos uma instrução em Como chegar.');
    if (escolhidas.indexOf('outra_instrucao') !== -1 && !texto(dados.outra_instrucao)) erros.push('Descreva a outra instrução confirmada pela unidade.');
    if (erros.length) return { erros: erros, texto: '' };
    var linhas = ['A partir de ' + inicio.nome + ':'];
    var comandos = {
      seguir_corredor: 'Siga pelo corredor.', utilizar_elevador: 'Utilize o elevador.',
      utilizar_escada: 'Utilize a escada.', seguir_placas: 'Siga as placas indicativas.',
      passar_recepcao: 'Passe pela recepção.', passagem_acessivel: 'Utilize a passagem acessível informada pela unidade.',
      solicitar_equipe: 'Solicite orientação à equipe.'
    };
    var andarInserido = false;
    escolhidas.forEach(function (opcao) {
      if (opcao === 'outra_instrucao') linhas.push(texto(dados.outra_instrucao));
      else if (comandos[opcao]) linhas.push(comandos[opcao]);
      if (!andarInserido && (opcao === 'utilizar_elevador' || opcao === 'utilizar_escada') &&
          dados.localizacao_tipo === 'outro_andar' && texto(destino.andar)) {
        linhas.push('Acesse: ' + texto(destino.andar) + '.'); andarInserido = true;
      }
    });
    if (!andarInserido && dados.localizacao_tipo === 'outro_andar' && texto(destino.andar)) linhas.push('Acesse: ' + texto(destino.andar) + '.');
    if (dados.localizacao_tipo === 'outro_bloco' && texto(destino.bloco)) linhas.push('Dirija-se ao ' + texto(destino.bloco) + '.');
    linhas.push('Destino: ' + texto(destino.nome) + (localizacao(destino) ? ' — ' + localizacao(destino) : '') + '.');
    if (linhas.length > 1) {
      var cabecalho = linhas.shift();
      linhas[0] = cabecalho + ' ' + linhas[0].charAt(0).toLowerCase() + linhas[0].slice(1);
    }
    return { erros: [], texto: linhas.join('\n') };
  }
  function validar(mapa, equipe) {
    var pendencias = [];
    function adicionar(textoItem, detalhe, aba, id) {
      pendencias.push({ texto: textoItem, detalhe: detalhe, aba: aba, id: id || '' });
    }
    var nos = mapa.nos || [];
    var ids = Object.create(null);
    if (!nos.length) adicionar('Nenhum local cadastrado', 'Adicione os locais usados nesta unidade.', 'locais');
    nos.forEach(function (no) {
      if (!no || !no.id || ids[no.id]) { adicionar('Há locais com identificação inválida', 'Contate o suporte antes de publicar.', 'locais'); return; }
      ids[no.id] = true;
      if (!texto(no.nome)) adicionar('Local sem nome', 'Preencha o nome do local.', 'local', no.id);
      if (tipo(no) === 'outro' && !texto(no.tipo_personalizado) && no.tipo !== 'guiche' && no.tipo !== 'local') {
        adicionar((no.nome || 'Local') + ' sem tipo definido', 'Informe um tipo personalizado.', 'local', no.id);
      }
      if (!ehDestino(mapa, no)) return;
      if (localizacaoPendente(no)) adicionar((no.nome || 'Local') + ' com localização incompleta', 'Informe bloco e andar ou indique que não se aplicam.', 'local', no.id);
      var o = mapa.orientacoes && mapa.orientacoes[no.id];
      /* Mapa antigo publicado pode continuar usando o grafo, mas uma nova
         publicação simplificada exige orientações textuais confirmadas. */
      if (!o || !textoOrientacao(o)) adicionar((no.nome || 'Destino') + ' sem orientação', 'Configure como os pacientes chegam a este destino.', 'orientacoes', no.id);
      else {
        if (!noPorId(mapa, o.ponto_inicial_id)) adicionar((no.nome || 'Destino') + ' sem ponto inicial', 'Escolha um ponto inicial existente.', 'orientacoes', no.id);
        else if (o.ponto_inicial_id === no.id) adicionar((no.nome || 'Destino') + ' com ponto inicial inválido', 'Escolha um local diferente do destino.', 'orientacoes', no.id);
        if (!texto(o.localizacao_tipo)) adicionar((no.nome || 'Destino') + ' sem localização do percurso', 'Informe a relação entre origem e destino.', 'orientacoes', no.id);
        if (o.localizacao_tipo === 'outro_andar' && !texto(no.andar)) adicionar((no.nome || 'Destino') + ' sem andar informado', 'Informe o andar do destino antes de publicar.', 'local', no.id);
        if (o.localizacao_tipo === 'outro_bloco' && !texto(no.bloco)) adicionar((no.nome || 'Destino') + ' sem bloco informado', 'Informe o bloco do destino antes de publicar.', 'local', no.id);
        var erro = erroRelacao(mapa, { destino_id: no.id, ponto_inicial_id: o.ponto_inicial_id, localizacao_tipo: o.localizacao_tipo });
        if (erro) adicionar((no.nome || 'Destino') + ' com localização de percurso inconsistente', erro, 'orientacoes', no.id);
        if (o.reutiliza_de && (!noPorId(mapa, o.reutiliza_de) || o.reutiliza_de === no.id)) adicionar((no.nome || 'Destino') + ' com orientação base inválida', 'Selecione uma orientação existente ou remova a reutilização.', 'orientacoes', no.id);
        var a = o.acessibilidade || {};
        if (a.restricoes_conhecidas === 'possui' && !(a.perfis_restritos || []).length && !texto(a.restricoes_detalhes) && !texto(a.observacoes)) {
          adicionar((no.nome || 'Destino') + ' com restrição não descrita', 'Informe os perfis afetados ou descreva a restrição.', 'orientacoes', no.id);
        }
        if (o.revisao_necessaria) adicionar((no.nome || 'Destino') + ' precisa de revisão', 'O local ou o ponto inicial mudou. Revise e salve a orientação.', 'orientacoes', no.id);
      }
    });
    var destinos = mapa.destinos || {};
    if (!destinos.triagem || !ids[destinos.triagem]) adicionar('Destino da triagem não definido', 'Cadastre uma triagem usada nas chamadas.', 'locais');
    ['consultorios', 'guiches'].forEach(function (grupo) {
      Object.keys(destinos[grupo] || {}).forEach(function (chave) {
        if (!ids[destinos[grupo][chave]]) adicionar('Destino de chamada sem local válido', 'Corrija o vínculo em configurações avançadas.', 'avancado');
        if (chave.length > 10) adicionar('Vínculo de chamada incompatível', 'A chave do destino excede o limite aceito pelos atendimentos; corrija em configurações avançadas.', 'avancado');
      });
    });
    Object.keys(equipe && equipe.vinculos || {}).forEach(function (doc) {
      var vinculo = equipe.vinculos[doc];
      if (texto(vinculo.consultorio) && !(destinos.consultorios || {})[vinculo.consultorio]) {
        adicionar('Consultório de ' + (texto(vinculo.nome) || 'um médico') + ' não cadastrado', 'Atualize o vínculo do profissional.', 'equipe');
      }
    });
    return pendencias;
  }
  return { TIPOS: TIPOS, DESTINOS: DESTINOS, texto: texto, clone: clone, normalizar: normalizar,
    tipo: tipo, nomeTipo: nomeTipo, noPorId: noPorId, chavesConsultorio: chavesConsultorio,
    numeroSala: numeroSala, ehDestino: ehDestino, localizacao: localizacao,
    localizacaoPendente: localizacaoPendente, textoOrientacao: textoOrientacao, passos: passos,
    sugestao: sugestao, erroRelacao: erroRelacao, validar: validar };
})();
