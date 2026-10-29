const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulos = path.resolve(__dirname, '../.audit-tools/node_modules');
const puppeteer = require(path.join(modulos, 'puppeteer-core'));
const chromium = require(path.join(modulos, '@sparticuz/chromium'));
const BASE = process.env.VIDA_TEST_URL || 'http://127.0.0.1:8123';
const delay = ms => new Promise(r=>setTimeout(r,ms));
(async () => {
  const browser = await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH || await chromium.executablePath(),args:[...chromium.args.filter(x => x !== '--single-process'),'--no-sandbox','--disable-web-security']});
  const umd=fs.readFileSync(path.join(modulos,'@supabase/supabase-js/dist/umd/supabase.js'));
  const user={id:'00000000-0000-4000-8000-000000000001',nome:'Dra. Carla de Teste',cpf:'99988877766',email:'carla@example.test',senha_hash:'teste',perfil:'medico',ativo:true,crm:'CRM 123',especialidade:'Clínica'};
  const db={configuracoes:[],usuarios:[user],pacientes:[],consultas:[],agendamentos:[],notificacoes:[],receitas:[],exames_solicitados:[],unidades:[{nome:'Clínica de Teste',ativo:true}]};
  let failWrites=false, failCalls=false, failTVReads=false, errors=[], calls=[];
  const globalCtx=[];
  async function prepare(page, opts={}) {
    await page.setRequestInterception(true);
    page.on('pageerror',e=>errors.push(e.stack||String(e)));
    page.on('request',r=>{
      const u=new URL(r.url());
      if(u.host==='cdn.jsdelivr.net') return r.respond({status:200,contentType:'application/javascript',body:umd});
      if(['fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com'].includes(u.host)) return r.respond({status:200,body:''});
      if(u.hostname.endsWith('supabase.co')){
        const table=u.pathname.split('/').pop(), headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*','Content-Type':'application/json'};
        if(r.method()==='OPTIONS') return r.respond({status:204,headers,body:''});
        if(!u.pathname.startsWith('/rest/v1/')) return r.respond({status:200,headers,body:'{}'});
        calls.push({method:r.method(),table,url:u.toString()});
        if(failWrites && table==='configuracoes' && ['POST','PATCH','DELETE'].includes(r.method())) return r.respond({status:503,headers,body:JSON.stringify({message:'Falha simulada no banco'})});
        if(failCalls && table==='consultas' && r.method()==='PATCH') return r.respond({status:503,headers,body:JSON.stringify({message:'Falha simulada na chamada'})});
        if(failTVReads && table==='consultas' && r.method()==='GET') return r.respond({status:503,headers,body:JSON.stringify({message:'Falha simulada de leitura'})});
        let rows=db[table]||[], result=[];
        const matches=x=>Array.from(u.searchParams).filter(([k,v])=>v.startsWith('eq.')).every(([k,v])=>String(x[k])===v.slice(3)||(k==='atualizado_em'&&+new Date(x[k])===+new Date(v.slice(3))));
        if(r.method()==='GET') { result=rows.filter(matches); if(u.searchParams.get('order'))result=result.slice().sort((a,b)=>new Date(b.chamado_em)-new Date(a.chamado_em));if(u.searchParams.get('limit')) result=result.slice(0,Number(u.searchParams.get('limit'))); }
        else if(r.method()==='POST') { const body=JSON.parse(r.postData()||'{}'); for(const row of (Array.isArray(body)?body:[body])){
            if(row.chave&&rows.some(x=>x.chave===row.chave)) return r.respond({status:409,headers,body:JSON.stringify({code:'23505',message:'duplicado'})});
            row.id=row.id||'fake-'+Math.random();rows.push(row);result.push(row);
          }db[table]=rows;
        } else if(r.method()==='PATCH') {const body=JSON.parse(r.postData()||'{}');for(const row of rows.filter(matches)){Object.assign(row,body);result.push(row)}}
        else if(r.method()==='DELETE') {result=rows.filter(matches);db[table]=rows.filter(x=>!matches(x));}
        return r.respond({status:200,headers,body:JSON.stringify(result)});
      }
      r.continue();
    });
    await page.evaluateOnNewDocument((auth)=>{
      sessionStorage.setItem('usuarioLogado',JSON.stringify(auth));
      window.confirm=()=>true;
      // No external Realtime dependency in this isolated test.
      window.WebSocket=class { constructor(){ this.readyState=3; } close(){} send(){} addEventListener(){} removeEventListener(){} };
    },opts.auth||{tipo:'admin',nome:'Administrador de teste'});
  }
  const context=await browser.createBrowserContext();globalCtx.push(context);
  const page=await context.newPage(); await prepare(page);
  await page.setViewport({width:1366,height:900});
  await page.goto(BASE + '/sistema-medico/admin/mapa.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#mapa-status').textContent==='Não publicado',{timeout:15000});
  const step=x=>console.log('PASS',x);
  assert.ok(await page.evaluate(()=>[...document.querySelector('#mapa-unidade').options].some(o=>o.value==='Clínica de Teste')));
  const restrito=await browser.createBrowserContext();globalCtx.push(restrito);const pgRestrita=await restrito.newPage();
  await prepare(pgRestrita,{auth:{tipo:'admin',nome:'Admin local',unidades_autorizadas:['UPA Araucária']}});
  await pgRestrita.goto(BASE + '/sistema-medico/admin/mapa.html',{waitUntil:'domcontentloaded'});
  await pgRestrita.waitForFunction(()=>document.querySelector('#mapa-unidade').options.length>0,{timeout:10000});
  assert.deepEqual(await pgRestrita.evaluate(()=>[...document.querySelector('#mapa-unidade').options].map(o=>o.value)),['UPA Araucária']);
  await pgRestrita.close();
  step('unidades carregadas do banco e filtro de interface (não substitui RLS)');
  const row=key=>db.configuracoes.find(x=>x.chave===key);
  const draft=()=>JSON.parse(row('mapa_rascunho_ubs_central_araucaria').valor).mapa;
  async function add({nome,tipo,bloco,andar,numero,sem=false}){
    await page.click('#btn-adicionar-local');
    await page.type('#local-nome',nome);
    await page.select('#local-tipo',tipo);
    if(sem){await page.click('#local-sem-bloco');await page.click('#local-sem-andar');}
    if(bloco)await page.type('#local-bloco',bloco);
    if(andar)await page.type('#local-andar',andar);
    if(numero)await page.type('#local-numero-sala',numero);
    await page.click('#btn-salvar-local');
    try {await page.waitForFunction(()=>document.querySelector('#modal-local').hidden,{timeout:5000});}
    catch(e){throw new Error('salvar local '+nome+': '+await page.$eval('#modal-local-feedback',x=>x.textContent));}
    return draft().nos.find(x=>x.nome===nome);
  }
  const recep=await add({nome:'Recepção principal',tipo:'recepcao',bloco:'Bloco A',andar:'Térreo'});
  const triagem=await add({nome:'Triagem',tipo:'triagem',bloco:'Bloco A',andar:'Térreo'});
  const sala2=await add({nome:'Consultório 2',tipo:'consultorio',bloco:'Bloco B',andar:'1º andar',numero:'2'});
  assert.equal(sala2.x,null);assert.equal(sala2.y,null);assert.equal(draft().destinos.consultorios['2'],sala2.id);
  step('cadastro de consultório sem coordenadas e persistência remota');
  await page.select('[data-equipe-select="99988877766"]','2');await page.click('[data-salvar-equipe="99988877766"]');
  await page.waitForFunction(()=>document.querySelector('#mapa-feedback').textContent.includes('Vínculo salvo'),{timeout:5000});
  assert.equal(JSON.parse(row('equipe_consultorios_ubs_central_araucaria').valor).vinculos['99988877766'].consultorio,'2');
  step('vínculo médico por CPF salvo sem duplicar cadastro');
  const cadastro=await context.newPage();await prepare(cadastro);
  await cadastro.goto(BASE + '/sistema-medico/admin/index.html?pagina=funcionarios',{waitUntil:'domcontentloaded'});
  await cadastro.waitForFunction(()=>[...document.querySelector('#funcUnidade').options].some(o=>o.value==='UBS Central Araucária'),{timeout:10000});
  await cadastro.select('#funcCargo','Médico');await cadastro.select('#funcUnidade','UBS Central Araucária');
  await cadastro.waitForFunction(()=>[...document.querySelector('#funcConsultorio').options].some(o=>o.textContent.includes('Consultório 2')),{timeout:10000});
  assert.equal(await cadastro.$eval('#funcConsultorio',e=>[...e.options].find(o=>o.textContent.includes('Consultório 2')).value),'2');
  step('cadastro de médico carrega consultórios reais do rascunho');

  // A unidade legada já tinha vínculos, mas ainda não publicou mapa; a chamada
  // deve continuar possível e o telão não deve inventar orientação.
  db.pacientes=[{id:'00000000-0000-4000-8000-000000000010',nome:'Paciente de teste',cpf:'11122233344'}];
  db.consultas=[{id:'00000000-0000-4000-8000-000000000020',paciente_id:db.pacientes[0].id,cpf:'11122233344',unidade:'UBS Central Araucária',senha:'A123',status:'em_fila',criado_em:new Date().toISOString(),triagem:{queixa_principal:'Teste',classificacao_risco:'verde'}}];
  const medico=await context.newPage();await prepare(medico,{auth:{tipo:'medico',cpf:user.cpf,nome:user.nome,crm:user.crm}});
  await medico.goto(BASE + '/sistema-medico/medico/index.html',{waitUntil:'domcontentloaded'});
  await medico.waitForFunction(()=>[...document.querySelector('#consultorioChamada').options].some(o=>o.value==='2'),{timeout:15000});
  assert.match(await medico.$eval('#consultorioAjuda',e=>e.textContent),/sem mapa publicado/i);
  await medico.waitForFunction(()=>document.querySelector('#listaEspera').textContent.includes('Paciente de teste'),{timeout:10000});
  await medico.evaluate(()=>chamarParaConsulta('00000000-0000-4000-8000-000000000020'));
  await delay(500);
  assert.equal(db.consultas[0].status,'chamado');assert.equal(db.consultas[0].consultorio,'2');
  assert.equal(db.usuarios.length,1);
  step('vínculo legado preserva chamada médica antes da primeira publicação');
  db.consultas[0].status='em_fila';db.consultas[0].chamado_em=null;
  await medico.evaluate(()=>{
    const lista=JSON.parse(localStorage.getItem('vidamais_consultas'));lista[0].status='em_fila';lista[0].chamado_em=null;
    localStorage.setItem('vidamais_consultas',JSON.stringify(lista));window.__chamadasEmitidas=0;DB.on('paciente_chamado',()=>window.__chamadasEmitidas++);
  });
  const qtdNotificacoes=db.notificacoes.length;failCalls=true;
  await medico.evaluate(()=>chamarParaConsulta('00000000-0000-4000-8000-000000000020'));
  assert.equal(db.consultas[0].status,'em_fila');
  assert.equal(await medico.evaluate(()=>DB.getConsultas()[0].status),'em_fila');
  assert.equal(await medico.evaluate(()=>window.__chamadasEmitidas),0);
  assert.equal(db.notificacoes.length,qtdNotificacoes);
  failCalls=false;
  step('falha ao salvar chamada reverte estado local e não envia notificação enganosa');
  db.consultas=[];db.pacientes=[];
  await medico.close();await cadastro.close();
  await page.click('[data-aba="revisao"]');
  await page.click('#btn-validar-publicar');
  assert.equal(await page.$eval('#modal-publicacao',e=>e.hidden),true);
  assert.equal(row('mapa_hospital_ubs_central_araucaria'),undefined);
  assert.match(await page.$eval('#lista-pendencias-revisao',e=>e.innerText),/sem orientação/i);
  step('pendências impedem publicação e mantêm produção intacta');
  await page.click('[data-aba="locais"]');
  await add({nome:'Elevador principal',tipo:'elevador',bloco:'Bloco A',andar:'Térreo'});
  await page.click('[data-aba="orientacoes"]');
  async function setOrigin(id,origin) {
    await page.select('#orientacao-destino',id); await page.select('#orientacao-ponto-inicial',origin);
  }
  await setOrigin(triagem.id,recep.id);
  assert.equal(await page.$eval('#orientacao-localizacao',e=>e.value),'mesmo_andar');
  await page.click('input[name="como_chegar"][value="seguir_placas"]');
  await page.click('#btn-gerar-sugestao');
  assert.match(await page.$eval('#orientacao-texto',e=>e.value),/Triagem/);
  await page.click('#btn-salvar-orientacao');
  await page.waitForFunction(()=>document.querySelector('#mapa-feedback').textContent.includes('Orientação salva'),{timeout:5000});
  assert.ok(draft().orientacoes[triagem.id]);
  await setOrigin(sala2.id,triagem.id);
  assert.equal(await page.$eval('#orientacao-localizacao',e=>e.value),'outro_andar');
  await page.click('input[name="como_chegar"][value="utilizar_elevador"]');
  await page.click('input[name="como_chegar"][value="seguir_placas"]');
  await page.click('#btn-gerar-sugestao');
  let t=await page.$eval('#orientacao-texto',e=>e.value);
  assert.match(t,/elevador/i);assert.match(t,/1º andar/i);assert.doesNotMatch(t,/esquerda|direita|metros/i);
  await page.select('#acess-elevador','sim');
  assert.equal(await page.$eval('#acess-alternativa',e=>e.value),'nao_informado');
  await page.click('#btn-salvar-orientacao');
  await page.waitForFunction(()=>document.querySelector('#mapa-feedback').textContent.includes('Orientação salva'),{timeout:5000});
  assert.equal(draft().orientacoes[sala2.id].acessibilidade.alternativa_sem_escadas,'nao_informado');
  step('orientação gerada, editável, salva e acessibilidade sem pressupostos');
  await page.click('#btn-visualizar-telao');
  assert.equal(await page.$eval('#previa-tv-destino',e=>e.textContent),'Consultório 2');
  assert.match(await page.$eval('#previa-tv-passos',e=>e.textContent),/elevador/i);
  assert.match(await page.$eval('#previa-tv-localizacao',e=>e.textContent),/Bloco B/);
  assert.match(await page.$eval('#previa-tv-medico',e=>e.textContent),/Carla/);
  step('prévia usa destino, orientação, localização e médico reais');
  await page.click('[data-aba="locais"]');
  const sala3=await add({nome:'Consultório 3',tipo:'consultorio',bloco:'Bloco B',andar:'1º andar',numero:'3'});
  assert.equal(draft().orientacoes[sala3.id],undefined);
  await page.click('[data-aba="orientacoes"]');await setOrigin(sala3.id,triagem.id);
  await page.click('#orientacao-reutilizar');await page.select('#orientacao-base-destino',sala2.id);
  let copiaTexto=await page.$eval('#orientacao-texto',e=>e.value);assert.match(copiaTexto,/Consultório 2/);
  await page.$eval('#orientacao-texto',e=>{e.value=e.value.replace(/Consultório 2/g,'Consultório 3');e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.type('#orientacao-complemento','Informe-se na sala 3.');
  await page.click('#btn-salvar-orientacao');await delay(500);
  assert.equal(draft().orientacoes[sala3.id].reutiliza_de,sala2.id);
  assert.match(draft().orientacoes[sala3.id].complemento_especifico,/sala 3/);
  step('reutilização explícita, editável e persistida com complemento');
  const context2=await browser.createBrowserContext();globalCtx.push(context2);const page2=await context2.newPage();await prepare(page2);
  await page2.goto(BASE + '/sistema-medico/admin/mapa.html',{waitUntil:'domcontentloaded'});
  await page2.waitForFunction(()=>document.querySelector('#ind-total-locais').textContent==='5',{timeout:15000});
  assert.match(await page2.$eval('#lista-locais-unidade',e=>e.innerText),/Consultório 3/);
  step('rascunho recuperado em outro navegador a partir do banco');
  await page.click('[data-aba="revisao"]');
  let pending=await page.$eval('#lista-pendencias-revisao',e=>e.innerText);
  assert.match(pending,/Nenhuma pendência/,pending);
  await page.click('#btn-validar-publicar');assert.equal(await page.$eval('#modal-publicacao',e=>e.hidden),false);
  await page.click('#confirmacao-validacao');await page.click('#btn-publicar');
  await page.waitForFunction(()=>document.querySelector('#modal-publicacao').hidden,{timeout:5000});
  const published=JSON.parse(row('mapa_hospital_ubs_central_araucaria').valor).mapa;
  assert.equal(published.configurado,true);assert.ok(published.orientacoes[sala2.id]);
  assert.equal(row('mapa_rascunho_ubs_central_araucaria'),undefined);
  step('publicação confirmada no banco e separação entre rascunho e produção');
  db.consultas=[{id:'call-test',senha:'Z042',status:'chamado',chamado_em:new Date().toISOString(),tipo_chamada:'consulta',consultorio:'2',medico_nome:'Dra. Carla de Teste',unidade:'UBS Central Araucária',nome_chamado:'NOME PRIVADO'}];
  const tv=await context.newPage();await prepare(tv);await tv.setViewport({width:1366,height:768});
  await tv.goto(BASE + '/telao/index.html',{waitUntil:'domcontentloaded'});
  await tv.waitForFunction(()=>document.querySelector('#chamada-senha').textContent==='Z042',{timeout:15000});
  await tv.waitForFunction(()=>document.querySelector('#rota-passos').innerText.includes('elevador'),{timeout:10000});
  assert.equal(await tv.$eval('#rota-destino',e=>e.textContent),'Consultório 2');
  assert.match(await tv.$eval('#rota-local',e=>e.textContent),/Bloco B/);
  assert.equal(await tv.$eval('#mapa-hospital',e=>e.hidden),true);
  assert.equal(await tv.$eval('#chamada-nome',e=>e.hidden),true);
  assert.doesNotMatch(await tv.evaluate(()=>document.body.innerText),/NOME PRIVADO/);
  step('chamada real simulada resolve a versão publicada no telão sem mapa ou dados clínicos');
  // Conferir que abrir o modo avançado preserva os recursos, sem exigir ligacões.
  await page.click('#btn-abrir-mapeamento-avancado');
  assert.equal(await page.$eval('#painel-mapeamento-avancado',e=>e.hidden),false);
  await page.click('[data-subaba-avancada="ligacoes"]');
  assert.equal(await page.$eval('#subaba-ligacoes',e=>e.hidden),false);
  step('planta e ligações avançadas disponíveis de forma opcional');

  // Atualizações permanecem em rascunho; os IDs e vínculos dos médicos não mudam.
  await page.click('[data-aba="locais"]');
  await page.click('[data-editar-local="'+sala2.id+'"]');
  await page.$eval('#local-nome',e=>{e.value='Consultório 2 — Especialidades';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.$eval('#local-bloco',e=>{e.value='Bloco C';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('#btn-salvar-local');
  await page.waitForFunction(()=>document.querySelector('#modal-local').hidden,{timeout:5000});
  assert.equal(draft().destinos.consultorios['2'],sala2.id);
  assert.equal(JSON.parse(row('equipe_consultorios_ubs_central_araucaria').valor).vinculos['99988877766'].consultorio,'2');
  assert.equal(draft().orientacoes[sala2.id].revisao_necessaria,true);
  assert.equal(draft().orientacoes[sala3.id].revisao_necessaria,true);
  assert.equal(JSON.parse(row('mapa_hospital_ubs_central_araucaria').valor).mapa.nos.find(n=>n.id===sala2.id).nome,'Consultório 2');
  assert.equal(await tv.$eval('#rota-destino',e=>e.textContent),'Consultório 2');
  step('alteração de localização mantém vínculos e não altera telão até nova publicação');

  await page.click('[data-aba="revisao"]');
  assert.match(await page.$eval('#lista-pendencias-revisao',e=>e.innerText),/precisa de revisão/);
  await page.click('[data-corrigir="orientacoes"][data-corrigir-id="'+sala2.id+'"]');
  await page.$eval('#orientacao-texto',e=>{e.value='Texto temporário preservado';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('[data-aba="revisao"]');
  assert.match(await page.$eval('#lista-pendencias-revisao',e=>e.innerText),/Alterações não salvas/);
  await page.click('[data-aba="orientacoes"]');
  assert.equal(await page.$eval('#orientacao-texto',e=>e.value),'Texto temporário preservado');
  await page.click('#btn-cancelar-orientacao');
  step('corrigir pendência abre formulário e navegação preserva edições não salvas');

  // Uma falha não informa sucesso nem duplica o local na tentativa seguinte.
  await page.click('[data-aba="locais"]');
  failWrites=true;
  await page.click('#btn-adicionar-local');await page.type('#local-nome','Sala sem divisões');
  await page.select('#local-tipo','outro');await page.type('#local-tipo-personalizado','Sala de espera');
  await page.click('#local-sem-bloco');await page.click('#local-sem-andar');
  await page.click('#btn-salvar-local');
  await page.waitForFunction(()=>document.querySelector('#modal-local-feedback').textContent.includes('não foi confirmada no banco'),{timeout:5000});
  assert.equal(draft().nos.some(n=>n.nome==='Sala sem divisões'),false);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('vidamais_mapa_hospital_ubs_central_araucaria_rascunho'))._pendente),true);
  failWrites=false;
  await page.click('#btn-salvar-local');
  await page.waitForFunction(()=>document.querySelector('#modal-local').hidden,{timeout:5000});
  assert.equal(draft().nos.filter(n=>n.nome==='Sala sem divisões').length,1);
  assert.equal(draft().nos.find(n=>n.nome==='Sala sem divisões').sem_andar,true);
  step('falha remota preserva cópia e a repetição não duplica local; unidade sem divisões');
  const semNumero=await add({nome:'Consultório Azul',tipo:'consultorio',sem:true});
  const chaveSemNumero=Object.keys(draft().destinos.consultorios).find(k=>draft().destinos.consultorios[k]===semNumero.id);
  assert.ok(chaveSemNumero.length<=10 && chaveSemNumero.startsWith('loc_'));
  assert.equal(semNumero.numero_sala,'');assert.equal(semNumero.x,null);
  step('consultório sem número usa chave interna compatível com VARCHAR(10)');

  // A página aberta antes da publicação tenta escrever uma versão obsoleta.
  await page2.click('#btn-adicionar-local');await page2.type('#local-nome','Sala de sessão antiga');
  await page2.click('#btn-salvar-local');
  await page2.waitForFunction(()=>document.querySelector('#modal-local-feedback').textContent.includes('outra sessão'),{timeout:5000});
  assert.equal(draft().nos.some(n=>n.nome==='Sala de sessão antiga'),false);
  step('escrita concorrente obsoleta é rejeitada sem sobrescrever rascunho');

  // Um destino desconhecido sempre apresenta fallback neutro no telão.
  db.consultas[0].consultorio='99';db.consultas[0].chamado_em=new Date(Date.now()+1000).toISOString();
  await tv.waitForFunction(()=>!document.querySelector('#rota-sem-mapa').hidden,{timeout:10000});
  assert.match(await tv.$eval('#rota-sem-mapa',e=>e.textContent),/Consulte a recepção/);
  assert.equal(await tv.$eval('#rota-passos',e=>e.hidden),true);
  step('destino sem orientação publicada usa mensagem neutra');
  await tv.evaluate(()=>localStorage.setItem('vidamais_consultas', JSON.stringify([{id:'nao-confirmada',senha:'FALSA',status:'chamado',chamado_em:new Date().toISOString(),tipo_chamada:'consulta',consultorio:'2',unidade:'UBS Central Araucária'}])));
  failTVReads=true;
  await tv.evaluate(()=>atualizar());
  assert.notEqual(await tv.$eval('#chamada-senha',e=>e.textContent),'FALSA');
  failTVReads=false;
  step('indisponibilidade remota não exibe uma chamada local não confirmada');

  // No modo opcional são possíveis coordenadas e ligações reais, sem dados simulados.
  await page.click('[data-subaba-avancada="planta"]');
  await page.select('#selecionar-ponto-avancado',triagem.id);
  await page.$eval('#ponto-x',e=>e.value='120');await page.$eval('#ponto-y',e=>e.value='100');
  await page.click('#form-ponto button[type="submit"]');await delay(350);
  await page.select('#selecionar-ponto-avancado',sala2.id);
  await page.$eval('#ponto-x',e=>e.value='300');await page.$eval('#ponto-y',e=>e.value='100');
  await page.click('#form-ponto button[type="submit"]');await delay(350);
  await page.click('[data-subaba-avancada="ligacoes"]');
  await page.select('#ligacao-de',triagem.id);await page.select('#ligacao-para',sala2.id);
  await page.type('#ligacao-instrucao','Siga a sinalização confirmada.');
  await page.click('#form-ligacao button[type="submit"]');await delay(350);
  assert.ok(draft().ligacoes.some(l=>l.de===triagem.id&&l.para===sala2.id));
  assert.ok(await page.evaluate((m,a,b)=>!!OrientacaoHospitalTV.calcularCaminhoGrafico(m,b,a),draft(),triagem.id,sala2.id));
  step('mapeamento avançado mantém cadastro e cálculo de ligação real');

  // Exercita as três etapas, o modal de cadastro e o telão em larguras reais.
  // As tabelas têm rolagem horizontal própria, mas a página não deve transbordar.
  async function verificarLargura(pg, descricao) {
    const dims=await pg.evaluate(()=>({w:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(dims.scroll<=dims.w+1,`overflow ${descricao}: ${JSON.stringify(dims)}`);
  }
  for(const width of [320,360,375,414,768,1024,1366,1920]){
    await page.setViewport({width,height:width>=1366?900:720});
    for(const aba of ['locais','orientacoes','revisao']){
      await page.click(`[data-aba="${aba}"]`);
      await verificarLargura(page,`${width} etapa ${aba}`);
    }
    await page.click('[data-aba="locais"]');
    await page.click('#btn-adicionar-local');
    const modal=await page.$eval('#modal-local .mapa-modal-box',e=>{
      const r=e.getBoundingClientRect();return {esquerda:r.left,direita:r.right,altura:r.height,janela:innerHeight};
    });
    assert.ok(modal.esquerda>=-1 && modal.direita<=width+1 && modal.altura<=modal.janela+1,
      `modal fora da tela ${width}: ${JSON.stringify(modal)}`);
    await page.type('#local-nome','Teste responsivo');
    await page.click('#btn-cancelar-local');
    await verificarLargura(page,`${width} modal`);
    await tv.setViewport({width,height:width>=1366?900:720});
    await verificarLargura(tv,`${width} telão`);
  }
  step('três etapas, modal e telão sem transbordamento em 320–1920 px');
  if(errors.length) throw new Error('Page errors: '+errors.join('\n'));
  console.log('PASS sem erros de JavaScript no navegador');
  await page.setViewport({width:1366,height:900});await page.screenshot({path:'.audit-tools/revisao.png',fullPage:true});
  await tv.screenshot({path:'.audit-tools/telao.png',fullPage:true});
  console.log('SUMMARY',JSON.stringify({requests:calls.length,configRows:db.configuracoes.length,errors:errors.length}));
  await browser.close();
})().catch(e=>{console.error('FAIL',e.stack||e);process.exit(1)});
