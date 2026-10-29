# Locais, orientações e mapa do telão

## Fluxo simplificado

Acesse **Administrativo → Mapa e rotas** e selecione a unidade. O editor usa os mesmos pontos e destinos do mapa existente, mas a configuração textual não exige coordenadas nem ligações.

1. **Locais e consultórios:** cadastre nome, tipo, bloco, andar e número da sala, quando aplicável. Marque separadamente quando não há divisão por blocos ou por andares. Os tipos de circulação não precisam de orientação, a menos que sejam usados como destino de atendimento. O cadastro de médicos permanece único; a associação por CPF e unidade é feita na mesma tela ou no cadastro do profissional.
2. **Orientações:** selecione destino e ponto inicial, descreva as instruções confirmadas pela unidade e registre as informações de acessibilidade conhecidas. A sugestão usa somente os locais e as instruções selecionadas; confira-a e edite-a. É possível copiar explicitamente o texto de outra orientação e adicionar um complemento específico, sem presumir que duas salas compartilhem o percurso.
3. **Revisar e publicar:** corrija as pendências, confira a prévia e confirme presencialmente os dados. O rascunho e a publicação são registros separados; a edição não altera o telão. O botão **Corrigir** leva ao campo correspondente.

A prévia usa uma senha ilustrativa. Nomes, localizações, orientações e vínculos apresentados vêm da configuração carregada. A tela de orientação indica quando a prévia inclui alterações ainda não salvas.

### Cuidados ao alterar locais

O ID do local e a chave usada nas chamadas são preservados ao alterar nome, número ou localização. Isso mantém os vínculos médicos existentes. Se o local, um ponto inicial ou a orientação usada como base mudar, as orientações relacionadas ficam **pendentes de revisão** antes de uma nova publicação. Não é possível remover um consultório com vínculo médico ou chamada ativa conhecida sem antes reatribuir o profissional e concluir a chamada.

A triagem principal corresponde às chamadas de triagem existentes no sistema. Na configuração básica, escolha qual local de triagem receberá essas chamadas. Os consultórios são associados à chave gravada em `consultas.consultorio`; essa coluna aceita até dez caracteres. Para consultórios sem número, é gerada uma chave interna curta, sem exibi-la como número da sala.

## Configuração avançada opcional

**Configurações avançadas de navegação → Abrir mapeamento avançado** mantém o editor de pontos, coordenadas, ligações, destinos e testes gráficos. Um local cadastrado no modo básico não recebe coordenadas automaticamente: selecione-o no editor avançado para posicioná-lo. As ligações continuam direcionais e devem representar percursos reais.

Para exibir o desenho no telão, ative a opção de planta gráfica. A publicação verifica se cada destino usado tem um percurso com coordenadas e ligações válidas a partir do ponto inicial da orientação, e exige a confirmação da unidade. Sem dados suficientes, o sistema não desenha um caminho. O modo textual funciona com a opção gráfica desligada. Publicações legadas do grafo continuam sendo lidas quando há um caminho válido.

Informações de acessibilidade são declarações da unidade, não uma certificação ou um cálculo automático da rota mais acessível. A existência de elevador, por si só, não estabelece que todo o percurso seja acessível.

## Integração com atendimento e telão

```text
consulta.unidade + tipo_chamada + consultorio/guiche
  → mapa_hospital_<unidade> publicado no Supabase
  → ID estável do local + orientação publicada
  → nome, localização, instruções e profissional no telão
```

O telão lê apenas a versão publicada. Se não existir orientação publicada ou o destino não estiver mapeado, exibe **“Consulte a recepção para obter orientações”**, sem mostrar o mapa ilustrativo nem criar instruções. A chamada pública é identificada por senha; não há nome de paciente nem informações clínicas na apresentação ou na fala. O nome do profissional da chamada é mantido.

Unidades legadas que já tenham um vínculo médico salvo no banco, mas ainda não tenham publicado mapa, podem continuar chamando pelo número desse vínculo; o telão apresenta a mensagem neutra até a publicação. Um local novo do rascunho não se transforma em rota publicada antes da confirmação.

O telão consulta apenas os campos necessários das chamadas remotas, sem carregar a camada que sincroniza prontuários. Ele consulta chamadas periodicamente e verifica novas publicações a cada 60 segundos. Quando há falha de conexão, somente uma versão publicada previamente obtida do banco pode ser usada como cache; uma publicação local de demonstração não é tratada como oficial. Textos longos são percorridos automaticamente na área de orientação.

## Persistência e compatibilidade

Para um banco que já possui a estrutura compatível, não são necessárias novas tabelas, colunas ou alterações de dados. Utiliza-se `public.configuracoes`, que já é criada por `supabase/schema.sql`. O arquivo `supabase/diagnostico-rotas.sql` contém consultas **somente de leitura** para conferir colunas, índice, RLS e políticas do banco de destino; ele não faz nenhuma alteração e não comprova a segurança do sistema. Não execute o schema completo ou uma migração demonstrativa em um banco existente sem backup e revisão das políticas.

As chaves utilizadas são:

- `mapa_hospital_<slug-da-unidade>`: pacote JSON da versão publicada;
- `mapa_rascunho_<slug-da-unidade>`: pacote JSON do rascunho compartilhado;
- `equipe_consultorios_<slug-da-unidade>`: vínculos existentes por CPF e unidade.

O pacote mantém `nos`, `ligacoes`, `areas` e `destinos` existentes e acrescenta `orientacoes` por ID do local. Campos de localização, tipo, sala e acessibilidade também permanecem no JSON da unidade. Não se altera ou remove um relacionamento do banco. A chave é normalizada como no módulo anterior; colisões entre nomes normalizados são recusadas quando detectadas.

Salvar e publicar exigem confirmação de escrita no Supabase. Antes da gravação, uma cópia temporária do rascunho é mantida no navegador para recuperação; ela **não** é apresentada como gravação oficial. Se a escrita falhar, revise a conexão/permissão e tente salvar novamente. Há comparação da versão remota para evitar que uma sessão obsoleta sobrescreva uma alteração de outra sessão. Se a publicação ocorrer mas a limpeza posterior do rascunho falhar, o usuário recebe um aviso distinto.

O vínculo de equipe também é gravado no banco com verificação de versão. Chamadas de médico/enfermagem aguardam o resultado da atualização no banco; em caso de falha, o estado local é revertido quando não houve uma alteração posterior, e a notificação de chamada não é disparada.

## Segurança: pendência obrigatória antes de produção

**A instalação atual não garante autorização por unidade no servidor.** O login do projeto usa `sessionStorage` e a política demonstrativa `demo configuracoes` em `supabase/schema.sql` permite operações para `anon` e `authenticated` com `USING (TRUE)`. Outras tabelas, inclusive dados de saúde, também possuem políticas demonstrativas. Restringir opções na interface **não** impede chamadas diretas à API e não é uma medida de segurança. Não utilize dados reais enquanto isso não for corrigido.

Para implantação segura, é necessário planejar e executar, no Supabase de destino:

1. Migrar usuários para **Supabase Auth** e vincular a identidade autenticada aos perfis e unidades autorizadas no servidor.
2. Substituir as políticas demonstrativas por RLS que autorize leitura e escrita de rascunhos, publicações e equipe conforme `auth.uid()`, perfil e unidade. Verificar que nenhuma política permissiva adicional reabra o acesso.
3. Identificar e autorizar o telão e demais dispositivos apenas para leitura das publicações da própria unidade, sem usar chave de serviço no navegador.
4. Aplicar controles equivalentes às tabelas clínicas e aos demais módulos, testar acesso cruzado com usuários e unidades diferentes e revisar LGPD antes de liberar a operação.

Essas mudanças exigem provisionamento de identidades e dispositivos existentes. Não foram aplicadas automaticamente: ativar RLS restritiva sem migrar os logins e o telão interromperia os módulos atuais. A chave `anon` é pública por definição; ela não deve ser tratada como credencial privilegiada, e nenhuma chave privada foi adicionada ao front-end.

## Testes

- `node --test tests/rotas-unidade.test.js`: regras de sugestão, validação, grafo legado, acessibilidade, rascunho, falha e concorrência com banco simulado.
- `tests/rotas-browser.cjs`: fluxo em Chromium com respostas Supabase simuladas, incluindo médico, rascunho em outra sessão, publicação, chamada no telão, falha de rede e layout. Veja `tests/README.md`.

Os testes automatizados **não** alteram o banco real e não comprovam RLS, WebSocket Realtime ou a configuração física da unidade. Teste o fluxo e as permissões no ambiente de homologação após a migração de autenticação.
