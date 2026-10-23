/* Painel do cliente: mostra "Pessoas que você acompanha" quando o Mauricio liberou o acesso a alguém. */
(async function () {
  const el = document.getElementById("cartaoAcompanha"), lista = document.getElementById("listaAcompanha");
  if (!el || !lista) return;
  try {
    const { data: { session } } = await supa().auth.getSession();
    if (!session) return;
    const { data } = await supa().rpc("terapia_meus_acompanhados");
    if (!data || !data.length) return;
    lista.innerHTML = "";
    data.forEach(function (p) {
      const li = document.createElement("li"); li.className = "acao";
      const n = document.createElement("b"); n.textContent = p.nome; li.appendChild(n);
      const a = document.createElement("a"); a.className = "btn peq"; a.style.marginLeft = "10px"; a.href = "terapia.html?p=" + encodeURIComponent(p.paciente_id); a.textContent = "Abrir"; li.appendChild(a);
      lista.appendChild(li);
    });
    el.hidden = false;
  } catch (e) { /* sem cartão, sem problema */ }
})();
