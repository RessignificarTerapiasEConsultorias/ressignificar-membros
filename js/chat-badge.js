/* Mostra "N novas" no atalho do chat quando há conversa individual não lida. */
(async function () {
  const el = document.getElementById("chatBadge");
  if (!el) return;
  try {
    const { data: { session } } = await supa().auth.getSession();
    if (!session) return;
    const { data, error } = await supa().rpc("chat_privado_nao_lidas");
    const n = Number(data) || 0;
    if (!error && n > 0) { el.textContent = n + (n === 1 ? " nova" : " novas"); el.hidden = false; }
  } catch (e) { /* sem contador, sem problema */ }
})();
