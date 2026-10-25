/* ============================================================
   VIDA+ PACIENTE — Navegação compartilhada
   ------------------------------------------------------------
   • Logo (topbar) → volta para a home dinâmica
   • Menu inferior (Início/Histórico/Exames/Agendamentos/Perfil)
   • Botão de sair → confirma e volta para a tela inicial
   • Badge do sino (notificações não lidas)
   ============================================================ */

const Nav = {

  /* Vai para a home certa conforme o estado de login:
     - deslogado  → portal principal (../index.html)
     - logado     → fila (se tiver atendimento ativo)
                  → home (se não tiver) */
  irParaHome() {
    if (typeof DB === 'undefined' || !DB || typeof DB.getSessao !== 'function') {
      location.href = '../index.html';
      return;
    }

    const cpf = DB.getSessao();
    if (!cpf) { location.href = '../index.html'; return; }
    Promise.resolve(DB.getMinhaFila(cpf))
      .then(r => { location.href = r && r.ativa ? 'fila.html' : 'index.html'; })
      .catch(() => { location.href = 'index.html'; });
  },

  /* Sair da conta com confirmação → volta para o portal */
  sair() {
    if (typeof UI === 'undefined' || !UI || typeof UI.modalConfirmar !== 'function') {
      if (typeof DB !== 'undefined' && DB && typeof DB.clearSessao === 'function') {
        DB.clearSessao();
      }
      location.href = '../index.html';
      return;
    }

    UI.modalConfirmar({
      titulo: 'Sair da conta?',
      texto: 'Você voltará para o portal principal.',
      botao: 'Sair', perigo: true,
      onConfirmar: () => {
        if (typeof DB !== 'undefined' && DB && typeof DB.clearSessao === 'function') {
          DB.clearSessao();
        }
        localStorage.removeItem('vidamais_ultimo_status');
        location.href = '../index.html';
      }
    });
  },

  /* Atualiza o contador de notificações não lidas no sino */
  atualizarBadge() {
    const badge = document.getElementById('badge-notif');
    if (!badge) return;
    if (typeof DB === 'undefined' || !DB || typeof DB.getSessao !== 'function') {
      badge.classList.add('escondido');
      return;
    }
    const cpf = DB.getSessao();
    if (!cpf) { badge.classList.add('escondido'); return; }
    Promise.resolve(DB.naoLidas(cpf)).then(n => {
      if (n > 0) {
        badge.textContent = n > 9 ? '9+' : n;
        badge.classList.remove('escondido');
      } else {
        badge.classList.add('escondido');
      }
    }).catch(() => {});
  },

  /* Liga os controles de navegação da página atual */
  iniciar() {
    const logo = document.querySelector('.topbar .logo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.onclick = () => Nav.irParaHome();
    }

    const sino = document.getElementById('btn-notif');
    if (sino) sino.onclick = () => location.href = 'notificacoes.html';

    const sair = document.getElementById('btn-sair');
    if (sair) sair.onclick = () => Nav.sair();

    document.querySelectorAll('.bottomnav a[href="#"]').forEach(a => {
      a.addEventListener('click', (e) => e.preventDefault());
    });

    document.querySelectorAll('.bottomnav a[data-ir-home]').forEach(a => {
      a.onclick = (e) => { e.preventDefault(); Nav.irParaHome(); };
    });

    Nav.atualizarBadge();
    setInterval(Nav.atualizarBadge, 20000);
    Nav.indicadorOffline();
  },

  /* Faixa "offline" no topo: deixa visível que o app está rodando
     com os dados salvos no aparelho (e não parece "quebrado"). */
  indicadorOffline() {
    if (typeof document === 'undefined' || !document.body) return;

    let faixa = document.getElementById('faixa-offline');
    if (!faixa) {
      faixa = document.createElement('div');
      faixa.id = 'faixa-offline';
      faixa.setAttribute('role', 'status');
      faixa.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0',
        'z-index:9999', 'display:none',
        'padding:10px 16px', 'font-size:13px', 'font-weight:600',
        'text-align:center', 'line-height:1.3',
        'color:#7c2d12', 'background:#fef3c7',
        'border-top:1px solid #fcd34d'
      ].join(';');
      document.body.appendChild(faixa);
    }

    function atualizar() {
      const offline = navigator.onLine === false;
      faixa.textContent = offline
        ? '📴 Você está offline — mostrando os dados salvos neste aparelho. As novidades chegam quando a internet voltar.'
        : '';
      faixa.style.display = offline ? 'block' : 'none';
    }

    window.addEventListener('online', atualizar);
    window.addEventListener('offline', atualizar);
    atualizar();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Nav.iniciar);
} else {
  Nav.iniciar();
}
