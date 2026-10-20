/* Gestão de módulos por empresa: ligar nativos e criar módulos personalizados. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  const eid = new URLSearchParams(location.search).get("e");
  function falha(msg) { document.getElementById("falhaMsg").textContent = msg; document.getElementById("falha").hidden = false; }
  if (!eid) return falha("Nenhuma empresa escolhida.");

  const re = await supa().from("empresas").select("id,nome,tipo").eq("id", eid).maybeSingle();
  if (!re.data) return falha("Esta empresa não existe ou você não tem acesso a ela.");
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  document.getElementById("tituloEmpresa").textContent = "Módulos: " + re.data.nome;
  document.getElementById("area").hidden = false;

  const TIPO_LABEL = { texto: "Texto", numero: "Número", data: "Data", selecao: "Lista de opções" };
  let catalogo = [], ativos = [], definicoes = [], editandoId = null;

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  async function carregar() {
    const [rc, ra, rd] = await Promise.all([
      supa().from("modulos_catalogo").select("*"),
      supa().from("empresa_modulos").select("*").eq("empresa_id", eid),
      supa().from("modulos_definicoes").select("*").eq("empresa_id", eid).eq("ativo", true).order("criado_em")
    ]);
    catalogo = rc.data || []; ativos = ra.data || []; definicoes = rd.data || [];
  }

  function desenharNativos() {
    document.getElementById("listaNativos").innerHTML = catalogo.map(function (m) {
      const at = ativos.find(function (a) { return a.modulo_chave === m.chave; });
      const ligado = at && at.ativo;
      return '<div class="sessao"><div class="sessao-topo"><b>' + esc(m.nome) + '</b>' +
        '<label style="display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer"><input type="checkbox" data-toggle-nativo="' + m.chave + '" ' + (ligado ? "checked" : "") + '> ' + (ligado ? "Ligado" : "Desligado") + '</label></div>' +
        (m.descricao ? "<p>" + esc(m.descricao) + "</p>" : "") +
        (ligado && m.chave === "vendas_vendedor" ? '<a class="btn peq contorno" href="vendas.html?e=' + eid + '">Abrir Vendas</a>' : "") +
        (ligado && m.chave === "lives" ? '<a class="btn peq contorno" href="dre.html?e=' + eid + '">Abrir DRE (aba Lives)</a>' : "") +
        "</div>";
    }).join("");
  }
  document.getElementById("listaNativos").addEventListener("change", async function (e) {
    const cb = e.target.closest("[data-toggle-nativo]"); if (!cb) return;
    const chave = cb.dataset.toggleNativo, ligar = cb.checked;
    const existente = ativos.find(function (a) { return a.modulo_chave === chave; });
    let r;
    if (existente) r = await supa().from("empresa_modulos").update({ ativo: ligar }).eq("id", existente.id);
    else r = await supa().from("empresa_modulos").insert({ empresa_id: eid, modulo_chave: chave, ativo: true, ativado_por: eu.id });
    if (r.error) { aviso("Não foi possível alterar.", true); cb.checked = !ligar; return; }
    aviso(ligar ? "Módulo ligado!" : "Módulo desligado.");
    await carregar(); desenharNativos();
  });

  /* ===== construtor de campos ===== */
  function novoCampoEl(campo) {
    const tpl = document.getElementById("modeloCampo").content.cloneNode(true);
    const wrap = tpl.querySelector("[data-campo]");
    if (campo) {
      wrap.querySelector("[data-campo-label]").value = campo.label || "";
      wrap.querySelector("[data-campo-tipo]").value = campo.tipo || "texto";
      wrap.querySelector("[data-campo-opcoes]").value = (campo.opcoes || []).join(", ");
      wrap.querySelector("[data-campo-opcoes]").hidden = campo.tipo !== "selecao";
    }
    return wrap;
  }
  document.getElementById("btAddCampo").addEventListener("click", function () {
    document.getElementById("listaCampos").appendChild(novoCampoEl(null));
  });
  document.getElementById("listaCampos").addEventListener("change", function (e) {
    const sel = e.target.closest("[data-campo-tipo]"); if (!sel) return;
    sel.closest("[data-campo]").querySelector("[data-campo-opcoes]").hidden = sel.value !== "selecao";
  });
  document.getElementById("listaCampos").addEventListener("click", function (e) {
    const b = e.target.closest("[data-del-campo]"); if (!b) return;
    b.closest("[data-campo]").remove();
  });

  function limparFormModulo() {
    editandoId = null; document.getElementById("formModulo").reset();
    document.getElementById("listaCampos").innerHTML = "";
    document.getElementById("tituloFormModulo").textContent = "Criar módulo personalizado";
    document.getElementById("mdSalvar").textContent = "Criar módulo"; document.getElementById("mdCancelar").hidden = true;
  }
  document.getElementById("mdCancelar").addEventListener("click", limparFormModulo);

  document.getElementById("formModulo").addEventListener("submit", async function (e) {
    e.preventDefault();
    const nome = document.getElementById("mdNome").value.trim();
    if (nome.length < 3) { aviso("Escreva o nome do módulo.", true); return; }
    const campos = Array.from(document.querySelectorAll("#listaCampos [data-campo]")).map(function (el, i) {
      const label = el.querySelector("[data-campo-label]").value.trim();
      const tipo = el.querySelector("[data-campo-tipo]").value;
      const opcoesTxt = el.querySelector("[data-campo-opcoes]").value.trim();
      return label ? {
        chave: "campo" + i + "_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: label, tipo: tipo,
        opcoes: tipo === "selecao" ? opcoesTxt.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : undefined
      } : null;
    }).filter(Boolean);
    if (!campos.length) { aviso("Adicione pelo menos um campo.", true); return; }
    const reg = { empresa_id: eid, nome: nome, descricao: document.getElementById("mdDesc").value.trim() || null, campos: campos, criado_por: eu.id };
    const b = document.getElementById("mdSalvar"); b.disabled = true;
    const r = editandoId ? await supa().from("modulos_definicoes").update(reg).eq("id", editandoId) : await supa().from("modulos_definicoes").insert(reg);
    b.disabled = false;
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso(editandoId ? "Módulo atualizado!" : "Módulo criado! Já pode lançar dados nele.");
    limparFormModulo(); await carregar(); desenharPersonalizados();
  });

  function desenharPersonalizados() {
    document.getElementById("listaPersonalizados").innerHTML = definicoes.length ? definicoes.map(function (m) {
      return '<div class="sessao"><div class="sessao-topo"><b>' + esc(m.nome) + '</b><span class="acao-info">' + m.campos.length + " campo(s)</span></div>" +
        (m.descricao ? "<p>" + esc(m.descricao) + "</p>" : "") +
        '<p class="acao-info">Campos: ' + m.campos.map(function (c) { return esc(c.label) + " (" + TIPO_LABEL[c.tipo] + ")"; }).join(", ") + '</p>' +
        '<div class="acoes" style="margin-top:8px">' +
        '<a class="btn peq" href="modulo-dados.html?id=' + m.id + '">Abrir lançamentos</a>' +
        '<button class="btn peq contorno" type="button" data-editar="' + m.id + '">Editar</button>' +
        '<button class="btn peq perigo" type="button" data-remover="' + m.id + '">Remover</button></div></div>';
    }).join("") : '<p class="vazio">Nenhum módulo personalizado criado ainda.</p>';
  }
  document.getElementById("listaPersonalizados").addEventListener("click", async function (e) {
    const be = e.target.closest("[data-editar]"), br = e.target.closest("[data-remover]");
    if (be) {
      const m = definicoes.find(function (x) { return x.id === be.dataset.editar; }); if (!m) return;
      editandoId = m.id;
      document.getElementById("mdNome").value = m.nome; document.getElementById("mdDesc").value = m.descricao || "";
      document.getElementById("listaCampos").innerHTML = "";
      m.campos.forEach(function (c) { document.getElementById("listaCampos").appendChild(novoCampoEl(c)); });
      document.getElementById("tituloFormModulo").textContent = "Editando: " + m.nome;
      document.getElementById("mdSalvar").textContent = "Salvar alteração"; document.getElementById("mdCancelar").hidden = false;
      document.getElementById("formModulo").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (br) {
      const m = definicoes.find(function (x) { return x.id === br.dataset.remover; });
      if (!m || !confirm('Remover o módulo "' + m.nome + '"? Os registros já lançados continuam guardados, mas o módulo some da lista.')) return;
      await supa().from("modulos_definicoes").update({ ativo: false }).eq("id", m.id);
      aviso("Módulo removido."); await carregar(); desenharPersonalizados();
    }
  });

  await carregar();
  desenharNativos(); desenharPersonalizados();
})();
