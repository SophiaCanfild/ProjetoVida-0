/* ============================================================
   VIDA+ — Vínculos de médicos e consultórios por unidade
   ------------------------------------------------------------
   Usa a tabela configuracoes já existente no Supabase e cache
   local para demonstração. O CPF identifica o médico; o mapa
   continua responsável pelos pontos e percursos físicos.
   ============================================================ */
var EquipeConsultorioStore = (function () {
  'use strict';

  var PREFIXO = 'vidamais_equipe_consultorios_';

  function texto(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function cpf(valor) {
    return texto(valor).replace(/\D/g, '');
  }

  function clonar(valor) {
    return valor == null ? valor : JSON.parse(JSON.stringify(valor));
  }

  function slug(unidade) {
    var resultado = texto(unidade || 'unidade').toLowerCase();
    if (typeof resultado.normalize === 'function') {
      resultado = resultado.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return resultado.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'unidade';
  }

  function chaveRemota(unidade) {
    return 'equipe_consultorios_' + slug(unidade);
  }

  function chaveLocal(unidade) {
    return PREFIXO + slug(unidade);
  }

  function vazio(unidade) {
    return {
      versao: 1,
      unidade: texto(unidade),
      atualizado_em: null,
      vinculos: {}
    };
  }

  function normalizar(registro, unidade) {
    if (typeof registro === 'string') {
      try { registro = JSON.parse(registro); } catch (e) { registro = null; }
    }
    var saida = vazio(unidade || (registro && registro.unidade));
    if (!registro || typeof registro !== 'object') return saida;

    saida.atualizado_em = registro.atualizado_em || null;
    var brutos = registro.vinculos && typeof registro.vinculos === 'object'
      ? registro.vinculos : {};
    Object.keys(brutos).forEach(function (chave) {
      var documento = cpf(chave);
      if (!documento) return;
      var bruto = brutos[chave];
      if (typeof bruto === 'string' || typeof bruto === 'number') {
        bruto = { consultorio: String(bruto) };
      }
      if (!bruto || typeof bruto !== 'object') return;
      saida.vinculos[documento] = {
        consultorio: texto(bruto.consultorio),
        nome: texto(bruto.nome),
        crm: texto(bruto.crm || bruto.registroProfissional || bruto.registro_profissional),
        especialidade: texto(bruto.especialidade),
        atualizado_em: bruto.atualizado_em || registro.atualizado_em || null
      };
    });
    return saida;
  }

  function lerLocal(unidade) {
    try {
      var bruto = window.localStorage.getItem(chaveLocal(unidade));
      return bruto ? normalizar(bruto, unidade) : null;
    } catch (e) {
      return null;
    }
  }

  function escreverLocal(unidade, registro) {
    try {
      window.localStorage.setItem(chaveLocal(unidade), JSON.stringify(normalizar(registro, unidade)));
      return true;
    } catch (e) {
      return false;
    }
  }

  function temSupabase() {
    return typeof supabaseClient !== 'undefined' && supabaseClient &&
      typeof supabaseClient.from === 'function';
  }

  function resultadoLocal(unidade, origem) {
    var local = lerLocal(unidade);
    var resultado = local || vazio(unidade);
    resultado._origem = local ? (origem || 'local') : 'vazio';
    return clonar(resultado);
  }

  async function carregar(unidade, opcoes) {
    var nomeUnidade = texto(unidade);
    if (!nomeUnidade) throw new Error('Informe a unidade para carregar os vínculos.');

    if ((opcoes && opcoes.somenteLocal) || !temSupabase()) {
      return resultadoLocal(nomeUnidade);
    }

    try {
      var resposta = await supabaseClient.from('configuracoes')
        .select('valor, atualizado_em')
        .eq('chave', chaveRemota(nomeUnidade))
        .limit(1);
      if (resposta.error) throw resposta.error;

      var linha = resposta.data && resposta.data[0];
      if (linha && linha.valor) {
        var registro = normalizar(linha.valor, nomeUnidade);
        registro.atualizado_em = registro.atualizado_em || linha.atualizado_em || null;
        escreverLocal(nomeUnidade, registro);
        registro._origem = 'supabase';
        return clonar(registro);
      }
    } catch (e) {
      if (opcoes && opcoes.exigirRemoto) {
        throw new Error('Não foi possível ler os vínculos atuais do Supabase. Nenhuma alteração foi gravada: ' + e.message);
      }
      console.warn('[Equipe/consultórios] Supabase indisponível; usando cache local:', e.message);
    }
    return resultadoLocal(nomeUnidade, 'cache');
  }

  async function gravar(unidade, registro) {
    var copia = normalizar(registro, unidade);
    var agora = copia.atualizado_em || new Date().toISOString();

    if (temSupabase()) {
      var resposta;
      try {
        resposta = await supabaseClient.from('configuracoes').upsert({
          chave: chaveRemota(unidade),
          valor: JSON.stringify(copia),
          descricao: 'Vínculos de médicos e consultórios — ' + unidade,
          atualizado_em: agora
        }, { onConflict: 'chave' });
      } catch (e) {
        throw new Error('O vínculo não foi salvo no Supabase: ' + e.message);
      }
      if (resposta.error) {
        throw new Error('O vínculo não foi salvo no Supabase: ' + resposta.error.message);
      }
    }

    if (!escreverLocal(unidade, copia) && !temSupabase()) {
      throw new Error('Não foi possível salvar o vínculo neste navegador.');
    }
    copia._origem = temSupabase() ? 'supabase' : 'local';
    return clonar(copia);
  }

  async function salvarVinculo(unidade, usuario, consultorio) {
    var documento = cpf(usuario && usuario.cpf);
    if (!documento) throw new Error('O médico precisa ter um CPF válido para receber um consultório.');

    var atual = await carregar(unidade, { exigirRemoto: true });
    var agora = new Date().toISOString();
    atual.vinculos[documento] = {
      consultorio: texto(consultorio),
      nome: texto(usuario.nome),
      crm: texto(usuario.crm || usuario.registroProfissional || usuario.registro_profissional),
      especialidade: texto(usuario.especialidade),
      atualizado_em: agora
    };
    atual.atualizado_em = agora;
    return gravar(unidade, atual);
  }

  function obterVinculo(equipe, usuario) {
    var documento = cpf(usuario && usuario.cpf);
    if (!documento || !equipe || !equipe.vinculos) return null;
    return equipe.vinculos[documento] || null;
  }

  return {
    carregar: carregar,
    salvarVinculo: salvarVinculo,
    obterVinculo: obterVinculo,
    normalizar: normalizar,
    chaveRemota: chaveRemota,
    chaveLocal: chaveLocal,
    temSupabase: temSupabase,
    clonar: clonar
  };
})();
