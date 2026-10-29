/* VIDA+ — rascunho e versão publicada em configuracoes, por unidade.
 * A cópia local é apenas recuperação/cache: a escrita oficial exige Supabase.
 * Não há autenticação confiável no login legado; a autorização efetiva deve
 * ser implementada no servidor/RLS (ver telao/MAPA-HOSPITAL.md).
 */
var MapaHospitalStore = (function () {
  'use strict';
  var PREFIXO = 'vidamais_mapa_hospital_';
  var controles = Object.create(null);

  function clonar(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function slug(unidade) {
    var s = texto(unidade || 'unidade').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'unidade';
  }
  function chaveRemota(unidade) { return 'mapa_hospital_' + slug(unidade); }
  function chaveRascunhoRemota(unidade) { return 'mapa_rascunho_' + slug(unidade); }
  function chavePublicado(unidade) { return PREFIXO + slug(unidade) + '_publicado'; }
  function chaveRascunho(unidade) { return PREFIXO + slug(unidade) + '_rascunho'; }
  function temSupabase() {
    return typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function';
  }
  function lerLocal(chave) {
    try { var bruto = window.localStorage.getItem(chave); return bruto ? JSON.parse(bruto) : null; }
    catch (e) { return null; }
  }
  function escreverLocal(chave, valor) {
    try { window.localStorage.setItem(chave, JSON.stringify(valor)); return true; }
    catch (e) { return false; }
  }
  function removerLocal(chave) { try { window.localStorage.removeItem(chave); } catch (e) { /* sem cache */ } }
  function usuarioAtual() {
    try { return typeof getUsuarioLogado === 'function' ? getUsuarioLogado() : null; }
    catch (e) { return null; }
  }
  /* Restrição de interface, NÃO é uma barreira de segurança: sessionStorage
     pode ser alterado pelo usuário. A proteção obrigatória pertence à RLS. */
  function unidadesAutorizadas(usuario) {
    var u = usuario === undefined ? usuarioAtual() : usuario;
    if (!u || (u.tipo !== 'admin' && u.perfil !== 'administrador')) return [];
    if (Array.isArray(u.unidades_autorizadas)) return u.unidades_autorizadas.map(texto).filter(Boolean);
    var unica = texto(u.unidade || u.unidade_autorizada);
    return unica && unica !== '*' && unica.toLowerCase() !== 'todas' ? [unica] : null;
  }
  function podeGerenciarUnidade(unidade, usuario) {
    if (!texto(unidade)) return false;
    var permitidas = unidadesAutorizadas(usuario);
    return permitidas === null || permitidas.indexOf(texto(unidade)) !== -1;
  }
  function exigirPermissaoUnidade(unidade) {
    if (!podeGerenciarUnidade(unidade)) throw new Error('Seu usuário não está autorizado a gerenciar esta unidade.');
  }
  async function listarUnidades() {
    var nomes = typeof APP_CONFIG !== 'undefined' && Array.isArray(APP_CONFIG.UNIDADES) ? APP_CONFIG.UNIDADES.slice() : [];
    if (temSupabase()) {
      try {
        var resposta = await supabaseClient.from('unidades').select('nome, ativo').eq('ativo', true).limit(500);
        if (resposta.error) throw resposta.error;
        (resposta.data || []).forEach(function (u) {
          var nome = texto(u.nome);
          if (nome && nomes.indexOf(nome) === -1) nomes.push(nome);
        });
      } catch (e) { console.warn('[Rotas] Não foi possível listar unidades do banco:', mensagemErro(e)); }
    }
    return nomes.filter(function (nome) { return podeGerenciarUnidade(nome); });
  }
  function mapaVazio(unidade) {
    return {
      configurado: false, modo_simplificado: true, usar_mapa_grafico: false,
      nome: 'Orientações — ' + unidade, ponto_inicial: '', areas: [], nos: [], ligacoes: [],
      destinos: { triagem: '', consultorios: {}, guiches: {} }, orientacoes: {}
    };
  }
  /* Não importar o mapa ilustrativo como cadastro real. */
  function mapaPadrao(unidade) { return mapaVazio(unidade); }
  function desempacotar(registro, unidade) {
    if (!registro) return null;
    if (typeof registro === 'string') {
      try { registro = JSON.parse(registro); }
      catch (e) { throw new Error('A configuração da unidade está em formato inválido. Contate o suporte antes de editar.'); }
    }
    if (registro.unidade && texto(registro.unidade) !== texto(unidade)) {
      throw new Error('Há um conflito de identificação entre unidades. Contate o suporte antes de editar.');
    }
    var mapa = registro.mapa || registro;
    if (!mapa || !Array.isArray(mapa.nos)) throw new Error('A configuração da unidade está incompleta. Contate o suporte antes de editar.');
    mapa = clonar(mapa);
    if (registro.mapa && registro.publicado_em && !mapa.publicado_em) mapa.publicado_em = registro.publicado_em;
    return mapa;
  }
  function semMetadados(mapa) {
    var copia = clonar(mapa);
    Object.keys(copia).forEach(function (chave) { if (chave.charAt(0) === '_') delete copia[chave]; });
    return copia;
  }
  function mensagemErro(erro) { return texto(erro && erro.message) || 'erro de conexão ou permissão'; }
  async function lerLinha(chave) {
    if (!temSupabase()) throw new Error('O Supabase não está disponível. Verifique a conexão e tente novamente.');
    var r = await supabaseClient.from('configuracoes').select('valor, atualizado_em').eq('chave', chave).limit(1);
    if (r.error) throw new Error('Não foi possível consultar as configurações: ' + mensagemErro(r.error));
    return r.data && r.data[0] || null;
  }
  function versaoNova(anterior) {
    var t = Date.now();
    var antigo = Date.parse(anterior || '') || 0;
    return new Date(Math.max(t, antigo + 1)).toISOString();
  }
  async function escreverCondicional(chave, valor, descricao, versaoAnterior) {
    if (!temSupabase()) throw new Error('O Supabase não está disponível. Verifique a conexão e tente novamente.');
    var data = versaoNova(versaoAnterior);
    var linha = { chave: chave, valor: JSON.stringify(valor), descricao: descricao, atualizado_em: data };
    var consulta;
    if (versaoAnterior) {
      consulta = supabaseClient.from('configuracoes').update(linha)
        .eq('chave', chave).eq('atualizado_em', versaoAnterior).select('atualizado_em');
    } else {
      consulta = supabaseClient.from('configuracoes').insert(linha).select('atualizado_em');
    }
    var resposta = await consulta;
    if (resposta.error) {
      var conflito = resposta.error.code === '23505';
      throw new Error(conflito
        ? 'Outra pessoa criou esta configuração. Recarregue a unidade antes de tentar novamente.'
        : 'Falha ao gravar no banco: ' + mensagemErro(resposta.error));
    }
    if (!resposta.data || resposta.data.length !== 1) {
      throw new Error('A configuração mudou em outra sessão ou a gravação não foi autorizada. Exporte o rascunho e recarregue a unidade.');
    }
    return resposta.data[0].atualizado_em || data;
  }
  async function apagarCondicional(chave, versao) {
    if (!versao) return;
    var r = await supabaseClient.from('configuracoes').delete().eq('chave', chave)
      .eq('atualizado_em', versao).select('chave');
    if (r.error || !r.data || r.data.length !== 1) {
      throw new Error('Não foi possível remover o rascunho compartilhado; ele pode ter sido alterado em outra sessão.');
    }
  }
  async function carregarPublicado(unidade, opcoes) {
    var cache = lerLocal(chavePublicado(unidade));
    var remotoVerificado = cache && cache._cache_remoto === true && cache.mapa;
    if (opcoes && opcoes.somenteLocal) {
      var local = remotoVerificado ? desempacotar(cache, unidade) : mapaVazio(unidade);
      local._origem = remotoVerificado ? 'cache' : 'nao_publicado';
      return local;
    }
    try {
      var linha = await lerLinha(chaveRemota(unidade));
      if (!linha) {
        // A ausência confirmada no banco invalida o cache anterior. Caso
        // contrário, uma falha posterior poderia ressuscitar uma publicação
        // que já foi removida ou deixou de estar disponível nesta unidade.
        removerLocal(chavePublicado(unidade));
        var vazio = mapaVazio(unidade);
        vazio._origem = 'nao_publicado';
        return vazio;
      }
      var mapa = desempacotar(linha.valor, unidade);
      mapa.publicado_em = mapa.publicado_em || linha.atualizado_em || null;
      escreverLocal(chavePublicado(unidade), { _cache_remoto: true, unidade: unidade, mapa: mapa });
      mapa._origem = 'supabase';
      mapa._publicado_em = mapa.publicado_em;
      return mapa;
    } catch (e) {
      if (opcoes && opcoes.exigirRemoto) throw e;
      if (remotoVerificado) {
        var salvo = desempacotar(cache, unidade);
        salvo._origem = 'cache';
        salvo._publicado_em = salvo.publicado_em || null;
        return salvo;
      }
      var semDados = mapaVazio(unidade);
      semDados._origem = 'indisponivel';
      return semDados;
    }
  }
  async function carregarRascunho(unidade) {
    exigirPermissaoUnidade(unidade);
    var linhas = await Promise.all([lerLinha(chaveRemota(unidade)), lerLinha(chaveRascunhoRemota(unidade))]);
    var linhaPub = linhas[0];
    var linhaDraft = linhas[1];
    var publicado = linhaPub ? desempacotar(linhaPub.valor, unidade) : mapaVazio(unidade);
    var remoto = linhaDraft ? desempacotar(linhaDraft.valor, unidade) : null;
    var pacoteRemoto = null;
    if (linhaDraft) {
      try { pacoteRemoto = typeof linhaDraft.valor === 'string' ? JSON.parse(linhaDraft.valor) : linhaDraft.valor; }
      catch (e) { /* desempacotar já verificou */ }
    }
    var backup = lerLocal(chaveRascunho(unidade));
    var local = null;
    try { local = backup ? desempacotar(backup, unidade) : null; } catch (e) { local = null; }
    var temPendente = !!(backup && backup._pendente && local);
    /* Mantém rascunhos locais antigos, mas não importa mapa demonstrativo. */
    var usarLocal = temPendente || (!remoto && !!local);
    var escolhido = usarLocal ? local : (remoto || publicado);
    var controleBackup = backup && backup._controle || {};
    var conheceBaseLocal = Object.prototype.hasOwnProperty.call(controleBackup, 'publicacao');
    var baseDesconhecida = !!(usarLocal && linhaPub && !conheceBaseLocal) ||
      !!(usarLocal && controleBackup.base_desconhecida) || !!(!usarLocal && pacoteRemoto && pacoteRemoto.base_publicacao_desconhecida) ||
      !!(!usarLocal && pacoteRemoto && linhaPub && !Object.prototype.hasOwnProperty.call(pacoteRemoto, 'base_publicacao'));
    var basePublicada = usarLocal && conheceBaseLocal
      ? controleBackup.publicacao
      : (pacoteRemoto && Object.prototype.hasOwnProperty.call(pacoteRemoto, 'base_publicacao')
        ? pacoteRemoto.base_publicacao : (linhaPub && linhaPub.atualizado_em || null));
    controles[unidade] = {
      rascunho: usarLocal && temPendente ? (controleBackup.rascunho || null) : (linhaDraft && linhaDraft.atualizado_em || null),
      publicacao: basePublicada, baseDesconhecida: baseDesconhecida,
      publicado: clonar(publicado),
      publicadoAtual: linhaPub && linhaPub.atualizado_em || null
    };
    escolhido = clonar(escolhido);
    escolhido._origem = usarLocal ? 'rascunho_local' : remoto ? 'rascunho' : linhaPub ? 'supabase' : 'nao_publicado';
    escolhido._publicado_em = publicado.publicado_em || (linhaPub && linhaPub.atualizado_em) || null;
    escolhido._nao_sincronizado = usarLocal && (temPendente || !backup._controle);
    escolhido._publicacao_desatualizada = baseDesconhecida || basePublicada !== controles[unidade].publicadoAtual;
    return escolhido;
  }
  function obterPublicadoCarregado(unidade) {
    return controles[unidade] ? clonar(controles[unidade].publicado) : null;
  }
  async function salvarRascunho(unidade, mapa) {
    exigirPermissaoUnidade(unidade);
    var controle = controles[unidade];
    if (!controle) throw new Error('Recarregue a unidade antes de salvar o rascunho.');
    var copia = semMetadados(mapa);
    copia.atualizado_em = new Date().toISOString();
    var backup = { unidade: unidade, mapa: copia, _pendente: true,
      _controle: { rascunho: controle.rascunho, publicacao: controle.publicacao, base_desconhecida: controle.baseDesconhecida } };
    var backupSalvo = escreverLocal(chaveRascunho(unidade), backup);
    try {
      var versao = await escreverCondicional(chaveRascunhoRemota(unidade),
        { versao: 2, unidade: unidade, base_publicacao: controle.publicacao, base_publicacao_desconhecida: controle.baseDesconhecida, mapa: copia },
        'Rascunho de locais e orientações — ' + unidade, controle.rascunho);
      controle.rascunho = versao;
      backup._pendente = false;
      backup._controle.rascunho = versao;
      escreverLocal(chaveRascunho(unidade), backup);
      copia._origem = 'rascunho';
      copia._publicado_em = controle.publicado.publicado_em || controle.publicadoAtual || null;
      copia._publicacao_desatualizada = controle.baseDesconhecida || controle.publicacao !== controle.publicadoAtual;
      return copia;
    } catch (e) {
      throw new Error((backupSalvo ? 'Uma cópia temporária foi mantida neste navegador. ' : 'Não foi possível manter uma cópia local. ') +
        'A gravação do rascunho não foi confirmada no banco. Confira a conexão antes de tentar novamente. ' + mensagemErro(e));
    }
  }
  async function descartarRascunho(unidade) {
    exigirPermissaoUnidade(unidade);
    var controle = controles[unidade];
    if (!controle) throw new Error('Recarregue a unidade antes de descartar o rascunho.');
    if (controle.rascunho) await apagarCondicional(chaveRascunhoRemota(unidade), controle.rascunho);
    removerLocal(chaveRascunho(unidade));
    controle.rascunho = null;
  }
  async function publicar(unidade, mapa) {
    exigirPermissaoUnidade(unidade);
    var controle = controles[unidade];
    if (!controle || !controle.rascunho) throw new Error('Salve o rascunho no banco antes de publicar.');
    if (typeof RotasUnidade === 'undefined') throw new Error('A validação de orientações não está disponível. Recarregue a página.');
    var pendencias = RotasUnidade.validar(mapa, null);
    if (pendencias.length) throw new Error('O rascunho possui pendências obrigatórias. Corrija-as antes de publicar.');
    if (mapa.usar_mapa_grafico === true) {
      if (typeof OrientacaoHospitalTV === 'undefined' || mapa.nos.some(function (no) {
        if (!RotasUnidade.ehDestino(mapa, no)) return false;
        var o = mapa.orientacoes && mapa.orientacoes[no.id];
        return !o || !OrientacaoHospitalTV.calcularCaminhoGrafico(mapa, no.id, o.ponto_inicial_id);
      })) throw new Error('A planta gráfica não possui percursos completos para todos os destinos.');
    }
    if (controle.baseDesconhecida || controle.publicacao !== controle.publicadoAtual) {
      throw new Error('A base do rascunho não corresponde à publicação atual. Exporte o rascunho e recarregue antes de publicar.');
    }
    var copia = semMetadados(mapa);
    copia.configurado = true;
    copia.publicado_em = new Date().toISOString();
    copia.atualizado_em = copia.publicado_em;
    if (copia.usar_mapa_grafico === true) copia.grafico_validado_em = copia.publicado_em;
    var versao;
    try {
      versao = await escreverCondicional(chaveRemota(unidade),
        { versao: 2, unidade: unidade, publicado_em: copia.publicado_em, mapa: copia },
        'Mapa e orientações publicados para o telão — ' + unidade, controle.publicacao);
    } catch (e) {
      throw new Error('Não foi possível confirmar a publicação; o rascunho foi preservado. Confira o telão e a versão publicada antes de tentar novamente. ' + mensagemErro(e));
    }
    controle.publicacao = versao;
    controle.publicadoAtual = versao;
    controle.publicado = clonar(copia);
    escreverLocal(chavePublicado(unidade), { _cache_remoto: true, unidade: unidade, mapa: copia });
    var aviso = '';
    try {
      await apagarCondicional(chaveRascunhoRemota(unidade), controle.rascunho);
      controle.rascunho = null;
      removerLocal(chaveRascunho(unidade));
    } catch (e) {
      aviso = 'A versão foi publicada, mas o rascunho compartilhado não pôde ser removido. Recarregue a unidade e confira antes de publicar novamente.';
    }
    copia._origem = 'supabase';
    copia._publicado_em = copia.publicado_em;
    copia._aviso = aviso;
    return copia;
  }
  return {
    chaveRemota: chaveRemota, chaveRascunhoRemota: chaveRascunhoRemota,
    chavePublicado: chavePublicado, chaveRascunho: chaveRascunho,
    mapaPadrao: mapaPadrao, mapaVazio: mapaVazio, carregarPublicado: carregarPublicado,
    carregarRascunho: carregarRascunho, obterPublicadoCarregado: obterPublicadoCarregado,
    salvarRascunho: salvarRascunho, salvarRascunhoAsync: salvarRascunho,
    descartarRascunho: descartarRascunho, publicar: publicar,
    temSupabase: temSupabase, listarUnidades: listarUnidades, unidadesAutorizadas: unidadesAutorizadas,
    podeGerenciarUnidade: podeGerenciarUnidade, exigirPermissaoUnidade: exigirPermissaoUnidade, clonar: clonar
  };
})();
