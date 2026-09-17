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

  /* Chamadas recentes para exibir no telão:
     - Inclui apenas senhas com status "chamado" (chamada ativa).
     - NÃO inclui finalizadas, canceladas ou já em consulta.
     - Ordenadas da mais nova para a mais antiga, no máximo 6. */
  function getChamadasRecentes() {
    try {
      if (typeof DB === 'undefined' || !DB || typeof DB.getConsultas !== 'function') {
        return [];
      }
      var consultas = DB.getConsultas() || [];
      return consultas
        .filter(function (c) {
          return c && c.chamado_em && c.status === 'chamado';
        })
        .sort(function (a, b) {
          return new Date(b.chamado_em) - new Date(a.chamado_em);
        })
        .slice(0, 6);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Telão] Falha ao ler chamadas:', e.message);
      }
      return [];
    }
  }

  return {
    getChamadasRecentes: getChamadasRecentes
  };
})();
