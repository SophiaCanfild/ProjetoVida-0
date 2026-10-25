<div align="center">

# 🏥 Vida+ — Sistema de Saúde Digital

**Sistema completo de saúde digital com 4 módulos integrados em tempo real**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)

<br/>

![Status](https://img.shields.io/badge/Status-✅_Concluído-brightgreen?style=flat-square)
![Version](https://img.shields.io/badge/Versão-2.0-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

</div>

---

## 📋 Sobre o Projeto

O **Vida+** é um sistema de saúde digital desenvolvido como **Trabalho de Conclusão de Curso (TCC)**. Ele integra 4 módulos que compartilham o **mesmo banco de dados** em tempo real:

| Módulo | Descrição |
|:---|:---|
| 🏥 **Sistema Médico** | Painéis para admin, médico, enfermeiro e recepcionista |
| 📱 **App do Paciente** | PWA para o paciente acompanhar atendimento pelo celular |
| 📺 **Telão** | Display na sala de espera mostrando chamadas |
| 🗄️ **Banco de Dados** | Supabase (PostgreSQL) com 8 tabelas e RLS |

---

## 🔄 Fluxo do Atendimento

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   👩‍💼 RECEPÇÃO          Cadastra paciente + gera senha      │
│        ↓                                                    │
│   📱 PACIENTE           Vê senha e posição no App           │
│        ↓                                                    │
│   💊 ENFERMEIRA         Faz triagem (sinais vitais)         │
│        ↓                                                    │
│   📺 TELÃO              Chama senha → notifica no App       │
│        ↓                                                    │
│   👨‍⚕️ MÉDICO             Diagnóstico + receita + exames      │
│        ↓                                                    │
│   📱 PACIENTE           Vê relatório completo no App        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Estrutura do Projeto

```
vida-mais/
├── index.html                    ← Portal (tela inicial)
│
├── shared/                       ← 🔗 Recursos compartilhados
│   └── js/
│       ├── config.js             ← Configuração global (Supabase)
│       └── db.js                 ← Banco de dados compartilhado
│
├── sistema-medico/               ← 🏥 Sistema da equipe
│   ├── admin/                    ← Painel do Administrador
│   ├── medico/                   ← Painel do Médico
│   ├── enfermeiro/               ← Painel do Enfermeiro
│   ├── recepcionista/            ← Painel da Recepção
│   └── login/                    ← Telas de login
│
├── paciente-app/                 ← 📱 App do Paciente (PWA)
│   ├── index.html                ← Home
│   ├── login.html                ← Login por CPF
│   ├── fila.html                 ← Acompanhar fila
│   ├── historico.html            ← Histórico
│   ├── exames.html               ← Exames
│   ├── agendamentos.html         ← Agendamentos
│   ├── js/config.js              ← cópia de shared/js/config.js (escopo do SW)
│   ├── js/db.js                  ← cópia de shared/js/db.js (escopo do SW)
│   ├── service-worker.js         ← cache offline (CACHE_VERSION v3)
│   └── manifest.json             ← PWA manifest
│
├── telao/                        ← 📺 Display da sala de espera
│   ├── index.html                ← Tela do telão
│   ├── js/voz-chamada.js         ← 🔊 Voz das chamadas (Web Speech API)
│   ├── js/som-chamada.js         ← 🔔 Bip da chamada (um AudioContext só)
│   ├── js/tv-dados.js            ← Chamadas do Supabase/localStorage
│   └── teste-voz.html            ← 🩺 Diagnóstico de som e voz
│
└── supabase/                     ← 🗄️ Banco de dados
    └── schema.sql                ← Schema completo (8 tabelas)
```

---

## 🚀 Como Usar

### 1️⃣ Clonar o repositório

```bash
git clone https://github.com/seu-usuario/vida-mais.git
cd vida-mais
```

### 2️⃣ Configurar o Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e crie um projeto
2. Vá em **SQL Editor** → cole o conteúdo de `supabase/schema.sql` → **Run**
3. Vá em **Settings > API** → copie a **URL** e a **anon key**
4. Edite `shared/js/config.js` **e a cópia `paciente-app/js/config.js`** (o app do paciente usa a
   cópia para poder funcionar offline — os dois arquivos precisam ter as mesmas credenciais):

```javascript
SUPABASE_URL: "https://seu-projeto.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIs...",
```

### 3️⃣ Abrir o sistema

Na pasta raiz do projeto, inicie um servidor local:

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000` no navegador — é o portal com todos os acessos. Mantenha o terminal aberto enquanto usar o sistema.

> 💡 **Modo Demo:** Enquanto o Supabase não estiver configurado, o sistema funciona com dados locais no navegador (localStorage). Perfeito para testar!

---

## 👥 Perfis de Acesso

| Perfil | Login | Senha | O que faz |
|:---|:---|:---|:---|
| 🔑 **Administrador** | `000.000.000-00` | `admin123` | Gerencia usuários, pacientes, relatórios |
| 👨‍⚕️ **Médico** | `123.456.789-01` | `medico123` | Consultas, prontuário, receitas, exames |
| 💊 **Enfermeiro** | `456.789.012-34` | `enfermeiro123` | Triagem, sinais vitais, classificação de risco |
| 👩‍💼 **Recepcionista** | `678.901.234-56` | `recep123` | Cadastro de pacientes, fila, senhas |
| 📱 **Paciente** | `123.456.789-09` | *(só CPF)* | Fila, histórico, exames, agendamentos |

---

## 🗄️ Banco de Dados

**8 tabelas** no Supabase (PostgreSQL) com Row Level Security:

| Tabela | Descrição |
|:---|:---|
| `pacientes` | Cadastro dos pacientes |
| `usuarios` | Funcionários do sistema |
| `unidades` | Unidades de saúde |
| `consultas` | Entidade principal (fila → triagem → consulta) |
| `agendamentos` | Consultas futuras |
| `notificações` | Avisos para o paciente |
| `medicamentos` | Estoque de medicamentos |
| `configurações` | Parâmetros do sistema |

---

## 🛠️ Tecnologias Utilizadas

| Tecnologia | Uso |
|:---|:---|
| **HTML5 + CSS3 + JavaScript** | Frontend (sem frameworks) |
| **Supabase** | Banco de dados PostgreSQL em nuvem |
| **PostgreSQL** | Banco relacional com RLS |
| **PWA** | App instalável no celular |
| **WebAudio API** | Sons de notificação |
| **LocalStorage** | Cache offline e modo demo |

---

## 📸 Módulos do Sistema

### 🏥 Sistema Médico
- **Admin:** Dashboard, gerenciamento de usuários e pacientes
- **Médico:** Fila de espera, prontuário, receitas digitais
- **Enfermeiro:** Triagem com protocolo de Manchester
- **Recepcionista:** Cadastro, fila, chamada de pacientes

### 📱 App do Paciente
- Login por CPF (sem senha para demo)
- Acompanhamento da fila em tempo real
- Histórico de consultas e exames
- Notificações automáticas
- Instalável como app (PWA)

### 📺 Telão
- Display para sala de espera
- Mostra senha, nome e destino do paciente
- Atualização automática via Supabase Realtime
- **Voz:** toda chamada nova é falada em voz alta (Web Speech API do navegador —
  sem arquivos de áudio e sem serviço externo, funciona offline)

#### 🔊 Voz das chamadas

Exemplos do que é falado:

| Tipo | Frase |
|:---|:---|
| Recepção → triagem | *“Senha A cento e vinte e três. Dirija-se à triagem, guichê 2.”* |
| Triagem → consultório | *“Paciente Maria da Silva. Dirija-se ao consultório 3. Com Dr. Carlos Pereira. Senha C 457.”* |

Ajustes em `TV_CONFIG`, no `shared/js/config.js` (e na cópia `paciente-app/js/config.js`):

| Flag | Padrão | O que faz |
|:---|:---|:---|
| `VOZ_ATIVA` | `true` | `false` deixa o telão só com o bip |
| `VOZ_REPETICOES` | `2` | quantas vezes repete cada chamada |
| `VOZ_INTERVALO_MS` | `1500` | pausa entre as repetições |
| `VOZ_APOS_SOM_MS` | `1000` | espera o bip terminar antes de falar |
| `VOZ_VELOCIDADE` | `0.95` | `<1` fala mais devagar |
| `VOZ_VOLUME` | `1` | volume (0 a 1) |
| `VOZ_IDIOMA` | `'pt-BR'` | idioma das vozes |
| `VOZ_DIGITO_A_DIGITO` | `false` | `true` fala “A um dois três” em vez de “A cento e vinte e três” |

> ⚠️ **Áudio na TV:** o navegador só libera som e voz depois de uma interação na página.
> No computador do telão, abra o navegador com
> `--autoplay-policy=no-user-gesture-required` (Chrome/Edge) ou dê um clique na tela
> após abrir o telão. Sem isso, o bip e a voz ficam mudos — fala e tela continuam funcionando.
>
> A voz é a do próprio sistema operacional: em Linux sem vozes pt-BR instaladas
> (ex.: `espeak-ng`), o timbre muda. A qualidade é melhor com as vozes do Chrome/Windows/Android.

#### 🩺 Não está saindo som? Use `telao/teste-voz.html`

Abra **`telao/teste-voz.html` no próprio computador do telão**. A página mostra, em tempo real:

- se o navegador suporta `AudioContext` e `speechSynthesis`;
- o **estado do áudio** (`running` = liberado, `suspended` = falta um clique);
- **quais vozes pt-BR existem** na máquina e se são locais (funcionam sem internet);
- botões para tocar o bip, falar uma chamada e simular a chamada completa;
- um registro do que aconteceu em cada tentativa.

O caminho mais rápido para o diagnóstico: se o **bip toca e a voz não**, o problema é a síntese de
voz (vozes do sistema). Se **nada** toca, é a política de áudio do navegador (autoplay).

> 🐞 **Correção importante (som do bip):** o código antigo criava um `new AudioContext()` a cada
> chamada e nunca o fechava, com o erro escondido em `catch (e) {}`. O Chrome limita a quantidade
> de AudioContexts por página, então **depois de algumas chamadas o telão ficava mudo para sempre**.
> Agora existe um único contexto reaproveitado (`telao/js/som-chamada.js`), ele é retomado no
> primeiro clique e as falhas aparecem no console em vez de serem engolidas.

---

## 🩺 Os pacientes não estão salvando no Supabase?

Rode **`supabase/schema.sql`** inteiro no SQL Editor: ele é o instalador único (cria/repara as tabelas, migra o modelo antigo para `*_legado`, liga RLS, GRANTs e Realtime) e termina com uma verificação que lista o que faltar.

Não é preciso apagar nada antes: o script preserva o modelo antigo como `*_legado`. Se depois quiser remover essas sobras, use `supabase/limpar-legado.sql` (opcional).

Se o `schema.sql` der erro, rode **`supabase/minimo.sql`** (só tabelas + RLS + permissões, ~180 linhas) e veja a seção 10.1 do guia.

Depois abra **`status-banco.html`** (testa as colunas e faz um INSERT real). O guia completo, com os códigos de erro `PGRST204`/`22P02`/`23502`/`42501`, está em **[DIAGNOSTICO-BANCO.md](DIAGNOSTICO-BANCO.md)**; o diagnóstico somente-leitura está em `supabase/diagnostico.sql`.

> Em resumo: o app espera o schema de `supabase/schema.sql` (ids **UUID**). Um banco criado com o modelo antigo (ids `BIGINT`, `pacientes.id_paciente`) recusa todos os `INSERT` — o instalador agora detecta e preserva esse modelo automaticamente.

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<div align="center">

**Desenvolvido como TCC — Sistema de Saúde Digital v2.0**

![Feito com ❤️](https://img.shields.io/badge/Feito_com_❤️-Vida+-red?style=for-the-badge)

</div>
