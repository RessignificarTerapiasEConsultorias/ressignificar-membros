/* Tela genérica de lançamento e listagem de um módulo personalizado, montada a partir dos campos definidos. */
(async function () {
  const eu = await protegerPagina(["master", "suporte", "cliente"]);
  if (!eu) return;
  const mid = new URLSearchParams(location.search).get("id");
  function falha(msg) { document.getElementById("falhaMsg").textContent = msg; document.getElementById("falha").hidden = false; }
  if (!mid) return falha("Nenhum módulo escolhido.");

  const rm = await supa().from("modulos_definicoes").select("*").eq("id", mid).maybeSingle();
  if (!rm.data) return falha("Este módulo não existe ou você não tem acesso a ele.");
  const modulo = rm.data;
  document.getElementById("voltar").href = "modulos.html?e=" + modulo.empresa_id;
  document.getElementById("tituloModulo").textContent = modulo.nome;
  document.getElementById("descModulo").textContent = modulo.descricao || "";
  document.getElementById("area").hidden = false;

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // monta o formulário a partir dos campos definidos
  const camposForm = document.getElementById("camposForm");
  camposForm.innerHTML = modulo.campos.map(function (c) {
    var input;
    if (c.tipo === "numero") input = '<input data-campo="' + c.chave + '" type="number" step="any">';
    else if (c.tipo === "data") input = '<input data-campo="' + c.chave + '" type="date">';
    else if (c.tipo === "selecao") input = '<select data-campo="' + c.chave + '"><option value="">—</option>' + (c.opcoes || []).map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</select>";
    else input = '<input data-campo="' + c.chave + '" type="text">';
    return "<div><label>" + esc(c.label) + "</label>" + input + "</div>";
  }).join("");

  document.getElementById("theadRegistros").innerHTML = "<tr>" + modulo.campos.map(function (c) { return "<th>" + esc(c.label) + "</th>"; }).join("") + "<th>Lançado em</th><th></th></tr>";

  async function carregarRegistros() {
    const r = await supa().from("modulos_registros").select("*").eq("modulo_id", mid).order("criado_em", { ascending: false });
    const registros = r.data || [];
    document.getElementById("listaRegistros").innerHTML = registros.length ? registros.map(function (reg) {
      return "<tr>" + modulo.campos.map(function (c) { return "<td>" + esc(reg.dados[c.chave] || "—") + "</td>"; }).join("") +
        "<td>" + dataBR(reg.criado_em.slice(0, 10)) + "</td>" +
        '<td><button class="btn peq perigo" type="button" data-del-reg="' + reg.id + '">Apagar</button></td></tr>';
    }).join("") : '<tr><td colspan="' + (modulo.campos.length + 2) + '" class="vazio">Nenhum lançamento ainda.</td></tr>';
  }
  document.getElementById("listaRegistros").addEventListener("click", async function (e) {
    const b = e.target.closest("[data-del-reg]"); if (!b) return;
    if (!confirm("Apagar este lançamento?")) return;
    await supa().from("modulos_registros").delete().eq("id", b.dataset.delReg);
    await carregarRegistros();
  });

  document.getElementById("formRegistro").addEventListener("submit", async function (e) {
    e.preventDefault();
    const dados = {};
    let faltou = false;
    modulo.campos.forEach(function (c) {
      const el = document.querySelector('[data-campo="' + c.chave + '"]');
      const v = el.value.trim ? el.value.trim() : el.value;
      if (v) dados[c.chave] = c.tipo === "numero" ? parseFloat(v) : v;
    });
    if (!Object.keys(dados).length) { aviso("Preencha pelo menos um campo.", true); return; }
    const b = this.querySelector("[type=submit]"); b.disabled = true;
    const r = await supa().from("modulos_registros").insert({ modulo_id: mid, dados: dados, criado_por: eu.id });
    b.disabled = false;
    if (r.error) { aviso("Não foi possível lançar.", true); return; }
    aviso("Lançamento registrado!");
    this.reset();
    await carregarRegistros();
  });

  await carregarRegistros();
})();
