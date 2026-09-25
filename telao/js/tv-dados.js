/* ============================================================
   VIDA+ TELÃO — Ponte de dados (tv-dados.js)
   ------------------------------------------------------------
   O telão (index.html) usa TV.getChamadasRecentes() para buscar
   as senhas chamadas. Este arquivo define esse objeto usando o
   banco compartilhado (DB) — sem duplicar dados e sem mexer
   nos outros módulos do sistema.
   ============================================================ */
var TV = (function () {
  'use strict';

  var CACHE_KEY = 'vidamais_tv_chamadas';

  function lerCache() {
    try {
      if (typeof localStorage === 'undefined') return [];
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function salvarCache(chamadas) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CACHE_KEY, JSON.stringify(chamadas || []));
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
          (!unidade || !c.unidade || c.unidade === unidade);
      })
      .sort(function (a, b) {
        return new Date(b.chamado_em) - new Date(a.chamado_em);
      })
      .slice(0, 6);
  }

  /* Chamadas recentes para exibir no telão:
     - Inclui apenas senhas com status "chamado" (chamada ativa).
     - NÃO inclui finalizadas, canceladas ou já em consulta.
     - Ordenadas da mais nova para a mais antiga, no máximo 6.
     - Prioriza os dados do Supabase para funcionar em qualquer dispositivo,
       mesmo remoto, e usa o cache local como fallback. */
  function getChamadasLocais() {
    try {
      if (typeof DB === 'undefined' || !DB || typeof DB.getConsultas !== 'function') {
        return lerCache();
      }
      var consultas = DB.getConsultas() || [];
      var lista = normalizarChamadas(consultas);
      salvarCache(lista);
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
      return getChamadasLocais();
    }

    try {
      var consulta = supabaseClient
        .from('consultas')
        .select('id, senha, status, chamado_em, tipo_chamada, nome_chamado, consultorio, medico_nome, guiche, unidade')
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
      salvarCache(dados);
      return dados;
    } catch (e) {
      console.warn('[Telão] Supabase indisponível ou sem dados remotos, usando cache local:', e.message);
      return getChamadasLocais();
    }
  }

  async function getChamadasRecentes() {
    var remotas = await getChamadasRemotas();
    if (remotas && remotas.length) return remotas;
    return getChamadasLocais();
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
        getChamadasRecentes().then(function (dados) {
          salvarCache(dados);
        }).catch(function () {});
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
