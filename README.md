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
│   └── manifest.json             ← PWA manifest
│
├── telao/                        ← 📺 Display da sala de espera
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
4. Edite `shared/js/config.js`:

```javascript
SUPABASE_URL: "https://seu-projeto.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIs...",
```

### 3️⃣ Abrir o sistema

Abra `index.html` no navegador — é o portal com todos os acessos.

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

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<div align="center">

**Desenvolvido como TCC — Sistema de Saúde Digital v2.0**

![Feito com ❤️](https://img.shields.io/badge/Feito_com_❤️-Vida+-red?style=for-the-badge)

</div>
