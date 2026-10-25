/* CÓPIA de shared/js/db.js (idêntica, exceto este aviso).
   Existe aqui para ficar DENTRO do escopo do service worker
   (/paciente-app/), permitindo carregar o app offline.
   Ao alterar a camada de dados, atualize os DOIS arquivos. */
/* ============================================================
   VIDA+ — Camada de Dados COMPARTILHADA (Supabase + localStorage)
   ============================================================
   Usada por TODOS os módulos:
     - Sistema Médico (admin, médico, enfermeiro, recepcionista)
     - App do Paciente
     - Telão

   MODO SUPABASE (padrão): banco real compartilhado via Supabase.
   MODO DEMO (fallback): localStorage compartilhado quando Supabase
   não estiver configurado.

   FLUXO DE DADOS:
     1. Na inicialização: se Supabase configurado, baixa dados → localStorage
     2. Leituras: sempre do localStorage (rápido, síncrono)
     3. Gravações: localStorage imediato + Supabase em background
     4. Realtime: Supabase notifica outras abas/módulos em tempo real

   RECEITAS E EXAMES (área do médico):
     - public.receitas            → 1 linha por receita emitida
     - public.exames_solicitados  → 1 linha por exame pedido (com status)
     - consultas.receita / consultas.exames continuam recebendo a
       "foto" dos itens (é o que o app do paciente lê). As leituras
       unem as duas fontes, então nada quebra antes da migração
       supabase/migrations/20261025_receitas_exames.sql ser aplicada.
   ============================================================ */

(function () {
  'use strict';

  const PREFIXO = 'vidamais_';
  const DB = {};
  // Promessas de INSERT de pacientes ainda em andamento (evita corrida de FK).
  const insercoesPacientesPendentes = new Map();
  // Contador de versão por tabela: detecta gravação local durante um sync.
  const versoesTabela = {};
  // Resolve quando a primeira sincronização com o Supabase termina
  // (ou imediatamente, no modo demo).
  let liberarSincronizacao = null;
  const sincronizacaoInicial = new Promise(function (resolve) { liberarSincronizacao = resolve; });

  // ============================================================
  // UTILIDADES
  // ============================================================
  function ler(chave) {
    try { return JSON.parse(localStorage.getItem(PREFIXO + chave)); }
    catch (e) { return null; }
  }

  function gravar(chave, valor) {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
    versoesTabela[chave] = (versoesTabela[chave] || 0) + 1;
  }

  function versaoDe(chave) {
    return versoesTabela[chave] || 0;
  }

  function gerarId() {
    // UUID v4 — compatível com Supabase (colunas UUID)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function gerarSenha() {
    const prefixos = ['A', 'B', 'C', 'D', 'E'];
    const p = prefixos[Math.floor(Math.random() * prefixos.length)];
    return p + String(100 + Math.floor(Math.random() * 900));
  }

  function agora() {
    return new Date().toISOString();
  }

  function limparCpf(cpf) {
    return (cpf || '').replace(/\D/g, '');
  }

  function unidadePadrao() {
    return typeof APP_CONFIG !== 'undefined' && APP_CONFIG.UNIDADES && APP_CONFIG.UNIDADES[0]
      ? APP_CONFIG.UNIDADES[0]
      : 'UBS Central Araucária';
  }

  // ============================================================
  // SUPABASE — Detecção e mapeamento de colunas
  // ------------------------------------------------------------
  // O formato interno (localStorage/JS) usa alguns nomes diferentes
  // do schema do banco. Aqui convertemos nos dois sentidos e
  // removemos chaves que NÃO existem como coluna no banco —
  // sem isso o PostgREST rejeitaria a gravação inteira.
  // ============================================================
  function temClienteSupabase() {
    return typeof supabaseClient !== 'undefined' &&
      supabaseClient !== null &&
      typeof supabaseClient.from === 'function';
  }

  const MAPA_TABELAS = {
    usuarios: {
      renomear: { senha: 'senha_hash', registroProfissional: 'registro_profissional' },
      colunas: ['id', 'nome', 'cpf', 'email', 'senha_hash', 'perfil', 'registro_profissional', 'crm', 'coren', 'especialidade', 'ativo', 'criado_em']
    },
    pacientes: {
      renomear: { dataNascimento: 'nascimento', tipoSanguineo: 'tipo_sanguineo', medicamentosCont: 'medicamentos_uso', cartaoSus: 'cartao_sus' },
      colunas: ['id', 'cpf', 'nome', 'nascimento', 'sexo', 'telefone', 'email', 'endereco', 'tipo_sanguineo', 'alergias', 'doencas_cronicas', 'medicamentos_uso', 'deficiencia', 'gestante', 'tabagista', 'responsavel_nome', 'responsavel_telefone', 'cartao_sus', 'criado_em', 'atualizado_em']
    },
    consultas: {
      renomear: {},
      colunas: ['id', 'paciente_id', 'cpf', 'unidade', 'senha', 'recepcao', 'triagem', 'diagnostico', 'cid10', 'conduta', 'orientacoes', 'receita', 'exames', 'medico_nome', 'medico_crm', 'status', 'guiche', 'nome_chamado', 'tipo_chamada', 'consultorio', 'chamado_em', 'criado_em', 'finalizado_em', 'cancelado_em']
    },
    agendamentos: {
      renomear: {},
      colunas: ['id', 'paciente_id', 'paciente_cpf', 'unidade', 'especialidade', 'medico_nome', 'data_hora', 'status', 'criado_em']
    },
    notificacoes: {
      renomear: {},
      colunas: ['id', 'cpf', 'tipo', 'titulo', 'texto', 'link', 'lida', 'criado_em']
    },
    receitas: {
      renomear: {},
      colunas: ['id', 'consulta_id', 'paciente_id', 'cpf', 'numero', 'tipo', 'vias', 'itens', 'orientacoes', 'validade_dias', 'valida_ate', 'alertas', 'medico_nome', 'medico_crm', 'unidade', 'emitida_em', 'criado_em']
    },
    exames_solicitados: {
      renomear: {},
      colunas: ['id', 'consulta_id', 'paciente_id', 'cpf', 'pedido', 'nome', 'categoria', 'prioridade', 'indicacao', 'cid10', 'orientacao', 'local_realizacao', 'status', 'resultado', 'realizado_em', 'resultado_em', 'cancelado_em', 'motivo_cancelamento', 'atualizado_por', 'medico_nome', 'medico_crm', 'unidade', 'solicitado_em', 'atualizado_em']
    }
  };

  // Tabelas criadas pela migração 20261025_receitas_exames.sql.
  // Se ainda não existirem no banco, o app avisa e segue funcionando
  // com a "foto" gravada em consultas.receita / consultas.exames.
  const TABELAS_PRESCRICAO = ['receitas', 'exames_solicitados'];
  const MIGRACAO_PRESCRICAO = 'supabase/migrations/20261025_receitas_exames.sql';

  // tipo interno (app) <-> perfil do banco (CHECK do schema só aceita estes valores)
  const TIPO_PARA_PERFIL = { admin: 'administrador', administrador: 'administrador', medico: 'medico', enfermeiro: 'enfermeiro', recepcionista: 'recepcionista' };
  const PERFIL_PARA_TIPO = { administrador: 'admin', medico: 'medico', enfermeiro: 'enfermeiro', recepcionista: 'recepcionista' };
  const CARGO_POR_PERFIL = { administrador: 'Administrador', medico: 'Médico', enfermeiro: 'Enfermeiro(a)', recepcionista: 'Recepcionista' };

  // Objeto local -> linha válida para gravar no banco
  function paraSupabase(tabela, dados) {
    const mapa = MAPA_TABELAS[tabela];
    if (!mapa || !dados) return dados;
    const saida = {};
    Object.keys(dados).forEach(function (chave) {
      const destino = mapa.renomear[chave] || chave;
      if (mapa.colunas.indexOf(destino) !== -1) {
        saida[destino] = dados[chave];
      }
    });
    if (tabela === 'usuarios') {
      const tipoBruto = dados.perfil || dados.tipo;
      if (tipoBruto) saida.perfil = TIPO_PARA_PERFIL[tipoBruto] || tipoBruto;
    }
    return saida;
  }

  // Linha vinda do banco -> formato interno usado pelo app
  function doSupabase(tabela, linha) {
    if (!linha) return linha;
    const obj = Object.assign({}, linha);
    if (tabela === 'usuarios') {
      obj.tipo = PERFIL_PARA_TIPO[obj.perfil] || obj.perfil || 'recepcionista';
      obj.senha = obj.senha_hash !== undefined ? obj.senha_hash : obj.senha;
      obj.registroProfissional = obj.registro_profissional !== undefined ? obj.registro_profissional : obj.registroProfissional;
      obj.cargo = obj.cargo || CARGO_POR_PERFIL[obj.perfil] || 'Funcionário';
    }
    return obj;
  }

  // Escrita assíncrona no Supabase. Os módulos mantêm a atualização local
  // imediata, mas agora também recebem o erro real quando a gravação remota falha.
  function reportarFalhaPersistencia(tabela, operacao, erro) {
    const mensagem = erro && erro.message ? erro.message : String(erro || 'Erro desconhecido');
    console.error('[Supabase ' + operacao + '] FALHOU em ' + tabela + ' → ' + mensagem);
    if (listeners.persistencia_falhou) {
      listeners.persistencia_falhou.forEach(fn => fn({ tabela, operacao, mensagem, erro }));
    }
  }

  async function sbInsert(tabela, dados) {
    if (!temClienteSupabase()) return { ok: true, data: null };
    try {
      const linhas = Array.isArray(dados)
        ? dados.map(function (d) { return paraSupabase(tabela, d); })
        : paraSupabase(tabela, dados);

      const { error, data } = await supabaseClient.from(tabela).insert(linhas);
      if (error) {
        reportarFalhaPersistencia(tabela, 'insert', error);
        return { ok: false, error };
      }
      return { ok: true, data };
    } catch (error) {
      reportarFalhaPersistencia(tabela, 'insert', error);
      return { ok: false, error };
    }
  }

  // Insere linhas que dependem de um paciente (FK consultas.paciente_id).
  // Se o cadastro do paciente ainda está sendo enviado, espera o resultado:
  // sem isso o INSERT da consulta podia chegar antes e falhar com erro 23503.
  async function sbInsertDependente(tabela, dados) {
    const pacienteId = dados && !Array.isArray(dados) ? dados.paciente_id : null;
    const envioPaciente = pacienteId ? insercoesPacientesPendentes.get(pacienteId) : null;

    if (envioPaciente) {
      const resultado = await envioPaciente;
      if (!resultado || resultado.ok === false) {
        const erro = (resultado && resultado.error) ||
          new Error('O cadastro do paciente não foi salvo no Supabase; atendimento não enviado.');
        reportarFalhaPersistencia(tabela, 'insert', erro);
        return { ok: false, error: erro };
      }
    }

    return sbInsert(tabela, dados);
  }

  async function sbUpdate(tabela, dados, filtro) {
    if (!temClienteSupabase()) return { ok: true, data: null };
    try {
      let query = supabaseClient.from(tabela).update(paraSupabase(tabela, dados));
      const filtroFinal = paraSupabase(tabela, filtro || {});

      Object.keys(filtroFinal).forEach(function (campo) {
        const valor = filtroFinal[campo];
        if (valor !== undefined && valor !== null && typeof query.eq === 'function') {
          query = query.eq(campo, valor);
        }
      });

      const { error, data } = await query;
      if (error) {
        reportarFalhaPersistencia(tabela, 'update', error);
        return { ok: false, error };
      }
      return { ok: true, data };
    } catch (error) {
      reportarFalhaPersistencia(tabela, 'update', error);
      return { ok: false, error };
    }
  }

  async function sbUpsert(tabela, dados) {
    if (!temClienteSupabase()) return { ok: true, data: null };
    try {
      const { error, data } = await supabaseClient.from(tabela).upsert(paraSupabase(tabela, dados), { onConflict: 'id' });
      if (error) {
        reportarFalhaPersistencia(tabela, 'upsert', error);
        return { ok: false, error };
      }
      return { ok: true, data };
    } catch (error) {
      reportarFalhaPersistencia(tabela, 'upsert', error);
      return { ok: false, error };
    }
  }

  // ============================================================
  // SINCRONIZAÇÃO INICIAL — Supabase → localStorage
  // ============================================================
  async function sincronizarDoSupabase() {
    if (!temClienteSupabase()) {
      if (liberarSincronizacao) liberarSincronizacao();
      return;
    }

    const tabelas = ['usuarios', 'pacientes', 'consultas', 'agendamentos', 'notificacoes'].concat(TABELAS_PRESCRICAO);
    const versoesAntes = {};
    tabelas.forEach(t => { versoesAntes[t] = versaoDe(t); });

    try {
      const resultados = await Promise.all(
        tabelas.map(t => supabaseClient.from(t).select('*').limit(5000))
      );
      tabelas.forEach((tabela, i) => {
        const { data, error } = resultados[i];
        if (error) {
          console.warn('[Vida+] Falha ao ler tabela', tabela, '→', error.message +
            (TABELAS_PRESCRICAO.indexOf(tabela) !== -1 ? ' (rode ' + MIGRACAO_PRESCRICAO + ' no Supabase)' : ''));
          return;
        }
        if (Array.isArray(data)) {
          const remotas = data.map(linha => doSupabase(tabela, linha));

          // Se o usuário gravou nesta tabela enquanto o download acontecia,
          // NÃO sobrescreve: une o que veio do banco com o que é local.
          // (antes, um cadastro feito durante o carregamento era apagado)
          if (versaoDe(tabela) !== versoesAntes[tabela]) {
            const locais = ler(tabela) || [];
            const porId = new Map(remotas.map(r => [r.id, r]));
            locais.forEach(l => { if (!porId.has(l.id)) porId.set(l.id, l); });
            gravar(tabela, Array.from(porId.values()));
            console.warn('[Vida+] Sync de ' + tabela + ': preservadas alterações locais recentes');
          } else {
            gravar(tabela, remotas);
          }
        }
      });
      console.log('[Vida+] Dados sincronizados do Supabase');
    } catch (e) {
      console.warn('[Vida+] Sync Supabase falhou, usando localStorage:', e.message);
    } finally {
      if (liberarSincronizacao) liberarSincronizacao();
    }
  }

  // ============================================================
  // REALTIME — Atualização automática entre abas/módulos
  // ============================================================
  const EVENTO_REALTIME = {
    consultas: 'consulta_atualizada',
    pacientes: 'paciente_atualizado',
    usuarios: 'usuario_atualizado',
    notificacoes: 'notificacao_criada',
    agendamentos: 'agendamento_atualizado',
    receitas: 'receita_atualizada',
    exames_solicitados: 'exame_solicitado_atualizado'
  };

  function aplicarMudancaRealtime(tabela, payload) {
    // Converte a linha do formato do banco para o formato interno
    const novo = payload.new ? doSupabase(tabela, payload.new) : null;

    // Atualiza cache local
    const lista = ler(tabela) || [];
    if (payload.eventType === 'INSERT' && novo) {
      if (!lista.find(x => x.id === novo.id)) lista.push(novo);
    } else if (payload.eventType === 'UPDATE' && novo) {
      const idx = lista.findIndex(x => x.id === novo.id);
      if (idx !== -1) lista[idx] = novo;
      else lista.push(novo);
    } else if (payload.eventType === 'DELETE') {
      const idx = lista.findIndex(x => x.id === payload.old.id);
      if (idx !== -1) lista.splice(idx, 1);
    }
    gravar(tabela, lista);

    // Dispara listeners locais
    const evt = EVENTO_REALTIME[tabela];
    if (evt && listeners[evt]) {
      listeners[evt].forEach(fn => fn(novo || payload.old));
    }
  }

  function assinarCanal(nomeCanal, tabelas, dicaErro) {
    const channel = supabaseClient.channel(nomeCanal);
    tabelas.forEach(tabela => {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: tabela },
        function (payload) { aplicarMudancaRealtime(tabela, payload); }
      );
    });
    channel.subscribe(function (status) {
      if (status === 'SUBSCRIBED') console.log('[Vida+] Realtime conectado (' + nomeCanal + ')');
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Vida+] Realtime falhou em ' + nomeCanal + ' (' + status + '). ' + dicaErro);
      }
    });
  }

  function setupRealtime() {
    // "channel" é método do CLIENTE (supabaseClient), não da lib global (window.supabase).
    // A verificação antiga (!supabase.channel) era sempre falsa positiva e o realtime
    // nunca era ativado.
    if (!temClienteSupabase() || typeof supabaseClient.channel !== 'function') return;

    try {
      assinarCanal('vida-mais-sync',
        ['consultas', 'pacientes', 'usuarios', 'notificacoes', 'agendamentos'],
        'Habilite a publicação das tabelas no Supabase (ver supabase/schema.sql).');
    } catch (e) {
      console.warn('[Vida+] Realtime indisponível:', e.message);
    }

    // Canal próprio para receitas/exames: se a migração ainda não foi
    // aplicada, a falha fica isolada e não derruba o realtime principal.
    try {
      assinarCanal('vida-mais-prescricoes', TABELAS_PRESCRICAO,
        'Rode ' + MIGRACAO_PRESCRICAO + ' para ativar o tempo real de receitas e exames.');
    } catch (e) {
      console.warn('[Vida+] Realtime de receitas/exames indisponível:', e.message);
    }
  }

  // ============================================================
  // EVENTOS — Permite que um módulo avise os outros em tempo real
  // ============================================================
  const listeners = {};

  DB.on = function (evento, callback) {
    if (!listeners[evento]) listeners[evento] = [];
    listeners[evento].push(callback);
  };

  DB.off = function (evento, callback) {
    if (!listeners[evento]) return;
    listeners[evento] = listeners[evento].filter(fn => fn !== callback);
  };

  DB.emit = function (evento, dados) {
    // Dispara localmente
    if (listeners[evento]) {
      listeners[evento].forEach(fn => fn(dados));
    }
    // Dispara via storage event (outras abas/módulos)
    localStorage.setItem(PREFIXO + 'evento', JSON.stringify({
      tipo: evento, dados: dados, ts: Date.now()
    }));
  };

  // Escuta eventos de OUTRAS abas/módulos
  window.addEventListener('storage', function (e) {
    if (e.key === PREFIXO + 'evento' && e.newValue) {
      try {
        const evt = JSON.parse(e.newValue);
        if (listeners[evt.tipo]) {
          listeners[evt.tipo].forEach(fn => fn(evt.dados));
        }
      } catch (err) { /* ignora */ }
    }
  });

  // ============================================================
  // USUÁRIOS (funcionários do sistema)
  // ============================================================
  DB.getUsuarios = function () {
    return ler('usuarios') || [];
  };

  DB.getUsuarioPorCpf = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    return DB.getUsuarios().find(u => u.cpf === cpfLimpo) || null;
  };

  DB.verificarLogin = function (cpf, senha) {
    const cpfLimpo = limparCpf(cpf);
    return DB.getUsuarios().find(u => u.cpf === cpfLimpo && u.senha === senha && u.ativo) || null;
  };

  DB.cadastrarUsuario = function (dados) {
    const lista = DB.getUsuarios();
    const cpfLimpo = limparCpf(dados.cpf);

    const existente = lista.find(u => u.cpf === cpfLimpo);
    if (existente) {
      Object.assign(existente, dados, { cpf: cpfLimpo });
      gravar('usuarios', lista);
      sbUpdate('usuarios', dados, { cpf: cpfLimpo });
      DB.emit('usuario_atualizado', existente);
      return existente;
    }

    const usuario = {
      id: gerarId(),
      cpf: cpfLimpo,
      nome: dados.nome,
      email: dados.email || null,
      senha: dados.senha || '123456',
      tipo: dados.tipo || dados.perfil || 'recepcionista',
      cargo: dados.cargo || dados.tipo || 'Funcionário',
      crm: dados.crm || null,
      coren: dados.coren || null,
      especialidade: dados.especialidade || null,
      registroProfissional: dados.registroProfissional || dados.registro_profissional || null,
      ativo: dados.ativo !== undefined ? dados.ativo : true,
      criado_em: agora()
    };

    lista.push(usuario);
    gravar('usuarios', lista);
    sbInsert('usuarios', { ...usuario, perfil: usuario.tipo });
    DB.emit('usuario_cadastrado', usuario);
    return usuario;
  };

  DB.atualizarUsuario = function (cpf, dados) {
    const lista = DB.getUsuarios();
    const cpfLimpo = limparCpf(cpf);
    const idx = lista.findIndex(u => u.cpf === cpfLimpo);
    if (idx === -1) return null;
    Object.assign(lista[idx], dados, { cpf: cpfLimpo });
    gravar('usuarios', lista);
    sbUpdate('usuarios', dados, { cpf: cpfLimpo });
    DB.emit('usuario_atualizado', lista[idx]);
    return lista[idx];
  };

  // ============================================================
  // PACIENTES
  // ============================================================
  DB.getPacientes = function () {
    return ler('pacientes') || [];
  };

  DB.getPaciente = function (cpf) {
    if (!cpf) return null;
    const cpfLimpo = limparCpf(cpf);
    return DB.getPacientes().find(p => p.cpf === cpfLimpo) || null;
  };

  DB.getPacientePorId = function (id) {
    return DB.getPacientes().find(p => p.id === id) || null;
  };

  DB.cadastrarPaciente = function (dados) {
    const lista = DB.getPacientes();
    const cpfLimpo = limparCpf(dados.cpf);

    const existente = lista.find(p => p.cpf === cpfLimpo);
    if (existente) {
      Object.assign(existente, dados, { cpf: cpfLimpo, atualizado_em: agora() });
      gravar('pacientes', lista);
      // upsert (e não update): se o INSERT original falhou, o update não
      // encontraria a linha e o cadastro continuaria só no navegador.
      sbUpsert('pacientes', existente);
      DB.emit('paciente_atualizado', existente);
      return existente;
    }

    const paciente = {
      id: gerarId(),
      cpf: cpfLimpo,
      nome: dados.nome,
      nascimento: dados.nascimento || dados.dataNascimento || null,
      sexo: dados.sexo || null,
      telefone: dados.telefone || null,
      email: dados.email || null,
      endereco: dados.endereco || null,
      tipo_sanguineo: dados.tipo_sanguineo || dados.tipoSanguineo || null,
      alergias: dados.alergias || [],
      doencas_cronicas: dados.doencas_cronicas || [],
      medicamentos_uso: dados.medicamentos_uso || dados.medicamentosCont || null,
      deficiencia: dados.deficiencia || null,
      gestante: dados.gestante || false,
      tabagista: dados.tabagista || false,
      responsavel_nome: dados.responsavel_nome || null,
      responsavel_telefone: dados.responsavel_telefone || null,
      cartao_sus: dados.cartao_sus || dados.cartaoSus || null,
      criado_em: agora(),
      atualizado_em: null
    };

    lista.push(paciente);
    gravar('pacientes', lista);

    // Guarda a promessa para que o INSERT da consulta (FK paciente_id)
    // espere este resultado. Antes a promessa era descartada, a consulta
    // podia chegar antes do paciente e falhar com 23503 (foreign key).
    const envioPaciente = sbInsert('pacientes', paciente);
    insercoesPacientesPendentes.set(paciente.id, envioPaciente);
    setTimeout(function () { insercoesPacientesPendentes.delete(paciente.id); }, 120000);

    DB.emit('paciente_cadastrado', paciente);
    return paciente;
  };

  DB.atualizarPaciente = function (cpf, dados) {
    const lista = DB.getPacientes();
    const cpfLimpo = limparCpf(cpf);
    const idx = lista.findIndex(p => p.cpf === cpfLimpo);
    if (idx === -1) return null;
    Object.assign(lista[idx], dados, { cpf: cpfLimpo, atualizado_em: agora() });
    gravar('pacientes', lista);
    sbUpsert('pacientes', lista[idx]);
    DB.emit('paciente_atualizado', lista[idx]);
    return lista[idx];
  };

  // ============================================================
  // CONSULTAS (entidade principal — compartilhada por todos)
  // ============================================================
  DB.getConsultas = function () {
    return ler('consultas') || [];
  };

  DB.getConsultasPorCpf = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    return DB.getConsultas()
      .filter(c => c.cpf === cpfLimpo)
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  };

  DB.getConsultaPorId = function (id) {
    return DB.getConsultas().find(c => c.id === id) || null;
  };

  DB.getFila = function () {
    return DB.getConsultas()
      .filter(c => c.status === 'em_fila' || c.status === 'chamado')
      .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  };

  DB.getMinhaFila = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    const ativas = DB.getConsultas()
      .filter(c => c.cpf === cpfLimpo && ['em_fila', 'chamado', 'em_consulta'].includes(c.status))
      .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));

    const ativa = ativas[0] || null;
    let posicao = 0;
    if (ativa) {
      const fila = DB.getFila().filter(c => c.status === 'em_fila');
      posicao = fila.findIndex(c => c.id === ativa.id) + 1;
    }
    return { ativa, posicao };
  };

  // RECEPÇÃO: Iniciar atendimento (cria na fila)
  DB.iniciarAtendimento = function (pacienteId, cpf, unidade, criadoPor) {
    const lista = DB.getConsultas();
    const senha = gerarSenha();

    const consulta = {
      id: gerarId(),
      paciente_id: pacienteId,
      cpf: limparCpf(cpf),
      unidade: unidade || unidadePadrao(),
      senha: senha,
      recepcao: { criado_por: criadoPor || 'Recepção', observacoes: '' },
      triagem: null,
      diagnostico: null,
      cid10: null,
      conduta: null,
      orientacoes: null,
      receita: [],
      exames: [],
      medico_nome: null,
      medico_crm: null,
      status: 'em_fila',
      guiche: null,
      nome_chamado: null,
      tipo_chamada: null,
      consultorio: null,
      chamado_em: null,
      criado_em: agora(),
      finalizado_em: null,
      cancelado_em: null
    };

    lista.unshift(consulta);
    gravar('consultas', lista);
    sbInsertDependente('consultas', consulta);

    DB.criarNotificacao({
      cpf: consulta.cpf,
      tipo: 'atendimento_iniciado',
      titulo: '🩺 Atendimento iniciado',
      texto: 'Sua senha é ' + senha + ' na ' + unidade + '. Acompanhe sua posição na fila pelo app.',
      link: 'fila.html'
    });

    DB.emit('atendimento_iniciado', consulta);
    return consulta;
  };

  // ENFERMEIRA: Preencher triagem
  DB.realizarTriagem = function (consultaId, dadosTriagem) {
    const lista = DB.getConsultas();
    const c = lista.find(x => x.id === consultaId);
    if (!c) throw new Error('Consulta não encontrada');

    c.triagem = {
      queixa_principal: dadosTriagem.queixa_principal || dadosTriagem.queixa,
      sintomas: dadosTriagem.sintomas || [],
      tempo_sintomas: dadosTriagem.tempo_sintomas || dadosTriagem.tempoSintomas,
      intensidade_dor: dadosTriagem.intensidade_dor || dadosTriagem.dor || 0,
      pressao: dadosTriagem.pressao || dadosTriagem.pressao_arterial,
      temperatura: dadosTriagem.temperatura,
      pulso: dadosTriagem.pulso,
      saturacao: dadosTriagem.saturacao,
      peso: dadosTriagem.peso,
      altura: dadosTriagem.altura,
      glicemia: dadosTriagem.glicemia,
      classificacao_risco: dadosTriagem.classificacao_risco || dadosTriagem.classificacao,
      observacoes: dadosTriagem.observacoes,
      enfermeiro: dadosTriagem.enfermeiro || dadosTriagem.enfermeira
    };

    c.status = 'em_fila';
    c.chamado_em = null;
    c.tipo_chamada = null;
    c.guiche = null;
    c.consultorio = null;
    c.nome_chamado = null;

    gravar('consultas', lista);
    sbUpdate('consultas', {
      triagem: c.triagem, status: c.status, chamado_em: c.chamado_em,
      tipo_chamada: c.tipo_chamada, guiche: c.guiche, consultorio: c.consultorio,
      nome_chamado: c.nome_chamado
    }, { id: consultaId });

    DB.criarNotificacao({
      cpf: c.cpf,
      tipo: 'triagem',
      titulo: '🌡️ Triagem realizada',
      texto: 'A enfermeira registrou seus sinais vitais. Aguarde ser chamado para a consulta.',
      link: 'fila.html'
    });

    DB.emit('triagem_realizada', c);
    return c;
  };

  // CHAMAR PACIENTE (telão + notificação no app)
  DB.chamarPaciente = function (consultaId, opcoes) {
    const lista = DB.getConsultas();
    const c = lista.find(x => x.id === consultaId);
    if (!c) throw new Error('Consulta não encontrada');

    c.status = 'chamado';
    c.chamado_em = agora();
    c.tipo_chamada = (opcoes && opcoes.tipo) || 'triagem';
    c.guiche = (opcoes && opcoes.guiche) || null;
    c.consultorio = (opcoes && opcoes.consultorio) || null;

    const paciente = DB.getPacientePorId(c.paciente_id);
    c.nome_chamado = paciente ? paciente.nome : 'Paciente';

    if (opcoes && opcoes.medico_nome) {
      c.medico_nome = opcoes.medico_nome;
    }

    gravar('consultas', lista);
    sbUpdate('consultas', {
      status: c.status, chamado_em: c.chamado_em, tipo_chamada: c.tipo_chamada,
      guiche: c.guiche, consultorio: c.consultorio, nome_chamado: c.nome_chamado,
      medico_nome: c.medico_nome
    }, { id: consultaId });

    const destino = c.tipo_chamada === 'consulta'
      ? 'Consultório ' + (c.consultorio || '—')
      : 'Triagem' + (c.guiche ? ' — Guichê ' + c.guiche : '');

    DB.criarNotificacao({
      cpf: c.cpf,
      tipo: 'chamada',
      titulo: '🔔 Você foi chamado!',
      texto: 'Dirija-se ao ' + destino + '. Senha: ' + c.senha,
      link: 'fila.html'
    });

    DB.emit('paciente_chamado', c);
    return c;
  };

  // MÉDICO: Iniciar consulta
  DB.iniciarConsulta = function (consultaId) {
    const lista = DB.getConsultas();
    const c = lista.find(x => x.id === consultaId);
    if (!c) throw new Error('Consulta não encontrada');

    c.status = 'em_consulta';
    gravar('consultas', lista);
    sbUpdate('consultas', { status: 'em_consulta' }, { id: consultaId });
    DB.emit('consulta_iniciada', c);
    return c;
  };

  // MÉDICO: Finalizar consulta (relatório + receita + exames)
  DB.finalizarConsulta = function (consultaId, dados) {
    const lista = DB.getConsultas();
    const c = lista.find(x => x.id === consultaId);
    if (!c) throw new Error('Consulta não encontrada');

    c.status = 'finalizado';
    c.finalizado_em = agora();
    c.diagnostico = dados.diagnostico;
    c.cid10 = dados.cid10;
    c.conduta = dados.conduta;
    c.orientacoes = dados.orientacoes;
    c.receita = dados.receita || [];
    c.exames = dados.exames || [];
    c.medico_nome = dados.medico_nome;
    c.medico_crm = dados.medico_crm;

    gravar('consultas', lista);
    sbUpdate('consultas', {
      status: 'finalizado', finalizado_em: c.finalizado_em,
      diagnostico: c.diagnostico, cid10: c.cid10, conduta: c.conduta,
      orientacoes: c.orientacoes, receita: c.receita, exames: c.exames,
      medico_nome: c.medico_nome, medico_crm: c.medico_crm
    }, { id: consultaId });

    DB.criarNotificacao({
      cpf: c.cpf,
      tipo: 'resultado',
      titulo: '📋 Consulta finalizada',
      texto: 'Seu relatório, medicamentos e exames estão disponíveis no app.',
      link: 'consulta.html?id=' + c.id
    });

    DB.emit('consulta_finalizada', c);
    return c;
  };

  // CANCELAR consulta
  DB.cancelarConsulta = function (consultaId) {
    const lista = DB.getConsultas();
    const c = lista.find(x => x.id === consultaId);
    if (!c) return;

    c.status = 'cancelado';
    c.cancelado_em = agora();
    gravar('consultas', lista);
    sbUpdate('consultas', { status: 'cancelado', cancelado_em: c.cancelado_em }, { id: consultaId });
    DB.emit('consulta_cancelada', c);
  };

  // ============================================================
  // AGENDAMENTOS
  // ============================================================
  DB.getAgendamentos = function () {
    return ler('agendamentos') || [];
  };

  DB.getAgendamentosPorCpf = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    return DB.getAgendamentos()
      .filter(a => a.paciente_cpf === cpfLimpo)
      .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
  };

  DB.criarAgendamento = function (dados) {
    const lista = DB.getAgendamentos();
    const agendamento = {
      id: gerarId(),
      paciente_id: dados.paciente_id,
      paciente_cpf: dados.paciente_cpf ? limparCpf(dados.paciente_cpf) : null,
      unidade: dados.unidade || unidadePadrao(),
      especialidade: dados.especialidade,
      medico_nome: dados.medico_nome,
      data_hora: dados.data_hora,
      status: 'agendado',
      criado_em: agora()
    };
    lista.push(agendamento);
    gravar('agendamentos', lista);
    sbInsert('agendamentos', agendamento);

    if (agendamento.paciente_cpf) {
      DB.criarNotificacao({
        cpf: agendamento.paciente_cpf,
        tipo: 'lembrete',
        titulo: '🗓️ Consulta agendada',
        texto: agendamento.especialidade + ' na ' + agendamento.unidade + '.',
        link: 'agendamentos.html'
      });
    }

    DB.emit('agendamento_criado', agendamento);
    return agendamento;
  };

  DB.cancelarAgendamento = function (id) {
    const lista = DB.getAgendamentos();
    const a = lista.find(x => x.id === id);
    if (a) {
      a.status = 'cancelado';
      gravar('agendamentos', lista);
      sbUpdate('agendamentos', { status: 'cancelado' }, { id: id });
      DB.emit('agendamento_cancelado', a);
    }
  };

  // ============================================================
  // NOTIFICAÇÕES
  // ============================================================
  DB.getNotificacoes = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    return (ler('notificacoes') || [])
      .filter(n => n.cpf === cpfLimpo)
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  };

  DB.naoLidas = function (cpf) {
    return DB.getNotificacoes(cpf).filter(n => !n.lida).length;
  };

  DB.criarNotificacao = function (dados) {
    const lista = ler('notificacoes') || [];
    const notif = {
      id: gerarId(),
      cpf: limparCpf(dados.cpf),
      tipo: dados.tipo || 'aviso',
      titulo: dados.titulo,
      texto: dados.texto || '',
      link: dados.link || '',
      lida: false,
      criado_em: agora()
    };
    lista.unshift(notif);
    gravar('notificacoes', lista.slice(0, 100));
    sbInsert('notificacoes', notif);
    DB.emit('notificacao_criada', notif);
  };

  // Alias para compatibilidade com paciente-app
  DB.registrarNotificacao = DB.criarNotificacao;

  DB.marcarLidas = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    const lista = ler('notificacoes') || [];
    lista.forEach(n => { if (n.cpf === cpfLimpo) n.lida = true; });
    gravar('notificacoes', lista);
    sbUpdate('notificacoes', { lida: true }, { cpf: cpfLimpo });
  };

  // ============================================================
  // EXAMES (extraídos das consultas finalizadas)
  // ============================================================
  DB.getExames = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    // Registro formal (public.exames_solicitados): traz o status mais
    // recente quando o resultado é lançado depois da consulta.
    const registros = new Map((ler('exames_solicitados') || [])
      .filter(e => e.cpf === cpfLimpo)
      .map(e => [e.id, e]));
    const consultas = DB.getConsultas()
      .filter(c => c.cpf === cpfLimpo && c.status === 'finalizado');
    const exames = [];
    consultas.forEach(c => {
      (c.exames || []).forEach(e => {
        const atual = e && e.id ? maisRecente(e, registros.get(e.id)) : e;
        exames.push({
          ...atual,
          consulta_id: c.id,
          data: c.finalizado_em || c.criado_em,
          unidade: c.unidade
        });
      });
    });
    return exames;
  };

  // Alias
  DB.getExamesPorCpf = DB.getExames;

  // Junta duas versões do mesmo registro (foto da consulta x tabela)
  // e fica com os campos da que foi atualizada por último.
  function maisRecente(a, b) {
    if (!a) return b ? Object.assign({}, b) : null;
    if (!b) return Object.assign({}, a);
    const ta = new Date(a.atualizado_em || a.solicitado_em || 0).getTime() || 0;
    const tb = new Date(b.atualizado_em || b.solicitado_em || 0).getTime() || 0;
    return tb >= ta ? Object.assign({}, a, b) : Object.assign({}, b, a);
  }

  function dataLocalIso(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // Número legível de documento: RX-20261025-7KQ2M / EX-20261025-AB3CD
  DB.gerarNumeroDocumento = function (prefixo) {
    const d = new Date();
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let sufixo = '';
    for (let i = 0; i < 5; i++) sufixo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    return (prefixo || 'DOC') + '-' + dataLocalIso(d).replace(/-/g, '') + '-' + sufixo;
  };

  // ============================================================
  // RECEITAS — documentos emitidos pelo médico
  // ------------------------------------------------------------
  // tipo: simples (1 via) | antimicrobiano (2 vias, RDC 471/2021)
  //       | controle_especial (2 vias, Portaria 344/98)
  // Receita emitida é documento: o app só INSERE (não altera/apaga).
  // ============================================================
  const TIPOS_RECEITA = ['simples', 'antimicrobiano', 'controle_especial'];

  DB.getReceitas = function () {
    return (ler('receitas') || []).slice()
      .sort((a, b) => new Date(b.emitida_em) - new Date(a.emitida_em));
  };

  DB.getReceitasPorConsulta = function (consultaId) {
    return DB.getTodasReceitas().filter(r => r.consulta_id === consultaId);
  };

  DB.getReceitasPorCpf = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    return DB.getTodasReceitas().filter(r => r.cpf === cpfLimpo);
  };

  // MÉDICO: registra as receitas geradas no atendimento.
  // Cada item de "receitas" = { tipo, itens[], validade_dias, valida_ate,
  //   orientacoes, alertas[], medico_nome, medico_crm, id?, numero? }
  DB.registrarReceitas = function (consultaId, receitas) {
    const c = DB.getConsultaPorId(consultaId);
    if (!c) throw new Error('Consulta não encontrada');

    const lista = ler('receitas') || [];
    const momento = agora();
    const novas = (receitas || [])
      .filter(r => r && Array.isArray(r.itens) && r.itens.length)
      .map(r => {
        const tipo = TIPOS_RECEITA.indexOf(r.tipo) !== -1 ? r.tipo : 'simples';
        const validade = parseInt(r.validade_dias, 10) || null;
        let validaAte = r.valida_ate || null;
        if (!validaAte && validade) {
          const d = new Date(r.emitida_em || momento);
          d.setDate(d.getDate() + validade);
          validaAte = dataLocalIso(d);
        }
        return {
          id: r.id || gerarId(),
          consulta_id: c.id,
          paciente_id: c.paciente_id,
          cpf: c.cpf,
          numero: r.numero || DB.gerarNumeroDocumento('RX'),
          tipo: tipo,
          vias: tipo === 'simples' ? 1 : 2,
          itens: r.itens,
          orientacoes: r.orientacoes || null,
          validade_dias: validade,
          valida_ate: validaAte,
          alertas: Array.isArray(r.alertas) ? r.alertas : [],
          medico_nome: r.medico_nome || c.medico_nome || null,
          medico_crm: r.medico_crm || c.medico_crm || null,
          unidade: r.unidade || c.unidade || unidadePadrao(),
          emitida_em: r.emitida_em || momento,
          criado_em: momento
        };
      })
      .filter(n => !lista.some(x => x.id === n.id));

    if (!novas.length) return [];
    lista.unshift.apply(lista, novas);   // mantém a ordem em que foram emitidas
    gravar('receitas', lista);
    sbInsert('receitas', novas);
    DB.emit('receitas_emitidas', novas);
    return novas;
  };

  // Receitas = registro formal + receitas reconstruídas da foto das
  // consultas (consultas antigas ou banco ainda sem a tabela).
  DB.getTodasReceitas = function () {
    const registros = ler('receitas') || [];
    const ids = new Set(registros.map(r => r.id));
    const saida = registros.map(r => Object.assign({ legado: false }, r));

    DB.getConsultas()
      .filter(c => c.status === 'finalizado' && Array.isArray(c.receita) && c.receita.length)
      .forEach(c => {
        const grupos = new Map();
        c.receita.forEach(item => {
          if (!item || !item.nome) return;
          const chave = item.receita_id || ('consulta-' + c.id);
          if (!grupos.has(chave)) grupos.set(chave, []);
          grupos.get(chave).push(item);
        });
        grupos.forEach((itens, chave) => {
          if (ids.has(chave)) return;
          const ref = itens[0];
          const tipo = TIPOS_RECEITA.indexOf(ref.receita_tipo) !== -1 ? ref.receita_tipo : 'simples';
          saida.push({
            id: chave,
            consulta_id: c.id,
            paciente_id: c.paciente_id,
            cpf: c.cpf,
            numero: ref.receita_numero || null,
            tipo: tipo,
            vias: tipo === 'simples' ? 1 : 2,
            itens: itens,
            orientacoes: c.orientacoes || null,
            validade_dias: null,
            valida_ate: ref.valida_ate || null,
            alertas: [],
            medico_nome: c.medico_nome || null,
            medico_crm: c.medico_crm || null,
            unidade: c.unidade,
            emitida_em: c.finalizado_em || c.criado_em,
            legado: !ref.receita_id
          });
        });
      });

    return saida.sort((a, b) => new Date(b.emitida_em) - new Date(a.emitida_em));
  };

  // ============================================================
  // EXAMES SOLICITADOS — pedidos com ciclo de status
  // ------------------------------------------------------------
  // solicitado → realizado → resultado_disponivel   (ou cancelado)
  // Exame não é apagado: erro de pedido vira "cancelado" com motivo.
  // ============================================================
  const STATUS_EXAME = ['solicitado', 'realizado', 'resultado_disponivel', 'cancelado'];
  const CATEGORIAS_EXAME = ['laboratorial', 'imagem', 'cardiologico', 'teste_rapido', 'outros'];
  const TRANSICOES_EXAME = {
    solicitado: ['realizado', 'resultado_disponivel', 'cancelado'],
    realizado: ['resultado_disponivel', 'cancelado'],
    resultado_disponivel: ['resultado_disponivel'],   // só correção do resultado
    cancelado: []
  };
  DB.STATUS_EXAME = STATUS_EXAME;
  DB.TRANSICOES_EXAME = TRANSICOES_EXAME;

  DB.getExamesSolicitados = function () {
    return (ler('exames_solicitados') || []).slice()
      .sort((a, b) => new Date(b.solicitado_em) - new Date(a.solicitado_em));
  };

  // MÉDICO: registra os exames pedidos no atendimento (mesmo nº de pedido)
  DB.registrarExames = function (consultaId, exames) {
    const c = DB.getConsultaPorId(consultaId);
    if (!c) throw new Error('Consulta não encontrada');

    const lista = ler('exames_solicitados') || [];
    const momento = agora();
    const pedidoPadrao = DB.gerarNumeroDocumento('EX');
    const novos = (exames || [])
      .filter(e => e && String(e.nome || '').trim())
      .map(e => ({
        id: e.id || gerarId(),
        consulta_id: c.id,
        paciente_id: c.paciente_id,
        cpf: c.cpf,
        pedido: e.pedido || pedidoPadrao,
        nome: String(e.nome).trim(),
        categoria: CATEGORIAS_EXAME.indexOf(e.categoria) !== -1 ? e.categoria : 'outros',
        prioridade: e.prioridade === 'urgente' ? 'urgente' : 'rotina',
        indicacao: e.indicacao || null,
        cid10: e.cid10 || c.cid10 || null,
        orientacao: e.orientacao || null,
        local_realizacao: e.local_realizacao || null,
        status: 'solicitado',
        resultado: null,
        realizado_em: null,
        resultado_em: null,
        cancelado_em: null,
        motivo_cancelamento: null,
        atualizado_por: null,
        medico_nome: e.medico_nome || c.medico_nome || null,
        medico_crm: e.medico_crm || c.medico_crm || null,
        unidade: e.unidade || c.unidade || unidadePadrao(),
        solicitado_em: e.solicitado_em || momento,
        atualizado_em: momento
      }))
      .filter(n => !lista.some(x => x.id === n.id));

    if (!novos.length) return [];
    lista.unshift.apply(lista, novos);   // mantém a ordem do pedido
    gravar('exames_solicitados', lista);
    sbInsert('exames_solicitados', novos);
    DB.emit('exames_registrados', novos);
    return novos;
  };

  // Todos os exames (registro formal + foto das consultas), já com o
  // status mais recente. "indice" identifica exames antigos sem id.
  DB.getTodosExames = function () {
    const registros = ler('exames_solicitados') || [];
    const porId = new Map(registros.map(e => [e.id, e]));
    const vistos = new Set();
    const saida = [];

    DB.getConsultas()
      .filter(c => c.status === 'finalizado' && Array.isArray(c.exames))
      .forEach(c => {
        c.exames.forEach((e, indice) => {
          if (!e || !(e.nome || e.exame)) return;
          const atual = maisRecente(e, e.id ? porId.get(e.id) : null);
          if (e.id) vistos.add(e.id);
          saida.push(Object.assign({}, atual, {
            id: e.id || null,
            indice: indice,
            consulta_id: c.id,
            paciente_id: atual.paciente_id || c.paciente_id,
            cpf: atual.cpf || c.cpf,
            nome: atual.nome || atual.exame,
            status: atual.status || 'solicitado',
            prioridade: atual.prioridade || 'rotina',
            categoria: atual.categoria || 'outros',
            pedido: atual.pedido || null,
            unidade: atual.unidade || c.unidade,
            cid10: atual.cid10 || c.cid10 || null,
            medico_nome: atual.medico_nome || c.medico_nome || null,
            medico_crm: atual.medico_crm || c.medico_crm || null,
            solicitado_em: atual.solicitado_em || c.finalizado_em || c.criado_em,
            legado: !e.id
          }));
        });
      });

    registros.forEach(r => {
      if (!vistos.has(r.id)) saida.push(Object.assign({ indice: null, legado: false }, r));
    });

    return saida.sort((a, b) => new Date(b.solicitado_em) - new Date(a.solicitado_em));
  };

  // Atualiza o status/resultado de um exame.
  // ref: id do exame  —  ou { id, consulta_id, indice } (exames antigos sem id)
  // dados: { status, resultado, motivo_cancelamento, atualizado_por }
  DB.atualizarExame = function (ref, dados) {
    ref = typeof ref === 'string' ? { id: ref } : (ref || {});
    dados = dados || {};

    const listaReg = ler('exames_solicitados') || [];
    const reg = ref.id ? listaReg.find(e => e.id === ref.id) : null;
    const consultas = DB.getConsultas();
    const consultaId = ref.consulta_id || (reg && reg.consulta_id);
    const c = consultaId ? consultas.find(x => x.id === consultaId) : null;

    let indice = -1;
    if (c && Array.isArray(c.exames)) {
      if (ref.id) indice = c.exames.findIndex(e => e && e.id === ref.id);
      if (indice === -1 && !ref.id && Number.isInteger(ref.indice) && c.exames[ref.indice]) indice = ref.indice;
    }
    const foto = indice !== -1 ? c.exames[indice] : null;
    const atual = maisRecente(foto, reg);
    if (!atual) throw new Error('Exame não encontrado');

    const statusAtual = atual.status || 'solicitado';
    const novoStatus = dados.status || statusAtual;
    if (STATUS_EXAME.indexOf(novoStatus) === -1) throw new Error('Status de exame inválido: ' + novoStatus);
    if (novoStatus !== statusAtual && (TRANSICOES_EXAME[statusAtual] || []).indexOf(novoStatus) === -1) {
      throw new Error('Não é possível mudar o exame de "' + statusAtual + '" para "' + novoStatus + '".');
    }
    if (statusAtual === 'cancelado') throw new Error('Exame cancelado não pode ser alterado.');

    const resultado = String((dados.resultado !== undefined ? dados.resultado : atual.resultado) || '').trim();
    const motivo = String((dados.motivo_cancelamento !== undefined ? dados.motivo_cancelamento : atual.motivo_cancelamento) || '').trim();
    if (novoStatus === 'resultado_disponivel' && !resultado) throw new Error('Informe o resultado do exame.');
    if (novoStatus === 'cancelado' && !motivo) throw new Error('Informe o motivo do cancelamento.');

    const momento = agora();
    const campos = {
      status: novoStatus,
      atualizado_em: momento,
      atualizado_por: dados.atualizado_por || atual.atualizado_por || null
    };
    if (novoStatus === 'realizado') {
      campos.realizado_em = dados.realizado_em || atual.realizado_em || momento;
    }
    if (novoStatus === 'resultado_disponivel') {
      campos.resultado = resultado;
      campos.resultado_em = (statusAtual === 'resultado_disponivel' && atual.resultado_em) ? atual.resultado_em : momento;
      campos.realizado_em = atual.realizado_em || dados.realizado_em || momento;
    }
    if (novoStatus === 'cancelado') {
      campos.cancelado_em = momento;
      campos.motivo_cancelamento = motivo;
    }

    // 1) registro formal (public.exames_solicitados)
    if (reg) {
      Object.assign(reg, campos);
      gravar('exames_solicitados', listaReg);
      sbUpdate('exames_solicitados', campos, { id: reg.id });
    }
    // 2) foto na consulta (lida pelo app do paciente)
    if (foto) {
      c.exames[indice] = Object.assign({}, foto, campos);
      gravar('consultas', consultas);
      sbUpdate('consultas', { exames: c.exames }, { id: c.id });
    }

    const final = Object.assign({}, atual, campos, {
      consulta_id: (c && c.id) || atual.consulta_id,
      cpf: atual.cpf || (c && c.cpf) || null
    });

    // 3) avisa o paciente no app
    const nome = final.nome || final.exame || 'Exame';
    if (final.cpf) {
      if (novoStatus === 'resultado_disponivel' && statusAtual !== 'resultado_disponivel') {
        DB.criarNotificacao({
          cpf: final.cpf, tipo: 'resultado',
          titulo: '🧪 Resultado de exame disponível',
          texto: 'O resultado de "' + nome + '" já está disponível no app.',
          link: 'exames.html'
        });
      } else if (novoStatus === 'resultado_disponivel' && resultado !== String(atual.resultado || '').trim()) {
        DB.criarNotificacao({
          cpf: final.cpf, tipo: 'resultado',
          titulo: '🧪 Resultado de exame atualizado',
          texto: 'O resultado de "' + nome + '" foi corrigido pela equipe médica.',
          link: 'exames.html'
        });
      } else if (novoStatus === 'cancelado') {
        DB.criarNotificacao({
          cpf: final.cpf, tipo: 'aviso',
          titulo: '🧪 Exame cancelado',
          texto: '"' + nome + '" foi cancelado. Motivo: ' + motivo,
          link: 'exames.html'
        });
      }
    }

    DB.emit('exame_atualizado', final);
    return final;
  };

  // ============================================================
  // SESSÃO (login do paciente por CPF)
  // ============================================================
  DB.setSessao = function (cpf) {
    sessionStorage.setItem(PREFIXO + 'sessao', limparCpf(cpf));
  };

  DB.getSessao = function () {
    return sessionStorage.getItem(PREFIXO + 'sessao');
  };

  DB.clearSessao = function () {
    sessionStorage.removeItem(PREFIXO + 'sessao');
  };

  // ============================================================
  // FUNÇÕES DEMO — Simulam o fluxo real para demonstração
  // (usadas pelo App do Paciente)
  // ============================================================

  DB.iniciarAtendimentoDemo = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    const paciente = DB.getPaciente(cpfLimpo);
    if (!paciente) throw new Error('Paciente não encontrado');
    return DB.iniciarAtendimento(paciente.id, cpfLimpo, APP_CONFIG.UNIDADES[0], 'Recepcionista — Demo');
  };

  DB.simularTriagem = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    const { ativa } = DB.getMinhaFila(cpfLimpo);
    if (!ativa) throw new Error('Sem atendimento ativo');
    return DB.realizarTriagem(ativa.id, {
      queixa_principal: 'Dor de garganta forte e febre há 2 dias',
      sintomas: ['Dor de garganta', 'Febre', 'Cansaço'],
      tempo_sintomas: '2 dias',
      intensidade_dor: 6,
      pressao: '120/80',
      temperatura: 37.8,
      pulso: 88,
      saturacao: 97,
      peso: 62.5,
      altura: 165,
      glicemia: 95,
      classificacao_risco: 'verde',
      observacoes: 'Paciente relata início do quadro após contato com pessoa gripada.',
      enfermeiro: 'Bruno Enfermeiro — COREN 123456'
    });
  };

  DB.simularChamada = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    const { ativa } = DB.getMinhaFila(cpfLimpo);
    if (!ativa) throw new Error('Sem atendimento ativo');
    return DB.chamarPaciente(ativa.id, { tipo: 'consulta', consultorio: '1', guiche: '3' });
  };

  DB.simularFinalizar = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    const { ativa } = DB.getMinhaFila(cpfLimpo);
    if (!ativa) throw new Error('Sem atendimento ativo');
    return DB.finalizarConsulta(ativa.id, {
      diagnostico: 'Faringite aguda',
      cid10: 'J02.9',
      conduta: 'Medicação sintomática, repouso e hidratação.',
      orientacoes: 'Tomar a medicação conforme a receita. Retornar se não melhorar em 3 dias.',
      receita: [
        { nome: 'Paracetamol 750mg', dosagem: '1 comprimido', frequencia: '6/6h', duracao: '5 dias', obs: 'Após as refeições' },
        { nome: 'Ibuprofeno 400mg', dosagem: '1 comprimido', frequencia: '8/8h', duracao: '3 dias', obs: 'Se dor persistir' }
      ],
      exames: [
        { nome: 'Hemograma completo', status: 'solicitado', orientacao: 'Jejum de 8h' },
        { nome: 'Teste rápido para COVID-19', status: 'resultado_disponivel', resultado: 'Negativo', orientacao: '' }
      ],
      medico_nome: 'Dr. Carlos Pereira',
      medico_crm: 'CRM 12345'
    });
  };

  DB.agendarDemo = function (cpf) {
    const cpfLimpo = limparCpf(cpf);
    const paciente = DB.getPaciente(cpfLimpo);
    const datas = [7, 14].map(dias => {
      const d = new Date();
      d.setDate(d.getDate() + dias);
      d.setHours(9, 30, 0, 0);
      return d.toISOString();
    });
    const a1 = DB.criarAgendamento({
      paciente_id: paciente ? paciente.id : null,
      paciente_cpf: cpfLimpo,
      unidade: APP_CONFIG.UNIDADES[0],
      especialidade: 'Clínico Geral',
      medico_nome: 'Dr. Carlos Pereira',
      data_hora: datas[0]
    });
    const a2 = DB.criarAgendamento({
      paciente_id: paciente ? paciente.id : null,
      paciente_cpf: cpfLimpo,
      unidade: APP_CONFIG.UNIDADES[1] || APP_CONFIG.UNIDADES[0],
      especialidade: 'Dermatologia',
      medico_nome: 'Dra. Carla Dermatologia',
      data_hora: datas[1]
    });
    return [a1, a2];
  };

  // ============================================================
  // CALLBACKS DO TELÃO
  // ============================================================
  DB.registrarCallbackChamada = function (callback) { DB._callbackChamada = callback; };
  DB.notificarChamada = function (chamada) {
    if (DB._callbackChamada) DB._callbackChamada(chamada);
  };

  // ============================================================
  // SEED — Dados de demonstração
  // ============================================================
  DB.seedDemo = function () {
    // Com Supabase configurado os dados reais vêm do banco. Semear demo aqui
    // misturava IDs fake ('u1'/'p1') com UUIDs e mascarava falhas de gravação.
    if (temClienteSupabase()) return;

    // Só cria se não existirem dados
    if (ler('usuarios') && ler('usuarios').length > 0) return;

    // Usuários (funcionários)
    const usuarios = [
      { id: 'u1', cpf: '00000000000', nome: 'Administrador Sistema', email: 'admin@vida.com', senha: 'admin123', tipo: 'admin', cargo: 'Administrador do Sistema', crm: null, coren: null, especialidade: null, ativo: true, criado_em: '2024-01-01T00:00:00.000Z' },
      { id: 'u2', cpf: '12345678901', nome: 'Dr. Alexandre Medicina', email: 'alexandre.medicina@vida.com', senha: 'medico123', tipo: 'medico', cargo: 'Médico', crm: 'CRM/PR 12345', coren: null, especialidade: 'Clínico Geral', ativo: true, criado_em: '2024-02-15T00:00:00.000Z' },
      { id: 'u3', cpf: '23456789012', nome: 'Dra. Carla Dermatologia', email: 'carla.dermato@vida.com', senha: 'medico123', tipo: 'medico', cargo: 'Médica', crm: 'CRM/PR 67890', coren: null, especialidade: 'Dermatologia', ativo: true, criado_em: '2024-03-01T00:00:00.000Z' },
      { id: 'u4', cpf: '34567890123', nome: 'Dr. Roberto Cirurgia', email: 'roberto.cirurgia@vida.com', senha: 'medico123', tipo: 'medico', cargo: 'Médico', crm: 'CRM/PR 11223', coren: null, especialidade: 'Cirurgia Geral', ativo: true, criado_em: '2024-03-10T00:00:00.000Z' },
      { id: 'u5', cpf: '45678901234', nome: 'Paula Santos Silva', email: 'paula.santos@vida.com', senha: 'enfermeiro123', tipo: 'enfermeiro', cargo: 'Enfermeira', crm: null, coren: 'COREN/PR 123456', especialidade: 'Enfermagem Geral', ativo: true, criado_em: '2024-01-20T00:00:00.000Z' },
      { id: 'u6', cpf: '56789012345', nome: 'Roberto Lima Costa', email: 'roberto.lima@vida.com', senha: 'enfermeiro123', tipo: 'enfermeiro', cargo: 'Enfermeiro', crm: null, coren: 'COREN/PR 234567', especialidade: 'Enfermagem', ativo: true, criado_em: '2024-02-01T00:00:00.000Z' },
      { id: 'u7', cpf: '67890123456', nome: 'Fernanda Oliveira', email: 'fernanda.oliveira@vida.com', senha: 'recep123', tipo: 'recepcionista', cargo: 'Recepcionista', crm: null, coren: null, especialidade: null, ativo: true, criado_em: '2024-01-15T00:00:00.000Z' },
      { id: 'u8', cpf: '78901234567', nome: 'Carlos Eduardo Mendes', email: 'carlos.mendes@vida.com', senha: 'recep123', tipo: 'recepcionista', cargo: 'Recepcionista', crm: null, coren: null, especialidade: null, ativo: true, criado_em: '2024-02-10T00:00:00.000Z' }
    ];
    gravar('usuarios', usuarios);

    // Pacientes
    const pacientes = [
      {
        id: 'p1', cpf: '12345678909', nome: 'Maria Oliveira Santos',
        nascimento: '1995-04-12', sexo: 'F', telefone: '(41) 99999-1234',
        email: 'maria.demo@email.com', endereco: 'Rua das Flores, 120 — Araucária/PR',
        tipo_sanguineo: 'O+', alergias: ['Dipirona', 'Poeira'],
        doencas_cronicas: ['Asma leve'], medicamentos_uso: 'Salbutamol (inalador)',
        responsavel_nome: 'João Oliveira', responsavel_telefone: '(41) 98888-1111',
        cartao_sus: '123 4567 8901 2345',
        criado_em: '2024-01-10T00:00:00.000Z'
      },
      {
        id: 'p2', cpf: '98765432100', nome: 'João Pedro da Silva',
        nascimento: '1988-11-03', sexo: 'M', telefone: '(41) 98888-2222',
        email: 'joao.demo@email.com', endereco: 'Av. das Araucárias, 500 — Araucária/PR',
        tipo_sanguineo: 'A+', alergias: [], doencas_cronicas: ['Hipertensão'],
        medicamentos_uso: 'Losartana 50mg',
        responsavel_nome: 'Ana Silva', responsavel_telefone: '(41) 97777-3333',
        cartao_sus: '234 5678 9012 3456',
        criado_em: '2024-01-12T00:00:00.000Z'
      }
    ];
    gravar('pacientes', pacientes);

    // Consulta finalizada de exemplo
    const consultas = [
      {
        id: 'c1', paciente_id: 'p1', cpf: '12345678909',
        unidade: 'UBS Central Araucária', senha: 'B305',
        recepcao: { criado_por: 'Ana Recepção' },
        triagem: {
          queixa_principal: 'Dor de cabeça forte e febre',
          sintomas: ['Febre', 'Dor de cabeça', 'Cansaço'],
          tempo_sintomas: '2 dias', intensidade_dor: 7,
          pressao: '130/85', temperatura: 38.2, pulso: 95,
          saturacao: 96, classificacao_risco: 'amarelo',
          enfermeiro: 'Bruno Enfermeiro'
        },
        diagnostico: 'Gripe', cid10: 'J11.1',
        conduta: 'Repouso, hidratação e medicação sintomática.',
        orientacoes: 'Retornar se febre persistir por mais de 72h.',
        receita: [
          { nome: 'Paracetamol 750mg', dosagem: '1 comprimido', frequencia: '6/6h', duracao: '5 dias', obs: 'Após as refeições' }
        ],
        exames: [
          { nome: 'Hemograma completo', status: 'resultado_disponivel', resultado: 'Leucocitose leve', orientacao: 'Jejum de 8h' }
        ],
        medico_nome: 'Dr. Carlos Pereira', medico_crm: 'CRM 12345',
        status: 'finalizado', guiche: null, nome_chamado: null,
        tipo_chamada: null, consultorio: null, chamado_em: null,
        criado_em: new Date(Date.now() - 2 * 86400000).toISOString(),
        finalizado_em: new Date(Date.now() - 86400000).toISOString(),
        cancelado_em: null
      }
    ];
    gravar('consultas', consultas);

    // Agendamento futuro
    const agendamentos = [
      {
        id: 'a1', paciente_id: 'p1', paciente_cpf: '12345678909',
        unidade: 'UBS Central Araucária', especialidade: 'Clínico Geral',
        medico_nome: 'Dr. Carlos Pereira',
        data_hora: new Date(Date.now() + 5 * 86400000).toISOString(),
        status: 'confirmado', criado_em: agora()
      }
    ];
    gravar('agendamentos', agendamentos);

    // Notificação
    DB.criarNotificacao({
      cpf: '12345678909', tipo: 'lembrete',
      titulo: '🗓️ Lembrete de consulta',
      texto: 'Você tem consulta com Clínico Geral na UBS Central em breve.',
      link: 'agendamentos.html'
    });

    // OBS: quando o Supabase está configurado, quem popula o banco é o
    // próprio supabase/schema.sql (seed idempotente). NÃO enviamos estes
    // registros ao banco porque os ids ('u1', 'p1', 'c1'...) não são UUID
    // válidos e causariam erro de tipo no PostgreSQL.
  };

  DB.limparTudo = function () {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(PREFIXO)) localStorage.removeItem(k);
    });
  };

  // Alias para compatibilidade com paciente-app
  DB.limparDemo = DB.limparTudo;

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================
  if (temClienteSupabase()) {
    // Sincroniza dados do Supabase → localStorage
    sincronizarDoSupabase();
    // Ativa Realtime para atualizações automáticas
    setupRealtime();
  } else if (liberarSincronizacao) {
    // Modo demo: não há o que baixar. Libera na hora quem espera a 1ª
    // carga (DB.aguardarSincronizacao) — antes as telas esperavam o
    // teto de 8 s à toa.
    liberarSincronizacao();
  }

  // ============================================================
  // SINCRONIZAÇÃO — espera da primeira carga
  // Permite que as telas aguardem o banco antes de decidir
  // "paciente não encontrado" (antes o app abria vazio e redirecionava).
  // ============================================================
  // Status do envio de um paciente para o Supabase.
  // Uso: const r = await DB.envioPaciente(p.id); if (r.ok === false) ...
  // Assim a tela só comemora o cadastro depois do banco confirmar.
  DB.envioPaciente = function (id) {
    if (!id) return Promise.resolve({ ok: true, data: null });
    const pendente = insercoesPacientesPendentes.get(id);
    return pendente || Promise.resolve({ ok: true, data: null });
  };

  // Onde os dados estão sendo gravados de verdade.
  DB.modoBanco = function () {
    if (!temClienteSupabase()) {
      return { modo: 'demo', url: null, projeto: null };
    }
    const url = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SUPABASE_URL) || '';
    const projeto = (url.match(/^https:\/\/([^.]+)\.supabase\.co/) || [])[1] || null;
    return { modo: 'supabase', url: url, projeto: projeto };
  };

  DB.aguardarSincronizacao = function () {
    // Corrida com um teto de 8s: se a rede estiver pendurada, a tela
    // continua (mostrando o cache local) em vez de travar no login.
    return Promise.race([
      sincronizacaoInicial,
      new Promise(function (resolve) { setTimeout(resolve, 8000); })
    ]);
  };

  // ============================================================
  // DIAGNÓSTICO — Teste de conexão (usado por status-banco.html)
  // ============================================================
  DB.testarConexao = async function () {
    if (!temClienteSupabase()) {
      return { ok: false, modo: 'demo', mensagem: 'Supabase não configurado — rodando em modo demo (localStorage)' };
    }
    try {
      const { error } = await supabaseClient.from('unidades').select('id', { head: true, count: 'exact' });
      if (error) return { ok: false, modo: 'supabase', mensagem: error.message };
      return { ok: true, modo: 'supabase', mensagem: 'Conectado ao Supabase com sucesso' };
    } catch (e) {
      return { ok: false, modo: 'supabase', mensagem: 'Falha de rede: ' + e.message };
    }
  };

  // ============================================================
  // EXPORTAR
  // ============================================================
  window.DB = DB;

})();
