/* Financeiro do master: painel, cobranças, resultado por cliente, contratos, custos e ligação com a DRE. */
(async function () {
  const eu = await protegerPagina("master");
  if (!eu) return;

  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  const em30 = (function () { const d = new Date(hoje + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 30); return d.toISOString().slice(0, 10); })();
  const PER = { parcelado: "Valor fechado", mensal: "Mensal", quinzenal: "Quinzenal", semanal: "Semanal", sessao: "Por sessão" };
  const SERV = Object.assign({ avulsa: "Avulsa" }, ROTULO_SERVICO);
  let perfis = [], contratos = [], cobrancas = [], custos = [], minhasEmpresas = [], pref = {}, contasDre = [];
  let graficos = {}, abaAtual = "painel", filtro = "atrasadas", anoGraf = +hoje.slice(0, 4);
  const pessoa = function (id) { return perfis.find(function (p) { return p.id === id; }) || { nome: "?", id: id }; };
  const contrato = function (id) { return contratos.find(function (c) { return c.id === id; }); };
  const soma = function (l) { return l.reduce(function (s, x) { return s + (+x.valor || 0); }, 0); };
  const atrasada = function (c) { return !c.pago_em && c.vencimento < hoje; };
  const diasDe = function (iso) { return Math.round((new Date(hoje) - new Date(iso)) / 86400000); };
  const servicoDe = function (c) { const k = c.contrato_id && contrato(c.contrato_id); return k ? k.servico : "avulsa"; };

  function grafico(id, cfg) {
    if (typeof Chart === "undefined") return;
    if (graficos[id]) graficos[id].destroy();
    const el = document.getElementById(id);
    if (el) graficos[id] = new Chart(el, cfg);
  }
  if (typeof Chart !== "undefined") { Chart.defaults.font.family = "Figtree, system-ui, sans-serif"; Chart.defaults.color = "#4C5670"; }
  const moedaTick = function (v) { return "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }); };

  /* ---------- datas ---------- */
  function proximaData(iso, per, k) {
    const p = iso.split("-").map(Number);
    if (per === "semanal" || per === "quinzenal") {
      const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
      d.setUTCDate(d.getUTCDate() + k * (per === "semanal" ? 7 : 15));
      return d.toISOString().slice(0, 10);
    }
    const d = new Date(Date.UTC(p[0], p[1] - 1 + k, 1));
    const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(p[2], ultimo));
    return d.toISOString().slice(0, 10);
  }

  /* ---------- carregar ---------- */
  async function carregar() {
    const [rp, rc, rcu, re, rpref] = await Promise.all([
      supa().from("perfis").select("id,nome,email,papel,telefone,ativo").order("nome"),
      supa().from("contratos").select("id,perfil_id,servico,produto,data_inicio,data_fim,valor_total,periodicidade,valor_recorrente,forma_pagamento,ativo,executor_perfil_id,recorrente_aberto").order("criado_em"),
      supa().from("custos_cliente").select("id,perfil_id,data,valor,descricao").order("data", { ascending: false }),
      supa().from("empresas").select("id,nome,tipo,empresa_membros(perfil_id)").in("tipo", ["empresa","pessoal"]).order("nome"),
      supa().from("preferencias").select("dados").eq("perfil_id", eu.id).maybeSingle()
    ]);
    perfis = rp.data || [];
    contratos = (rc.data || []).filter(function (c) { return c.ativo; });
    custos = rcu.data || [];
    minhasEmpresas = (re.data || []).filter(function (e) { return (e.empresa_membros || []).some(function (m) { return m.perfil_id === eu.id; }); });
    pref = (rpref.data && rpref.data.dados) || {};
    try {
      cobrancas = await buscarTudo(function () {
        return supa().from("cobrancas").select("id,perfil_id,contrato_id,descricao,vencimento,valor,pago_em,forma,lancamento_id").order("vencimento");
      });
    } catch (e) { cobrancas = []; aviso("Não foi possível carregar as cobranças.", true); }
    await manterRecorrentesEmDia();
  }

  /* ---------- mantém um "estoque" de ~60 dias de cobrança gerado para contratos recorrentes sem prazo fixo ---------- */
  async function manterRecorrentesEmDia() {
    const limite = (function () { const d = new Date(hoje + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 60); return d.toISOString().slice(0, 10); })();
    const abertos = contratos.filter(function (c) { return c.recorrente_aberto && c.periodicidade !== "sessao" && c.periodicidade !== "parcelado"; });
    let gerouAlgo = false;
    for (const k of abertos) {
      const das = cobrancas.filter(function (c) { return c.contrato_id === k.id; });
      if (!das.length) continue;
      let maxVenc = das.reduce(function (m, c) { return c.vencimento > m ? c.vencimento : m; }, das[0].vencimento);
      let qtdExistente = das.length;
      let seguranca = 0;
      while (maxVenc < limite && seguranca < 24) {
        const proxima = proximaData(maxVenc, k.periodicidade, 1);
        const r = await gerarCobrancas(k, proxima, 1, qtdExistente);
        if (r.error) break;
        maxVenc = proxima; qtdExistente += 1; gerouAlgo = true; seguranca += 1;
      }
    }
    if (gerouAlgo) {
      cobrancas = await buscarTudo(function () {
        return supa().from("cobrancas").select("id,perfil_id,contrato_id,descricao,vencimento,valor,pago_em,forma,lancamento_id").order("vencimento");
      });
    }
  }

  /* ---------- selects de clientes e equipe ---------- */
  function preencherClientes() {
    const clientes = perfis.filter(function (p) { return p.papel === "cliente" && p.ativo; });
    const opts = '<option value="">Escolha o cliente</option>' + clientes.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join("");
    ["avCli", "ctCli", "cuCli"].forEach(function (id) { const s = document.getElementById(id); const v = s.value; s.innerHTML = opts; s.value = v; });
    const equipe = perfis.filter(function (p) { return (p.papel === "suporte" || p.papel === "profissional") && p.ativo; });
    const selExec = document.getElementById("ctExecutor");
    if (selExec) { const v = selExec.value; selExec.innerHTML = '<option value="">Eu mesmo (Mauricio)</option>' + equipe.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join(""); selExec.value = v; }
  }
  function nomeExecutor(id) { return id ? pessoa(id).nome : eu.nome || "Mauricio"; }

  /* ---------- WhatsApp ---------- */
  function linkCobrar(pid) {
    const p = pessoa(pid);
    if (!p.telefone) return null;
    const lista = cobrancas.filter(function (c) { return c.perfil_id === pid && atrasada(c); });
    if (!lista.length) return null;
    const linhas = lista.map(function (c) { return "• " + c.descricao + ": " + brl(c.valor) + " (venceu em " + dataBR(c.vencimento) + ")"; });
    const msg = "Olá, " + p.nome.split(" ")[0] + "! Tudo bem? Passando para lembrar que consta em aberto:\n" + linhas.join("\n") +
      (lista.length > 1 ? "\nTotal: " + brl(soma(lista)) : "") + "\n\nSe você já pagou, me envia o comprovante, por favor. Qualquer dúvida, estou à disposição.";
    return "https://wa.me/" + p.telefone + "?text=" + encodeURIComponent(msg);
  }
  function botaoCobrar(pid) {
    const l = linkCobrar(pid);
    return l ? '<a class="btn peq wa" href="' + l + '" target="_blank" rel="noopener" style="background:#1FA855;color:#fff">Cobrar no WhatsApp</a>'
      : '<span class="vazio" style="padding:0;font-size:13px">' + (pessoa(pid).telefone ? "" : "sem WhatsApp no cadastro") + "</span>";
  }

  /* ================= PAINEL ================= */
  function desenharPainel() {
    const recebidoMes = soma(cobrancas.filter(function (c) { return c.pago_em && c.pago_em.slice(0, 7) === mesAtual; }));
    const aReceberMes = soma(cobrancas.filter(function (c) { return !c.pago_em && c.vencimento.slice(0, 7) === mesAtual; }));
    const atras = cobrancas.filter(atrasada);
    const pessoasAtraso = [];
    atras.forEach(function (c) { if (pessoasAtraso.indexOf(c.perfil_id) === -1) pessoasAtraso.push(c.perfil_id); });
    const prox = cobrancas.filter(function (c) { return !c.pago_em && c.vencimento >= hoje && c.vencimento <= em30; });
    const nomeMes = MESES_LONGOS[+mesAtual.slice(5) - 1];
    const cards = [
      ["Recebido em " + nomeMes, '<span class="sobe">' + brl(recebidoMes) + "</span>", cobrancas.filter(function (c) { return c.pago_em && c.pago_em.slice(0, 7) === mesAtual; }).length + " pagamentos"],
      ["A receber em " + nomeMes, brl(aReceberMes), "vencimentos do mês ainda em aberto"],
      ["Em atraso", '<span class="' + (atras.length ? "desce" : "sobe") + '">' + brl(soma(atras)) + "</span>", pessoasAtraso.length ? pessoasAtraso.length + (pessoasAtraso.length === 1 ? " pessoa" : " pessoas") : "ninguém em atraso"],
      ["Próximos 30 dias", brl(soma(prox)), prox.length + (prox.length === 1 ? " cobrança" : " cobranças")]
    ];
    document.getElementById("kpis").innerHTML = cards.map(function (c) { return '<div class="kpi"><small>' + c[0] + "</small><b>" + c[1] + "</b><span>" + c[2] + "</span></div>"; }).join("");

    pessoasAtraso.sort(function (a, b) { return soma(atras.filter(function (c) { return c.perfil_id === b; })) - soma(atras.filter(function (c) { return c.perfil_id === a; })); });
    document.getElementById("listaAtraso").innerHTML = pessoasAtraso.length ? pessoasAtraso.map(function (pid) {
      const l = atras.filter(function (c) { return c.perfil_id === pid; });
      const maisAntiga = l.reduce(function (m, c) { return c.vencimento < m ? c.vencimento : m; }, l[0].vencimento);
      return '<li class="acao atrasada"><div class="acao-linha"><b>' + esc(pessoa(pid).nome) + '</b><b class="v-saida">' + brl(soma(l)) + "</b></div>" +
        '<div class="acao-info">' + l.length + (l.length === 1 ? " cobrança" : " cobranças") + " · a mais antiga venceu em " + dataBR(maisAntiga) + " (" + diasDe(maisAntiga) + " dias)</div>" +
        "<div>" + botaoCobrar(pid) + "</div></li>";
    }).join("") : '<li class="vazio">Ninguém em atraso. 👏</li>';

    document.getElementById("listaProximos").innerHTML = prox.length ? prox.slice(0, 20).map(function (c) {
      return "<tr><td>" + dataBR(c.vencimento) + "</td><td><b>" + esc(pessoa(c.perfil_id).nome) + '</b><br><span class="vazio" style="padding:0">' + esc(c.descricao) + '</span></td><td class="n">' + brl(c.valor) + "</td></tr>";
    }).join("") : '<tr><td class="vazio">Nenhum vencimento nos próximos 30 dias.</td></tr>';

    desenharConfigDre();
    if (abaAtual === "painel") desenharGraficos();
  }
  function desenharGraficos() {
    const ano = String(anoGraf);
    const rec = MESES.map(function () { return 0; }), prev = MESES.map(function () { return 0; }), pag = MESES.map(function () { return []; });
    const porServ = {};
    cobrancas.forEach(function (c) {
      if (c.vencimento.slice(0, 4) === ano) prev[+c.vencimento.slice(5, 7) - 1] += +c.valor;
      if (c.pago_em && c.pago_em.slice(0, 4) === ano) {
        const m = +c.pago_em.slice(5, 7) - 1;
        rec[m] += +c.valor;
        if (pag[m].indexOf(c.perfil_id) === -1) pag[m].push(c.perfil_id);
        const s = SERV[servicoDe(c)];
        porServ[s] = (porServ[s] || 0) + +c.valor;
      }
    });
    grafico("gMes", { type: "bar", data: { labels: MESES, datasets: [
      { label: "Previsto (vencimentos)", data: prev, backgroundColor: "#E3DCCD", borderRadius: 4 },
      { label: "Recebido", data: rec, backgroundColor: "#1FA855", borderRadius: 4 }] },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: moedaTick } } },
        plugins: { tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + brl(c.parsed.y); } } } } } });
    const ks = Object.keys(porServ);
    grafico("gServ", { type: "doughnut", data: { labels: ks, datasets: [{ data: ks.map(function (k) { return porServ[k]; }), backgroundColor: ["#0B1F3A", "#C9A24A", "#1FA855", "#C9742F", "#5B3E8F"] }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: "right" }, tooltip: { callbacks: { label: function (c) { return c.label + ": " + brl(c.parsed); } } } } } });
    grafico("gCli", { type: "line", data: { labels: MESES, datasets: [{ label: "Clientes que pagaram", data: pag.map(function (l) { return l.length; }), borderColor: "#0B1F3A", backgroundColor: "rgba(201,162,74,.25)", fill: true, tension: .3, pointRadius: 4 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } } });
  }
  const selAno = document.getElementById("selAno");
  for (let a = anoGraf + 1; a >= anoGraf - 4; a--) selAno.insertAdjacentHTML("beforeend", '<option value="' + a + '">' + a + "</option>");
  selAno.value = anoGraf;
  selAno.addEventListener("change", function () { anoGraf = +selAno.value; desenharGraficos(); });

  /* ---------- ligação com a DRE ---------- */
  async function carregarContasDre(eid) {
    if (!eid) { contasDre = []; return; }
    const r = await supa().from("contas").select("id,nome,grupo").eq("empresa_id", eid).eq("tipo", "receita").eq("ativo", true).order("ordem");
    contasDre = r.data || [];
  }
  function desenharConfigDre() {
    const selE = document.getElementById("dreEmpresa"), selC = document.getElementById("dreConta");
    if (!minhasEmpresas.length) {
      selE.innerHTML = '<option value="">Nenhuma empresa sua cadastrada</option>';
      selC.innerHTML = '<option value="">—</option>';
      document.getElementById("dreAbrir").hidden = true;
      return;
    }
    selE.innerHTML = '<option value="">Não lançar na DRE</option>' + minhasEmpresas.map(function (e) { return '<option value="' + e.id + '">' + esc(e.nome) + "</option>"; }).join("");
    selE.value = pref.dre_empresa_id || "";
    selC.innerHTML = contasDre.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nome) + "</option>"; }).join("") || '<option value="">—</option>';
    if (pref.dre_conta_id) selC.value = pref.dre_conta_id;
    const ab = document.getElementById("dreAbrir");
    ab.hidden = !pref.dre_empresa_id;
    if (pref.dre_empresa_id) ab.href = "dre.html?e=" + pref.dre_empresa_id;
  }
  document.getElementById("dreEmpresa").addEventListener("change", async function () {
    await carregarContasDre(this.value);
    const selC = document.getElementById("dreConta");
    selC.innerHTML = contasDre.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nome) + "</option>"; }).join("") || '<option value="">—</option>';
    const servicos = contasDre.find(function (c) { return /servi/i.test(c.nome); });
    if (servicos) selC.value = servicos.id;
  });
  document.getElementById("dreSalvar").addEventListener("click", async function () {
    const e = document.getElementById("dreEmpresa").value, c = document.getElementById("dreConta").value;
    pref = Object.assign({}, pref, { dre_empresa_id: e || null, dre_conta_id: e ? c || null : null });
    const { error } = await supa().from("preferencias").upsert({ perfil_id: eu.id, dados: pref, atualizado_em: new Date().toISOString() }, { onConflict: "perfil_id" });
    if (error) { aviso("Não foi possível salvar.", true); return; }
    aviso(e ? "Pronto: os próximos recebimentos entram nessa DRE." : "Recebimentos não serão lançados na DRE.");
    desenharConfigDre();
  });

  /* ---------- receber / desfazer ---------- */
  const jp = document.getElementById("janelaPagar");
  let cobPagar = null;
  function abrirPagar(id) {
    cobPagar = cobrancas.find(function (c) { return c.id === id; });
    if (!cobPagar) return;
    document.getElementById("pgInfo").textContent = pessoa(cobPagar.perfil_id).nome + " · " + cobPagar.descricao + " · " + brl(cobPagar.valor);
    document.getElementById("pgData").value = hoje;
    document.getElementById("pgForma").value = cobPagar.forma || "";
    jp.showModal();
  }
  document.getElementById("pgCancelar").addEventListener("click", function () { jp.close(); });
  document.getElementById("pgConfirmar").addEventListener("click", async function () {
    const c = cobPagar; if (!c) return;
    const data = document.getElementById("pgData").value || hoje, forma = document.getElementById("pgForma").value.trim() || null;
    const b = this; b.disabled = true;
    let lancId = null;
    if (pref.dre_empresa_id && pref.dre_conta_id && !c.lancamento_id) {
      const rl = await supa().from("lancamentos").insert({ empresa_id: pref.dre_empresa_id, conta_id: pref.dre_conta_id, data: data, valor: c.valor,
        descricao: "Recebido: " + pessoa(c.perfil_id).nome + " · " + c.descricao }).select("id").single();
      if (rl.error) aviso("Recebimento salvo, mas não entrou na DRE. Confira a empresa e a conta escolhidas.", true);
      else lancId = rl.data.id;
    }
    const upd = { pago_em: data, forma: forma };
    if (lancId) upd.lancamento_id = lancId;
    const { error } = await supa().from("cobrancas").update(upd).eq("id", c.id);
    b.disabled = false;
    if (error) { aviso("Não foi possível registrar o recebimento.", true); return; }
    jp.close();
    aviso("Recebimento registrado" + (lancId ? " e lançado na DRE." : "."));
    await carregar(); desenharTudo();
  });
  let cobEditando = null;
  const jec = document.getElementById("janelaEditarCob");
  function abrirEditarCobranca(id) {
    cobEditando = cobrancas.find(function (x) { return x.id === id; });
    if (!cobEditando) return;
    document.getElementById("ecDesc").value = cobEditando.descricao;
    document.getElementById("ecValor").value = String(cobEditando.valor).replace(".", ",");
    document.getElementById("ecVenc").value = cobEditando.vencimento;
    jec.showModal();
  }
  document.getElementById("ecCancelar").addEventListener("click", function () { jec.close(); });
  document.getElementById("ecConfirmar").addEventListener("click", async function () {
    const desc = document.getElementById("ecDesc").value.trim();
    const valor = lerValor(document.getElementById("ecValor").value);
    const venc = document.getElementById("ecVenc").value;
    if (desc.length < 2 || !(valor > 0) || !venc) { aviso("Preencha descrição, valor e vencimento.", true); return; }
    const b = this; b.disabled = true;
    const { error } = await supa().from("cobrancas").update({ descricao: desc, valor: valor, vencimento: venc }).eq("id", cobEditando.id);
    b.disabled = false;
    if (error) { aviso("Não foi possível salvar.", true); return; }
    jec.close(); aviso("Cobrança atualizada.");
    await carregar(); desenharTudo();
  });

  async function desfazer(id) {
    const c = cobrancas.find(function (x) { return x.id === id; });
    if (!c || !confirm("Desfazer o recebimento de " + brl(c.valor) + "?" + (c.lancamento_id ? " O lançamento na DRE também será apagado." : ""))) return;
    if (c.lancamento_id) await supa().from("lancamentos").delete().eq("id", c.lancamento_id);
    const { error } = await supa().from("cobrancas").update({ pago_em: null, lancamento_id: null }).eq("id", c.id);
    if (error) { aviso("Não foi possível desfazer.", true); return; }
    aviso("Recebimento desfeito.");
    await carregar(); desenharTudo();
  }

  /* ================= COBRANÇAS ================= */
  document.getElementById("avVenc").value = hoje;
  document.getElementById("formAvulsa").addEventListener("submit", async function (e) {
    e.preventDefault();
    const cli = document.getElementById("avCli").value, desc = document.getElementById("avDesc").value.trim();
    const valor = lerValor(document.getElementById("avValor").value), venc = document.getElementById("avVenc").value;
    if (!cli || desc.length < 2 || !(valor > 0) || !venc) { aviso("Preencha cliente, descrição, valor e vencimento.", true); return; }
    const { error } = await supa().from("cobrancas").insert({ perfil_id: cli, descricao: desc, valor: valor, vencimento: venc });
    if (error) { aviso("Não foi possível criar a cobrança.", true); return; }
    this.reset(); document.getElementById("avVenc").value = hoje;
    aviso("Cobrança criada.");
    await carregar(); desenharTudo();
  });
  document.getElementById("filtros").addEventListener("click", function (e) {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filtro = b.dataset.f; desenharCobrancas();
  });
  document.getElementById("buscaCob").addEventListener("input", desenharCobrancas);
  function desenharCobrancas() {
    document.querySelectorAll("#filtros [data-f]").forEach(function (b) { b.style.borderColor = b.dataset.f === filtro ? "#C9A24A" : ""; b.style.background = b.dataset.f === filtro ? "#FBF3DF" : ""; });
    const f = {
      atrasadas: atrasada,
      proximas: function (c) { return !c.pago_em && c.vencimento >= hoje && c.vencimento <= em30; },
      mes: function (c) { return c.vencimento.slice(0, 7) === mesAtual; },
      pagas: function (c) { return c.pago_em && c.pago_em.slice(0, 7) === mesAtual; },
      abertas: function (c) { return !c.pago_em; },
      todas: function () { return true; }
    }[filtro];
    const busca = (document.getElementById("buscaCob").value || "").toLowerCase().trim();
    let lista = cobrancas.filter(f).filter(function (c) { return !busca || (pessoa(c.perfil_id).nome + " " + c.descricao).toLowerCase().indexOf(busca) > -1; });
    if (filtro === "pagas" || filtro === "todas") lista = lista.slice().reverse();
    document.getElementById("totCob").innerHTML = "<span>" + lista.length + (lista.length === 1 ? " cobrança" : " cobranças") + "</span><span>Total: <b>" + brl(soma(lista)) + "</b></span>";
    document.getElementById("listaCob").innerHTML = lista.length ? lista.slice(0, 500).map(function (c) {
      const sit = c.pago_em ? '<span class="selo ok">Recebido em ' + dataBR(c.pago_em) + "</span>" + (c.lancamento_id ? ' <span class="selo">na DRE</span>' : "")
        : (atrasada(c) ? '<span class="selo off">Atrasada há ' + diasDe(c.vencimento) + " dias</span>" : '<span class="selo">Em aberto</span>');
      return "<tr><td><b>" + esc(pessoa(c.perfil_id).nome) + '</b><br><span class="vazio" style="padding:0">' + SERV[servicoDe(c)] + '</span></td><td class="quebra">' + esc(c.descricao) + "</td><td>" + dataBR(c.vencimento) + '</td><td class="n">' + brl(c.valor) + "</td><td>" + sit + "</td><td>" +
        (c.pago_em ? '<button class="btn peq contorno" type="button" data-desfazer="' + c.id + '">Desfazer</button>' : '<button class="btn peq" type="button" data-receber="' + c.id + '">Recebido</button>') +
        (atrasada(c) && linkCobrar(c.perfil_id) ? ' <a class="btn peq" style="background:#1FA855;color:#fff" href="' + linkCobrar(c.perfil_id) + '" target="_blank" rel="noopener">WhatsApp</a>' : "") +
        ' <button class="btn peq contorno" type="button" data-editar-cob="' + c.id + '">Editar</button>' +
        ' <button class="btn peq perigo" type="button" data-apagar-cob="' + c.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="6" class="vazio">Nada por aqui.</td></tr>';
  }

  /* ================= POR CLIENTE ================= */
  function desenharClientes() {
    const ids = [];
    cobrancas.forEach(function (c) { if (ids.indexOf(c.perfil_id) === -1) ids.push(c.perfil_id); });
    contratos.forEach(function (c) { if (ids.indexOf(c.perfil_id) === -1) ids.push(c.perfil_id); });
    custos.forEach(function (c) { if (ids.indexOf(c.perfil_id) === -1) ids.push(c.perfil_id); });
    const linhas = ids.map(function (pid) {
      const l = cobrancas.filter(function (c) { return c.perfil_id === pid; });
      const rec = soma(l.filter(function (c) { return c.pago_em; }));
      const aberto = soma(l.filter(function (c) { return !c.pago_em; }));
      const atr = soma(l.filter(atrasada));
      const cus = soma(custos.filter(function (c) { return c.perfil_id === pid; }));
      const prox = l.filter(function (c) { return !c.pago_em && c.vencimento >= hoje; })[0];
      const servs = contratos.filter(function (c) { return c.perfil_id === pid; }).map(function (c) { return SERV[c.servico] + " (" + PER[c.periodicidade || "parcelado"].toLowerCase() + ")"; });
      return { pid: pid, rec: rec, aberto: aberto, atr: atr, cus: cus, prox: prox, servs: servs };
    }).sort(function (a, b) { return b.atr - a.atr || b.rec - a.rec; });
    document.getElementById("listaCli").innerHTML = linhas.length ? linhas.map(function (x) {
      return "<tr><td><b>" + esc(pessoa(x.pid).nome) + '</b></td><td class="quebra">' + (x.servs.map(esc).join("<br>") || '<span class="vazio">avulso</span>') + "</td>" +
        '<td class="n v-receita">' + brl(x.rec) + '</td><td class="n">' + brl(x.aberto) + '</td><td class="n' + (x.atr ? " v-saida" : "") + '">' + brl(x.atr) + "</td>" +
        '<td class="n">' + brl(x.cus) + '</td><td class="n"><b class="' + (x.rec - x.cus < 0 ? "v-saida" : "") + '">' + brl(x.rec - x.cus) + "</b></td>" +
        "<td>" + (x.prox ? dataBR(x.prox.vencimento) + " · " + brl(x.prox.valor) : '<span class="vazio">—</span>') + "</td>" +
        '<td><button class="btn peq contorno" type="button" data-gerenciar-cli="' + x.pid + '">Gerenciar</button></td></tr>';
    }).join("") : '<tr><td colspan="9" class="vazio">Nenhum cliente com contrato ou cobrança ainda.</td></tr>';
  }
  document.getElementById("listaCli").addEventListener("click", function (e) {
    const b = e.target.closest("[data-gerenciar-cli]"); if (!b) return;
    document.querySelector('[data-aba="contratos"]').click();
    filtro = "todas";
    document.getElementById("buscaCob").value = pessoa(b.dataset.gerenciarCli).nome;
    desenharCobrancas();
  });

  /* ================= CONTRATOS ================= */
  const ctPer = document.getElementById("ctPer");
  function ajustarFormContrato() {
    const per = ctPer.value;
    const recorrente = ["mensal", "quinzenal", "semanal"].indexOf(per) > -1;
    const ehRecorrenteAberto = per === "mensal" && document.getElementById("ctRecorrente").checked;
    document.getElementById("rotValor").textContent = per === "parcelado" ? "Valor total (R$)" : (per === "sessao" ? "Valor por sessão (R$)" : "Valor de cada cobrança (R$)");
    document.getElementById("rotQtd").textContent = per === "parcelado" ? "Parcelas" : "Quantas cobranças gerar agora";
    document.getElementById("blocoQtd").hidden = per === "sessao" || ehRecorrenteAberto;
    document.getElementById("blocoVenc").hidden = per === "sessao";
    document.getElementById("blocoRecorrente").hidden = per !== "mensal";
    if (recorrente && +document.getElementById("ctQtd").value < 2) document.getElementById("ctQtd").value = per === "mensal" ? 6 : (per === "quinzenal" ? 12 : 12);
    if (per === "parcelado" && +document.getElementById("ctQtd").value > 12) document.getElementById("ctQtd").value = 1;
    document.getElementById("ajudaContrato").textContent = {
      parcelado: "Para pacotes com valor fechado. O valor é dividido nas parcelas, mês a mês, a partir do 1º vencimento.",
      mensal: "Cria as cobranças mensais a partir do 1º vencimento. Depois, use \"Gerar mais\" para continuar.",
      quinzenal: "Cria uma cobrança a cada 15 dias a partir do 1º vencimento. Depois, use \"Gerar mais\" para continuar.",
      semanal: "Cria uma cobrança por semana a partir do 1º vencimento. Depois, use \"Gerar mais\" para continuar.",
      sessao: "Nada é cobrado antecipadamente: a cada sessão realizada, clique em \"Registrar sessão\" no contrato."
    }[per];
    document.getElementById("ajudaRecorrente").textContent = ehRecorrenteAberto
      ? "O sistema mantém sempre as próximas cobranças geradas sozinho (um pouco antes de cada mês chegar), sem você precisar criar de novo. Para encerrar, apague o contrato."
      : "";
  }
  ctPer.addEventListener("change", ajustarFormContrato);
  document.getElementById("ctRecorrente").addEventListener("change", ajustarFormContrato);
  document.getElementById("ctVenc").value = hoje; document.getElementById("ctIni").value = hoje;
  ajustarFormContrato();

  async function gerarCobrancas(k, inicio, qtd, desdeIndice) {
    const per = k.periodicidade, linhas = [];
    if (per === "parcelado") {
      const total = +k.valor_total, base = Math.floor(total / qtd * 100) / 100;
      for (let i = 0; i < qtd; i++) {
        linhas.push({ perfil_id: k.perfil_id, contrato_id: k.id, descricao: k.produto + (qtd > 1 ? " · parcela " + (i + 1) + "/" + qtd : ""),
          vencimento: proximaData(inicio, "mensal", i), valor: i === qtd - 1 ? Math.round((total - base * (qtd - 1)) * 100) / 100 : base, forma: k.forma_pagamento });
      }
    } else {
      for (let i = 0; i < qtd; i++) {
        linhas.push({ perfil_id: k.perfil_id, contrato_id: k.id, descricao: k.produto + " · " + PER[per].toLowerCase() + " " + (desdeIndice + i + 1),
          vencimento: proximaData(inicio, per, i), valor: +k.valor_recorrente, forma: k.forma_pagamento });
      }
    }
    return supa().from("cobrancas").insert(linhas);
  }

  document.getElementById("formContrato").addEventListener("submit", async function (e) {
    e.preventDefault();
    const cli = document.getElementById("ctCli").value, per = ctPer.value;
    const produto = document.getElementById("ctProd").value.trim();
    const valor = lerValor(document.getElementById("ctValor").value);
    const ehRecorrenteAberto = per === "mensal" && document.getElementById("ctRecorrente").checked;
    const qtd = ehRecorrenteAberto ? 2 : Math.max(1, Math.min(60, +document.getElementById("ctQtd").value || 1));
    const venc = document.getElementById("ctVenc").value;
    const executor = document.getElementById("ctExecutor").value || null;
    if (!cli) { aviso("Escolha o cliente.", true); return; }
    if (produto.length < 2) { aviso("Escreva a descrição do contrato.", true); return; }
    if (!(valor > 0)) { aviso("Escreva o valor.", true); return; }
    if (per !== "sessao" && !venc) { aviso("Escolha o 1º vencimento.", true); return; }
    const reg = { perfil_id: cli, servico: document.getElementById("ctServ").value, produto: produto, periodicidade: per,
      data_inicio: document.getElementById("ctIni").value || hoje, forma_pagamento: document.getElementById("ctForma").value.trim() || null,
      executor_perfil_id: executor, recorrente_aberto: ehRecorrenteAberto,
      valor_total: per === "parcelado" ? valor : (per === "sessao" ? 0 : Math.round(valor * qtd * 100) / 100),
      valor_recorrente: per === "parcelado" ? null : valor };
    const b = this.querySelector("button[type=submit]"); b.disabled = true;
    const r = await supa().from("contratos").insert(reg).select("id,perfil_id,servico,produto,valor_total,periodicidade,valor_recorrente,forma_pagamento").single();
    if (r.error) { b.disabled = false; aviso("Não foi possível salvar o contrato.", true); return; }
    if (per !== "sessao") {
      const r2 = await gerarCobrancas(r.data, venc, qtd, 0);
      if (r2.error) aviso("Contrato salvo, mas as cobranças não foram criadas.", true);
    }
    b.disabled = false;
    // marca o serviço no cadastro da pessoa, se ainda não estiver
    await supa().from("servicos_contratados").upsert({ perfil_id: cli, tipo: reg.servico, ativo: true }, { onConflict: "perfil_id,tipo" });
    this.reset(); document.getElementById("ctVenc").value = hoje; document.getElementById("ctIni").value = hoje; ajustarFormContrato();
    aviso("Contrato salvo." + (ehRecorrenteAberto ? " As próximas cobranças mensais serão geradas sozinhas." : ""));
    await carregar(); desenharTudo();
  });

  function desenharContratos() {
    document.getElementById("listaContratos").innerHTML = contratos.length ? contratos.slice().reverse().map(function (k) {
      const l = cobrancas.filter(function (c) { return c.contrato_id === k.id; });
      const per = k.periodicidade || "parcelado";
      const desc = per === "parcelado" ? brl(k.valor_total) + " em " + l.length + (l.length === 1 ? " vez" : " vezes") : PER[per] + " · " + brl(k.valor_recorrente) + (per === "sessao" ? " por sessão · " + l.length + (l.length === 1 ? " sessão" : " sessões") : "") + (k.recorrente_aberto ? ' <span class="selo ok">sem prazo</span>' : "");
      return "<tr><td><b>" + esc(pessoa(k.perfil_id).nome) + "</b></td><td>" + SERV[k.servico] + '</td><td class="quebra">' + esc(k.produto) + "</td><td>" + esc(nomeExecutor(k.executor_perfil_id)) + '</td><td class="quebra">' + desc + "</td>" +
        '<td class="n v-receita">' + brl(soma(l.filter(function (c) { return c.pago_em; }))) + '</td><td class="n">' + brl(soma(l.filter(function (c) { return !c.pago_em; }))) + "</td><td>" +
        (per === "sessao" ? '<button class="btn peq" type="button" data-sessao="' + k.id + '">Registrar sessão</button> ' : "") +
        (["mensal", "quinzenal", "semanal"].indexOf(per) > -1 && !k.recorrente_aberto ? '<button class="btn peq contorno" type="button" data-mais="' + k.id + '">Gerar mais</button> ' : "") +
        '<button class="btn peq perigo" type="button" data-apagar-ct="' + k.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="8" class="vazio">Nenhum contrato ainda.</td></tr>';
  }

  const js = document.getElementById("janelaSessao");
  let ctSessao = null;
  document.getElementById("seCancelar").addEventListener("click", function () { js.close(); });
  document.getElementById("seConfirmar").addEventListener("click", async function () {
    const k = ctSessao; if (!k) return;
    const data = document.getElementById("seData").value || hoje;
    const qtd = Math.max(1, Math.min(20, +document.getElementById("seQtd").value || 1));
    const pago = document.getElementById("sePago").checked;
    const anteriores = cobrancas.filter(function (c) { return c.contrato_id === k.id; }).length;
    const linhas = [];
    for (let i = 0; i < qtd; i++) linhas.push({ perfil_id: k.perfil_id, contrato_id: k.id, descricao: k.produto + " · sessão " + (anteriores + i + 1) + " (" + dataBR(data) + ")",
      vencimento: data, valor: +k.valor_recorrente, forma: k.forma_pagamento, pago_em: pago ? data : null });
    const b = this; b.disabled = true;
    const r = await supa().from("cobrancas").insert(linhas).select("id,valor,descricao");
    if (r.error) { b.disabled = false; aviso("Não foi possível registrar a sessão.", true); return; }
    if (pago && pref.dre_empresa_id && pref.dre_conta_id) {
      for (const c of r.data) {
        const rl = await supa().from("lancamentos").insert({ empresa_id: pref.dre_empresa_id, conta_id: pref.dre_conta_id, data: data, valor: c.valor,
          descricao: "Recebido: " + pessoa(k.perfil_id).nome + " · " + c.descricao }).select("id").single();
        if (!rl.error) await supa().from("cobrancas").update({ lancamento_id: rl.data.id }).eq("id", c.id);
      }
    }
    await supa().from("contratos").update({ valor_total: Math.round((+k.valor_total + qtd * +k.valor_recorrente) * 100) / 100 }).eq("id", k.id);
    b.disabled = false; js.close();
    aviso(qtd === 1 ? "Sessão registrada." : qtd + " sessões registradas.");
    await carregar(); desenharTudo();
  });

  /* ================= CUSTOS ================= */
  document.getElementById("cuData").value = hoje;
  document.getElementById("formCusto").addEventListener("submit", async function (e) {
    e.preventDefault();
    const cli = document.getElementById("cuCli").value, valor = lerValor(document.getElementById("cuValor").value);
    if (!cli || !(valor > 0)) { aviso("Escolha o cliente e escreva o valor.", true); return; }
    const { error } = await supa().from("custos_cliente").insert({ perfil_id: cli, data: document.getElementById("cuData").value || hoje, valor: valor, descricao: document.getElementById("cuDesc").value.trim() || null });
    if (error) { aviso("Não foi possível salvar o custo.", true); return; }
    this.reset(); document.getElementById("cuData").value = hoje;
    aviso("Custo registrado.");
    await carregar(); desenharTudo();
  });
  function desenharCustos() {
    document.getElementById("listaCustos").innerHTML = custos.length ? custos.map(function (c) {
      return "<tr><td>" + dataBR(c.data) + "</td><td>" + esc(pessoa(c.perfil_id).nome) + '</td><td class="quebra">' + esc(c.descricao || "") + '</td><td class="n v-saida">' + brl(c.valor) + "</td>" +
        '<td><button class="btn peq perigo" type="button" data-apagar-custo="' + c.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="vazio">Nenhum custo registrado.</td></tr>';
  }

  /* ================= cliques gerais ================= */
  document.querySelector("main").addEventListener("click", async function (e) {
    const t = function (s) { return e.target.closest(s); };
    let b;
    if ((b = t("[data-receber]"))) return abrirPagar(b.dataset.receber);
    if ((b = t("[data-desfazer]"))) return desfazer(b.dataset.desfazer);
    if ((b = t("[data-editar-cob]"))) { return abrirEditarCobranca(b.dataset.editarCob); }
    if ((b = t("[data-apagar-cob]"))) {
      const c = cobrancas.find(function (x) { return x.id === b.dataset.apagarCob; });
      if (!c || !confirm("Apagar a cobrança \"" + c.descricao + "\" de " + brl(c.valor) + "?")) return;
      if (c.lancamento_id) await supa().from("lancamentos").delete().eq("id", c.lancamento_id);
      const { error } = await supa().from("cobrancas").delete().eq("id", c.id);
      if (error) { aviso("Não foi possível apagar.", true); return; }
      await carregar(); desenharTudo(); return;
    }
    if ((b = t("[data-apagar-custo]"))) {
      if (!confirm("Apagar este custo?")) return;
      const { error } = await supa().from("custos_cliente").delete().eq("id", b.dataset.apagarCusto);
      if (error) { aviso("Não foi possível apagar.", true); return; }
      await carregar(); desenharTudo(); return;
    }
    if ((b = t("[data-apagar-ct]"))) {
      const k = contrato(b.dataset.apagarCt);
      if (!k || !confirm("Apagar o contrato \"" + k.produto + "\" de " + pessoa(k.perfil_id).nome + " e todas as cobranças dele? Recebimentos lançados na DRE continuam lá.")) return;
      const { error } = await supa().from("contratos").delete().eq("id", k.id);
      if (error) { aviso("Não foi possível apagar.", true); return; }
      await carregar(); desenharTudo(); return;
    }
    if ((b = t("[data-sessao]"))) {
      ctSessao = contrato(b.dataset.sessao); if (!ctSessao) return;
      document.getElementById("seInfo").textContent = pessoa(ctSessao.perfil_id).nome + " · " + ctSessao.produto + " · " + brl(ctSessao.valor_recorrente) + " por sessão";
      document.getElementById("seData").value = hoje; document.getElementById("seQtd").value = 1; document.getElementById("sePago").checked = true;
      js.showModal(); return;
    }
    if ((b = t("[data-mais]"))) {
      const k = contrato(b.dataset.mais); if (!k) return;
      const l = cobrancas.filter(function (c) { return c.contrato_id === k.id; });
      const qtd = parseInt(prompt("Quantas cobranças " + PER[k.periodicidade].toLowerCase() + "s gerar a mais?", "6"), 10);
      if (!(qtd > 0)) return;
      const ultima = l.length ? l[l.length - 1].vencimento : hoje;
      const r = await gerarCobrancas(k, proximaData(ultima, k.periodicidade, 1), Math.min(qtd, 60), l.length);
      if (r.error) { aviso("Não foi possível gerar as cobranças.", true); return; }
      await supa().from("contratos").update({ valor_total: Math.round((+k.valor_total + qtd * +k.valor_recorrente) * 100) / 100 }).eq("id", k.id);
      aviso(qtd + " cobranças geradas.");
      await carregar(); desenharTudo();
    }
  });

  function desenharTudo() { preencherClientes(); desenharPainel(); desenharCobrancas(); desenharClientes(); desenharContratos(); desenharCustos(); }
  ligarAbas(document.getElementById("abas"), function (nome) { abaAtual = nome; if (nome === "painel") desenharGraficos(); });

  await carregar();
  await carregarContasDre(pref.dre_empresa_id);
  desenharTudo();
})();
