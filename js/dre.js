/* Tela da DRE: lançar, ver a DRE do ano, painel com gráficos e leituras, produtos e plano de contas. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  const gestor = eu.papel !== "cliente";
  if (!gestor) document.querySelectorAll(".so-gestor").forEach(function (el) { el.remove(); });

  function falha(msg) {
    document.getElementById("falhaMsg").textContent = msg;
    document.getElementById("falha").hidden = false;
  }
  const eid = new URLSearchParams(location.search).get("e");
  if (!eid) return falha("Nenhuma empresa foi escolhida. Volte ao painel e clique em \"Abrir DRE\".");
  const re = await supa().from("empresas").select("id,nome,segmento,tipo").eq("id", eid).maybeSingle();
  if (!re.data) return falha("Esta empresa não existe ou você não tem acesso a ela.");
  const emp = re.data;
  const pessoal = emp.tipo === "pessoal";

  /* ---------- textos conforme o tipo ---------- */
  const T = pessoal
    ? { receita: "Renda", entrada: "Renda", entradas: "Renda", saidas: "Gastos", despesa: "Gasto", despesas: "Gastos",
        resultado: "Sobra do mês", margemLiq: "% da renda que sobrou", entradaDica: "salário, pró-labore", despesaDica: "casa, mercado, cartão" }
    : { receita: "Receita", entrada: "Entrada", entradas: "Entradas", saidas: "Saídas", despesa: "Despesa", despesas: "Despesas",
        resultado: "Resultado", margemLiq: "Margem líquida", entradaDica: "venda, serviço", despesaDica: "aluguel, folha, contas" };

  document.title = emp.nome + " | DRE";
  document.getElementById("nomeEmpresa").textContent = emp.nome;
  document.getElementById("tipoEmpresa").textContent = pessoal ? "Orçamento pessoal" : "Empresa";
  document.getElementById("subEmpresa").textContent = emp.segmento || (pessoal ? "Renda e gastos do dia a dia." : "Entradas, custos e despesas do dia a dia.");
  document.querySelector('[data-rot="entrada"]').textContent = T.entrada;
  document.querySelector('[data-rot="entradaDica"]').textContent = T.entradaDica;
  document.querySelector('[data-rot="despesa"]').textContent = T.despesa;
  document.querySelector('[data-rot="despesaDica"]').textContent = T.despesaDica;
  if (pessoal) {
    document.querySelector('.tipo[data-tipo="cmv"]').remove();
    document.getElementById("tipos").classList.add("dois");
    document.getElementById("blocoProduto").remove();
    document.querySelectorAll(".col-prod").forEach(function (el) { el.remove(); });
    document.getElementById("cartaoG4").remove();
    document.getElementById("cartaoProdutos").remove();
    const opCmv = document.querySelector('#cTipo option[value="cmv"]');
    if (opCmv) opCmv.remove();
    document.querySelector('[data-rot="g1"]').textContent = "Renda x gastos por mês";
    document.querySelector('[data-rot="g2"]').textContent = "Sobra por mês";
  }
  if (!pessoal) {
    const rmod = await supa().from("empresa_modulos").select("modulo_chave,ativo").eq("empresa_id", eid).eq("ativo", true);
    const modulosAtivos = (rmod.data || []).map(function (m) { return m.modulo_chave; });
    if (modulosAtivos.indexOf("vendas_vendedor") !== -1) {
      const lv = document.getElementById("linkVendas"); lv.href = "vendas.html?e=" + eid; lv.hidden = false;
    }
    if (modulosAtivos.indexOf("lives") !== -1) document.getElementById("abaLives").hidden = false;
    const lm = document.getElementById("linkModulos"); if (lm) { lm.href = "modulos.html?e=" + eid; lm.hidden = false; }
  }
  document.getElementById("areaDre").hidden = false;

  /* ---------- estado ---------- */
  const hoje = new Date();
  let ano = hoje.getFullYear(), mes = hoje.getMonth();
  let contas = [], produtos = [], lanc = [], ultimoLanc = null;
  let contaMap = {}, produtoMap = {};
  let tipoSel = "receita", editId = null, graficos = {}, abaAtual = "lancar";

  /* ---------- período ---------- */
  const selAno = document.getElementById("selAno"), selMes = document.getElementById("selMes");
  for (let a = hoje.getFullYear() + 1; a >= hoje.getFullYear() - 4; a--) selAno.insertAdjacentHTML("beforeend", '<option value="' + a + '">' + a + "</option>");
  MESES_LONGOS.forEach(function (m, i) { selMes.insertAdjacentHTML("beforeend", '<option value="' + i + '">' + m[0].toUpperCase() + m.slice(1) + "</option>"); });
  selAno.value = ano; selMes.value = mes;
  selAno.addEventListener("change", async function () { ano = +selAno.value; await carregarAno(); desenharTudo(); });
  selMes.addEventListener("change", function () { mes = +selMes.value; desenharTudo(); });

  /* ---------- carregar dados ---------- */
  async function carregarCadastros() {
    const rc = await supa().from("contas").select("id,tipo,grupo,nome,ordem,ativo").eq("empresa_id", eid).order("ordem");
    const rp = await supa().from("produtos").select("id,nome,canal,ativo").eq("empresa_id", eid).order("nome");
    contas = rc.data || []; produtos = rp.data || [];
    contaMap = {}; contas.forEach(function (c) { contaMap[c.id] = c; });
    produtoMap = {}; produtos.forEach(function (p) { produtoMap[p.id] = p; });
  }
  async function carregarAno() {
    try {
      lanc = await buscarTudo(function () {
        return supa().from("lancamentos").select("id,conta_id,produto_id,data,valor,descricao")
          .eq("empresa_id", eid).gte("data", ano + "-01-01").lte("data", ano + "-12-31")
          .order("data", { ascending: false }).order("criado_em", { ascending: false });
      });
    } catch (e) { lanc = []; aviso("Não foi possível carregar os lançamentos.", true); }
    const u = await supa().from("lancamentos").select("data").eq("empresa_id", eid).order("data", { ascending: false }).limit(1);
    ultimoLanc = u.data && u.data[0] ? u.data[0].data : null;
  }

  /* ---------- cálculos ---------- */
  const zeros = function () { return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; };
  const soma = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  function calcular() {
    const porConta = {}, porGrupo = {}, porCanal = {}, porProduto = {};
    const tot = { receita: zeros(), cmv: zeros(), despesa: zeros() };
    lanc.forEach(function (l) {
      const c = contaMap[l.conta_id];
      if (!c) return;
      const m = +l.data.slice(5, 7) - 1, v = +l.valor;
      (porConta[c.id] = porConta[c.id] || zeros())[m] += v;
      tot[c.tipo][m] += v;
      if (c.tipo === "despesa") (porGrupo[c.grupo] = porGrupo[c.grupo] || zeros())[m] += v;
      if (c.tipo === "receita") {
        const p = produtoMap[l.produto_id];
        const canal = p ? ROTULO_CANAL[p.canal] : "Sem canal informado";
        (porCanal[canal] = porCanal[canal] || zeros())[m] += v;
        const prod = p ? p.nome : "Sem produto informado";
        (porProduto[prod] = porProduto[prod] || zeros())[m] += v;
      }
    });
    const lucroBruto = tot.receita.map(function (v, i) { return v - tot.cmv[i]; });
    const resultado = lucroBruto.map(function (v, i) { return v - tot.despesa[i]; });
    return { porConta: porConta, porGrupo: porGrupo, porCanal: porCanal, porProduto: porProduto, tot: tot, lucroBruto: lucroBruto, resultado: resultado };
  }

  /* ================= LANÇAR ================= */
  const fLanc = document.getElementById("formLanc");
  const lData = document.getElementById("lData"), lValor = document.getElementById("lValor"), lConta = document.getElementById("lConta");
  const lProduto = document.getElementById("lProduto"), lDesc = document.getElementById("lDesc");
  lData.value = hojeISO();

  function escolherTipo(t) {
    tipoSel = t;
    document.querySelectorAll("#tipos .tipo").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.tipo === t ? "true" : "false"); });
    preencherContas();
  }
  document.getElementById("tipos").addEventListener("click", function (e) {
    const b = e.target.closest(".tipo");
    if (b) escolherTipo(b.dataset.tipo);
  });
  function preencherContas(manter) {
    const lista = contas.filter(function (c) { return c.tipo === tipoSel && (c.ativo || c.id === manter); });
    const grupos = [];
    lista.forEach(function (c) { if (grupos.indexOf(c.grupo) === -1) grupos.push(c.grupo); });
    lConta.innerHTML = '<option value="">Escolha a conta</option>' + grupos.map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + lista.filter(function (c) { return c.grupo === g; }).map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.nome) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
    if (manter) lConta.value = manter;
    if (lProduto) {
      const atual = lProduto.value;
      lProduto.innerHTML = '<option value="">Sem produto ou canal</option>' + produtos.filter(function (p) { return p.ativo || p.id === atual; }).map(function (p) {
        return '<option value="' + p.id + '">' + esc(p.nome) + " · " + ROTULO_CANAL[p.canal] + "</option>";
      }).join("");
      lProduto.value = atual;
      document.getElementById("blocoProduto").hidden = tipoSel !== "receita";
    }
  }

  function limparForm() {
    editId = null;
    lValor.value = ""; lDesc.value = "";
    if (lProduto) lProduto.value = "";
    document.getElementById("tituloForm").textContent = "Novo lançamento";
    document.getElementById("lSalvar").textContent = "Salvar lançamento";
    document.getElementById("lCancelar").hidden = true;
  }
  document.getElementById("lCancelar").addEventListener("click", function () { limparForm(); lData.value = hojeISO(); });

  fLanc.addEventListener("submit", async function (e) {
    e.preventDefault();
    const valor = lerValor(lValor.value);
    if (!lData.value) { aviso("Escolha a data.", true); return; }
    if (!(valor > 0)) { aviso("Escreva um valor maior que zero. Ex.: 1.250,90", true); lValor.focus(); return; }
    if (!lConta.value) { aviso("Escolha a conta.", true); lConta.focus(); return; }
    const reg = {
      empresa_id: eid, conta_id: lConta.value, data: lData.value, valor: valor,
      descricao: lDesc.value.trim() || null,
      produto_id: (lProduto && tipoSel === "receita" && lProduto.value) ? lProduto.value : null
    };
    const botao = document.getElementById("lSalvar");
    botao.disabled = true;
    const r = editId
      ? await supa().from("lancamentos").update(reg).eq("id", editId)
      : await supa().from("lancamentos").insert(reg);
    botao.disabled = false;
    if (r.error) { aviso("Não foi possível salvar o lançamento.", true); return; }
    aviso(editId ? "Lançamento atualizado." : "Lançamento salvo: " + brl(valor));
    const anoLanc = +lData.value.slice(0, 4), mesLanc = +lData.value.slice(5, 7) - 1;
    limparForm();
    if (anoLanc !== ano) { ano = anoLanc; selAno.value = ano; }
    mes = mesLanc; selMes.value = mes;
    await carregarAno();
    desenharTudo();
    lValor.focus();
  });

  function desenharLancamentos() {
    document.getElementById("tituloMes").textContent = "Lançamentos de " + MESES_LONGOS[mes] + " de " + ano;
    const filtro = (document.getElementById("filtroLanc").value || "").toLowerCase().trim();
    const doMes = lanc.filter(function (l) { return +l.data.slice(5, 7) - 1 === mes; });
    let ent = 0, sai = 0;
    doMes.forEach(function (l) { const c = contaMap[l.conta_id]; if (!c) return; if (c.tipo === "receita") ent += +l.valor; else sai += +l.valor; });
    document.getElementById("totaisMes").innerHTML =
      "<span>" + T.entradas + ': <b class="v-receita">' + brl(ent) + "</b></span>" +
      "<span>" + T.saidas + ': <b class="v-saida">' + brl(sai) + "</b></span>" +
      "<span>Saldo: <b class=\"" + (ent - sai < 0 ? "v-saida" : "v-receita") + '">' + brl(ent - sai) + "</b></span>" +
      '<span class="vazio">' + doMes.length + (doMes.length === 1 ? " lançamento" : " lançamentos") + "</span>";
    const lista = doMes.filter(function (l) {
      if (!filtro) return true;
      const c = contaMap[l.conta_id] || {}, p = produtoMap[l.produto_id] || {};
      return ((c.nome || "") + " " + (c.grupo || "") + " " + (p.nome || "") + " " + (l.descricao || "")).toLowerCase().indexOf(filtro) > -1;
    });
    const tb = document.querySelector("#tabLanc tbody");
    const cols = pessoal ? 5 : 6;
    if (!lista.length) {
      tb.innerHTML = '<tr><td colspan="' + cols + '" class="vazio">' + (doMes.length ? "Nada encontrado com esse filtro." : "Nenhum lançamento neste mês ainda. Use o formulário ao lado.") + "</td></tr>";
      return;
    }
    tb.innerHTML = lista.map(function (l) {
      const c = contaMap[l.conta_id] || { nome: "?", tipo: "despesa" };
      const p = produtoMap[l.produto_id];
      const entrada = c.tipo === "receita";
      return "<tr><td>" + dataBR(l.data) + "</td>" +
        '<td class="quebra"><b>' + esc(c.nome) + '</b><br><span class="vazio" style="padding:0">' + esc(c.grupo || "") + "</span></td>" +
        (pessoal ? "" : '<td class="quebra">' + (p ? esc(p.nome) + '<br><span class="vazio" style="padding:0">' + ROTULO_CANAL[p.canal] + "</span>" : '<span class="vazio">—</span>') + "</td>") +
        '<td class="quebra">' + esc(l.descricao || "") + "</td>" +
        '<td class="n ' + (entrada ? "v-receita" : "v-saida") + '">' + (entrada ? "" : "− ") + brl(l.valor) + "</td>" +
        '<td><button class="btn peq contorno" type="button" data-ed="' + l.id + '">Editar</button> <button class="btn peq perigo" type="button" data-del="' + l.id + '">Apagar</button></td></tr>';
    }).join("");
  }
  document.getElementById("filtroLanc").addEventListener("input", desenharLancamentos);
  document.querySelector("#tabLanc tbody").addEventListener("click", async function (e) {
    const be = e.target.closest("[data-ed]"), bd = e.target.closest("[data-del]");
    if (be) {
      const l = lanc.find(function (x) { return x.id === be.dataset.ed; });
      const c = l && contaMap[l.conta_id];
      if (!l || !c) return;
      editId = l.id;
      escolherTipo(c.tipo);
      preencherContas(c.id);
      lData.value = l.data;
      lValor.value = String(l.valor).replace(".", ",");
      lDesc.value = l.descricao || "";
      if (lProduto) lProduto.value = l.produto_id || "";
      document.getElementById("tituloForm").textContent = "Editando lançamento";
      document.getElementById("lSalvar").textContent = "Salvar alteração";
      document.getElementById("lCancelar").hidden = false;
      fLanc.scrollIntoView({ behavior: "smooth", block: "start" });
      lValor.focus();
    }
    if (bd) {
      const l = lanc.find(function (x) { return x.id === bd.dataset.del; });
      if (!l || !confirm("Apagar este lançamento de " + brl(l.valor) + " do dia " + dataBR(l.data) + "?")) return;
      const { error } = await supa().from("lancamentos").delete().eq("id", l.id);
      if (error) { aviso("Não foi possível apagar.", true); return; }
      if (editId === l.id) limparForm();
      lanc = lanc.filter(function (x) { return x.id !== l.id; });
      aviso("Lançamento apagado.");
      desenharTudo();
    }
  });

  /* ================= DRE ================= */
  function num(v) {
    v = Math.round(v * 100) / 100;
    if (v === 0) return "–";
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function linha(rotulo, valores, classe, ehPct, totalPct) {
    const tot = ehPct ? totalPct : soma(valores);
    const cel = function (v, i) {
      const txt = ehPct ? (isFinite(v) && v !== 0 ? pct(v) : "–") : num(v);
      return '<td class="n' + (v < 0 ? " neg" : "") + (i === mes ? " mes-atual" : "") + '">' + txt + "</td>";
    };
    return '<tr class="' + (classe || "") + '"><td>' + esc(rotulo) + "</td>" + valores.map(cel).join("") +
      '<td class="n' + (tot < 0 ? " neg" : "") + '">' + (ehPct ? (isFinite(tot) && tot !== 0 ? pct(tot) : "–") : num(tot)) + "</td></tr>";
  }
  function desenharDre(d) {
    const mostrar = document.getElementById("mostrarZeradas").checked;
    const contasDoTipo = function (t) {
      return contas.filter(function (c) { return c.tipo === t && (mostrar || soma(d.porConta[c.id] || zeros()) !== 0); });
    };
    const div = function (a, b) { return a.map(function (v, i) { return b[i] ? v / b[i] : NaN; }); };
    let h = "<thead><tr><th>Conta</th>" + MESES.map(function (m, i) { return '<th class="n' + (i === mes ? " mes-atual" : "") + '">' + m + "</th>"; }).join("") + '<th class="n">Total ' + ano + "</th></tr></thead><tbody>";
    h += linha(pessoal ? "Renda" : "Receita bruta", d.tot.receita, "tot");
    contasDoTipo("receita").forEach(function (c) { h += linha(c.nome, d.porConta[c.id] || zeros(), "sub"); });
    if (!pessoal) {
      h += linha("(−) Custo das mercadorias (CMV)", d.tot.cmv, "tot");
      contasDoTipo("cmv").forEach(function (c) { h += linha(c.nome, d.porConta[c.id] || zeros(), "sub"); });
      h += linha("= Lucro bruto", d.lucroBruto, "tot");
      h += linha("Margem bruta", div(d.lucroBruto, d.tot.receita), "pct", true, soma(d.tot.receita) ? soma(d.lucroBruto) / soma(d.tot.receita) : NaN);
    }
    const grupos = [];
    contas.filter(function (c) { return c.tipo === "despesa"; }).forEach(function (c) { if (grupos.indexOf(c.grupo) === -1) grupos.push(c.grupo); });
    grupos.forEach(function (g) {
      const doGrupo = contasDoTipo("despesa").filter(function (c) { return c.grupo === g; });
      if (!doGrupo.length && !mostrar) return;
      h += linha(g, d.porGrupo[g] || zeros(), "grp");
      doGrupo.forEach(function (c) { h += linha(c.nome, d.porConta[c.id] || zeros(), "sub"); });
    });
    h += linha("Total de " + T.despesas.toLowerCase(), d.tot.despesa, "tot");
    h += linha("= " + T.resultado, d.resultado, "res");
    h += linha(T.margemLiq, div(d.resultado, d.tot.receita), "pct", true, soma(d.tot.receita) ? soma(d.resultado) / soma(d.tot.receita) : NaN);
    document.getElementById("tabDre").innerHTML = h + "</tbody>";
  }
  document.getElementById("mostrarZeradas").addEventListener("change", function () { desenharDre(calcular()); });

  /* ================= PAINEL ================= */
  function variacao(atual, anterior, inverter) {
    if (!anterior) return '<span class="vazio" style="padding:0">sem mês anterior para comparar</span>';
    const v = (atual - anterior) / Math.abs(anterior);
    const bom = inverter ? v <= 0 : v >= 0;
    return '<span class="' + (bom ? "sobe" : "desce") + '">' + (v >= 0 ? "▲ " : "▼ ") + pct(Math.abs(v)) + "</span> vs " + MESES[mes - 1];
  }
  function desenharKpis(d) {
    const ant = mes > 0 ? mes - 1 : null;
    const g = function (arr) { return ant === null ? 0 : arr[ant]; };
    const rec = d.tot.receita[mes], res = d.resultado[mes];
    const saidas = d.tot.cmv[mes] + d.tot.despesa[mes];
    const cards = [
      [T.receita + " do mês", brl(rec), variacao(rec, g(d.tot.receita))],
      pessoal
        ? [T.saidas + " do mês", brl(saidas), variacao(saidas, g(d.tot.despesa), true)]
        : ["Lucro bruto", brl(d.lucroBruto[mes]), rec ? "margem de " + pct(d.lucroBruto[mes] / rec) : "sem receita no mês"],
      [T.despesas + " do mês", brl(d.tot.despesa[mes]), rec ? pct(d.tot.despesa[mes] / rec) + " da " + T.receita.toLowerCase() : variacao(d.tot.despesa[mes], g(d.tot.despesa), true)],
      [T.resultado, '<span class="' + (res < 0 ? "desce" : "sobe") + '">' + brl(res) + "</span>", rec ? T.margemLiq.toLowerCase() + ": " + pct(res / rec) : ""]
    ];
    document.getElementById("kpis").innerHTML = cards.map(function (c) {
      return '<div class="kpi"><small>' + c[0] + "</small><b>" + c[1] + "</b><span>" + c[2] + "</span></div>";
    }).join("");
  }

  function desenharLeituras(d) {
    const L = [];
    const nomeMes = MESES_LONGOS[mes];
    const rec = d.tot.receita[mes], cmv = d.tot.cmv[mes], desp = d.tot.despesa[mes], res = d.resultado[mes], lb = d.lucroBruto[mes];
    const temLanc = lanc.some(function (l) { return +l.data.slice(5, 7) - 1 === mes; });
    document.getElementById("tituloLeituras").textContent = "Leituras de " + nomeMes + " de " + ano;
    if (!temLanc) {
      L.push(["alerta", "Ainda não há lançamentos em " + nomeMes + ". Lance as entradas e saídas para o painel e as leituras ganharem vida."]);
    } else {
      if (res < 0) L.push(["alerta", (pessoal ? "Os gastos passaram a renda em " : "O mês fechou no vermelho: as saídas passaram as entradas em ") + brl(-res) + "."]);
      else if (rec > 0) L.push(["bom", (pessoal ? "Sobraram " + brl(res) + ", " + pct(res / rec) + " da renda." : "O mês fechou positivo: resultado de " + brl(res) + ", margem líquida de " + pct(res / rec) + ".")]);

      if (mes > 0 && d.tot.receita[mes - 1] > 0 && rec > 0) {
        const v = (rec - d.tot.receita[mes - 1]) / d.tot.receita[mes - 1];
        L.push([v >= 0 ? "bom" : "alerta", "A " + T.receita.toLowerCase() + " " + (v >= 0 ? "subiu " : "caiu ") + pct(Math.abs(v)) + " em relação a " + MESES_LONGOS[mes - 1] + "."]);
      }
      if (!pessoal && rec > 0) {
        if (cmv === 0) L.push(["", "Não há custo de mercadoria lançado neste mês. Se a empresa revende produtos, lance as compras como \"Custo\" para a margem bruta ficar correta."]);
        else {
          let t = "A margem bruta foi de " + pct(lb / rec);
          if (mes > 0 && d.tot.receita[mes - 1] > 0) t += " (em " + MESES_LONGOS[mes - 1] + ", " + pct(d.lucroBruto[mes - 1] / d.tot.receita[mes - 1]) + ")";
          L.push(["", t + "."]);
        }
      }
      let maiorG = null, maiorV = 0;
      Object.keys(d.porGrupo).forEach(function (g) { if (d.porGrupo[g][mes] > maiorV) { maiorV = d.porGrupo[g][mes]; maiorG = g; } });
      if (maiorG) L.push(["", maiorG + " foi o maior peso nas " + T.despesas.toLowerCase() + ": " + brl(maiorV) + (rec ? " (" + pct(maiorV / rec) + " da " + T.receita.toLowerCase() + ")." : ".")]);

      if (!pessoal && rec > 0 && lb > 0 && desp > 0) {
        const mc = lb / rec, pe = desp / mc;
        L.push([rec >= pe ? "bom" : "alerta", "Com a margem atual, a empresa precisa vender cerca de " + brl(pe) + " por mês para cobrir as despesas. " +
          (rec >= pe ? "Neste mês passou desse ponto em " + brl(rec - pe) + "." : "Neste mês faltaram " + brl(pe - rec) + ".")]);
      }
      if (!pessoal && rec > 0) {
        const canais = Object.keys(d.porCanal).filter(function (k) { return d.porCanal[k][mes] > 0; });
        const informados = canais.filter(function (k) { return k !== "Sem canal informado"; });
        if (informados.length) {
          canais.sort(function (a, b) { return d.porCanal[b][mes] - d.porCanal[a][mes]; });
          L.push(["", canais[0] + " trouxe " + pct(d.porCanal[canais[0]][mes] / rec) + " das entradas do mês."]);
          const prods = Object.keys(d.porProduto).filter(function (k) { return k !== "Sem produto informado" && d.porProduto[k][mes] > 0; })
            .sort(function (a, b) { return d.porProduto[b][mes] - d.porProduto[a][mes]; });
          if (prods.length) L.push(["", "Produto que mais vendeu: " + prods[0] + " (" + brl(d.porProduto[prods[0]][mes]) + ")."]);
        } else if (!produtos.length) {
          L.push(["", "Cadastre seus produtos e canais (loja física, digital, serviço) na aba \"Produtos e contas\" para descobrir o que mais vende."]);
        }
      }
    }
    if (ano === hoje.getFullYear() && mes === hoje.getMonth() && ultimoLanc) {
      const dias = Math.floor((new Date(hojeISO()) - new Date(ultimoLanc)) / 86400000);
      if (dias > 3) L.push(["alerta", "O último lançamento foi há " + dias + " dias. Lançar todo dia mantém os números confiáveis."]);
    }
    document.getElementById("insights").innerHTML = L.map(function (x) { return '<li class="' + x[0] + '">' + esc(x[1]) + "</li>"; }).join("");
  }

  const CORES = ["#0B1F3A", "#C9A24A", "#1FA855", "#C9742F", "#5B3E8F", "#0F8C86", "#B24C6A", "#455A8C", "#8A6A22", "#6B8E23"];
  function grafico(id, cfg) {
    if (graficos[id]) graficos[id].destroy();
    const el = document.getElementById(id);
    if (!el) return;
    graficos[id] = new Chart(el, cfg);
  }
  const moedaTick = function (v) { return "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }); };
  const moedaTip = { callbacks: { label: function (c) { return (c.dataset.label ? c.dataset.label + ": " : "") + brl(c.parsed.y !== undefined ? c.parsed.y : c.parsed); } } };
  function desenharGraficos(d) {
    if (typeof Chart === "undefined") {
      document.getElementById("graficos").innerHTML = '<p class="vazio">Os gráficos não carregaram. Verifique a internet e atualize a página.</p>';
      return;
    }
    Chart.defaults.font.family = "Figtree, system-ui, sans-serif";
    Chart.defaults.color = "#4C5670";
    const saidas = d.tot.cmv.map(function (v, i) { return v + d.tot.despesa[i]; });
    grafico("g1", { type: "bar", data: { labels: MESES, datasets: [
      { label: T.entradas, data: d.tot.receita, backgroundColor: "#1FA855", borderRadius: 4 },
      { label: T.saidas, data: saidas, backgroundColor: "#C9742F", borderRadius: 4 }] },
      options: { maintainAspectRatio: false, plugins: { tooltip: moedaTip }, scales: { y: { ticks: { callback: moedaTick } } } } });
    grafico("g2", { type: "line", data: { labels: MESES, datasets: [{ label: T.resultado, data: d.resultado, borderColor: "#0B1F3A", backgroundColor: "rgba(201,162,74,.18)", fill: true, tension: .3,
      pointBackgroundColor: d.resultado.map(function (v) { return v < 0 ? "#B3261E" : "#C9A24A"; }), pointRadius: 4 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: moedaTip }, scales: { y: { ticks: { callback: moedaTick } } } } });
    const grupos = Object.keys(d.porGrupo).map(function (g) { return [g, soma(d.porGrupo[g])]; }).filter(function (x) { return x[1] > 0; })
      .sort(function (a, b) { return b[1] - a[1]; });
    if (!pessoal && soma(d.tot.cmv) > 0) grupos.unshift(["Custo das mercadorias", soma(d.tot.cmv)]);
    grafico("g3", { type: "doughnut", data: { labels: grupos.map(function (x) { return x[0]; }), datasets: [{ data: grupos.map(function (x) { return x[1]; }), backgroundColor: CORES }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: "right" }, tooltip: { callbacks: { label: function (c) { return c.label + ": " + brl(c.parsed); } } } } } });
    if (!pessoal) {
      const canais = Object.keys(d.porCanal).map(function (k) { return [k, soma(d.porCanal[k])]; }).sort(function (a, b) { return b[1] - a[1]; });
      grafico("g4", { type: "bar", data: { labels: canais.map(function (x) { return x[0]; }), datasets: [{ label: T.entradas, data: canais.map(function (x) { return x[1]; }), backgroundColor: "#C9A24A", borderRadius: 4 }] },
        options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return brl(c.parsed.x); } } } }, scales: { x: { ticks: { callback: moedaTick } } } } });
    }
  }

  /* ================= PRODUTOS E CONTAS ================= */
  function desenharCadastros() {
    const lp = document.getElementById("listaProdutos");
    if (lp) {
      lp.innerHTML = produtos.length ? produtos.map(function (p) {
        return "<tr><td>" + esc(p.nome) + "</td><td>" + ROTULO_CANAL[p.canal] + "</td><td>" + (p.ativo ? '<span class="selo ok">Ativo</span>' : '<span class="selo off">Inativo</span>') + "</td>" +
          '<td><button class="btn peq contorno" type="button" data-prod="' + p.id + '">' + (p.ativo ? "Desativar" : "Ativar") + "</button></td></tr>";
      }).join("") : '<tr><td colspan="4" class="vazio">Nenhum produto cadastrado ainda.</td></tr>';
    }
    const lc = document.getElementById("listaContas");
    if (lc) {
      const rot = { receita: pessoal ? "Renda" : "Receita", cmv: "CMV", despesa: T.despesa };
      lc.innerHTML = contas.map(function (c) {
        return "<tr><td>" + rot[c.tipo] + "</td><td>" + esc(c.grupo) + "</td><td>" + esc(c.nome) + "</td><td>" + (c.ativo ? '<span class="selo ok">Ativa</span>' : '<span class="selo off">Desativada</span>') + "</td>" +
          '<td><button class="btn peq contorno" type="button" data-conta="' + c.id + '">' + (c.ativo ? "Desativar" : "Ativar") + "</button></td></tr>";
      }).join("");
      const tipoC = document.getElementById("cTipo").value;
      const gs = [];
      contas.filter(function (c) { return c.tipo === tipoC; }).forEach(function (c) { if (gs.indexOf(c.grupo) === -1) gs.push(c.grupo); });
      document.getElementById("gruposLista").innerHTML = gs.map(function (g) { return '<option value="' + esc(g) + '">'; }).join("");
    }
  }
  const formProduto = document.getElementById("formProduto");
  if (formProduto) {
    formProduto.addEventListener("submit", async function (e) {
      e.preventDefault();
      const nome = document.getElementById("pNome").value.trim();
      if (nome.length < 2) { aviso("Escreva o nome do produto ou linha.", true); return; }
      const { error } = await supa().from("produtos").insert({ empresa_id: eid, nome: nome, canal: document.getElementById("pCanal").value });
      if (error) { aviso("Não foi possível adicionar o produto.", true); return; }
      formProduto.reset();
      await carregarCadastros(); preencherContas(); desenharCadastros();
      aviso("Produto adicionado.");
    });
    document.getElementById("listaProdutos").addEventListener("click", async function (e) {
      const b = e.target.closest("[data-prod]");
      if (!b) return;
      const p = produtoMap[b.dataset.prod];
      const { error } = await supa().from("produtos").update({ ativo: !p.ativo }).eq("id", p.id);
      if (error) { aviso("Não foi possível alterar.", true); return; }
      await carregarCadastros(); preencherContas(); desenharCadastros();
    });
  }
  const formConta = document.getElementById("formConta");
  if (formConta) {
    document.getElementById("cTipo").addEventListener("change", desenharCadastros);
    formConta.addEventListener("submit", async function (e) {
      e.preventDefault();
      const tipo = document.getElementById("cTipo").value;
      const grupo = document.getElementById("cGrupo").value.trim();
      const nome = document.getElementById("cNome").value.trim();
      if (grupo.length < 2 || nome.length < 2) { aviso("Preencha o grupo e o nome da conta.", true); return; }
      const mesmoGrupo = contas.filter(function (c) { return c.tipo === tipo && c.grupo === grupo; });
      const base = mesmoGrupo.length ? mesmoGrupo : contas;
      const ordem = (base.length ? Math.max.apply(null, base.map(function (c) { return c.ordem; })) : 0) + 1;
      const { error } = await supa().from("contas").insert({ empresa_id: eid, tipo: tipo, grupo: grupo, nome: nome, ordem: mesmoGrupo.length ? ordem : ordem + 9 });
      if (error) { aviso("Não foi possível adicionar a conta.", true); return; }
      document.getElementById("cNome").value = "";
      await carregarCadastros(); preencherContas(); desenharCadastros(); desenharDre(calcular());
      aviso("Conta adicionada.");
    });
    document.getElementById("listaContas").addEventListener("click", async function (e) {
      const b = e.target.closest("[data-conta]");
      if (!b) return;
      const c = contaMap[b.dataset.conta];
      const { error } = await supa().from("contas").update({ ativo: !c.ativo }).eq("id", c.id);
      if (error) { aviso("Não foi possível alterar.", true); return; }
      await carregarCadastros(); preencherContas(); desenharCadastros();
    });
  }

  /* ================= desenhar tudo ================= */
  function desenharTudo() {
    const d = calcular();
    desenharLancamentos();
    desenharDre(d);
    desenharKpis(d);
    desenharLeituras(d);
    if (abaAtual === "painel") desenharGraficos(calcular());
  }

  /* ================= LIVES ================= */
  var lives = [], editLiveId = null, grafLives = null;

  async function carregarLives() {
    var r = await supa().from("lives_loja").select("*").eq("empresa_id", eid).order("data");
    lives = r.data || [];
  }

  function calcLive(l) {
    var custos = [+l.custo_trafego||0,+l.custo_energia||0,+l.custo_sacolas||0,+l.custo_alimentacao||0,+l.valor_compras||0,+l.custo_blogueira||0,+l.custo_hora_extra||0];
    var totalCusto = custos.reduce(function(a,b){return a+b;},0);
    var liq = +l.total_liquido||0;
    var roi = totalCusto > 0 ? liq / totalCusto : null;
    return { liq: liq, roi: roi, totalCusto: totalCusto };
  }

  function desenharLives() {
    var totalBruto=0, totalLiq=0, totalCusto=0;
    lives.forEach(function(l){ var c=calcLive(l); totalBruto+=+l.valor_bruto; totalLiq+=c.liq; totalCusto+=c.totalCusto; });
    var nLives = lives.length;
    document.getElementById("kpisLives").innerHTML = [
      ["Lives realizadas", nLives, "total importado"],
      ["Receita bruta total", brl(totalBruto), "soma das lives"],
      ["Líquido total", brl(totalLiq), "após todos os custos"],
      ["ROI médio", totalCusto>0?pct(totalLiq/totalCusto):"—", "líquido ÷ custos op."]
    ].map(function(k){return '<div class="kpi"><small>'+k[0]+'</small><b>'+k[1]+'</b><span>'+k[2]+'</span></div>';}).join("");

    if (typeof Chart !== "undefined") {
      if (grafLives) grafLives.destroy();
      var labels = lives.map(function(l){return dataBR(l.data);});
      grafLives = new Chart(document.getElementById("gLives"), {type:"bar",
        data:{labels:labels,datasets:[
          {label:"Bruto",data:lives.map(function(l){return +l.valor_bruto;}),backgroundColor:"#C9A24A",borderRadius:3},
          {label:"Líquido",data:lives.map(function(l){return +l.total_liquido||0;}),backgroundColor:"#1FA855",borderRadius:3}
        ]},
        options:{maintainAspectRatio:false,scales:{y:{beginAtZero:true,ticks:{callback:function(v){return "R$ "+Number(v).toLocaleString("pt-BR",{maximumFractionDigits:0});}}}}}
      });
    }

    document.getElementById("listaLives").innerHTML = lives.length ? lives.map(function(l){
      var c=calcLive(l);
      return "<tr>"+
        "<td>"+dataBR(l.data)+"</td>"+
        "<td>"+(l.dia_semana||"—")+"</td>"+
        '<td class="n"><b>'+brl(l.valor_bruto)+'</b></td>'+
        '<td class="n">'+brl(l.custo_trafego)+'</td>'+
        '<td class="n">'+brl(l.custo_energia)+'</td>'+
        '<td class="n">'+brl(l.custo_sacolas)+'</td>'+
        '<td class="n">'+brl(l.custo_alimentacao)+'</td>'+
        '<td class="n">'+brl(l.valor_compras)+'</td>'+
        '<td class="n">'+brl(l.custo_blogueira)+'</td>'+
        '<td class="n">'+brl(l.custo_hora_extra)+'</td>'+
        '<td class="n"><b class="'+(c.liq>=0?"v-receita":"v-despesa")+'">'+brl(c.liq)+'</b></td>'+
        '<td class="n">'+(c.roi!==null?pct(c.roi):"—")+'</td>'+
        '<td><button class="btn peq contorno" type="button" data-edlive="'+l.id+'">Editar</button> '+
        '<button class="btn peq perigo" type="button" data-dellive="'+l.id+'">Apagar</button></td>'+
        "</tr>";
    }).join("") : '<tr><td colspan="13" class="vazio">Nenhuma live cadastrada.</td></tr>';

    document.getElementById("totaisLives").innerHTML = nLives ?
      "<tr style='font-weight:700;background:#F4EFE5'>"+
      "<td colspan='2'>TOTAL ("+nLives+" lives)</td>"+
      "<td class='n'>"+brl(totalBruto)+"</td>"+
      "<td class='n'>"+brl(lives.reduce(function(s,l){return s+(+l.custo_trafego||0);},0))+"</td>"+
      "<td class='n'>"+brl(lives.reduce(function(s,l){return s+(+l.custo_energia||0);},0))+"</td>"+
      "<td class='n'>"+brl(lives.reduce(function(s,l){return s+(+l.custo_sacolas||0);},0))+"</td>"+
      "<td class='n'>"+brl(lives.reduce(function(s,l){return s+(+l.custo_alimentacao||0);},0))+"</td>"+
      "<td class='n'>"+brl(lives.reduce(function(s,l){return s+(+l.valor_compras||0);},0))+"</td>"+
      "<td class='n'>"+brl(lives.reduce(function(s,l){return s+(+l.custo_blogueira||0);},0))+"</td>"+
      "<td class='n'>"+brl(lives.reduce(function(s,l){return s+(+l.custo_hora_extra||0);},0))+"</td>"+
      "<td class='n'><b>"+brl(totalLiq)+"</b></td>"+
      "<td class='n'>"+(totalCusto>0?pct(totalLiq/totalCusto):"—")+"</td><td></td></tr>" : "";
  }

  function atualizarResumoLive() {
    var bruto = lerValor(document.getElementById("lBruto").value)||0;
    var custos = ["lTraf","lEner","lSac","lAlim","lCompras","lBlog","lHora"].reduce(function(s,id){return s+(lerValor(document.getElementById(id).value)||0);},0);
    var liq = bruto - custos;
    var roi = custos > 0 ? liq/custos : null;
    var r = document.getElementById("resumoLive");
    r.hidden = !bruto;
    document.getElementById("liquidoEst").textContent = brl(liq);
    document.getElementById("roiEst").textContent = roi!==null ? pct(roi) : "—";
  }

  ["lBruto","lTraf","lEner","lSac","lAlim","lCompras","lBlog","lHora"].forEach(function(id){
    document.getElementById(id).addEventListener("input", atualizarResumoLive);
  });

  function limparFormLive() {
    editLiveId = null;
    document.getElementById("formLive").reset();
    document.getElementById("lData").value = hojeISO();
    document.getElementById("tituloLive").textContent = "Nova live";
    document.getElementById("lSalvar").textContent = "Salvar live";
    document.getElementById("lCancelar").hidden = true;
    document.getElementById("resumoLive").hidden = true;
  }

  document.getElementById("lCancelar").addEventListener("click", limparFormLive);

  document.getElementById("formLive").addEventListener("submit", async function(e) {
    e.preventDefault();
    var bruto = lerValor(document.getElementById("lBruto").value);
    if (!(bruto > 0)) { aviso("Informe o valor bruto da live.", true); return; }
    var reg = {
      empresa_id: eid,
      data: document.getElementById("lData").value,
      dia_semana: document.getElementById("lDia").value || null,
      valor_bruto: bruto,
      dias_trafego: parseInt(document.getElementById("lDiasTraf").value)||null,
      custo_trafego:    lerValor(document.getElementById("lTraf").value)||0,
      custo_energia:    lerValor(document.getElementById("lEner").value)||0,
      custo_sacolas:    lerValor(document.getElementById("lSac").value)||0,
      custo_alimentacao:lerValor(document.getElementById("lAlim").value)||0,
      valor_compras:    lerValor(document.getElementById("lCompras").value)||0,
      custo_blogueira:  lerValor(document.getElementById("lBlog").value)||0,
      custo_hora_extra: lerValor(document.getElementById("lHora").value)||0,
      observacao: document.getElementById("lObs").value.trim()||null,
      criado_por: (await supa().auth.getUser()).data.user.id
    };
    var b = document.getElementById("lSalvar"); b.disabled = true;
    var r = editLiveId
      ? await supa().from("lives_loja").update(reg).eq("id", editLiveId)
      : await supa().from("lives_loja").insert(reg);
    b.disabled = false;
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso(editLiveId ? "Live atualizada." : "Live salva!");
    limparFormLive();
    await carregarLives(); desenharLives();
  });

  document.getElementById("tabelaLives").addEventListener("click", async function(e) {
    var be = e.target.closest("[data-edlive]"), bd = e.target.closest("[data-dellive]");
    if (be) {
      var l = lives.find(function(x){return x.id===be.dataset.edlive;}); if (!l) return;
      editLiveId = l.id;
      document.getElementById("lData").value = l.data;
      document.getElementById("lDia").value = l.dia_semana||"";
      document.getElementById("lBruto").value = String(l.valor_bruto).replace(".",",");
      document.getElementById("lDiasTraf").value = l.dias_trafego||"";
      document.getElementById("lTraf").value = l.custo_trafego||"";
      document.getElementById("lEner").value = l.custo_energia||"";
      document.getElementById("lSac").value = l.custo_sacolas||"";
      document.getElementById("lAlim").value = l.custo_alimentacao||"";
      document.getElementById("lCompras").value = l.valor_compras||"";
      document.getElementById("lBlog").value = l.custo_blogueira||"";
      document.getElementById("lHora").value = l.custo_hora_extra||"";
      document.getElementById("lObs").value = l.observacao||"";
      document.getElementById("tituloLive").textContent = "Editando live de "+dataBR(l.data);
      document.getElementById("lSalvar").textContent = "Salvar alteração";
      document.getElementById("lCancelar").hidden = false;
      atualizarResumoLive();
      document.getElementById("formLive").scrollIntoView({behavior:"smooth",block:"start"});
    }
    if (bd) {
      var l = lives.find(function(x){return x.id===bd.dataset.dellive;});
      if (!l||!confirm("Apagar a live de "+dataBR(l.data)+"?")) return;
      var r = await supa().from("lives_loja").delete().eq("id",l.id);
      if (r.error) { aviso("Não foi possível apagar.",true); return; }
      aviso("Live apagada."); await carregarLives(); desenharLives();
    }
  });

  var fluxoIniciado = false;
  ligarAbas(document.getElementById("abas"), async function (nome) {
    abaAtual = nome;
    if (nome === "painel") desenharGraficos(calcular());
    if (nome === "lives") { await carregarLives(); desenharLives(); }
    if (nome === "fluxo" && !fluxoIniciado) {
      fluxoIniciado = true;
      await window.iniciarFluxo(pessoal ? null : eid, eu.id);
    }
  });

  await carregarCadastros();
  escolherTipo("receita");
  desenharCadastros();
  await carregarAno();
  desenharTudo();
})();
