/* Vendas da equipe: dono da loja, master e suporte. Metas, ranking, semanas e vínculo de vendedores. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  const gestor = eu.papel !== "cliente";
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  document.querySelectorAll(gestor ? ".so-dono" : ".so-gestor").forEach(function (el) { el.remove(); });

  function falha(msg) { document.getElementById("falhaMsg").textContent = msg; document.getElementById("falha").hidden = false; }
  const eid = new URLSearchParams(location.search).get("e");
  if (!eid) return falha("Nenhuma loja escolhida.");
  const re = await supa().from("empresas").select("id,nome,tipo").eq("id", eid).maybeSingle();
  if (!re.data) return falha("Esta loja não existe ou você não tem acesso a ela.");
  if (!gestor) {
    const rm = await supa().from("empresa_membros").select("funcao").eq("empresa_id", eid).eq("perfil_id", eu.id).maybeSingle();
    if (!rm.data || rm.data.funcao !== "dono") return falha("Só o dono da loja acompanha as vendas da equipe.");
  }
  document.getElementById("titulo").textContent = "Vendas da equipe: " + re.data.nome;
  document.getElementById("linkDre").href = "dre.html?e=" + eid;
  document.getElementById("area").hidden = false;

  const hoje = hojeISO();
  const selMes = document.getElementById("selMes");
  selMes.value = hoje.slice(0, 7);
  let vinc = [], vendas = [], metas = [], perfisVend = [], graficos = {};
  const nomeDe = function (pid) { const v = vinc.find(function (x) { return x.perfil_id === pid; }); return v ? v.nome : "Vendedor"; };
  function periodo() {
    const p = selMes.value.split("-").map(Number), n = diasNoMes(p[0], p[1] - 1);
    return { ano: p[0], mes0: p[1] - 1, ini: selMes.value + "-01", fim: selMes.value + "-" + String(n).padStart(2, "0"), dias: n };
  }
  function grafico(id, cfg) { if (typeof Chart === "undefined") return; if (graficos[id]) graficos[id].destroy(); graficos[id] = new Chart(document.getElementById(id), cfg); }
  const moedaTick = function (v) { return "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }); };

  async function carregar() {
    const pr = periodo();
    const pedidos = [
      supa().from("vendedores_loja").select("perfil_id,nome,ativo").eq("empresa_id", eid).order("nome"),
      buscarTudo(function () { return supa().from("vendas").select("id,vendedor_id,data,valor,itens,forma_pagamento,observacao").eq("empresa_id", eid).gte("data", pr.ini).lte("data", pr.fim).order("data", { ascending: false }); }),
      supa().from("metas_vendedor").select("id,vendedor_id,valor_meta").eq("empresa_id", eid).eq("mes_referencia", pr.ini)
    ];
    if (gestor) pedidos.push(supa().from("perfis").select("id,nome,papel,ativo").in("papel", ["vendedor", "master", "suporte", "cliente"]).order("nome"));
    const r = await Promise.all(pedidos);
    vinc = r[0].data || []; vendas = r[1] || []; metas = r[2].data || [];
    if (gestor) perfisVend = (r[3].data || []).filter(function (p) { return p.ativo; });
    desenhar();
  }

  function desenhar() {
    const pr = periodo(), sem = semanasDoMes(pr.ano, pr.mes0);
    const ativos = vinc.filter(function (v) { return v.ativo || vendas.some(function (x) { return x.vendedor_id === v.perfil_id; }); });
    const linhas = ativos.map(function (v) {
      const l = vendas.filter(function (x) { return x.vendedor_id === v.perfil_id; });
      const tot = l.reduce(function (s, x) { return s + +x.valor; }, 0);
      const m = metas.find(function (x) { return x.vendedor_id === v.perfil_id; });
      const ps = sem.map(function () { return 0; });
      l.forEach(function (x) { ps[semanaDoDia(+x.data.slice(8, 10))] += +x.valor; });
      return { v: v, n: l.length, tot: tot, meta: m ? +m.valor_meta : null, sem: ps };
    }).sort(function (a, b) { return b.tot - a.tot; });

    const total = linhas.reduce(function (s, x) { return s + x.tot; }, 0);
    const metaEq = linhas.reduce(function (s, x) { return s + (x.meta || 0); }, 0);
    const nV = linhas.reduce(function (s, x) { return s + x.n; }, 0);
    const k = [["Vendido no mês", brl(total), nV + (nV === 1 ? " venda" : " vendas")],
      ["Meta da equipe", metaEq ? brl(metaEq) : "–", metaEq ? "soma das metas" : "defina as metas abaixo"],
      ["Atingido", metaEq ? '<span class="' + (total >= metaEq ? "sobe" : "") + '">' + pct(total / metaEq) + "</span>" : "–", metaEq && total < metaEq ? "faltam " + brl(metaEq - total) : (metaEq ? "meta da equipe batida!" : "")],
      ["Ticket médio", nV ? brl(total / nV) : "–", "valor médio por venda"]];
    document.getElementById("kpis").innerHTML = k.map(function (c) { return '<div class="kpi"><small>' + c[0] + "</small><b>" + c[1] + "</b><span>" + c[2] + "</span></div>"; }).join("");

    document.getElementById("tabEquipe").innerHTML = "<thead><tr><th>Vendedor</th><th class=\"n\">Vendido</th><th>Meta do mês</th><th class=\"n\">Atingido</th><th class=\"n\">Vendas</th><th class=\"n\">Ticket</th>" +
      sem.map(function (s, i) { return '<th class="n">Sem ' + (i + 1) + "<br><span style=\"font-weight:500\">" + s.ini + "–" + s.fim + "</span></th>"; }).join("") + "</tr></thead><tbody>" +
      (linhas.length ? linhas.map(function (x) {
        const p = x.meta ? x.tot / x.meta : null;
        return "<tr><td><b>" + esc(x.v.nome) + "</b>" + (x.v.ativo ? "" : ' <span class="selo off">inativo</span>') + '</td><td class="n"><b>' + brl(x.tot) + "</b></td>" +
          '<td><input class="meta-input" data-meta="' + x.v.perfil_id + '" inputmode="decimal" placeholder="0,00" value="' + (x.meta ? String(x.meta).replace(".", ",") : "") + '"></td>' +
          '<td class="n">' + (p === null ? "–" : '<b class="' + (p >= 1 ? "v-receita" : "") + '">' + pct(p) + '</b><span class="mini-barra"><span style="width:' + Math.min(100, p * 100) + '%"></span></span>') + "</td>" +
          '<td class="n">' + x.n + '</td><td class="n">' + (x.n ? brl(x.tot / x.n) : "–") + "</td>" +
          x.sem.map(function (vs, i) {
            const ms = x.meta ? x.meta * (sem[i].fim - sem[i].ini + 1) / pr.dias : null;
            return '<td class="n' + (ms && vs >= ms ? " v-receita" : "") + '">' + (vs ? brl(vs) : "–") + "</td>";
          }).join("") + "</tr>";
      }).join("") : '<tr><td colspan="' + (6 + sem.length) + '" class="vazio">Nenhum vendedor ligado a esta loja ainda.</td></tr>') + "</tbody>";

    grafico("gRank", { type: "bar", data: { labels: linhas.map(function (x) { return x.v.nome.split(" ")[0]; }), datasets: [
      { label: "Vendido", data: linhas.map(function (x) { return x.tot; }), backgroundColor: "#C9A24A", borderRadius: 4 },
      { label: "Meta", data: linhas.map(function (x) { return x.meta || 0; }), backgroundColor: "#E3DCCD", borderRadius: 4 }] },
      options: { indexAxis: "y", maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { callback: moedaTick } } } } });
    const porDia = []; for (let i = 0; i < pr.dias; i++) porDia.push(0);
    vendas.forEach(function (x) { porDia[+x.data.slice(8, 10) - 1] += +x.valor; });
    grafico("gDia", { type: "bar", data: { labels: porDia.map(function (_, i) { return i + 1; }), datasets: [{ label: "Vendido", data: porDia, backgroundColor: "#0B1F3A", borderRadius: 3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: moedaTick } } } } });

    const fv = document.getElementById("filtroVend"), atual = fv.value;
    fv.innerHTML = '<option value="">Todos os vendedores</option>' + vinc.map(function (v) { return '<option value="' + v.perfil_id + '">' + esc(v.nome) + "</option>"; }).join("");
    fv.value = atual;
    desenharLista();

    if (gestor) {
      const ligados = vinc.map(function (v) { return v.perfil_id; });
      document.getElementById("addVend").innerHTML = perfisVend.filter(function (p) { return ligados.indexOf(p.id) === -1; }).map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + (p.papel !== "vendedor" ? " (" + ROTULO_PAPEL[p.papel] + ")" : "") + "</option>"; }).join("") || '<option value="">Nenhuma pessoa disponível</option>';
      document.getElementById("listaVinc").innerHTML = vinc.length ? vinc.map(function (v) {
        return "<tr><td>" + esc(v.nome) + "</td><td>" + (v.ativo ? '<span class="selo ok">Ativo</span>' : '<span class="selo off">Inativo</span>') + "</td>" +
          '<td><button class="btn peq contorno" type="button" data-vinc="' + v.perfil_id + '" data-ativo="' + (v.ativo ? "1" : "") + '">' + (v.ativo ? "Desligar da loja" : "Religar") + "</button> " +
          '<button class="btn peq perigo" type="button" data-excluir-vinc="' + v.perfil_id + '">Excluir</button></td></tr>';
      }).join("") : '<tr><td class="vazio">Nenhum vendedor ligado.</td></tr>';
    }
  }
  function desenharLista() {
    const fv = document.getElementById("filtroVend").value;
    const l = vendas.filter(function (x) { return !fv || x.vendedor_id === fv; });
    document.getElementById("listaVendas").innerHTML = l.length ? l.map(function (x) {
      const det = [x.itens !== null ? x.itens + (x.itens === 1 ? " peça" : " peças") : "", x.forma_pagamento || "", x.observacao || ""].filter(Boolean).map(esc).join(" · ");
      return "<tr><td>" + dataBR(x.data) + "</td><td>" + esc(nomeDe(x.vendedor_id)) + '</td><td class="n"><b>' + brl(x.valor) + '</b></td><td class="quebra">' + det + "</td>" +
        '<td><button class="btn peq perigo" type="button" data-del="' + x.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="vazio">Nenhuma venda neste mês.</td></tr>';
  }
  document.getElementById("filtroVend").addEventListener("change", desenharLista);
  selMes.addEventListener("change", function () { if (selMes.value) carregar(); });

  document.getElementById("salvarMetas").addEventListener("click", async function () {
    const pr = periodo(), regs = [], apagar = [];
    let erro = false;
    document.querySelectorAll("[data-meta]").forEach(function (inp) {
      const t = inp.value.trim();
      if (!t) { const m = metas.find(function (x) { return x.vendedor_id === inp.dataset.meta; }); if (m) apagar.push(m.id); return; }
      const v = lerValor(t);
      if (!(v > 0)) { erro = true; return; }
      regs.push({ empresa_id: eid, vendedor_id: inp.dataset.meta, mes_referencia: pr.ini, valor_meta: v });
    });
    if (erro) { aviso("Confira os valores das metas. Ex.: 20.000,00", true); return; }
    const b = this; b.disabled = true;
    let ok = true;
    if (regs.length) { const r = await supa().from("metas_vendedor").upsert(regs, { onConflict: "empresa_id,vendedor_id,mes_referencia" }); if (r.error) ok = false; }
    if (apagar.length) { const r = await supa().from("metas_vendedor").delete().in("id", apagar); if (r.error) ok = false; }
    b.disabled = false;
    if (!ok) { aviso("Não foi possível salvar as metas.", true); return; }
    aviso("Metas de " + MESES_LONGOS[pr.mes0] + " salvas.");
    await carregar();
  });

  document.querySelector("main").addEventListener("click", async function (e) {
    const bd = e.target.closest("[data-del]"), bv = e.target.closest("[data-vinc]");
    if (bd) {
      const x = vendas.find(function (v) { return v.id === bd.dataset.del; });
      if (!x || !confirm("Apagar a venda de " + brl(x.valor) + " de " + nomeDe(x.vendedor_id) + " (" + dataBR(x.data) + ")?")) return;
      const { error } = await supa().from("vendas").delete().eq("id", x.id);
      if (error) { aviso("Não foi possível apagar.", true); return; }
      aviso("Venda apagada."); await carregar();
    }
    if (bv) {
      const { error } = await supa().from("vendedores_loja").update({ ativo: !bv.dataset.ativo }).eq("empresa_id", eid).eq("perfil_id", bv.dataset.vinc);
      if (error) { aviso("Não foi possível alterar.", true); return; }
      await carregar();
    }
    const bx = e.target.closest("[data-excluir-vinc]");
    if (bx) {
      const v = vinc.find(function (x) { return x.perfil_id === bx.dataset.excluirVinc; });
      const temVendas = vendas.some(function (x) { return x.vendedor_id === bx.dataset.excluirVinc; });
      const msg = temVendas
        ? "Excluir " + (v ? v.nome : "este vendedor") + " desta loja?\n\nAs vendas já lançadas continuam no histórico, mas a pessoa volta para a lista de vendedores disponíveis."
        : "Excluir " + (v ? v.nome : "este vendedor") + " desta loja?\n\nA pessoa volta para a lista de vendedores disponíveis.";
      if (!confirm(msg)) return;
      const { error } = await supa().from("vendedores_loja").delete().eq("empresa_id", eid).eq("perfil_id", bx.dataset.excluirVinc);
      if (error) { aviso("Não foi possível excluir.", true); return; }
      aviso("Vendedor removido da loja.");
      await carregar();
    }
  });
  const btAdd = document.getElementById("btAddVend");
  if (btAdd) btAdd.addEventListener("click", async function () {
    const pid = document.getElementById("addVend").value;
    if (!pid) { aviso("Crie primeiro o acesso do vendedor em Pessoas e acessos.", true); return; }
    const p = perfisVend.find(function (x) { return x.id === pid; });
    const { error } = await supa().from("vendedores_loja").insert({ empresa_id: eid, perfil_id: pid, nome: p.nome });
    if (error) { aviso("Não foi possível ligar o vendedor.", true); return; }
    aviso(p.nome + " ligado(a) à loja.");
    await carregar();
  });

  await carregar();
})();
