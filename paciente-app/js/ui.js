/* ============================================================
   VIDA+ PACIENTE — Utilitários de interface (toast, modal, máscaras)
   ============================================================ */

const UI = {
  /* ---------- Toast (notificação rápida) ---------- */
  toast(texto, tipo = 'info', duracao = 3200) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = texto;
    t.className = 'toast aberto ' + (tipo === 'erro' ? 'erro' : tipo === 'sucesso' ? 'sucesso' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('aberto'), duracao);
  },

  /* ---------- Modal de confirmação ---------- */
  modalConfirmar({ titulo, texto, botao = 'Confirmar', perigo = false, onConfirmar }) {
    let fundo = document.querySelector('.modal-fundo');
    if (!fundo) {
      fundo = document.createElement('div');
      fundo.className = 'modal-fundo';
      document.body.appendChild(fundo);
    }
    fundo.innerHTML = `
      <div class="modal">
        <h3>${titulo}</h3>
        <p>${texto}</p>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-contorno" data-acao="cancelar">Voltar</button>
          <button class="btn ${perigo ? 'btn-perigo' : 'btn-primario'}" data-acao="ok">${botao}</button>
        </div>
      </div>`;
    fundo.classList.add('aberto');
    fundo.querySelector('[data-acao="cancelar"]').onclick = () => fundo.classList.remove('aberto');
    fundo.querySelector('[data-acao="ok"]').onclick = () => {
      fundo.classList.remove('aberto');
      onConfirmar();
    };
  },

  /* ---------- Máscaras de input ---------- */
  mascararCPF(el) {
    el.addEventListener('input', () => {
      let v = el.value.replace(/\D/g, '').slice(0, 11);
      el.value = v
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    });
  },

  mascararTelefone(el) {
    el.addEventListener('input', () => {
      let v = el.value.replace(/\D/g, '').slice(0, 11);
      if (v.length <= 10) {
        el.value = v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
      } else {
        el.value = v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
      }
    });
  },

  mascararCEP(el) {
    el.addEventListener('input', () => {
      let v = el.value.replace(/\D/g, '').slice(0, 8);
      el.value = v.replace(/(\d{5})(\d)/, '$1-$2');
    });
  },

  /* ---------- Validação de CPF (dígitos verificadores reais) ---------- */
  validaCPF(cpf) {
    cpf = (cpf || '').replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const calc = (base, peso) => {
      let soma = 0;
      for (let i = 0; i < base.length; i++) soma += base[i] * (peso - i);
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    if (calc(cpf.slice(0, 9), 10) !== +cpf[9]) return false;
    if (calc(cpf.slice(0, 10), 11) !== +cpf[10]) return false;
    return true;
  },

  /* ---------- Formatações ---------- */
  fmtData(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },
  fmtDataHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' +
           d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },
  idade(iso) {
    const n = new Date(iso), hoje = new Date();
    let idade = hoje.getFullYear() - n.getFullYear();
    const m = hoje.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < n.getDate())) idade--;
    return idade;
  },

  /* ---------- Ícones SVG (inline, sem dependência externa) ---------- */
  icone(nome) {
    const icones = {
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
      historico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
      sino: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
      usuario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
      cruz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
      chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m4 12.5 5 5L20 6.5"/></svg>',
      alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
      doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
      remedio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 12h4M12 10v4"/></svg>',
      exame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3v18M5 7h14M5 12h14M5 17h9"/><path d="M17 14l3 3-3 3"/></svg>',
      calendario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
      cancelar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
      sair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
      editar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
      agendamento: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/></svg>',
      tube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6M10 3v6.5L5.5 18a3 3 0 0 0 3 4h7a3 3 0 0 0 3-4L14 9.5V3"/><path d="M7.5 15h9"/></svg>',
      coracao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21C7 16.5 3 13 3 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 2.8C21 13 17 16.5 12 21z"/></svg>',
      seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
      local: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'
    };
    return icones[nome] || '';
  }
};
