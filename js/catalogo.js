/* Gestão de produtos e ofertas: interesses (contatos quentes), catálogo e produtos por cliente. */
(async function () {
  const eu = await protegerPagina(["master", "suporte"]);
  if (!eu) return;
  const master = eu.papel === "master";
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  if (!master) document.querySelectorAll(".so-master").forEach(function (el) { el.remove(); });

  const STATUS = { novo: "Novo", em_conversa: "Em conversa", fechado: "Fechado", perdido: "Perdido" };
  let produtos = [], perfis = [], vinculos = [], interesses = [], filtro = "abertos", editId = null;
  const pessoa = function (id) { return perfis.find(function (p) { return p.id === id; }) || { nome: "?", id: id }; };
  const produto = function (id) { return produtos.find(function (p) { return p.id === id; }) || { nome: "Produto removido" }; };

  async function carregar() {
    const [rp, rf, rv, ri] = await Promise.all([
      supa().from("catalogo_produtos").select("*").order("ordem").order("nome"),
      supa().from("perfis").select("id,nome,email,papel,telefone,ativo").order("nome"),
      supa().from("cliente_produtos").select("perfil_id,produto_id,situacao,desde"),
      supa().from("interesses").select("id,perfil_id,produto_id,mensagem,status,criado_em").order("criado_em", { ascending: false })
    ]);
    produtos = rp.data || []; perfis = rf.data || []; vinculos = rv.data || []; interesses = ri.data || [];
  }

  /* ================= INTERESSES ================= */
  function desenharInteresses() {
    document.querySelectorAll("#filtroInt [data-f]").forEach(function (b) { b.style.borderColor = b.dataset.f === filtro ? "#C9A24A" : ""; b.style.background = b.dataset.f === filtro ? "#FBF3DF" : ""; });
    const novos = interesses.filter(function (i) { return i.status === "novo"; }).length;
    const cn = document.getElementById("contaNovos");
    cn.hidden = !novos; cn.textContent = novos;
    const lista = interesses.filter(function (i) {
      return filtro === "todos" || (filtro === "abertos" ? (i.status === "novo" || i.status === "em_conversa") : i.status === filtro);
    });
    document.getElementById("listaInt").innerHTML = lista.length ? lista.map(function (i) {
      const p = pessoa(i.perfil_id), pr = produto(i.produto_id);
      const msg = "Olá, " + p.nome.split(" ")[0] + "! Vi que você se interessou por " + pr.nome + ". Quer conversar sobre isso?";
      const wa = p.telefone ? '<a class="btn peq" style="background:#1FA855;color:#fff" target="_blank" rel="noopener" href="https://wa.me/' + p.telefone + "?text=" + encodeURIComponent(msg) + '">Chamar no WhatsApp</a>' : '<span class="acao-info">sem WhatsApp no cadastro · ' + esc(p.email || "") + "</span>";
      return '<li class="acao' + (i.status === "novo" ? " atrasada" : "") + '"><div class="acao-linha"><b>' + esc(p.nome) + " · " + esc(pr.nome) + "</b>" +
        '<select data-status="' + i.id + '" aria-label="Situação">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (i.status === k ? " selected" : "") + ">" + STATUS[k] + "</option>"; }).join("") + "</select></div>" +
        (i.mensagem ? '<div style="font-size:14.5px">“' + esc(i.mensagem) + "”</div>" : "") +
        '<div class="acao-info">Em ' + dataBR(i.criado_em) + "</div><div>" + wa + "</div></li>";
    }).join("") : '<li class="vazio">Nenhum interesse nesta lista.</li>';
  }
  document.getElementById("filtroInt").addEventListener("click", function (e) { const b = e.target.closest("[data-f]"); if (b) { filtro = b.dataset.f; desenharInteresses(); } });
  document.getElementById("listaInt").addEventListener("change", async function (e) {
    const s = e.target.closest("[data-status]"); if (!s) return;
    const { error } = await supa().from("interesses").update({ status: s.value, atualizado_em: new Date().toISOString() }).eq("id", s.dataset.status);
    if (error) { aviso("Não foi possível atualizar.", true); return; }
    const i = interesses.find(function (x) { return x.id === s.dataset.status; });
    if (s.value === "fechado" && i && master && confirm("Marcar " + produto(i.produto_id).nome + " como produto adquirido por " + pessoa(i.perfil_id).nome + "?")) {
      await supa().from("cliente_produtos").upsert({ perfil_id: i.perfil_id, produto_id: i.produto_id, situacao: "adquirido", desde: hojeISO() }, { onConflict: "perfil_id,produto_id" });
    }
    aviso("Situação atualizada.");
    await carregar(); desenharTudo();
  });

  /* ================= CATÁLOGO ================= */
  const fP = document.getElementById("formProd");
  function limparProd() {
    editId = null; fP.reset(); document.getElementById("pAtivo").checked = true; document.getElementById("pOrdem").value = 0;
    document.getElementById("tituloProd").textContent = "Novo produto"; document.getElementById("pSalvar").textContent = "Salvar produto"; document.getElementById("pCancelar").hidden = true;
  }
  if (fP) {
    document.getElementById("pCancelar").addEventListener("click", limparProd);
    fP.addEventListener("submit", async function (e) {
      e.preventDefault();
      const nome = document.getElementById("pNome").value.trim();
      const link = document.getElementById("pLink").value.trim();
      if (nome.length < 2) { aviso("Escreva o nome do produto.", true); return; }
      if (link && !/^https:\/\//i.test(link)) { aviso("O link de pagamento precisa começar com https://", true); return; }
      const reg = { nome: nome, servico: document.getElementById("pServ").value || null, preco_texto: document.getElementById("pPreco").value.trim() || null,
        descricao: document.getElementById("pDesc").value.trim() || null, inclui: document.getElementById("pInclui").value.trim() || null, link_pagamento: link || null,
        publico: document.getElementById("pPub").value, ordem: parseInt(document.getElementById("pOrdem").value, 10) || 0,
        destaque: document.getElementById("pDestaque").checked, ativo: document.getElementById("pAtivo").checked };
      const r = editId ? await supa().from("catalogo_produtos").update(reg).eq("id", editId) : await supa().from("catalogo_produtos").insert(reg);
      if (r.error) { aviso("Não foi possível salvar o produto.", true); return; }
      aviso(editId ? "Produto atualizado." : "Produto criado.");
      limparProd();
      await carregar(); desenharTudo();
    });
  }
  function cartaoProduto(p) {
    const tem = vinculos.filter(function (v) { return v.produto_id === p.id && v.situacao === "adquirido"; }).length;
    const of = vinculos.filter(function (v) { return v.produto_id === p.id && v.situacao === "oferecido"; }).length;
    const ints = interesses.filter(function (i) { return i.produto_id === p.id; }).length;
    return '<div class="sessao"><div class="sessao-topo"><b>' + esc(p.nome) + "</b><span>" +
      (p.destaque ? '<span class="selo ouro">Destaque</span>' : "") + (p.ativo ? "" : '<span class="selo off">Inativo</span>') +
      '<span class="selo">' + (p.publico === "todos" ? "Todos veem" : "Só oferecidos") + "</span></span></div>" +
      (p.preco_texto ? "<b>" + esc(p.preco_texto) + "</b>" : "") + (p.descricao ? "<p>" + esc(p.descricao) + "</p>" : "") +
      '<span class="acao-info">' + tem + (tem === 1 ? " cliente tem" : " clientes têm") + " · oferecido a " + of + " · " + ints + (ints === 1 ? " interesse" : " interesses") + (p.link_pagamento ? " · com link de pagamento" : "") + "</span>" +
      (master ? '<div class="acoes" style="margin-top:4px"><button class="btn peq contorno" type="button" data-ed="' + p.id + '">Editar</button><button class="btn peq perigo" type="button" data-del="' + p.id + '">Apagar</button></div>' : "") + "</div>";
  }
  function desenharCatalogo() {
    document.getElementById("listaProd").innerHTML = produtos.length ? produtos.map(cartaoProduto).join("") : '<div class="cartao"><p class="vazio">Nenhum produto no catálogo ainda.</p></div>';
  }
  document.getElementById("listaProd").addEventListener("click", async function (e) {
    const be = e.target.closest("[data-ed]"), bd = e.target.closest("[data-del]");
    if (be) {
      const p = produto(be.dataset.ed); editId = p.id;
      document.getElementById("pNome").value = p.nome; document.getElementById("pServ").value = p.servico || "";
      document.getElementById("pPreco").value = p.preco_texto || ""; document.getElementById("pDesc").value = p.descricao || "";
      document.getElementById("pInclui").value = p.inclui || ""; document.getElementById("pLink").value = p.link_pagamento || "";
      document.getElementById("pPub").value = p.publico; document.getElementById("pOrdem").value = p.ordem;
      document.getElementById("pDestaque").checked = p.destaque; document.getElementById("pAtivo").checked = p.ativo;
      document.getElementById("tituloProd").textContent = "Editando: " + p.nome; document.getElementById("pSalvar").textContent = "Salvar alteração";
      document.getElementById("pCancelar").hidden = false; fP.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (bd) {
      const p = produto(bd.dataset.del);
      if (!confirm("Apagar \"" + p.nome + "\"? Os interesses e marcações ligados a ele também serão apagados. Se quiser só tirar da vitrine, edite e desmarque \"Ativo\".")) return;
      const { error } = await supa().from("catalogo_produtos").delete().eq("id", p.id);
      if (error) { aviso("Não foi possível apagar.", true); return; }
      await carregar(); desenharTudo();
    }
  });

  /* ================= POR CLIENTE ================= */
  const selCli = document.getElementById("selCli");
  function preencherClientes() {
    const v = selCli.value;
    selCli.innerHTML = '<option value="">Escolha o cliente</option>' + perfis.filter(function (p) { return p.papel === "cliente" && p.ativo; })
      .map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join("");
    selCli.value = v;
  }
  function desenharPorCliente() {
    const pid = selCli.value, tb = document.getElementById("listaCliProd");
    if (!pid) { tb.innerHTML = '<tr><td colspan="3" class="vazio">Escolha um cliente acima.</td></tr>'; return; }
    tb.innerHTML = produtos.length ? produtos.map(function (p) {
      const v = vinculos.find(function (x) { return x.perfil_id === pid && x.produto_id === p.id; });
      const sit = v ? v.situacao : "";
      return "<tr><td><b>" + esc(p.nome) + "</b>" + (p.ativo ? "" : ' <span class="selo off">Inativo</span>') + "</td><td>" + (p.publico === "todos" ? "Todos" : "Só oferecidos") + "</td>" +
        '<td><select data-vinc="' + p.id + '"><option value=""' + (sit ? "" : " selected") + '>—</option><option value="oferecido"' + (sit === "oferecido" ? " selected" : "") + '>Oferecer a este cliente</option><option value="adquirido"' + (sit === "adquirido" ? " selected" : "") + ">Já tem</option></select>" +
        (v ? ' <span class="acao-info">desde ' + dataBR(v.desde) + "</span>" : "") + "</td></tr>";
    }).join("") : '<tr><td colspan="3" class="vazio">Cadastre produtos no catálogo primeiro.</td></tr>';
  }
  selCli.addEventListener("change", desenharPorCliente);
  document.getElementById("listaCliProd").addEventListener("change", async function (e) {
    const s = e.target.closest("[data-vinc]"); if (!s) return;
    const pid = selCli.value, prod = s.dataset.vinc;
    const r = s.value
      ? await supa().from("cliente_produtos").upsert({ perfil_id: pid, produto_id: prod, situacao: s.value, desde: hojeISO() }, { onConflict: "perfil_id,produto_id" })
      : await supa().from("cliente_produtos").delete().eq("perfil_id", pid).eq("produto_id", prod);
    if (r.error) { aviso("Não foi possível salvar.", true); return; }
    aviso(s.value === "adquirido" ? "Marcado como produto do cliente." : (s.value === "oferecido" ? "Oferta liberada para o cliente." : "Removido."));
    await carregar(); desenharTudo();
  });

  function desenharTudo() { desenharInteresses(); desenharCatalogo(); preencherClientes(); desenharPorCliente(); }
  ligarAbas(document.getElementById("abas"));
  await carregar();
  desenharTudo();
})();
