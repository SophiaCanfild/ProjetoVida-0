/* ============================================================
   VIDA+ — MAPAS DE ORIENTAÇÃO POR UNIDADE
   ------------------------------------------------------------
   Este é o ÚNICO arquivo que precisa ser adaptado à planta de
   cada hospital. Não contém dados de pacientes.

   IMPORTANTE: o exemplo abaixo é ILUSTRATIVO. Antes de usar com
   pacientes, valide todas as rotas na unidade e altere para:
       configurado: true

   Enquanto "configurado" for false, o telão mostra o aviso de
   demonstração e NÃO lê as direções fictícias em voz alta.

   Modelo:
   - areas: regiões visuais (andares/blocos) do esquema SVG;
   - nos: pontos pelos quais o paciente pode passar;
   - ligacoes: caminhos dirigidos entre dois pontos;
   - destinos: liga a chamada atual (triagem/consultório) a um nó.
   ============================================================ */
var MAPAS_HOSPITAL = {
  versao: 1,
  unidades: {
    "UBS Central Araucária": {
      configurado: false,
      nome: "Mapa demonstrativo da UBS",
      ponto_inicial: "recepcao",

      /* Coordenadas em uma tela SVG de 640 × 330. */
      areas: [
        {
          id: "primeiro_andar",
          nome: "1º andar • Bloco B",
          x: 20, y: 20, largura: 600, altura: 130,
          tipo: "consultas"
        },
        {
          id: "terreo",
          nome: "Térreo • Bloco A",
          x: 20, y: 180, largura: 600, altura: 130,
          tipo: "acolhimento"
        }
      ],

      nos: [
        {
          id: "recepcao",
          nome: "Recepção",
          tipo: "inicio",
          x: 70, y: 245,
          andar: "Térreo",
          bloco: "Bloco A"
        },
        {
          id: "corredor_principal",
          nome: "Corredor principal",
          tipo: "corredor",
          x: 205, y: 245,
          andar: "Térreo",
          bloco: "Bloco A"
        },
        {
          id: "triagem",
          nome: "Triagem",
          tipo: "triagem",
          x: 360, y: 275,
          andar: "Térreo",
          bloco: "Bloco A"
        },
        {
          id: "elevador",
          nome: "Elevador",
          tipo: "elevador",
          x: 360, y: 210,
          andar: "Térreo",
          bloco: "Bloco A"
        },
        {
          id: "corredor_bloco_b",
          nome: "Corredor Bloco B",
          tipo: "corredor",
          x: 380, y: 85,
          andar: "1º andar",
          bloco: "Bloco B"
        },
        {
          id: "consultorio_1",
          nome: "Consultório 1",
          tipo: "consultorio",
          x: 555, y: 55,
          andar: "1º andar",
          bloco: "Bloco B"
        },
        {
          id: "consultorio_2",
          nome: "Consultório 2",
          tipo: "consultorio",
          x: 555, y: 115,
          andar: "1º andar",
          bloco: "Bloco B"
        }
      ],

      /* peso: custo usado no cálculo da menor rota;
         tempo: segundos estimados para percorrer a ligação;
         acessivel: false em escadas ou caminhos com obstáculos. */
      ligacoes: [
        {
          de: "recepcao",
          para: "corredor_principal",
          peso: 1,
          tempo: 15,
          acessivel: true,
          instrucao: "Saia da recepção e siga pelo corredor principal."
        },
        {
          de: "corredor_principal",
          para: "triagem",
          peso: 1,
          tempo: 15,
          acessivel: true,
          instrucao: "A Triagem fica à direita, no térreo do Bloco A."
        },
        {
          de: "corredor_principal",
          para: "elevador",
          peso: 1,
          tempo: 10,
          acessivel: true,
          instrucao: "Siga até o elevador do Bloco A."
        },
        {
          de: "elevador",
          para: "corredor_bloco_b",
          peso: 2,
          tempo: 35,
          acessivel: true,
          instrucao: "Suba ao primeiro andar de elevador e entre no Bloco B."
        },
        {
          de: "corredor_principal",
          para: "corredor_bloco_b",
          peso: 1,
          tempo: 25,
          acessivel: false,
          instrucao: "Suba ao primeiro andar pela escada e entre no Bloco B."
        },
        {
          de: "corredor_bloco_b",
          para: "consultorio_1",
          peso: 1,
          tempo: 15,
          acessivel: true,
          instrucao: "O Consultório 1 fica à esquerda do corredor do Bloco B."
        },
        {
          de: "corredor_bloco_b",
          para: "consultorio_2",
          peso: 1,
          tempo: 15,
          acessivel: true,
          instrucao: "O Consultório 2 fica à direita do corredor do Bloco B."
        }
      ],

      destinos: {
        triagem: "triagem",
        consultorios: {
          "1": "consultorio_1",
          "2": "consultorio_2"
        },
        guiches: {}
      }
    }

    /* Para atender outra unidade, acrescente aqui um novo bloco:
       "Nome exato da unidade em APP_CONFIG.UNIDADES": {
         configurado: false,
         ponto_inicial: "recepcao",
         areas: [...], nos: [...], ligacoes: [...], destinos: {...}
       }
    */
  }
};
