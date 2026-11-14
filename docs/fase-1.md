# Fase 1 — Conta e plano

## O que foi feito

**Núcleo (`core/`, testado):**
- `account/accountModel.ts` — porte do `AccountModel`: login PKCE pelo browser, código por e-mail, `/v1/me`, planos, dispositivos, consentimentos, exportar, apagar conta, checkout no site, tratamento dos links `learnlayer://`.
- `ai/backendClient.ts`, `ai/aiGateway.ts`, `account/appLogin.ts`, `account/homeRoute.ts` — já vinham da Fase 0.
- `notch/notchLayout.ts` — `WaveformLevels` e `NotchLayout`, com os testes de `NotchGlyphTests`.
- `platform.ts` — o que muda entre sistemas operativos (nome do dispositivo, prefixo dos atalhos). Os textos passam a ser escolhidos por plataforma: `translatorFor(língua, plataforma)`.

**Interface (`ui/`, vista no browser):**
- Janela principal: barra lateral, **Conta** (perfil, sessão, dispositivos, dados da conta) e **Plano e uso** (plano atual, barra de uso, três cartões, «Cobrado pela Paddle. O imposto está incluído.»).
- Folhas: início de sessão (cartão escuro com a mascote), consentimento, apagar conta, remover dispositivo.
- **Pílula** (`ui/pill.html`): preta, 180×32, abre para baixo ao passar o rato com os seis ícones do `NotchAction.catalog`; estados a ouvir / a falar com a onda.
- `ui/native.ts` é a única porta para o nativo; fora do Tauri responde com substitutos, para a interface correr num browser.
- `?demo=free|plus|pro|signedout` (só em desenvolvimento) mostra os ecrãs com respostas falsas, sem rede.

**Nativo (`src-tauri/`, ⚠️ escrito mas NÃO compilado nesta máquina — Smart App Control):**
- `session.rs` — tokens no cofre do sistema, refresh serializado (um `Mutex` assíncrono para todas as janelas), handoff PKCE. 9 testes.
- `api.rs` — refresh e logout.
- `platform/` — trait `Platform`; `platform/windows/` tem o Credential Manager, a pasta `%APPDATA%\LearnLayer`, o nome do computador e a janela da pílula (sem foco, fora do Alt-Tab).
- `tray.rs` — ícone na área de notificação com «Abrir janela», «Definições», «Sair do LearnLayer».
- `lib.rs` — instância única, deep link `learnlayer://`, comandos da sessão, fechar a janela esconde-a.

## Como verificar

```
npm test                       # 87 testes
npm run dev
#   http://localhost:1420/?demo=free        Conta e Plano com sessão
#   http://localhost:1420/?demo=signedout   sem sessão; «Usar um código por e-mail» abre a folha
#   http://localhost:1420/pill.html         a pílula (passa o rato)
```

Ao vivo (precisa do build nativo e de entrares na conta):

```
$env:LEARNLAYER_API_BASE  = "https://learnlayer-api-test.dinnisz.workers.dev"
$env:LEARNLAYER_SITE_BASE = "https://learnlayer-api-test.dinnisz.workers.dev"
npm run tauri dev
```

## Critérios de aceitação

| Critério | Estado |
|---|---|
| Entro, fecho e reabro a app e continuo dentro | ⛔ falta verificação do Dinis (build nativo bloqueado). A lógica está em `session.rs` com testes. |
| Vejo o plano e o uso iguais aos do Mac na mesma conta | ⛔ falta verificação do Dinis. Os ecrãs e o `/v1/me` estão testados com respostas simuladas. |
| Logout revoga a sessão | ⛔ falta verificação do Dinis. `session_sign_out` chama `/v1/auth/logout` e limpa o cofre. |
| Um segundo clique no link não abre segunda instância | ⛔ falta verificação do Dinis. `tauri-plugin-single-instance` com `deep-link`; no modelo, o segundo clique não troca o código outra vez (teste). |
