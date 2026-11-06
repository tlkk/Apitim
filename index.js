import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// Pega as variáveis de ambiente (se não tiver, usa os valores fixos pra testar local)
const EMAIL = process.env.EMAIL || "";
const SENHA = process.env.SENHA || "";
const API_AZURE = "https://prd-server-martim-app.kindcoast-0cb92a3a.eastus.azurecontainerapps.io/api/soap/linha-geral/";

let bearerToken = null;
let tokenExpiraEm = 0;

async function fazerLogin() {
    const headersNav = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };

    const resToken = await fetch('https://martim.powerappsportals.com/_layout/tokenhtml', { headers: headersNav });
    const htmlToken = await resToken.text();
    const csrfMatch = htmlToken.match(/name="__RequestVerificationToken".*?value="([^"]+)"/);
    const csrf = csrfMatch ? csrfMatch[1] : null;
    const cookiesIniciais = resToken.headers.getSetCookie ? resToken.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') : '';

    const payload = new URLSearchParams();
    payload.append('__RequestVerificationToken', csrf);
    payload.append('Username', EMAIL);
    payload.append('PasswordValue', SENHA);
    payload.append('RememberMe', 'false');
    payload.append('ReturnUrl', '/');

    const resLogin = await fetch('https://martim.powerappsportals.com/SignIn', {
        method: 'POST',
        headers: { ...headersNav, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookiesIniciais, 'Referer': 'https://martim.powerappsportals.com/' },
        body: payload.toString(),
        redirect: 'manual'
    });

    const cookiesLogin = resLogin.headers.getSetCookie ? resLogin.headers.getSetCookie().join('; ') : '';

    const resJwt = await fetch('https://martim.powerappsportals.com/_services/auth/token', {
        method: 'POST',
        headers: { 'Cookie': cookiesLogin, ...headersNav }
    });
    const textoJwt = await resJwt.text();
    let jwtData;
    try { jwtData = JSON.parse(textoJwt); } catch { jwtData = { token: textoJwt }; }
    
    bearerToken = jwtData.token || jwtData.access_token || textoJwt;
    tokenExpiraEm = Date.now() + (50 * 60 * 1000); 
}

// Rota pra testar se a API tá online
app.get('/', (req, res) => {
    res.json({ status: "online", message: "API TIM no Koyeb!" });
});

app.get('/consulta/:numero', async (req, res) => {
    let gsm_limpo = req.params.numero.replace(/\D/g, '');
    if (!gsm_limpo.startsWith('55')) gsm_limpo = '55' + gsm_limpo;

    try {
        if (!bearerToken || Date.now() > tokenExpiraEm) {
            await fazerLogin();
        }

        const consultarAPI = async () => {
            return await fetch(`${API_AZURE}${gsm_limpo}`, {
                headers: {
                    "Authorization": `Bearer ${bearerToken}`,
                    "Accept": "application/json",
                    "Origin": "https://martim.powerappsportals.com",
                    "Referer": "https://martim.powerappsportals.com/"
                }
            });
        };

        let r_dados = await consultarAPI();

        if (r_dados.status === 401) {
            await fazerLogin();
            r_dados = await consultarAPI();
        }

        const dados = await r_dados.json();

        if (dados.success && dados.data) {
            res.json({ success: true, data: dados.data });
        } else {
            res.status(404).json({ success: false, error: "Número não encontrado." });
        }

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: "Erro interno no servidor." });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API rodando na porta ${PORT}`);
});
