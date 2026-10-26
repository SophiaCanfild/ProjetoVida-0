/* ============================================================
   VIDA+ — Consultórios das chamadas médicas
   ------------------------------------------------------------
   Relaciona o usuário médico ao consultório, recupera a escolha
   por unidade e valida o destino contra o mapa usado pelo telão.
   Não contém dados de pacientes.
   ============================================================ */
var MedicoConsultorios = (function () {
  'use strict';

  var PREFIXO_PREFERENCIA = 'vidamais_consultorio_medico_';

  function texto(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function normalizar(valor) {
    var resultado = texto(valor).toLowerCase();
    if (typeof resultado.normalize === 'function') {
      resultado = resultado.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return resultado;
  }

  function registro(valor) {
    return normalizar(valor).replace(/[^a-z0-9]/g, '');
  }

  function cpf(valor) {
    return texto(valor).replace(/\D/g, '');
  }

  function slug(valor) {
    return normalizar(valor).replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, 80) || 'indefinido';
  }

  function clonar(valor) {
    return valor == null ? valor : JSON.parse(JSON.stringify(valor));
  }

  function unidadePadrao() {
    return typeof APP_CONFIG !== 'undefined' && APP_CONFIG.UNIDADES &&
      APP_CONFIG.UNIDADES[0] ? APP_CONFIG.UNIDADES[0] : 'Unidade não informada';
  }

  function identificadorMedico(usuario) {
    if (!usuario) return 'medico';
    return cpf(usuario.cpf) || registro(usuario.crm) ||
      registro(usuario.registroProfissional || usuario.registro_profissional) ||
      texto(usuario.id) || normalizar(usuario.nome) || 'medico';
  }

  function chavePreferencia(usuario, unidade) {
    return PREFIXO_PREFERENCIA + slug(unidade || unidadePadrao()) + '_' +
      slug(identificadorMedico(usuario));
  }

  function lerPreferenciaRegistro(usuario, unidade) {
    try {
      var bruto = window.localStorage.getItem(chavePreferencia(usuario, unidade));
      if (!bruto) return { consultorio: '', atualizado_em: null };
      try {
        var valor = JSON.parse(bruto);
        if (valor && typeof valor === 'object') {
          return {
            consultorio: texto(valor.consultorio),
            atualizado_em: valor.atualizado_em || null
          };
        }
        return { consultorio: texto(valor), atualizado_em: null };
      } catch (e) {
        /* Compatibilidade com a preferência antiga, gravada só como texto. */
        return { consultorio: texto(bruto), atualizado_em: null };
      }
    } catch (e) {
      return { consultorio: '', atualizado_em: null };
    }
  }

  function lerPreferencia(usuario, unidade) {
    return lerPreferenciaRegistro(usuario, unidade).consultorio;
  }

  function salvarPreferencia(usuario, unidade, consultorio) {
    var numero = texto(consultorio);
    if (!numero) return false;
    try {
      window.localStorage.setItem(chavePreferencia(usuario, unidade), JSON.stringify({
        consultorio: numero,
        atualizado_em: new Date().toISOString()
      }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function mesmoMedico(configurado, usuario) {
    if (!configurado || !usuario) return false;
    if (configurado.id && texto(configurado.id) === texto(usuario.id)) return true;
    if (cpf(configurado.cpf) && cpf(configurado.cpf) === cpf(usuario.cpf)) return true;

    var crmConfigurado = registro(configurado.crm || configurado.registroProfissional);
    var crmUsuario = registro(usuario.crm || usuario.registroProfissional || usuario.registro_profissional);
    if (crmConfigurado && crmConfigurado === crmUsuario) return true;

    return normalizar(configurado.nome) && normalizar(configurado.nome) === normalizar(usuario.nome);
  }

  function consultorioPadrao(usuario) {
    if (!usuario) return '';
    if (texto(usuario.consultorio)) return texto(usuario.consultorio);
    if (typeof APP_CONFIG === 'undefined' || !Array.isArray(APP_CONFIG.MEDICOS)) return '';

    var encontrado = APP_CONFIG.MEDICOS.find(function (medico) {
      return mesmoMedico(medico, usuario);
    });
    return encontrado ? texto(encontrado.consultorio) : '';
  }

  function listar(mapa) {
    if (!mapa || !mapa.destinos || !mapa.destinos.consultorios ||
        !Array.isArray(mapa.nos)) return [];

    return Object.keys(mapa.destinos.consultorios).map(function (numero) {
      var destinoId = mapa.destinos.consultorios[numero];
      var no = mapa.nos.find(function (item) { return item && item.id === destinoId; });
      if (!no) return null;
      return {
        numero: texto(numero),
        destinoId: destinoId,
        nome: texto(no.nome) || 'Consultório ' + numero,
        bloco: texto(no.bloco),
        andar: texto(no.andar),
        no: no
      };
    }).filter(function (item) {
      return item && item.numero;
    }).sort(function (a, b) {
      return a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true });
    });
  }

  function escolhaInicial(mapa, usuario, unidade, vinculoCentral) {
    var disponiveis = listar(mapa);
    function existe(numero) {
      return disponiveis.some(function (item) { return item.numero === texto(numero); });
    }
    function data(registro) {
      var convertida = Date.parse(registro && registro.atualizado_em);
      return isFinite(convertida) ? convertida : 0;
    }

    var preferencia = lerPreferenciaRegistro(usuario, unidade);
    var local = texto(preferencia.consultorio);
    var centralInformado = !!(vinculoCentral && typeof vinculoCentral === 'object');
    var central = centralInformado ? texto(vinculoCentral.consultorio) : '';

    /* A alteração mais recente vence: o médico pode trocar a sala,
       mas uma nova atribuição administrativa substitui uma preferência antiga. */
    if (centralInformado && data(vinculoCentral) >= data(preferencia)) {
      return existe(central) ? central : '';
    }
    if (existe(local)) return local;
    if (centralInformado) return existe(central) ? central : '';

    var padrao = consultorioPadrao(usuario);
    if (existe(padrao)) return padrao;

    return disponiveis.length === 1 ? disponiveis[0].numero : '';
  }

  function validar(mapa, consultorio, unidade) {
    var numero = texto(consultorio);
    if (!numero) {
      throw new Error('Selecione o consultório em que você atenderá o paciente.');
    }
    if (!mapa) {
      throw new Error('Os consultórios desta unidade ainda não foram carregados. Tente novamente.');
    }

    var destino = listar(mapa).find(function (item) { return item.numero === numero; });
    if (!destino) {
      throw new Error('O Consultório ' + numero + ' não está ligado a um ponto válido no mapa de ' +
        (unidade || unidadePadrao()) + '. Selecione outra sala ou solicite a configuração ao administrador.');
    }
    return destino;
  }

  function mapaVazio(unidade) {
    return {
      configurado: false,
      nome: 'Mapa de ' + (unidade || unidadePadrao()),
      nos: [],
      ligacoes: [],
      destinos: { triagem: null, consultorios: {}, guiches: {} }
    };
  }

  async function carregarMapa(unidade) {
    var nomeUnidade = texto(unidade) || unidadePadrao();
    if (typeof MapaHospitalStore !== 'undefined' && MapaHospitalStore &&
        typeof MapaHospitalStore.carregarPublicado === 'function') {
      try {
        var publicado = await MapaHospitalStore.carregarPublicado(nomeUnidade);
        if (publicado) return publicado;
      } catch (e) {
        console.warn('[Consultórios] Falha ao carregar o mapa publicado:', e.message);
      }
    }

    if (typeof MAPAS_HOSPITAL !== 'undefined' && MAPAS_HOSPITAL.unidades &&
        MAPAS_HOSPITAL.unidades[nomeUnidade]) {
      return clonar(MAPAS_HOSPITAL.unidades[nomeUnidade]);
    }
    return mapaVazio(nomeUnidade);
  }

  return {
    carregarMapa: carregarMapa,
    consultorioPadrao: consultorioPadrao,
    escolhaInicial: escolhaInicial,
    listar: listar,
    validar: validar,
    lerPreferencia: lerPreferencia,
    lerPreferenciaRegistro: lerPreferenciaRegistro,
    salvarPreferencia: salvarPreferencia,
    chavePreferencia: chavePreferencia
  };
})();
