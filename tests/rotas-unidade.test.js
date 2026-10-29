/* Testes sem rede: node --test tests/rotas-unidade.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function localStorage() {
  const dados = new Map();
  return { getItem: k => dados.has(k) ? dados.get(k) : null,
    setItem: (k, v) => dados.set(k, String(v)), removeItem: k => dados.delete(k) };
}
function contexto(extra = {}) {
  const ctx = vm.createContext(Object.assign({ console, window: { localStorage: localStorage() },
    Date, JSON, Object, Array, String, Number, Promise, setTimeout, clearTimeout }, extra));
  for (const arquivo of ['shared/js/rotas-unidade.js', 'telao/js/tv-mapa.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, arquivo), 'utf8'), ctx, { filename: arquivo });
  }
  return ctx;
}
function mapaBasico() {
  return { configurado: true, modo_simplificado: true, usar_mapa_grafico: false,
    ponto_inicial: 'recepcao', areas: [], ligacoes: [],
    nos: [
      { id: 'recepcao', nome: 'Recepção', tipo: 'inicio', sem_bloco: true, sem_andar: true, recebe_pacientes: false },
      { id: 'triagem', nome: 'Triagem', tipo: 'triagem', sem_bloco: true, sem_andar: true, recebe_pacientes: true },
      { id: 'sala', nome: 'Consultório 2', tipo: 'consultorio', bloco: 'Bloco B', andar: '1º andar', numero_sala: '2', recebe_pacientes: true },
      { id: 'elevador', nome: 'Elevador', tipo: 'elevador', recebe_pacientes: false }
    ],
    destinos: { triagem: 'triagem', consultorios: { '2': 'sala' }, guiches: {} },
    orientacoes: {
      triagem: { ponto_inicial_id: 'recepcao', localizacao_tipo: 'sem_divisao', texto_orientacao: 'Siga as placas para a triagem.' },
      sala: { ponto_inicial_id: 'triagem', localizacao_tipo: 'outro_andar', texto_orientacao: 'Utilize o elevador.\nAcesse o 1º andar.', acessibilidade: { elevador_acessivel: 'sim', alternativa_sem_escadas: 'nao_informado' } }
    } };
}

test('modo básico valida destinos utilizados sem exigir coordenadas ou orientação para circulação', () => {
  const { RotasUnidade: r, OrientacaoHospitalTV: tv } = contexto();
  const m = mapaBasico();
  assert.equal(r.validar(m, { vinculos: {} }).length, 0);
  const rota = tv.calcularRota({ tipo_chamada: 'consulta', consultorio: '2' }, m);
  assert.equal(rota.destino.nome, 'Consultório 2');
  assert.equal(rota.local, 'Bloco B — 1º andar');
  assert.equal(rota.usarMapaGrafico, false);
  assert.deepEqual(Array.from(rota.instrucoes), ['Utilize o elevador.', 'Acesse o 1º andar.']);
});

test('sugestões usam apenas locais/instruções confirmadas e solicitam dados ausentes', () => {
  const { RotasUnidade: r } = contexto();
  const m = mapaBasico();
  let sugestao = r.sugestao(m, { destino_id: 'sala', ponto_inicial_id: 'triagem', localizacao_tipo: 'outro_andar', como_chegar: ['utilizar_elevador'] });
  assert.equal(sugestao.erros.length, 0);
  assert.match(sugestao.texto, /elevador/i);
  assert.match(sugestao.texto, /1º andar/);
  assert.doesNotMatch(sugestao.texto, /esquerda|direita|metros|placas/i);
  m.nos[2].andar = '';
  sugestao = r.sugestao(m, { destino_id: 'sala', ponto_inicial_id: 'triagem', localizacao_tipo: 'outro_andar', como_chegar: [] });
  assert.ok(sugestao.erros.some(e => /andar/.test(e)));
  assert.ok(sugestao.erros.some(e => /instrução/.test(e)));
});

test('elevador não comprova acessibilidade; restrições são informadas explicitamente', () => {
  const { OrientacaoHospitalTV: tv } = contexto();
  assert.equal(tv.resumirAcessibilidade({ elevador_acessivel: 'nao_informado' }), null);
  const elevador = tv.resumirAcessibilidade({ elevador_acessivel: 'sim', alternativa_sem_escadas: 'nao_informado' });
  assert.match(elevador.observacao, /Elevador acessível informado/);
  assert.doesNotMatch(elevador.observacao, /rota acessível|percurso acessível/i);
  const restricao = tv.resumirAcessibilidade({ possui_escadas: 'sim', alternativa_sem_escadas: 'nao', restricoes_conhecidas: 'possui', perfis_restritos: ['cadeirante'] });
  assert.equal(restricao.possuiRestricao, true);
  assert.match(restricao.observacao, /cadeira de rodas/);
});

test('modo simplificado não usa ligação antiga como orientação ausente', () => {
  const { OrientacaoHospitalTV: tv } = contexto();
  const m = mapaBasico();
  delete m.orientacoes.sala;
  m.nos[0].x = 70; m.nos[0].y = 100; m.nos[2].x = 300; m.nos[2].y = 100;
  m.ligacoes = [{ de: 'recepcao', para: 'sala', peso: 1, instrucao: 'Texto antigo', acessivel: true }];
  const r = tv.calcularRota({ tipo_chamada: 'consulta', consultorio: '2' }, m);
  assert.equal(r.temOrientacao, false);
  assert.equal(r.instrucoes.length, 0);
});

test('grafo legado publicado permanece calculável; dados insuficientes não desenham rota', () => {
  const { OrientacaoHospitalTV: tv } = contexto();
  const m = mapaBasico();
  delete m.orientacoes; delete m.modo_simplificado; delete m.usar_mapa_grafico;
  m.nos[0].x = 70; m.nos[0].y = 100; m.nos[2].x = 300; m.nos[2].y = 100;
  m.ligacoes = [{ de: 'recepcao', para: 'sala', peso: 1, instrucao: 'Caminho validado.', acessivel: true, tempo: 15 }];
  let rota = tv.calcularRota({ tipo_chamada: 'consulta', consultorio: '2' }, m);
  assert.equal(rota.usarMapaGrafico, true);
  assert.deepEqual(Array.from(rota.instrucoes), ['Caminho validado.']);
  m.nos[2].x = null;
  rota = tv.calcularRota({ tipo_chamada: 'consulta', consultorio: '2' }, m);
  assert.equal(rota.usarMapaGrafico, false);
  assert.equal(rota.temOrientacao, false);
});

function bancoFalso() {
  const rows = new Map();
  const backend = { rows, falhar: false };
  class Query {
    constructor(tabela) { this.tabela = tabela; this.operacao = 'GET'; this.filtros = []; }
    select() { return this; }
    limit() { return this; }
    eq(campo, valor) { this.filtros.push([campo, valor]); return this; }
    insert(body) { this.operacao = 'POST'; this.body = body; return this; }
    update(body) { this.operacao = 'PATCH'; this.body = body; return this; }
    delete() { this.operacao = 'DELETE'; return this; }
    async resultado() {
      if (this.tabela === 'unidades') return { data: [], error: null };
      if (backend.falharLeitura && this.operacao === 'GET') return { data: null, error: { message: 'leitura indisponível' } };
      if (backend.falhar && this.operacao !== 'GET') return { data: null, error: { message: 'falha simulada' } };
      const combina = row => this.filtros.every(([k, v]) => row[k] === v);
      let matches = [...rows.values()].filter(combina);
      if (this.operacao === 'POST') {
        if (rows.has(this.body.chave)) return { data: null, error: { code: '23505', message: 'duplicado' } };
        rows.set(this.body.chave, structuredClone(this.body)); matches = [rows.get(this.body.chave)];
      }
      if (this.operacao === 'PATCH') matches.forEach(row => Object.assign(row, structuredClone(this.body)));
      if (this.operacao === 'DELETE') matches.forEach(row => rows.delete(row.chave));
      return { data: structuredClone(matches), error: null };
    }
    then(resolve, reject) { return this.resultado().then(resolve, reject); }
  }
  backend.from = tabela => new Query(tabela);
  return backend;
}
function contextoStore(backend, usuario = { tipo: 'admin' }) {
  const ctx = contexto({ supabaseClient: backend, getUsuarioLogado: () => usuario });
  vm.runInContext(fs.readFileSync(path.join(root, 'shared/js/mapa-store.js'), 'utf8'), ctx, { filename: 'mapa-store.js' });
  return ctx;
}

test('rascunho remoto é independente da publicação e falha preserva cópia local', async () => {
  const banco = bancoFalso(), ctx = contextoStore(banco), store = ctx.MapaHospitalStore;
  const unidade = 'Unidade A';
  await store.carregarRascunho(unidade);
  const m = mapaBasico();
  await store.salvarRascunho(unidade, m);
  assert.ok(banco.rows.has(store.chaveRascunhoRemota(unidade)));
  assert.equal((await store.carregarPublicado(unidade)).configurado, false);
  const publicado = await store.publicar(unidade, m);
  assert.equal(publicado.configurado, true);
  assert.ok(banco.rows.has(store.chaveRemota(unidade)));
  assert.equal(banco.rows.has(store.chaveRascunhoRemota(unidade)), false);
  const registroAntes = banco.rows.get(store.chaveRemota(unidade)).valor;
  m.nos[2].nome = 'Novo nome';
  banco.falhar = true;
  await assert.rejects(store.salvarRascunho(unidade, m), /não foi confirmada no banco/);
  assert.equal(banco.rows.get(store.chaveRemota(unidade)).valor, registroAntes);
  const backup = JSON.parse(ctx.window.localStorage.getItem(store.chaveRascunho(unidade)));
  assert.equal(backup._pendente, true);
  assert.equal(backup.mapa.nos[2].nome, 'Novo nome');
});

test('escritas concorrentes usam comparação de versão e não sobrescrevem outra sessão', async () => {
  const banco = bancoFalso(), a = contextoStore(banco), b = contextoStore(banco), unidade = 'Unidade A';
  await a.MapaHospitalStore.carregarRascunho(unidade);
  await b.MapaHospitalStore.carregarRascunho(unidade);
  const m = mapaBasico();
  await a.MapaHospitalStore.salvarRascunho(unidade, m);
  const copiaAntiga = mapaBasico(); copiaAntiga.nos[2].nome = 'Sessão antiga';
  await assert.rejects(b.MapaHospitalStore.salvarRascunho(unidade, copiaAntiga), /outra pessoa|outra sessão/i);
  const remoto = JSON.parse(banco.rows.get(a.MapaHospitalStore.chaveRascunhoRemota(unidade)).valor);
  assert.equal(remoto.mapa.nos[2].nome, 'Consultório 2');
});

test('filtro de unidade no cliente é apenas interface: não substitui RLS', async () => {
  const banco = bancoFalso(), ctx = contextoStore(banco, { tipo: 'admin', unidades_autorizadas: ['Unidade A'] });
  assert.equal(ctx.MapaHospitalStore.podeGerenciarUnidade('Unidade A'), true);
  assert.equal(ctx.MapaHospitalStore.podeGerenciarUnidade('Unidade B'), false);
  await assert.rejects(ctx.MapaHospitalStore.carregarRascunho('Unidade B'), /não está autorizado/);
  // O servidor real ainda precisa implementar políticas; este teste não prova segurança no Supabase.
});

test('rascunho local antigo sem base conhecida não pode sobrescrever uma publicação existente', async () => {
  const banco = bancoFalso(), a = contextoStore(banco), unidade = 'Unidade A';
  await a.MapaHospitalStore.carregarRascunho(unidade);
  await a.MapaHospitalStore.salvarRascunho(unidade, mapaBasico());
  await a.MapaHospitalStore.publicar(unidade, mapaBasico());
  const b = contextoStore(banco), antigo = mapaBasico();
  antigo.nos[2].nome = 'Nome de rascunho antigo';
  b.window.localStorage.setItem(b.MapaHospitalStore.chaveRascunho(unidade), JSON.stringify(antigo));
  const carregado = await b.MapaHospitalStore.carregarRascunho(unidade);
  assert.equal(carregado._nao_sincronizado, true);
  assert.equal(carregado._publicacao_desatualizada, true);
  const salvo = await b.MapaHospitalStore.salvarRascunho(unidade, carregado);
  assert.equal(salvo._publicacao_desatualizada, true);
  await assert.rejects(b.MapaHospitalStore.publicar(unidade, salvo), /base do rascunho/i);
  assert.equal(JSON.parse(banco.rows.get(b.MapaHospitalStore.chaveRemota(unidade)).valor).mapa.nos[2].nome, 'Consultório 2');
});

test('publicação rejeita rascunho sem orientação obrigatória', async () => {
  const banco = bancoFalso(), ctx = contextoStore(banco), store = ctx.MapaHospitalStore;
  const unidade = 'Unidade A', m = mapaBasico();
  delete m.orientacoes.sala;
  await store.carregarRascunho(unidade);
  await store.salvarRascunho(unidade, m);
  await assert.rejects(store.publicar(unidade, m), /pendências obrigatórias/);
  assert.equal(banco.rows.has(store.chaveRemota(unidade)), false);
  assert.equal(banco.rows.has(store.chaveRascunhoRemota(unidade)), true);
});

test('telão usa apenas chamadas remotas confirmadas ao perder conexão', async () => {
  const armazenamento = localStorage();
  const falsa = { id: 'falsa', senha: 'FALSA', status: 'chamado', chamado_em: new Date().toISOString(), unidade: 'Unidade A' };
  armazenamento.setItem('vidamais_consultas', JSON.stringify([falsa]));
  let erro = true, resultados = [];
  const cliente = { from() {
    const q = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
      then(resolve, reject) { return Promise.resolve(erro ? { error: { message: 'rede' } } : { data: resultados, error: null }).then(resolve, reject); } };
    return q;
  } };
  const ctx = contexto({ localStorage: armazenamento, supabaseClient: cliente, TV_CONFIG: { UNIDADE: 'Unidade A' } });
  vm.runInContext(fs.readFileSync(path.join(root, 'telao/js/tv-dados.js'), 'utf8'), ctx, { filename: 'tv-dados.js' });
  assert.equal((await ctx.TV.getChamadasRecentes()).length, 0);
  resultados = [{ id: 'real', senha: 'A123', status: 'chamado', chamado_em: new Date().toISOString(), unidade: 'Unidade A' }];
  erro = false;
  assert.equal((await ctx.TV.getChamadasRecentes())[0].senha, 'A123');
  erro = true;
  assert.equal((await ctx.TV.getChamadasRecentes())[0].senha, 'A123');
  erro = false; resultados = [];
  assert.equal((await ctx.TV.getChamadasRecentes()).length, 0);
});

test('publicação removida no banco não é ressuscitada pelo cache após falha', async () => {
  const banco = bancoFalso(), ctx = contextoStore(banco), store = ctx.MapaHospitalStore;
  const unidade = 'Unidade A', mapa = mapaBasico();
  await store.carregarRascunho(unidade);
  await store.salvarRascunho(unidade, mapa);
  await store.publicar(unidade, mapa);
  assert.equal((await store.carregarPublicado(unidade))._origem, 'supabase');
  assert.ok(ctx.window.localStorage.getItem(store.chavePublicado(unidade)));
  banco.rows.delete(store.chaveRemota(unidade));
  assert.equal((await store.carregarPublicado(unidade))._origem, 'nao_publicado');
  assert.equal(ctx.window.localStorage.getItem(store.chavePublicado(unidade)), null);
  banco.falharLeitura = true;
  const offline = await store.carregarPublicado(unidade);
  assert.equal(offline._origem, 'indisponivel');
  assert.equal(offline.configurado, false);
});

test('cliente Supabase ausente não promove chamada local não confirmada', async () => {
  const armazenamento = localStorage();
  const chamada = senha => ({ id: senha, senha, status: 'chamado', chamado_em: new Date().toISOString(), unidade: 'Unidade A' });
  armazenamento.setItem('vidamais_consultas', JSON.stringify([chamada('FALSA')]));
  const ctx = contexto({ localStorage: armazenamento, supabaseClient: null, SUPABASE_CONFIGURADO: true, TV_CONFIG: { UNIDADE: 'Unidade A' } });
  vm.runInContext(fs.readFileSync(path.join(root, 'telao/js/tv-dados.js'), 'utf8'), ctx, { filename: 'tv-dados.js' });
  assert.equal((await ctx.TV.getChamadasRecentes()).length, 0);
  armazenamento.setItem('vidamais_tv_chamadas', JSON.stringify({ origem: 'supabase', chamadas: [chamada('A123')] }));
  assert.equal((await ctx.TV.getChamadasRecentes())[0].senha, 'A123');
  ctx.SUPABASE_CONFIGURADO = false;
  assert.equal((await ctx.TV.getChamadasRecentes())[0].senha, 'FALSA'); // demonstração sem banco
});
