/* Mentoria (master e suporte): todos os mentorados, com atalho para o painel de cada um e para as aulas. */
(async function () {
  const eu = await protegerPagina(["master", "suporte"]);
  if (!eu) return;
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  const $ = function (id) { return document.getElementById(id); };
  let mentorados = [];

  async function carregar() {
    const r = await supa().rpc("mentoria_mentorados_lista");
    mentorados = r.data || [];
    desenhar();
  }
  function desenhar() {
    const f = ($("busca").value || "").toLowerCase().trim();
    const lista = mentorados.filter(function (p) { return !f || p.nome.toLowerCase().indexOf(f) > -1; });
    const tb = $("lista"); tb.innerHTML = "";
    if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="vazio">' + (mentorados.length ? "Ninguém com esse nome." : "Nenhum mentorado ainda. Marque o serviço \"Mentoria\" em Pessoas e acessos.") + "</td></tr>"; return; }
    lista.forEach(function (p) {
      const tr = document.createElement("tr");
      const td0 = document.createElement("td"); const b = document.createElement("b"); b.textContent = p.nome; td0.appendChild(b);
      if (p.telefone) { const s = document.createElement("small"); s.className = "vazio"; s.style.cssText = "display:block;padding:0"; s.textContent = foneBR(p.telefone); td0.appendChild(s); }
      tr.appendChild(td0);
      function cel(txt, cls) { const td = document.createElement("td"); if (cls) td.className = cls; td.textContent = txt; tr.appendChild(td); return td; }
      cel(p.aulas_vistas + " de " + p.aulas_total, "n");
      cel(String(p.resultados_total), "n");
      const tdA = cel(String(p.acoes_pendentes), "n"); if (p.acoes_pendentes > 0) tdA.classList.add("v-pendente");
      const tdT = cel(String(p.atividades_pendentes), "n"); if (p.atividades_pendentes > 0) tdT.classList.add("v-pendente");
      const td = document.createElement("td");
      const a1 = document.createElement("a"); a1.className = "btn peq"; a1.href = "mentoria.html?p=" + encodeURIComponent(p.perfil_id); a1.textContent = "Abrir"; td.appendChild(a1);
      tr.appendChild(td); tb.appendChild(tr);
    });
  }
  $("busca").addEventListener("input", desenhar);
  await carregar();
})();
