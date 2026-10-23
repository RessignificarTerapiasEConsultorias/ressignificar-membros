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
      supa().from("contratos").select("id,perfil_id,servico,produto,data_inicio,data_fim,valor_total,periodicidade,valor_recorrente,forma_pagamento,ativo,executor_perfil_id,recorrente_aberto,valor_inicial,observacao").order("criado_em"),
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
        return supa().from("cobrancas").select("id,perfil_id,contrato_id,descricao,vencimento,valor,pago_em,forma,lancamento_id,tipo").order("vencimento");
      });
    } catch (e) { cobrancas = []; aviso("Não foi possível carregar as cobranças.", true); }
    await manterRecorrentesEmDia();
  }

  /* ---------- mantém um "estoque" de ~60 dias de cobrança gerado para contratos recorrentes sem prazo fixo ---------- */
  async function manterRecorrentesEmDia() {
    // O banco gera UMA cobrança por vez: a próxima só nasce quando a atual vence ou é paga.
    try {
      const r = await supa().rpc("financeiro_manter_recorrentes");
      if (!r.error && Number(r.data) > 0) {
        cobrancas = await buscarTudo(function () {
          return supa().from("cobrancas").select("id,perfil_id,contrato_id,descricao,vencimento,valor,pago_em,forma,lancamento_id,tipo").order("vencimento");
        });
      }
    } catch (e) { /* segue com o que já foi carregado */ }
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
    jp.querySelector("h2").textContent = cobPagar.vencimento > hoje ? "Registrar pagamento antecipado" : "Registrar recebimento";
    jp.showModal();
  }
  function abrirAlterarPagamento(id) {
    cobPagar = cobrancas.find(function (x) { return x.id === id; });
    if (!cobPagar) return;
    document.getElementById("pgInfo").textContent = pessoa(cobPagar.perfil_id).nome + " · " + cobPagar.descricao + " · " + brl(cobPagar.valor) + " · pago em " + dataBR(cobPagar.pago_em);
    document.getElementById("pgData").value = cobPagar.pago_em;
    document.getElementById("pgForma").value = cobPagar.forma || "";
    jp.querySelector("h2").textContent = "Alterar data do pagamento";
    jp.showModal();
  }
  document.getElementById("pgCancelar").addEventListener("click", function () { jp.close(); });
  document.getElementById("pgConfirmar").addEventListener("click", async function () {
    const c = cobPagar; if (!c) return;
    const data = document.getElementById("pgData").value || hoje, forma = document.getElementById("pgForma").value.trim() || null;
    const b = this; b.disabled = true;
    if (c.pago_em) {   // só ajustando a data ou a forma de um recebimento que já existe
      const r0 = await supa().from("cobrancas").update({ pago_em: data, forma: forma }).eq("id", c.id);
      if (!r0.error && c.lancamento_id) await supa().from("lancamentos").update({ data: data }).eq("id", c.lancamento_id);
      b.disabled = false;
      if (r0.error) { aviso("Não foi possível alterar a data.", true); return; }
      jp.close(); aviso("Data do pagamento alterada."); await carregar(); desenharTudo(); return;
    }
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
      const sit = chipCobranca(c);
      return "<tr><td><b>" + esc(pessoa(c.perfil_id).nome) + '</b><br><span class="vazio" style="padding:0">' + SERV[servicoDe(c)] + '</span></td><td class="quebra">' + esc(c.descricao) + (c.tipo === "extra" ? ' <span class="selo ouro">Extra</span>' : "") + "</td><td>" + dataBR(c.vencimento) + '</td><td class="n">' + brl(c.valor) + "</td><td>" + sit + "</td><td>" +
        (c.pago_em ? '<button class="btn peq contorno" type="button" data-alterar-pag="' + c.id + '">Alterar data</button> <button class="btn peq contorno" type="button" data-desfazer="' + c.id + '">Desfazer</button>' : '<button class="btn peq" type="button" data-receber="' + c.id + '">' + (c.vencimento > hoje ? "Pago antes do vencimento" : "Recebido") + "</button>") +
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
      const aberto = soma(l.filter(function (c) { return !c.pago_em && !atrasada(c); }));
      const atr = soma(l.filter(atrasada));
      const cus = soma(custos.filter(function (c) { return c.perfil_id === pid; }));
      const prox = l.filter(function (c) { return !c.pago_em && c.vencimento >= hoje; })[0];
      const servs = contratos.filter(function (c) { return c.perfil_id === pid; }).map(function (c) { return SERV[c.servico] + " (" + PER[c.periodicidade || "parcelado"].toLowerCase() + ")"; });
      return { pid: pid, rec: rec, aberto: aberto, atr: atr, cus: cus, prox: prox, servs: servs };
    }).sort(function (a, b) { return b.atr - a.atr || b.rec - a.rec; });
    document.getElementById("listaCli").innerHTML = linhas.length ? linhas.map(function (x) {
      return "<tr><td><b>" + esc(pessoa(x.pid).nome) + '</b></td><td class="quebra">' + (x.servs.map(esc).join("<br>") || '<span class="vazio">avulso</span>') + "</td>" +
        '<td class="n v-receita">' + brl(x.rec) + '</td><td class="n v-pendente">' + brl(x.aberto) + '</td><td class="n' + (x.atr ? " v-saida" : "") + '">' + brl(x.atr) + "</td>" +
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
  const RECORRENTES = ["mensal", "quinzenal", "semanal"];
  function contarPeriodos(venc, fim, per) {
    if (!venc || !fim || fim < venc) return 0;
    let n = 0;
    while (n < 120 && proximaData(venc, per, n) <= fim) n++;
    return n;
  }
  function ajustarFormContrato() {
    const per = ctPer.value, recorrente = RECORRENTES.indexOf(per) > -1;
    const semPrazo = recorrente && document.getElementById("ctRecorrente").checked;
    const valor = lerValor(document.getElementById("ctValor").value);
    const venc = document.getElementById("ctVenc").value, fim = document.getElementById("ctFim").value;
    document.getElementById("rotValor").textContent = per === "parcelado" ? "Valor total (R$)" : (per === "sessao" ? "Valor por sessão (R$)" : "Valor de cada cobrança (R$)");
    document.getElementById("rotQtd").textContent = "Parcelas";
    document.getElementById("blocoRecorrente").hidden = !recorrente;
    document.getElementById("blocoTermino").hidden = !(recorrente && !semPrazo);
    document.getElementById("blocoQtd").hidden = per !== "parcelado";
    document.getElementById("blocoVenc").hidden = per === "sessao";
    document.getElementById("blocoExtra").hidden = per === "sessao";
    if (per === "parcelado" && +document.getElementById("ctQtd").value > 12) document.getElementById("ctQtd").value = 1;
    let msg = "";
    if (per === "parcelado") {
      const q = Math.max(1, Math.min(60, +document.getElementById("ctQtd").value || 1));
      if (venc) msg = (q === 1 ? "Pagamento único em " + dataBR(venc) + "." : q + " parcelas mensais" + (valor > 0 ? " de " + brl(valor / q) : "") + ". O contrato termina em " + dataBR(proximaData(venc, "mensal", q - 1)) + ".");
    } else if (semPrazo) {
      msg = "Uma cobrança por vez: a próxima só aparece quando a atual vencer ou for paga. Sem data de término. Quando o cliente cancelar, use o botão \"Encerrar\" no contrato.";
    } else if (recorrente) {
      const n = contarPeriodos(venc, fim, per);
      msg = n ? "Serão criadas " + n + (n === 1 ? " cobrança" : " cobranças") + (valor > 0 ? " de " + brl(valor) + ", total " + brl(valor * n) : "") + ", de " + dataBR(venc) + " até " + dataBR(fim) + "."
              : "Escolha o término do contrato (uma data depois do 1º vencimento).";
    } else msg = "Nada é cobrado antecipadamente: a cada sessão realizada, clique em \"Registrar sessão\" no contrato.";
    document.getElementById("ajudaRecorrente").textContent = msg;
  }
  ["ctPer", "ctRecorrente", "ctVenc", "ctFim", "ctQtd", "ctValor"].forEach(function (id) {
    const el = document.getElementById(id);
    el.addEventListener("change", ajustarFormContrato); el.addEventListener("input", ajustarFormContrato);
  });
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
    const recorrente = RECORRENTES.indexOf(per) > -1;
    const produto = document.getElementById("ctProd").value.trim();
    const valor = lerValor(document.getElementById("ctValor").value);
    const semPrazo = recorrente && document.getElementById("ctRecorrente").checked;
    const venc = document.getElementById("ctVenc").value, fim = document.getElementById("ctFim").value;
    const executor = document.getElementById("ctExecutor").value || null;
    const extra = lerValor(document.getElementById("ctExtra").value);
    if (!cli) { aviso("Escolha o cliente.", true); return; }
    if (produto.length < 2) { aviso("Escreva a descrição do contrato.", true); return; }
    if (!(valor > 0)) { aviso("Escreva o valor.", true); return; }
    if (per !== "sessao" && !venc) { aviso("Escolha o 1º vencimento.", true); return; }
    let qtd = 1, dataFim = null;
    if (per === "parcelado") { qtd = Math.max(1, Math.min(60, +document.getElementById("ctQtd").value || 1)); dataFim = proximaData(venc, "mensal", qtd - 1); }
    else if (recorrente && semPrazo) { qtd = 1; }
    else if (recorrente) {
      if (!fim) { aviso("Escolha o término do contrato.", true); return; }
      qtd = contarPeriodos(venc, fim, per);
      if (qtd < 1) { aviso("O término precisa ser depois do 1º vencimento.", true); return; }
      dataFim = fim;
    }
    const reg = { perfil_id: cli, servico: document.getElementById("ctServ").value, produto: produto, periodicidade: per,
      data_inicio: document.getElementById("ctIni").value || hoje, data_fim: dataFim, forma_pagamento: document.getElementById("ctForma").value.trim() || null,
      executor_perfil_id: executor, recorrente_aberto: semPrazo,
      valor_total: per === "parcelado" ? valor : (per === "sessao" ? 0 : Math.round(valor * qtd * 100) / 100),
      valor_recorrente: per === "parcelado" ? null : valor };
    const b = this.querySelector("button[type=submit]"); b.disabled = true;
    const r = await supa().from("contratos").insert(reg).select("id,perfil_id,servico,produto,valor_total,periodicidade,valor_recorrente,forma_pagamento").single();
    if (r.error) { b.disabled = false; aviso("Não foi possível salvar o contrato.", true); return; }
    if (per !== "sessao") {
      const r2 = await gerarCobrancas(r.data, venc, qtd, 0);
      if (r2.error) aviso("Contrato salvo, mas as cobranças não foram criadas.", true);
      else if (extra > 0 && per !== "sessao") {
        const rx = await supa().rpc("contrato_adicionar_extra", { p_contrato: r.data.id, p_valor: extra, p_descricao: document.getElementById("ctExtraDesc").value.trim() || "Comissão / valor extra", p_vencimento: venc, p_pago_em: null });
        if (rx.error || !rx.data || !rx.data.ok) aviso("Contrato salvo, mas o valor extra não foi lançado. Use o botão \"Extra\" no contrato.", true);
      }
    }
    b.disabled = false;
    await supa().from("servicos_contratados").upsert({ perfil_id: cli, tipo: reg.servico, ativo: true }, { onConflict: "perfil_id,tipo" });
    this.reset(); document.getElementById("ctVenc").value = hoje; document.getElementById("ctIni").value = hoje; ajustarFormContrato();
    aviso("Contrato salvo." + (semPrazo ? " As próximas cobranças aparecem uma por vez, sozinhas." : ""));
    await carregar(); desenharTudo();
  });

  const expandidos = {};
  function chipCobranca(c) {
    if (c.pago_em) return '<span class="selo ok">Pago em ' + dataBR(c.pago_em) + "</span>" + (c.lancamento_id ? ' <span class="selo">na DRE</span>' : "");
    if (atrasada(c)) return '<span class="selo off">Atrasado há ' + diasDe(c.vencimento) + (diasDe(c.vencimento) === 1 ? " dia" : " dias") + "</span>";
    return '<span class="selo pendente">Pendente · vence ' + dataBR(c.vencimento) + "</span>";
  }
  function ganhoDoContrato(k, l) {
    let g = 0;
    l.forEach(function (c) {
      if (c.tipo === "extra") g += +c.valor;
      else if (RECORRENTES.indexOf(k.periodicidade) > -1 || k.periodicidade === "sessao") g += Math.max(0, +c.valor - (+k.valor_inicial || +c.valor));
    });
    return g;
  }
  function condicaoContrato(k, l) {
    const per = k.periodicidade || "parcelado";
    let t = per === "parcelado" ? (l.filter(function (c) { return c.tipo !== "extra"; }).length === 1 ? "Pagamento único · " : "Valor fechado · ") + brl(k.valor_inicial || k.valor_total)
      : PER[per] + " · " + brl(k.valor_recorrente) + (per === "sessao" ? " por sessão" : "");
    if (per !== "parcelado" && per !== "sessao" && +k.valor_inicial && +k.valor_inicial !== +k.valor_recorrente) t += ' <span class="selo ok">reajustado: era ' + brl(k.valor_inicial) + "</span>";
    if (k.recorrente_aberto && !k.data_fim) t += ' <span class="selo ouro">recorrente sem prazo</span>';
    else if (k.data_fim) t += (k.recorrente_aberto ? " · encerrado em " : " · término ") + dataBR(k.data_fim);
    const g = ganhoDoContrato(k, l);
    if (g > 0) t += ' <span class="selo ok">ganho extra ' + brl(g) + "</span>";
    return t;
  }
  function desenharContratos() {
    const html = [];
    contratos.slice().reverse().forEach(function (k) {
      const l = cobrancas.filter(function (c) { return c.contrato_id === k.id; });
      const per = k.periodicidade || "parcelado";
      const rec = soma(l.filter(function (c) { return c.pago_em; })), pen = soma(l.filter(function (c) { return !c.pago_em && !atrasada(c); })), atr = soma(l.filter(atrasada));
      const aberto = !!expandidos[k.id];
      html.push("<tr><td><b>" + esc(pessoa(k.perfil_id).nome) + "</b></td><td>" + SERV[k.servico] + '</td><td class="quebra">' + esc(k.produto) + "</td><td>" + esc(nomeExecutor(k.executor_perfil_id)) + '</td><td class="quebra">' + condicaoContrato(k, l) + "</td>" +
        '<td class="n v-receita">' + brl(rec) + '</td><td class="n v-pendente">' + brl(pen) + '</td><td class="n' + (atr ? " v-saida" : "") + '">' + brl(atr) + "</td><td>" +
        '<button class="btn peq contorno" type="button" data-parcelas="' + k.id + '" aria-expanded="' + aberto + '">' + (aberto ? "Ocultar parcelas" : "Parcelas (" + l.length + ")") + "</button> " +
        '<button class="btn peq contorno" type="button" data-editar-ct="' + k.id + '">Editar</button> ' +
        (per !== "sessao" ? '<button class="btn peq contorno" type="button" data-extra="' + k.id + '">Extra</button> ' : "") +
        (per === "sessao" ? '<button class="btn peq" type="button" data-sessao="' + k.id + '">Registrar sessão</button> ' : "") +
        (k.recorrente_aberto && !k.data_fim ? '<button class="btn peq contorno" type="button" data-encerrar="' + k.id + '">Encerrar</button> ' : "") +
        '<button class="btn peq perigo" type="button" data-apagar-ct="' + k.id + '">Apagar</button></td></tr>');
      if (aberto) {
        html.push('<tr class="sub"><td colspan="9"><div class="tabela-wrap"><table class="t"><thead><tr><th>Cobrança</th><th>Vencimento</th><th class="n">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' +
          (l.length ? l.map(function (c) {
            return "<tr><td class=\"quebra\">" + esc(c.descricao) + (c.tipo === "extra" ? ' <span class="selo ouro">Extra</span>' : "") + "</td><td>" + dataBR(c.vencimento) + '</td><td class="n">' + brl(c.valor) + "</td><td>" + chipCobranca(c) + "</td><td>" +
              (c.pago_em ? '<button class="btn peq contorno" type="button" data-alterar-pag="' + c.id + '">Alterar data</button> <button class="btn peq contorno" type="button" data-desfazer="' + c.id + '">Desfazer</button>'
                         : '<button class="btn peq" type="button" data-receber="' + c.id + '">' + (c.vencimento > hoje ? "Pago antes do vencimento" : "Recebido") + "</button>") +
              ' <button class="btn peq contorno" type="button" data-editar-cob="' + c.id + '">Editar</button> <button class="btn peq perigo" type="button" data-apagar-cob="' + c.id + '">Apagar</button></td></tr>';
          }).join("") : '<tr><td colspan="5" class="vazio">Sem cobranças.</td></tr>') + "</tbody></table></div></td></tr>");
      }
    });
    document.getElementById("listaContratos").innerHTML = html.length ? html.join("") : '<tr><td colspan="9" class="vazio">Nenhum contrato ainda.</td></tr>';
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

  /* ================= editar contrato (inclui mudar o valor = ganho extra) ================= */
  const jct = document.getElementById("janelaEditarContrato");
  let ctEdit = null;
  function abrirEditarContrato(id) {
    const k = ctEdit = contrato(id); if (!k) return;
    const per = k.periodicidade || "parcelado", valorAtual = per === "parcelado" ? +k.valor_total : +k.valor_recorrente;
    const semPrazo = k.recorrente_aberto && !k.data_fim;
    document.getElementById("ectInfo").textContent = pessoa(k.perfil_id).nome + " · valor inicial " + brl(k.valor_inicial || valorAtual) + " · atual " + brl(valorAtual);
    document.getElementById("ectDesc").value = k.produto; document.getElementById("ectForma").value = k.forma_pagamento || "";
    const equipe = perfis.filter(function (p) { return (p.papel === "suporte" || p.papel === "profissional") && p.ativo; });
    const sel = document.getElementById("ectExecutor");
    sel.innerHTML = '<option value="">Eu mesmo (Mauricio)</option>' + equipe.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join("");
    sel.value = k.executor_perfil_id || "";
    document.getElementById("ectFimBox").hidden = semPrazo || per === "sessao";
    document.getElementById("ectSemPrazo").hidden = !semPrazo;
    document.getElementById("ectFim").value = k.data_fim || "";
    document.getElementById("ectRotValor").textContent = per === "parcelado" ? "Valor total (R$)" : (per === "sessao" ? "Valor por sessão (R$)" : "Valor de cada cobrança (R$)");
    document.getElementById("ectValor").value = String(valorAtual).replace(".", ",");
    document.getElementById("ectVig").value = hoje; document.getElementById("ectAplicar").checked = true;
    document.getElementById("ectAplicarBox").hidden = per === "parcelado";
    document.getElementById("ectMotivo").value = "";
    jct.showModal();
  }
  document.getElementById("ectCancelar").addEventListener("click", function () { jct.close(); });
  document.getElementById("ectSalvar").addEventListener("click", async function () {
    const k = ctEdit; if (!k) return;
    const per = k.periodicidade || "parcelado", semPrazo = k.recorrente_aberto && !k.data_fim;
    const produto = document.getElementById("ectDesc").value.trim();
    if (produto.length < 2) { aviso("Escreva a descrição.", true); return; }
    const upd = { produto: produto, forma_pagamento: document.getElementById("ectForma").value.trim() || null, executor_perfil_id: document.getElementById("ectExecutor").value || null };
    const novoFim = document.getElementById("ectFim").value || null;
    if (!semPrazo && per !== "sessao") { if (!novoFim) { aviso("Escolha o término do contrato.", true); return; } upd.data_fim = novoFim; }
    const valorAtual = per === "parcelado" ? +k.valor_total : +k.valor_recorrente, novoValor = lerValor(document.getElementById("ectValor").value);
    const mudouValor = novoValor > 0 && Math.abs(novoValor - valorAtual) > 0.004;
    const recorrenteComPrazo = RECORRENTES.indexOf(per) > -1 && !semPrazo;
    const encurtou = recorrenteComPrazo && k.data_fim && novoFim && novoFim < k.data_fim;
    if (encurtou && !confirm("O novo término é antes do atual. As cobranças ainda não pagas depois de " + dataBR(novoFim) + " serão apagadas. Continuar?")) return;
    const b = this; b.disabled = true;
    let ganho = 0;
    try {
      if (mudouValor) {
        const rr = await supa().rpc("contrato_reajustar", { p_contrato: k.id, p_novo_valor: novoValor, p_vigencia: document.getElementById("ectVig").value || hoje, p_aplicar_futuras: document.getElementById("ectAplicar").checked, p_motivo: document.getElementById("ectMotivo").value.trim() || null });
        if (rr.error || !rr.data || !rr.data.ok) { aviso((rr.data && rr.data.erro) || "Não foi possível mudar o valor.", true); return; }
        ganho = +rr.data.ganho_por_cobranca || 0;
      }
      const r1 = await supa().from("contratos").update(upd).eq("id", k.id);
      if (r1.error) { aviso("Não foi possível salvar o contrato.", true); return; }
      if (recorrenteComPrazo && k.data_fim && novoFim && novoFim !== k.data_fim) {
        if (encurtou) {
          await supa().from("cobrancas").delete().eq("contrato_id", k.id).is("pago_em", null).is("lancamento_id", null).gt("vencimento", novoFim);
        } else {
          const normais = cobrancas.filter(function (c) { return c.contrato_id === k.id && c.tipo !== "extra"; }).sort(function (a, c) { return a.vencimento < c.vencimento ? -1 : 1; });
          const base = normais.length ? normais[0].vencimento : hoje, linhas = [];
          const valorNovo = mudouValor ? novoValor : valorAtual;
          for (let i = normais.length; i < 200; i++) {
            const d = proximaData(base, per, i); if (d > novoFim) break;
            linhas.push({ perfil_id: k.perfil_id, contrato_id: k.id, descricao: produto + " · " + PER[per].toLowerCase() + " " + (i + 1), vencimento: d, valor: valorNovo, forma: upd.forma_pagamento });
          }
          if (linhas.length) {
            const ri = await supa().from("cobrancas").insert(linhas);
            if (!ri.error) await supa().from("contratos").update({ valor_total: Math.round((+k.valor_total + linhas.length * valorNovo) * 100) / 100 }).eq("id", k.id);
          }
        }
      }
      jct.close();
      aviso(mudouValor ? (ganho > 0 ? "Contrato salvo. Ganho extra de " + brl(ganho) + " por cobrança registrado." : "Contrato salvo. Valor atualizado.") : "Contrato salvo.");
      await carregar(); desenharTudo();
    } finally { b.disabled = false; }
  });

  /* ================= valor extra (comissão, serviço adicional) ================= */
  const jex = document.getElementById("janelaExtra");
  let exCt = null;
  function abrirExtra(id) {
    exCt = contrato(id); if (!exCt) return;
    document.getElementById("exInfo").textContent = pessoa(exCt.perfil_id).nome + " · " + exCt.produto;
    document.getElementById("exValor").value = ""; document.getElementById("exVenc").value = hoje; document.getElementById("exDesc").value = ""; document.getElementById("exPago").checked = false;
    jex.showModal();
  }
  document.getElementById("exCancelar").addEventListener("click", function () { jex.close(); });
  document.getElementById("exSalvar").addEventListener("click", async function () {
    const valor = lerValor(document.getElementById("exValor").value);
    if (!(valor > 0)) { aviso("Escreva o valor extra.", true); return; }
    const b = this; b.disabled = true;
    const r = await supa().rpc("contrato_adicionar_extra", { p_contrato: exCt.id, p_valor: valor, p_descricao: document.getElementById("exDesc").value.trim() || "Comissão / valor extra", p_vencimento: document.getElementById("exVenc").value || hoje, p_pago_em: null });
    b.disabled = false;
    if (r.error || !r.data || !r.data.ok) { aviso((r.data && r.data.erro) || "Não foi possível adicionar o extra.", true); return; }
    jex.close(); aviso("Valor extra de " + brl(valor) + " lançado.");
    const querPago = document.getElementById("exPago").checked;
    await carregar(); desenharTudo();
    if (querPago) abrirPagar(r.data.cobranca_id);
  });

  /* ================= encerrar contrato recorrente ================= */
  const jen = document.getElementById("janelaEncerrar");
  let enCt = null;
  function abrirEncerrar(id) {
    enCt = contrato(id); if (!enCt) return;
    document.getElementById("enInfo").textContent = pessoa(enCt.perfil_id).nome + " · " + enCt.produto;
    document.getElementById("enData").value = hoje; jen.showModal();
  }
  document.getElementById("enCancelar").addEventListener("click", function () { jen.close(); });
  document.getElementById("enConfirmar").addEventListener("click", async function () {
    const b = this; b.disabled = true;
    const r = await supa().rpc("contrato_encerrar", { p_contrato: enCt.id, p_data: document.getElementById("enData").value || hoje });
    b.disabled = false;
    if (r.error || !r.data || !r.data.ok) { aviso("Não foi possível encerrar o contrato.", true); return; }
    jen.close(); aviso("Contrato encerrado." + (r.data.removidas ? " " + r.data.removidas + (r.data.removidas === 1 ? " cobrança futura removida." : " cobranças futuras removidas.") : ""));
    await carregar(); desenharTudo();
  });

  /* ================= GANHOS EXTRAS ================= */
  let gaDados = { clientes: [], meses: [] }, gaFiltro = "todos", gaAbertos = {}, reajustes = [], gaIniciado = false;
  const nomeMesAno = function (ym) { return MESES[+ym.slice(5, 7) - 1] + "/" + ym.slice(2, 4); };
  async function carregarGanhos() {
    if (!gaIniciado) {
      const d = new Date(hoje + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 365); document.getElementById("gaDe").value = d.toISOString().slice(0, 10);
      const f = new Date(hoje + "T12:00:00Z"); f.setUTCDate(f.getUTCDate() + 120); document.getElementById("gaAte").value = f.toISOString().slice(0, 10);
      gaIniciado = true;
    }
    const r = await supa().rpc("financeiro_ganhos", { p_de: document.getElementById("gaDe").value || null, p_ate: document.getElementById("gaAte").value || null });
    if (r.error) { aviso("Não foi possível carregar os ganhos.", true); return; }
    gaDados = r.data && r.data.clientes ? r.data : { clientes: [], meses: [] };
    const rr = await supa().from("contratos_reajustes").select("id,contrato_id,perfil_id,vigencia,valor_anterior,valor_novo,motivo").order("vigencia");
    reajustes = rr.data || [];
    desenharGanhos();
  }
  document.getElementById("gaAplicar").addEventListener("click", carregarGanhos);
  function desenharGanhos() {
    const cl = gaDados.clientes || [];
    const total = cl.reduce(function (s, c) { return s + (+c.ganho_total || 0); }, 0), recebido = cl.reduce(function (s, c) { return s + (+c.ganho_recebido || 0); }, 0);
    const com = cl.filter(function (c) { return c.teve_ganho; }).length, sem = cl.length - com;
    document.getElementById("gaKpis").innerHTML = [["Ganho extra no período", '<span class="sobe">' + brl(total) + "</span>", brl(recebido) + " já recebido"], ["Clientes com ganho", String(com), "de " + cl.length + " com contrato"], ["Clientes sem ganho", String(sem), sem ? "valor igual ao inicial" : "todos tiveram ganho"]]
      .map(function (c) { return '<div class="kpi"><small>' + c[0] + "</small><b>" + c[1] + "</b><span>" + c[2] + "</span></div>"; }).join("");
    const ms = gaDados.meses || [];
    grafico("gGanhos", { type: "bar", data: { labels: ms.map(function (m) { return nomeMesAno(m.mes); }), datasets: [
      { label: "Ganho (previsto)", data: ms.map(function (m) { return +m.ganho; }), backgroundColor: "#E3DCCD", borderRadius: 4 },
      { label: "Já recebido", data: ms.map(function (m) { return +m.recebido; }), backgroundColor: "#1FA855", borderRadius: 4 }] },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: moedaTick } } }, plugins: { tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + brl(c.parsed.y); } } } } } });
    document.querySelectorAll("#gaFiltros [data-gf]").forEach(function (b) { b.style.borderColor = b.dataset.gf === gaFiltro ? "#C9A24A" : ""; b.style.background = b.dataset.gf === gaFiltro ? "#FBF3DF" : ""; });
    const lista = cl.filter(function (c) { return gaFiltro === "todos" || (gaFiltro === "com" ? c.teve_ganho : !c.teve_ganho); });
    const linhas = [];
    lista.forEach(function (c) {
      const aberto = !!gaAbertos[c.perfil_id];
      linhas.push("<tr><td><b>" + esc(c.nome) + "</b></td><td>" + (c.teve_ganho ? '<span class="selo ok">Teve ganho</span>' : '<span class="selo">Sem ganho</span>') + '</td><td class="n">' + brl(c.ganho_reajuste) + '</td><td class="n">' + brl(c.ganho_extra) + '</td><td class="n"><b class="' + (c.teve_ganho ? "v-receita" : "") + '">' + brl(c.ganho_total) + "</b></td><td>" + (c.ultimo_ganho ? dataBR(c.ultimo_ganho) : "—") +
        '</td><td><button class="btn peq contorno" type="button" data-ga-det="' + c.perfil_id + '">' + (aberto ? "Ocultar" : "Detalhes") + "</button></td></tr>");
      if (aberto) {
        const ids = (c.contratos || []).map(function (k) { return k.contrato_id; });
        const det = (c.contratos || []).map(function (k) {
          return "<li><b>" + esc(k.produto) + "</b> (" + PER[k.periodicidade || "parcelado"].toLowerCase() + "): inicial " + brl(k.valor_inicial) + " → atual " + brl(k.valor_atual) + " · reajuste " + brl(k.ganho_reajuste) + " · extras " + brl(k.ganho_extra) + "</li>";
        }).join("");
        const rj = reajustes.filter(function (r) { return ids.indexOf(r.contrato_id) > -1; }).map(function (r) {
          return "<li>" + dataBR(r.vigencia) + ": de " + brl(r.valor_anterior) + " para " + brl(r.valor_novo) + (r.motivo ? " · " + esc(r.motivo) : "") + "</li>";
        }).join("");
        const ex = cobrancas.filter(function (x) { return ids.indexOf(x.contrato_id) > -1 && x.tipo === "extra"; }).map(function (x) {
          return "<li>" + dataBR(x.vencimento) + ": " + esc(x.descricao) + " · " + brl(x.valor) + " " + chipCobranca(x) + "</li>";
        }).join("");
        linhas.push('<tr class="sub"><td colspan="7"><ul class="res-lista" style="margin:0"><li><b>Contratos</b><ul style="margin:6px 0 0 18px">' + (det || "<li>—</li>") + "</ul></li>" +
          (rj ? "<li><b>Reajustes de valor</b><ul style=\"margin:6px 0 0 18px\">" + rj + "</ul></li>" : "") + (ex ? "<li><b>Extras e comissões</b><ul style=\"margin:6px 0 0 18px\">" + ex + "</ul></li>" : "") + "</ul></td></tr>");
      }
    });
    document.getElementById("gaLista").innerHTML = linhas.length ? linhas.join("") : '<tr><td colspan="7" class="vazio">Nenhum cliente neste filtro.</td></tr>';
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
    if ((b = t("[data-parcelas]"))) { expandidos[b.dataset.parcelas] = !expandidos[b.dataset.parcelas]; desenharContratos(); return; }
    if ((b = t("[data-alterar-pag]"))) return abrirAlterarPagamento(b.dataset.alterarPag);
    if ((b = t("[data-editar-ct]"))) return abrirEditarContrato(b.dataset.editarCt);
    if ((b = t("[data-extra]"))) return abrirExtra(b.dataset.extra);
    if ((b = t("[data-encerrar]"))) return abrirEncerrar(b.dataset.encerrar);
    if ((b = t("[data-gf]"))) { gaFiltro = b.dataset.gf; desenharGanhos(); return; }
    if ((b = t("[data-ga-det]"))) { gaAbertos[b.dataset.gaDet] = !gaAbertos[b.dataset.gaDet]; desenharGanhos(); return; }
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
  ligarAbas(document.getElementById("abas"), function (nome) { abaAtual = nome; if (nome === "painel") desenharGraficos(); if (nome === "ganhos") carregarGanhos(); });

  await carregar();
  await carregarContasDre(pref.dre_empresa_id);
  desenharTudo();
})();
