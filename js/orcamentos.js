/* Meus orçamentos (só o master): painel único (clientes + gastos + sobra), plano de ação e meta do mês. */
(async function () {
  const eu = await protegerPagina(["master"]);
  if (!eu) return;
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  const $ = function (id) { return document.getElementById(id); };
  const hojeD = new Date(), ano = hojeD.getFullYear(), mes = hojeD.getMonth() + 1;
  const iso = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const hoje = iso(hojeD), mesIni = ano + "-" + String(mes).padStart(2, "0") + "-01", mesFim = iso(new Date(ano, mes, 1));
  const mais30 = iso(new Date(ano, mes - 1, hojeD.getDate() + 30));
  const NOMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  $("mesTitulo").textContent = "· " + NOMES[mes - 1] + " de " + ano;
  const soma = function (l) { return l.reduce(function (s, x) { return s + (+x.valor); }, 0); };

  // empresa do orçamento pessoal (a mesma onde os recebimentos entram na DRE)
  let empPessoal = null;
  try {
    const rp = await supa().from("preferencias").select("dados").eq("perfil_id", eu.id).maybeSingle();
    empPessoal = rp.data && rp.data.dados ? rp.data.dados.dre_empresa_id : null;
    if (!empPessoal) { const re = await supa().from("empresas").select("id").eq("tipo", "pessoal").order("criado_em").limit(1); empPessoal = re.data && re.data[0] ? re.data[0].id : null; }
  } catch (e) {}
  if (empPessoal) $("irPessoal").href = "dre.html?e=" + encodeURIComponent(empPessoal);
  if (empPessoal) $("irMeta").href = "dre.html?e=" + encodeURIComponent(empPessoal);

  async function gastoDoMes(a, m) {
    if (!empPessoal) return 0;
    const ini = a + "-" + String(m).padStart(2, "0") + "-01", p = new Date(a, m, 1), fim = iso(p);
    const [rc, rl] = await Promise.all([
      supa().from("contas").select("id").eq("empresa_id", empPessoal).eq("tipo", "despesa"),
      supa().from("lancamentos").select("valor,conta_id").eq("empresa_id", empPessoal).gte("data", ini).lt("data", fim).limit(5000)
    ]);
    const ids = new Set((rc.data || []).map(function (c) { return c.id; }));
    return (rl.data || []).filter(function (l) { return ids.has(l.conta_id); }).reduce(function (s, l) { return s + (+l.valor); }, 0);
  }

  const cobr = await buscarTudo(function () { return supa().from("cobrancas").select("id,perfil_id,descricao,valor,vencimento,pago_em").order("vencimento"); });
  const recebido = soma(cobr.filter(function (c) { return c.pago_em && c.pago_em >= mesIni && c.pago_em < mesFim; }));
  const aReceber = soma(cobr.filter(function (c) { return !c.pago_em && c.vencimento >= hoje && c.vencimento < mesFim; }));
  const atrasadas = cobr.filter(function (c) { return !c.pago_em && c.vencimento < hoje; });
  const proximos30 = soma(cobr.filter(function (c) { return !c.pago_em && c.vencimento >= hoje && c.vencimento <= mais30; }));
  const gasto = await gastoDoMes(ano, mes), sobra = recebido - gasto;
  const cards = [
    ["Recebido no mês", brl(recebido), "v-receita", "clientes que já pagaram"],
    ["A receber no mês", brl(aReceber), "v-pendente", "vence até o fim do mês"],
    ["Em atraso", brl(soma(atrasadas)), atrasadas.length ? "v-saida" : "", atrasadas.length + (atrasadas.length === 1 ? " cobrança" : " cobranças")],
    ["Próximos 30 dias", brl(proximos30), "v-pendente", "a vencer"],
    ["Gasto do mês", brl(gasto), "v-saida", empPessoal ? "orçamento pessoal" : "sem orçamento pessoal"],
    ["Sobra do mês", brl(sobra), sobra >= 0 ? "v-receita" : "v-saida", "recebido menos gasto"]
  ];
  $("kpis").innerHTML = cards.map(function (c) { return '<div class="kpi"><small>' + c[0] + '</small><b class="' + c[2] + '">' + c[1] + "</b><span>" + c[3] + "</span></div>"; }).join("");
  $("notaPainel").textContent = "Recebido = pagamentos de clientes com data de pagamento neste mês. Gasto = despesas lançadas no orçamento pessoal neste mês.";

  // gráfico: últimos 6 meses (recebido x gasto)
  const meses = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(ano, mes - 1 - i, 1); meses.push({ a: d.getFullYear(), m: d.getMonth() + 1 }); }
  const gastos = await Promise.all(meses.map(function (x) { return gastoDoMes(x.a, x.m); }));
  const recs = meses.map(function (x) {
    const ini = x.a + "-" + String(x.m).padStart(2, "0") + "-01", fim = iso(new Date(x.a, x.m, 1));
    return soma(cobr.filter(function (c) { return c.pago_em && c.pago_em >= ini && c.pago_em < fim; }));
  });
  if (typeof Chart !== "undefined") {
    new Chart($("gOrc"), { type: "bar", data: { labels: meses.map(function (x) { return NOMES[x.m - 1].slice(0, 3) + "/" + String(x.a).slice(2); }), datasets: [
      { label: "Recebido", data: recs, backgroundColor: "#1FA855", borderRadius: 4 }, { label: "Gasto", data: gastos, backgroundColor: "#C62828", borderRadius: 4 }] },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return brl(v).replace(",00", ""); } } } }, plugins: { tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + brl(c.parsed.y); } } } } } });
  }

  // plano de ação (ações da meta geral deste mês + sugestões do sistema)
  const [rm, ra] = await Promise.all([
    supa().from("metas_receita").select("valor_meta").eq("perfil_id", eu.id).is("empresa_id", null).eq("mes_referencia", mesIni).maybeSingle(),
    supa().from("acoes_meta").select("id,acao,problema,prazo,status,dono").eq("perfil_id", eu.id).is("empresa_id", null).eq("mes_referencia", mesIni).order("criado_em")
  ]);
  const acoes = ra.data || [], planoBox = $("planoBox"); planoBox.innerHTML = "";
  const lista = document.createElement("ul"); lista.className = "res-lista";
  const rot = { a_fazer: ["A fazer", "selo"], em_andamento: ["Em andamento", "selo pendente"], concluida: ["Concluída", "selo ok"], atrasada: ["Atrasada", "selo off"] };
  acoes.forEach(function (a) {
    const atras = a.status !== "concluida" && a.prazo && a.prazo < hoje, st = atras ? rot.atrasada : (rot[a.status] || rot.a_fazer);
    const li = document.createElement("li"); const s = document.createElement("span"); s.className = st[1]; s.textContent = st[0];
    li.appendChild(s); li.appendChild(document.createTextNode(" " + a.acao + (a.prazo ? " · prazo " + dataBR(a.prazo) : "") + (a.dono ? " · " + a.dono : ""))); lista.appendChild(li);
  });
  const sugest = [];
  if (atrasadas.length) sugest.push("Cobrar " + atrasadas.length + (atrasadas.length === 1 ? " pagamento atrasado" : " pagamentos atrasados") + " (" + brl(soma(atrasadas)) + ").");
  const prox7 = cobr.filter(function (c) { return !c.pago_em && c.vencimento >= hoje && c.vencimento <= iso(new Date(ano, mes - 1, hojeD.getDate() + 7)); });
  if (prox7.length) sugest.push("Avisar " + prox7.length + (prox7.length === 1 ? " cliente" : " clientes") + " com vencimento nos próximos 7 dias (" + brl(soma(prox7)) + ").");
  if (acoes.length) planoBox.appendChild(lista); else { const p = document.createElement("p"); p.className = "vazio"; p.textContent = "Nenhuma ação cadastrada para este mês. Cadastre em Pessoal > Fluxo 30 dias > Meta e ações."; planoBox.appendChild(p); }
  if (sugest.length) { const t = document.createElement("p"); t.className = "rotulo"; t.style.marginTop = "12px"; t.textContent = "Sugestões do sistema"; planoBox.appendChild(t); const u = document.createElement("ul"); u.className = "res-lista"; sugest.forEach(function (x) { const li = document.createElement("li"); li.textContent = x; u.appendChild(li); }); planoBox.appendChild(u); }

  // meta do mês (meta geral = pagamentos de clientes recebidos)
  const meta = rm.data ? +rm.data.valor_meta : null, realizado = recebido;
  $("metaRealizado").textContent = brl(realizado); $("metaValor").textContent = meta ? brl(meta) : "Não definida";
  const pct = meta && meta > 0 ? realizado / meta : 0;
  $("metaBarra").style.width = Math.min(100, pct * 100) + "%"; document.querySelector(".barra-meta").classList.toggle("batida", !!(meta && realizado >= meta));
  const diasTotais = new Date(ano, mes, 0).getDate(), diaHoje = hojeD.getDate(), restantes = diasTotais - diaHoje + 1;
  if (!meta) $("metaRitmo").textContent = "Defina a meta do mês em \"Configurar meta e ações\" para ver o ritmo necessário.";
  else if (realizado >= meta) $("metaRitmo").textContent = "🎉 Meta batida! Você superou em " + brl(realizado - meta) + " (" + Math.round(pct * 100) + "%).";
  else {
    const falta = meta - realizado, porDia = falta / Math.max(1, restantes);
    $("metaRitmo").textContent = Math.round(pct * 100) + "% atingido · Faltam " + brl(falta) + " · Precisa de " + brl(porDia) + "/dia nos " + restantes + " dias restantes · " + brl(porDia * 7) + "/semana.";
    if (diaHoje >= 5) { const esperado = meta * diaHoje / diasTotais, dist = esperado > 0 ? realizado / esperado : 0; if (dist < 0.5) { $("alertaMeta").hidden = false; $("alertaMeta").textContent = "⚠️ Você está com " + Math.round(dist * 100) + "% do esperado para este momento do mês."; } }
  }
})();
