/* VIDA+ — vínculos de médicos por CPF, consultório e unidade.
 * A equipe é mantida em configuracoes; a gravação só é confirmada pelo banco.
 * A proteção real por usuário/unidade deve ser aplicada na RLS do Supabase.
 */
var EquipeConsultorioStore = (function () {
  'use strict';
  var PREFIXO = 'vidamais_equipe_consultorios_';
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function cpf(v) { return texto(v).replace(/\D/g, ''); }
  function clonar(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function slug(unidade) {
    var s = texto(unidade || 'unidade').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'unidade';
  }
  function chaveRemota(unidade) { return 'equipe_consultorios_' + slug(unidade); }
  function chaveLocal(unidade) { return PREFIXO + slug(unidade); }
  function vazio(unidade) { return { versao: 1, unidade: texto(unidade), atualizado_em: null, vinculos: {} }; }
  function temSupabase() { return typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function'; }
  function normalizar(registro, unidade) {
    if (typeof registro === 'string') {
      try { registro = JSON.parse(registro); } catch (e) { throw new Error('Os vínculos da unidade estão em formato inválido.'); }
    }
    var saida = vazio(unidade || (registro && registro.unidade));
    if (!registro || typeof registro !== 'object') return saida;
    if (registro.unidade && unidade && texto(registro.unidade) !== texto(unidade)) {
      throw new Error('Há conflito entre unidades nos vínculos médicos. Contate o suporte.');
    }
    saida.atualizado_em = registro.atualizado_em || null;
    Object.keys(registro.vinculos || {}).forEach(function (chave) {
      var doc = cpf(chave);
      var bruto = registro.vinculos[chave];
      if (!doc || !bruto) return;
      if (typeof bruto !== 'object') bruto = { consultorio: String(bruto) };
      saida.vinculos[doc] = Object.assign({}, bruto, {
        consultorio: texto(bruto.consultorio), nome: texto(bruto.nome),
        crm: texto(bruto.crm || bruto.registroProfissional || bruto.registro_profissional),
        especialidade: texto(bruto.especialidade),
        atualizado_em: bruto.atualizado_em || registro.atualizado_em || null
      });
    });
    return saida;
  }
  function lerLocal(unidade) {
    try {
      var raw = window.localStorage.getItem(chaveLocal(unidade));
      return raw ? normalizar(raw, unidade) : null;
    } catch (e) { return null; }
  }
  function escreverLocal(unidade, registro) {
    try { window.localStorage.setItem(chaveLocal(unidade), JSON.stringify(normalizar(registro, unidade))); }
    catch (e) { /* cache opcional */ }
  }
  async function lerRemoto(unidade) {
    if (!temSupabase()) throw new Error('O banco de dados está indisponível. Verifique a conexão.');
    var r = await supabaseClient.from('configuracoes').select('valor, atualizado_em')
      .eq('chave', chaveRemota(unidade)).limit(1);
    if (r.error) throw new Error(r.error.message || 'Falha ao consultar vínculos.');
    var linha = r.data && r.data[0];
    return { registro: linha ? normalizar(linha.valor, unidade) : vazio(unidade), versao: linha && linha.atualizado_em || null };
  }
  async function carregar(unidade, opcoes) {
    var nome = texto(unidade);
    if (!nome) throw new Error('Informe a unidade para carregar os vínculos.');
    if (opcoes && opcoes.somenteLocal) {
      var local = lerLocal(nome) || vazio(nome);
      local._origem = 'cache';
      return local;
    }
    try {
      var remoto = await lerRemoto(nome);
      escreverLocal(nome, remoto.registro);
      remoto.registro._origem = 'supabase';
      return remoto.registro;
    } catch (e) {
      if (opcoes && opcoes.exigirRemoto) throw new Error('Não foi possível consultar os vínculos no banco: ' + e.message);
      var copia = lerLocal(nome) || vazio(nome);
      copia._origem = 'cache';
      return copia;
    }
  }
  async function salvarVinculo(unidade, usuario, consultorio) {
    if (typeof MapaHospitalStore === 'undefined') throw new Error('O módulo de permissões não está disponível.');
    MapaHospitalStore.exigirPermissaoUnidade(unidade); // proteção de interface; servidor precisa de RLS
    var doc = cpf(usuario && usuario.cpf);
    if (!doc) throw new Error('O médico precisa ter um CPF válido.');
    var atual = await lerRemoto(unidade);
    var agora = new Date(Math.max(Date.now(), (Date.parse(atual.versao || '') || 0) + 1)).toISOString();
    atual.registro.vinculos[doc] = {
      consultorio: texto(consultorio), nome: texto(usuario.nome),
      crm: texto(usuario.crm || usuario.registroProfissional || usuario.registro_profissional),
      especialidade: texto(usuario.especialidade), atualizado_em: agora
    };
    atual.registro.atualizado_em = agora;
    var linha = { chave: chaveRemota(unidade), valor: JSON.stringify(atual.registro),
      descricao: 'Vínculos de médicos e consultórios — ' + unidade, atualizado_em: agora };
    var q = atual.versao
      ? supabaseClient.from('configuracoes').update(linha).eq('chave', linha.chave).eq('atualizado_em', atual.versao).select('chave')
      : supabaseClient.from('configuracoes').insert(linha).select('chave');
    var resultado = await q;
    if (resultado.error || !resultado.data || resultado.data.length !== 1) {
      throw new Error('O vínculo não foi salvo. A equipe pode ter sido alterada em outra sessão ou a gravação foi negada; recarregue e tente novamente.');
    }
    escreverLocal(unidade, atual.registro);
    atual.registro._origem = 'supabase';
    return clonar(atual.registro);
  }
  function obterVinculo(equipe, usuario) {
    var documento = cpf(usuario && usuario.cpf);
    return documento && equipe && equipe.vinculos ? equipe.vinculos[documento] || null : null;
  }
  return { carregar: carregar, salvarVinculo: salvarVinculo, obterVinculo: obterVinculo,
    normalizar: normalizar, chaveRemota: chaveRemota, chaveLocal: chaveLocal, temSupabase: temSupabase, clonar: clonar };
})();
