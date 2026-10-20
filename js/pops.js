/* POPs e manuais: biblioteca padrão (mestre) + documentos editáveis de cada cliente. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  const master = eu.papel === "master";
  if (master) document.getElementById("abaBiblioteca").hidden = false;

  const CANAL_LABEL = {
    clinica_presencial: "Atendimento presencial / clínica", whatsapp: "WhatsApp", instagram_redes: "Instagram e redes sociais",
    vendas: "Vendas", interno_empresa: "Interno / operacional", outro: "Outro"
  };
  let modelos = [], modelosPassos = [], documentos = [], passos = [], filtroCanal = "todos", editandoId = null, editandoPassosLocal = [];

  async function carregar() {
    const [rm, rmp, rd] = await Promise.all([
      supa().from("pops_modelos").select("*").eq("ativo", true).order("ordem"),
      supa().from("pops_modelos_passos").select("*").order("ordem"),
      supa().from("pops_documentos").select("*").eq("perfil_id", eu.id).eq("ativo", true).order("criado_em")
    ]);
    modelos = rm.data || []; modelosPassos = rmp.data || [];
    documentos = rd.data || [];
    if (documentos.length) {
      const rp = await supa().from("pops_passos").select("*").in("documento_id", documentos.map(function (d) { return d.id; })).order("ordem");
      passos = rp.data || [];
    } else passos = [];
  }

  // ---- auto-provisionamento: primeira vez do cliente, copia os 6 modelos ----
  async function autoProvisionar() {
    if (documentos.length || master) return; // master não recebe cópia automática
    const novos = modelos.map(function (m) {
      return { perfil_id: eu.id, canal: m.canal, titulo: m.titulo, objetivo: m.objetivo, escopo: m.escopo, responsavel: m.responsavel_padrao, materiais: m.materiais, criterios_qualidade: m.criterios_qualidade, erros_comuns: m.erros_comuns, origem_modelo_id: m.id };
    });
    if (!novos.length) return;
    const rDocs = await supa().from("pops_documentos").insert(novos).select();
    if (rDocs.error || !rDocs.data) return;
    const passosNovos = [];
    rDocs.data.forEach(function (doc) {
      const mp = modelosPassos.filter(function (p) { return p.modelo_id === doc.origem_modelo_id; });
      mp.forEach(function (p) { passosNovos.push({ documento_id: doc.id, ordem: p.ordem, titulo: p.titulo, descricao: p.descricao }); });
    });
    if (passosNovos.length) await supa().from("pops_passos").insert(passosNovos);
    await carregar();
  }

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ================= MEUS POPS ================= */
  function desenharFiltro() {
    const canaisPresentes = Array.from(new Set(documentos.map(function (d) { return d.canal; })));
    const el = document.getElementById("filtroCanal");
    el.innerHTML = '<button type="button" data-f="todos">Todos</button>' + canaisPresentes.map(function (c) { return '<button type="button" data-f="' + c + '">' + CANAL_LABEL[c] + "</button>"; }).join("");
    el.querySelectorAll("[data-f]").forEach(function (b) { b.style.borderColor = b.dataset.f === filtroCanal ? "#C9A24A" : ""; b.style.background = b.dataset.f === filtroCanal ? "#FBF3DF" : ""; });
  }
  document.getElementById("filtroCanal").addEventListener("click", function (e) { const b = e.target.closest("[data-f]"); if (b) { filtroCanal = b.dataset.f; desenharMeusPops(); } });

  function cartaoPop(doc) {
    const ps = passos.filter(function (p) { return p.documento_id === doc.id; }).sort(function (a, b) { return a.ordem - b.ordem; });
    return '<div class="pop-card"><div class="pop-topo"><div><span class="pop-canal">' + CANAL_LABEL[doc.canal] + '</span><h2 style="margin:4px 0 0">' + esc(doc.titulo) + "</h2></div>" +
      '<div class="acoes"><button class="btn peq contorno" type="button" data-editar="' + doc.id + '">Editar</button><button class="btn peq perigo" type="button" data-remover="' + doc.id + '">Remover</button></div></div>' +
      (doc.objetivo ? "<p><b>Objetivo:</b> " + esc(doc.objetivo) + "</p>" : "") +
      (doc.escopo ? "<p><b>Escopo:</b> " + esc(doc.escopo) + "</p>" : "") +
      (doc.responsavel ? '<p class="acao-info"><b>Responsável:</b> ' + esc(doc.responsavel) + "</p>" : "") +
      (doc.materiais ? '<p class="acao-info"><b>Materiais:</b> ' + esc(doc.materiais) + "</p>" : "") +
      (ps.length ? "<ol>" + ps.map(function (p) { return "<li><b>" + esc(p.titulo) + "</b>" + (p.descricao ? " — " + esc(p.descricao) : "") + "</li>"; }).join("") + "</ol>" : "") +
      (doc.criterios_qualidade ? '<p class="acao-info" style="margin-top:8px"><b>Critérios de qualidade:</b> ' + esc(doc.criterios_qualidade) + "</p>" : "") +
      (doc.erros_comuns ? '<p class="acao-info"><b>Erros comuns:</b> ' + esc(doc.erros_comuns) + "</p>" : "") +
      "</div>";
  }
  function desenharMeusPops() {
    desenharFiltro();
    const lista = documentos.filter(function (d) { return filtroCanal === "todos" || d.canal === filtroCanal; });
    document.getElementById("listaPops").innerHTML = lista.length ? lista.map(cartaoPop).join("") : '<div class="cartao"><p class="vazio">Nenhum POP cadastrado ainda.</p></div>';
  }
  document.getElementById("listaPops").addEventListener("click", function (e) {
    const be = e.target.closest("[data-editar]"), br = e.target.closest("[data-remover]");
    if (be) abrirEdicao(documentos.find(function (d) { return d.id === be.dataset.editar; }));
    if (br) removerPop(br.dataset.remover);
  });
  async function removerPop(id) {
    const doc = documentos.find(function (d) { return d.id === id; });
    if (!doc || !confirm('Remover o POP "' + doc.titulo + '"? Ele sai da sua lista, mas pode ser adicionado de novo pela biblioteca.')) return;
    await supa().from("pops_documentos").update({ ativo: false }).eq("id", id);
    aviso("POP removido."); await carregar(); desenharMeusPops();
  }

  /* ================= ADICIONAR DA BIBLIOTECA ================= */
  const janelaAdd = document.getElementById("janelaAdicionarModelo");
  document.getElementById("btAdicionarModelo").addEventListener("click", function () {
    const jaTenho = documentos.map(function (d) { return d.origem_modelo_id; });
    const disponiveis = modelos.filter(function (m) { return jaTenho.indexOf(m.id) === -1; });
    document.getElementById("listaModelosDisponiveis").innerHTML = disponiveis.length ? disponiveis.map(function (m) {
      return '<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" value="' + m.id + '" style="margin-top:3px"><span><b>' + esc(m.titulo) + '</b><br><span class="acao-info">' + CANAL_LABEL[m.canal] + '</span></span></label>';
    }).join("") : '<p class="vazio">Você já tem todos os modelos da biblioteca.</p>';
    janelaAdd.showModal();
  });
  document.getElementById("btFecharAdicionar").addEventListener("click", function () { janelaAdd.close(); });
  document.getElementById("btConfirmarAdicionar").addEventListener("click", async function () {
    const ids = Array.from(document.querySelectorAll('#listaModelosDisponiveis input:checked')).map(function (i) { return i.value; });
    if (!ids.length) { aviso("Selecione ao menos um modelo.", true); return; }
    const escolhidos = modelos.filter(function (m) { return ids.indexOf(m.id) !== -1; });
    const novos = escolhidos.map(function (m) { return { perfil_id: eu.id, canal: m.canal, titulo: m.titulo, objetivo: m.objetivo, escopo: m.escopo, responsavel: m.responsavel_padrao, materiais: m.materiais, criterios_qualidade: m.criterios_qualidade, erros_comuns: m.erros_comuns, origem_modelo_id: m.id }; });
    const rDocs = await supa().from("pops_documentos").insert(novos).select();
    if (rDocs.error) { aviso("Não foi possível adicionar.", true); return; }
    const passosNovos = [];
    rDocs.data.forEach(function (doc) {
      modelosPassos.filter(function (p) { return p.modelo_id === doc.origem_modelo_id; }).forEach(function (p) { passosNovos.push({ documento_id: doc.id, ordem: p.ordem, titulo: p.titulo, descricao: p.descricao }); });
    });
    if (passosNovos.length) await supa().from("pops_passos").insert(passosNovos);
    janelaAdd.close();
    aviso(escolhidos.length + " modelo(s) adicionado(s)!");
    await carregar(); desenharMeusPops();
  });

  /* ================= EDITAR / CRIAR POP ================= */
  const janelaEd = document.getElementById("janelaEditarPop");
  function desenharPassosEditor() {
    document.getElementById("listaPassos").innerHTML = editandoPassosLocal.map(function (p, i) {
      return '<div class="passo-item"><span class="passo-num">' + (i + 1) + '.</span><div class="passo-campos">' +
        '<input data-passo-titulo="' + i + '" value="' + esc(p.titulo) + '" placeholder="Título do passo">' +
        '<textarea data-passo-desc="' + i + '" rows="1" placeholder="Descrição (opcional)">' + esc(p.descricao || "") + '</textarea>' +
        '</div><button class="btn peq perigo" type="button" data-del-passo="' + i + '">Remover</button></div>';
    }).join("");
  }
  document.getElementById("listaPassos").addEventListener("input", function (e) {
    const it = e.target.closest("[data-passo-titulo]"); const dt = e.target.closest("[data-passo-desc]");
    if (it) editandoPassosLocal[+it.dataset.passoTitulo].titulo = it.value;
    if (dt) editandoPassosLocal[+dt.dataset.passoDesc].descricao = dt.value;
  });
  document.getElementById("listaPassos").addEventListener("click", function (e) {
    const bd = e.target.closest("[data-del-passo]"); if (!bd) return;
    editandoPassosLocal.splice(+bd.dataset.delPasso, 1); desenharPassosEditor();
  });
  document.getElementById("btAddPasso").addEventListener("click", function () {
    editandoPassosLocal.push({ titulo: "", descricao: "" }); desenharPassosEditor();
  });

  function abrirEdicao(doc) {
    editandoId = doc ? doc.id : null;
    document.getElementById("tituloJanelaPop").textContent = doc ? "Editando: " + doc.titulo : "Novo POP";
    document.getElementById("popTitulo").value = doc ? doc.titulo : "";
    document.getElementById("popCanal").value = doc ? doc.canal : "outro";
    document.getElementById("popObjetivo").value = doc ? (doc.objetivo || "") : "";
    document.getElementById("popEscopo").value = doc ? (doc.escopo || "") : "";
    document.getElementById("popResponsavel").value = doc ? (doc.responsavel || "") : "";
    document.getElementById("popMateriais").value = doc ? (doc.materiais || "") : "";
    document.getElementById("popCriterios").value = doc ? (doc.criterios_qualidade || "") : "";
    document.getElementById("popErros").value = doc ? (doc.erros_comuns || "") : "";
    editandoPassosLocal = doc ? passos.filter(function (p) { return p.documento_id === doc.id; }).sort(function (a, b) { return a.ordem - b.ordem; }).map(function (p) { return { titulo: p.titulo, descricao: p.descricao }; }) : [];
    desenharPassosEditor();
    janelaEd.showModal();
  }
  document.getElementById("btNovoPop").addEventListener("click", function () { abrirEdicao(null); });
  document.getElementById("btFecharEditarPop").addEventListener("click", function () { janelaEd.close(); });

  document.getElementById("formPop").addEventListener("submit", async function (e) {
    e.preventDefault();
    const titulo = document.getElementById("popTitulo").value.trim();
    if (titulo.length < 3) { aviso("Escreva o título do POP.", true); return; }
    const reg = {
      perfil_id: eu.id, canal: document.getElementById("popCanal").value, titulo: titulo,
      objetivo: document.getElementById("popObjetivo").value.trim() || null, escopo: document.getElementById("popEscopo").value.trim() || null,
      responsavel: document.getElementById("popResponsavel").value.trim() || null, materiais: document.getElementById("popMateriais").value.trim() || null,
      criterios_qualidade: document.getElementById("popCriterios").value.trim() || null, erros_comuns: document.getElementById("popErros").value.trim() || null,
      personalizado: true, atualizado_em: new Date().toISOString()
    };
    const b = this.querySelector("[type=submit]"); b.disabled = true;
    let docId = editandoId;
    if (editandoId) {
      const r = await supa().from("pops_documentos").update(reg).eq("id", editandoId);
      if (r.error) { b.disabled = false; aviso("Não foi possível salvar.", true); return; }
      await supa().from("pops_passos").delete().eq("documento_id", editandoId);
    } else {
      const r = await supa().from("pops_documentos").insert(reg).select().single();
      if (r.error) { b.disabled = false; aviso("Não foi possível criar.", true); return; }
      docId = r.data.id;
    }
    const passosValidos = editandoPassosLocal.filter(function (p) { return p.titulo.trim(); });
    if (passosValidos.length) {
      await supa().from("pops_passos").insert(passosValidos.map(function (p, i) { return { documento_id: docId, ordem: i + 1, titulo: p.titulo.trim(), descricao: (p.descricao || "").trim() || null }; }));
    }
    b.disabled = false;
    aviso(editandoId ? "POP atualizado!" : "POP criado!");
    janelaEd.close();
    await carregar(); desenharMeusPops();
  });

  /* ================= BIBLIOTECA (só master) ================= */
  function cartaoModelo(m) {
    const ps = modelosPassos.filter(function (p) { return p.modelo_id === m.id; }).sort(function (a, b) { return a.ordem - b.ordem; });
    return '<div class="pop-card"><span class="pop-canal">' + CANAL_LABEL[m.canal] + '</span><h2 style="margin:4px 0 0">' + esc(m.titulo) + "</h2>" +
      (m.objetivo ? "<p><b>Objetivo:</b> " + esc(m.objetivo) + "</p>" : "") +
      (ps.length ? "<ol>" + ps.map(function (p) { return "<li><b>" + esc(p.titulo) + "</b>" + (p.descricao ? " — " + esc(p.descricao) : "") + "</li>"; }).join("") + "</ol>" : "") +
      '<p class="acao-info" style="margin-top:8px">Este modelo é copiado automaticamente para todo novo cliente.</p></div>';
  }
  function desenharBiblioteca() {
    document.getElementById("listaModelos").innerHTML = modelos.map(cartaoModelo).join("");
  }

  ligarAbas(document.getElementById("abas"), function (nome) { if (nome === "biblioteca") desenharBiblioteca(); });

  await carregar();
  await autoProvisionar();
  desenharMeusPops();
  if (master) desenharBiblioteca();
})();
