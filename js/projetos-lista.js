/* Lista de projetos de melhoria: criar e filtrar. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  const gestor = eu.papel !== "cliente";
  document.getElementById("voltar").href = PAINEL_DO_PAPEL[eu.papel];
  if (!gestor) document.querySelectorAll(".so-gestor").forEach(function (el) { el.remove(); });
  if (eu.papel !== "master") document.querySelectorAll(".so-master").forEach(function (el) { el.remove(); });

  const ETAPA_LABEL = { P: "Planejar", D: "Fazer", C: "Checar", A: "Agir" };
  const ETAPA_COR = { P: "", D: "amarelo", C: "laranja", A: "verde" };
  let projetos = [], perfisClientes = [], filtro = "ativo";

  async function carregar() {
    const [rp, rc] = await Promise.all([
      supa().from("projetos_melhoria").select("*").order("criado_em", { ascending: false }),
      gestor ? supa().from("perfis").select("id,nome,servicos_contratados(tipo)").eq("papel", "cliente").eq("ativo", true).order("nome") : Promise.resolve({ data: [] })
    ]);
    projetos = rp.data || [];
    perfisClientes = (rc.data || []).filter(function (p) { return (p.servicos_contratados || []).some(function (s) { return s.tipo === "consultoria_empresarial" || s.tipo === "mentoria"; }); });
  }

  function preencherClientes() {
    const sel = document.getElementById("npCliente");
    if (sel) sel.innerHTML = perfisClientes.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + "</option>"; }).join("");
  }

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function cartaoProjeto(p) {
    return '<div class="sessao"><div class="sessao-topo"><b>' + esc(p.titulo) + '</b>' +
      '<span class="selo ' + ETAPA_COR[p.etapa_atual] + '">' + ETAPA_LABEL[p.etapa_atual] + " · Ciclo " + p.ciclo_atual + '</span></div>' +
      (p.indicador_nome ? '<span class="acao-info">Indicador: ' + esc(p.indicador_nome) + (p.linha_base_valor !== null ? " · atual " + p.linha_base_valor : "") + (p.meta_valor !== null ? " · meta " + p.meta_valor : "") + '</span>' : "") +
      '<div class="acoes" style="margin-top:8px"><a class="btn peq" href="projeto.html?id=' + p.id + '">Abrir projeto</a></div></div>';
  }
  function desenharLista() {
    document.querySelectorAll("#filtroStatusProjeto [data-f]").forEach(function (b) { b.style.borderColor = b.dataset.f === filtro ? "#C9A24A" : ""; b.style.background = b.dataset.f === filtro ? "#FBF3DF" : ""; });
    const lista = projetos.filter(function (p) { return filtro === "todos" || p.status === filtro; });
    document.getElementById("listaProjetos").innerHTML = lista.length ? lista.map(cartaoProjeto).join("") : '<div class="cartao"><p class="vazio">Nenhum projeto nesta lista.</p></div>';
  }
  document.getElementById("filtroStatusProjeto").addEventListener("click", function (e) { const b = e.target.closest("[data-f]"); if (b) { filtro = b.dataset.f; desenharLista(); } });

  const form = document.getElementById("formNovoProjeto");
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const titulo = document.getElementById("npTitulo").value.trim();
      if (titulo.length < 4) { aviso("Escreva o título do projeto.", true); return; }
      const selCli = document.getElementById("npCliente");
      const perfilAlvo = selCli ? selCli.value : eu.id;
      if (!perfilAlvo) { aviso("Escolha o cliente.", true); return; }
      const reg = {
        perfil_id: perfilAlvo, titulo: titulo, indicador_nome: document.getElementById("npIndicador").value.trim() || null,
        linha_base_valor: lerValor(document.getElementById("npLinhaBase").value), meta_valor: lerValor(document.getElementById("npMeta").value),
        criado_por: eu.id
      };
      const b = this.querySelector("[type=submit]"); b.disabled = true;
      const r = await supa().from("projetos_melhoria").insert(reg).select().single();
      b.disabled = false;
      if (r.error) { aviso("Não foi possível criar o projeto.", true); return; }
      // charter vazio já criado para edição posterior
      await supa().from("projetos_charter").insert({ projeto_id: r.data.id });
      aviso("Projeto criado!");
      location.href = "projeto.html?id=" + r.data.id;
    });
  }

  await carregar();
  preencherClientes();
  desenharLista();
})();
