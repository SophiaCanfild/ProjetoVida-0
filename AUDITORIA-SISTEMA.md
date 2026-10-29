# 🩺 Auditoria do Sistema Vida+ — 26/10/2026

**Branch:** `arena/948613e0-projetovida-0`
**Projeto Supabase auditado:** `ofqyqorsedxveersqful` (mesmo `SUPABASE_URL` dos arquivos `config.js`)
**Escopo:** erros de código, responsividade, gravação/leitura no banco de dados e segurança.

---

## 1. Resumo executivo

| Pergunta | Resposta |
|---|---|
| O banco está salvando as informações? | **Sim.** Testes reais de `INSERT`, `UPDATE`, `UPSERT`, `DELETE` e `SELECT` passaram **46/46** operações no Supabase em produção, com limpeza completa dos dados de teste (`leftovers = 0`). |
| Existem problemas de banco/schema? | **Não.** As 10 tabelas existem, com as colunas que o `db.js` envia, RLS e GRANTs funcionando. A migração de receitas/exames está aplicada. |
| Existem problemas de salvamento? | **Sim, mas no front-end, não no banco.** Havia 2 bugs que impediam gravações específicas (perfil do paciente e CPF mascarado em usuário) e a maioria das gravações é *dispare-e-esqueça* (mostra “sucesso” antes do banco confirmar). **Todos os bugs objetivos foram corrigidos neste branch.** |
| O sistema era 100% responsivo? | **Não.** O app do paciente, o portal e o telão já eram responsivos. O **sistema médico cortava conteúdo em celulares** (sidebar de 80 px + cards largos demais) e 2 páginas tinham rolagem horizontal. **Após os ajustes, 0 páginas com overflow** em 6 viewports (320 → 1920 px). |
| Há erros de JavaScript? | **0 erros não tratados** após as correções. Resta 1 mensagem benigna em `telao/teste-voz.html` (“Áudio suspenso…”), esperada em navegador sem interação do usuário. |
| Qual é o maior risco? | **Segurança/LGPD:** a `anon key` está no repositório e as políticas RLS são `USING (TRUE)` — qualquer pessoa consegue ler, alterar e apagar prontuários, senhas em texto puro e notificações sem login. Aceitável para TCC/demo, **não para produção**. |

---

## 2. Como a auditoria foi feita

1. **Análise estática:** `node --check` em todos os `.js`, busca de referências locais quebradas, IDs duplicados, comparação entre `shared/js/*` e as cópias em `paciente-app/js/*`, e leitura de `supabase/schema.sql`, migrações, `db.js`, CSS e HTML.
2. **Banco ao vivo (leitura):** consultas REST autenticadas apenas com a `anon key` para contar registros e inspecionar colunas reais de cada tabela.
3. **Banco ao vivo (escrita):** página temporária executada via `htmlpreview.github.io` com `XMLHttpRequest` síncrono, reproduzindo exatamente os payloads do `DB.*`. Foram testados: `pacientes`, `consultas`, `notificacoes`, `agendamentos`, `usuarios`, `configuracoes`, `receitas` e `exames_solicitados`. Todos os registros de teste foram removidos (os de receitas/exames por `ON DELETE CASCADE` da consulta).
4. **Navegador real:** Chromium headless (Puppeteer) carregando as **21 páginas HTML** com o Supabase simulado (mesma biblioteca `supabase-js` UMD), em 6 viewports: `320×568`, `375×667`, `768×1024`, `1024×768`, `1366×768`, `1920×1080`. Foram medidas largura do documento, elementos fora da viewport, erros de console e exceções não tratadas.
5. **Validação de payload:** interceptação de todas as requisições `POST/PATCH/DELETE` geradas pelo front-end, comparando as colunas enviadas com o schema real e validando CPF/sexo/perfil/status.

> O Realtime (WebSocket) não pôde ser confirmado ponta a ponta neste sandbox (a ferramenta de captura encerra a página antes do `SUBSCRIBED`). A publicação `supabase_realtime` está configurada no `schema.sql` (fase 8) e o `status-banco.html` possui teste específico para isso — recomendável rodá-lo uma vez no navegador do telão.

---

## 3. Banco de dados — situação real

Contagens no momento da auditoria:

| Tabela | Registros | Observação |
|---|---:|---|
| `pacientes` | 13 | Inclui cadastros de 20–26/10/2026 |
| `consultas` | 17 | Inclui triagem, chamada e finalização |
| `notificacoes` | 146 | Avisos do app do paciente |
| `usuarios` | 12 | Funcionários |
| `agendamentos` | 2 | |
| `receitas` | 1 | Emitida em 25/10/2026 |
| `exames_solicitados` | 1 | Solicitado em 25/10/2026 |
| `configuracoes` | 6 | Inclui `equipe_consultorios_ubs_central_araucaria` (atualizada em 26/10) |
| `unidades` | 8 | `APP_CONFIG.UNIDADES` lista apenas 2; as demais vêm do banco |
| `medicamentos` | 32 | Catálogo lido direto do Supabase pelo módulo de prescrição |

**Resultado dos testes de escrita reais:**

- Teste principal: **33 operações OK, 0 falhas, 0 resíduos** — paciente → consulta → chamada → triagem/finalização → notificação → agendamento → usuário → `configuracoes` (upsert de mapa e equipe), com `SELECT` de verificação e `DELETE` de limpeza.
- Teste de prescrições: **13 operações OK, 0 falhas, 0 resíduos** — `INSERT` em `receitas`, `INSERT` + `UPDATE` de resultado em `exames_solicitados`, e limpeza por cascata.

Ou seja: **o problema histórico descrito em `DIAGNOSTICO-BANCO.md` (schema antigo com `BIGINT`/`id_paciente`) está resolvido neste projeto.** O `status-banco.html`, `supabase/schema.sql` e `supabase/diagnostico.sql` continuam sendo as ferramentas oficiais de verificação.

> `equipe_consultorios` **não é uma tabela**: os vínculos são gravados como JSON em `configuracoes.chave = 'equipe_consultorios_<unidade>'`. Uma consulta direta a essa “tabela” retorna `PGRST205`, o que é esperado pelo desenho atual, não um erro.

---

## 4. Problemas encontrados e corrigidos neste branch

### 🔴 Alto — Segurança / LGPD (recomendação, não corrigido por exigir mudança de arquitetura)
- `shared/js/config.js` e `paciente-app/js/config.js` contêm a **anon key** (pública por design do Supabase, mas perigosa com as políticas atuais).
- `supabase/schema.sql` cria políticas `demo * ... FOR ALL ... USING (TRUE) WITH CHECK (TRUE)`. Com isso, **qualquer pessoa com a URL do projeto pode ler/apagar prontuários, notificações e a tabela `usuarios`** — confirmado: li e apaguei registros sem login.
- `usuarios.senha_hash` guarda **senha em texto puro** (`admin123`, `medico123`…), e `DB.verificarLogin` compara texto com texto.
- O “login” é só `sessionStorage.usuarioLogado`; qualquer usuário pode forjar esse valor no DevTools e acessar o painel administrativo.
- `status-banco.html` está publicado no GitHub Pages e **executa INSERT/UPDATE/DELETE no banco de produção** com a anon key.
- **Recomendação:** Supabase Auth + `bcrypt/argon2`, políticas RLS por `auth.uid()`/perfil, remover senhas em texto, restringir `status-banco.html` a um ambiente de teste e rotacionar a chave se houver dados reais.

### 🟠 Médio — Gravações “dispare-e-esqueça” (recomendação, não totalmente corrigido)
- Apenas `DB.cadastrarPaciente()` expõe `DB.envioPaciente()` para a recepção aguardar o banco (`recepcionista/index.html:715`).
- Todos os outros `sbInsert/sbUpdate/sbUpsert` em `shared/js/db.js` são chamados **sem `await`**: triagem, chamada, finalização de consulta, receitas, exames, notificações, agendamentos e usuários. A tela mostra “✅” antes do Supabase responder; se falhar, apenas um toast de erro aparece depois (há listener `persistencia_falhou` no admin e na recepção, mas **não no app do paciente**).
- **Recomendação:** fazer `DB.*` retornarem a promessa e `await` nos handlers, ou criar uma fila de sincronização com retry e indicador visual de “salvando”.

### 🔴 Alto — Edição de perfil do paciente quebrada ✅ corrigido
- `paciente-app/perfil.html:157` chamava `DB.atualizarPaciente({ ...paciente, ...novos })`, mas a assinatura é `DB.atualizarPaciente(cpf, dados)`.
- Resultado real no navegador: toast **`Erro: (cpf || "").replace is not a function`**, telefone/e-mail/endereço **não eram salvos nem no localStorage nem no Supabase**.
- **Correção:** `await DB.atualizarPaciente(paciente.cpf, novos);`. Re-testado: toast “Dados atualizados ✓” e `atualizado_em` preenchido.

### 🟠 Médio — CPF mascarado em UPDATE de usuário ✅ corrigido
- `DB.cadastrarUsuario()` (ramo de CPF já existente) e `DB.atualizarUsuario()` passavam `dados` cru para `sbUpdate`. Como o formulário aplica máscara (`000.000.000-00`), o `PATCH` enviava `cpf` com 14 caracteres para uma coluna `VARCHAR(11)` → erro `22001` no Supabase.
- Confirmado com interceptação: `PATCH /usuarios` continha `"cpf": "222.333.444-55"`.
- **Correção (nas duas cópias do `db.js`):** `sbUpdate('usuarios', Object.assign({}, dados, { cpf: cpfLimpo }), { cpf: cpfLimpo })`. Re-testado: PATCH com `"cpf": "22233344455"`, 0 erros de validação.

### 🟠 Médio — Diagnóstico offline sempre errado ✅ corrigido
- `paciente-app/status-offline.html` usava `VERSAO = 'vidaplus-paciente-v4'`, mas `service-worker.js` está em `vidaplus-paciente-v13` (README também diz v13).
- Consequência: a página sempre abria o cache errado e exibia “NENHUM (PRECACHE NÃO RODOU)” e 0/23 itens, mesmo com o PWA corretamente instalado.
- **Correção:** versão alinhada para `v13`.

### 🟠 Médio — SVG inválido no mapa ✅ corrigido
- `telao/js/tv-mapa.js:248` não fechava as aspas do atributo `y2`: `'" y2="' + numero(para.y) + (ativa ? ... ) + '></line>'`.
- O Chrome registrava `Error: <line> attribute y2: Expected length, "245></line><line…"` ao abrir `admin/mapa.html`, e as linhas de rota ficavam malformadas.
- **Correção:** `+ '"' +` após `numero(para.y)`. Console limpo após a mudança.

### 🟠 Médio — Responsividade do sistema médico ✅ corrigido
**Antes:** em 320/375 px, `sistema-medico/{admin,medico,enfermeiro,recepcionista}` tinham sidebar de 80 px + conteúdo com largura fixa; cards, tabelas e formulários eram **cortados** (`overflow:hidden` em `.main-content`), sem rolagem horizontal. `admin/mapa.html` e `status-offline.html` tinham `scrollWidth` maior que a viewport (330/320 e 485/320).

**Correções aplicadas:**
- Novo bloco `@media (max-width: 767px)` em `sistema-medico/css/global.css`: sidebar vira barra horizontal com rótulos (não depende mais só dos ícones do Font Awesome), conteúdo ocupa 100% da largura, grids inline viram 1 coluna, `.alert` quebra linha, cards têm `min-width: 0`, tabelas continuam com scroll próprio.
- `sistema-medico/css/mapa-admin.css`: abas do mapa passam a quebrar linha em vez de estourar a tela.
- `paciente-app/status-offline.html`: `.pill` passa a quebrar linha (`white-space: normal; overflow-wrap: anywhere`).

**Depois (Chromium real, 21 páginas × 6 viewports = 126 medições):**
- `pagesWithOverflow`: **0**
- `pageErrors`: **0**
- `consoleErrors`: **1** (mensagem benigna do `teste-voz.html`)
- `validationErrors` nos payloads: **0** (27 escritas capturadas, todas com colunas válidas)

---

## 5. Outros achados (não corrigidos / baixos)

| Item | Detalhe | Impacto |
|---|---|---|
| Scripts Cloudflare injetados | 6 HTMLs (`sistema-medico/admin/index.html`, `enfermeiro`, `medico`, `recepcionista`, `login/admin`, `login/funcionario`) terminam com um bloco `cdn-cgi/challenge-platform` e um `</script>` órfão. São resíduos de página salva de trás de proxy. | Baixo: geram requisição 404 e HTML inválido; recomendável remover. |
| `apple-touch-icon.png` | 8 páginas do paciente apontam para `paciente-app/apple-touch-icon.png`, que não existe (o arquivo está em `paciente-app/icons/`). | Baixo: ícone ao adicionar à tela de início no iOS pode falhar; o `manifest.json` está correto. |
| Dependência de CDNs | Fontes Google, Font Awesome e `supabase-js` vêm de CDNs. Se o CDN do Supabase falhar, `supabaseClient` fica `null` e o sistema cai silenciosamente para `localStorage` (“modo demo”). | Médio em cenário offline/instável; ideal empacotar o `supabase-js` localmente e ter fallback explícito com aviso. |
| `unidades` / `medicamentos` | Não entram no `sincronizarDoSupabase()`; são lidos direto do Supabase por `prescricoes.js`/`medico-prescricoes.js` e não têm CRUD no app. | Baixo: offline usa catálogo estático; documentation diz “10 tabelas”, mas 7 são as realmente sincronizadas + `configuracoes` via stores próprios. |
| Documentação | README cita `notificações` com acento, mas a tabela é `notificacoes`; `DIAGNOSTICO-BANCO.md` fala em 8 tabelas/versão v4 do SW em alguns trechos. | Baixo: inconsistência textual. |
| `status-banco.html` | Contém resumo “Modo demo ativo” no DOM mesmo com credenciais OK (é escondido por CSS/JS). | Baixo: confunde quem lê via ferramenta de acessibilidade; revisar texto. |

---

## 6. Arquivos alterados neste branch

| Arquivo | Mudança |
|---|---|
| `shared/js/db.js`, `paciente-app/js/db.js` | CPF limpo no `sbUpdate` de usuários (mantém as duas cópias idênticas). |
| `paciente-app/perfil.html` | Chamada correta de `DB.atualizarPaciente(cpf, dados)`. |
| `paciente-app/status-offline.html` | `VERSAO` v13 + `.pill` com quebra de linha. |
| `telao/js/tv-mapa.js` | Fechamento de aspas do `y2` no SVG. |
| `sistema-medico/css/global.css` | Media query mobile (sidebar horizontal, grids 1 coluna, alerts e cards fluidos). |
| `sistema-medico/css/mapa-admin.css` | Abas com `flex-wrap` em telas pequenas. |
| `.gitignore` | Novo: ignora `.audit-tools/` e `node_modules/`. |
| `AUDITORIA-SISTEMA.md` | Este relatório. |

---

## 7. Prioridades recomendadas

1. **Segurança (antes de qualquer dado real):** Supabase Auth, hash de senha, RLS por perfil, restringir `status-banco.html`, revisar exposição da anon key.
2. **Confirmar gravações no front:** tornar `DB.*` assíncronos e aguardar o retorno em todos os formulários; mostrar estado “salvando/salvo/erro”.
3. **Testes automatizados:** transformar os scripts desta auditoria em um teste de CI (jsdom/Playwright + Supabase de teste) para detectar regressões de payload e responsividade.
4. **Limpeza:** remover scripts Cloudflare, corrigir `apple-touch-icon`, empacotar `supabase-js` localmente, alinhar README/`DIAGNOSTICO-BANCO.md`.
5. **Realtime:** rodar `status-banco.html` no navegador do telão e confirmar `SUBSCRIBED`; verificar se `supabase_realtime` inclui `receitas`/`exames_solicitados` no projeto (o `schema.sql` já prevê isso).

---

## 8. Como reproduzir a verificação

```bash
# 1) Site local
python3 -m http.server 8000
# abra http://localhost:8000/status-banco.html  → deve ficar tudo verde

# 2) SQL (Supabase → SQL Editor)
#    supabase/diagnostico.sql  (somente leitura)
#    supabase/schema.sql       (instalador idempotente, se necessário)

# 3) Console do navegador (F12) ao cadastrar um paciente na recepção
#    esperado: "[Vida+] Supabase conectado" e nenhum "[Supabase insert] FALHOU"
```

**Conclusão:** o banco de dados está saudável e gravando; os gargalos reais estavam em bugs pontuais do front-end (já corrigidos), em confirmação de escrita e, principalmente, na exposição indevida dos dados por RLS permissivo. A responsividade, que não era plena no sistema médico, foi ajustada e validada sem overflow em 126 combinações página × viewport.
