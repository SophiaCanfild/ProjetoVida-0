/* ============================================================
   VIDA+ — ÁREA DO MÉDICO: RECEITA MÉDICA E SOLICITAR EXAME
   ------------------------------------------------------------
   Tela do atendimento (seção "Receita Médica", seção "Exames
   Solicitados", modal "Solicitar Exame"), documentos para
   impressão e as páginas "Receitas" e "Solicitar Exames".

   • Regras (classificação, alergia, separação das receitas,
     documento impresso) → sistema-medico/js/prescricoes.js
   • Gravação → shared/js/db.js
       DB.registrarReceitas / DB.registrarExames / DB.atualizarExame
   • Usa as variáveis da página consultaSelecionada e
     pacienteSelecionado (medico/index.html).
   ============================================================ */

const Rx = window.Prescricoes;
const escHtml = Rx.esc;

let examesAtendimento = [];     // exames adicionados no atendimento atual
let documentosGerados = null;   // { paciente, receitas[], exames[] } após finalizar
let previaHtmlAtual = '';
let exameEmEdicao = null;       // chave do exame aberto no modal de status

// ============================================================
// INICIALIZAÇÃO
// ============================================================
function iniciarPrescricoes() {
  preencherDatalists();
  preencherCategoriasExame();
  limparPrescricao();
  Rx.carregarUnidades();
  carregarMedicamentosEstoque();

  const lista = document.getElementById('listaReceita');
  lista.addEventListener('input', aoEditarMedicamento);
  lista.addEventListener('change', aoEditarMedicamento);

  document.getElementById('exameNome').addEventListener('input', aoEscolherExame);
  document.getElementById('formExame').addEventListener('submit', adicionarExameDoFormulario);
  document.getElementById('formStatusExame').addEventListener('submit', salvarStatusExame);
  document.getElementById('statusExameSelect').addEventListener('change', ajustarCamposStatus);

  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModalAberto(); });
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('mousedown', e => { if (e.target === m) fecharModal(m.id); });
  });

  // Atualiza as páginas quando algo muda nesta aba, em outra aba ou no Supabase
  ['receitas_emitidas', 'receita_atualizada', 'exames_registrados', 'exame_atualizado',
    'exame_solicitado_atualizado', 'consulta_atualizada', 'consulta_finalizada']
    .forEach(evt => DB.on(evt, atualizarPaginasPrescricao));
}

function preencherDatalists() {
  criarDatalist('dlMedicamentos', Rx.MEDICAMENTOS.map(m => m.nome));
  criarDatalist('dlFrequencias', Rx.FREQUENCIAS);
  criarDatalist('dlDuracoes', Rx.DURACOES);
  criarDatalist('dlExames', Rx.EXAMES.map(e => e.nome));
  criarDatalist('dlLocaisExame', Rx.LOCAIS_EXAME);
}

function criarDatalist(id, valores) {
  let dl = document.getElementById(id);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = id;
    document.body.appendChild(dl);
  }
  dl.innerHTML = valores.map(v => '<option value="' + escHtml(v) + '"></option>').join('');
}

// Inclui no autocompletar os medicamentos do estoque (tabela public.medicamentos)
async function carregarMedicamentosEstoque() {
  try {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    const { data, error } = await supabaseClient.from('medicamentos').select('nome, dosagem').limit(500);
    if (error || !Array.isArray(data) || !data.length) return;
    const nomes = Rx.MEDICAMENTOS.map(m => m.nome);
    data.forEach(m => {
      const nome = [m.nome, m.dosagem].filter(Boolean).join(' ').trim();
      if (nome && !nomes.some(n => Rx.normalizar(n) === Rx.normalizar(nome))) nomes.push(nome);
    });
    criarDatalist('dlMedicamentos', nomes);
  } catch (e) { /* segue com o catálogo padrão */ }
}

function preencherCategoriasExame() {
  document.getElementById('exameCategoria').innerHTML = Object.keys(Rx.CATEGORIAS_EXAME)
    .map(k => '<option value="' + k + '">' + Rx.CATEGORIAS_EXAME[k].rotulo + '</option>').join('');
}

// ============================================================
// MODAIS
// ============================================================
function abrirModal(id) {
  document.getElementById(id).classList.add('aberto');
  document.body.classList.add('modal-aberto');
}

function fecharModal(id) {
  document.getElementById(id).classList.remove('aberto');
  if (!document.querySelector('.modal-overlay.aberto')) document.body.classList.remove('modal-aberto');
}

function fecharModalAberto() {
  const abertos = Array.from(document.querySelectorAll('.modal-overlay.aberto'));
  if (abertos.length) fecharModal(abertos[abertos.length - 1].id);
}

// ============================================================
// ATENDIMENTO — estado
// ============================================================
function limparPrescricao() {
  document.getElementById('listaReceita').innerHTML = '';
  adicionarReceita({ semFoco: true });
  document.getElementById('receitaValidade').value = Rx.TIPOS_RECEITA.simples.validadePadrao;
  document.getElementById('receitaOrientacoes').value = '';
  examesAtendimento = [];
  renderizarExamesAtendimento();
}

function temPrescricaoPendente() {
  return coletarItensReceita().some(i => i.nome) || examesAtendimento.length > 0;
}

// Chamado antes de trocar de paciente: evita levar receita/exames para outra pessoa
function podeTrocarPaciente(novaConsultaId) {
  if (!consultaSelecionada || consultaSelecionada.id === novaConsultaId || !temPrescricaoPendente()) return true;
  const nome = pacienteSelecionado ? pacienteSelecionado.nome : 'o paciente atual';
  return confirm('Há medicamentos ou exames ainda não finalizados para ' + nome +
    '.\n\nTrocar de paciente e descartar esses itens?');
}

function revalidarAlertasReceita() {
  document.querySelectorAll('#listaReceita .receita-item').forEach(atualizarAlertasItem);
  atualizarResumoReceita();
}

// Botões "Nova receita" / "Solicitar exame" das páginas laterais
function irParaAtendimento(tipo) {
  mostrarPagina('consultas');
  if (!consultaSelecionada || !pacienteSelecionado) {
    mostrarToast('Selecione um paciente na Fila de Espera para iniciar o atendimento.', 'warning');
    return;
  }
  if (tipo === 'exame') { abrirModalExame(); return; }
  const secao = document.getElementById('secaoReceita');
  secao.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const vazio = Array.from(document.querySelectorAll('#listaReceita [name="med_nome[]"]')).find(i => !i.value.trim());
  (vazio || adicionarReceita().querySelector('[name="med_nome[]"]')).focus();
}

// ============================================================
// RECEITA — linhas dinâmicas
// ============================================================
function linhaMedicamentoHtml() {
  const vias = Rx.VIAS_ADMINISTRACAO.map(v => '<option>' + v + '</option>').join('');
  return '' +
    '<div class="receita-topo">' +
    '  <span class="receita-num">1</span>' +
    '  <div class="form-group campo-med">' +
    '    <label class="mini-label">Medicamento — nome, concentração e forma <span class="required">*</span></label>' +
    '    <input type="text" class="form-input" name="med_nome[]" list="dlMedicamentos" placeholder="Ex.: Amoxicilina 500 mg cápsula" autocomplete="off">' +
    '  </div>' +
    '  <div class="form-group campo-classe">' +
    '    <label class="mini-label">Classificação</label>' +
    '    <select class="form-input" name="med_classe[]" title="Definida automaticamente pelo nome; pode ser ajustada">' +
    '      <option value="comum">Comum</option>' +
    '      <option value="antimicrobiano">Antimicrobiano</option>' +
    '      <option value="c1">Controle especial (C1)</option>' +
    '    </select>' +
    '  </div>' +
    '  <button type="button" class="btn btn-ghost btn-sm btn-remover" title="Remover medicamento" onclick="removerMedicamento(this)"><i class="fas fa-trash-alt"></i></button>' +
    '</div>' +
    '<div class="receita-campos">' +
    '  <div class="form-group"><label class="mini-label">Dose <span class="required">*</span></label><input type="text" class="form-input" name="med_dosagem[]" placeholder="Ex.: 1 cápsula"></div>' +
    '  <div class="form-group"><label class="mini-label">Via</label><select class="form-input" name="med_via[]">' + vias + '</select></div>' +
    '  <div class="form-group"><label class="mini-label">Frequência <span class="required">*</span></label><input type="text" class="form-input" name="med_freq[]" list="dlFrequencias" placeholder="Ex.: 3x ao dia (8/8h)"></div>' +
    '  <div class="form-group"><label class="mini-label">Duração</label><input type="text" class="form-input" name="med_duracao[]" list="dlDuracoes" placeholder="Ex.: 7 dias"></div>' +
    '  <div class="form-group"><label class="mini-label">Quantidade</label><input type="text" class="form-input" name="med_qtd[]" placeholder="Ex.: 21 cápsulas"></div>' +
    '</div>' +
    '<div class="form-group sem-margem"><input type="text" class="form-input" name="med_obs[]" placeholder="Observações ao paciente (ex.: tomar após as refeições)"></div>' +
    '<div class="item-alertas"></div>';
}

// onclick="adicionarReceita()" do botão "Adicionar medicamento"
function adicionarReceita(opcoes) {
  opcoes = opcoes || {};
  const lista = document.getElementById('listaReceita');
  const item = document.createElement('div');
  item.className = 'receita-item';
  item.innerHTML = linhaMedicamentoHtml();
  lista.appendChild(item);
  renumerarMedicamentos();
  atualizarResumoReceita();
  if (!opcoes.semFoco) item.querySelector('[name="med_nome[]"]').focus();
  return item;
}

function removerMedicamento(botao) {
  const item = botao.closest('.receita-item');
  if (item) item.remove();
  if (!document.querySelector('#listaReceita .receita-item')) adicionarReceita({ semFoco: true });
  renumerarMedicamentos();
  atualizarResumoReceita();
}

function renumerarMedicamentos() {
  document.querySelectorAll('#listaReceita .receita-num').forEach((el, i) => { el.textContent = i + 1; });
}

function aoEditarMedicamento(e) {
  const item = e.target.closest('.receita-item');
  if (!item) return;
  item.classList.remove('com-erro');

  if (e.target.name === 'med_classe[]') item.dataset.classeManual = '1';
  if (e.target.name === 'med_nome[]') {
    const nome = e.target.value;
    if (item.dataset.classeManual !== '1') {
      item.querySelector('[name="med_classe[]"]').value = Rx.classificarMedicamento(nome).classe;
    }
    const doCatalogo = Rx.buscarMedicamentoCatalogo(nome);
    if (doCatalogo) item.querySelector('[name="med_via[]"]').value = doCatalogo.via;
  }
  atualizarAlertasItem(item);
  atualizarResumoReceita();
}

function alergiasPaciente() {
  return (pacienteSelecionado && pacienteSelecionado.alergias) || [];
}

function atualizarAlertasItem(item) {
  const nome = item.querySelector('[name="med_nome[]"]').value.trim();
  const classe = item.querySelector('[name="med_classe[]"]').value;
  const alertas = [];
  item.classList.remove('tem-alergia');

  if (nome) {
    const conflitos = Rx.verificarAlergias(nome, alergiasPaciente());
    if (conflitos.length) {
      item.classList.add('tem-alergia');
      alertas.push('<div class="item-alerta perigo"><i class="fas fa-triangle-exclamation"></i><span><b>ALERGIA:</b> paciente com alergia registrada a ' +
        conflitos.map(c => '<b>' + escHtml(c.alergia) + '</b> (' + escHtml(c.motivo) + ')').join(', ') +
        '. Revise a prescrição.</span></div>');
    }
    const cls = Rx.classificarMedicamento(nome);
    if (cls.notificacao) {
      alertas.push('<div class="item-alerta aviso"><i class="fas fa-ban"></i><span>Substância da lista <b>' + cls.notificacao +
        '</b>: exige <b>Notificação de Receita</b> (talonário oficial da Vigilância Sanitária). O sistema não emite esse documento — remova o item e registre na conduta.</span></div>');
    } else if (classe === 'antimicrobiano') {
      alertas.push('<div class="item-alerta info"><i class="fas fa-circle-info"></i><span>Antimicrobiano: sai em receita própria, <b>2 vias</b>, válida por <b>10 dias</b> (RDC 471/2021). Quantidade obrigatória.</span></div>');
    } else if (classe === 'c1') {
      alertas.push('<div class="item-alerta info"><i class="fas fa-circle-info"></i><span>Controle especial (lista C1): receita própria, <b>2 vias</b>, válida por <b>30 dias</b>, quantidade também por extenso (Portaria 344/98).</span></div>');
    }
  }
  item.querySelector('.item-alertas').innerHTML = alertas.join('');
}

function coletarItensReceita() {
  return Array.from(document.querySelectorAll('#listaReceita .receita-item')).map(item => {
    const v = n => ((item.querySelector('[name="' + n + '"]') || {}).value || '').trim();
    return {
      el: item,
      nome: v('med_nome[]'),
      classe: v('med_classe[]') || 'comum',
      dosagem: v('med_dosagem[]'),
      via: v('med_via[]') || 'Oral',
      frequencia: v('med_freq[]'),
      duracao: v('med_duracao[]'),
      quantidade: v('med_qtd[]'),
      obs: v('med_obs[]')
    };
  }).filter(i => i.nome || i.dosagem || i.frequencia || i.duracao || i.quantidade || i.obs);
}

function plural(n, singular, pluralTxt) {
  return n + ' ' + (n === 1 ? singular : pluralTxt);
}

function itemParaGravar(i) {
  return {
    nome: i.nome, classe: i.classe, dosagem: i.dosagem, via: i.via, frequencia: i.frequencia,
    duracao: i.duracao, quantidade: i.quantidade, obs: i.obs
  };
}

function atualizarResumoReceita() {
  const itens = coletarItensReceita().filter(i => i.nome);
  const chip = document.getElementById('receitaResumo');
  if (!chip) return;
  if (!itens.length) {
    chip.textContent = 'Nenhum medicamento';
    chip.className = 'resumo-chip';
    return;
  }
  const grupos = Rx.agruparReceitas(itens);
  const alergia = itens.some(i => Rx.verificarAlergias(i.nome, alergiasPaciente()).length);
  chip.textContent = plural(itens.length, 'medicamento', 'medicamentos') + ' em ' +
    plural(grupos.length, 'receita', 'receitas') + ': ' +
    grupos.map(g => Rx.TIPOS_RECEITA[g.tipo].curto).join(', ') + (alergia ? ' • alerta de alergia' : '');
  chip.className = 'resumo-chip ' + (alergia ? 'perigo' : 'ativo');
}

// Validação completa (finalizar consulta)
function validarReceita() {
  const itens = coletarItensReceita();
  const erros = [];
  const vistos = {};
  itens.forEach((i, idx) => {
    i.el.classList.remove('com-erro');
    const rotulo = i.nome || ('Medicamento ' + (idx + 1));
    if (!i.nome) { erros.push({ el: i.el, msg: rotulo + ': informe o nome do medicamento.' }); return; }
    if (Rx.classificarMedicamento(i.nome).notificacao) {
      erros.push({ el: i.el, msg: rotulo + ': exige Notificação de Receita (talonário oficial). Remova o item.' });
    }
    if (!i.dosagem) erros.push({ el: i.el, msg: rotulo + ': informe a dose.' });
    if (!i.frequencia) erros.push({ el: i.el, msg: rotulo + ': informe a frequência.' });
    if ((i.classe === 'antimicrobiano' || i.classe === 'c1') && !i.quantidade) {
      erros.push({ el: i.el, msg: rotulo + ': informe a quantidade (obrigatória neste tipo de receita).' });
    }
    const chave = Rx.normalizar(i.nome);
    if (vistos[chave]) erros.push({ el: i.el, msg: rotulo + ': medicamento repetido na receita.' });
    vistos[chave] = true;
  });
  return { itens, erros };
}

// ============================================================
// FINALIZAR CONSULTA — usado pelo submit do prontuário
// ============================================================
// Valida e monta receitas/exames. Retorna null se a finalização deve parar.
function prepararPrescricaoParaFinalizar() {
  const { itens, erros } = validarReceita();
  if (erros.length) {
    erros.forEach(e => e.el.classList.add('com-erro'));
    erros[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mostrarToast(escHtml(erros[0].msg) + (erros.length > 1 ? ' (+' + (erros.length - 1) + ' pendência(s))' : ''), 'error');
    return null;
  }

  // Alerta de alergia: exige confirmação explícita, que fica registrada
  const alertas = [];
  itens.forEach(i => Rx.verificarAlergias(i.nome, alergiasPaciente())
    .forEach(c => alertas.push({ medicamento: i.nome, alergia: c.alergia, motivo: c.motivo })));
  if (alertas.length) {
    const msg = '⚠ ALERTA DE ALERGIA\n\n' +
      alertas.map(a => '• ' + a.medicamento + '  ×  alergia a ' + a.alergia + ' (' + a.motivo + ')').join('\n') +
      '\n\nDeseja manter a prescrição mesmo assim?\nA decisão ficará registrada na receita.';
    if (!confirm(msg)) return null;
  }

  const u = getUsuarioLogado();
  const agora = new Date().toISOString();
  const orientacoes = document.getElementById('receitaOrientacoes').value.trim();
  const grupos = Rx.agruparReceitas(itens, { validadeSimples: document.getElementById('receitaValidade').value });
  const receitas = grupos.map(g => ({
    tipo: g.tipo,
    validade_dias: g.validade_dias,
    valida_ate: Rx.somarDias(agora, g.validade_dias),
    itens: g.itens.map(itemParaGravar),
    orientacoes: orientacoes || null,
    alertas: alertas.filter(a => g.itens.some(i => i.nome === a.medicamento))
      .map(a => Object.assign({ tipo: 'alergia', confirmado_por: u ? u.nome : null, confirmado_em: agora }, a)),
    medico_nome: u ? u.nome : null,
    medico_crm: u ? (u.crm || null) : null,
    emitida_em: agora
  }));

  // CID/indicação podem ter sido preenchidos depois de adicionar os exames
  const cid = document.getElementById('cid10').value.trim();
  const exames = examesAtendimento.map(e => {
    const copia = Object.assign({}, e);
    delete copia.uid;
    if (!copia.cid10 && cid) copia.cid10 = cid;
    if (!copia.indicacao) copia.indicacao = sugestaoIndicacao() || null;
    copia.solicitado_em = agora;
    return copia;
  });

  return { receitas, exames, orientacoes };
}

// Grava receitas e exames e devolve a "foto" que vai para a consulta
function registrarPrescricao(consulta, prescricao) {
  const receitas = DB.registrarReceitas(consulta.id, prescricao.receitas);
  const exames = DB.registrarExames(consulta.id, prescricao.exames);
  const itensFoto = [];
  receitas.forEach(r => r.itens.forEach(item => itensFoto.push(Object.assign({}, item, {
    receita_id: r.id, receita_numero: r.numero, receita_tipo: r.tipo, valida_ate: r.valida_ate
  }))));
  return { receitas, exames, itensFoto, examesFoto: exames.map(e => Object.assign({}, e)) };
}

// ============================================================
// SOLICITAR EXAME — modal
// ============================================================
function abrirModalExame() {
  if (!consultaSelecionada || !pacienteSelecionado) {
    mostrarToast('Selecione um paciente na Fila de Espera para solicitar exames.', 'warning');
    return;
  }
  document.getElementById('modalExamePaciente').textContent =
    pacienteSelecionado.nome + ' • CPF ' + Rx.formatarCpf(pacienteSelecionado.cpf);
  limparFormExame();
  renderizarExamesAtendimento();
  abrirModal('modalExame');
  setTimeout(() => document.getElementById('exameNome').focus(), 60);
}

function sugestaoIndicacao() {
  const diag = (document.getElementById('diagnostico').value || '').trim();
  const queixa = consultaSelecionada && consultaSelecionada.triagem ? (consultaSelecionada.triagem.queixa_principal || '') : '';
  return diag || queixa;
}

function limparFormExame() {
  document.getElementById('exameNome').value = '';
  document.getElementById('exameCategoria').value = 'laboratorial';
  document.getElementById('examePrioridade').value = 'rotina';
  document.getElementById('exameLocal').value = '';
  document.getElementById('exameOrientacao').value = '';
  document.getElementById('exameIndicacao').value = sugestaoIndicacao();
}

// Escolheu um exame do catálogo → preenche categoria, preparo e local
function aoEscolherExame() {
  const cat = Rx.buscarExameCatalogo(this.value);
  if (!cat) return;
  document.getElementById('exameCategoria').value = cat.categoria;
  document.getElementById('exameOrientacao').value = cat.preparo || '';
  document.getElementById('exameLocal').value = cat.local || Rx.LOCAL_PADRAO[cat.categoria] || '';
}

function adicionarExameDoFormulario(e) {
  e.preventDefault();
  const nome = document.getElementById('exameNome').value.trim();
  if (!nome) {
    mostrarToast('Informe o nome do exame.', 'warning');
    document.getElementById('exameNome').focus();
    return;
  }
  const ok = adicionarExame({
    nome: nome,
    categoria: document.getElementById('exameCategoria').value,
    prioridade: document.getElementById('examePrioridade').value,
    local_realizacao: document.getElementById('exameLocal').value.trim(),
    orientacao: document.getElementById('exameOrientacao').value.trim(),
    indicacao: document.getElementById('exameIndicacao').value.trim()
  });
  if (ok) {
    const prioridade = document.getElementById('examePrioridade').value;
    const indicacao = document.getElementById('exameIndicacao').value;
    limparFormExame();
    document.getElementById('examePrioridade').value = prioridade;   // mantém para o próximo
    document.getElementById('exameIndicacao').value = indicacao;
    document.getElementById('exameNome').focus();
  }
}

function adicionarExameRapido(nome) {
  const cat = Rx.buscarExameCatalogo(nome);
  if (!cat) return;
  const existente = examesAtendimento.find(x => Rx.normalizar(x.nome) === Rx.normalizar(cat.nome));
  if (existente) { removerExame(existente.uid); return; }
  adicionarExame({
    nome: cat.nome,
    categoria: cat.categoria,
    orientacao: cat.preparo,
    local_realizacao: cat.local || Rx.LOCAL_PADRAO[cat.categoria] || '',
    prioridade: document.getElementById('examePrioridade').value,
    indicacao: document.getElementById('exameIndicacao').value.trim() || sugestaoIndicacao()
  });
}

function adicionarExame(dados) {
  if (examesAtendimento.some(x => Rx.normalizar(x.nome) === Rx.normalizar(dados.nome))) {
    mostrarToast('"' + escHtml(dados.nome) + '" já está nesta solicitação.', 'warning');
    return false;
  }
  const u = getUsuarioLogado();
  examesAtendimento.push({
    uid: 'ex-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    nome: dados.nome,
    categoria: Rx.CATEGORIAS_EXAME[dados.categoria] ? dados.categoria : 'outros',
    prioridade: dados.prioridade === 'urgente' ? 'urgente' : 'rotina',
    local_realizacao: dados.local_realizacao || '',
    orientacao: dados.orientacao || '',
    indicacao: dados.indicacao || '',
    cid10: (document.getElementById('cid10').value || '').trim() || null,
    medico_nome: u ? u.nome : null,
    medico_crm: u ? (u.crm || null) : null
  });
  renderizarExamesAtendimento();
  mostrarToast('🧪 ' + escHtml(dados.nome) + ' adicionado à solicitação', 'success');
  return true;
}

function removerExame(uid) {
  examesAtendimento = examesAtendimento.filter(e => e.uid !== uid);
  renderizarExamesAtendimento();
}

function htmlExameLinha(e, removivel) {
  const cat = Rx.CATEGORIAS_EXAME[e.categoria] || Rx.CATEGORIAS_EXAME.outros;
  return '<div class="exame-linha' + (e.prioridade === 'urgente' ? ' urgente' : '') + '">' +
    '<div class="exame-icone"><i class="fas ' + cat.icone + '"></i></div>' +
    '<div class="exame-info">' +
    '<div class="exame-nome">' + escHtml(e.nome) +
    (e.prioridade === 'urgente' ? ' <span class="badge badge-danger">URGENTE</span>' : '') + '</div>' +
    '<div class="exame-det">' + cat.rotulo + (e.local_realizacao ? ' • ' + escHtml(e.local_realizacao) : '') + '</div>' +
    (e.orientacao ? '<div class="exame-det"><i class="fas fa-circle-info"></i> Preparo: ' + escHtml(e.orientacao) + '</div>' : '') +
    '</div>' +
    (removivel ? '<button type="button" class="btn btn-ghost btn-sm btn-remover" title="Remover exame" onclick="removerExame(\'' + e.uid + '\')"><i class="fas fa-trash-alt"></i></button>' : '') +
    '</div>';
}

function renderizarExamesAtendimento() {
  const vazio = '<div class="lista-vazia"><i class="fas fa-vial"></i> Nenhum exame solicitado. Use <b>Solicitar exame</b> para adicionar.</div>';
  const html = examesAtendimento.length ? examesAtendimento.map(e => htmlExameLinha(e, true)).join('') : vazio;
  const principal = document.getElementById('listaExamesAtendimento');
  const modal = document.getElementById('listaExamesModal');
  if (principal) principal.innerHTML = html;
  if (modal) modal.innerHTML = examesAtendimento.length ? html : '<div class="lista-vazia">Nenhum exame adicionado ainda.</div>';

  const chip = document.getElementById('examesResumo');
  if (chip) {
    const urgentes = examesAtendimento.filter(e => e.prioridade === 'urgente').length;
    chip.textContent = examesAtendimento.length
      ? plural(examesAtendimento.length, 'exame', 'exames') + (urgentes ? ' • ' + plural(urgentes, 'urgente', 'urgentes') : '')
      : 'Nenhum exame';
    chip.className = 'resumo-chip' + (examesAtendimento.length ? ' ativo' : '');
  }

  const chips = document.getElementById('chipsExames');
  if (chips) {
    chips.innerHTML = Rx.EXAMES.filter(e => e.frequente).map(e => {
      const ja = examesAtendimento.some(x => Rx.normalizar(x.nome) === Rx.normalizar(e.nome));
      return '<button type="button" class="chip' + (ja ? ' adicionado' : '') + '" onclick="adicionarExameRapido(\'' +
        escHtml(e.nome).replace(/'/g, '&#39;') + '\')"><i class="fas ' + (ja ? 'fa-check' : 'fa-plus') + '"></i> ' + escHtml(e.nome) + '</button>';
    }).join('');
  }
}

// ============================================================
// PRÉ-VISUALIZAÇÃO E IMPRESSÃO
// ============================================================
function contextoDocumento(paciente, previa) {
  return {
    paciente: paciente || {},
    previa: !!previa,
    logoUrl: new URL('../img/logo.png', location.href).href
  };
}

function abrirPrevia(html, titulo, aviso) {
  previaHtmlAtual = html;
  document.getElementById('previaTitulo').innerHTML = '<i class="fas fa-file-lines"></i> ' + escHtml(titulo);
  document.getElementById('previaAviso').textContent = aviso || '';
  document.getElementById('previaFrame').srcdoc = html;
  abrirModal('modalPrevia');
}

function imprimirPrevia() {
  const frame = document.getElementById('previaFrame');
  try {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch (e) {
    Rx.imprimirHtml(previaHtmlAtual);
  }
}

function previsualizarReceita() {
  if (!consultaSelecionada || !pacienteSelecionado) {
    mostrarToast('Selecione um paciente para pré-visualizar a receita.', 'warning');
    return;
  }
  const itens = coletarItensReceita().filter(i => i.nome).map(itemParaGravar);
  if (!itens.length) {
    mostrarToast('Adicione ao menos um medicamento para pré-visualizar.', 'warning');
    return;
  }
  const u = getUsuarioLogado();
  const agora = new Date().toISOString();
  const orientacoes = document.getElementById('receitaOrientacoes').value.trim();
  const receitas = Rx.agruparReceitas(itens, { validadeSimples: document.getElementById('receitaValidade').value })
    .map(g => ({
      tipo: g.tipo, itens: g.itens, validade_dias: g.validade_dias,
      valida_ate: Rx.somarDias(agora, g.validade_dias), orientacoes: orientacoes, emitida_em: agora,
      medico_nome: u ? u.nome : '', medico_crm: u ? u.crm : '', unidade: consultaSelecionada.unidade
    }));
  abrirPrevia(Rx.gerarDocumentoReceitas(receitas, contextoDocumento(pacienteSelecionado, true)),
    'Pré-visualização da receita',
    receitas.length + ' receita(s). O número oficial é gerado ao finalizar a consulta.');
}

function previsualizarPedidoExames() {
  if (!consultaSelecionada || !pacienteSelecionado) {
    mostrarToast('Selecione um paciente para pré-visualizar a solicitação.', 'warning');
    return;
  }
  if (!examesAtendimento.length) {
    mostrarToast('Adicione ao menos um exame para pré-visualizar.', 'warning');
    return;
  }
  const u = getUsuarioLogado();
  const cid = document.getElementById('cid10').value.trim();
  const pedido = {
    exames: examesAtendimento.map(e => Object.assign({}, e, { cid10: e.cid10 || cid, indicacao: e.indicacao || sugestaoIndicacao() })),
    solicitado_em: new Date().toISOString(),
    medico_nome: u ? u.nome : '', medico_crm: u ? u.crm : '', unidade: consultaSelecionada.unidade
  };
  abrirPrevia(Rx.gerarDocumentoExames(pedido, contextoDocumento(pacienteSelecionado, true)),
    'Pré-visualização da solicitação de exames',
    'O número do pedido é gerado ao finalizar a consulta.');
}

// ============================================================
// DOCUMENTOS DA CONSULTA (após finalizar)
// ============================================================
function abrirModalDocumentos(docs) {
  documentosGerados = docs;
  if (!docs || (!docs.receitas.length && !docs.exames.length)) return;
  document.getElementById('documentosPaciente').textContent = docs.paciente ? docs.paciente.nome : '';
  const linhas = docs.receitas.map((r, i) => {
    const cfg = Rx.TIPOS_RECEITA[r.tipo] || Rx.TIPOS_RECEITA.simples;
    return '<div class="doc-linha"><div class="doc-icone"><i class="fas fa-prescription"></i></div>' +
      '<div class="flex-1"><div class="doc-titulo">' + cfg.rotulo + ' • Nº ' + escHtml(r.numero) + '</div>' +
      '<div class="doc-det">' + r.itens.length + ' medicamento(s) • ' + r.vias + ' via(s) • válida até ' + Rx.fmtData(r.valida_ate) + '</div></div>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="imprimirReceitaGerada(' + i + ')"><i class="fas fa-print"></i> Imprimir</button></div>';
  });
  if (docs.exames.length) {
    const urgentes = docs.exames.filter(e => e.prioridade === 'urgente').length;
    linhas.push('<div class="doc-linha"><div class="doc-icone exame"><i class="fas fa-vial"></i></div>' +
      '<div class="flex-1"><div class="doc-titulo">Solicitação de exames • Pedido ' + escHtml(docs.exames[0].pedido) + '</div>' +
      '<div class="doc-det">' + docs.exames.length + ' exame(s)' + (urgentes ? ' • ' + urgentes + ' urgente(s)' : '') + '</div></div>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="imprimirPedidoGerado()"><i class="fas fa-print"></i> Imprimir</button></div>');
  }
  document.getElementById('listaDocumentos').innerHTML = linhas.join('');
  abrirModal('modalDocumentos');
}

function imprimirReceitaGerada(indice) {
  const r = documentosGerados && documentosGerados.receitas[indice];
  if (!r) return;
  abrirPrevia(Rx.gerarDocumentoReceitas([r], contextoDocumento(documentosGerados.paciente)),
    (Rx.TIPOS_RECEITA[r.tipo] || Rx.TIPOS_RECEITA.simples).rotulo + ' Nº ' + r.numero,
    r.vias > 1 ? 'Imprime as 2 vias (uma por página).' : '');
}

function imprimirPedidoGerado() {
  if (!documentosGerados || !documentosGerados.exames.length) return;
  const exames = documentosGerados.exames;
  abrirPrevia(Rx.gerarDocumentoExames(pedidoDosExames(exames), contextoDocumento(documentosGerados.paciente)),
    'Solicitação de exames • Pedido ' + exames[0].pedido, '');
}

function imprimirTodosDocumentos() {
  if (!documentosGerados) return;
  const ctx = contextoDocumento(documentosGerados.paciente);
  const partes = [];
  if (documentosGerados.receitas.length) partes.push(Rx.gerarDocumentoReceitas(documentosGerados.receitas, ctx));
  if (documentosGerados.exames.length) partes.push(Rx.gerarDocumentoExames(pedidoDosExames(documentosGerados.exames), ctx));
  if (!partes.length) return;
  // junta as folhas dos documentos num único arquivo de impressão
  const corpo = partes.map(h => h.slice(h.indexOf('<body>') + 6, h.lastIndexOf('</body>'))).join('');
  const html = partes[0].slice(0, partes[0].indexOf('<body>') + 6) + corpo + '</body></html>';
  abrirPrevia(html, 'Documentos da consulta', 'Receitas e solicitação de exames em sequência.');
}

function pedidoDosExames(exames) {
  const ref = exames[0] || {};
  return {
    pedido: ref.pedido, solicitado_em: ref.solicitado_em, exames: exames,
    medico_nome: ref.medico_nome, medico_crm: ref.medico_crm, unidade: ref.unidade
  };
}

// ============================================================
// PÁGINAS "RECEITAS" E "SOLICITAR EXAMES"
// ============================================================
function atualizarPaginasPrescricao() {
  if (document.getElementById('pageReceitas').classList.contains('active')) carregarReceitas();
  if (document.getElementById('pageExames').classList.contains('active')) carregarExamesPagina();
}

function pacienteDoRegistro(reg) {
  return (reg.paciente_id && DB.getPacientePorId(reg.paciente_id)) || DB.getPaciente(reg.cpf) || { nome: 'Paciente', cpf: reg.cpf };
}

function cardResumo(icone, cor, valor, rotulo) {
  return '<div class="resumo-card"><div class="resumo-icone" style="background:' + cor + '1A;color:' + cor + '"><i class="fas ' + icone + '"></i></div>' +
    '<div><div class="valor">' + valor + '</div><div class="rotulo">' + rotulo + '</div></div></div>';
}

function inicioDoDia() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function carregarReceitas() {
  const tbody = document.getElementById('tabelaReceitas');
  if (!tbody) return;
  const termo = Rx.normalizar(document.getElementById('filtroReceitas').value);
  const tipo = document.getElementById('filtroTipoReceita').value;
  const todas = DB.getTodasReceitas();
  const hoje = inicioDoDia();

  document.getElementById('resumoReceitas').innerHTML =
    cardResumo('fa-calendar-day', '#0284C7', todas.filter(r => new Date(r.emitida_em) >= hoje).length, 'Emitidas hoje') +
    cardResumo('fa-prescription', '#16A34A', todas.length, 'Total de receitas') +
    cardResumo('fa-capsules', '#B45309', todas.filter(r => r.tipo === 'antimicrobiano').length, 'Antimicrobianos') +
    cardResumo('fa-lock', '#D64545', todas.filter(r => r.tipo === 'controle_especial').length, 'Controle especial');

  const lista = todas.filter(r => {
    if (tipo && r.tipo !== tipo) return false;
    if (!termo) return true;
    const p = pacienteDoRegistro(r);
    const texto = Rx.normalizar([p.nome, r.cpf, r.numero, r.medico_nome, (r.itens || []).map(i => i.nome).join(' ')].join(' '));
    return texto.includes(termo) || String(r.cpf || '').includes(termo.replace(/\D/g, '') || '§');
  });

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">' +
      (todas.length ? 'Nenhuma receita encontrada com esses filtros.' : 'Nenhuma receita emitida ainda. As receitas aparecem aqui quando a consulta é finalizada.') +
      '</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(r => {
    const p = pacienteDoRegistro(r);
    const cfg = Rx.TIPOS_RECEITA[r.tipo] || Rx.TIPOS_RECEITA.simples;
    const itens = r.itens || [];
    const vencida = r.valida_ate && Rx.dataIso(new Date()) > r.valida_ate;
    const alerta = (r.alertas || []).length
      ? ' <i class="fas fa-triangle-exclamation" style="color:var(--erro)" title="Prescrita após alerta de alergia confirmado pelo médico"></i>' : '';
    return '<tr>' +
      '<td><div class="fw-bold nowrap">' + (r.numero ? escHtml(r.numero) : '<span class="text-muted">sem número</span>') + alerta + '</div>' +
      '<div class="sub nowrap">' + Rx.fmtDataHora(r.emitida_em) + '</div></td>' +
      '<td><strong>' + escHtml(p.nome) + '</strong><div class="sub nowrap">' + Rx.formatarCpf(r.cpf) + '</div></td>' +
      '<td>' + itens.slice(0, 2).map(i => escHtml(i.nome)).join('<br>') +
      (itens.length > 2 ? '<div class="sub">+ ' + (itens.length - 2) + ' item(ns)</div>' : '') + '</td>' +
      '<td><span class="tipo-receita tr-' + r.tipo + '">' + cfg.curto + '</span><div class="sub">' + r.vias + ' via(s)</div></td>' +
      '<td>' + (r.valida_ate ? Rx.fmtData(r.valida_ate) + '<div class="sub">' +
        (vencida ? '<span class="badge badge-secondary">vencida</span>' : '<span class="badge badge-success">válida</span>') + '</div>' : '—') + '</td>' +
      '<td>' + escHtml(r.medico_nome || '—') + '<div class="sub">' + escHtml(Rx.textoCrm(r.medico_crm)) + '</div></td>' +
      '<td class="text-right"><button type="button" class="btn btn-outline btn-sm" onclick="verReceita(\'' + escHtml(r.id) + '\')">' +
      '<i class="fas fa-print"></i> Reimprimir</button></td>' +
      '</tr>';
  }).join('');
}

function verReceita(id) {
  const r = DB.getTodasReceitas().find(x => x.id === id);
  if (!r) { mostrarToast('Receita não encontrada.', 'error'); return; }
  const cfg = Rx.TIPOS_RECEITA[r.tipo] || Rx.TIPOS_RECEITA.simples;
  abrirPrevia(Rx.gerarDocumentoReceitas([r], contextoDocumento(pacienteDoRegistro(r))),
    cfg.rotulo + (r.numero ? ' Nº ' + r.numero : ''),
    'Reimpressão da receita emitida em ' + Rx.fmtDataHora(r.emitida_em) + '.');
}

function chaveExame(e) {
  return e.id || (e.consulta_id + '#' + e.indice);
}

function encontrarExame(chave) {
  return DB.getTodosExames().find(e => chaveExame(e) === chave) || null;
}

function carregarExamesPagina() {
  const tbody = document.getElementById('tabelaExames');
  if (!tbody) return;
  const termo = Rx.normalizar(document.getElementById('filtroExames').value);
  const status = document.getElementById('filtroStatusExame').value;
  const prioridade = document.getElementById('filtroPrioridadeExame').value;
  const todos = DB.getTodosExames();
  const pendente = e => e.status === 'solicitado' || e.status === 'realizado';

  document.getElementById('resumoExames').innerHTML =
    cardResumo('fa-clock', '#B45309', todos.filter(e => e.status === 'solicitado').length, 'Aguardando realização') +
    cardResumo('fa-flask-vial', '#0284C7', todos.filter(e => e.status === 'realizado').length, 'Aguardando resultado') +
    cardResumo('fa-file-circle-check', '#16A34A', todos.filter(e => e.status === 'resultado_disponivel').length, 'Resultados disponíveis') +
    cardResumo('fa-bolt', '#D64545', todos.filter(e => pendente(e) && e.prioridade === 'urgente').length, 'Urgentes pendentes');

  const lista = todos.filter(e => {
    if (status === 'pendentes' && !pendente(e)) return false;
    if (status && status !== 'pendentes' && e.status !== status) return false;
    if (prioridade && e.prioridade !== prioridade) return false;
    if (!termo) return true;
    const p = pacienteDoRegistro(e);
    const texto = Rx.normalizar([p.nome, e.cpf, e.nome, e.pedido, e.local_realizacao].join(' '));
    return texto.includes(termo) || String(e.cpf || '').includes(termo.replace(/\D/g, '') || '§');
  }).sort((a, b) => {
    // urgentes pendentes primeiro, depois os mais recentes
    const ua = pendente(a) && a.prioridade === 'urgente' ? 1 : 0;
    const ub = pendente(b) && b.prioridade === 'urgente' ? 1 : 0;
    return ub - ua || new Date(b.solicitado_em) - new Date(a.solicitado_em);
  });

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">' +
      (todos.length ? 'Nenhum exame encontrado com esses filtros.' : 'Nenhum exame solicitado ainda. Os pedidos aparecem aqui quando a consulta é finalizada.') +
      '</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(e => {
    const p = pacienteDoRegistro(e);
    const cat = Rx.CATEGORIAS_EXAME[e.categoria] || Rx.CATEGORIAS_EXAME.outros;
    const st = Rx.STATUS_EXAME[e.status] || Rx.STATUS_EXAME.solicitado;
    const chave = escHtml(chaveExame(e));
    const podeAtualizar = (DB.TRANSICOES_EXAME[e.status] || []).length > 0;
    const quando = e.status === 'resultado_disponivel' ? e.resultado_em
      : e.status === 'realizado' ? e.realizado_em
        : e.status === 'cancelado' ? e.cancelado_em : null;
    return '<tr' + (pendente(e) && e.prioridade === 'urgente' ? ' class="linha-urgente"' : '') + '>' +
      '<td><div class="fw-bold nowrap">' + escHtml(e.pedido || '—') + '</div><div class="sub nowrap">' + Rx.fmtDataHora(e.solicitado_em) + '</div></td>' +
      '<td><strong>' + escHtml(p.nome) + '</strong><div class="sub nowrap">' + Rx.formatarCpf(e.cpf) + '</div></td>' +
      '<td><div class="fw-bold">' + escHtml(e.nome) + '</div><div class="sub"><i class="fas ' + cat.icone + '"></i> ' + cat.rotulo + '</div>' +
      (e.status === 'resultado_disponivel' && e.resultado ? '<div class="resultado-previa" title="' + escHtml(e.resultado) + '">' + escHtml(e.resultado) + '</div>' : '') +
      (e.status === 'cancelado' && e.motivo_cancelamento ? '<div class="sub">Motivo: ' + escHtml(e.motivo_cancelamento) + '</div>' : '') +
      '</td>' +
      '<td>' + (e.prioridade === 'urgente' ? '<span class="badge badge-danger">Urgente</span>' : '<span class="badge badge-secondary">Rotina</span>') + '</td>' +
      '<td>' + escHtml(e.local_realizacao || '—') + '</td>' +
      '<td><span class="status-exame ' + st.classe + '"><i class="fas ' + st.icone + '"></i> ' + st.rotulo + '</span>' +
      (quando ? '<div class="sub nowrap">' + Rx.fmtDataHora(quando) + '</div>' : '') + '</td>' +
      '<td class="text-right"><div class="acoes">' +
      (podeAtualizar ? '<button type="button" class="btn btn-outline btn-sm" onclick="abrirStatusExame(\'' + chave + '\')"><i class="fas fa-pen-to-square"></i> ' +
        (e.status === 'resultado_disponivel' ? 'Corrigir' : 'Atualizar') + '</button>' : '') +
      '<button type="button" class="btn btn-ghost btn-sm" title="Imprimir pedido" onclick="imprimirPedidoDoExame(\'' + chave + '\')"><i class="fas fa-print"></i></button>' +
      '</div></td></tr>';
  }).join('');
}

function imprimirPedidoDoExame(chave) {
  const e = encontrarExame(chave);
  if (!e) { mostrarToast('Exame não encontrado.', 'error'); return; }
  const doPedido = DB.getTodosExames()
    .filter(x => x.consulta_id === e.consulta_id && (x.pedido || null) === (e.pedido || null) && x.status !== 'cancelado')
    .sort((a, b) => (a.indice || 0) - (b.indice || 0));
  const exames = doPedido.length ? doPedido : [e];
  abrirPrevia(Rx.gerarDocumentoExames(pedidoDosExames(exames), contextoDocumento(pacienteDoRegistro(e))),
    'Solicitação de exames' + (e.pedido ? ' • Pedido ' + e.pedido : ''),
    'Reimpressão — exames cancelados não são impressos.');
}

// ---------- Atualizar status / resultado ----------
const ROTULO_TRANSICAO = {
  realizado: 'Realizado / coletado (aguardando resultado)',
  resultado_disponivel: 'Resultado disponível',
  cancelado: 'Cancelado'
};

function abrirStatusExame(chave) {
  const e = encontrarExame(chave);
  if (!e) { mostrarToast('Exame não encontrado.', 'error'); return; }
  exameEmEdicao = chave;
  const p = pacienteDoRegistro(e);
  const st = Rx.STATUS_EXAME[e.status] || Rx.STATUS_EXAME.solicitado;
  document.getElementById('statusExameResumo').innerHTML =
    '<div class="exame-nome">' + escHtml(e.nome) + '</div>' +
    '<div class="exame-det">' + escHtml(p.nome) + ' • ' + Rx.formatarCpf(e.cpf) + (e.pedido ? ' • Pedido ' + escHtml(e.pedido) : '') + '</div>' +
    '<div class="exame-det">Status atual: <span class="status-exame ' + st.classe + '"><i class="fas ' + st.icone + '"></i> ' + st.rotulo + '</span></div>';

  const opcoes = DB.TRANSICOES_EXAME[e.status] || [];
  document.getElementById('statusExameSelect').innerHTML = opcoes.map(s =>
    '<option value="' + s + '">' + (s === e.status ? 'Corrigir resultado' : ROTULO_TRANSICAO[s]) + '</option>').join('');
  document.getElementById('statusExameResultado').value = e.resultado || '';
  document.getElementById('statusExameMotivo').value = '';
  ajustarCamposStatus();
  abrirModal('modalStatusExame');
}

function ajustarCamposStatus() {
  const s = document.getElementById('statusExameSelect').value;
  document.getElementById('grupoResultado').classList.toggle('hidden', s !== 'resultado_disponivel');
  document.getElementById('grupoMotivo').classList.toggle('hidden', s !== 'cancelado');
}

function salvarStatusExame(ev) {
  ev.preventDefault();
  const e = encontrarExame(exameEmEdicao);
  if (!e) { mostrarToast('Exame não encontrado.', 'error'); return; }
  const status = document.getElementById('statusExameSelect').value;
  const u = getUsuarioLogado();
  try {
    DB.atualizarExame(
      e.id ? { id: e.id, consulta_id: e.consulta_id } : { consulta_id: e.consulta_id, indice: e.indice },
      {
        status: status,
        resultado: document.getElementById('statusExameResultado').value,
        motivo_cancelamento: document.getElementById('statusExameMotivo').value,
        atualizado_por: u ? (u.nome + (u.crm ? ' — ' + Rx.textoCrm(u.crm) : '')) : null
      }
    );
    const msgs = {
      realizado: 'Exame marcado como realizado.',
      resultado_disponivel: e.status === 'resultado_disponivel'
        ? 'Resultado corrigido. O paciente foi avisado no app.'
        : '✅ Resultado registrado. O paciente foi notificado no app.',
      cancelado: 'Exame cancelado. O paciente foi avisado no app.'
    };
    mostrarToast(msgs[status] || 'Exame atualizado.', 'success');
    fecharModal('modalStatusExame');
    carregarExamesPagina();
  } catch (err) {
    mostrarToast(escHtml(err.message), 'error');
  }
}
