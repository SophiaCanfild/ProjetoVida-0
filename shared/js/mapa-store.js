/* ============================================================
   VIDA+ — Armazenamento dos mapas hospitalares
   ------------------------------------------------------------
   O pacote JSON em configuracoes preserva o grafo completo:
   áreas, pontos, destinos, ligações, tempos e acessibilidade.
   Rascunho e publicação usam chaves diferentes. O telão lê
   SOMENTE a versão publicada; o rascunho pode ser sincronizado
   no Supabase sem alterar o que aparece na TV.
   ============================================================ */
var MapaHospitalStore = (function () {
  'use strict';

  var PREFIXO = 'vidamais_mapa_hospital_';

  function clonar(valor) {
    return valor == null ? valor : JSON.parse(JSON.stringify(valor));
  }

  function agora() { return new Date().toISOString(); }

  function dataMs(valor) {
    if (!valor) return 0;
    var convertida = Date.parse(String(valor));
    return isFinite(convertida) ? convertida : 0;
  }

  function slug(unidade) {
    var texto = String(unidade || 'unidade').trim().toLowerCase();
    if (typeof texto.normalize === 'function') {
      texto = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return texto.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'unidade';
  }

  function chaveRemota(unidade) {
    return 'mapa_hospital_' + slug(unidade);
  }

  function chaveRascunhoRemota(unidade) {
    return chaveRemota(unidade) + '_rascunho';
  }

  function chavePublicado(unidade) {
    return PREFIXO + slug(unidade) + '_publicado';
  }

  function chaveRascunho(unidade) {
    return PREFIXO + slug(unidade) + '_rascunho';
  }

  function chaveRascunhoMeta(unidade) {
    return chaveRascunho(unidade) + '_meta';
  }

  function lerLocal(chave) {
    try {
      var bruto = window.localStorage.getItem(chave);
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      return null;
    }
  }

  function escreverLocal(chave, valor) {
    try {
      window.localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      return false;
    }
  }

  function removerLocal(chave) {
    try { window.localStorage.removeItem(chave); } catch (e) { /* ignora */ }
  }

  function temSupabase() {
    return typeof supabaseClient !== 'undefined' && supabaseClient &&
      typeof supabaseClient.from === 'function';
  }

  function limparMapa(mapa) {
    var copia = clonar(mapa) || {};
    [
      '_origem', '_publicado_em', '_rascunho_em', '_rascunho_base_em',
      '_rascunho_remoto_pendente'
    ].forEach(function (chave) { delete copia[chave]; });
    return copia;
  }

  function mapaVazio(unidade) {
    return {
      configurado: false,
      nome: 'Mapa de ' + unidade,
      ponto_inicial: 'recepcao',
      areas: [],
      nos: [
        {
          id: 'recepcao', nome: 'Recepção', tipo: 'inicio',
          x: 100, y: 165, andar: 'Térreo', bloco: 'Bloco A'
        },
        {
          id: 'triagem', nome: 'Triagem', tipo: 'triagem',
          x: 500, y: 165, andar: 'Térreo', bloco: 'Bloco A'
        }
      ],
      ligacoes: [
        {
          de: 'recepcao', para: 'triagem', peso: 1, tempo: 30,
          acessivel: true,
          instrucao: 'Saia da recepção e siga as placas para a Triagem.'
        }
      ],
      destinos: { triagem: 'triagem', consultorios: {}, guiches: {} }
    };
  }

  function mapaPadrao(unidade) {
    if (typeof MAPAS_HOSPITAL !== 'undefined' && MAPAS_HOSPITAL.unidades &&
        MAPAS_HOSPITAL.unidades[unidade]) {
      return clonar(MAPAS_HOSPITAL.unidades[unidade]);
    }
    return mapaVazio(unidade);
  }

  function desempacotar(registro) {
    if (!registro) return null;
    if (registro.mapa && Array.isArray(registro.mapa.nos)) return registro.mapa;
    if (Array.isArray(registro.nos)) return registro;
    return null;
  }

  /* Lê tanto o pacote novo quanto o mapa "nu" das versões antigas. */
  function infoPacote(registro) {
    var mapa = desempacotar(registro);
    if (!mapa) return null;
    return {
      mapa: mapa,
      em: registro.rascunho_em || registro.publicado_em || mapa.rascunho_em || mapa.publicado_em || null,
      base_em: registro.base_em || null,
      pacote: registro
    };
  }

  function infoPublicadoLocal(unidade) {
    var salvo = lerLocal(chavePublicado(unidade));
    return infoPacote(salvo);
  }

  function infoRascunhoLocal(unidade) {
    var salvo = lerLocal(chaveRascunho(unidade));
    var info = infoPacote(salvo);
    if (!info) return null;
    var meta = lerLocal(chaveRascunhoMeta(unidade)) || {};
    /* Um rascunho legado pode conter publicado_em porque foi criado a
       partir da versão publicada. Essa data não é a data da edição e
       não deve autorizar seu descarte automático. */
    info.em = meta.rascunho_em || salvo.rascunho_em ||
      (salvo.mapa && salvo.mapa.rascunho_em) || null;
    info.base_em = meta.base_em || salvo.base_em || null;
    return info;
  }

  function escreverRascunhoLocal(unidade, mapa, em, baseEm) {
    var mapaGravado = escreverLocal(chaveRascunho(unidade), limparMapa(mapa));
    var metaGravada = escreverLocal(chaveRascunhoMeta(unidade), {
      versao: 1,
      unidade: unidade,
      rascunho_em: em || null,
      base_em: baseEm || null
    });
    return mapaGravado && metaGravada;
  }

  function pacoteRascunho(unidade, mapa, em, baseEm) {
    return {
      versao: 1,
      unidade: unidade,
      rascunho_em: em,
      base_em: baseEm || null,
      mapa: limparMapa(mapa)
    };
  }

  function mapaComOrigem(info, origem) {
    var mapa = clonar(info.mapa);
    mapa._origem = origem;
    if (origem.indexOf('rascunho') === 0) {
      mapa._rascunho_em = info.em || null;
      mapa._rascunho_base_em = info.base_em || null;
    } else {
      mapa._publicado_em = info.em || mapa.publicado_em || null;
    }
    return mapa;
  }

  async function lerRemoto(chave) {
    var resposta = await supabaseClient.from('configuracoes')
      .select('valor, atualizado_em')
      .eq('chave', chave)
      .limit(1);
    if (resposta.error) throw resposta.error;
    var linha = resposta.data && resposta.data[0];
    if (!linha || !linha.valor) return null;
    var bruto = typeof linha.valor === 'string' ? JSON.parse(linha.valor) : linha.valor;
    var info = infoPacote(bruto);
    if (!info) return null;
    info.em = info.em || linha.atualizado_em || null;
    /* O timestamp remoto é a base para detectar edição concorrente. */
    info.base_em = info.em;
    return info;
  }

  async function carregarPublicado(unidade, opcoes) {
    var local = infoPublicadoLocal(unidade);
    var mapaLocal = local ? local.mapa : mapaPadrao(unidade);
    if ((opcoes && opcoes.somenteLocal) || !temSupabase()) {
      return mapaComOrigem({ mapa: mapaLocal, em: local && local.em }, local ? 'local' : 'modelo');
    }

    try {
      var remoto = await lerRemoto(chaveRemota(unidade));
      if (remoto) {
        escreverLocal(chavePublicado(unidade), limparMapa(remoto.mapa));
        return mapaComOrigem(remoto, 'supabase');
      }
    } catch (e) {
      console.warn('[Mapa hospitalar] Supabase indisponível; usando cache local:', e.message);
    }

    return mapaComOrigem({ mapa: mapaLocal, em: local && local.em }, local ? 'local' : 'modelo');
  }

  async function carregarRascunho(unidade, opcoes) {
    var local = infoRascunhoLocal(unidade);
    if ((opcoes && opcoes.somenteLocal) || !temSupabase()) {
      if (local) return mapaComOrigem(local, 'rascunho');
      return carregarPublicado(unidade, opcoes);
    }

    var remoto;
    try {
      remoto = await lerRemoto(chaveRascunhoRemota(unidade));
    } catch (e) {
      console.warn('[Mapa hospitalar] Falha ao ler rascunho remoto:', e.message);
      if (local) return mapaComOrigem(local, 'rascunho-cache');
      return carregarPublicado(unidade, opcoes);
    }

    /* A publicação também precisa ser comparada quando não há rascunho
       remoto: outra estação pode tê-lo descartado após publicar. Se a
       leitura da publicação falhar, nenhum rascunho é descartado. */
    var publicado = null;
    try {
      publicado = await lerRemoto(chaveRemota(unidade));
    } catch (e) {
      console.warn('[Mapa hospitalar] Não foi possível comparar a publicação:', e.message);
    }

    var localMs = local ? dataMs(local.em) : 0;
    var remotoMs = remoto ? dataMs(remoto.em) : 0;
    var publicadoMs = publicado ? dataMs(publicado.em) : 0;
    var candidato = null;
    var origemCandidato = null;

    /* Uma edição local com timestamp comprovadamente maior não é
       substituída pelo rascunho remoto. Um rascunho local legado sem
       timestamp também é preservado: sem data confiável, só uma
       escolha explícita pode substituí-lo. A opção preferirRemoto é
       usada somente após confirmação na resolução de conflitos. */
    if (!(opcoes && opcoes.preferirRemoto) && local &&
        (!remoto || localMs === 0 || (localMs > 0 && localMs > remotoMs))) {
      candidato = local;
      origemCandidato = 'rascunho-local';
    } else if (remoto) {
      candidato = remoto;
      origemCandidato = 'rascunho-supabase';
    }

    /* Uma publicação posterior vence somente um rascunho com data
       conhecida e não mais nova. Assim, uma falha ao apagar a chave
       remota não reabre trabalho antigo, mas também não apaga uma
       edição local mais recente que a publicação. */
    if (candidato && publicadoMs > 0 && dataMs(candidato.em) > 0 &&
        dataMs(candidato.em) <= publicadoMs) {
      descartarRascunho(unidade);
      escreverLocal(chavePublicado(unidade), limparMapa(publicado.mapa));
      var versaoPublicada = mapaComOrigem(publicado, 'supabase');
      /* Se o rascunho remoto antigo continuar lá, esta base permite
         substituí-lo conscientemente na próxima edição, sem bloquear
         o administrador para sempre. */
      if (remoto) versaoPublicada._rascunho_base_em = remoto.em || null;
      return versaoPublicada;
    }

    if (candidato && candidato === local) return mapaComOrigem(local, origemCandidato);
    if (candidato && candidato === remoto) {
      escreverRascunhoLocal(unidade, remoto.mapa, remoto.em, remoto.em);
      return mapaComOrigem(remoto, origemCandidato);
    }

    if (publicado) {
      escreverLocal(chavePublicado(unidade), limparMapa(publicado.mapa));
      return mapaComOrigem(publicado, 'supabase');
    }

    /* Não havia rascunho remoto e a publicação não pôde ser lida:
       usa o último cache publicado ou o modelo, sem inventar dados. */
    var publicadoLocal = infoPublicadoLocal(unidade);
    if (publicadoLocal) return mapaComOrigem(publicadoLocal, 'local');
    return mapaComOrigem({ mapa: mapaPadrao(unidade), em: null }, 'modelo');
  }

  function salvarRascunho(unidade, mapa) {
    var copia = limparMapa(mapa);
    var em = agora();
    var baseEm = mapa && mapa._rascunho_base_em || null;
    if (!escreverRascunhoLocal(unidade, copia, em, baseEm)) {
      throw new Error('Não foi possível salvar o rascunho neste navegador.');
    }
    copia._origem = 'rascunho';
    copia._rascunho_em = em;
    copia._rascunho_base_em = baseEm;
    return copia;
  }

  /* Salva o rascunho completo no Supabase. A leitura anterior evita
     sobrescrever o trabalho de outro administrador após uma falha de
     leitura ou quando a base local ficou desatualizada. */
  async function salvarRascunhoRemoto(unidade, mapa, opcoes) {
    if (!mapa) throw new Error('Não há um mapa para salvar.');
    if (!temSupabase()) return salvarRascunho(unidade, mapa);

    var em = mapa._rascunho_em || agora();
    var baseEm = mapa._rascunho_base_em || null;
    var atual;
    try {
      atual = await lerRemoto(chaveRascunhoRemota(unidade));
    } catch (e) {
      throw new Error('Não foi possível ler o rascunho remoto antes de salvar. O rascunho local foi preservado: ' + e.message);
    }

    if (atual && !(opcoes && opcoes.forcar)) {
      var remotoMaisNovoQueBase = dataMs(atual.em) > dataMs(baseEm);
      if (remotoMaisNovoQueBase) {
        var conflito = new Error('Existe um rascunho remoto mais recente para esta unidade. O envio foi bloqueado; a cópia local foi preservada.');
        conflito.codigo = 'CONFLITO_RASCUNHO';
        throw conflito;
      }
    }

    var pacote = pacoteRascunho(unidade, mapa, em, baseEm);
    var resposta;
    try {
      resposta = await supabaseClient.from('configuracoes').upsert({
        chave: chaveRascunhoRemota(unidade),
        valor: JSON.stringify(pacote),
        descricao: 'Rascunho de mapa e rotas — ' + unidade,
        atualizado_em: em
      }, { onConflict: 'chave' });
    } catch (e) {
      throw new Error('O rascunho não foi salvo no Supabase. A cópia local foi preservada: ' + e.message);
    }
    if (resposta.error) {
      throw new Error('O rascunho não foi salvo no Supabase. A cópia local foi preservada: ' + resposta.error.message);
    }

    escreverRascunhoLocal(unidade, pacote.mapa, em, em);
    return mapaComOrigem({ mapa: pacote.mapa, em: em, base_em: em }, 'rascunho-supabase');
  }

  function descartarRascunho(unidade) {
    removerLocal(chaveRascunho(unidade));
    removerLocal(chaveRascunhoMeta(unidade));
  }

  async function descartarRascunhoRemoto(unidade) {
    if (temSupabase()) {
      var resposta;
      try {
        resposta = await supabaseClient.from('configuracoes')
          .delete()
          .eq('chave', chaveRascunhoRemota(unidade));
      } catch (e) {
        throw new Error('Não foi possível descartar o rascunho remoto. Ele foi mantido: ' + e.message);
      }
      if (resposta.error) {
        throw new Error('Não foi possível descartar o rascunho remoto. Ele foi mantido: ' + resposta.error.message);
      }
    }
    descartarRascunho(unidade);
    return true;
  }

  async function publicar(unidade, mapa) {
    var copia = limparMapa(mapa);
    var em = agora();
    copia.configurado = true;
    copia.publicado_em = em;

    var pacote = {
      versao: 1,
      unidade: unidade,
      publicado_em: em,
      mapa: copia
    };

    var rascunhoRemotoPendente = false;
    if (temSupabase()) {
      /* Publicar também é uma escrita: não pode apagar um rascunho
         remoto mais novo só porque esta tela ainda não o sincronizou. */
      var rascunhoAtual;
      try {
        rascunhoAtual = await lerRemoto(chaveRascunhoRemota(unidade));
      } catch (e) {
        throw new Error('Não foi possível verificar o rascunho remoto antes de publicar. A publicação foi cancelada e a cópia local foi preservada: ' + e.message);
      }
      var baseRascunhoEm = mapa && mapa._rascunho_base_em || null;
      if (rascunhoAtual && dataMs(rascunhoAtual.em) > dataMs(baseRascunhoEm)) {
        var conflitoPublicacao = new Error('Existe um rascunho remoto mais recente para esta unidade. A publicação foi cancelada para não sobrescrevê-lo; a cópia local foi preservada.');
        conflitoPublicacao.codigo = 'CONFLITO_RASCUNHO';
        throw conflitoPublicacao;
      }

      var resposta;
      try {
        resposta = await supabaseClient.from('configuracoes').upsert({
          chave: chaveRemota(unidade),
          valor: JSON.stringify(pacote),
          descricao: 'Mapa e rotas publicados para o telão — ' + unidade,
          atualizado_em: em
        }, { onConflict: 'chave' });
      } catch (e) {
        throw new Error('O rascunho foi mantido, mas a publicação no Supabase falhou: ' + e.message);
      }
      if (resposta.error) {
        throw new Error('O rascunho foi mantido, mas a publicação no Supabase falhou: ' + resposta.error.message);
      }

      try {
        await descartarRascunhoRemoto(unidade);
      } catch (e) {
        /* A publicação já foi confirmada. Não a desfazemos nem a
           apresentamos como erro; a próxima carga descarta o rascunho
           antigo comparando os timestamps. */
        rascunhoRemotoPendente = true;
        console.warn('[Mapa hospitalar] Publicação concluída, mas o rascunho remoto permaneceu:', e.message);
      }
    }

    var cacheGravado = escreverLocal(chavePublicado(unidade), copia);
    if (!temSupabase() && !cacheGravado) {
      throw new Error('Não foi possível gravar a publicação neste navegador. O rascunho foi preservado.');
    }
    descartarRascunho(unidade);
    copia._origem = temSupabase() ? 'supabase' : 'local';
    copia._publicado_em = em;
    if (rascunhoRemotoPendente) copia._rascunho_remoto_pendente = true;
    return clonar(copia);
  }

  return {
    chaveRemota: chaveRemota,
    chaveRascunhoRemota: chaveRascunhoRemota,
    chavePublicado: chavePublicado,
    chaveRascunho: chaveRascunho,
    chaveRascunhoMeta: chaveRascunhoMeta,
    mapaPadrao: mapaPadrao,
    carregarPublicado: carregarPublicado,
    carregarRascunho: carregarRascunho,
    salvarRascunho: salvarRascunho,
    salvarRascunhoRemoto: salvarRascunhoRemoto,
    descartarRascunho: descartarRascunho,
    descartarRascunhoRemoto: descartarRascunhoRemoto,
    publicar: publicar,
    temSupabase: temSupabase,
    clonar: clonar
  };
})();
