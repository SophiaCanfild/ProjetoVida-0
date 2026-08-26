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
   ============================================================ */

(function () {
  'use strict';

  const PREFIXO = 'vidamais_';
  const DB = {};

  // ============================================================
  // UTILIDADES
  // ============================================================
  function ler(chave) {
    try { return JSON.parse(localStorage.getItem(PREFIXO + chave)); }
    catch (e) { return null; }
  }

  function gravar(chave, valor) {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
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

  // ============================================================
  // SUPABASE — Detecção e helpers
  // ============================================================
  const temSupabase = typeof supabase !== 'undefined' && supabase !== null;

  // Escrita assíncrona no Supabase (fire-and-forget)
  function sbInsert(tabela, dados) {
    if (!temSupabase) return Promise.resolve();
    return supabase.from(tabela).insert(dados).then(({ error }) => {
      if (error) console.warn('[Supabase insert]', tabela, error.message);
    });
  }

  function sbUpdate(tabela, dados, filtro) {
    if (!temSupabase) return Promise.resolve();
    return supabase.from(tabela).update(dados).match(filtro).then(({ error }) => {
      if (error) console.warn('[Supabase update]', tabela, error.message);
    });
  }

  function sbUpsert(tabela, dados) {
    if (!temSupabase) return Promise.resolve();
    return supabase.from(tabela).upsert(dados, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.warn('[Supabase upsert]', tabela, error.message);
    });
  }

  // ============================================================
  // SINCRONIZAÇÃO INICIAL — Supabase → localStorage
  // ============================================================
  async function sincronizarDoSupabase() {
    if (!temSupabase) return;
    try {
      const tabelas = ['usuarios', 'pacientes', 'consultas', 'agendamentos', 'notificacoes'];
      const resultados = await Promise.all(
        tabelas.map(t => supabase.from(t).select('*'))
      );
      tabelas.forEach((tabela, i) => {
        const { data, error } = resultados[i];
        if (!error && data && data.length > 0) {
          gravar(tabela, data);
        }
      });
      console.log('[Vida+] Dados sincronizados do Supabase');
    } catch (e) {
      console.warn('[Vida+] Sync Supabase falhou, usando localStorage:', e.message);
    }
  }

  // ============================================================
  // REALTIME — Atualização automática entre abas/módulos
  // ============================================================
  function setupRealtime() {
    if (!temSupabase || !supabase.channel) return;

    try {
      const channel = supabase.channel('vida-mais-sync');

      ['consultas', 'pacientes', 'usuarios', 'notificacoes', 'agendamentos'].forEach(tabela => {
        channel.on('postgres_changes',
          { event: '*', schema: 'public', table: tabela },
          function (payload) {
            // Atualiza cache local
            const lista = ler(tabela) || [];
            if (payload.eventType === 'INSERT') {
              if (!lista.find(x => x.id === payload.new.id)) lista.push(payload.new);
            } else if (payload.eventType === 'UPDATE') {
              const idx = lista.findIndex(x => x.id === payload.new.id);
              if (idx !== -1) lista[idx] = payload.new;
              else lista.push(payload.new);
            } else if (payload.eventType === 'DELETE') {
              const idx = lista.findIndex(x => x.id === payload.old.id);
              if (idx !== -1) lista.splice(idx, 1);
            }
            gravar(tabela, lista);

            // Dispara listeners locais
            const mapa = {
              consultas: 'consulta_atualizada',
              pacientes: 'paciente_atualizado',
              usuarios: 'usuario_atualizado',
              notificacoes: 'notificacao_criada',
              agendamentos: 'agendamento_atualizado'
            };
            const evt = mapa[tabela];
            if (evt && listeners[evt]) {
              listeners[evt].forEach(fn => fn(payload.new));
            }
          }
        );
      });

      channel.subscribe();
      console.log('[Vida+] Realtime conectado');
    } catch (e) {
      console.warn('[Vida+] Realtime indisponível:', e.message);
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
      sbUpdate('pacientes', { ...dados, atualizado_em: agora() }, { cpf: cpfLimpo });
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
    sbInsert('pacientes', paciente);
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
    sbUpdate('pacientes', { ...dados, atualizado_em: agora() }, { cpf: cpfLimpo });
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
      unidade: unidade || 'UBS Central',
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
    sbInsert('consultas', consulta);

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

    gravar('consultas', lista);
    sbUpdate('consultas', { triagem: c.triagem }, { id: consultaId });

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
      guiche: c.guiche, consultorio: c.consultorio, nome_chamado: c.nome_chamado
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
      unidade: dados.unidade || 'UBS Central',
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
    const consultas = DB.getConsultas()
      .filter(c => c.cpf === cpfLimpo && c.status === 'finalizado');
    const exames = [];
    consultas.forEach(c => {
      (c.exames || []).forEach(e => {
        exames.push({
          ...e,
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

    // Se Supabase configurado, envia dados demo para o banco
    if (temSupabase) {
      sbInsert('usuarios', usuarios.map(u => ({ ...u, perfil: u.tipo })));
      sbInsert('pacientes', pacientes);
      sbInsert('consultas', consultas);
      sbInsert('agendamentos', agendamentos);
    }
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
  if (temSupabase) {
    // Sincroniza dados do Supabase → localStorage
    sincronizarDoSupabase();
    // Ativa Realtime para atualizações automáticas
    setupRealtime();
  }

  // ============================================================
  // EXPORTAR
  // ============================================================
  window.DB = DB;

})();
