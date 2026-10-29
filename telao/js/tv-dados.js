/* ============================================================
   VIDA+ TELÃO — Ponte de dados (tv-dados.js)
   ------------------------------------------------------------
   O telão (index.html) usa TV.getChamadasRecentes() para buscar
   as senhas chamadas. Este arquivo define esse objeto usando o
   Supabase diretamente com os campos mínimos da chamada; o cache
   local é apenas uma alternativa sem sincronizar dados clínicos.
   ============================================================ */
var TV = (function () {
  'use strict';

  var CACHE_KEY = 'vidamais_tv_chamadas';

  function lerCache(exigirRemoto) {
    try {
      if (typeof localStorage === 'undefined') return [];
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return exigirRemoto ? [] : normalizarChamadas(parsed);
      if (exigirRemoto && (!parsed || parsed.origem !== 'supabase')) return [];
      return normalizarChamadas(parsed && parsed.chamadas || []);
    } catch (e) {
      return [];
    }
  }

  function salvarCache(chamadas, origem) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ origem: origem, chamadas: normalizarChamadas(chamadas) }));
      }
    } catch (e) {
      // ignora falhas de armazenamento do navegador
    }
  }

  function normalizarChamadas(chamadas) {
    var unidade = typeof TV_CONFIG !== 'undefined' ? TV_CONFIG.UNIDADE : null;
    return (chamadas || [])
      .filter(function (c) {
        return c && c.chamado_em && c.status === 'chamado' &&
          (!unidade || c.unidade === unidade);
      })
      .sort(function (a, b) {
        return new Date(b.chamado_em) - new Date(a.chamado_em);
      })
      .slice(0, 6)
      .map(function (c) {
        return { id: c.id, senha: c.senha, status: c.status, chamado_em: c.chamado_em,
          tipo_chamada: c.tipo_chamada, consultorio: c.consultorio, medico_nome: c.medico_nome,
          guiche: c.guiche, unidade: c.unidade };
      });
  }

  /* Chamadas recentes para exibir no telão:
     - Inclui apenas senhas com status "chamado" (chamada ativa).
     - NÃO inclui finalizadas, canceladas ou já em consulta.
     - Ordenadas da mais nova para a mais antiga, no máximo 6.
     - Prioriza os dados do Supabase para funcionar em qualquer dispositivo,
       mesmo remoto, e usa o cache local como fallback. */
  function getChamadasLocais() {
    try {
      // O telão não carrega a camada DB completa (que sincroniza prontuários).
      // No modo local, lê apenas chamadas já existentes e reduz ao mínimo para o cache.
      var consultas;
      if (typeof DB !== 'undefined' && DB && typeof DB.getConsultas === 'function') {
        consultas = DB.getConsultas();
      } else {
        var bruto = typeof localStorage !== 'undefined' ? localStorage.getItem('vidamais_consultas') : null;
        consultas = bruto ? JSON.parse(bruto) : null;
      }
      if (!Array.isArray(consultas)) return lerCache();
      var lista = normalizarChamadas(consultas);
      salvarCache(lista, 'local');
      return lista;
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Telão] Falha ao ler chamadas:', e.message);
      }
      return lerCache();
    }
  }

  async function getChamadasRemotas() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      // Com Supabase configurado, a ausência do cliente (CDN ou rede) não
      // transforma consultas locais não confirmadas em chamadas oficiais.
      // O modo local legado continua disponível apenas sem banco configurado.
      if (typeof SUPABASE_CONFIGURADO !== 'undefined' && SUPABASE_CONFIGURADO === false) {
        return getChamadasLocais();
      }
      return lerCache(true);
    }

    try {
      var consulta = supabaseClient
        .from('consultas')
        .select('id, senha, status, chamado_em, tipo_chamada, consultorio, medico_nome, guiche, unidade')
        .eq('status', 'chamado')
        .order('chamado_em', { ascending: false })
        .limit(6);

      if (typeof TV_CONFIG !== 'undefined' && TV_CONFIG.UNIDADE) {
        consulta = consulta.eq('unidade', TV_CONFIG.UNIDADE);
      }

      var resultado = await consulta;
      if (resultado && resultado.error) {
        throw new Error(resultado.error.message);
      }

      var dados = normalizarChamadas(resultado && resultado.data ? resultado.data : []);
      salvarCache(dados, 'supabase');
      return dados;
    } catch (e) {
      console.warn('[Telão] Supabase indisponível; usando apenas chamadas previamente confirmadas:', e.message);
      return lerCache(true);
    }
  }

  async function getChamadasRecentes() {
    // Uma resposta remota vazia é autoritativa: não ressuscitar chamadas antigas do cache.
    return getChamadasRemotas();
  }

  function iniciarRealtime() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient || typeof supabaseClient.channel !== 'function') {
      return;
    }

    try {
      var channel = supabaseClient.channel('tv-chamadas-live');
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'consultas'
      }, function () {
        getChamadasRecentes().catch(function () {});
      });

      channel.subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          console.log('[Telão] Realtime das chamadas ativo');
        }
      });
    } catch (e) {
      console.warn('[Telão] Realtime do telão indisponível:', e.message);
    }
  }

  iniciarRealtime();

  return {
    getChamadasRecentes: getChamadasRecentes,
    getChamadasRemotas: getChamadasRemotas,
    getChamadasLocais: getChamadasLocais
  };
})();
