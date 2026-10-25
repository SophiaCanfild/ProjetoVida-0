# Especificação — Sistema de Triagem Médica Profissional (Vida+ / ProjetoVida-0)

**Base:** este documento é baseado no sistema já interligado neste repositório:

- Módulos existentes: **Recepção**, **Enfermagem (Triagem)**, **Médico**, **Telão**, **App do Paciente** e banco **Supabase compartilhado** (`supabase/schema.sql` + `shared/js/db.js`).
- Fluxo atual: recepção inicia atendimento (gera senha) → enfermeiro realiza a triagem de Manchester → paciente entra na **fila do médico** (ordenada por risco) → médico chama, atende, preenche prontuário, emite **Receita Médica** e **Solicita Exame** → finaliza a consulta → notifica o paciente no app e no telão.
- Modelo de dados relevante: `consultas.triagem` (JSONB), `consultas.receita` (JSONB `[]`), `consultas.exames` (JSONB `[]`), `consultas.status` (`em_fila`, `chamado`, `em_consulta`, `finalizado`, `cancelado`), `consultas.tipo_chamada` (`triagem` / `consulta`).

---

## 1. Opções do módulo de Triagem (enfermagem — área de acesso da triagem)

A triagem profissional deve oferecer, no mínimo:

| Opção / Campo | Descrição |
|---|---|
| **Seleção/chamada do paciente** | Lista de pacientes aguardando triagem (vindos da recepção) com busca por nome, CPF e Cartão SUS; botão "Chamar" que envia ao telão e notifica o app. |
| **Confirmação/cadastro rápido do paciente** | Nome, CPF, Cartão SUS, nascimento, sexo, telefone, endereço, unidade de atendimento. |
| **Alergias e condições de risco** | Lista de alergias (medicamentos, alimentos, outras), doenças crônicas, medicamentos em uso, gestante, tabagista, deficiência, responsável (para menores). |
| **Sinais vitais** | Pressão arterial (mmHg), temperatura (°C), pulso (bpm), saturação O₂ (%), peso (kg), altura (cm). Opcional: glicemia e frequência respiratória. |
| **Queixa principal e sintomas** | Campo obrigatório de queixa principal; sintomas associados (seleção múltipla); tempo de início dos sintomas; intensidade da dor (escala 0–10). |
| **Classificação de Risco de Manchester** | 5 níveis com cores e tempo máximo de espera: <br>1 **Vermelho** — Emergência (atendimento imediato) <br>2 **Laranja** — Muito urgente (até 10 min) <br>3 **Amarelo** — Urgente (até 60 min) <br>4 **Verde** — Pouco urgente (até 120 min) <br>5 **Azul** — Não urgente (até 240 min) |
| **Observações de enfermagem** | Campo livre para observações clínicas da triagem. |
| **Identificação do enfermeiro(a)** | Nome e COREN do profissional que realizou a triagem (fica gravado no JSONB de triagem). |
| **Status do atendimento** | `aguardando triagem` → `triado` → `em_fila para consulta` (o paciente só aparece para o médico após a triagem). |
| **Histórico de triagens** | Lista de triagens realizadas com data/hora, paciente, queixa, classificação de risco e enfermeiro. |
| **Integração em tempo real** | Ao finalizar a triagem, notifica o módulo do médico (`triagem_realizada`), atualiza o telão e o app do paciente. |

---

## 2. Integração com a área de acesso do Médico

Na interface do médico (já existente em `sistema-medico/medico/index.html`), o atendimento abre após o médico selecionar um paciente da **fila de espera** (somente pacientes já triados). Dentro do atendimento, as duas opções obrigatórias são:

### 2.1 Solicitar Exame
Cada solicitação deve conter:

- Nome do exame (ex.: Hemograma completo, Glicemia de jejum, Raio-X tórax, ECG, Ultrassom, Teste rápido COVID-19).
- Tipo/categoria (laboratorial, imagem, cardiológico, outros).
- Status do exame: `solicitado` → `realizado` → `resultado_disponível` → `cancelado`.
- Resultado (quando disponível) e orientação de preparo (ex.: "Jejum de 8h").
- Data/hora da solicitação e setor/laboratório destino.
- Encaminhamento (se for para outra unidade/especialidade).
- Exibição no prontuário da consulta e no app do paciente ("Meus exames").
- Integração com notificação: quando o resultado ficar disponível, notificar o paciente.

### 2.2 Receita Médica
Cada receita deve conter:

- Nome do medicamento, dosagem, frequência (ex.: 6/6h), duração (dias), quantidade de comprimidos/frascos.
- Via de administração e observações (ex.: "após as refeições").
- Número de vias: via simples, via de retenção e via do paciente (conforme regulamento local/CRM).
- Dados do prescritor: nome do médico e CRM (assinatura digital do responsável).
- Data de emissão e validade da receita.
- **Validação de segurança:** alerta automático se o medicamento constar nas alergias do paciente (cadastro na triagem/prontuário).
- Listagem de receitas emitidas na consulta, com opção de adicionar vários medicamentos (linhas dinâmicas) e reimpressão da receita.
- Exibição no app do paciente ("Minhas receitas").

---

## 3. Outras opções recomendadas da interface do Médico

Além das duas opções acima, a área do médico deve ter:

- **Prontuário Eletrônico:** CID-10, diagnóstico, HDA (Histórico da Doença Atual), exame físico, conduta e orientações ao paciente.
- **Atestado médico:** emissão e reimpressão vinculado à consulta finalizada.
- **Finalizar Consulta:** fecha o atendimento, define status `finalizado`, grava receita e exames, e dispara notificação no app do paciente ("Consulta finalizada — relatório disponível").
- **Fila de espera do médico:** lista pacientes triados, ordenados por classificação de risco e hora de chegada, com cores de risco (Manchester) e botão "Chamar" (telão + app).
- **Prontuário / Histórico do paciente:** consultas anteriores com diagnósticos, receitas e exames já realizados.
- **Busca de pacientes:** por nome, CPF ou Cartão SUS.
- **Perfil do médico logado:** nome, CRM, especialidade, consultório/guichê.

---

## 4. Fluxo interligado passo a passo (com base no sistema aqui)

1. **Recepção** cadastra/confirma o paciente e inicia o atendimento → gera senha e notifica o app (`atendimento_iniciado`).
2. **Enfermagem** chama o paciente para triagem (telão + app), coleta sinais vitais, queixa, alergias e define a classificação de Manchester → `realizarTriagem()` grava em `consultas.triagem` e libera o paciente na fila do médico.
3. **Médico** visualiza a fila ordenada por risco, chama o paciente para o consultório → `iniciarConsulta()`.
4. **Médico** preenche o prontuário (CID-10, diagnóstico, conduta...) e usa as duas opções:
   - clica em **Solicitar Exame** → preenche exame, status e orientação → grava em `consultas.exames`;
   - clica em **Receita Médica** → adiciona medicamento/dosagem/frequência, valida alergias, informa CRM → grava em `consultas.receita`.
5. **Médico** clica em **Finalizar Consulta** → status `finalizado`, notifica o app do paciente e atualiza o telão.

---

## 5. Mapeamento com o banco existente (schema.sql / shared/js/db.js)

| Conceito | Campo no banco | Tipo | Observação |
|---|---|---|---|
| Triagem completa | `consultas.triagem` | JSONB | queixa_principal, pressao, temperatura, pulso, saturacao, peso, altura, classificacao_risco, enfermeiro, observacoes, sintomas, dor |
| Diagnóstico | `consultas.diagnostico` | TEXT | preenchido pelo médico |
| CID-10 | `consultas.cid10` | VARCHAR(10) | preenchido pelo médico |
| Receita | `consultas.receita` | JSONB `[]` | [{ nome, dosagem, frequencia, duracao, obs }] |
| Exames | `consultas.exames` | JSONB `[]` | [{ nome, status, resultado, orientacao }] |
| Médico responsável | `consultas.medico_nome`, `consultas.medico_crm` | VARCHAR | CRM do prescritor na receita |
| Status do atendimento | `consultas.status` | VARCHAR | em_fila / chamado / em_consulta / finalizado / cancelado |
| Tipo de chamada | `consultas.tipo_chamada` | VARCHAR | triagem ou consulta |
| Notificações | tabela `notificacoes` | — | atendimento iniciado, triagem realizada, chamada, consulta finalizada |

---

## 6. Requisitos profissionais (não funcionais)

- **Acesso por perfil:** login por CPF + senha com perfis (`recepcionista`, `enfermeiro`, `medico`, `administrador`); o médico só acessa sua própria área de atendimento.
- **Auditoria:** quem realizou a triagem, quem assinou a receita, quem solicitou o exame e em que horário (campos `criado_em`, `finalizado_em`, `enfermeiro`, `medico_nome/medico_crm`).
- **Cores de risco:** use o padrão Manchester na fila do médico e no telão (vermelho/laranja/amarelo/verde/azul).
- **LGPD:** campos sensíveis (saúde) protegidos; no modo demo do TCC as políticas RLS são permissivas — em produção usar Supabase Auth + senhas com hash e políticas por perfil.
- **Tempo real:** Realtime do Supabase + `localStorage` para atualizar fila, telão e app sem recarregar a página.
- **Offline:** gravação imediata no `localStorage` com sincronização ao restabelecer a conexão (mesmo padrão já usado em `shared/js/db.js`).

---

> **Onde implementar:** no repositório, as telas a serem desenvolvidas/aperfeiçoadas são `sistema-medico/enfermeiro/index.html` (triagem) e as páginas `receitas` e `exames` de `sistema-medico/medico/index.html` (atualmente placeholders), consumindo as mesmas funções `DB.realizarTriagem`, `DB.finalizarConsulta`, `DB.chamarPaciente` e o schema de `supabase/schema.sql`.