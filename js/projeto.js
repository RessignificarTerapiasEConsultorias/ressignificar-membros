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
  let editandoAcaoId = null, grafPareto = null;

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  async function carregar() {
    const [rp, rc, rb, ri, r5, rpt, ra] = await Promise.all([
      supa().from("projetos_melhoria").select("*").eq("id", pid).maybeSingle(),
      supa().from("projetos_charter").select("*").eq("projeto_id", pid).maybeSingle(),
      supa().from("projetos_brainstorm").select("*").eq("projeto_id", pid).order("votos", { ascending: false }),
      supa().from("projetos_ishikawa").select("*").eq("projeto_id", pid),
      supa().from("projetos_5porques").select("*").eq("projeto_id", pid).order("ordem"),
      supa().from("projetos_pareto").select("*").eq("projeto_id", pid).order("ordem"),
      supa().from("projetos_acoes").select("*").eq("projeto_id", pid).order("criado_em")
    ]);
    if (!rp.data) { aviso("Projeto não encontrado ou sem acesso.", true); setTimeout(function () { location.href = "projetos.html"; }, 1500); return false; }
    projeto = rp.data; charter = rc.data; brainstorm = rb.data || []; ishikawa = ri.data || []; porques = r5.data || []; pareto = rpt.data || []; acoes = ra.data || [];
    if (gestor) {
      const rpe = await supa().from("perfis").select("id,nome").eq("ativo", true).order("nome");
      perfisEquipe = rpe.data || [];
    } else {
      perfisEquipe = [{ id: eu.id, nome: eu.nome }];
    }
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
      responsavel_perfil_id: document.getElementById("apResponsavel").value || null, equipe_execucao: document.getElementById("apEquipe").value.trim() || null,
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
      document.getElementById("apResponsavel").value = a.responsavel_perfil_id || ""; document.getElementById("apEquipe").value = a.equipe_execucao || "";
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
    if (secao === "acoes") desenharAcoes();
  }
  async function recarregarTudo() {
    const ok = await carregar(); if (!ok) return;
    desenharCabecalho(); preencherCharter(); desenharBrainstorm(); desenharIshikawa(); desenharPorques(); desenharPareto(); preencherResponsaveis(); desenharAcoes();
  }

  ligarAbas(document.getElementById("abas"), function (nome) { if (nome === "pareto") desenharPareto(); });

  const ok = await carregar();
  if (!ok) return;
  desenharCabecalho(); preencherCharter(); desenharBrainstorm(); desenharIshikawa(); desenharPorques(); preencherResponsaveis(); desenharAcoes();
})();
