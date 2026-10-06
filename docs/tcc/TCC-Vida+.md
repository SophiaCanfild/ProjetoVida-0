<!-- ============================================================================
     VIDA+ — DOCUMENTO DO TCC (fonte do arquivo .docx)
     ----------------------------------------------------------------------------
     Este arquivo é a FONTE do documento. Para gerar o .docx já formatado
     conforme as normas ABNT, rode na raiz do projeto:

         python3 docs/tcc/gerar-docx.py

     REGRAS DESTA FONTE
       • Tudo que estiver entre <!-- e --> é orientação e NÃO entra no .docx.
       • [[ ... ]] marca PENDÊNCIA: sai em vermelho itálico no .docx, para você
         localizar rapidamente o que falta escrever. Substitua o texto e apague
         os colchetes.
       • "# 1 INTRODUÇÃO" = seção primária (começa em nova página)
         "## 1.2 OBJETIVOS" = seção secundária; "### 1.2.1 ..." = terciária.
       • "> texto" = citação direta com mais de três linhas (recuo 4 cm, fonte 10).
       • Etiquetas de posicionamento: [c] centralizado, [cb] centralizado negrito,
         [r] direita, [rb] direita negrito, [n] natureza/dedicatória/epígrafe,
         [s] sem recuo de primeira linha, [l] item de lista com pontilhado,
         [e] linha em branco, [c14] centralizado com fonte 14.
       • Normas seguidas: NBR 14724:2024 (apresentação), 6024 (numeração),
         6027 (sumário), 6028:2021 (resumo), 10520:2023 (citações) e 6023 (referências).
     ============================================================================ -->


<!-- ============================================================
     PARTE EXTERNA — CAPA (elemento obrigatório)
     Informações na ordem: instituição (opcional), autor, título,
     subtítulo, cidade e ano de depósito (NBR 14724:2024, 4.1.1).
     ============================================================ -->

# CAPA

[c14] [[NOME DA INSTITUIÇÃO DE ENSINO]]
[e]
[cb] [[NOME COMPLETO DO AUTOR]]
[e]
[e]
[e]
[e]
[cb14] VIDA+: SISTEMA DE SAÚDE DIGITAL INTEGRADO PARA A ATENÇÃO PRIMÁRIA
[e]
[c] [[subtítulo, se houver — deve vir precedido de dois-pontos]]
[e]
[e]
[e]
[e]
[e]
[e]
[c] Curitiba
[c] 2026


<!-- ============================================================
     ELEMENTOS PRÉ-TEXTUAIS
     Contados a partir da folha de rosto, mas NÃO numerados
     (NBR 14724:2024, 5.3). A numeração começa na Introdução.
     ============================================================ -->

# FOLHA DE ROSTO

[cb] [[NOME COMPLETO DO AUTOR]]
[e]
[e]
[e]
[e]
[cb14] VIDA+: SISTEMA DE SAÚDE DIGITAL INTEGRADO PARA A ATENÇÃO PRIMÁRIA
[e]
[e]
[e]
[e]
[n] Trabalho de Conclusão de Curso apresentado ao curso de [[nome do curso]] da [[nome da instituição]], como requisito parcial para obtenção do título de [[título pretendido]].
[e]
[n] Área de concentração: [[área]]
[e]
[n] Orientador(a): [[Prof. Dr. Nome do orientador]]
[e]
[n] Coorientador(a): [[Prof. Dr. Nome do coorientador, se houver]]
[e]
[e]
[e]
[e]
[e]
[c] Curitiba
[c] 2026


# FOLHA DE APROVAÇÃO

[cb] [[NOME COMPLETO DO AUTOR]]
[e]
[e]
[cb14] VIDA+: SISTEMA DE SAÚDE DIGITAL INTEGRADO PARA A ATENÇÃO PRIMÁRIA
[e]
[e]
[n] Trabalho de Conclusão de Curso apresentado ao curso de [[nome do curso]] da [[nome da instituição]], como requisito parcial para obtenção do título de [[título pretendido]], aprovado pela banca examinadora composta pelos professores abaixo assinados.
[e]
[e]
[c] Aprovado em: [[dia]] / [[mês]] / [[ano]].
[e]
[e]
[c] _______________________________________________
[c] [[Prof. Dr. Nome]] — Orientador(a)
[c] [[Nome da instituição]]
[e]
[c] _______________________________________________
[c] [[Prof. Dr. Nome]] — Examinador(a)
[c] [[Nome da instituição]]
[e]
[c] _______________________________________________
[c] [[Prof. Dr. Nome]] — Examinador(a)
[c] [[Nome da instituição]]


# DEDICATÓRIA

[e]
[e]
[e]
[e]
[e]
[e]
[e]
[e]
[e]
[e]
[e]
[e]
[n] [[Dedico este trabalho a ... — texto curto, com alinhamento do meio da mancha gráfica até a margem direita, na parte inferior da página.]]


# AGRADECIMENTOS

[[Agradeço à minha família, aos professores e aos colegas que contribuíram para a realização deste trabalho. — escreva em texto corrido, sem títulos internos.]]


# EPÍGRAFE

[e]
[e]
[e]
[e]
[e]
[e]
[e]
[e]
[e]
[e]
[e]
[e]
[n] [["Frase de autoria conhecida relacionada ao tema do trabalho."]]
[e]
[n] ([[Sobrenome]], [[ano]], p. [[página]])


# RESUMO

<!-- NBR 6028:2021 — 150 a 500 palavras, parágrafo único, sem recuo,
     verbo na terceira pessoa, contendo objetivo, método, resultados e conclusão. -->

[s] [[Escreva aqui o resumo em parágrafo único, de 150 a 500 palavras: apresente o tema, o objetivo geral, a metodologia adotada (pesquisa aplicada com desenvolvimento de um sistema web e PWA), os resultados obtidos com o sistema Vida+ e a conclusão. Não use listas, tópicos nem citações.]]

[s] **Palavras-chave:** saúde digital; sistema de informação em saúde; prontuário eletrônico; aplicativo móvel; SUS.


# ABSTRACT

[s] [[Write here the English version of the abstract, in a single paragraph of 150 to 500 words.]]

[s] **Keywords:** digital health; health information system; electronic health record; mobile application; public health system.


# LISTA DE ILUSTRAÇÕES

<!-- Elemento opcional. Cada item: palavra designativa, travessão, título e
     página (NBR 14724:2024, 4.2.1.9). Apague esta lista se não houver. -->

[l] Quadro 1 – Etapas do desenvolvimento do sistema | [[página]]
[l] Quadro 2 – Módulos que compõem o sistema Vida+ | [[página]]
[l] Quadro 3 – Fluxo de atendimento do paciente no sistema | [[página]]
[l] Figura 1 – Tela inicial do aplicativo do paciente | [[página]]


# LISTA DE TABELAS

[l] Tabela 1 – Tecnologias utilizadas no desenvolvimento | [[página]]
[l] Tabela 2 – Tabelas do banco de dados e suas finalidades | [[página]]
[l] Tabela 3 – Perfis de acesso e permissões | [[página]]


# LISTA DE ABREVIATURAS E SIGLAS

<!-- Elemento opcional. Relação alfabética das siglas seguidas do
     significado por extenso (NBR 14724:2024, 4.2.1.11). -->

[l] ABNT | Associação Brasileira de Normas Técnicas
[l] API | *Application Programming Interface*
[l] CRUD | *Create, Read, Update, Delete*
[l] CSS | *Cascading Style Sheets*
[l] HTML | *HyperText Markup Language*
[l] IBGE | Instituto Brasileiro de Geografia e Estatística
[l] JSON | *JavaScript Object Notation*
[l] LGPD | Lei Geral de Proteção de Dados Pessoais
[l] PWA | *Progressive Web Application*
[l] RLS | *Row Level Security*
[l] SQL | *Structured Query Language*
[l] SUS | Sistema Único de Saúde
[l] TCC | Trabalho de Conclusão de Curso
[l] UBS | Unidade Básica de Saúde
[l] UPA | Unidade de Pronto Atendimento
[l] UUID | *Universally Unique Identifier*


# SUMÁRIO

<!-- Elemento obrigatório (NBR 6027:2012). O sumário abaixo é um CAMPO
     automático do Word: depois de escrever o conteúdo, atualize-o
     (Word: Ctrl+A e F9 | Google Docs: clique no sumário > atualizar). -->

<!-- SUMARIO -->

[s] [[ATUALIZE ESTE SUMÁRIO depois de escrever o conteúdo: no Word, pressione Ctrl+A e depois F9 (ou clique com o botão direito sobre o sumário e escolha "Atualizar campo"); no Google Docs, clique no sumário e use o botão de atualizar. Depois, apague este aviso.]]


<!-- ============================================================
     ELEMENTOS TEXTUAIS — iniciados pela Introdução
     A partir daqui a paginação aparece no canto superior direito,
     a 2 cm da borda superior (NBR 14724:2024, 5.3).
     ============================================================ -->

# 1 INTRODUÇÃO

[[Escreva de 1 a 2 páginas de introdução: apresente o tema (saúde digital e organização do atendimento na atenção primária), o problema identificado (filas, chamadas por voz, fichas em papel e falta de informação ao paciente), a proposta do trabalho (o sistema Vida+) e a justificativa. Termine anunciando os objetivos e a organização do trabalho. Use citações no sistema autor-data da NBR 10520:2023.]]

## 1.1 CONTEXTUALIZAÇÃO

[[Contextualize a transformação digital na saúde no Brasil: a Estratégia de Saúde Digital para o Brasil 2020–2028 do Ministério da Saúde, o uso de prontuário eletrônico na atenção primária e os desafios de informatização das unidades. Aqui é o lugar de citações diretas e indiretas.]]

<!-- Exemplo de citação direta com mais de três linhas, sem aspas, recuo de 4 cm,
     fonte 10 e espaçamento simples — formatação já aplicada pelo gerador: -->

> [[Cole aqui a citação direta com mais de três linhas, exatamente como está na obra consultada. Ela aparece sem aspas, com recuo de 4 cm da margem esquerda, fonte tamanho 10 e espaçamento simples, conforme a NBR 10520:2023.]]
> ([[Sobrenome]], [[ano]], p. [[página]])

[[Continue o texto retomando a citação acima.]]

## 1.2 OBJETIVOS

<!-- Estrutura idêntica à do modelo de TCC adotado: objetivo geral e
     objetivos específicos em alíneas (NBR 6024:2012). -->

### 1.2.1 Objetivo geral

Desenvolver um sistema de saúde digital integrado, denominado Vida+, capaz de acompanhar o atendimento do paciente na atenção primária desde a recepção até a entrega do resultado da consulta, integrando recepção, triagem, atendimento médico, sala de espera e o próprio paciente por meio de um banco de dados único e em tempo real.

### 1.2.2 Objetivos específicos

a) [[analisar os processos de recepção, triagem e atendimento médico de uma unidade de saúde;]]

b) modelar um banco de dados relacional que centralize pacientes, usuários, unidades de saúde, consultas, agendamentos, notificações, medicamentos e configurações;

c) desenvolver os painéis de uso da equipe de saúde para administrador, médico, enfermeiro e recepcionista;

d) desenvolver um aplicativo instalável (PWA) para o paciente acompanhar a fila, o histórico, os exames e os agendamentos;

e) desenvolver o painel de chamada para o telão da sala de espera, integrado em tempo real à fila de atendimento;

f) [[validar o sistema por meio de testes funcionais e de uma demonstração assistida com usuários.]]

## 1.3 JUSTIFICATIVA

[[Explique a relevância social e acadêmica do trabalho: impacto das filas e da comunicação precária na sala de espera, direito à informação do usuário do SUS, custo de sistemas proprietários para municípios de pequeno porte e a viabilidade de uma solução web gratuita e instalável.]]

## 1.4 ORGANIZAÇÃO DO TRABALHO

Este trabalho está organizado em seis seções. A seção 1 apresenta a contextualização, os objetivos e a justificativa. A seção 2 apresenta o referencial teórico sobre saúde digital, sistemas de informação em saúde e tecnologias web. A seção 3 descreve a metodologia e as etapas de desenvolvimento. A seção 4 apresenta o sistema desenvolvido, seus módulos e o banco de dados. A seção 5 discute os resultados obtidos e as limitações. A seção 6 apresenta a conclusão e os trabalhos futuros.


# 2 REFERENCIAL TEÓRICO

[[Escreva sobre os temas que fundamentam o trabalho. Sempre cite as fontes (NBR 10520:2023) e liste todas nas REFERÊNCIAS (NBR 6023).]]

## 2.1 SAÚDE DIGITAL E O SISTEMA ÚNICO DE SAÚDE

[[Conceito de saúde digital, e-Saúde, políticas públicas, informatização da atenção primária, prontuário eletrônico do cidadão.]]

## 2.2 SISTEMAS DE INFORMAÇÃO EM SAÚDE

[[Conceitos de sistemas de informação, interoperabilidade, fluxo de informação entre recepção, triagem e consulta, classificação de risco.]]

## 2.3 TECNOLOGIAS DE DESENVOLVIMENTO WEB E APLICATIVOS PROGRESSIVOS

[[HTML, CSS e JavaScript; arquitetura cliente-servidor; Backend as a Service (BaaS); conceito de PWA e suas vantagens (instalação, uso offline, notificações).]]

## 2.4 TRABALHOS CORRELATOS

[[Apresente de 3 a 5 sistemas ou trabalhos acadêmicos semelhantes (prontuários eletrônicos municipais, aplicativos de fila, painéis de chamada) e aponte a diferença do Vida+ em relação a eles.]]


# 3 METODOLOGIA

[[Descreva como o trabalho foi feito, no tempo passado e em detalhes suficientes para outra pessoa reproduzir.]]

## 3.1 CLASSIFICAÇÃO DA PESQUISA

[[Quanto à natureza (pesquisa aplicada), à abordagem (qualitativa), aos objetivos (exploratória e descritiva) e aos procedimentos (estudo de caso com desenvolvimento de software).]]

## 3.2 ETAPAS DO DESENVOLVIMENTO

O desenvolvimento do sistema foi organizado em cinco etapas, descritas no Quadro 1.

[t] **Quadro 1 – Etapas do desenvolvimento do sistema**

| Etapa | Atividade | Produto |
| 1 | Levantamento de requisitos | Documento de requisitos por perfil de usuário |
| 2 | Modelagem do banco de dados | Oito tabelas, relacionamentos, índices e políticas de acesso |
| 3 | Implementação dos módulos | Sistema médico, aplicativo do paciente e telão |
| 4 | Integração e tempo real | Módulos conectados a um banco único com atualização automática |
| 5 | Testes e ajustes | Roteiro de testes por perfil e correções |

[f] Fonte: elaborado pelo próprio autor (2026).

[[Comente o quadro acima, explicando o que foi feito em cada etapa, quanto tempo durou e quais ferramentas foram usadas.]]

## 3.3 TECNOLOGIAS UTILIZADAS

As tecnologias empregadas no desenvolvimento do sistema são apresentadas na Tabela 1.

[t] **Tabela 1 – Tecnologias utilizadas no desenvolvimento**

| Tecnologia | Utilização no projeto |
| HTML5 | Estrutura das telas de todos os módulos |
| CSS3 | Apresentação visual e responsividade dos painéis |
| JavaScript | Lógica de negócio, navegação e comunicação com o banco de dados |
| Supabase | Serviço de banco de dados PostgreSQL em nuvem e transmissão em tempo real |
| PostgreSQL | Banco de dados relacional com controle de acesso por linha (RLS) |
| PWA | Instalação do aplicativo do paciente no celular |
| WebAudio API | Emissão dos sons de chamada no telão e de notificação no aplicativo |
| LocalStorage | Modo demonstração e cache local quando não há conexão |

[f] Fonte: elaborado pelo próprio autor (2026).

[[Explique cada tecnologia e justifique as escolhas — em especial a opção por uma arquitetura sem frameworks e por um serviço de banco de dados em nuvem.]]

## 3.4 PROCEDIMENTOS DE TESTE

[[Descreva como o sistema foi testado: testes funcionais por perfil, verificação da fila e do tempo real entre telão e aplicativo, teste de instalação do PWA e roteiro da demonstração. Informe onde e com quem os testes foram realizados, se houve.]]


# 4 DESENVOLVIMENTO DO SISTEMA

## 4.1 ARQUITETURA GERAL

[[Descreva a arquitetura: aplicação web estática (HTML, CSS e JavaScript) executada no navegador, conectada a um banco PostgreSQL gerenciado na nuvem; ausência de servidor de aplicação próprio; os quatro módulos compartilham os mesmos arquivos de configuração e de acesso a dados.]]

O sistema é composto por quatro módulos e por um conjunto de recursos compartilhados, apresentados no Quadro 2.

[t] **Quadro 2 – Módulos que compõem o sistema Vida+**

| Módulo | Usuários | Principais funções |
| Sistema Médico | Administrador, médico, enfermeiro e recepcionista | Cadastro de pacientes, geração de senha, triagem, prontuário, receita e exames |
| Aplicativo do Paciente | Paciente | Acesso por CPF, posição na fila, histórico, exames, agendamentos e notificações |
| Telão | Sala de espera | Exibição da senha, do nome e do destino do paciente, com chamada sonora |
| Banco de Dados | Todos os módulos | Armazenamento único e compartilhado em tempo real |
| Recursos Compartilhados | Todos os módulos | Configuração global e camada de acesso a dados |

[f] Fonte: elaborado pelo próprio autor (2026).

O Quadro 3 apresenta o fluxo de atendimento implementado, que vai da chegada do paciente à entrega do resultado da consulta.

[t] **Quadro 3 – Fluxo de atendimento do paciente no sistema**

| Etapa | Responsável | Ação no sistema | Estado da consulta |
| 1 | Recepcionista | Cadastro do paciente e geração da senha | em_fila |
| 2 | Paciente | Acompanhamento da posição na fila pelo aplicativo | em_fila |
| 3 | Enfermeiro | Triagem com registro de sinais vitais e classificação de risco | em_fila |
| 4 | Telão | Chamada da senha, com exibição do nome e do consultório | chamado |
| 5 | Médico | Atendimento, diagnóstico, conduta, receita e solicitação de exames | em_consulta |
| 6 | Paciente | Consulta ao relatório completo e às notificações no aplicativo | finalizado |

[f] Fonte: elaborado pelo próprio autor (2026).

## 4.2 BANCO DE DADOS

O banco de dados foi implementado no PostgreSQL por meio do serviço Supabase e é composto por oito tabelas, apresentadas na Tabela 2.

[t] **Tabela 2 – Tabelas do banco de dados e suas finalidades**

| Tabela | Finalidade |
| pacientes | Cadastro e dados clínicos básicos do paciente |
| usuarios | Funcionários do sistema, com perfil de acesso e registro profissional |
| unidades | Unidades de saúde cadastradas |
| consultas | Entidade principal do fluxo de atendimento, da fila ao resultado |
| agendamentos | Consultas futuras e seu status |
| notificacoes | Avisos enviados ao paciente no aplicativo |
| medicamentos | Controle de estoque de medicamentos |
| configuracoes | Parâmetros gerais do sistema |

[f] Fonte: elaborado pelo próprio autor (2026).

O banco de dados conta ainda com uma visão (fila_espera), que reúne as consultas em fila com o nome do paciente, e com a função posicao_fila, que calcula a posição do paciente na fila. Os detalhes das colunas de cada tabela são apresentados no Apêndice A.

[[Explique as decisões de modelagem: uso de campos JSONB para receita, exames, triagem e recepção; índices criados; uso de UUID como chave primária.]]

## 4.3 SISTEMA MÉDICO

[[Descreva os quatro painéis (administrador, médico, enfermeiro e recepcionista) e o que cada um faz, incluindo as funcionalidades do dia a dia: cadastro, fila, triagem, prontuário, receita e gestão de usuários.]]

## 4.4 APLICATIVO DO PACIENTE

[[Descreva as telas do aplicativo: acesso por CPF, acompanhamento da fila, notificações, histórico, exames, agendamentos e perfil; e explique como o aplicativo é instalado no celular como PWA.]]

## 4.5 TELÃO

[[Descreva o painel de chamada exibido na sala de espera: senha, nome, consultório, chamada sonora, atualização automática em tempo real e o painel de controle restrito por código.]]

## 4.6 SEGURANÇA E PRIVACIDADE DOS DADOS

[[Discuta a autenticação por CPF e senha no lado do cliente, o controle de acesso por linha (RLS) e as limitações da configuração permissiva usada na demonstração, relacionando com os princípios da LGPD (Lei nº 13.709/2018). Indique o que deveria ser feito para uso em produção.]]

## 4.7 TESTES E RESULTADOS OBTIDOS

[[Apresente os testes executados e seus resultados, com quadros ou tabelas de casos de teste (entrada esperada, resultado obtido). Use imagens das telas como ilustrações, numeradas e com fonte.]]


# 5 RESULTADOS E DISCUSSÃO

[[Apresente os resultados alcançados em relação a cada objetivo específico, compare com os trabalhos correlatos da seção 2.4 e discuta as limitações encontradas.]]


# 6 CONCLUSÃO

[[Retome o objetivo geral, sintetize o que foi entregue, declare o que foi aprendido e aponte trabalhos futuros: integração com o sistema oficial do Ministério da Saúde, regras de acesso por perfil com autenticação no servidor, relatórios gerenciais e testes com usuários reais.]]


# REFERÊNCIAS

<!-- NBR 6023 (edição vigente). Espaço simples dentro de cada referência e uma
     linha em branco simples entre elas (NBR 14724:2024, 5.2). Sobrenome do
     autor em caixa alta. Atualize as datas de acesso às fontes on-line. -->

BRASIL. Lei nº 13.709, de 14 de agosto de 2018. Lei Geral de Proteção de Dados Pessoais (LGPD). Brasília, DF: Presidência da República, 2018. Disponível em: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm. Acesso em: 5 out. 2026.

BRASIL. Ministério da Saúde. Secretaria-Executiva. Departamento de Informática do SUS. Estratégia de Saúde Digital para o Brasil 2020-2028. Brasília, DF: Ministério da Saúde, 2020. Disponível em: https://bvsms.saude.gov.br/bvs/publicacoes/estrategia_saude_digital_Brasil.pdf. Acesso em: 5 out. 2026.

ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. ABNT NBR 14724: informação e documentação: trabalhos acadêmicos: apresentação. 4. ed. Rio de Janeiro: ABNT, 2024.

ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. ABNT NBR 10520: informação e documentação: citações em documentos: apresentação. Rio de Janeiro: ABNT, 2023.

PRESSMAN, Roger S.; MAXIM, Bruce R. Engenharia de software: uma abordagem profissional. 8. ed. Porto Alegre: AMGH, 2016.

SOMMERVILLE, Ian. Engenharia de software. 10. ed. São Paulo: Pearson, 2019.

SUPABASE. Documentação do Supabase. 2026. Disponível em: https://supabase.com/docs. Acesso em: 5 out. 2026.

[[Acrescente aqui as demais obras citadas no texto (livros, artigos, normas, sites). Toda citação no texto deve ter referência correspondente nesta lista e vice-versa.]]


# APÊNDICE A — ESTRUTURA DAS TABELAS DO BANCO DE DADOS

<!-- Elemento pós-textual elaborado pelo próprio autor (NBR 14724:2024, 4.2.3.3).
     O título sai como "APÊNDICE A — ..." em letras maiúsculas. -->

A seguir são relacionadas as colunas de cada uma das oito tabelas que compõem o banco de dados do sistema Vida+, conforme implementado no arquivo supabase/schema.sql.

## A.1 Tabela pacientes

| Coluna | Tipo | Descrição |
| id | UUID | Chave primária, gerada automaticamente |
| cpf | VARCHAR(11) | CPF do paciente, único |
| nome | VARCHAR(160) | Nome completo |
| nascimento | DATE | Data de nascimento |
| sexo | VARCHAR(1) | F, M ou O |
| telefone | VARCHAR(20) | Telefone de contato |
| email | VARCHAR(120) | Correio eletrônico |
| endereco | VARCHAR(255) | Endereço residencial |
| tipo_sanguineo | VARCHAR(3) | Tipo sanguíneo |
| alergias | TEXT[] | Alergias declaradas |
| doencas_cronicas | TEXT[] | Doenças crônicas declaradas |
| medicamentos_uso | TEXT | Medicamentos de uso contínuo |
| deficiencia | VARCHAR(60) | Deficiência declarada |
| gestante | BOOLEAN | Indica gestação |
| tabagista | BOOLEAN | Indica tabagismo |
| responsavel_nome | VARCHAR(160) | Nome do responsável |
| responsavel_telefone | VARCHAR(20) | Telefone do responsável |
| cartao_sus | VARCHAR(20) | Número do Cartão Nacional de Saúde |
| criado_em | TIMESTAMPTZ | Data e hora do cadastro |
| atualizado_em | TIMESTAMPTZ | Data e hora da última alteração |

## A.2 Tabela usuarios

| Coluna | Tipo | Descrição |
| id | UUID | Chave primária |
| nome | VARCHAR(160) | Nome do funcionário |
| cpf | VARCHAR(11) | CPF, único |
| email | VARCHAR(120) | Correio eletrônico, único |
| senha_hash | TEXT | Senha do acesso |
| perfil | VARCHAR(20) | recepcionista, enfermeiro, medico ou administrador |
| registro_profissional | VARCHAR(30) | Registro no conselho de classe |
| crm | VARCHAR(30) | Registro no Conselho Regional de Medicina |
| coren | VARCHAR(30) | Registro no Conselho Regional de Enfermagem |
| especialidade | VARCHAR(100) | Especialidade médica |
| ativo | BOOLEAN | Indica se o acesso está ativo |
| criado_em | TIMESTAMPTZ | Data e hora do cadastro |

## A.3 Tabela unidades

| Coluna | Tipo | Descrição |
| id | UUID | Chave primária |
| nome | VARCHAR(200) | Nome da unidade de saúde |
| cnpj | VARCHAR(14) | CNPJ, único |
| tipo | VARCHAR(20) | ubs, upa, hospital, clinica ou laboratorio |
| endereco | VARCHAR(300) | Endereço da unidade |
| cidade | VARCHAR(100) | Município |
| estado | CHAR(2) | Unidade da federação |
| telefone | VARCHAR(15) | Telefone de contato |
| email | VARCHAR(200) | Correio eletrônico |
| responsavel | VARCHAR(160) | Responsável pela unidade |
| ativo | BOOLEAN | Indica se a unidade está ativa |
| criado_em | TIMESTAMPTZ | Data e hora do cadastro |

## A.4 Tabela consultas

| Coluna | Tipo | Descrição |
| id | UUID | Chave primária |
| paciente_id | UUID | Referência ao paciente |
| cpf | VARCHAR(11) | CPF do paciente |
| unidade | VARCHAR(80) | Unidade de atendimento |
| senha | VARCHAR(6) | Senha gerada na recepção |
| recepcao | JSONB | Dados do registro na recepção |
| triagem | JSONB | Sinais vitais e classificação de risco |
| diagnostico | TEXT | Diagnóstico registrado pelo médico |
| cid10 | VARCHAR(10) | Código na Classificação Internacional de Doenças |
| conduta | TEXT | Conduta adotada |
| orientacoes | TEXT | Orientações ao paciente |
| receita | JSONB | Medicamentos prescritos |
| exames | JSONB | Exames solicitados |
| medico_nome | VARCHAR(160) | Nome do médico responsável |
| medico_crm | VARCHAR(30) | CRM do médico responsável |
| status | VARCHAR(20) | em_fila, chamado, em_consulta, finalizado ou cancelado |
| guiche | VARCHAR(10) | Guichê da chamada |
| nome_chamado | VARCHAR(160) | Nome exibido na chamada |
| tipo_chamada | VARCHAR(20) | triagem ou consulta |
| consultorio | VARCHAR(10) | Consultório de destino |
| chamado_em | TIMESTAMPTZ | Data e hora da chamada |
| criado_em | TIMESTAMPTZ | Data e hora da abertura do atendimento |
| finalizado_em | TIMESTAMPTZ | Data e hora da finalização |
| cancelado_em | TIMESTAMPTZ | Data e hora do cancelamento |

## A.5 Tabela agendamentos

| Coluna | Tipo | Descrição |
| id | UUID | Chave primária |
| paciente_id | UUID | Referência ao paciente |
| paciente_cpf | VARCHAR(11) | CPF do paciente |
| unidade | VARCHAR(80) | Unidade de atendimento |
| especialidade | VARCHAR(80) | Especialidade da consulta |
| medico_nome | VARCHAR(160) | Médico responsável |
| data_hora | TIMESTAMPTZ | Data e hora agendadas |
| status | VARCHAR(20) | agendado, confirmado, cancelado ou concluido |
| criado_em | TIMESTAMPTZ | Data e hora do agendamento |

## A.6 Tabela notificacoes

| Coluna | Tipo | Descrição |
| id | UUID | Chave primária |
| cpf | VARCHAR(11) | CPF do paciente destinatário |
| tipo | VARCHAR(30) | atendimento_iniciado, triagem, chamada, resultado, lembrete ou aviso |
| titulo | VARCHAR(160) | Título da notificação |
| texto | TEXT | Conteúdo da notificação |
| link | VARCHAR(120) | Tela do aplicativo relacionada ao aviso |
| lida | BOOLEAN | Indica se a notificação foi lida |
| criado_em | TIMESTAMPTZ | Data e hora de criação |

## A.7 Tabela medicamentos

| Coluna | Tipo | Descrição |
| id | UUID | Chave primária |
| nome | VARCHAR(160) | Nome do medicamento |
| principio_ativo | VARCHAR(160) | Princípio ativo |
| dosagem | VARCHAR(40) | Dosagem |
| quantidade_estoque | INTEGER | Quantidade disponível |
| estoque_minimo | INTEGER | Quantidade mínima definida |
| atualizado_em | TIMESTAMPTZ | Data e hora da última atualização |

## A.8 Tabela configuracoes

| Coluna | Tipo | Descrição |
| id | UUID | Chave primária |
| chave | VARCHAR(100) | Identificador do parâmetro, único |
| valor | TEXT | Valor do parâmetro |
| descricao | VARCHAR(300) | Descrição do parâmetro |
| atualizado_em | TIMESTAMPTZ | Data e hora da última atualização |


# ANEXO A — [[TÍTULO DO DOCUMENTO NÃO ELABORADO PELO AUTOR]]

<!-- Elemento pós-textual que NÃO foi elaborado pelo autor: protocolos,
     formulários, manuais de fabricante, normas, capturas de sistemas oficiais.
     Apague este anexo se não houver. -->

[[Insira aqui o documento consultado que não foi produzido por você, por exemplo o protocolo de classificação de risco utilizado como referência na triagem, ou o manual institucional de atendimento. Indique a origem do documento.]]
