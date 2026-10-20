/* Tela do vendedor: registra as próprias vendas e acompanha a própria meta. Sem acesso a dados da loja. */
(async function () {
  const eu = await protegerPagina("vendedor");
  if (!eu) return;
  document.getElementById("ola").textContent = "Olá, " + eu.nome.split(" ")[0] + "!";

  const rl = await supa().from("vendedores_loja").select("empresa_id,loja_nome,ativo").eq("perfil_id", eu.id).eq("ativo", true);
  const lojas = rl.data || [];
  if (!lojas.length) { document.getElementById("semLoja").hidden = false; return; }
  document.getElementById("area").hidden = false;

  const hoje = hojeISO();
  const selLoja = document.getElementById("selLoja"), selMes = document.getElementById("selMes");
  selLoja.innerHTML = lojas.map(function (l) { return '<option value="' + l.empresa_id + '">' + esc(l.loja_nome || "Loja") + "</option>"; }).join("");
  document.getElementById("blocoLoja").hidden = lojas.length < 2;
  selMes.value = hoje.slice(0, 7);
  document.getElementById("vData").value = hoje;
  let vendas = [], meta = null, editId = null, grafico = null;

  function loja() { return selLoja.value; }
  function periodo() {
    const p = selMes.value.split("-").map(Number);
    const n = diasNoMes(p[0], p[1] - 1);
    return { ano: p[0], mes0: p[1] - 1, ini: selMes.value + "-01", fim: selMes.value + "-" + String(n).padStart(2, "0"), dias: n };
  }

  async function carregar() {
    const pr = periodo();
    document.getElementById("lojaNome").textContent = (lojas.find(function (l) { return l.empresa_id === loja(); }) || {}).loja_nome || "";
    const [rv, rm] = await Promise.all([
      supa().from("vendas").select("id,data,valor,itens,forma_pagamento,observacao,criado_em").eq("vendedor_id", eu.id).eq("empresa_id", loja())
        .gte("data", pr.ini).lte("data", pr.fim).order("data", { ascending: false }).order("criado_em", { ascending: false }),
      supa().from("metas_vendedor").select("valor_meta").eq("vendedor_id", eu.id).eq("empresa_id", loja()).eq("mes_referencia", pr.ini).maybeSingle()
    ]);
    vendas = rv.data || [];
    meta = rm.data ? +rm.data.valor_meta : null;
    desenhar();
  }

  function desenhar() {
    const pr = periodo();
    const total = vendas.reduce(function (s, v) { return s + +v.valor; }, 0);
    document.getElementById("vendido").textContent = brl(total);
    document.getElementById("meta").textContent = meta ? brl(meta) : "a definir";
    const p = meta ? total / meta : 0;
    const barra = document.querySelector(".barra-meta");
    document.getElementById("barra").style.width = Math.min(100, p * 100) + "%";
    barra.classList.toggle("batida", meta && total >= meta);
    let ritmo = "";
    if (!meta) ritmo = "Sua meta deste mês ainda não foi definida pelo responsável da loja.";
    else if (total >= meta) ritmo = "🎉 Meta batida! Você passou " + brl(total - meta) + " da meta (" + pct(p) + ").";
    else {
      const esteMes = selMes.value === hoje.slice(0, 7);
      const diasRest = esteMes ? pr.dias - (+hoje.slice(8, 10)) + 1 : 0;
      ritmo = pct(p) + " da meta. Faltam " + brl(meta - total) + (diasRest > 0 ? ": cerca de " + brl((meta - total) / diasRest) + " por dia nos " + diasRest + (diasRest === 1 ? " dia restante." : " dias restantes.") : ".");
    }
    document.getElementById("ritmo").textContent = ritmo;

    const sem = semanasDoMes(pr.ano, pr.mes0);
    const porSem = sem.map(function () { return 0; });
    const porDia = []; for (let i = 0; i < pr.dias; i++) porDia.push(0);
    vendas.forEach(function (v) { const d = +v.data.slice(8, 10); porSem[semanaDoDia(d)] += +v.valor; porDia[d - 1] += +v.valor; });
    document.getElementById("semanas").innerHTML = sem.map(function (s, i) {
      const m = meta ? meta * (s.fim - s.ini + 1) / pr.dias : null;
      return "<tr><td>Semana " + (i + 1) + '<br><span class="vazio" style="padding:0">dias ' + s.ini + " a " + s.fim + '</span></td><td class="n">' + brl(porSem[i]) + '</td><td class="n">' +
        (m ? '<b class="' + (porSem[i] >= m ? "v-receita" : "") + '">' + pct(porSem[i] / m) + '</b><br><span class="vazio" style="padding:0">meta ' + brl(m) + "</span>" : "–") + "</td></tr>";
    }).join("");

    document.getElementById("lista").innerHTML = vendas.length ? vendas.map(function (v) {
      const editavel = Date.now() - new Date(v.criado_em).getTime() < 24 * 3600 * 1000;
      const det = [v.itens !== null ? v.itens + (v.itens === 1 ? " peça" : " peças") : "", v.forma_pagamento || "", v.observacao || ""].filter(Boolean).map(esc).join(" · ");
      return "<tr><td>" + dataBR(v.data) + '</td><td class="n"><b>' + brl(v.valor) + '</b></td><td class="quebra">' + det + "</td><td>" +
        (editavel ? '<button class="btn peq contorno" type="button" data-ed="' + v.id + '">Corrigir</button> <button class="btn peq perigo" type="button" data-del="' + v.id + '">Apagar</button>' : "") + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="vazio">Nenhuma venda registrada neste mês.</td></tr>';

    if (typeof Chart !== "undefined") {
      if (grafico) grafico.destroy();
      const metaDia = meta ? meta / pr.dias : null;
      const ds = [{ type: "bar", label: "Vendido", data: porDia, backgroundColor: "#C9A24A", borderRadius: 3 }];
      if (metaDia) ds.push({ type: "line", label: "Meta do dia", data: porDia.map(function () { return metaDia; }), borderColor: "#0B1F3A", borderDash: [5, 4], pointRadius: 0 });
      grafico = new Chart(document.getElementById("gDias"), { type: "bar", data: { labels: porDia.map(function (_, i) { return i + 1; }), datasets: ds },
        options: { maintainAspectRatio: false, plugins: { legend: { display: !!metaDia } }, scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return "R$ " + Number(v).toLocaleString("pt-BR"); } } } } } });
    }
  }

  const f = document.getElementById("formVenda");
  function limpar() {
    editId = null; f.reset(); document.getElementById("vData").value = hoje;
    document.getElementById("tituloForm").textContent = "Registrar venda"; document.getElementById("vSalvar").textContent = "Registrar venda"; document.getElementById("vCancelar").hidden = true;
  }
  document.getElementById("vCancelar").addEventListener("click", limpar);
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    const valor = lerValor(document.getElementById("vValor").value);
    if (!(valor > 0)) { aviso("Escreva o valor da venda. Ex.: 189,90", true); document.getElementById("vValor").focus(); return; }
    const itens = document.getElementById("vItens").value;
    const reg = { empresa_id: loja(), vendedor_id: eu.id, data: document.getElementById("vData").value || hoje, valor: valor, itens: itens === "" ? null : +itens,
      forma_pagamento: document.getElementById("vForma").value, observacao: document.getElementById("vObs").value.trim() || null };
    const b = document.getElementById("vSalvar"); b.disabled = true;
    const r = editId ? await supa().from("vendas").update(reg).eq("id", editId) : await supa().from("vendas").insert(reg);
    b.disabled = false;
    if (r.error) { aviso(editId ? "Não foi possível corrigir. Já se passaram 24 horas?" : "Não foi possível registrar a venda.", true); return; }
    aviso(editId ? "Venda corrigida." : "Venda de " + brl(valor) + " registrada!");
    if (reg.data.slice(0, 7) !== selMes.value) selMes.value = reg.data.slice(0, 7);
    limpar();
    await carregar();
    document.getElementById("vValor").focus();
  });
  document.getElementById("lista").addEventListener("click", async function (e) {
    const be = e.target.closest("[data-ed]"), bd = e.target.closest("[data-del]");
    if (be) {
      const v = vendas.find(function (x) { return x.id === be.dataset.ed; }); if (!v) return;
      editId = v.id;
      document.getElementById("vValor").value = String(v.valor).replace(".", ",");
      document.getElementById("vItens").value = v.itens === null ? "" : v.itens;
      document.getElementById("vForma").value = v.forma_pagamento || "Outro";
      document.getElementById("vData").value = v.data; document.getElementById("vObs").value = v.observacao || "";
      document.getElementById("tituloForm").textContent = "Corrigindo venda"; document.getElementById("vSalvar").textContent = "Salvar correção";
      document.getElementById("vCancelar").hidden = false;
      document.getElementById("cartaoForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (bd) {
      const v = vendas.find(function (x) { return x.id === bd.dataset.del; });
      if (!v || !confirm("Apagar a venda de " + brl(v.valor) + " do dia " + dataBR(v.data) + "?")) return;
      const { error } = await supa().from("vendas").delete().eq("id", v.id);
      if (error) { aviso("Não foi possível apagar.", true); return; }
      aviso("Venda apagada."); await carregar();
    }
  });
  selLoja.addEventListener("change", carregar);
  selMes.addEventListener("change", function () { if (selMes.value) carregar(); });
  await carregar();
})();
