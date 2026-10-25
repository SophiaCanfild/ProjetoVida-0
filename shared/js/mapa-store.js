/* ============================================================
   VIDA+ — Armazenamento dos mapas hospitalares
   ------------------------------------------------------------
   Rascunhos ficam no navegador do administrador. Ao publicar,
   o mapa é salvo em configuracoes (Supabase) e em cache local.
   O telão lê SOMENTE a versão publicada.
   ============================================================ */
var MapaHospitalStore = (function () {
  'use strict';

  var PREFIXO = 'vidamais_mapa_hospital_';

  function clonar(valor) {
    return valor == null ? valor : JSON.parse(JSON.stringify(valor));
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

  function chavePublicado(unidade) {
    return PREFIXO + slug(unidade) + '_publicado';
  }

  function chaveRascunho(unidade) {
    return PREFIXO + slug(unidade) + '_rascunho';
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

  function valorLocalPublicado(unidade) {
    var salvo = lerLocal(chavePublicado(unidade));
    return desempacotar(salvo);
  }

  async function carregarPublicado(unidade, opcoes) {
    var local = valorLocalPublicado(unidade) || mapaPadrao(unidade);
    if ((opcoes && opcoes.somenteLocal) || !temSupabase()) {
      local._origem = valorLocalPublicado(unidade) ? 'local' : 'modelo';
      return clonar(local);
    }

    try {
      var resposta = await supabaseClient.from('configuracoes')
        .select('valor, atualizado_em')
        .eq('chave', chaveRemota(unidade))
        .limit(1);
      if (resposta.error) throw resposta.error;

      var linha = resposta.data && resposta.data[0];
      if (linha && linha.valor) {
        var mapa = desempacotar(JSON.parse(linha.valor));
        if (mapa) {
          escreverLocal(chavePublicado(unidade), mapa);
          mapa._origem = 'supabase';
          mapa._publicado_em = mapa.publicado_em || linha.atualizado_em;
          return clonar(mapa);
        }
      }
    } catch (e) {
      console.warn('[Mapa hospitalar] Supabase indisponível; usando cache local:', e.message);
    }

    local._origem = valorLocalPublicado(unidade) ? 'local' : 'modelo';
    return clonar(local);
  }

  async function carregarRascunho(unidade) {
    var rascunho = desempacotar(lerLocal(chaveRascunho(unidade)));
    if (rascunho) {
      rascunho._origem = 'rascunho';
      return clonar(rascunho);
    }
    return carregarPublicado(unidade);
  }

  function salvarRascunho(unidade, mapa) {
    var copia = clonar(mapa);
    delete copia._origem;
    delete copia._publicado_em;
    if (!escreverLocal(chaveRascunho(unidade), copia)) {
      throw new Error('Não foi possível salvar o rascunho neste navegador.');
    }
    return copia;
  }

  function descartarRascunho(unidade) {
    removerLocal(chaveRascunho(unidade));
  }

  async function publicar(unidade, mapa) {
    var copia = clonar(mapa);
    var agora = new Date().toISOString();
    copia.configurado = true;
    copia.publicado_em = agora;
    delete copia._origem;
    delete copia._publicado_em;

    var pacote = {
      versao: 1,
      unidade: unidade,
      publicado_em: agora,
      mapa: copia
    };

    if (temSupabase()) {
      var resposta = await supabaseClient.from('configuracoes').upsert({
        chave: chaveRemota(unidade),
        valor: JSON.stringify(pacote),
        descricao: 'Mapa e rotas publicados para o telão — ' + unidade,
        atualizado_em: agora
      }, { onConflict: 'chave' });
      if (resposta.error) {
        throw new Error('O rascunho foi mantido, mas a publicação no Supabase falhou: ' + resposta.error.message);
      }
    }

    var cacheGravado = escreverLocal(chavePublicado(unidade), copia);
    if (!temSupabase() && !cacheGravado) {
      throw new Error('Não foi possível gravar a publicação neste navegador. O rascunho foi preservado.');
    }
    descartarRascunho(unidade);
    copia._origem = temSupabase() ? 'supabase' : 'local';
    copia._publicado_em = agora;
    return clonar(copia);
  }

  return {
    chaveRemota: chaveRemota,
    chavePublicado: chavePublicado,
    chaveRascunho: chaveRascunho,
    mapaPadrao: mapaPadrao,
    carregarPublicado: carregarPublicado,
    carregarRascunho: carregarRascunho,
    salvarRascunho: salvarRascunho,
    descartarRascunho: descartarRascunho,
    publicar: publicar,
    temSupabase: temSupabase,
    clonar: clonar
  };
})();
