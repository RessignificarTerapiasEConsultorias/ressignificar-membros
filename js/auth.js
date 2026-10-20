/* Funções de login/logout usadas por todas as páginas.
   Depende de: config.js (carregado antes) e do script do
   Supabase (carregado antes deste arquivo, em cada HTML). */

const PAINEL_DO_PAPEL = {
  master: "painel-master.html",
  suporte: "painel-suporte.html",
  cliente: "painel-cliente.html",
  vendedor: "painel-vendedor.html",
  profissional: "painel-profissional.html"
};

/* SEGURANÇA: o login fica guardado só na aba aberta (sessionStorage).
   Ao fechar a aba ou o navegador, o login é apagado e a pessoa precisa
   entrar de novo. Também apaga qualquer login antigo que tenha ficado
   salvo no armazenamento permanente (localStorage) por versões antigas. */
(function limparLoginAntigo() {
  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf("sb-") === 0) localStorage.removeItem(k);
    });
  } catch (e) {}
})();

let _cliente = null;
function supa() {
  if (!_cliente) {
    _cliente = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
  }
  return _cliente;
}

async function buscarPerfilLogado() {
  const { data: { user } } = await supa().auth.getUser();
  if (!user) return null;
  const { data, error } = await supa().from("perfis").select("id,nome,email,papel,ativo").eq("id", user.id).single();
  if (error || !data) return null;
  return data;
}

async function fazerLogin(email, senha) {
  const { error } = await supa().auth.signInWithPassword({ email, password: senha });
  if (error) {
    const msg = error.message.includes("Invalid login") ? "E-mail ou senha incorretos." : "Não foi possível entrar agora. Tente de novo em instantes.";
    return { ok: false, erro: msg };
  }
  const perfil = await buscarPerfilLogado();
  if (!perfil || !perfil.ativo) {
    await supa().auth.signOut();
    return { ok: false, erro: "Este acesso ainda não foi liberado. Fale com o Mauricio." };
  }
  return { ok: true, papel: perfil.papel };
}

async function sair() {
  await supa().auth.signOut();
  location.href = "index.html";
}

/* Chame isto no topo de cada painel-*.html, passando o papel
   que aquela página espera. Redireciona sozinho se a pessoa não
   estiver logada ou se o papel for outro. */
async function protegerPagina(papelEsperado) {
  const permitidos = Array.isArray(papelEsperado) ? papelEsperado : [papelEsperado];
  const { data: { session } } = await supa().auth.getSession();
  if (!session) { location.href = "index.html"; return null; }
  const perfil = await buscarPerfilLogado();
  if (!perfil || !perfil.ativo) { await sair(); return null; }
  if (permitidos.indexOf(perfil.papel) === -1) {
    location.href = PAINEL_DO_PAPEL[perfil.papel] || "index.html";
    return null;
  }
  document.querySelectorAll("[data-nome-usuario]").forEach(el => el.textContent = perfil.nome);
  document.querySelectorAll("[data-papel-usuario]").forEach(el => el.textContent = rotuloPapel(perfil.papel));
  document.querySelectorAll("[data-sair]").forEach(el => el.addEventListener("click", sair));
  document.getElementById("carregando")?.setAttribute("hidden", "");
  document.getElementById("painel")?.removeAttribute("hidden");
  return perfil;
}

function rotuloPapel(papel) {
  return { master: "Master", suporte: "Suporte", cliente: "Cliente", vendedor: "Vendedor(a)" }[papel] || papel;
}
