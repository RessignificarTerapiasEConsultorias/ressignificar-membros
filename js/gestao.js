/* Painel de gestão: usado pelo master (tudo) e pelo suporte (sem criar acessos e sem ver o que é privado do master). */
(async function () {
  const modo = document.body.dataset.modo;
  const eu = await protegerPagina(modo);
  if (!eu) return;
  const master = modo === "master";
  if (!master) document.querySelectorAll(".so-master").forEach(function (el) { el.remove(); });
  ligarAbas(document.getElementById("abas"));

  const SERVICOS = ["consultoria_empresarial", "terapia", "mentoria"];
  let perfis = [], servicos = [], empresas = [];
  const porId = function (id) { return perfis.find(function (p) { return p.id === id; }); };

  /* ================= PESSOAS ================= */
  async function carregarPessoas() {
    const r1 = await supa().from("perfis").select("id,nome,email,papel,ativo,criado_em").order("nome");
    const r2 = await supa().from("servicos_contratados").select("perfil_id,tipo,ativo");
    if (r1.error) { aviso("Não foi possível carregar as pessoas.", true); return; }
    perfis = r1.data || [];
    servicos = r2.data || [];
    desenharPessoas();
    preencherDonos();
  }
  function servicosDe(id) {
    return servicos.filter(function (s) { return s.perfil_id === id && s.ativo; }).map(function (s) { return s.tipo; });
  }
  function desenharPessoas() {
    const tb = document.querySelector("#tabPessoas tbody");
    const filtro = (document.getElementById("buscaPessoa").value || "").toLowerCase().trim();
    const lista = perfis.filter(function (p) { return !filtro || (p.nome + " " + p.email).toLowerCase().indexOf(filtro) > -1; });
    document.getElementById("contaPessoas").textContent = perfis.length + (perfis.length === 1 ? " pessoa" : " pessoas");
    if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="vazio">Nenhuma pessoa encontrada.</td></tr>'; return; }
    tb.innerHTML = lista.map(function (p) {
      const servs = servicosDe(p.id).map(function (t) { return '<span class="selo">' + ROTULO_SERVICO[t] + "</span>"; }).join("");
      return "<tr>" +
        "<td><b>" + esc(p.nome) + "</b>" + (p.id === eu.id ? ' <span class="selo">você</span>' : "") + "</td>" +
        "<td>" + esc(p.email) + "</td>" +
        '<td><span class="selo' + (p.papel === "master" ? " ouro" : "") + '">' + ROTULO_PAPEL[p.papel] + "</span></td>" +
        '<td class="quebra">' + (servs || '<span class="vazio">—</span>') + "</td>" +
        "<td>" + (p.ativo ? '<span class="selo ok">Ativo</span>' : '<span class="selo off">Desativado</span>') + "</td>" +
        '<td><button class="btn peq contorno" type="button" data-editar="' + p.id + '">Editar</button>' +
        (master && p.papel === "cliente" && servicosDe(p.id).indexOf("terapia") > -1 ? ' <a class="btn peq" href="terapia.html?p=' + p.id + '">Terapia</a>' : "") + "</td>" +
        "</tr>";
    }).join("");
  }
  document.getElementById("buscaPessoa").addEventListener("input", desenharPessoas);
  document.querySelector("#tabPessoas tbody").addEventListener("click", function (e) {
    const b = e.target.closest("[data-editar]");
    if (b) abrirEdicao(b.dataset.editar);
  });

  /* ---------- novo acesso (só master) ---------- */
  function gerarSenha() {
    const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let s = "";
    const r = new Uint32Array(10);
    crypto.getRandomValues(r);
    for (let i = 0; i < 10; i++) s += letras[r[i] % letras.length];
    return s;
  }
  const formNovo = document.getElementById("formNovo");
  if (formNovo) {
    document.getElementById("gerarSenha").addEventListener("click", function () {
      document.getElementById("novoSenha").value = gerarSenha();
    });
    formNovo.addEventListener("submit", async function (e) {
      e.preventDefault();
      const botao = formNovo.querySelector("button[type=submit]");
      const dados = {
        acao: "criar",
        nome: formNovo.nome.value.trim(),
        email: formNovo.email.value.trim(),
        senha: formNovo.senha.value,
        papel: formNovo.papel.value,
        servicos: Array.prototype.slice.call(formNovo.querySelectorAll("input[name=servico]:checked")).map(function (c) { return c.value; })
      };
      botao.disabled = true; botao.textContent = "Criando...";
      const r = await chamarServidor(dados);
      botao.disabled = false; botao.textContent = "Criar acesso";
      if (!r.ok) { aviso(r.erro, true); return; }
      const link = location.origin + location.pathname.replace(/[^/]*$/, "");
      const msg = "Olá, " + dados.nome.split(" ")[0] + "! Seu acesso à Área de Membros da Ressignificar está pronto.\n\n" +
        "Link: " + link + "\nE-mail: " + dados.email + "\nSenha provisória: " + dados.senha +
        "\n\nNo primeiro acesso, troque a senha em \"Minha conta\".";
      document.getElementById("msgBoasVindas").value = msg;
      document.getElementById("resultadoNovo").hidden = false;
      formNovo.reset();
      aviso("Acesso criado.");
      carregarPessoas();
    });
    document.getElementById("copiarMsg").addEventListener("click", async function () {
      const t = document.getElementById("msgBoasVindas");
      try { await navigator.clipboard.writeText(t.value); aviso("Mensagem copiada."); }
      catch (e) { t.select(); document.execCommand("copy"); aviso("Mensagem copiada."); }
    });
  }

  /* ---------- editar pessoa ---------- */
  const janela = document.getElementById("janelaEditar");
  let editando = null;
  function abrirEdicao(id) {
    const p = porId(id);
    if (!p) return;
    editando = p;
    document.getElementById("edTitulo").textContent = p.nome;
    document.getElementById("edEmail").textContent = p.email;
    const ativos = servicosDe(p.id);
    janela.querySelectorAll("input[name=edServico]").forEach(function (c) { c.checked = ativos.indexOf(c.value) > -1; });
    if (master) {
      document.getElementById("edNome").value = p.nome;
      document.getElementById("edPapel").value = p.papel;
      document.getElementById("edAtivo").checked = p.ativo;
      document.getElementById("edSenha").value = "";
    }
    janela.showModal();
  }
  document.getElementById("edCancelar").addEventListener("click", function () { janela.close(); });

  document.getElementById("edSalvar").addEventListener("click", async function () {
    const p = editando;
    if (!p) return;
    const botao = this;
    botao.disabled = true;
    try {
      if (master) {
        const nome = document.getElementById("edNome").value.trim();
        const papel = document.getElementById("edPapel").value;
        if (nome !== p.nome || papel !== p.papel) {
          const r = await chamarServidor({ acao: "editar", perfil_id: p.id, nome: nome, papel: papel });
          if (!r.ok) { aviso(r.erro, true); return; }
        }
        const ativo = document.getElementById("edAtivo").checked;
        if (ativo !== p.ativo) {
          const r = await chamarServidor({ acao: "ativar", perfil_id: p.id, ativo: ativo });
          if (!r.ok) { aviso(r.erro, true); return; }
        }
      }
      const marcados = Array.prototype.slice.call(janela.querySelectorAll("input[name=edServico]")).map(function (c) {
        return { perfil_id: p.id, tipo: c.value, ativo: c.checked };
      });
      const existentes = servicos.filter(function (s) { return s.perfil_id === p.id; }).map(function (s) { return s.tipo; });
      const mudar = marcados.filter(function (m) { return m.ativo || existentes.indexOf(m.tipo) > -1; });
      if (mudar.length) {
        const { error } = await supa().from("servicos_contratados").upsert(mudar, { onConflict: "perfil_id,tipo" });
        if (error) { aviso("Não foi possível salvar os serviços.", true); return; }
      }
      janela.close();
      aviso("Alterações salvas.");
      carregarPessoas();
    } finally { botao.disabled = false; }
  });

  const btSenha = document.getElementById("edTrocarSenha");
  if (btSenha) {
    document.getElementById("edGerar").addEventListener("click", function () { document.getElementById("edSenha").value = gerarSenha(); });
    btSenha.addEventListener("click", async function () {
      const senha = document.getElementById("edSenha").value;
      if (senha.length < 8) { aviso("A nova senha precisa ter pelo menos 8 caracteres.", true); return; }
      const r = await chamarServidor({ acao: "redefinir_senha", perfil_id: editando.id, senha: senha });
      if (!r.ok) { aviso(r.erro, true); return; }
      aviso("Senha trocada. Envie a nova senha para " + editando.nome.split(" ")[0] + ".");
    });
  }

  /* ================= EMPRESAS ================= */
  function preencherDonos() {
    const sel = document.getElementById("empDono");
    const atual = sel.value;
    const clientes = perfis.filter(function (p) { return p.papel === "cliente" && p.ativo; });
    sel.innerHTML = '<option value="">Ninguém por enquanto</option>' +
      (master ? '<option value="' + eu.id + '">Eu mesmo (' + esc(eu.nome) + ")</option>" : "") +
      clientes.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + " (" + esc(p.email) + ")</option>"; }).join("");
    sel.value = atual;
    const add = document.getElementById("mbPessoa");
    add.innerHTML = clientes.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join("");
  }
  const empDono = document.getElementById("empDono");
  const empVisivel = document.getElementById("empVisivel");
  if (empVisivel) {
    empDono.addEventListener("change", function () { empVisivel.checked = empDono.value !== eu.id; });
  }

  async function carregarEmpresas() {
    const { data, error } = await supa().from("empresas")
      .select("id,nome,segmento,tipo,visivel_suporte,empresa_membros(perfil_id,funcao)").order("nome");
    if (error) { aviso("Não foi possível carregar as empresas.", true); return; }
    empresas = data || [];
    desenharEmpresas();
  }
  function desenharEmpresas() {
    const caixa = document.getElementById("listaEmpresas");
    if (!empresas.length) { caixa.innerHTML = '<p class="vazio">Nenhuma empresa cadastrada ainda. Cadastre a primeira acima.</p>'; return; }
    caixa.innerHTML = empresas.map(function (e) {
      const membros = (e.empresa_membros || []).map(function (m) {
        const p = porId(m.perfil_id);
        return esc(p ? p.nome : "Pessoa") + (m.funcao === "funcionario" ? " (funcionário)" : "");
      }).join(", ");
      return '<div class="cartao-empresa">' +
        "<b>" + esc(e.nome) + "</b>" +
        "<div>" + '<span class="selo">' + (e.tipo === "pessoal" ? "Orçamento pessoal" : "Empresa") + "</span>" +
        (e.segmento ? '<span class="selo">' + esc(e.segmento) + "</span>" : "") +
        (master && !e.visivel_suporte ? '<span class="selo ouro">Só você vê</span>' : "") + "</div>" +
        '<div class="vazio">Acesso: ' + (membros || "ninguém além da equipe") + "</div>" +
        '<div class="acoes">' +
        '<a class="btn auto" href="dre.html?e=' + e.id + '">Abrir DRE</a>' +
        '<button class="btn peq contorno" type="button" data-membros="' + e.id + '">Pessoas com acesso</button>' +
        (master ? '<button class="btn peq perigo" type="button" data-apagar="' + e.id + '">Apagar</button>' : "") +
        "</div></div>";
    }).join("");
  }
  document.getElementById("listaEmpresas").addEventListener("click", async function (ev) {
    const bm = ev.target.closest("[data-membros]");
    const ba = ev.target.closest("[data-apagar]");
    if (bm) abrirMembros(bm.dataset.membros);
    if (ba) {
      const e = empresas.find(function (x) { return x.id === ba.dataset.apagar; });
      if (!e) return;
      const conf = prompt('Isso apaga "' + e.nome + '" e TODOS os lançamentos dela, sem volta.\nPara confirmar, digite APAGAR:');
      if (conf !== "APAGAR") return;
      const { error } = await supa().from("empresas").delete().eq("id", e.id);
      if (error) { aviso("Não foi possível apagar.", true); return; }
      aviso("Empresa apagada.");
      carregarEmpresas();
    }
  });

  document.getElementById("formEmpresa").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const f = this;
    const botao = f.querySelector("button[type=submit]");
    const nome = f.nome.value.trim();
    if (nome.length < 2) { aviso("Escreva o nome da empresa.", true); return; }
    const registro = { nome: nome, segmento: f.segmento.value.trim() || null, tipo: f.tipo.value, visivel_suporte: master ? empVisivel.checked : true };
    botao.disabled = true;
    const { data, error } = await supa().from("empresas").insert(registro).select("id").single();
    if (error) { botao.disabled = false; aviso("Não foi possível cadastrar a empresa.", true); return; }
    if (empDono.value) {
      const r = await supa().from("empresa_membros").insert({ empresa_id: data.id, perfil_id: empDono.value, funcao: "dono" });
      if (r.error) aviso("Empresa criada, mas não foi possível dar acesso à pessoa.", true);
    }
    botao.disabled = false;
    f.reset();
    if (empVisivel) empVisivel.checked = true;
    aviso("Empresa cadastrada com o plano de contas pronto.");
    carregarEmpresas();
  });

  /* ---------- pessoas com acesso a uma empresa ---------- */
  const janelaMb = document.getElementById("janelaMembros");
  let empresaMb = null;
  function abrirMembros(id) {
    empresaMb = empresas.find(function (x) { return x.id === id; });
    if (!empresaMb) return;
    document.getElementById("mbTitulo").textContent = empresaMb.nome;
    desenharMembros();
    janelaMb.showModal();
  }
  function desenharMembros() {
    const lista = empresaMb.empresa_membros || [];
    document.getElementById("mbLista").innerHTML = lista.length ? lista.map(function (m) {
      const p = porId(m.perfil_id);
      return "<tr><td>" + esc(p ? p.nome : "Pessoa") + "</td><td>" + (m.funcao === "dono" ? "Dono(a)" : "Funcionário(a)") + "</td>" +
        '<td><button class="btn peq perigo" type="button" data-tirar="' + m.perfil_id + '">Tirar acesso</button></td></tr>';
    }).join("") : '<tr><td colspan="3" class="vazio">Ninguém além da equipe tem acesso.</td></tr>';
  }
  document.getElementById("mbLista").addEventListener("click", async function (ev) {
    const b = ev.target.closest("[data-tirar]");
    if (!b) return;
    const { error } = await supa().from("empresa_membros").delete().eq("empresa_id", empresaMb.id).eq("perfil_id", b.dataset.tirar);
    if (error) { aviso("Não foi possível tirar o acesso.", true); return; }
    empresaMb.empresa_membros = empresaMb.empresa_membros.filter(function (m) { return m.perfil_id !== b.dataset.tirar; });
    desenharMembros(); desenharEmpresas();
  });
  document.getElementById("mbAdicionar").addEventListener("click", async function () {
    const pessoa = document.getElementById("mbPessoa").value;
    const funcao = document.getElementById("mbFuncao").value;
    if (!pessoa) { aviso("Cadastre primeiro a pessoa como cliente, na aba Pessoas e acessos.", true); return; }
    const { error } = await supa().from("empresa_membros").upsert({ empresa_id: empresaMb.id, perfil_id: pessoa, funcao: funcao }, { onConflict: "empresa_id,perfil_id" });
    if (error) { aviso("Não foi possível dar o acesso.", true); return; }
    empresaMb.empresa_membros = (empresaMb.empresa_membros || []).filter(function (m) { return m.perfil_id !== pessoa; }).concat([{ perfil_id: pessoa, funcao: funcao }]);
    desenharMembros(); desenharEmpresas();
    aviso("Acesso liberado.");
  });
  document.getElementById("mbFechar").addEventListener("click", function () { janelaMb.close(); });

  await carregarPessoas();
  await carregarEmpresas();
})();
