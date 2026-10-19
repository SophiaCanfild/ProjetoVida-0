# 🔍 Diagnóstico: por que os pacientes não estão sendo salvos

**Repositório:** `SophiaCanfild/ProjetoVida-0`
**Data:** 19/10/2026
**Arquivos analisados:** `shared/js/db.js`, `shared/js/config.js`, `supabase/schema.sql`, `sistema-medico/**`, `paciente-app/**`, `status-banco.html` e o SQL do Supabase enviado na conversa.

> **Aviso de método:** não consigo acessar o seu projeto Supabase a partir deste ambiente (o sandbox só tem acesso a GitHub/npm/PyPI). Portanto este diagnóstico é feito por análise estática: código do app × schema esperado × SQL que você enviou. Os dois scripts abaixo (`supabase/diagnostico.sql` e a página `status-banco.html`) confirmam em 2 minutos qual é o caso real.

---

## 1. Resumo em uma frase

O app **não está gravando no Supabase** porque o banco que está no projeto Supabase **não é o mesmo banco que o código espera** — o SQL que você enviou é de outro modelo de dados (ids `BIGINT`, tabela `pacientes` com `id_paciente`/`id_usuario`, sem `nome`) e **não tem as tabelas/colunas que `shared/js/db.js` usa**. O front-end grava no `localStorage`, mostra “cadastrado com sucesso”, mas o `INSERT` no PostgREST falha em segundo plano.

Isso é **problema de banco/schema**, não de Git/GitHub. E também **não é bug do Supabase** — o Supabase está apenas recusando um `INSERT` em tabelas/colunas que não existem (ou que exigem campos que o app não envia).

Além disso, encontrei **4 bugs reais no código** que escondem essa falha e chegam a apagar cadastro feito no meio do carregamento. Todos foram corrigidos neste branch (seção 6).

---

## 2. O SQL que você enviou não é o SQL do repositório

O repositório já tem um schema oficial: **`supabase/schema.sql`**, com 8 tabelas:

`pacientes`, `usuarios`, `unidades`, `consultas`, `agendamentos`, `notificacoes`, `medicamentos`, `configuracoes`

Com **ids UUID** (`gen_random_uuid()`), pacientes com `nome`, `nascimento`, `alergias TEXT[]`, triagem dentro de `consultas.triagem` (JSONB), RLS habilitado com políticas `"demo ..."` permissivas e Realtime publicado.

O SQL que você mandou é **outro modelo** (o “modelo de triagem hospitalar”):

`usuarios`, `pacientes`, `medicos`, `triagens`, `fila_atendimento`, `consultas`, `prescricoes`, `encaminhamentos`, `exames`, `auditoria`

com **ids `BIGINT IDENTITY`** e pacientes no formato `id_paciente / id_usuario / cpf / telefone / data_nascimento / sexo`.

### 2.1 Comparação direta

| O que o app envia (`db.js`) | Modelo antigo (SQL enviado) | Resultado |
|:---|:---|:---|
| `pacientes.id` = UUID (`"3f2a…"`) | `id_paciente BIGINT` | `22P02` — *invalid input syntax for type bigint* |
| `nome`, `nascimento`, `endereco`, `tipo_sanguineo`, `alergias`, `doencas_cronicas`, `medicamentos_uso`, `cartao_sus` | **não existem** | `PGRST204` / `42703` — *column does not exist* |
| — | `id_usuario BIGINT NOT NULL` | `23502` — *null value in column id_usuario violates not-null* |
| `consultas`: `senha`, `unidade`, `status`, `recepcao`, `triagem` (JSONB) | **não existem**; a tabela exige `id_medico` e `id_triagem` NOT NULL | `42703` e `23502` |
| `usuarios.perfil` (`recepcionista`, `enfermeiro`, `medico`, `administrador`) | `tipo_usuario` com CHECK `PACIENTE/MEDICO/ADMIN` | `23514` — *check constraint violated* |
| `notificacoes`, `agendamentos`, `unidades`, `medicamentos`, `configuracoes` | **não existem** | `PGRST205` / `42P01` |
| ids gerados no navegador | PK `BIGINT` | `22P02` |

Em resumo: **nenhum `INSERT` de paciente consegue passar nesse modelo**, e nem o de consulta que vem logo depois (o app cadastra o paciente e já o coloca na fila).

### 2.2 O SQL colado também tem erros de sintaxe

Independentemente do modelo, o script que você mandou **não executaria**:

1. `email VARCHAR(255) UNIQ` → palavra-chave inválida (deveria ser `UNIQUE`) **e falta a vírgula** antes da próxima linha. Erro de sintaxe.
2. O trecho está fora de ordem: aparece `CREATE TABLE pacientes (` seguido imediatamente do cabeçalho de comentário e de `CREATE TABLE usuarios (`. Isso é um `CREATE TABLE` dentro de outro — erro de sintaxe.
3. Não há `CREATE TABLE` para `notificacoes`, `agendamentos`, `unidades`, `medicamentos` e `configuracoes`.
4. Não há `ENABLE ROW LEVEL SECURITY` nem `CREATE POLICY` — se o RLS estiver ligado no seu projeto, todo `INSERT` do app volta `42501`.

> O SQL Editor do Supabase executa o script em um único lote/transação. Um erro de sintaxe **desfaz tudo** — o mais provável é que esse script tenha falhado e o seu projeto tenha ficado **sem as tabelas do app** (ou com um conjunto parcial de outro momento). Nesse caso o erro que aparece no console é `PGRST205: Could not find the table 'public.pacientes' in the schema cache`.

---

## 3. As três camadas onde a gravação pode falhar

### Camada 1 — Schema errado (mais provável)
Sintomas: `PGRST204`, `PGRST205`, `42703`, `22P02`, `23502`, `23514`.
Teste: rode `supabase/diagnostico.sql` (seção 3) e leia o veredito; ou abra `status-banco.html` (agora com testes de colunas e de INSERT real).

### Camada 2 — RLS / permissões
O app usa a **anon key** sem Supabase Auth (login é feito no próprio JS, por CPF + senha). Se o RLS estiver ligado e **sem política** para `anon`, o Postgres devolve:
`42501: new row violates row-level security policy for table "pacientes"` — e as leituras voltam `[]` (o app parece “vazio”, mesmo com dados).
Solução: rodar o `supabase/schema.sql` (ele faz `ENABLE RLS` + cria as políticas `"demo ..."` `FOR ALL USING (TRUE) WITH CHECK (TRUE)`).

### Camada 3 — Bugs no front-end (encontrados e corrigidos)
1. **Escrita “fire-and-forget”**: `DB.cadastrarPaciente()` chamava `sbInsert(...)` **sem `await`**. O toast “✅ cadastrado” aparecia antes (e independentemente) do resultado do banco. Quem salva é o navegador; o Supabase era apenas “tentativa em segundo plano”.
2. **Guarda de FK que nunca funcionava**: a `Map` `insercoesPacientesPendentes` era **lida** em `sbInsert`, mas **nunca preenchida** em lugar nenhum (código morto). Assim, o `INSERT` da consulta podia chegar ao banco **antes** do paciente e falhar com `23503` (*foreign key violation*), mesmo quando o paciente era salvo.
3. **Sync apagava cadastro recém-feito**: `sincronizarDoSupabase()` baixa as 5 tabelas no carregamento e **substitui** o `localStorage` inteiro pelo resultado. Se você cadastrava um paciente enquanto o download acontecia (ou o insert tinha falhado), o paciente “desaparecia” da tela no instante em que o sync terminava.
4. **Dados demo contaminando o banco real**: `DB.seedDemo()` é chamado por todas as telas e gravava usuários/pacientes com ids fake (`'u1'`, `'p1'`) sempre que o `localStorage` estivesse vazio. Com Supabase configurado isso mascara falhas e mistura ids inválidos com UUIDs.

Bônus: no app do paciente, `login.html`, `index.html` e `perfil.html` consultavam o paciente **antes** do primeiro sync terminar — resultado: “Cadastro não encontrado” na primeira abertura, mesmo com o cadastro existindo no banco.

---

## 4. É problema do Supabase? Do GitHub?

| Suspeita | Veredito |
|:---|:---|
| **“Bug do Supabase”** | Não. O Supabase/PostgREST está corretamente recusando `INSERT` em tabela/coluna inexistente ou bloqueada por RLS. O erro real está no schema/políticas. |
| **“GitHub está perdendo os dados”** | Não. O GitHub guarda **código**. Ele não participa da gravação. O que acontece: o app salva no `localStorage` **do navegador** e o GitHub Pages serve arquivos estáticos — cada navegador/aba tem seu próprio `localStorage`. Se a gravação no Supabase falha, cada dispositivo vê apenas os dados locais dele. |
| **Credenciais** | Estão preenchidas em `shared/js/config.js` (URL e anon key do projeto `ofqyqorsedxveersqful`) e o `ref` do JWT bate com a URL. Se a chave tivesse sido rotacionada/revogada, o erro seria `401 / Invalid API key` — vale conferir no teste 1 de `status-banco.html`. |
| **Cache da PWA** | Pode servir uma versão antiga de `db.js`. O `service-worker.js` já foi atualizado para `vidaplus-paciente-v2`; no navegador faça *hard reload* (Ctrl+Shift+R) ou “Limpar dados do site”. |

---

## 5. Como confirmar em 2 minutos (o que fazer agora)

1. **Supabase → SQL Editor → cole `supabase/diagnostico.sql` → RUN.**
   - Seção 3 dá o veredito: `MODELO ANTIGO` (incompatível) ou `MODELO DO APP` (compatível).
   - Seção 6 mostra se o RLS está ligado e se existem políticas.
   - Seção 9 mostra a contagem real de pacientes.

2. **Abra `status-banco.html`** (na raiz do projeto, servido por HTTP).
   Agora ele tem dois testes novos:
   - **“Colunas esperadas em pacientes/consultas/usuarios/notificacoes”** → mostra exatamente qual coluna falta.
   - **“Cadastro de paciente (INSERT real + limpeza)”** → tenta o mesmo `INSERT` da recepção, mostra o **código do erro** (`22P02`, `42501`, `PGRST204`…) e remove a linha de teste.

3. **No navegador da recepção**, abra o console (F12) e cadastre um paciente. Você verá:
   `[Supabase insert] FALHOU em pacientes → <mensagem>` e um toast vermelho
   *“Salvo no navegador, mas não no Supabase (pacientes): …”*.

---

## 6. Correção: um único script resolve os dois cenários

O `supabase/schema.sql` foi reescrito como **instalador completo e idempotente**. Um único RUN resolve
os dois cenários (inclusive o modelo antigo), sem precisar decidir nada antes:

| Fase | O que faz |
|:---|:---|
| 0 | Detecta o modelo antigo e **renomeia** as tabelas para `*_legado` (nada é apagado) |
| 1 | Cria as 8 tabelas do app com os tipos exatos que o `db.js` envia |
| 2 | Repara colunas faltantes em bancos de versões anteriores |
| 3 | Garante PK/defaults e NOT NULL nos campos que o app sempre envia |
| 4 | Garante FKs e índices únicos (CPF, e-mail, chave de configuração) |
| 5 | Índices de performance (fila, CPF, notificações) |
| 6 | Liga RLS e recria as políticas permissivas do `anon` |
| 7 | Concede GRANTs a `anon`/`authenticated` |
| 8 | Publica as tabelas no Realtime |
| 9 | Recria a view `fila_espera` e a função `posicao_fila` |
| 10 | Insere os dados de exemplo (logins do README + 2 pacientes) |
| 11 | **Verificação final**: lista o que faltar + contagens + `NOTIFY pgrst` |

**Passo a passo**
1. Supabase → SQL Editor → cole **todo** o `supabase/schema.sql` → RUN.
2. A última consulta (11.1) deve voltar **vazia** — é a prova de que o schema está 100% compatível.
3. Abra `status-banco.html`: colunas, escrita e INSERT real devem ficar verdes.
4. Cadastre um paciente e confirme com `select count(*) from public.pacientes;`.

> Testado em PostgreSQL 16: (a) banco vazio, (b) segunda execução, (c) execução sobre o modelo
> antigo do SQL que você enviou — nos três casos o script roda sem erro e o `INSERT` do app passa.

Se você preferir um projeto novo e limpo (recomendado para a banca): crie o projeto, rode o
`schema.sql` e troque `SUPABASE_URL`/`SUPABASE_ANON_KEY` em `shared/js/config.js` (são chaves públicas).

### Migrar os pacientes do modelo antigo (opcional)
Depois de rodar o `schema.sql`, se quiser trazer os pacientes antigos de `*_legado`:
   ```sql
   INSERT INTO public.pacientes (cpf, nome, nascimento, telefone, sexo)
   SELECT regexp_replace(p.cpf, '\D', '', 'g'),
          u.nome,
          p.data_nascimento,
          p.telefone,
          CASE WHEN p.sexo IN ('M','F','O') THEN p.sexo ELSE NULL END
   FROM public.pacientes_legado p
   JOIN public.usuarios_legado u ON u.id_usuario = p.id_usuario
   ON CONFLICT (cpf) DO NOTHING;
   ```
   (descomente/ajuste conforme as colunas reais que o diagnóstico mostrar).

> ⚠️ A versão **antiga** do `schema.sql` não resolvia esse caso: `CREATE TABLE IF NOT EXISTS` era
> ignorado e os `ALTER TABLE` só acrescentavam colunas, deixando `id_paciente`/`id_usuario` NOT NULL.
> Por isso a FASE 0 (renomear para `*_legado`) foi incluída no instalador.

---

## 7. Dicionário rápido dos erros que você vai ver

| Código | Mensagem típica | Causa | Correção |
|:---|:---|:---|:---|
| `PGRST205` / `42P01` | `Could not find the table 'public.pacientes' in the schema cache` | tabela não existe | rodar `schema.sql` |
| `PGRST204` / `42703` | `Could not find the 'nome' column … / column "nome" does not exist` | schema antigo ou coluna faltando | cenário B |
| `22P02` | `invalid input syntax for type bigint: "3f2a…"` | app manda UUID, coluna é BIGINT | cenário B |
| `23502` | `null value in column "id_usuario" violates not-null constraint` | coluna obrigatória do modelo antigo | cenário B |
| `23514` | `new row violates check constraint` | `perfil` × `tipo_usuario`, `sexo` etc. | cenário B / `schema.sql` |
| `23503` | `insert or update violates foreign key constraint` | consulta inserida antes do paciente | corrigido no `db.js` |
| `42501` | `new row violates row-level security policy` | RLS sem política para `anon` | rodar `schema.sql` |
| `401` | `Invalid API key` / `JWT expired` | chave revogada/rotacionada | atualizar `config.js` |
| `23505` | `duplicate key value violates unique constraint` | CPF/e-mail repetido | já tratado por CPF; e-mail precisa ser único ou `NULL` |

---

## 8. O que mudou neste branch

| Arquivo | Mudança |
|:---|:---|
| `shared/js/db.js` | `sbInsertDependente()`: o `INSERT` de `consultas` agora **espera** o resultado do `INSERT` do paciente (corrige a corrida de FK `23503`); a `Map` de pendências passou a ser realmente preenchida. `cadastrarPaciente`/`atualizarPaciente` usam **upsert** (um `UPDATE` em paciente que nunca chegou ao banco afetava 0 linhas e “sumia” silenciosamente). Sync com Supabase não **sobrescreve** mais gravações feitas durante o download (merge por `id`). `seedDemo()` não semeia dados fake quando há Supabase configurado. Nova API `DB.aguardarSincronizacao()` (com teto de 8s). Sync com `.limit(5000)`. |
| `paciente-app/login.html`, `perfil.html`, `index.html` e `sistema-medico/login/*.html` | Esperam `DB.aguardarSincronizacao()` antes de decidir “cadastro/usuário não encontrado”. |
| `paciente-app/service-worker.js` | `CACHE_VERSION` → `vidaplus-paciente-v2` (força atualização do `db.js` em cache). |
| `status-banco.html` | Novos testes: colunas esperadas por tabela, INSERT real em `pacientes` com limpeza e leitura do código de erro; resumo específico “Schema do banco diferente do app”. |
| `supabase/diagnostico.sql` | **Novo.** Script somente-leitura que responde: qual modelo está instalado, colunas, NOT NULL/FK, RLS, políticas, grants do `anon`, Realtime e contagens. |
| `supabase/schema.sql` | **Reescrito** como instalador único em 11 fases (migração do modelo antigo, tabelas, reparo de colunas, PK/FK/índices, RLS, GRANTs, Realtime, view/função, seeds e verificação final). Validado em PostgreSQL 16 nos três cenários. |

### Observação de segurança (para a banca)
O desenho atual guarda `senha_hash` em **texto puro** e usa políticas RLS `USING (TRUE)` com a anon key exposta no front. Isso é aceitável para demonstração/TCC, mas deve ser citado como limitação: em produção usaríamos **Supabase Auth**, `bcrypt`/`pgcrypto` e políticas por perfil. Sugestão de texto para o capítulo de trabalhos futuros.

---

## 9. Próximo passo (TL;DR)

1. Supabase → SQL Editor → cole **`supabase/schema.sql`** inteiro → RUN.
2. Confirme que a verificação final (FASE 11.1) voltou **vazia**.
3. Abra **`status-banco.html`** e veja tudo verde (colunas + INSERT real).
4. Cadastre um paciente e confirme com `select count(*) from public.pacientes;`.

Se algo ainda falhar, rode **`supabase/diagnostico.sql`** e o código de erro aparecerá na seção 7.
