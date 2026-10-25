# Mapa hospitalar e rotas no telão

## Visão geral

O recurso transforma a planta de cada unidade em um **grafo de navegação**:

```text
Chamada da recepção ou do consultório
  → unidade + tipo_chamada + consultorio/guiche
  → mapa PUBLICADO da unidade
  → cálculo da rota a partir da recepção
  → mapa + passo a passo + bloco/andar no telão
  → direções por voz somente em mapa validado e publicado
```

O Administrativo possui um editor visual. Não é necessário editar JavaScript para alterar pontos, percursos ou destinos das unidades disponíveis.

Não há nomes, CPFs ou outros dados de pacientes no mapa. A configuração contém somente locais, caminhos, tempos e instruções.

## Configurar pelo Administrativo

Acesse **Administrativo → Unidades → Mapa e rotas**. Também há um atalho **Mapa e rotas** no menu lateral.

1. Selecione a unidade/hospital.
2. Em **1. Pontos e planta**:
   - clique em um ponto para editar nome, tipo, bloco, andar e coordenadas;
   - arraste pontos para reposicioná-los;
   - use **Novo ponto** para cadastrar recepção, triagem, consultório, guichê, corredor, elevador ou escada;
   - defina o ponto inicial, normalmente a recepção/sala de espera;
   - se necessário, use **Reorganizar fundos das áreas** para gerar os fundos por bloco e andar.
3. Em **2. Caminhos**, cadastre as ligações:
   - origem e destino;
   - peso da rota;
   - tempo em segundos;
   - se o trecho é livre de escadas/obstáculos;
   - instrução objetiva para o paciente.
4. As ligações têm sentido. Para um corredor de mão dupla, cadastre ida e volta com instruções adequadas a cada sentido.
5. Em **3. Destinos e teste**, configure:
   - ponto inicial das rotas;
   - destino geral da triagem;
   - números dos consultórios e seus pontos;
   - guichês específicos, quando utilizados.
6. Use **Calcular rota do rascunho** para conferir o desenho, o passo a passo, o tempo e a acessibilidade.
7. Execute **Validar todos os percursos** e corrija qualquer erro indicado.
8. Percorra fisicamente as rotas com a equipe da unidade e marque a confirmação presencial.
9. Clique em **Publicar no telão**.

**Exportar JSON** gera uma cópia do rascunho para backup ou auditoria.

## Vínculo entre médico, paciente e consultório

O painel médico possui o campo **Consultório para as chamadas**, acima da fila de espera. O fluxo é:

```text
Médico logado + unidade da consulta
  → consultório padrão ou sala escolhida pelo médico
  → validação do número em destinos.consultorios do mapa
  → chamada grava paciente + médico + CRM + consultório
  → telão, aplicativo, mapa e voz recebem o mesmo destino
```

Os médicos de demonstração possuem estes padrões em `APP_CONFIG.MEDICOS`:

```js
{ consultorio: "1", cpf: "12345678901", crm: "CRM/PR 12345", nome: "Dr. Alexandre Medicina" }
{ consultorio: "2", cpf: "23456789012", crm: "CRM/PR 67890", nome: "Dra. Carla Dermatologia" }
```

- O usuário é reconhecido preferencialmente por **CPF ou CRM**; o nome é apenas fallback.
- O médico pode trocar a sala antes de chamar. A escolha fica salva no navegador, separada por médico e unidade.
- A preferência local não altera o cadastro do usuário nem publica mudanças no mapa.
- Um médico sem padrão configurado deve selecionar uma sala. O Administrativo pode definir ou remover o vínculo permanente em **Mapa e rotas → Equipe e salas**; os padrões de `APP_CONFIG.MEDICOS` continuam sendo apenas o fallback de demonstração.
- A lista de salas vem do mapa da **unidade do atendimento**. Uma sala sem ponto válido, ou uma unidade sem consultórios mapeados, impede a chamada até que o problema seja corrigido.
- Se o Administrativo publicar uma sala nova, ela fica disponível na próxima carga do painel médico. Se uma sala for removida, uma preferência antiga para ela é ignorada ao recarregar o mapa.
- A chamada do tipo `consulta` também é validada no banco compartilhado e não pode ser gravada sem consultório. Chamadas de triagem continuam usando guichê e não exigem consultório.

Esse vínculo não escala médicos nem distribui pacientes automaticamente: o médico continua escolhendo o paciente da fila. O sistema garante que a chamada selecionada indique a sala correta.

## Equipe e salas no Administrativo

A primeira aba do editor reúne os médicos, especialidade, CRM, situação do cadastro e consultório principal de cada um na unidade selecionada. O cadastro de um novo médico também permite escolher a unidade e a sala, ou deixar o vínculo para depois.

O cadastro rápido de consultório pede apenas dados operacionais (número, nome, bloco/andar, origem, tempo e acessibilidade). Em uma única ação ele cria o ponto, o destino e uma ligação no **rascunho**, sem exigir identificadores técnicos ou coordenadas. A planta e as ligações avançadas continuam disponíveis para ajustes especiais.

- O vínculo médico–sala é salvo por **CPF e unidade** em `configuracoes`, com cache local para demonstração.
- O vínculo pode ser salvo antes da publicação, mas uma sala que existe só no rascunho ainda não deve ser usada em chamadas; a interface avisa quando é necessário publicar.
- Para excluir ou renumerar uma sala com médicos vinculados, primeiro reatribua esses profissionais. Isso evita deixar chamadas apontando para um destino inexistente.
- A leitura remota é refeita antes de cada alteração do vínculo. Se ela falhar, a gravação é bloqueada para não sobrescrever a equipe com dados desatualizados.
- Nenhuma alteração de consultório, ponto ou percurso no editor altera o telão até **Validar**, confirmar a conferência presencial e **Publicar**.

## Rascunho x publicação

```text
Editor → rascunho local → testes → validação técnica + presencial → publicação
                                                              ├─ Supabase
                                                              └─ cache local
Telão → lê somente a versão publicada
```

- Salvar rascunho **não altera o telão**.
- O rascunho fica no navegador do administrador e é preservado se a publicação remota falhar.
- Descartar rascunho recarrega a última versão publicada; se ainda não houver publicação, recarrega o modelo.
- Qualquer alteração no rascunho invalida a confirmação presencial e exige nova validação antes da próxima publicação.
- Publicar marca o mapa como `configurado: true`. Não é recomendável alterar esse sinalizador manualmente para contornar a validação.

## Armazenamento

Nenhuma tabela nova é necessária. A publicação usa a tabela `configuracoes` já existente no Supabase:

- chave: `mapa_hospital_<unidade-em-slug>`;
- valor: pacote JSON com versão, unidade, data e mapa;
- conflito/atualização: coluna `chave`.

Arquivos envolvidos:

- `sistema-medico/admin/mapa.html`: editor visual;
- `sistema-medico/js/mapa-admin.js`: ações, validação e prévia;
- `sistema-medico/css/mapa-admin.css`: apresentação do editor;
- `shared/js/mapa-store.js`: rascunho, cache e publicação;
- `shared/js/equipe-consultorios.js`: vínculos administrativos por CPF/unidade;
- `sistema-medico/js/medico-consultorios.js`: vínculo do médico, preferência por unidade e validação da sala;
- `sistema-medico/medico/index.html`: seleção do consultório e chamada do paciente;
- `telao/config/mapa-hospital.js`: modelo demonstrativo e fallback;
- `telao/js/tv-mapa.js`: validação, Dijkstra, acessibilidade, voz e SVG;
- `telao/js/voz-chamada.js`: anúncio, controles de áudio e orientação validada;
- `telao/index.html` e `telao/css/tv.css`: apresentação no telão.

### Supabase indisponível / demonstração

Sem cliente Supabase, rascunho e publicação usam `localStorage`. Nesse modo, a publicação vale para o navegador/dispositivo onde foi feita. Para que vários telões recebam o mesmo mapa, configure o Supabase.

Quando o Supabase está configurado, mas a escrita falha, o editor **não apresenta a operação como publicada**: ele mantém o rascunho e conserva a última versão publicada. Na leitura, uma indisponibilidade temporária permite usar o último cache válido; sem cache, permanece o modelo ilustrativo.

> As políticas SQL distribuídas com este projeto são demonstrativas. Em produção, restrinja a escrita em `configuracoes` a administradores autenticados e mantenha para o telão somente a leitura necessária.

## Atualização do telão

O telão carrega o mapa publicado antes da primeira renderização, verifica novas versões a cada 60 segundos e também responde a uma publicação feita em outra aba do mesmo navegador. Não é necessário recarregar a página.

Se o mapa publicado for inválido ou o destino não estiver mapeado, o sistema não inventa um percurso. O telão orienta o paciente a procurar a recepção.

## Regras de rota e acessibilidade

O motor existente usa Dijkstra com pesos positivos:

1. tenta primeiro um percurso em que **todas** as ligações são acessíveis;
2. somente se não houver alternativa, usa a melhor rota disponível;
3. nesse segundo caso, sinaliza **Rota com obstáculos**.

O tempo é a soma dos segundos das ligações e aparece arredondado para cima em minutos. Se algum tempo estiver ausente, o telão não exibe uma estimativa inventada.

## Enquanto o mapa for ilustrativo

Enquanto não houver publicação validada:

- o mapa aparece identificado como **exemplo/ilustrativo**;
- o tempo estimado fica oculto;
- as direções **não são lidas em voz alta**.

A fala continua anunciando a chamada normalmente; apenas o percurso não é acrescentado.

## Conferência presencial obrigatória

Antes de publicar:

1. Teste triagem, todos os consultórios e todos os guichês usados pela unidade.
2. Percorra fisicamente cada rota com a equipe do hospital.
3. Verifique elevadores, escadas, portas de acesso restrito, bloqueios e rotas acessíveis.
4. Confirme se “à esquerda/direita” está no sentido do paciente.
5. Compare os tempos informados com o deslocamento real, sem pressa.
6. Faça uma chamada fictícia e confira mapa e fala no telão.
7. Repita a validação após obras, mudança de consultórios ou bloqueio de corredores.

O mapa é esquemático e não substitui placas, treinamento da equipe ou avaliação de acessibilidade da unidade.

## Referência técnica do JSON

O editor manipula o mesmo formato aceito pelo motor:

```js
{
  configurado: false,
  nome: "Mapa da unidade",
  ponto_inicial: "recepcao",
  areas: [],
  nos: [
    {
      id: "recepcao",
      nome: "Recepção",
      tipo: "inicio",
      x: 70,
      y: 250,
      andar: "Térreo",
      bloco: "Bloco A"
    }
  ],
  ligacoes: [
    {
      de: "recepcao",
      para: "corredor_principal",
      peso: 1,
      tempo: 15,
      acessivel: true,
      instrucao: "Saia da recepção e siga pelo corredor principal."
    }
  ],
  destinos: {
    triagem: "triagem",
    consultorios: { "1": "consultorio_1" },
    guiches: { "1": "guiche_1" }
  }
}
```

- Os IDs dos pontos devem ser únicos.
- As coordenadas usam o esquema SVG de 640 × 330.
- As chaves de `consultorios` e `guiches` precisam corresponder aos valores gravados nas chamadas.
- `areas` é visual e não interfere no cálculo.
- Uma chamada também pode informar `destino_id`, desde que ele exista entre os pontos.

Para inspecionar uma rota no console:

```js
OrientacaoHospitalTV.calcularRota({
  tipo_chamada: "consulta",
  consultorio: "1"
});
```
