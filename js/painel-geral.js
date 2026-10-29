/* Painel geral: renda e gastos de cada empresa da pessoa, pró-labore, outras rendas pessoais e a meta.
   Usado em orcamentos.html (Mauricio) e dentro do DRE (dono da empresa aberta). */
function renderPainelGeral(container, perfilId) {
  container.innerHTML = '<p class="vazio">Carregando...</p>';
  supa().rpc("financeiro_painel_geral", { p_perfil: perfilId || null }).then(function (r) {
    if (r.error || !r.data || !r.data.ok) { container.innerHTML = '<p class="vazio">Não foi possível carregar o painel geral.</p>'; return; }
    const d = r.data, empresas = d.empresas || [], pessoal = d.pessoal, meta = d.meta || {};
    const cartao = function (titulo, valor, cls, nota) {
      return '<div class="kpi"><small>' + esc(titulo) + '</small><b' + (cls ? ' class="' + cls + '"' : '') + '>' + brl(valor) + '</b>' + (nota ? '<span>' + esc(nota) + '</span>' : '') + '</div>';
    };
    let html = '<div class="kpis">';
    empresas.forEach(function (e) {
      html += cartao("Renda do mês (" + e.nome + ")", e.renda, "v-receita");
      html += cartao("Gastos do mês (" + e.nome + ")", e.gastos, "v-saida", "lucro líquido: " + brl(e.lucro_liquido));
    });
    if (pessoal) {
      html += cartao("Pró-labore recebido (" + pessoal.nome + ")", pessoal.pro_labore, "v-receita", "saiu da empresa, entrou aqui");
      html += cartao("Outras rendas pessoais", pessoal.outras_rendas, "v-receita");
      html += cartao("Gastos pessoais", pessoal.gastos, "v-saida");
    }
    const totalRenda = empresas.reduce(function (s, e) { return s + (+e.renda); }, 0) + (pessoal ? +pessoal.pro_labore + +pessoal.outras_rendas : 0);
    const totalGasto = empresas.reduce(function (s, e) { return s + (+e.gastos); }, 0) + (pessoal ? +pessoal.gastos : 0);
    html += cartao("Lucro líquido total do mês", totalRenda - totalGasto, totalRenda - totalGasto >= 0 ? "v-receita" : "v-saida", "soma de empresas e pessoal");
    if (meta.valor) {
      const pct = meta.valor > 0 ? Math.round((meta.realizado / meta.valor) * 100) : 0;
      html += cartao("Meta do mês", meta.realizado, "v-pendente", pct + "% de " + brl(meta.valor));
    }
    html += "</div>";
    if (!empresas.length && !pessoal) html = '<p class="vazio">Nenhuma empresa ou conta pessoal cadastrada para esta pessoa ainda.</p>';
    container.innerHTML = html;
  }).catch(function () { container.innerHTML = '<p class="vazio">Não foi possível carregar o painel geral.</p>'; });
}
