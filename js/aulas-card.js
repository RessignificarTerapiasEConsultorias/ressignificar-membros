/* Mostra o cartão "Aulas da mentoria" só para quem o Mauricio liberou. */
(async function () {
  const el = document.getElementById("cartaoAulas");
  if (!el) return;
  try {
    const { data: { session } } = await supa().auth.getSession();
    if (!session) return;
    const { data } = await supa().from("aulas_acesso").select("perfil_id").eq("perfil_id", session.user.id).maybeSingle();
    if (data) el.hidden = false;
  } catch (e) { /* sem cartão, sem problema */ }
})();
