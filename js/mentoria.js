/* Mentoria: visão geral com retorno, ganhos e faturamento, ações, contrato e parcelas, lives/iniciativas com ROI e análises. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  const master = eu.papel === "master";
  const equipe = eu.papel !== "cliente";
  const verFin = eu.papel !== "suporte";
  if (!master) document.querySelectorAll(".so-master").forEach(function (el) { el.remove(); });
  if (!equipe) document.querySelectorAll(".so-equipe").forEach(function (el) { el.remove(); });
  if (!verFin) document.querySelectorAll(".so-financeiro").forEach(function (el) { el.remove(); });

  function falha(msg) { document.getElementById("falhaMsg").textContent = msg; document.getElementById("falha").hidden = false; }

  let pessoa = eu;
  if (equipe) {
    const pidUrl = new URLSearchParams(location.search).get("p");
    if (!pidUrl) return falha("Escolha a pessoa no painel, na lista de pessoas, botão \"Mentoria\".");
    const r = await supa().from("perfis").select("id,nome,email,papel").eq("id", pidUrl).maybeSingle();
    if (!r.data) return falha("Pessoa não encontrada.");
    pessoa = r.data;
  }
  const pid = pessoa.id, primeiroNome = pessoa.nome.split(" ")[0];
  document.getElementById("titulo").textContent = equipe ? "Mentoria: " + pessoa.nome : "Sua mentoria";
  document.getElementById("subtitulo").textContent = equipe ? pessoa.email : "Seus ganhos, ações, investimento e resultados em um só lugar.";
  document.getElementById("areaMentoria").hidden = false;

  const hoje = hojeISO();
  const STATUS = { a_fazer: "A fazer", em_andamento: "Em andamento", feito: "Aplicada", cancelado: "Não aplicada" };
  let contratos = [], cobrancas = [], ganhos = [], indicadores = [], acoes = [], iniciativas = [], analises = [];
  let graficos = {}, abaAtual = "geral", editIni = null, editAn = null;
  const soma = function (l, f) { return l.reduce(function (s, x) { return s + (Number(f(x)) || 0); }, 0); };
  const num2 = function (v) { return String(v).replace(".", ","); };
  ["gData", "nData", "anData"].forEach(function (id) { const el = document.getElementById(id); if (el) el.value = hoje; });
  const iMes = document.getElementById("iMes"); if (iMes) iMes.value = hoje.slice(0, 7);
  const aResp = document.getElementById("aResp"); if (aResp) aResp.value = primeiroNome;
  const cIni = document.getElementById("cIni"); if (cIni) { cIni.value = hoje; document.getElementById("cVenc").value = hoje; }

  function grafico(id, cfg) {
    if (typeof Chart === "undefined") return;
    if (graficos[id]) graficos[id].destroy();
    const el = document.getElementById(id);
    if (el) graficos[id] = new Chart(el, cfg);
  }
  if (typeof Chart !== "undefined") { Chart.defaults.font.family = "Figtree, system-ui, sans-serif"; Chart.defaults.color = "#4C5670"; }
  const moedaTick = function (v) { return "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }); };

  /* ---------- carregar ---------- */
  async function carregar() {
    const pedidos = [
      supa().from("ganhos").select("id,data,valor,categoria,descricao").eq("perfil_id", pid).order("data"),
      supa().from("indicadores_mensais").select("id,mes,faturamento,clientes,observacao").eq("perfil_id", pid).order("mes"),
      supa().from("acoes").select("id,titulo,plano,responsavel,prazo,status,resultado,concluida_em").eq("perfil_id", pid).eq("contexto", "mentoria").order("prazo", { ascending: true, nullsFirst: false }),
      supa().from("iniciativas").select("id,nome,tipo,data,custo,receita,leads,vendas,acoes_tomadas,observacao").eq("perfil_id", pid).order("data"),
      supa().from("analises").select("id,titulo,tipo,data,conteudo,visivel_cliente").eq("perfil_id", pid).order("data", { ascending: false })
    ];
    if (verFin) {
      pedidos.push(supa().from("contratos").select("id,produto,data_inicio,data_fim,valor_total,forma_pagamento,observacao,ativo").eq("perfil_id", pid).eq("servico", "mentoria").order("data_inicio"));
      pedidos.push(supa().from("cobrancas").select("id,contrato_id,descricao,vencimento,valor,pago_em,forma").eq("perfil_id", pid).order("vencimento"));
    }
    const r = await Promise.all(pedidos);
    ganhos = r[0].data || []; indicadores = r[1].data || []; acoes = r[2].data || []; iniciativas = r[3].data || []; analises = r[4].data || [];
    if (verFin) {
      contratos = (r[5].data || []).filter(function (c) { return c.ativo; });
      const ids = contratos.map(function (c) { return c.id; });
      cobrancas = (r[6].data || []).filter(function (c) { return ids.indexOf(c.contrato_id) > -1; });
    }
  }

  /* ---------- números do retorno ---------- */
  function numeros() {
    const investimento = soma(contratos, function (c) { return c.valor_total; });
    const pago = soma(cobrancas.filter(function (c) { return c.pago_em; }), function (c) { return c.valor; });
    const aberto = soma(cobrancas.filter(function (c) { return !c.pago_em; }), function (c) { return c.valor; });
    const atrasado = soma(cobrancas.filter(function (c) { return !c.pago_em && c.vencimento < hoje; }), function (c) { return c.valor; });
    const totalGanhos = soma(ganhos, function (g) { return g.valor; });
    return { investimento: investimento, pago: pago, aberto: aberto, atrasado: atrasado, ganhos: totalGanhos,
      retorno: investimento ? totalGanhos / investimento : null, roi: investimento ? (totalGanhos - investimento) / investimento : null };
  }
  const vezes = function (v) { return v.toFixed(2).replace(".", ",") + "x"; };

  /* ================= VISÃO GERAL ================= */
  function desenharGeral() {
    const n = numeros();
    const validas = acoes.filter(function (a) { return a.status !== "cancelado"; });
    const aplicadas = acoes.filter(function (a) { return a.status === "feito"; }).length;
    const cards = [];
    if (verFin) {
      cards.push(["Investimento na mentoria", brl(n.investimento), contratos.length ? contratos.map(function (c) { return esc(c.produto); }).join(", ") : "nenhum contrato registrado"]);
      cards.push(["Em aberto", '<span class="' + (n.atrasado ? "desce" : "") + '">' + brl(n.aberto) + "</span>", n.atrasado ? "⚠ " + brl(n.atrasado) + " em atraso" : "já pago: " + brl(n.pago)]);
    }
    cards.push(["Ganhos registrados", '<span class="sobe">' + brl(n.ganhos) + "</span>", ganhos.length + (ganhos.length === 1 ? " registro" : " registros")]);
    if (verFin) {
      cards.push(["Retorno sobre a mentoria", n.retorno === null ? "–" : '<span class="' + (n.retorno >= 1 ? "sobe" : "") + '">' + vezes(n.retorno) + "</span>",
        n.retorno === null ? "registre o contrato para calcular" : "ROI de " + pct(n.roi) + " · cada R$ 1 investido gerou " + brl(n.retorno)]);
    } else {
      cards.push(["Ações aplicadas", aplicadas + " de " + acoes.length, validas.length ? pct(aplicadas / validas.length) : "nenhuma ação"]);
    }
    document.getElementById("kpis").innerHTML = cards.map(function (c) { return '<div class="kpi"><small>' + c[0] + "</small><b>" + c[1] + "</b><span>" + c[2] + "</span></div>"; }).join("");

    const L = [];
    if (verFin && n.investimento) {
      if (n.ganhos >= n.investimento) L.push(["bom", "Os ganhos registrados (" + brl(n.ganhos) + ") já pagaram a mentoria " + vezes(n.retorno).replace("x", " vezes") + "."]);
      else L.push(["", "Faltam " + brl(n.investimento - n.ganhos) + " em ganhos para a mentoria se pagar. Até aqui, " + pct(n.retorno) + " do investimento já voltou."]);
    }
    if (verFin && n.atrasado) L.push(["alerta", "Há " + brl(n.atrasado) + " em parcelas atrasadas."]);
    const comFat = indicadores.filter(function (i) { return i.faturamento !== null; });
    if (comFat.length >= 2) {
      const a = comFat[0], b = comFat[comFat.length - 1];
      const v = a.faturamento ? (b.faturamento - a.faturamento) / a.faturamento : 0;
      L.push([v >= 0 ? "bom" : "alerta", "O faturamento mensal foi de " + brl(a.faturamento) + " (" + mesAno(a.mes) + ") para " + brl(b.faturamento) + " (" + mesAno(b.mes) + "): " + (v >= 0 ? "alta de " : "queda de ") + pct(Math.abs(v)) + "."]);
    } else L.push(["", "Registre o faturamento de cada mês na aba \"Ganhos e evolução\" para acompanhar a evolução."]);
    const atrasadas = acoes.filter(function (a) { return a.prazo && a.prazo < hoje && (a.status === "a_fazer" || a.status === "em_andamento"); }).length;
    if (acoes.length) L.push([atrasadas ? "alerta" : "", aplicadas + " de " + acoes.length + " ações aplicadas" + (atrasadas ? "; " + atrasadas + " com prazo vencido." : ".")]);
    if (iniciativas.length) {
      const c = soma(iniciativas, function (x) { return x.custo; }), rc = soma(iniciativas, function (x) { return x.receita; });
      L.push([rc >= c ? "bom" : "alerta", "As lives e iniciativas custaram " + brl(c) + " e geraram " + brl(rc) + (c ? ": ROI de " + pct((rc - c) / c) + "." : ".")]);
    }
    document.getElementById("leituras").innerHTML = L.map(function (x) { return '<li class="' + x[0] + '">' + esc(x[1]) + "</li>"; }).join("");

    if (abaAtual === "geral") desenharGraficosGeral();
  }
  function mesAno(iso) { const p = iso.slice(0, 7).split("-"); return MESES[+p[1] - 1] + "/" + p[0].slice(2); }
  function desenharGraficosGeral() {
    const n = numeros();
    let acum = 0;
    const pontos = ganhos.map(function (g) { acum += +g.valor; return { x: dataBR(g.data), y: acum }; });
    const ds = [{ label: "Ganhos acumulados", data: pontos.map(function (p) { return p.y; }), borderColor: "#1FA855", backgroundColor: "rgba(31,168,85,.15)", fill: true, tension: .25, pointRadius: 3 }];
    if (verFin && n.investimento) ds.push({ label: "Investimento", data: pontos.map(function () { return n.investimento; }), borderColor: "#C9742F", borderDash: [6, 4], pointRadius: 0 });
    grafico("gRetorno", { type: "line", data: { labels: pontos.map(function (p) { return p.x; }), datasets: ds },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: moedaTick } } } } });
    grafico("gFat", { type: "bar", data: { labels: indicadores.map(function (i) { return mesAno(i.mes); }), datasets: [
      { type: "bar", label: "Faturamento", data: indicadores.map(function (i) { return i.faturamento; }), backgroundColor: "#C9A24A", borderRadius: 4, yAxisID: "y" },
      { type: "line", label: "Clientes", data: indicadores.map(function (i) { return i.clientes; }), borderColor: "#0B1F3A", backgroundColor: "#0B1F3A", yAxisID: "y2", tension: .3 }] },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: moedaTick } }, y2: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } } } } });
  }

  /* ================= GANHOS E FATURAMENTO ================= */
  document.getElementById("formGanho").addEventListener("submit", async function (e) {
    e.preventDefault();
    const valor = lerValor(document.getElementById("gValor").value);
    if (!(valor > 0)) { aviso("Escreva um valor maior que zero.", true); return; }
    const { error } = await supa().from("ganhos").insert({ perfil_id: pid, data: document.getElementById("gData").value, valor: valor,
      categoria: document.getElementById("gCat").value, descricao: document.getElementById("gDesc").value.trim() || null });
    if (error) { aviso("Não foi possível salvar o ganho.", true); return; }
    document.getElementById("gValor").value = ""; document.getElementById("gDesc").value = "";
    aviso("Ganho registrado: " + brl(valor));
    await carregar(); desenharTudo();
  });
  document.getElementById("formInd").addEventListener("submit", async function (e) {
    e.preventDefault();
    const mes = document.getElementById("iMes").value;
    if (!mes) { aviso("Escolha o mês.", true); return; }
    const fat = document.getElementById("iFat").value.trim(), cli = document.getElementById("iCli").value;
    const reg = { perfil_id: pid, mes: mes + "-01", faturamento: fat ? lerValor(fat) : null, clientes: cli === "" ? null : +cli };
    if (reg.faturamento !== null && isNaN(reg.faturamento)) { aviso("O faturamento precisa ser um número.", true); return; }
    const { error } = await supa().from("indicadores_mensais").upsert(reg, { onConflict: "perfil_id,mes" });
    if (error) { aviso("Não foi possível salvar o mês.", true); return; }
    document.getElementById("iFat").value = ""; document.getElementById("iCli").value = "";
    aviso("Mês salvo.");
    await carregar(); desenharTudo();
  });
  function desenharGanhos() {
    const t = soma(ganhos, function (g) { return g.valor; });
    document.getElementById("totGanhos").innerHTML = '<span>Total: <b class="v-receita">' + brl(t) + "</b></span>";
    document.getElementById("listaGanhos").innerHTML = ganhos.length ? ganhos.slice().reverse().map(function (g) {
      return "<tr><td>" + dataBR(g.data) + "</td><td>" + esc(g.categoria) + '</td><td class="quebra">' + esc(g.descricao || "") + '</td><td class="n v-receita">' + brl(g.valor) + "</td>" +
        '<td><button class="btn peq perigo" type="button" data-del-ganho="' + g.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="vazio">Nenhum ganho registrado ainda.</td></tr>';
    document.getElementById("listaInd").innerHTML = indicadores.length ? indicadores.slice().reverse().map(function (i) {
      return "<tr><td>" + mesAno(i.mes) + '</td><td class="n">' + (i.faturamento === null ? "–" : brl(i.faturamento)) + '</td><td class="n">' + (i.clientes === null ? "–" : i.clientes) + "</td>" +
        '<td><button class="btn peq perigo" type="button" data-del-ind="' + i.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="4" class="vazio">Nenhum mês registrado ainda.</td></tr>';
  }

  /* ================= AÇÕES ================= */
  const fAcao = document.getElementById("formAcao");
  if (fAcao) fAcao.addEventListener("submit", async function (e) {
    e.preventDefault();
    const titulo = document.getElementById("aTitulo").value.trim();
    if (titulo.length < 2) { aviso("Escreva o que deve ser aplicado.", true); return; }
    const { error } = await supa().from("acoes").insert({ perfil_id: pid, contexto: "mentoria", titulo: titulo,
      plano: document.getElementById("aPlano").value.trim() || null, responsavel: document.getElementById("aResp").value.trim() || null,
      prazo: document.getElementById("aPrazo").value || null });
    if (error) { aviso("Não foi possível salvar a ação.", true); return; }
    fAcao.reset(); document.getElementById("aResp").value = primeiroNome;
    aviso("Ação criada.");
    await carregar(); desenharTudo();
  });
  function desenharAcoes() {
    const aplicadas = acoes.filter(function (a) { return a.status === "feito"; }).length;
    const nao = acoes.filter(function (a) { return a.status === "cancelado"; }).length;
    document.getElementById("totAcoes").innerHTML = "<span>Aplicadas: <b>" + aplicadas + "</b></span><span>Não aplicadas: <b>" + nao + "</b></span><span>Pendentes: <b>" + (acoes.length - aplicadas - nao) + "</b></span>";
    document.getElementById("listaAcoes").innerHTML = acoes.length ? acoes.map(function (a) {
      const atras = a.prazo && a.prazo < hoje && (a.status === "a_fazer" || a.status === "em_andamento");
      const info = [];
      if (a.responsavel) info.push("Responsável: " + esc(a.responsavel));
      if (a.prazo) info.push((atras ? "⚠ Atrasada desde " : "Prazo: ") + dataBR(a.prazo));
      if (a.status === "feito" && a.concluida_em) info.push("Aplicada em " + dataBR(a.concluida_em));
      return '<li class="acao' + (a.status === "feito" ? " feita" : (atras ? " atrasada" : "")) + '">' +
        '<div class="acao-linha"><b>' + esc(a.titulo) + '</b><select data-status="' + a.id + '" aria-label="Situação">' +
        Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (a.status === k ? " selected" : "") + ">" + STATUS[k] + "</option>"; }).join("") + "</select></div>" +
        (a.plano ? '<div style="font-size:14.5px">' + esc(a.plano) + "</div>" : "") +
        '<div class="acao-info">' + info.join(" · ") + "</div>" +
        '<div class="f" style="display:flex;gap:8px;align-items:center"><input data-resultado="' + a.id + '" value="' + esc(a.resultado || "") + '" placeholder="Resultado obtido (opcional)" maxlength="200" style="padding:8px 10px;font-size:14.5px">' +
        '<button class="btn peq contorno" type="button" data-salvar-res="' + a.id + '">Salvar</button></div>' +
        (equipe ? '<div><button class="btn peq perigo" type="button" data-del-acao="' + a.id + '">Apagar ação</button></div>' : "") + "</li>";
    }).join("") : '<li class="vazio">Nenhuma ação definida ainda.</li>';
  }

  /* ================= CONTRATO E PARCELAS ================= */
  function somarMes(iso, k) {
    const p = iso.split("-").map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1 + k, 1));
    const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(p[2], ultimo));
    return d.toISOString().slice(0, 10);
  }
  const fContrato = document.getElementById("formContrato");
  if (fContrato) fContrato.addEventListener("submit", async function (e) {
    e.preventDefault();
    const valor = lerValor(document.getElementById("cValor").value);
    const parcelas = Math.max(1, Math.min(60, +document.getElementById("cParc").value || 1));
    const venc = document.getElementById("cVenc").value;
    if (!(valor > 0)) { aviso("Escreva o valor total.", true); return; }
    if (!venc) { aviso("Escolha o primeiro vencimento.", true); return; }
    const botao = fContrato.querySelector("button[type=submit]"); botao.disabled = true;
    const { data, error } = await supa().from("contratos").insert({ perfil_id: pid, servico: "mentoria", produto: document.getElementById("cProd").value.trim() || "Mentoria",
      data_inicio: document.getElementById("cIni").value || hoje, data_fim: document.getElementById("cFim").value || null, valor_total: valor,
      forma_pagamento: document.getElementById("cForma").value.trim() || null, observacao: document.getElementById("cObs").value.trim() || null }).select("id").single();
    if (error) { botao.disabled = false; aviso("Não foi possível salvar o contrato.", true); return; }
    const base = Math.floor(valor / parcelas * 100) / 100;
    const linhas = [];
    for (let i = 0; i < parcelas; i++) {
      const v = i === parcelas - 1 ? Math.round((valor - base * (parcelas - 1)) * 100) / 100 : base;
      linhas.push({ perfil_id: pid, contrato_id: data.id, descricao: "Parcela " + (i + 1) + "/" + parcelas, vencimento: somarMes(venc, i), valor: v,
        forma: document.getElementById("cForma").value.trim() || null });
    }
    const r2 = await supa().from("cobrancas").insert(linhas);
    botao.disabled = false;
    if (r2.error) { aviso("Contrato salvo, mas as parcelas não foram criadas.", true); }
    else aviso("Contrato salvo com " + parcelas + (parcelas === 1 ? " parcela." : " parcelas."));
    document.getElementById("cValor").value = "";
    await carregar(); desenharTudo();
  });
  function desenharContratos() {
    const box = document.getElementById("listaContratos");
    if (!box) return;
    if (!contratos.length) { box.innerHTML = '<div class="cartao"><p class="vazio">Nenhum contrato de mentoria registrado.</p></div>'; return; }
    box.innerHTML = contratos.map(function (c) {
      const ps = cobrancas.filter(function (x) { return x.contrato_id === c.id; });
      const pago = soma(ps.filter(function (x) { return x.pago_em; }), function (x) { return x.valor; });
      return '<div class="cartao"><div class="empresa-titulo"><h2>' + esc(c.produto) + '</h2><span class="selo">' + brl(c.valor_total) + "</span></div>" +
        '<p class="ajuda">Início ' + dataBR(c.data_inicio) + (c.data_fim ? " · término " + dataBR(c.data_fim) : "") + (c.forma_pagamento ? " · " + esc(c.forma_pagamento) : "") +
        " · pago " + brl(pago) + " de " + brl(c.valor_total) + "</p>" +
        '<div class="tabela-wrap"><table class="t"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="n">Valor</th><th>Situação</th>' + (master ? "<th></th>" : "") + "</tr></thead><tbody>" +
        ps.map(function (x) {
          const atras = !x.pago_em && x.vencimento < hoje;
          const sit = x.pago_em ? '<span class="selo ok">Pago em ' + dataBR(x.pago_em) + "</span>" : (atras ? '<span class="selo off">Atrasada</span>' : '<span class="selo">Em aberto</span>');
          return "<tr><td>" + esc(x.descricao) + "</td><td>" + dataBR(x.vencimento) + '</td><td class="n">' + brl(x.valor) + "</td><td>" + sit + "</td>" +
            (master ? '<td><button class="btn peq ' + (x.pago_em ? "contorno" : "") + '" type="button" data-pagar="' + x.id + '" data-pago="' + (x.pago_em ? "1" : "") + '">' + (x.pago_em ? "Desfazer" : "Marcar como pago") + "</button></td>" : "") + "</tr>";
        }).join("") + "</tbody></table></div>" +
        (master ? '<div class="acoes"><button class="btn peq perigo" type="button" data-del-contrato="' + c.id + '">Apagar contrato e parcelas</button></div>' : "") + "</div>";
    }).join("");
  }

  /* ================= LIVES E INICIATIVAS ================= */
  const fIni = document.getElementById("formIni");
  function limparIni() {
    editIni = null; fIni.reset(); document.getElementById("nData").value = hoje;
    document.getElementById("tituloIni").textContent = "Registrar live ou iniciativa";
    document.getElementById("nSalvar").textContent = "Salvar"; document.getElementById("nCancelar").hidden = true;
  }
  document.getElementById("nCancelar").addEventListener("click", limparIni);
  fIni.addEventListener("submit", async function (e) {
    e.preventDefault();
    const nome = document.getElementById("nNome").value.trim();
    if (nome.length < 2) { aviso("Escreva o nome da live ou iniciativa.", true); return; }
    const vv = function (id) { const s = document.getElementById(id).value.trim(); return s ? lerValor(s) : 0; };
    const ii = function (id) { const s = document.getElementById(id).value; return s === "" ? null : +s; };
    const reg = { perfil_id: pid, nome: nome, tipo: document.getElementById("nTipo").value, data: document.getElementById("nData").value || hoje,
      custo: vv("nCusto"), receita: vv("nRec"), leads: ii("nLeads"), vendas: ii("nVendas"),
      acoes_tomadas: document.getElementById("nAcoes").value.trim() || null, observacao: document.getElementById("nObs").value.trim() || null };
    if (isNaN(reg.custo) || isNaN(reg.receita)) { aviso("Custo e receita precisam ser números.", true); return; }
    const r = editIni ? await supa().from("iniciativas").update(reg).eq("id", editIni) : await supa().from("iniciativas").insert(reg);
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso(editIni ? "Iniciativa atualizada." : "Iniciativa registrada.");
    limparIni();
    await carregar(); desenharTudo();
  });
  function roiDe(x) { return +x.custo ? (+x.receita - +x.custo) / +x.custo : null; }
  function desenharIniciativas() {
    const c = soma(iniciativas, function (x) { return x.custo; }), r = soma(iniciativas, function (x) { return x.receita; });
    const leads = soma(iniciativas, function (x) { return x.leads; }), vendas = soma(iniciativas, function (x) { return x.vendas; });
    const kp = [["Custo total", brl(c), iniciativas.length + (iniciativas.length === 1 ? " iniciativa" : " iniciativas")],
      ["Receita gerada", '<span class="sobe">' + brl(r) + "</span>", "lucro de " + brl(r - c)],
      ["ROI total", c ? '<span class="' + (r >= c ? "sobe" : "desce") + '">' + pct((r - c) / c) + "</span>" : "–", c ? "cada R$ 1 investido voltou " + brl(r / c) : "registre o custo"],
      ["Leads e vendas", leads + " / " + vendas, leads ? "conversão de " + pct(vendas / leads) : "registre os leads"]];
    document.getElementById("kpisIni").innerHTML = kp.map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b><span>" + k[2] + "</span></div>"; }).join("");
    document.getElementById("listaIni").innerHTML = iniciativas.length ? iniciativas.slice().reverse().map(function (x) {
      const roi = roiDe(x);
      return '<div class="sessao"><div class="sessao-topo"><b>' + esc(x.nome) + '</b><span class="selo ' + (roi === null ? "" : (roi >= 0 ? "ok" : "off")) + '">' + (roi === null ? "sem custo" : "ROI " + pct(roi)) + "</span></div>" +
        '<span class="acao-info">' + esc(x.tipo) + " · " + dataBR(x.data) + " · custo " + brl(x.custo) + " · receita " + brl(x.receita) +
        (x.leads !== null ? " · " + x.leads + (x.leads === 1 ? " lead" : " leads") : "") + (x.vendas !== null ? " · " + x.vendas + (x.vendas === 1 ? " venda" : " vendas") : "") + "</span>" +
        (x.acoes_tomadas ? '<span class="rotulo">Ações tomadas</span><p>' + esc(x.acoes_tomadas) + "</p>" : "") +
        (x.observacao ? '<span class="rotulo">Observação</span><p>' + esc(x.observacao) + "</p>" : "") +
        '<div class="acoes" style="margin-top:4px"><button class="btn peq contorno" type="button" data-ed-ini="' + x.id + '">Editar</button>' +
        '<button class="btn peq perigo" type="button" data-del-ini="' + x.id + '">Apagar</button></div></div>';
    }).join("") : '<div class="cartao"><p class="vazio">Nenhuma live ou iniciativa registrada ainda.</p></div>';
    if (abaAtual === "iniciativas") desenharGraficoIni();
  }
  function desenharGraficoIni() {
    grafico("gIni", { type: "bar", data: { labels: iniciativas.map(function (x) { return x.nome.length > 22 ? x.nome.slice(0, 21) + "…" : x.nome; }), datasets: [
      { label: "Custo", data: iniciativas.map(function (x) { return +x.custo; }), backgroundColor: "#C9742F", borderRadius: 4 },
      { label: "Receita", data: iniciativas.map(function (x) { return +x.receita; }), backgroundColor: "#1FA855", borderRadius: 4 }] },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: moedaTick } } } } });
  }

  /* ================= ANÁLISES ================= */
  const fAn = document.getElementById("formAn");
  function limparAn() {
    editAn = null; fAn.reset(); document.getElementById("anData").value = hoje; document.getElementById("anVisivel").checked = true;
    document.getElementById("tituloAn").textContent = "Nova análise"; document.getElementById("anSalvar").textContent = "Salvar análise"; document.getElementById("anCancelar").hidden = true;
  }
  if (fAn) {
    document.getElementById("anCancelar").addEventListener("click", limparAn);
    fAn.addEventListener("submit", async function (e) {
      e.preventDefault();
      const titulo = document.getElementById("anTitulo").value.trim();
      if (titulo.length < 2) { aviso("Escreva o título da análise.", true); return; }
      const reg = { perfil_id: pid, titulo: titulo, tipo: document.getElementById("anTipo").value, data: document.getElementById("anData").value || hoje,
        conteudo: document.getElementById("anTexto").value.trim() || null, visivel_cliente: document.getElementById("anVisivel").checked };
      const r = editAn ? await supa().from("analises").update(reg).eq("id", editAn) : await supa().from("analises").insert(reg);
      if (r.error) { aviso("Não foi possível salvar a análise.", true); return; }
      aviso("Análise salva.");
      limparAn();
      await carregar(); desenharTudo();
    });
  }
  function desenharAnalises() {
    document.getElementById("listaAn").innerHTML = analises.length ? analises.map(function (a) {
      return '<div class="sessao"><div class="sessao-topo"><b>' + esc(a.titulo) + '</b><span><span class="selo">' + esc(a.tipo) + "</span>" +
        (equipe && !a.visivel_cliente ? '<span class="selo ouro">Só a equipe vê</span>' : "") + "</span></div>" +
        '<span class="acao-info">' + dataBR(a.data) + "</span>" + (a.conteudo ? "<p>" + esc(a.conteudo) + "</p>" : "") +
        (equipe ? '<div class="acoes" style="margin-top:4px"><button class="btn peq contorno" type="button" data-ed-an="' + a.id + '">Editar</button>' +
          '<button class="btn peq perigo" type="button" data-del-an="' + a.id + '">Apagar</button></div>' : "") + "</div>";
    }).join("") : '<div class="cartao"><p class="vazio">Nenhuma análise registrada ainda.</p></div>';
  }

  /* ================= cliques e mudanças ================= */
  const area = document.getElementById("areaMentoria");
  async function apagar(tabela, id, msg) {
    if (!confirm(msg)) return;
    const { error } = await supa().from(tabela).delete().eq("id", id);
    if (error) { aviso("Não foi possível apagar.", true); return; }
    await carregar(); desenharTudo();
  }
  area.addEventListener("click", async function (e) {
    const t = function (sel) { return e.target.closest(sel); };
    let b;
    if ((b = t("[data-del-ganho]"))) return apagar("ganhos", b.dataset.delGanho, "Apagar este ganho?");
    if ((b = t("[data-del-ind]"))) return apagar("indicadores_mensais", b.dataset.delInd, "Apagar o registro deste mês?");
    if ((b = t("[data-del-acao]"))) return apagar("acoes", b.dataset.delAcao, "Apagar esta ação?");
    if ((b = t("[data-del-ini]"))) return apagar("iniciativas", b.dataset.delIni, "Apagar esta iniciativa?");
    if ((b = t("[data-del-an]"))) return apagar("analises", b.dataset.delAn, "Apagar esta análise?");
    if ((b = t("[data-del-contrato]"))) return apagar("contratos", b.dataset.delContrato, "Apagar o contrato e todas as parcelas dele? Isso não tem volta.");
    if ((b = t("[data-salvar-res]"))) {
      const inp = area.querySelector('[data-resultado="' + b.dataset.salvarRes + '"]');
      const { error } = await supa().from("acoes").update({ resultado: inp.value.trim() || null }).eq("id", b.dataset.salvarRes);
      if (error) { aviso("Não foi possível salvar o resultado.", true); return; }
      aviso("Resultado salvo."); await carregar(); desenharTudo(); return;
    }
    if ((b = t("[data-pagar]"))) {
      const { error } = await supa().from("cobrancas").update({ pago_em: b.dataset.pago ? null : hoje }).eq("id", b.dataset.pagar);
      if (error) { aviso("Não foi possível atualizar a parcela.", true); return; }
      aviso(b.dataset.pago ? "Pagamento desfeito." : "Parcela marcada como paga."); await carregar(); desenharTudo(); return;
    }
    if ((b = t("[data-ed-ini]"))) {
      const x = iniciativas.find(function (i) { return i.id === b.dataset.edIni; }); if (!x) return;
      editIni = x.id;
      document.getElementById("nNome").value = x.nome; document.getElementById("nTipo").value = x.tipo; document.getElementById("nData").value = x.data;
      document.getElementById("nCusto").value = num2(x.custo); document.getElementById("nRec").value = num2(x.receita);
      document.getElementById("nLeads").value = x.leads === null ? "" : x.leads; document.getElementById("nVendas").value = x.vendas === null ? "" : x.vendas;
      document.getElementById("nAcoes").value = x.acoes_tomadas || ""; document.getElementById("nObs").value = x.observacao || "";
      document.getElementById("tituloIni").textContent = "Editando: " + x.nome; document.getElementById("nSalvar").textContent = "Salvar alteração";
      document.getElementById("nCancelar").hidden = false; fIni.scrollIntoView({ behavior: "smooth", block: "start" }); return;
    }
    if ((b = t("[data-ed-an]"))) {
      const a = analises.find(function (i) { return i.id === b.dataset.edAn; }); if (!a) return;
      editAn = a.id;
      document.getElementById("anTitulo").value = a.titulo; document.getElementById("anTipo").value = a.tipo; document.getElementById("anData").value = a.data;
      document.getElementById("anTexto").value = a.conteudo || ""; document.getElementById("anVisivel").checked = a.visivel_cliente;
      document.getElementById("tituloAn").textContent = "Editando análise"; document.getElementById("anSalvar").textContent = "Salvar alteração";
      document.getElementById("anCancelar").hidden = false; fAn.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  area.addEventListener("change", async function (e) {
    const s = e.target.closest("[data-status]");
    if (!s) return;
    const { error } = await supa().from("acoes").update({ status: s.value }).eq("id", s.dataset.status);
    if (error) { aviso("Não foi possível atualizar a ação.", true); return; }
    aviso(s.value === "feito" ? "Ação aplicada. Ótimo!" : "Situação atualizada.");
    await carregar(); desenharTudo();
  });

  function desenharTudo() { desenharGeral(); desenharGanhos(); desenharAcoes(); desenharContratos(); desenharIniciativas(); desenharAnalises(); }
  ligarAbas(document.getElementById("abas"), function (nome) {
    abaAtual = nome;
    if (nome === "geral") desenharGraficosGeral();
    if (nome === "iniciativas") desenharGraficoIni();
  });
  await carregar();
  desenharTudo();
})();
