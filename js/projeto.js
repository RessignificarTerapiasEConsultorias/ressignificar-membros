/* Workspace de um projeto de melhoria: Charter, Brainstorming, Ishikawa, 5 Porquês, Pareto, Plano de ação. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  const gestor = eu.papel !== "cliente";
  const pid = new URLSearchParams(location.search).get("id");
  if (!pid) { location.href = "projetos.html"; return; }

  const ETAPA_LABEL = { P: "Planejar", D: "Fazer", C: "Checar", A: "Agir" };
  const ETAPA_ORDEM = ["P", "D", "C", "A"];
  const CAT_ISHIKAWA = { metodo: "Método", maquina: "Máquina", mao_de_obra: "Mão de obra", material: "Material", medicao: "Medição", meio_ambiente: "Meio ambiente" };
  const STATUS_LABEL = { nao_iniciada: "Não iniciada", em_andamento: "Em andamento", concluida: "Concluída", atrasada: "Atrasada", cancelada: "Cancelada" };
  const STATUS_CLS = { nao_iniciada: "", em_andamento: "amarelo", concluida: "verde", atrasada: "vermelho", cancelada: "" };

  let projeto = null, charter = null, brainstorm = [], ishikawa = [], porques = [], pareto = [], acoes = [], perfisEquipe = [];
  let sipoc = null, swot = null, fmea = [], priorizacao = [], entregas = [], licoes = [], popsCliente = [];
  let contasEmpresa = [], lancamentosConta = [], cepPontos = [], hipoteses = [];
  let editandoAcaoId = null, grafPareto = null, grafPriorizacao = null, grafDre = null, grafCep = null, visaoAcoes = "tabela";

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  async function carregar() {
    const [rp, rc, rb, ri, r5, rpt, ra, rsi, rsw, rfm, rpr, ren, rli] = await Promise.all([
      supa().from("projetos_melhoria").select("*").eq("id", pid).maybeSingle(),
      supa().from("projetos_charter").select("*").eq("projeto_id", pid).maybeSingle(),
      supa().from("projetos_brainstorm").select("*").eq("projeto_id", pid).order("votos", { ascending: false }),
      supa().from("projetos_ishikawa").select("*").eq("projeto_id", pid),
      supa().from("projetos_5porques").select("*").eq("projeto_id", pid).order("ordem"),
      supa().from("projetos_pareto").select("*").eq("projeto_id", pid).order("ordem"),
      supa().from("projetos_acoes").select("*").eq("projeto_id", pid).order("criado_em"),
      supa().from("projetos_sipoc").select("*").eq("projeto_id", pid).maybeSingle(),
      supa().from("projetos_swot").select("*").eq("projeto_id", pid).maybeSingle(),
      supa().from("projetos_fmea").select("*").eq("projeto_id", pid).order("rpn", { ascending: false }),
      supa().from("projetos_priorizacao").select("*").eq("projeto_id", pid),
      supa().from("projetos_entregas").select("*").eq("projeto_id", pid).order("etapa_pdca").order("ordem"),
      supa().from("projetos_licoes").select("*").eq("projeto_id", pid).order("criado_em", { ascending: false })
    ]);
    if (!rp.data) { aviso("Projeto não encontrado ou sem acesso.", true); setTimeout(function () { location.href = "projetos.html"; }, 1500); return false; }
    projeto = rp.data; charter = rc.data; brainstorm = rb.data || []; ishikawa = ri.data || []; porques = r5.data || []; pareto = rpt.data || []; acoes = ra.data || [];
    sipoc = rsi.data; swot = rsw.data; fmea = rfm.data || []; priorizacao = rpr.data || []; entregas = ren.data || []; licoes = rli.data || [];
    if (gestor) {
      const rpe = await supa().from("perfis").select("id,nome").eq("ativo", true).order("nome");
      perfisEquipe = rpe.data || [];
    } else {
      perfisEquipe = [{ id: eu.id, nome: eu.nome }];
    }
    const rpops = await supa().from("pops_documentos").select("id,titulo,origem_projeto_id").eq("perfil_id", projeto.perfil_id).eq("ativo", true);
    popsCliente = rpops.data || [];

    if (projeto.empresa_id) {
      const rcontas = await supa().from("contas").select("id,tipo,grupo,nome").eq("empresa_id", projeto.empresa_id).eq("ativo", true).order("nome");
      contasEmpresa = rcontas.data || [];
    } else contasEmpresa = [];
    if (projeto.conta_vinculada_id) {
      const rlanc = await supa().from("lancamentos").select("data,valor").eq("conta_id", projeto.conta_vinculada_id).order("data");
      lancamentosConta = rlanc.data || [];
    } else lancamentosConta = [];
    const [rcep, rhip] = await Promise.all([
      supa().from("projetos_cep_pontos").select("*").eq("projeto_id", pid).order("ordem"),
      supa().from("projetos_hipotese").select("*").eq("projeto_id", pid).order("criado_em", { ascending: false })
    ]);
    cepPontos = rcep.data || []; hipoteses = rhip.data || [];
    return true;
  }

  function desenharCabecalho() {
    document.getElementById("tituloProjeto").textContent = projeto.titulo;
    document.getElementById("etapaSelo").textContent = ETAPA_LABEL[projeto.etapa_atual] + " · Ciclo " + projeto.ciclo_atual;
    document.getElementById("subIndicador").textContent = projeto.indicador_nome
      ? "Indicador: " + projeto.indicador_nome + (projeto.linha_base_valor !== null ? " · linha de base " + projeto.linha_base_valor : "") + (projeto.meta_valor !== null ? " · meta " + projeto.meta_valor : "")
      : "";
    const idxAtual = ETAPA_ORDEM.indexOf(projeto.etapa_atual);
    document.getElementById("trilhoPdca").innerHTML = ETAPA_ORDEM.map(function (e, i) {
      const cls = e === projeto.etapa_atual ? "atual" : (i < idxAtual ? "passada" : "");
      return '<div class="etapa ' + cls + '">' + e + " · " + ETAPA_LABEL[e] + "</div>";
    }).join("");
  }

  /* ===== CHARTER ===== */
  function preencherCharter() {
    if (!charter) return;
    document.getElementById("chProblema").value = charter.problema || "";
    document.getElementById("chMeta").value = charter.meta || "";
    document.getElementById("chDentro").value = charter.escopo_dentro || "";
    document.getElementById("chFora").value = charter.escopo_fora || "";
    document.getElementById("chEquipe").value = charter.equipe || "";
    document.getElementById("chPatrocinador").value = charter.patrocinador || "";
    document.getElementById("chPrazo").value = charter.prazo || "";
    document.getElementById("chGanho").value = charter.ganho_esperado || "";
  }
  document.getElementById("formCharter").addEventListener("submit", async function (e) {
    e.preventDefault();
    const reg = {
      problema: document.getElementById("chProblema").value.trim() || null, meta: document.getElementById("chMeta").value.trim() || null,
      escopo_dentro: document.getElementById("chDentro").value.trim() || null, escopo_fora: document.getElementById("chFora").value.trim() || null,
      equipe: document.getElementById("chEquipe").value.trim() || null, patrocinador: document.getElementById("chPatrocinador").value.trim() || null,
      prazo: document.getElementById("chPrazo").value || null, ganho_esperado: lerValor(document.getElementById("chGanho").value), atualizado_em: new Date().toISOString()
    };
    const r = await supa().from("projetos_charter").upsert(Object.assign({ projeto_id: pid }, reg), { onConflict: "projeto_id" });
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso("Charter salvo!");
  });

  /* ===== BRAINSTORM ===== */
  function desenharBrainstorm() {
    document.getElementById("listaBrainstorm").innerHTML = brainstorm.length ? brainstorm.map(function (b) {
      return "<tr><td>" + esc(b.ideia) + "</td><td>" + (b.agrupamento ? esc(b.agrupamento) : "—") + '</td><td class="n">' + b.votos + '</td>' +
        '<td><button class="btn peq contorno" type="button" data-votar="' + b.id + '">+1 voto</button> ' +
        '<button class="btn peq" type="button" data-enviar-acao="brainstorm" data-texto="' + esc(b.ideia) + '">Enviar p/ plano de ação</button> ' +
        '<button class="btn peq perigo" type="button" data-del-bs="' + b.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="4" class="vazio">Nenhuma ideia registrada.</td></tr>';
  }
  document.getElementById("formBrainstorm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const ideia = document.getElementById("bsIdeia").value.trim();
    if (!ideia) { aviso("Escreva a ideia.", true); return; }
    const r = await supa().from("projetos_brainstorm").insert({ projeto_id: pid, ideia: ideia, agrupamento: document.getElementById("bsGrupo").value.trim() || null, criado_por: eu.id });
    if (r.error) { aviso("Não foi possível adicionar.", true); return; }
    this.reset(); await recarregarESeção("brainstorm");
  });
  document.getElementById("listaBrainstorm").addEventListener("click", async function (e) {
    const bv = e.target.closest("[data-votar]"), bd = e.target.closest("[data-del-bs]"), ba = e.target.closest("[data-enviar-acao]");
    if (bv) { const item = brainstorm.find(function (x) { return x.id === bv.dataset.votar; }); await supa().from("projetos_brainstorm").update({ votos: item.votos + 1 }).eq("id", item.id); await recarregarESeção("brainstorm"); }
    if (bd) { if (!confirm("Apagar esta ideia?")) return; await supa().from("projetos_brainstorm").delete().eq("id", bd.dataset.delBs); await recarregarESeção("brainstorm"); }
    if (ba) abrirNovaAcaoComOrigem(ba.dataset.origem || "brainstorm", ba.dataset.texto);
  });

  /* ===== ISHIKAWA ===== */
  function desenharIshikawa() {
    document.getElementById("colunasIshikawa").innerHTML = Object.keys(CAT_ISHIKAWA).map(function (cat) {
      const itens = ishikawa.filter(function (i) { return i.categoria === cat; });
      return '<div class="coluna-ishikawa"><h4>' + CAT_ISHIKAWA[cat] + '</h4><ul>' +
        (itens.length ? itens.map(function (i) {
          return '<li class="' + (i.provavel_raiz ? "raiz" : "") + '"><span>' + esc(i.causa) + '</span><span>' +
            '<button class="btn peq contorno" type="button" data-raiz="' + i.id + '" title="Marcar como provável causa raiz">' + (i.provavel_raiz ? "★" : "☆") + '</button> ' +
            '<button class="btn peq" type="button" data-enviar-acao="ishikawa" data-texto="' + esc(i.causa) + '" title="Enviar para o plano de ação">→</button> ' +
            '<button class="btn peq perigo" type="button" data-del-ik="' + i.id + '">×</button></span></li>';
        }).join("") : '<li class="vazio" style="background:transparent;border:none">Nenhuma causa ainda.</li>') + "</ul></div>";
    }).join("");
  }
  document.getElementById("formIshikawa").addEventListener("submit", async function (e) {
    e.preventDefault();
    const causa = document.getElementById("ikCausa").value.trim();
    if (!causa) { aviso("Escreva a causa.", true); return; }
    const r = await supa().from("projetos_ishikawa").insert({ projeto_id: pid, categoria: document.getElementById("ikCategoria").value, causa: causa });
    if (r.error) { aviso("Não foi possível adicionar.", true); return; }
    document.getElementById("ikCausa").value = ""; await recarregarESeção("ishikawa");
  });
  document.getElementById("colunasIshikawa").addEventListener("click", async function (e) {
    const br = e.target.closest("[data-raiz]"), bd = e.target.closest("[data-del-ik]"), ba = e.target.closest("[data-enviar-acao]");
    if (br) { const item = ishikawa.find(function (x) { return x.id === br.dataset.raiz; }); await supa().from("projetos_ishikawa").update({ provavel_raiz: !item.provavel_raiz }).eq("id", item.id); await recarregarESeção("ishikawa"); }
    if (bd) { if (!confirm("Apagar esta causa?")) return; await supa().from("projetos_ishikawa").delete().eq("id", bd.dataset.delIk); await recarregarESeção("ishikawa"); }
    if (ba) abrirNovaAcaoComOrigem("ishikawa", ba.dataset.texto, true);
  });

  /* ===== 5 PORQUÊS ===== */
  function desenharPorques() {
    document.getElementById("listaPorques").innerHTML = porques.length ? porques.map(function (p, i) {
      return '<div class="porque-item"><b>Por quê ' + (i + 1) + '?</b>' +
        '<input data-porque-pergunta="' + p.id + '" value="' + esc(p.pergunta) + '" placeholder="Por que isso acontece?">' +
        '<input data-porque-resposta="' + p.id + '" value="' + esc(p.resposta || "") + '" placeholder="Resposta">' +
        '<label style="display:flex;align-items:center;gap:4px;font-size:12.5px;white-space:nowrap"><input type="checkbox" data-porque-raiz="' + p.id + '" ' + (p.causa_raiz ? "checked" : "") + '> Causa raiz</label>' +
        (p.causa_raiz ? '<button class="btn peq" type="button" data-enviar-acao="5porques" data-texto="' + esc(p.resposta || p.pergunta) + '">→ Plano</button>' : "") +
        '<button class="btn peq perigo" type="button" data-del-pq="' + p.id + '">×</button></div>';
    }).join("") : '<p class="vazio">Nenhum "porquê" registrado ainda.</p>';
  }
  document.getElementById("btAddPorque").addEventListener("click", async function () {
    const ordem = porques.length + 1;
    const r = await supa().from("projetos_5porques").insert({ projeto_id: pid, ordem: ordem, pergunta: "Por que " + (ordem === 1 ? "o problema acontece" : "isso acontece") + "?" });
    if (r.error) { aviso("Não foi possível adicionar.", true); return; }
    await recarregarESeção("porques");
  });
  let salvarPorqueTimeout = null;
  document.getElementById("listaPorques").addEventListener("input", function (e) {
    const ip = e.target.closest("[data-porque-pergunta]"), ir = e.target.closest("[data-porque-resposta]");
    const id = ip ? ip.dataset.porquePergunta : (ir ? ir.dataset.porqueResposta : null);
    if (!id) return;
    clearTimeout(salvarPorqueTimeout);
    salvarPorqueTimeout = setTimeout(async function () {
      const campo = ip ? { pergunta: ip.value } : { resposta: ir.value };
      await supa().from("projetos_5porques").update(campo).eq("id", id);
    }, 600);
  });
  document.getElementById("listaPorques").addEventListener("change", async function (e) {
    const cb = e.target.closest("[data-porque-raiz]"); if (!cb) return;
    await supa().from("projetos_5porques").update({ causa_raiz: cb.checked }).eq("id", cb.dataset.porqueRaiz);
    await recarregarESeção("porques");
  });
  document.getElementById("listaPorques").addEventListener("click", async function (e) {
    const bd = e.target.closest("[data-del-pq]"), ba = e.target.closest("[data-enviar-acao]");
    if (bd) { if (!confirm("Remover este passo?")) return; await supa().from("projetos_5porques").delete().eq("id", bd.dataset.delPq); await recarregarESeção("porques"); }
    if (ba) abrirNovaAcaoComOrigem("5porques", ba.dataset.texto, true);
  });

  /* ===== PARETO ===== */
  function desenharPareto() {
    const ordenado = pareto.slice().sort(function (a, b) { return b.valor - a.valor; });
    const total = ordenado.reduce(function (s, p) { return s + +p.valor; }, 0);
    let acumulado = 0;
    document.getElementById("listaPareto").innerHTML = ordenado.length ? ordenado.map(function (p) {
      acumulado += +p.valor;
      return "<tr><td>" + esc(p.categoria) + '</td><td class="n">' + p.valor + '</td><td class="n">' + (total ? pct(acumulado / total) : "—") + '</td>' +
        '<td><button class="btn peq perigo" type="button" data-del-pt="' + p.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="4" class="vazio">Nenhuma categoria cadastrada.</td></tr>';

    if (typeof Chart !== "undefined") {
      if (grafPareto) grafPareto.destroy();
      let ac = 0;
      const linhaAcum = ordenado.map(function (p) { ac += +p.valor; return total ? (ac / total * 100) : 0; });
      grafPareto = new Chart(document.getElementById("gPareto"), {
        data: { labels: ordenado.map(function (p) { return p.categoria; }), datasets: [
          { type: "bar", label: "Valor", data: ordenado.map(function (p) { return +p.valor; }), backgroundColor: "#C9A24A", order: 2 },
          { type: "line", label: "% acumulado", data: linhaAcum, borderColor: "#0B1F3A", yAxisID: "y1", order: 1 }
        ] },
        options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true }, y1: { position: "right", min: 0, max: 100, grid: { drawOnChartArea: false } } } }
      });
    }
  }
  document.getElementById("formPareto").addEventListener("submit", async function (e) {
    e.preventDefault();
    const cat = document.getElementById("ptCategoria").value.trim(), val = lerValor(document.getElementById("ptValor").value);
    if (!cat || !(val >= 0)) { aviso("Preencha categoria e valor.", true); return; }
    const r = await supa().from("projetos_pareto").insert({ projeto_id: pid, categoria: cat, valor: val, ordem: pareto.length });
    if (r.error) { aviso("Não foi possível adicionar.", true); return; }
    this.reset(); await recarregarESeção("pareto");
  });
  document.getElementById("listaPareto").addEventListener("click", async function (e) {
    const bd = e.target.closest("[data-del-pt]"); if (!bd) return;
    await supa().from("projetos_pareto").delete().eq("id", bd.dataset.delPt); await recarregarESeção("pareto");
  });

  /* ===== PLANO DE AÇÃO ===== */
  function preencherResponsaveis() {
    document.getElementById("apResponsavel").innerHTML = '<option value="">—</option>' + perfisEquipe.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join("");
  }
  function nomeResponsavel(id) { const p = perfisEquipe.find(function (x) { return x.id === id; }); return p ? p.nome : "—"; }
  function desenharAcoes() {
    document.getElementById("listaAcoesProjeto").innerHTML = acoes.length ? acoes.map(function (a) {
      const atraso = a.prazo && a.prazo < hojeISO() && a.status !== "concluida";
      return "<tr><td>" + a.etapa_pdca + "</td><td>" + (a.problema ? esc(a.problema) : "—") + "</td><td>" + (a.causa_raiz ? esc(a.causa_raiz) : "—") + "</td>" +
        "<td><b>" + esc(a.acao) + "</b></td><td>" + (a.como ? esc(a.como) : "—") + "</td><td>" + nomeResponsavel(a.responsavel_perfil_id) + "</td>" +
        '<td class="' + (atraso ? "v-despesa" : "") + '">' + (a.prazo ? dataBR(a.prazo) : "—") + '</td>' +
        '<td class="n">' + a.percentual_conclusao + '%</td>' +
        '<td><span class="selo ' + STATUS_CLS[a.status] + '">' + STATUS_LABEL[a.status] + '</span></td>' +
        '<td>' + (a.eficacia ? ({ eficaz: "Eficaz", parcial: "Parcial", nao_eficaz: "Não eficaz" }[a.eficacia]) : "—") + '</td>' +
        '<td><button class="btn peq contorno" type="button" data-ed-acao="' + a.id + '">Editar</button> <button class="btn peq perigo" type="button" data-del-acao="' + a.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="11" class="vazio">Nenhuma ação cadastrada.</td></tr>';
  }
  function limparFormAcao() {
    editandoAcaoId = null; document.getElementById("formAcaoProjeto").reset();
    document.getElementById("apEtapa").value = projeto.etapa_atual; document.getElementById("apStatus").value = "nao_iniciada"; document.getElementById("apPct").value = 0;
    document.getElementById("apSalvar").textContent = "Salvar ação";
  }
  function abrirNovaAcaoComOrigem(origem, texto, comoProblema) {
    limparFormAcao();
    document.getElementById("formAcaoProjetoWrap").hidden = false;
    if (comoProblema) document.getElementById("apCausa").value = texto || ""; else document.getElementById("apProblema").value = texto || "";
    document.querySelector('[data-aba="acoes"]').click();
    document.getElementById("formAcaoProjetoWrap").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.getElementById("btNovaAcaoProjeto").addEventListener("click", function () { limparFormAcao(); document.getElementById("formAcaoProjetoWrap").hidden = false; });
  document.getElementById("apCancelar").addEventListener("click", function () { document.getElementById("formAcaoProjetoWrap").hidden = true; });
  document.getElementById("formAcaoProjeto").addEventListener("submit", async function (e) {
    e.preventDefault();
    const acaoTxt = document.getElementById("apAcao").value.trim();
    if (!acaoTxt) { aviso("Escreva a ação.", true); return; }
    const reg = {
      projeto_id: pid, etapa_pdca: document.getElementById("apEtapa").value, problema: document.getElementById("apProblema").value.trim() || null,
      causa_raiz: document.getElementById("apCausa").value.trim() || null, acao: acaoTxt, por_que: document.getElementById("apPorque").value.trim() || null,
      onde: document.getElementById("apOnde").value.trim() || null, como: document.getElementById("apComo").value.trim() || null,
      responsavel_perfil_id: document.getElementById("apResponsavel").value || null, entrega_id: document.getElementById("apEntrega").value || null, equipe_execucao: document.getElementById("apEquipe").value.trim() || null,
      data_inicio: document.getElementById("apInicio").value || null, prazo: document.getElementById("apPrazo").value || null,
      custo_estimado: lerValor(document.getElementById("apCusto").value), prioridade: document.getElementById("apPrioridade").value || null,
      indicador_vinculado: document.getElementById("apIndicador").value.trim() || null, status: document.getElementById("apStatus").value,
      percentual_conclusao: parseInt(document.getElementById("apPct").value) || 0, resultado_esperado: document.getElementById("apResultado").value.trim() || null,
      evidencia: document.getElementById("apEvidencia").value.trim() || null, eficacia: document.getElementById("apEficacia").value || null,
      observacoes: document.getElementById("apObs").value.trim() || null, atualizado_em: new Date().toISOString()
    };
    const b = document.getElementById("apSalvar"); b.disabled = true;
    const r = editandoAcaoId ? await supa().from("projetos_acoes").update(reg).eq("id", editandoAcaoId) : await supa().from("projetos_acoes").insert(reg);
    b.disabled = false;
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso(editandoAcaoId ? "Ação atualizada." : "Ação registrada!");
    document.getElementById("formAcaoProjetoWrap").hidden = true;
    await recarregarESeção("acoes");
  });
  document.getElementById("listaAcoesProjeto").addEventListener("click", async function (e) {
    const be = e.target.closest("[data-ed-acao]"), bd = e.target.closest("[data-del-acao]");
    if (be) {
      const a = acoes.find(function (x) { return x.id === be.dataset.edAcao; }); if (!a) return;
      editandoAcaoId = a.id;
      document.getElementById("apEtapa").value = a.etapa_pdca; document.getElementById("apPrioridade").value = a.prioridade || "";
      document.getElementById("apProblema").value = a.problema || ""; document.getElementById("apCausa").value = a.causa_raiz || "";
      document.getElementById("apAcao").value = a.acao; document.getElementById("apPorque").value = a.por_que || "";
      document.getElementById("apOnde").value = a.onde || ""; document.getElementById("apComo").value = a.como || "";
      document.getElementById("apResponsavel").value = a.responsavel_perfil_id || ""; document.getElementById("apEntrega").value = a.entrega_id || ""; document.getElementById("apEquipe").value = a.equipe_execucao || "";
      document.getElementById("apInicio").value = a.data_inicio || ""; document.getElementById("apPrazo").value = a.prazo || "";
      document.getElementById("apCusto").value = a.custo_estimado || ""; document.getElementById("apIndicador").value = a.indicador_vinculado || "";
      document.getElementById("apStatus").value = a.status; document.getElementById("apPct").value = a.percentual_conclusao;
      document.getElementById("apResultado").value = a.resultado_esperado || ""; document.getElementById("apEvidencia").value = a.evidencia || "";
      document.getElementById("apEficacia").value = a.eficacia || ""; document.getElementById("apObs").value = a.observacoes || "";
      document.getElementById("apSalvar").textContent = "Salvar alteração";
      document.getElementById("formAcaoProjetoWrap").hidden = false;
      document.getElementById("formAcaoProjetoWrap").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (bd) { if (!confirm("Apagar esta ação?")) return; await supa().from("projetos_acoes").delete().eq("id", bd.dataset.delAcao); await recarregarESeção("acoes"); }
  });

  /* ===== SIPOC ===== */
  function preencherSipoc() {
    document.getElementById("spFornecedores").value = sipoc ? (sipoc.fornecedores || "") : "";
    document.getElementById("spEntradas").value = sipoc ? (sipoc.entradas || "") : "";
    document.getElementById("spProcesso").value = sipoc ? (sipoc.processo || "") : "";
    document.getElementById("spSaidas").value = sipoc ? (sipoc.saidas || "") : "";
    document.getElementById("spClientes").value = sipoc ? (sipoc.clientes || "") : "";
  }
  document.getElementById("formSipoc").addEventListener("submit", async function (e) {
    e.preventDefault();
    const reg = { projeto_id: pid, fornecedores: document.getElementById("spFornecedores").value.trim() || null, entradas: document.getElementById("spEntradas").value.trim() || null,
      processo: document.getElementById("spProcesso").value.trim() || null, saidas: document.getElementById("spSaidas").value.trim() || null, clientes: document.getElementById("spClientes").value.trim() || null, atualizado_em: new Date().toISOString() };
    const r = await supa().from("projetos_sipoc").upsert(reg, { onConflict: "projeto_id" });
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso("SIPOC salvo!");
  });

  /* ===== SWOT ===== */
  function preencherSwot() {
    document.getElementById("swForcas").value = swot ? (swot.forcas || "") : "";
    document.getElementById("swFraquezas").value = swot ? (swot.fraquezas || "") : "";
    document.getElementById("swOportunidades").value = swot ? (swot.oportunidades || "") : "";
    document.getElementById("swAmeacas").value = swot ? (swot.ameacas || "") : "";
  }
  document.getElementById("formSwot").addEventListener("submit", async function (e) {
    e.preventDefault();
    const reg = { projeto_id: pid, forcas: document.getElementById("swForcas").value.trim() || null, fraquezas: document.getElementById("swFraquezas").value.trim() || null,
      oportunidades: document.getElementById("swOportunidades").value.trim() || null, ameacas: document.getElementById("swAmeacas").value.trim() || null, atualizado_em: new Date().toISOString() };
    const r = await supa().from("projetos_swot").upsert(reg, { onConflict: "projeto_id" });
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso("SWOT salvo!");
  });

  /* ===== FMEA ===== */
  function desenharFmea() {
    document.getElementById("listaFmea").innerHTML = fmea.length ? fmea.map(function (f) {
      const corRpn = f.rpn >= 200 ? "v-despesa" : (f.rpn >= 80 ? "" : "v-receita");
      return "<tr><td><b>" + esc(f.modo_falha) + "</b></td><td>" + (f.efeito ? esc(f.efeito) : "—") + "</td><td>" + (f.causa ? esc(f.causa) : "—") + "</td>" +
        '<td class="n">' + f.severidade + '</td><td class="n">' + f.ocorrencia + '</td><td class="n">' + f.deteccao + '</td>' +
        '<td class="n"><b class="' + corRpn + '">' + f.rpn + "</b></td><td>" + (f.acao_recomendada ? esc(f.acao_recomendada) : "—") + "</td>" +
        '<td><button class="btn peq" type="button" data-enviar-acao="fmea" data-texto="' + esc(f.modo_falha) + '">→ Plano</button> <button class="btn peq perigo" type="button" data-del-fm="' + f.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="9" class="vazio">Nenhum modo de falha cadastrado.</td></tr>';
  }
  document.getElementById("formFmea").addEventListener("submit", async function (e) {
    e.preventDefault();
    const reg = { projeto_id: pid, modo_falha: document.getElementById("fmModo").value.trim(), efeito: document.getElementById("fmEfeito").value.trim() || null,
      causa: document.getElementById("fmCausa").value.trim() || null, severidade: parseInt(document.getElementById("fmSeveridade").value), ocorrencia: parseInt(document.getElementById("fmOcorrencia").value),
      deteccao: parseInt(document.getElementById("fmDeteccao").value), acao_recomendada: document.getElementById("fmAcao").value.trim() || null };
    if (!reg.modo_falha || !reg.severidade || !reg.ocorrencia || !reg.deteccao) { aviso("Preencha o modo de falha e as 3 notas.", true); return; }
    const r = await supa().from("projetos_fmea").insert(reg);
    if (r.error) { aviso("Não foi possível adicionar.", true); return; }
    this.reset(); await recarregarESeção("fmea");
  });
  document.getElementById("listaFmea").addEventListener("click", async function (e) {
    const bd = e.target.closest("[data-del-fm]"), ba = e.target.closest("[data-enviar-acao]");
    if (bd) { if (!confirm("Apagar este modo de falha?")) return; await supa().from("projetos_fmea").delete().eq("id", bd.dataset.delFm); await recarregarESeção("fmea"); }
    if (ba) abrirNovaAcaoComOrigem("fmea", ba.dataset.texto);
  });

  /* ===== PRIORIZAÇÃO ===== */
  function desenharPriorizacao() {
    const comGut = priorizacao.filter(function (p) { return p.pontuacao_gut !== null; }).sort(function (a, b) { return b.pontuacao_gut - a.pontuacao_gut; });
    const semGut = priorizacao.filter(function (p) { return p.pontuacao_gut === null; });
    const ordenado = comGut.concat(semGut);
    document.getElementById("listaPriorizacao").innerHTML = ordenado.length ? ordenado.map(function (p) {
      return "<tr><td>" + esc(p.item) + '</td><td class="n">' + (p.impacto || "—") + '</td><td class="n">' + (p.esforco || "—") + '</td><td class="n"><b>' + (p.pontuacao_gut !== null ? p.pontuacao_gut : "—") + "</b></td>" +
        '<td><button class="btn peq" type="button" data-enviar-acao="priorizacao" data-texto="' + esc(p.item) + '">→ Plano</button> <button class="btn peq perigo" type="button" data-del-pr="' + p.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="vazio">Nenhum item cadastrado.</td></tr>';

    if (typeof Chart !== "undefined") {
      if (grafPriorizacao) grafPriorizacao.destroy();
      const comEixos = priorizacao.filter(function (p) { return p.impacto !== null && p.esforco !== null; });
      grafPriorizacao = new Chart(document.getElementById("gPriorizacao"), {
        type: "scatter",
        data: { datasets: [{ label: "Impacto × Esforço", data: comEixos.map(function (p) { return { x: p.esforco, y: p.impacto, item: p.item }; }), backgroundColor: "#C9A24A" }] },
        options: { maintainAspectRatio: false, scales: { x: { title: { display: true, text: "Esforço →" }, min: 0, max: 6 }, y: { title: { display: true, text: "Impacto →" }, min: 0, max: 6 } },
          plugins: { tooltip: { callbacks: { label: function (c) { return c.raw.item + " (impacto " + c.raw.y + ", esforço " + c.raw.x + ")"; } } } } }
      });
    }
  }
  document.getElementById("formPriorizacao").addEventListener("submit", async function (e) {
    e.preventDefault();
    const item = document.getElementById("prItem").value.trim();
    if (!item) { aviso("Escreva o item.", true); return; }
    const v = function (id) { const x = document.getElementById(id).value; return x ? parseInt(x) : null; };
    const reg = { projeto_id: pid, item: item, impacto: v("prImpacto"), esforco: v("prEsforco"), gravidade: v("prGravidade"), urgencia: v("prUrgencia"), tendencia: v("prTendencia") };
    const r = await supa().from("projetos_priorizacao").insert(reg);
    if (r.error) { aviso("Não foi possível adicionar.", true); return; }
    this.reset(); await recarregarESeção("priorizacao");
  });
  document.getElementById("listaPriorizacao").addEventListener("click", async function (e) {
    const bd = e.target.closest("[data-del-pr]"), ba = e.target.closest("[data-enviar-acao]");
    if (bd) { if (!confirm("Apagar este item?")) return; await supa().from("projetos_priorizacao").delete().eq("id", bd.dataset.delPr); await recarregarESeção("priorizacao"); }
    if (ba) abrirNovaAcaoComOrigem("priorizacao", ba.dataset.texto);
  });

  /* ===== PLANO DE AÇÃO: visões Kanban / Gantt + entrega (EAP) ===== */
  function preencherEntregas() {
    const sel = document.getElementById("apEntrega"); if (!sel) return;
    sel.innerHTML = '<option value="">—</option>' + entregas.map(function (en) { return '<option value="' + en.id + '">' + esc(en.titulo) + " (" + en.etapa_pdca + ")</option>"; }).join("");
  }
  document.querySelectorAll('[data-visao]').forEach(function (b) {
    b.addEventListener("click", function () {
      visaoAcoes = this.dataset.visao;
      document.querySelectorAll('[data-visao]').forEach(function (x) { x.style.borderColor = x.dataset.visao === visaoAcoes ? "#C9A24A" : ""; x.style.background = x.dataset.visao === visaoAcoes ? "#FBF3DF" : ""; });
      document.getElementById("visaoTabela").hidden = visaoAcoes !== "tabela";
      document.getElementById("visaoKanban").hidden = visaoAcoes !== "kanban";
      document.getElementById("visaoGantt").hidden = visaoAcoes !== "gantt";
      if (visaoAcoes === "kanban") desenharKanban();
      if (visaoAcoes === "gantt") desenharGantt();
    });
  });
  function desenharKanban() {
    const colunas = ["nao_iniciada", "em_andamento", "concluida", "atrasada", "cancelada"];
    document.getElementById("visaoKanban").innerHTML = colunas.map(function (st) {
      const itens = acoes.filter(function (a) { return a.status === st; });
      return '<div class="kanban-col"><h4>' + STATUS_LABEL[st] + " (" + itens.length + ')</h4>' +
        itens.map(function (a) {
          return '<div class="kanban-card"><b>' + esc(a.acao) + '</b><br><span class="acao-info">' + nomeResponsavel(a.responsavel_perfil_id) + (a.prazo ? " · " + dataBR(a.prazo) : "") + '</span>' +
            '<div class="acoes">' + colunas.filter(function (x) { return x !== st; }).map(function (x) { return '<button class="btn peq contorno" type="button" data-mover-kanban="' + a.id + '" data-para="' + x + '">' + STATUS_LABEL[x] + "</button>"; }).join("") + "</div></div>";
        }).join("") + "</div>";
    }).join("");
  }
  document.getElementById("visaoKanban").addEventListener("click", async function (e) {
    const b = e.target.closest("[data-mover-kanban]"); if (!b) return;
    await supa().from("projetos_acoes").update({ status: b.dataset.para, atualizado_em: new Date().toISOString() }).eq("id", b.dataset.moverKanban);
    await recarregarESeção("acoes"); desenharKanban();
  });
  function desenharGantt() {
    const comData = acoes.filter(function (a) { return a.data_inicio && a.prazo; });
    if (!comData.length) { document.getElementById("visaoGantt").innerHTML = '<p class="vazio">Nenhuma ação com data de início e prazo definidos.</p>'; return; }
    const datas = comData.reduce(function (acc, a) { return acc.concat([a.data_inicio, a.prazo]); }, []).sort();
    const min = new Date(datas[0] + "T12:00:00"), max = new Date(datas[datas.length - 1] + "T12:00:00");
    const totalDias = Math.max(1, Math.round((max - min) / 86400000));
    document.getElementById("visaoGantt").innerHTML = comData.map(function (a) {
      const ini = Math.round((new Date(a.data_inicio + "T12:00:00") - min) / 86400000);
      const dur = Math.max(1, Math.round((new Date(a.prazo + "T12:00:00") - new Date(a.data_inicio + "T12:00:00")) / 86400000));
      const esq = (ini / totalDias * 100), larg = (dur / totalDias * 100);
      const cls = a.status === "concluida" ? "concluida" : ((a.prazo < hojeISO() && a.status !== "concluida") ? "atrasada" : "");
      return '<div class="gantt-linha"><span class="gantt-nome">' + esc(a.acao) + '</span><div class="gantt-trilho"><div class="gantt-barra ' + cls + '" style="left:' + esq + '%;width:' + larg + '%" title="' + dataBR(a.data_inicio) + " a " + dataBR(a.prazo) + '"></div></div></div>';
    }).join("");
  }

  /* ===== EAP / WBS ===== */
  document.getElementById("formEntrega").addEventListener("submit", async function (e) {
    e.preventDefault();
    const titulo = document.getElementById("enTitulo").value.trim();
    if (!titulo) { aviso("Escreva o nome da entrega.", true); return; }
    const etapa = document.getElementById("enEtapa").value;
    const ordem = entregas.filter(function (x) { return x.etapa_pdca === etapa; }).length;
    const r = await supa().from("projetos_entregas").insert({ projeto_id: pid, etapa_pdca: etapa, titulo: titulo, ordem: ordem });
    if (r.error) { aviso("Não foi possível adicionar.", true); return; }
    this.reset(); await recarregarESeção("eap");
  });
  function pctEntrega(en) {
    const das = acoes.filter(function (a) { return a.entrega_id === en.id; });
    if (!das.length) return null;
    return Math.round(das.reduce(function (s, a) { return s + a.percentual_conclusao; }, 0) / das.length);
  }
  function pctEtapa(etapa) {
    const ens = entregas.filter(function (x) { return x.etapa_pdca === etapa; });
    const pcts = ens.map(pctEntrega).filter(function (p) { return p !== null; });
    return pcts.length ? Math.round(pcts.reduce(function (s, p) { return s + p; }, 0) / pcts.length) : null;
  }
  function barraMini(p) { return '<div class="eap-barra-mini"><span style="width:' + (p || 0) + '%"></span></div><span class="acao-info">' + (p !== null ? p + "%" : "—") + "</span>"; }
  function desenharEap() {
    preencherEntregas();
    document.getElementById("arvoreEap").innerHTML = ETAPA_ORDEM.map(function (etapa) {
      const ens = entregas.filter(function (x) { return x.etapa_pdca === etapa; });
      const pEtapa = pctEtapa(etapa);
      return '<div class="eap-no"><div class="eap-linha"><b>' + etapa + " · " + ETAPA_LABEL[etapa] + "</b>" + barraMini(pEtapa) + '</div>' +
        '<div class="eap-filhos">' + (ens.length ? ens.map(function (en) {
          const pEn = pctEntrega(en);
          const das = acoes.filter(function (a) { return a.entrega_id === en.id; });
          return '<div class="eap-no"><div class="eap-linha"><b>' + esc(en.titulo) + '</b>' + barraMini(pEn) +
            '<button class="btn peq perigo" type="button" data-del-entrega="' + en.id + '">Apagar</button></div>' +
            '<div class="eap-filhos">' + (das.length ? das.map(function (a) {
              return '<div class="eap-linha"><span>' + esc(a.acao) + '</span><span class="selo ' + STATUS_CLS[a.status] + '">' + STATUS_LABEL[a.status] + '</span>' + barraMini(a.percentual_conclusao) + '</div>';
            }).join("") : '<p class="vazio" style="margin:4px 0">Nenhuma ação ligada a esta entrega.</p>') + "</div></div>";
        }).join("") : '<p class="vazio" style="margin:4px 0">Nenhuma entrega cadastrada nesta etapa.</p>') + "</div></div>";
    }).join("");
  }
  document.getElementById("arvoreEap").addEventListener("click", async function (e) {
    const bd = e.target.closest("[data-del-entrega]"); if (!bd) return;
    if (!confirm("Apagar esta entrega? As ações ligadas a ela continuam, mas desvinculadas.")) return;
    await supa().from("projetos_entregas").delete().eq("id", bd.dataset.delEntrega); await recarregarESeção("eap");
  });

  /* ===== LIÇÕES APRENDIDAS ===== */
  function desenharLicoes() {
    const CAT = { funcionou: "✓ Funcionou", nao_funcionou: "✗ Não funcionou", replicar: "↻ Vale replicar" };
    document.getElementById("listaLicoes").innerHTML = licoes.length ? licoes.map(function (l) {
      return '<div class="sessao"><div class="sessao-topo"><span class="selo">' + CAT[l.categoria] + '</span><span class="acao-info">' + dataBR(l.criado_em.slice(0, 10)) + '</span></div><p>' + esc(l.texto) + '</p>' +
        '<button class="btn peq perigo" type="button" data-del-licao="' + l.id + '">Apagar</button></div>';
    }).join("") : '<p class="vazio">Nenhuma lição registrada ainda.</p>';
  }
  document.getElementById("formLicao").addEventListener("submit", async function (e) {
    e.preventDefault();
    const texto = document.getElementById("liTexto").value.trim();
    if (!texto) { aviso("Escreva a lição.", true); return; }
    const r = await supa().from("projetos_licoes").insert({ projeto_id: pid, categoria: document.getElementById("liCategoria").value, texto: texto, criado_por: eu.id });
    if (r.error) { aviso("Não foi possível registrar.", true); return; }
    this.reset(); await recarregarESeção("licoes");
  });
  document.getElementById("listaLicoes").addEventListener("click", async function (e) {
    const bd = e.target.closest("[data-del-licao]"); if (!bd) return;
    if (!confirm("Apagar esta lição?")) return;
    await supa().from("projetos_licoes").delete().eq("id", bd.dataset.delLicao); await recarregarESeção("licoes");
  });

  /* ===== PADRONIZAÇÃO ===== */
  function desenharPadronizacao() {
    const naoLigados = popsCliente.filter(function (p) { return p.origem_projeto_id !== pid; });
    const ligados = popsCliente.filter(function (p) { return p.origem_projeto_id === pid; });
    document.getElementById("pdPopExistente").innerHTML = naoLigados.length ? naoLigados.map(function (p) { return '<option value="' + p.id + '">' + esc(p.titulo) + "</option>"; }).join("") : '<option value="">Nenhum POP disponível</option>';
    document.getElementById("listaPopsLigados").innerHTML = ligados.length ? "<h3 style='font-size:15px;margin-bottom:8px'>POPs ligados a este projeto</h3>" + ligados.map(function (p) {
      return '<div class="sessao"><b>' + esc(p.titulo) + '</b> <button class="btn peq perigo" type="button" data-desligar-pop="' + p.id + '">Desligar</button></div>';
    }).join("") : '<p class="vazio">Nenhum POP ligado ainda.</p>';
  }
  document.getElementById("btLigarPop").addEventListener("click", async function () {
    const id = document.getElementById("pdPopExistente").value;
    if (!id) { aviso("Escolha um POP para ligar.", true); return; }
    await supa().from("pops_documentos").update({ origem_projeto_id: pid }).eq("id", id);
    aviso("POP ligado ao projeto!"); await recarregarESeção("padronizacao");
  });
  document.getElementById("listaPopsLigados").addEventListener("click", async function (e) {
    const bd = e.target.closest("[data-desligar-pop]"); if (!bd) return;
    await supa().from("pops_documentos").update({ origem_projeto_id: null }).eq("id", bd.dataset.desligarPop);
    await recarregarESeção("padronizacao");
  });

  /* ===== MATEMÁTICA DO TESTE DE HIPÓTESE (t de Student, algoritmo padrão) ===== */
  function gammln(xx) {
    var cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var x = xx, y = xx, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(x, a, b) {
    var MAXIT = 100, EPS = 3e-7, FPMIN = 1e-30;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; var del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betai(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(gammln(a + b) - gammln(a) - gammln(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
    return 1 - bt * betacf(1 - x, b, a) / b;
  }
  function media(arr) { return arr.reduce(function (s, v) { return s + v; }, 0) / arr.length; }
  function variancia(arr, m) { return arr.reduce(function (s, v) { return s + Math.pow(v - m, 2); }, 0) / (arr.length - 1); }
  function parseAmostra(txt) { return txt.split(/[,;\s]+/).map(function (s) { return parseFloat(s.replace(",", ".")); }).filter(function (n) { return !isNaN(n); }); }

  /* ===== DRE: ligar conta e comparar antes x depois ===== */
  function preencherContasDre() {
    const sel = document.getElementById("rsConta"); if (!sel) return;
    if (!projeto.empresa_id) { sel.innerHTML = '<option value="">Projeto não ligado a uma empresa</option>'; sel.disabled = true; return; }
    sel.disabled = false;
    sel.innerHTML = '<option value="">—</option>' + contasEmpresa.map(function (c) { return '<option value="' + c.id + '"' + (c.id === projeto.conta_vinculada_id ? " selected" : "") + '>' + esc(c.nome) + " (" + esc(c.grupo) + ")</option>"; }).join("");
  }
  document.getElementById("btLigarConta").addEventListener("click", async function () {
    const id = document.getElementById("rsConta").value;
    await supa().from("projetos_melhoria").update({ conta_vinculada_id: id || null, atualizado_em: new Date().toISOString() }).eq("id", pid);
    aviso(id ? "Conta ligada ao projeto!" : "Conta desligada."); await recarregarESeção("resultados");
  });
  function desenharComparativoDre() {
    const el = document.getElementById("comparativoDre");
    if (!projeto.conta_vinculada_id) { el.innerHTML = '<p class="vazio">Ligue uma conta acima para ver o comparativo.</p>'; return; }
    const porMes = {};
    lancamentosConta.forEach(function (l) { const m = l.data.slice(0, 7); porMes[m] = (porMes[m] || 0) + (+l.valor); });
    const meses = Object.keys(porMes).sort();
    if (!meses.length) { el.innerHTML = '<p class="vazio">Nenhum lançamento nesta conta ainda.</p>'; return; }
    const ultimoMes = porMes[meses[meses.length - 1]];
    const primeiroMes = porMes[meses[0]];
    const variacao = primeiroMes ? ((ultimoMes - primeiroMes) / Math.abs(primeiroMes)) * 100 : null;
    el.innerHTML = '<div class="graf" style="height:220px"><canvas id="gDre"></canvas></div>' +
      '<p class="acao-info" style="margin-top:8px">Linha de base do projeto: ' + (projeto.linha_base_valor !== null ? brl(projeto.linha_base_valor) : "—") +
      " · Meta: " + (projeto.meta_valor !== null ? projeto.meta_valor : "—") +
      " · Último mês (" + meses[meses.length - 1] + "): " + ultimoMes.toFixed(2) +
      (variacao !== null ? " · variação desde " + meses[0] + ": " + variacao.toFixed(1) + "%" : "") + "</p>";
    if (typeof Chart !== "undefined") {
      if (grafDre) grafDre.destroy();
      grafDre = new Chart(document.getElementById("gDre"), {
        type: "bar", data: { labels: meses, datasets: [{ label: "Valor no mês", data: meses.map(function (m) { return porMes[m]; }), backgroundColor: "#C9A24A" }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }
  }
  function desenharGanho() {
    const estimado = (charter && charter.ganho_esperado !== null && charter.ganho_esperado !== undefined) ? +charter.ganho_esperado : (projeto.ganho_estimado !== null ? +projeto.ganho_estimado : null);
    const realizado = projeto.ganho_realizado !== null && projeto.ganho_realizado !== undefined ? +projeto.ganho_realizado : null;
    document.getElementById("rsGanhoRealizado").value = realizado !== null ? realizado : "";
    document.getElementById("kpisGanho").innerHTML = [
      ["Ganho estimado", estimado !== null ? brl(estimado) : "—", "definido no Charter"],
      ["Ganho realizado", realizado !== null ? brl(realizado) : "—", "confirmado pelo consultor"],
      ["Diferença", (estimado !== null && realizado !== null) ? brl(realizado - estimado) : "—", "realizado menos estimado"]
    ].map(function (k) { return '<div class="kpi"><small>' + k[0] + '</small><b>' + k[1] + '</b><span>' + k[2] + '</span></div>'; }).join("");
  }
  document.getElementById("btSalvarGanho").addEventListener("click", async function () {
    const v = lerValor(document.getElementById("rsGanhoRealizado").value);
    await supa().from("projetos_melhoria").update({ ganho_realizado: v, atualizado_em: new Date().toISOString() }).eq("id", pid);
    aviso("Ganho realizado salvo!"); await recarregarESeção("resultados");
  });

  /* ===== CEP ===== */
  document.getElementById("formCep").addEventListener("submit", async function (e) {
    e.preventDefault();
    const valor = lerValor(document.getElementById("cepValor").value);
    if (!(valor || valor === 0)) { aviso("Escreva o valor.", true); return; }
    const ordem = cepPontos.length + 1;
    const r = await supa().from("projetos_cep_pontos").insert({ projeto_id: pid, ordem: ordem, data: document.getElementById("cepData").value || null, valor: valor });
    if (r.error) { aviso("Não foi possível adicionar.", true); return; }
    this.reset(); await recarregarESeção("resultados");
  });
  function desenharCep() {
    if (cepPontos.length < 2) { document.getElementById("resumoCep").textContent = "Lance ao menos 2 pontos para calcular os limites de controle."; return; }
    const valores = cepPontos.map(function (p) { return +p.valor; });
    const xbar = media(valores);
    const mrs = []; for (var i = 1; i < valores.length; i++) mrs.push(Math.abs(valores[i] - valores[i - 1]));
    const mrbar = media(mrs);
    const ucl = xbar + 2.66 * mrbar, lcl = xbar - 2.66 * mrbar;
    const foraControle = valores.filter(function (v) { return v > ucl || v < lcl; }).length;
    document.getElementById("resumoCep").textContent = "Média: " + xbar.toFixed(2) + " · LSC: " + ucl.toFixed(2) + " · LIC: " + lcl.toFixed(2) + " · " +
      (foraControle ? foraControle + " ponto(s) fora de controle — processo instável." : "Nenhum ponto fora dos limites — processo estável.");
    if (typeof Chart !== "undefined") {
      if (grafCep) grafCep.destroy();
      grafCep = new Chart(document.getElementById("gCep"), {
        type: "line",
        data: { labels: cepPontos.map(function (p) { return p.ordem; }), datasets: [
          { label: "Valor", data: valores, borderColor: "#0B1F3A", backgroundColor: valores.map(function (v) { return (v > ucl || v < lcl) ? "#C0392B" : "#0B1F3A"; }), pointRadius: 5 },
          { label: "Média", data: valores.map(function () { return xbar; }), borderColor: "#C9A24A", borderDash: [5, 4], pointRadius: 0 },
          { label: "LSC", data: valores.map(function () { return ucl; }), borderColor: "#C0392B", borderDash: [2, 3], pointRadius: 0 },
          { label: "LIC", data: valores.map(function () { return lcl; }), borderColor: "#C0392B", borderDash: [2, 3], pointRadius: 0 }
        ] },
        options: { maintainAspectRatio: false }
      });
    }
  }

  /* ===== TESTE DE HIPÓTESE ===== */
  document.getElementById("formHipotese").addEventListener("submit", async function (e) {
    e.preventDefault();
    const antesTxt = document.getElementById("hpAntes").value.trim(), depoisTxt = document.getElementById("hpDepois").value.trim();
    const antes = parseAmostra(antesTxt), depois = parseAmostra(depoisTxt);
    if (antes.length < 2 || depois.length < 2) { aviso("Informe ao menos 2 valores em cada amostra.", true); return; }
    const m1 = media(antes), m2 = media(depois), v1 = variancia(antes, m1), v2 = variancia(depois, m2);
    const n1 = antes.length, n2 = depois.length;
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    const t = se > 0 ? (m1 - m2) / se : 0;
    const df = se > 0 ? Math.pow(v1 / n1 + v2 / n2, 2) / ((Math.pow(v1 / n1, 2) / (n1 - 1)) + (Math.pow(v2 / n2, 2) / (n2 - 1))) : 1;
    const p = betai(df / (df + t * t), df / 2, 0.5);
    const significativo = p < 0.05;
    const r = await supa().from("projetos_hipotese").insert({
      projeto_id: pid, amostra_antes: antesTxt, amostra_depois: depoisTxt, media_antes: m1, media_depois: m2,
      estatistica_t: t, graus_liberdade: df, valor_p: p, significativo: significativo
    });
    if (r.error) { aviso("Não foi possível calcular.", true); return; }
    this.reset(); await recarregarESeção("resultados");
  });
  function desenharHipoteses() {
    document.getElementById("listaHipotese").innerHTML = hipoteses.length ? hipoteses.map(function (h) {
      return '<div class="sessao"><div class="sessao-topo"><b>Média antes: ' + (+h.media_antes).toFixed(2) + " → Média depois: " + (+h.media_depois).toFixed(2) + '</b>' +
        '<span class="selo ' + (h.significativo ? "ok" : "off") + '">' + (h.significativo ? "Diferença significativa" : "Sem diferença estatística") + '</span></div>' +
        '<span class="acao-info">t = ' + (+h.estatistica_t).toFixed(3) + " · graus de liberdade ≈ " + (+h.graus_liberdade).toFixed(1) + " · p = " + (+h.valor_p).toFixed(4) + '</span>' +
        '<p class="acao-info" style="margin-top:4px">' + (h.significativo ? "A diferença observada muito provavelmente não é acaso (p < 0,05): o projeto parece ter funcionado." : "Não há evidência estatística suficiente de que a diferença não seja acaso. Colete mais dados ou revise as ações.") + '</p></div>';
    }).join("") : '<p class="vazio">Nenhum teste calculado ainda.</p>';
  }

  function desenharResultados() {
    preencherContasDre(); desenharComparativoDre(); desenharGanho(); desenharCep(); desenharHipoteses();
  }

  /* ===== RELATÓRIO A3 ===== */
  function montarA3() {
    const das = acoes;
    const concluidas = das.filter(function (a) { return a.status === "concluida"; }).length;
    const pctGeral = das.length ? Math.round(das.reduce(function (s, a) { return s + a.percentual_conclusao; }, 0) / das.length) : 0;
    document.getElementById("folhaA3").innerHTML =
      '<h2>' + esc(projeto.titulo) + '</h2>' +
      '<p class="acao-info">Etapa atual: ' + ETAPA_LABEL[projeto.etapa_atual] + " · Ciclo " + projeto.ciclo_atual + " · " + pctGeral + "% concluído</p>" +
      '<div class="a3-grid">' +
      '<div><div class="a3-bloco"><h4>1. Problema</h4><p>' + esc(charter && charter.problema || "—") + '</p></div>' +
      '<div class="a3-bloco"><h4>2. Meta</h4><p>' + esc(charter && charter.meta || "—") + '</p></div>' +
      '<div class="a3-bloco"><h4>3. Causa raiz</h4><p>' + esc((ishikawa.find(function (i) { return i.provavel_raiz; }) || {}).causa || (porques.find(function (p) { return p.causa_raiz; }) || {}).resposta || "—") + '</p></div>' +
      '<div class="a3-bloco"><h4>4. Escopo</h4><p><b>Dentro:</b> ' + esc(charter && charter.escopo_dentro || "—") + '<br><b>Fora:</b> ' + esc(charter && charter.escopo_fora || "—") + '</p></div></div>' +
      '<div><div class="a3-bloco"><h4>5. Ações principais</h4><ul>' + (das.length ? das.slice(0, 6).map(function (a) { return "<li>" + esc(a.acao) + " — " + STATUS_LABEL[a.status] + " (" + a.percentual_conclusao + "%)</li>"; }).join("") : "<li>—</li>") + '</ul></div>' +
      '<div class="a3-bloco"><h4>6. Resultado</h4><p>Ganho estimado: ' + (charter && charter.ganho_esperado ? brl(charter.ganho_esperado) : "—") + '<br>Ganho realizado: ' + (projeto.ganho_realizado ? brl(projeto.ganho_realizado) : "—") + '</p></div>' +
      '<div class="a3-bloco"><h4>7. Lições aprendidas</h4><ul>' + (licoes.length ? licoes.slice(0, 4).map(function (l) { return "<li>" + esc(l.texto) + "</li>"; }).join("") : "<li>—</li>") + '</ul></div>' +
      '<div class="a3-bloco"><h4>8. Equipe e patrocinador</h4><p>' + esc(charter && charter.equipe || "—") + (charter && charter.patrocinador ? " · Patrocinador: " + esc(charter.patrocinador) : "") + '</p></div></div>' +
      '</div>';
  }
  document.getElementById("btImprimirA3").addEventListener("click", function () { window.print(); });

  /* ===== CONTROLE DE ETAPA / CICLO ===== */
  document.getElementById("btAvancarEtapa").addEventListener("click", async function () {
    const idx = ETAPA_ORDEM.indexOf(projeto.etapa_atual);
    if (idx >= 3) { aviso("Você já está na etapa Agir. Encerre ou abra um novo ciclo.", true); return; }
    const proxima = ETAPA_ORDEM[idx + 1];
    if (!confirm("Avançar o projeto de " + ETAPA_LABEL[projeto.etapa_atual] + " para " + ETAPA_LABEL[proxima] + "?")) return;
    await supa().from("projetos_melhoria").update({ etapa_atual: proxima, atualizado_em: new Date().toISOString() }).eq("id", pid);
    aviso("Etapa avançada para " + ETAPA_LABEL[proxima] + "."); await recarregarTudo();
  });
  document.getElementById("btEncerrarCiclo").addEventListener("click", async function () {
    const licoes = prompt("O que funcionou e o que foi aprendido neste ciclo?");
    if (licoes === null) return;
    await supa().from("projetos_ciclos_historico").insert({ projeto_id: pid, numero_ciclo: projeto.ciclo_atual, decisao: "encerrado", licoes_aprendidas: licoes || null });
    await supa().from("projetos_melhoria").update({ status: "concluido", atualizado_em: new Date().toISOString() }).eq("id", pid);
    aviso("Ciclo encerrado e projeto concluído."); await recarregarTudo();
  });
  document.getElementById("btNovoCiclo").addEventListener("click", async function () {
    if (!confirm("Abrir um novo ciclo? O projeto volta para a etapa Planejar.")) return;
    const licoes = prompt("O que foi aprendido antes de abrir o novo ciclo?") || null;
    await supa().from("projetos_ciclos_historico").insert({ projeto_id: pid, numero_ciclo: projeto.ciclo_atual, decisao: "novo_ciclo", licoes_aprendidas: licoes });
    await supa().from("projetos_melhoria").update({ etapa_atual: "P", ciclo_atual: projeto.ciclo_atual + 1, status: "ativo", atualizado_em: new Date().toISOString() }).eq("id", pid);
    aviso("Novo ciclo aberto!"); await recarregarTudo();
  });

  async function recarregarESeção(secao) {
    await carregar();
    if (secao === "brainstorm") desenharBrainstorm();
    if (secao === "ishikawa") desenharIshikawa();
    if (secao === "porques") desenharPorques();
    if (secao === "pareto") desenharPareto();
    if (secao === "acoes") { preencherEntregas(); desenharAcoes(); if (visaoAcoes === "kanban") desenharKanban(); if (visaoAcoes === "gantt") desenharGantt(); }
    if (secao === "fmea") desenharFmea();
    if (secao === "priorizacao") desenharPriorizacao();
    if (secao === "eap") desenharEap();
    if (secao === "licoes") desenharLicoes();
    if (secao === "padronizacao") desenharPadronizacao();
    if (secao === "resultados") desenharResultados();
  }
  async function recarregarTudo() {
    const ok = await carregar(); if (!ok) return;
    desenharCabecalho(); preencherCharter(); preencherSipoc(); preencherSwot(); desenharBrainstorm(); desenharIshikawa(); desenharPorques();
    preencherResponsaveis(); preencherEntregas(); desenharAcoes(); desenharFmea(); desenharLicoes();
  }

  ligarAbas(document.getElementById("abas"), function (nome) {
    if (nome === "pareto") desenharPareto();
    if (nome === "priorizacao") desenharPriorizacao();
    if (nome === "eap") desenharEap();
    if (nome === "padronizacao") desenharPadronizacao();
    if (nome === "resultados") desenharResultados();
    if (nome === "a3") montarA3();
  });

  const ok = await carregar();
  if (!ok) return;
  desenharCabecalho(); preencherCharter(); preencherSipoc(); preencherSwot(); desenharBrainstorm(); desenharIshikawa(); desenharPorques();
  preencherResponsaveis(); preencherEntregas(); desenharAcoes(); desenharFmea(); desenharLicoes();
})();
