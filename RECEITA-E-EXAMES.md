# 💊🧪 Receita Médica e Solicitar Exame — área do médico

Implementação das seções 2.1 (Solicitar Exame) e 2.2 (Receita Médica) da
`ESPECIFICACAO-TRIAGEM-MEDICA.md`.

---

## 1. O que você precisa fazer no banco (Supabase)

| Situação | O que rodar no **SQL Editor** |
|:---|:---|
| Banco **já instalado** (você já rodou o `schema.sql` antes) | `supabase/migrations/20261025_receitas_exames.sql` |
| Instalação **nova** (projeto vazio) | só o `supabase/schema.sql` (já inclui tudo) |
| O `schema.sql` deu erro | `supabase/minimo.sql` (versão mínima, também inclui as tabelas novas) |

Passo a passo (banco já instalado):

1. Supabase → **SQL Editor** → **New query**
2. Cole **todo** o conteúdo de `supabase/migrations/20261025_receitas_exames.sql` → **Run**
3. O resultado final deve mostrar duas linhas com **✅ OK** (`exames_solicitados` e `receitas`)
4. Confira pelo navegador em **`status-banco.html`** (testes "Tabela receitas/exames_solicitados")
   ou rode `supabase/diagnostico.sql` (seção 10)

O script é **idempotente** (pode rodar de novo sem problema) e **não altera nem apaga** nada das
tabelas existentes. Ele também **copia para as tabelas novas** as receitas e os exames que tenham
sido emitidos antes da migração. Esses itens ficam guardados dentro da consulta, como explicado
a seguir.

> Sem a migração o sistema continua funcionando: as receitas e os exames ficam gravados na
> própria consulta (`consultas.receita` / `consultas.exames`), mas aparece um aviso
> "Não foi possível salvar em receitas…" e não há o registro formal nem o tempo real dessas tabelas.

### O que a migração cria

**`public.receitas`**: uma linha por receita emitida (documento).

| Coluna | Tipo | Descrição |
|:---|:---|:---|
| `id` | UUID (PK) | gerado pelo app |
| `consulta_id` | UUID (FK → consultas) | consulta em que foi emitida |
| `paciente_id` | UUID (FK → pacientes) | paciente |
| `cpf` | VARCHAR(11) | CPF do paciente (consultas do app do paciente) |
| `numero` | VARCHAR(30), único | ex.: `RX-20261025-7KQ2M` |
| `tipo` | VARCHAR(20) | `simples` · `antimicrobiano` · `controle_especial` |
| `vias` | SMALLINT | 1 (simples) ou 2 (antimicrobiano / controle especial) |
| `itens` | JSONB | `[{ nome, classe, dosagem, via, frequencia, duracao, quantidade, obs }]` |
| `orientacoes` | TEXT | orientações gerais ao paciente |
| `validade_dias` / `valida_ate` | SMALLINT / DATE | validade da receita |
| `alertas` | JSONB | alertas de alergia **confirmados** pelo médico (quem confirmou e quando) |
| `medico_nome` / `medico_crm` | VARCHAR | prescritor |
| `unidade` | VARCHAR(80) | unidade de saúde |
| `emitida_em` / `criado_em` | TIMESTAMPTZ | datas |

**`public.exames_solicitados`**: uma linha por exame pedido.

| Coluna | Tipo | Descrição |
|:---|:---|:---|
| `id` | UUID (PK) | gerado pelo app |
| `consulta_id` / `paciente_id` / `cpf` | | vínculo com a consulta e o paciente |
| `pedido` | VARCHAR(30) | nº da guia, que agrupa os exames pedidos juntos (`EX-20261025-AB3CD`) |
| `nome` | VARCHAR(160) | ex.: Hemograma completo |
| `categoria` | VARCHAR(20) | `laboratorial` · `imagem` · `cardiologico` · `teste_rapido` · `outros` |
| `prioridade` | VARCHAR(10) | `rotina` · `urgente` |
| `indicacao` / `cid10` | TEXT / VARCHAR(10) | justificativa clínica |
| `orientacao` | TEXT | preparo (ex.: jejum de 8 horas) |
| `local_realizacao` | VARCHAR(160) | laboratório, setor ou serviço de referência (encaminhamento) |
| `status` | VARCHAR(25) | `solicitado` → `realizado` → `resultado_disponivel` (ou `cancelado`) |
| `resultado`, `realizado_em`, `resultado_em` | | resultado e datas |
| `cancelado_em`, `motivo_cancelamento` | | cancelamento (o exame nunca é apagado) |
| `atualizado_por`, `atualizado_em` | | auditoria (`atualizado_em` mantido por gatilho) |
| `medico_nome`, `medico_crm`, `unidade`, `solicitado_em` | | solicitante e data |

### Regras garantidas pelo próprio banco

- Receita **simples = 1 via**; **antimicrobiano e controle especial = 2 vias**
- Validade: **antimicrobiano = 10 dias** (RDC Anvisa nº 471/2021), **controle especial = 30 dias**
  (Portaria SVS/MS nº 344/1998); simples de 1 a 365 dias (ou sem prazo)
- Controle especial com **no máximo 3 itens** (Portaria 344/98, lista C1)
- Receita com pelo menos 1 item e número único
- Exame com status `resultado_disponivel` **exige o resultado**; `cancelado` **exige o motivo**
- Chaves estrangeiras para `consultas` e `pacientes` (ON DELETE CASCADE, como as demais tabelas)
- Permissões do app (papel `anon`):
  - `receitas`: **ler e incluir**. Receita emitida é documento e não pode ser alterada nem apagada.
  - `exames_solicitados`: **ler, incluir e atualizar**. Não pode ser apagado; para desfazer, use "cancelado".
- Índice da lista de exames pendentes, Realtime habilitado e `NOTIFY pgrst` (sem erro PGRST205)

> ⚠️ Assim como o resto do `schema.sql`, as políticas são permissivas para o `anon` (TCC/demo).
> Em produção, use Supabase Auth e políticas por perfil.

---

## 2. Como funciona na tela do médico

### Receita Médica (no atendimento)
- Linhas dinâmicas com **medicamento, dose, via, frequência, duração, quantidade e observações**,
  com autocompletar (catálogo da UBS + estoque da tabela `medicamentos`, quando houver Supabase).
- **Classificação automática** de cada medicamento (o médico pode ajustar):
  comum, antimicrobiano ou controle especial (lista C1).
- Ao finalizar, os itens são **separados automaticamente em receitas por tipo**:
  - **Simples**: 1 via; validade definida pelo médico (padrão de 30 dias)
  - **Antimicrobiano**: 2 vias (a 2ª via fica retida na farmácia); válida por 10 dias; quantidade obrigatória
  - **Controle especial**: 2 vias (a 1ª via fica retida); válida por 30 dias; até 3 itens por receita;
    quantidade impressa **por extenso** e quadros de identificação do comprador e do fornecedor
- **Alerta de alergia** em tempo real (mesmo princípio ativo e reatividade cruzada: penicilinas,
  cefalosporinas, sulfas, AINEs, macrolídeos, quinolonas…). Para finalizar com alerta, o médico
  precisa confirmar, e a decisão fica registrada na receita (`alertas`).
- Substâncias das listas **A/B** (ex.: diazepam, clonazepam, morfina) são bloqueadas, porque exigem
  Notificação de Receita (talonário oficial), que o sistema não emite.
- **Pré-visualizar receita** (com marca d'água "PRÉ-VISUALIZAÇÃO"). O documento oficial, com número,
  é gerado ao finalizar.

### Solicitar Exame (botão no atendimento)
- Modal com **exames frequentes** (um clique), catálogo com **categoria, preparo e local** preenchidos
  automaticamente, **prioridade** (rotina/urgente), **local de realização / encaminhamento** e
  **indicação clínica** (vem do diagnóstico ou da queixa da triagem; o CID entra automaticamente).
- Lista dos exames do atendimento e **pré-visualização da guia**.

### Ao finalizar a consulta
1. Grava as receitas (`receitas`) e os exames (`exames_solicitados`, status `solicitado`).
2. Grava a "foto" na consulta (`consultas.receita` / `consultas.exames`), que é o que o app do paciente lê.
3. Abre **"Consulta finalizada — documentos"** com **Imprimir** para cada receita (as 2 vias saem em
   páginas separadas), para a solicitação de exames e **Imprimir tudo**.

### Páginas do menu
- **Receitas**: todas as receitas emitidas, com resumo (hoje, total, antimicrobianos, controle
  especial), busca por paciente, CPF, medicamento ou número, filtro por tipo, validade
  (válida/vencida) e **Reimprimir**.
- **Solicitar Exames**: lista de trabalho com os pendentes primeiro (urgentes no topo), filtros e
  **Atualizar status**:
  `solicitado → realizado → resultado disponível` (exige o resultado) ou `cancelado` (exige o motivo).
  Ao lançar o resultado ou cancelar, o **paciente é notificado no app** (tipo `resultado` ou `aviso`).
  Também permite reimprimir o pedido.

### App do paciente
- **Relatório da consulta**: medicamentos agrupados por receita (nº, tipo, validade) e exames com o
  status atualizado (resultado, cancelado, urgente, local, preparo).
- **Exames**: status "Cancelado", prioridade e local.
- O relatório e o histórico foram corrigidos para mostrar **somente as consultas do próprio CPF** e
  para ler os campos que o sistema médico realmente grava. Antes, o relatório sempre mostrava
  "Nada por aqui" e o histórico listava as consultas de todos os pacientes.

---

## 3. Arquivos alterados / criados

| Arquivo | O que mudou |
|:---|:---|
| `supabase/migrations/20261025_receitas_exames.sql` | **novo**: migração para banco já instalado |
| `supabase/schema.sql` | tabelas novas nas fases 1–8, recuperação (10.1) e verificação (11) |
| `supabase/minimo.sql` | tabelas novas + RLS + permissões |
| `supabase/diagnostico.sql` | seção 10 (receitas/exames) |
| `status-banco.html` | teste das tabelas novas e aviso de migração pendente |
| `shared/js/db.js` (+ cópia `paciente-app/js/db.js`) | tabelas novas no mapa/sincronização/realtime; `registrarReceitas`, `registrarExames`, `atualizarExame`, `getTodasReceitas`, `getTodosExames` |
| `sistema-medico/js/prescricoes.js` | **novo**: regras (catálogos, classificação, alergia, separação, documentos impressos) |
| `sistema-medico/js/medico-prescricoes.js` | **novo**: telas da receita, do modal de exames e das páginas Receitas/Solicitar Exames |
| `sistema-medico/medico/index.html` | seções Receita/Exames, botão "Solicitar Exame", páginas, modais |
| `paciente-app/consulta.html`, `historico.html`, `exames.html`, `css/app.css` | exibição de receitas/exames (ver acima) |
| `paciente-app/service-worker.js` | `CACHE_VERSION` → `v7` (o app baixa as telas novas) |

---

## 4. Roteiro rápido de teste

1. Recepção: cadastre/inicie o atendimento de um paciente com alergia (ex.: Maria, alérgica a Dipirona).
2. Enfermagem: faça a triagem.
3. Médico → Consultas: selecione o paciente, preencha o diagnóstico e o CID.
4. Receita: digite "Dipirona" e veja o alerta de alergia. Depois troque por Amoxicilina
   (antimicrobiano), adicione Paracetamol (comum) e Fluoxetina (controle especial) e clique em
   **Pré-visualizar receita**: são 3 receitas, 5 páginas.
5. **Solicitar Exame**: clique em Hemograma e Glicemia e adicione um Raio-X como urgente.
6. **FINALIZAR CONSULTA**: imprima os documentos no modal.
7. **Solicitar Exames** (menu): marque o Hemograma como "Resultado disponível" e informe o resultado.
8. App do paciente: veja a notificação, o relatório da consulta e a tela Exames.
9. **Receitas** (menu): busque pelo nome do paciente e use **Reimprimir**.
