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
    const cpf = DB.getSessao();
    if (!cpf) { location.href = '../index.html'; return; }
    DB.getMinhaFila(cpf)
      .then(r => { location.href = r.ativa ? 'fila.html' : 'index.html'; })
      .catch(() => { location.href = 'index.html'; });
  },

  /* Sair da conta com confirmação → volta para o portal */
  sair() {
    UI.modalConfirmar({
      titulo: 'Sair da conta?',
      texto: 'Você voltará para o portal principal.',
      botao: 'Sair', perigo: true,
      onConfirmar: () => {
        DB.clearSessao();
        localStorage.removeItem('vidamais_ultimo_status');
        location.href = '../index.html';
      }
    });
  },

  /* Atualiza o contador de notificações não lidas no sino */
  atualizarBadge() {
    const badge = document.getElementById('badge-notif');
    if (!badge) return;
    const cpf = DB.getSessao();
    if (!cpf) { badge.classList.add('escondido'); return; }
    DB.naoLidas(cpf).then(n => {
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
    // Logo (topbar) → home
    const logo = document.querySelector('.topbar .logo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.onclick = () => Nav.irParaHome();
    }

    // Sino (topbar) → central de notificações
    const sino = document.getElementById('btn-notif');
    if (sino) sino.onclick = () => location.href = 'notificacoes.html';

    // Botão sair (topbar)
    const sair = document.getElementById('btn-sair');
    if (sair) sair.onclick = () => Nav.sair();

    // Item "Início" do menu inferior → home dinâmica
    document.querySelectorAll('.bottomnav a[data-ir-home]').forEach(a => {
      a.onclick = (e) => { e.preventDefault(); Nav.irParaHome(); };
    });

    // Badge do sino
    Nav.atualizarBadge();
    setInterval(Nav.atualizarBadge, 20000);
  }
};

/* Liga os controles assim que o DOM estiver pronto
   (funciona mesmo se o script carregar depois do DOM pronto) */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Nav.iniciar);
} else {
  Nav.iniciar();
}

/* ============================================================
   MANUTENÇÃO DE DESENVOLVIMENTO
   ------------------------------------------------------------
   Descarta o service worker e limpa os caches ANTIGOS para que
   o navegador SEMPRE mostre a versão mais nova do app.
   Remova este bloco na versão final (apresentação) se quiser
   religar o PWA offline.
   ============================================================ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  }).catch(() => {});
}
if (window.caches) {
  caches.keys().then(chaves => chaves.forEach(k => caches.delete(k))).catch(() => {});
}
