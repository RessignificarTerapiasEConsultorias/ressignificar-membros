/* Minha conta: dados opcionais do cadastro (endereço, CPF, profissão, estado civil). */
(async function () {
  const card = document.getElementById("cartaoDados"), form = document.getElementById("formDados");
  if (!card || !form) return;
  let uid = null;
  try {
    const { data: { session } } = await supa().auth.getSession();
    if (!session) return;
    uid = session.user.id;
    const r = await supa().rpc("perfil_dados_ler", { p_perfil: uid });
    if (!r.data || !r.data.ok) return;
    const d = r.data;
    document.getElementById("dEndereco").value = d.endereco || ""; document.getElementById("dProf").value = d.profissao || ""; document.getElementById("dEc").value = d.estado_civil || "";
    document.getElementById("dCpf").value = d.cpf ? d.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : "";
    card.hidden = false;
  } catch (e) { return; }
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const b = form.querySelector("button[type=submit]"); b.disabled = true;
    const r = await supa().rpc("perfil_dados_salvar", { p_perfil: uid, p_endereco: document.getElementById("dEndereco").value, p_cpf: document.getElementById("dCpf").value, p_profissao: document.getElementById("dProf").value, p_estado_civil: document.getElementById("dEc").value });
    b.disabled = false;
    if (r.error || !r.data || !r.data.ok) { aviso((r.data && r.data.erro && r.data.erro.indexOf("_") === -1 ? r.data.erro : "Não foi possível salvar."), true); return; }
    aviso("Dados salvos.");
  });
})();
