/* Terapia (só o master): todos os pacientes de terapia, com atalho para o processo e para os acessos de acompanhantes. */
(async function () {
  const eu = await protegerPagina(["master"]);
  if (!eu) return;
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  const $ = function (id) { return document.getElementById(id); };
  let pacientes = [];

  async function carregar() {
    const [rl, rc] = await Promise.all([
      supa().rpc("terapia_pacientes_lista"),
      supa().from("perfis").select("id,nome,papel,ativo").eq("papel", "cliente").order("nome")
    ]);
    pacientes = rl.data || [];
    const ids = pacientes.map(function (p) { return p.id; });
    const livres = (rc.data || []).filter(function (p) { return p.ativo && ids.indexOf(p.id) === -1; });
    $("novoPac").innerHTML = '<option value="">Escolha a pessoa</option>' + livres.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join("");
    desenhar();
  }
  function desenhar() {
    const f = ($("busca").value || "").toLowerCase().trim();
    const lista = pacientes.filter(function (p) { return !f || p.nome.toLowerCase().indexOf(f) > -1; });
    const tb = $("lista"); tb.innerHTML = "";
    if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="vazio">' + (pacientes.length ? "Ninguém com esse nome." : "Nenhum paciente de terapia ainda. Adicione acima.") + "</td></tr>"; return; }
    lista.forEach(function (p) {
      const tr = document.createElement("tr");
      const td0 = document.createElement("td"); const b = document.createElement("b"); b.textContent = p.nome; td0.appendChild(b);
      if (p.telefone) { const s = document.createElement("small"); s.className = "vazio"; s.style.cssText = "display:block;padding:0"; s.textContent = foneBR(p.telefone); td0.appendChild(s); }
      tr.appendChild(td0);
      function cel(txt, cls) { const td = document.createElement("td"); if (cls) td.className = cls; td.textContent = txt; tr.appendChild(td); return td; }
      cel(String(p.sessoes), "n"); cel(p.ultima_sessao ? dataBR(p.ultima_sessao) : "—");
      const tdA = cel(String(p.acoes_pendentes), "n"); if (p.acoes_pendentes > 0) tdA.classList.add("v-pendente");
      cel(String(p.acompanhantes), "n");
      const td = document.createElement("td");
      const a1 = document.createElement("a"); a1.className = "btn peq"; a1.href = "terapia.html?p=" + encodeURIComponent(p.id); a1.textContent = "Abrir"; td.appendChild(a1); td.appendChild(document.createTextNode(" "));
      const a2 = document.createElement("a"); a2.className = "btn peq contorno"; a2.href = "terapia.html?p=" + encodeURIComponent(p.id) + "&aba=acessos"; a2.textContent = "Acessos"; td.appendChild(a2);
      tr.appendChild(td); tb.appendChild(tr);
    });
  }
  $("busca").addEventListener("input", desenhar);
  $("addPac").addEventListener("click", async function () {
    const v = $("novoPac").value;
    if (!v) { aviso("Escolha a pessoa.", true); return; }
    const r = await supa().rpc("terapia_paciente_adicionar", { p_perfil: v });
    if (r.error || !r.data || !r.data.ok) { aviso("Não foi possível adicionar.", true); return; }
    aviso("Paciente adicionado."); await carregar();
  });
  await carregar();
})();
