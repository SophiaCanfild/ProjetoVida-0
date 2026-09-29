# 📱 Vida+ no Celular — Guia Mobile

Este documento explica **como o sistema funciona no celular** e como testar/apresentar.
Não foi preciso reescrever nada: o Vida+ é um **PWA** (Progressive Web App), ou seja,
um site que se comporta como aplicativo.

---

## ✅ O que já está pronto

| Recurso | Onde | Situação |
|:--|:--|:--|
| App do Paciente instalável (ícone na tela inicial) | `paciente-app/` | ✅ manifest + ícones corrigidos |
| Funciona offline (internet cair na banca) | `sw.js` (raiz) | ✅ service worker com cache |
| Painéis da equipe usáveis no celular | `sistema-medico/` | ✅ menu gaveta + tabelas roláveis |
| Portal inicial responsivo | `index.html` | ✅ cards empilham no celular |
| Notificação de chamada (som + vibração) | `paciente-app/js/notificacao.js` | ✅ já existia |

### O que foi corrigido nesta rodada

1. **Ícones do PWA** — o `manifest.json` apontava para `icons/icon-192.png`, mas os
   arquivos reais se chamavam `icon-192 (1).png`. Gerados ícones novos:
   `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`,
   `favicon-32.png`.
2. **Service worker** (`sw.js` na raiz) — não existia. Sem ele o Chrome/Android
   **não oferece a instalação** e nada funciona offline.
3. **Sistema médico no celular** — novo `sistema-medico/css/mobile.css` +
   `sistema-medico/js/mobile.js`: a sidebar vira **gaveta** com botão ☰ na topbar,
   tabelas rolam para o lado, cards empilham, botões ganham altura de toque (44px).
4. **Portal** — a media query mobile estava errada (`repeat(3, 1fr)` em telas
   pequenas); agora os cards empilham em 1 coluna.
5. **Bug de CSS do app** — `bottomnav a.ativo` estava sem o ponto (`.`), então a aba
   ativa do menu inferior nunca ficava destacada.
6. **Scripts do Cloudflare removidos** dos HTMLs — eram injetados pelo servidor e
   quebravam o arquivo versionado no Git.

---

## 🧪 Como testar no seu celular

O PWA **só instala servido por HTTPS** (nunca por `file://`).

### Opção A — site publicado (Cloudflare Pages)
Depois de dar `git push`, o deploy publica sozinho. No celular:

- **Android / Chrome:** abra `https://SEU-DOMINIO/paciente-app/index.html` →
  menu ⋮ → **“Adicionar à tela inicial”** (ou **“Instalar app”**).
- **iPhone / Safari:** abra o mesmo link → botão **Compartilhar** →
  **“Adicionar à Tela de Início”**.

### Opção B — testar localmente no PC antes de publicar
```bash
# na pasta do projeto
python3 -m http.server 8000
```
No PC, abra `http://localhost:8000` (localhost conta como “seguro” para o SW).
Para testar **no celular** durante o desenvolvimento, o celular precisa alcançar o
PC na mesma rede:
```bash
# descubra o IP do PC (ex.: 192.168.0.10)
hostname -I        # Linux
ipconfig           # Windows
```
e abra `http://192.168.0.10:8000/paciente-app/index.html`.
> Sem HTTPS o Chrome não mostra o botão de instalar, mas **o layout mobile e o
> funcionamento normal podem ser testados assim**. Para instalar de verdade, use a
> Opção A (ou `ngrok http 8000`, que dá um HTTPS temporário).

### Checklist da banca
- [ ] App instalado abre em tela cheia (sem barra do navegador)
- [ ] Modo avião: o app ainda abre e mostra o último conteúdo (cache)
- [ ] Recepção chama a senha → celular vibra/toca com o app aberto
- [ ] Painel do médico usável com o menu ☰ no celular
- [ ] Girar o tablet não “trava” o menu aberto

---

## 🗂️ Como o offline funciona (`sw.js`)

| Tipo de conteúdo | Estratégia |
|:--|:--|
| Páginas HTML | rede primeiro; sem rede → cache |
| CSS/JS/ícones do projeto | cache primeiro; rede atualiza |
| CDNs (supabase-js, Font Awesome, fontes) | cache primeiro; rede atualiza |
| API do Supabase (dados/realtime) | **sempre rede** (dados ao vivo) |

**Publicou código novo?** Abra `sw.js` e aumente `CACHE_VERSION` (`'v1'` → `'v2'`).
Isso descarta o cache antigo dos celulares.

---

## 🚀 (Opcional) Publicar na Play Store depois

Se um dia quiserem o app na loja, **não é preciso reescrever**: o Capacitor
empacota este mesmo código em um APK/AAB.

```bash
npm init -y
npm i @capacitor/core @capacitor/cli
npx cap init "Vida+ Paciente" "br.com.vidamais.paciente" --web-dir=.
npx cap add android
npx cap sync && npx cap open android
```
Ajustes necessários nesse caminho: copiar `shared/` para dentro da `web-dir`
(hoje o app referencia `../shared/`) e trocar os links `../index.html` de “sair”
pela tela de login do próprio app.

---

## ⚠️ Lembrete de segurança (uso acadêmico)

- `shared/js/config.js` contém a **anon key do Supabase** commitada. Para TCC tudo
  bem, mas o RLS do `supabase/schema.sql` precisa restringir o que um CPF
  “chutado” consegue ler.
- As senhas de demonstração estão no `README.md` — não reuse esse banco para
  dados reais de pacientes.
