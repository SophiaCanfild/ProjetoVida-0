/* Relógio + data em tempo real (modo TV) */
function iniciarRelogio(elHora, elData) {
  function atualizar() {
    const agora = new Date();
    if (elHora) {
      elHora.textContent = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    if (elData) {
      elData.textContent = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
  }
  atualizar();
  setInterval(atualizar, 1000);
}
