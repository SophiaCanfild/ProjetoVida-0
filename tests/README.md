# Testes de locais e orientações

Os testes substituem as respostas de Supabase por um banco em memória. Não fazem gravações no projeto Supabase configurado.

## Testes de regras (sem dependências)

```sh
node --test tests/rotas-unidade.test.js
```

## Fluxo em navegador (opcional)

Na raiz do repositório, instale as ferramentas fora dos arquivos versionados e inicie um servidor estático:

```sh
npm install --prefix .audit-tools --no-audit --no-fund puppeteer-core@24 @sparticuz/chromium@131 @supabase/supabase-js@2
python3 -m http.server 8123 --bind 0.0.0.0
```

Em outro terminal:

```sh
node tests/rotas-browser.cjs
```

O teste usa Chromium do pacote `@sparticuz/chromium`; um navegador já instalado pode ser selecionado com `CHROME_PATH`. A URL pode ser alterada com `VIDA_TEST_URL`. Ele verifica as três etapas, o modal de cadastro e o telão em larguras de 320 a 1920 pixels, além do fluxo de publicação e chamada. O teste também exercita dois telões configurados para unidades distintas e verifica a ausência de conexão WebSocket do telão para consultas. Os arquivos de captura ficam em `.audit-tools/`, que é ignorado pelo Git. Em sistemas mínimos, o Chromium pode exigir as bibliotecas compartilhadas do pacote ou as bibliotecas do navegador instaladas no sistema.

O teste simula os retornos de rede e **não valida as políticas RLS reais, a autenticação, o WebSocket Realtime ou a conformidade física das rotas**. Essas verificações exigem um ambiente Supabase de homologação com usuários/dispositivos autenticados e confirmação presencial.
