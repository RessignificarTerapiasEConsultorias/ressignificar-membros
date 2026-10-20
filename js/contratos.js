/* Contratos: documentos em PDF com assinatura dentro do sistema. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  const gestor = eu.papel !== "cliente";
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  if (eu.papel !== "master") document.querySelectorAll(".so-master").forEach(function (el) { el.remove(); });
  if (eu.papel === "suporte") document.getElementById("abaNovo").hidden = true;

  const TIPO_LABEL = { consultor_cliente: "Consultor ↔ Cliente", cliente_prestador: "Cliente ↔ Prestador" };
  let documentos = [], partes = [], perfisTodos = [], minhasEmpresas = [], filtro = "todos";
  let docSelecionadoAssinatura = null;

  function nomeDe(pid) { const p = perfisTodos.find(function (x) { return x.id === pid; }); return p ? p.nome : "?"; }

  async function carregar() {
    const [rd, rp, rf, re] = await Promise.all([
      supa().from("contratos_documentos").select("*").eq("cancelado", false).order("criado_em", { ascending: false }),
      supa().from("contratos_partes").select("*"),
      supa().from("perfis").select("id,nome,papel,ativo").order("nome"),
      supa().from("empresas").select("id,nome,tipo,empresa_membros(perfil_id,funcao)").eq("tipo", "empresa").order("nome")
    ]);
    documentos = rd.data || []; partes = rp.data || []; perfisTodos = rf.data || [];
    minhasEmpresas = (re.data || []).filter(function (e) { return (e.empresa_membros || []).some(function (m) { return m.perfil_id === eu.id && m.funcao === "dono"; }); });
  }

  function statusDe(doc) {
    const ps = partes.filter(function (p) { return p.documento_id === doc.id; });
    if (!ps.length) return "pendente";
    const todasAssinadas = ps.every(function (p) { return p.assinado_em; });
    const algumaAssinada = ps.some(function (p) { return p.assinado_em; });
    return todasAssinadas ? "assinado" : (algumaAssinada ? "parcial" : "pendente");
  }
  const STATUS_LABEL = { assinado: "Assinado por todos", parcial: "Parcialmente assinado", pendente: "Aguardando assinatura" };
  const STATUS_CLS = { assinado: "ok", parcial: "", pendente: "off" };

  function cartaoDocumento(doc) {
    const ps = partes.filter(function (p) { return p.documento_id === doc.id; });
    const status = statusDe(doc);
    const minhaParte = ps.find(function (p) { return p.perfil_id === eu.id; });
    return '<div class="sessao"><div class="sessao-topo"><b>' + esc(doc.titulo) + '</b>' +
      '<span class="selo ' + STATUS_CLS[status] + '">' + STATUS_LABEL[status] + '</span></div>' +
      '<span class="acao-info">' + TIPO_LABEL[doc.tipo_relacao] + (doc.servico ? " · " + ROTULO_SERVICO[doc.servico] : "") + " · criado em " + dataBR(doc.criado_em.slice(0, 10)) + '</span>' +
      (doc.descricao ? "<p>" + esc(doc.descricao) + "</p>" : "") +
      '<div class="tabela-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>Parte</th><th>Papel</th><th>Situação</th></tr></thead><tbody>' +
      ps.map(function (p) {
        return "<tr><td>" + esc(nomeDe(p.perfil_id)) + (p.perfil_id === eu.id ? " <i>(você)</i>" : "") + "</td><td>" + esc(p.papel_label) + "</td><td>" +
          (p.assinado_em ? '<span class="selo ok">Assinado em ' + dataBR(p.assinado_em.slice(0, 10)) + " às " + p.assinado_em.slice(11, 16) + " · " + esc(p.nome_digitado || "") + "</span>" : '<span class="selo off">Pendente</span>') +
          "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<div class="acoes" style="margin-top:8px">' +
      (doc.arquivo_path ? '<button class="btn peq contorno" type="button" data-baixar="' + doc.id + '">Ver documento (PDF)</button>' : '<span class="acao-info">Arquivo ainda não enviado</span>') +
      (minhaParte && !minhaParte.assinado_em ? '<button class="btn peq" type="button" data-assinar="' + doc.id + '">Assinar</button>' : "") +
      (gestor && doc.criado_por === eu.id ? '<button class="btn peq perigo" type="button" data-cancelar="' + doc.id + '">Cancelar contrato</button>' : "") +
      "</div></div>";
  }

  function desenharLista() {
    document.querySelectorAll("#filtroStatus [data-f]").forEach(function (b) { b.style.borderColor = b.dataset.f === filtro ? "#C9A24A" : ""; b.style.background = b.dataset.f === filtro ? "#FBF3DF" : ""; });
    const lista = documentos.filter(function (d) { return filtro === "todos" || statusDe(d) === filtro || (filtro === "pendente" && statusDe(d) === "parcial"); });
    document.getElementById("listaContratos").innerHTML = lista.length ? lista.map(cartaoDocumento).join("") : '<div class="cartao"><p class="vazio">Nenhum contrato encontrado.</p></div>';
  }
  document.getElementById("filtroStatus").addEventListener("click", function (e) { const b = e.target.closest("[data-f]"); if (b) { filtro = b.dataset.f; desenharLista(); } });

  document.getElementById("listaContratos").addEventListener("click", async function (e) {
    const bd = e.target.closest("[data-baixar]"), ba = e.target.closest("[data-assinar]"), bc = e.target.closest("[data-cancelar]");
    if (bd) {
      const doc = documentos.find(function (x) { return x.id === bd.dataset.baixar; });
      const r = await supa().storage.from("contratos").createSignedUrl(doc.arquivo_path, 300);
      if (r.error || !r.data) { aviso("Não foi possível abrir o documento.", true); return; }
      window.open(r.data.signedUrl, "_blank");
    }
    if (ba) {
      docSelecionadoAssinatura = documentos.find(function (x) { return x.id === ba.dataset.assinar; });
      document.getElementById("assinarContexto").textContent = "Você está assinando: " + docSelecionadoAssinatura.titulo;
      document.getElementById("nomeAssinatura").value = eu.nome || "";
      document.getElementById("confirmoLeitura").checked = false;
      document.getElementById("janelaAssinar").showModal();
    }
    if (bc) {
      if (!confirm("Cancelar este contrato? Ele deixa de aparecer para as partes envolvidas.")) return;
      const { error } = await supa().from("contratos_documentos").update({ cancelado: true }).eq("id", bc.dataset.cancelar);
      if (error) { aviso("Não foi possível cancelar.", true); return; }
      aviso("Contrato cancelado."); await carregar(); desenharLista();
    }
  });

  document.getElementById("btCancelarAssinatura").addEventListener("click", function () { document.getElementById("janelaAssinar").close(); });
  document.getElementById("btConfirmarAssinatura").addEventListener("click", async function () {
    const nome = document.getElementById("nomeAssinatura").value.trim();
    if (nome.length < 4) { aviso("Digite seu nome completo.", true); return; }
    if (!document.getElementById("confirmoLeitura").checked) { aviso("Confirme que leu o documento antes de assinar.", true); return; }
    const b = this; b.disabled = true;
    const { error } = await supa().from("contratos_partes").update({ nome_digitado: nome, assinado_em: new Date().toISOString() })
      .eq("documento_id", docSelecionadoAssinatura.id).eq("perfil_id", eu.id);
    b.disabled = false;
    if (error) { aviso("Não foi possível assinar. Tente novamente.", true); return; }
    document.getElementById("janelaAssinar").close();
    aviso("Assinado com sucesso!");
    await carregar(); desenharLista();
  });

  /* ===== NOVO CONTRATO ===== */
  const selCliente = document.getElementById("cCliente"), selEmpresa = document.getElementById("cEmpresa"), selPrestador = document.getElementById("cPrestadorSel");
  function preencherSelects() {
    selCliente.innerHTML = perfisTodos.filter(function (p) { return p.papel === "cliente" && p.ativo; }).map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join("");
    selEmpresa.innerHTML = minhasEmpresas.map(function (e) { return '<option value="' + e.id + '">' + esc(e.nome) + "</option>"; }).join("") || '<option value="">Você não é dono de nenhuma empresa</option>';
    selPrestador.innerHTML = perfisTodos.filter(function (p) { return p.id !== eu.id && p.ativo && (p.papel === "cliente" || p.papel === "master"); }).map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + (p.papel === "master" ? " (consultor)" : "") + "</option>"; }).join("");
  }
  const campoTipo = document.getElementById("cTipo");
  if (campoTipo) {
    campoTipo.addEventListener("change", function () {
      document.getElementById("blocoConsultorCliente").hidden = this.value !== "consultor_cliente";
      document.getElementById("blocoClientePrestador").hidden = this.value !== "cliente_prestador";
    });
  } else {
    // cliente: só pode criar cliente_prestador
    document.getElementById("blocoConsultorCliente").hidden = true;
    document.getElementById("blocoClientePrestador").hidden = false;
  }

  document.getElementById("formContrato").addEventListener("submit", async function (e) {
    e.preventDefault();
    const arquivo = document.getElementById("cArquivo").files[0];
    const titulo = document.getElementById("cTitulo").value.trim();
    if (!arquivo) { aviso("Selecione o arquivo PDF do contrato.", true); return; }
    if (arquivo.type !== "application/pdf") { aviso("O arquivo precisa ser um PDF.", true); return; }
    if (arquivo.size > 15 * 1024 * 1024) { aviso("O arquivo precisa ter até 15 MB.", true); return; }
    if (titulo.length < 4) { aviso("Escreva o título do contrato.", true); return; }

    const tipo = campoTipo ? campoTipo.value : "cliente_prestador";
    let reg = { tipo_relacao: tipo, titulo: titulo, descricao: document.getElementById("cDesc").value.trim() || null, criado_por: eu.id };
    let partesNovas = [];
    if (tipo === "consultor_cliente") {
      const clienteId = selCliente.value;
      if (!clienteId) { aviso("Escolha o cliente.", true); return; }
      reg.servico = document.getElementById("cServico").value || null;
      partesNovas = [{ perfil_id: eu.id, papel_label: "Consultor" }, { perfil_id: clienteId, papel_label: "Cliente" }];
    } else {
      const empresaId = selEmpresa.value, prestadorId = selPrestador.value;
      if (!empresaId) { aviso("Escolha a empresa.", true); return; }
      if (!prestadorId) { aviso("Escolha o prestador.", true); return; }
      reg.empresa_id = empresaId;
      partesNovas = [{ perfil_id: eu.id, papel_label: "Cliente contratante" }, { perfil_id: prestadorId, papel_label: "Prestador" }];
    }

    const b = document.getElementById("cSalvar"); b.disabled = true;
    const rDoc = await supa().from("contratos_documentos").insert(reg).select().single();
    if (rDoc.error) { b.disabled = false; aviso("Não foi possível criar o contrato.", true); return; }
    const docId = rDoc.data.id;

    const rPartes = await supa().from("contratos_partes").insert(partesNovas.map(function (p) { return Object.assign({ documento_id: docId }, p); }));
    if (rPartes.error) { b.disabled = false; aviso("Contrato criado, mas não foi possível registrar as partes.", true); return; }

    const caminho = docId + "/" + arquivo.name.replace(/[^\w.\-]/g, "_");
    const rUp = await supa().storage.from("contratos").upload(caminho, arquivo, { contentType: "application/pdf" });
    b.disabled = false;
    if (rUp.error) { aviso("Contrato criado, mas o arquivo não foi enviado. Tente enviar de novo.", true); return; }
    await supa().from("contratos_documentos").update({ arquivo_path: caminho, arquivo_nome: arquivo.name }).eq("id", docId);

    aviso("Contrato criado e enviado para assinatura!");
    document.getElementById("formContrato").reset();
    document.querySelector('[data-aba="meus"]').click();
    await carregar(); desenharLista();
  });

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  ligarAbas(document.getElementById("abas"));
  await carregar();
  preencherSelects();
  desenharLista();
})();
