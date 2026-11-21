# Para o Dinis

O que só tu podes fazer. O código fica pronto com o valor em configuração e testado com mocks.

## Pendente

### 1. ✅ Resolvido a 2026-11-17: o Smart App Control bloqueava a compilação nativa
O Dinis desligou o Smart App Control (`VerifiedAndReputablePolicyState = 0`). Neste PC passam o `cargo fmt` e os 22 testes do Rust. O instalador corre, e a app instalada em `%LOCALAPPDATA%\LearnLayer` abre com a janela principal, o cartão de boas-vindas em pt-PT e a pílula centrada no topo. O texto abaixo fica como histórico.

**O que acontece.** O Smart App Control (SAC) do Windows 11 está ligado nesta máquina (`VerifiedAndReputablePolicyState = 1`). O Rust compila pequenos executáveis temporários (*build scripts*) e corre-os durante a build. O SAC bloqueia os que não conhece:

```
error: failed to run custom build command for `typeid v1.0.3`
  Uma política de Controlo de Aplicações bloqueou este ficheiro. (os error 4551)
```

Repeti a build e o bloqueio é o mesmo. O registo `Microsoft-Windows-CodeIntegrity/Operational` (eventos 3077/3033) confirma que foi o SAC.

**Atualização 2026-11-16:** o SAC passou a bloquear também o `rustfmt` (o formatador do Rust). Por isso o código Rust das fases 7–8 (comandos das chaves da memória, arranque com o Windows, atualizações) foi escrito e revisto à mão, sem verificação de formatação nem compilação. O CI (`cargo fmt --check`, `clippy`, `cargo test`) é o primeiro sítio onde vai ser verificado.

**O que isto trava.** Tudo o que é Rust: `cargo test`, `npm run tauri dev`, a janela real da app, a pílula, o tray, o Credential Manager, o deep link `learnlayer://`, o Alt-clique (hook, UI Automation, OCR), a voz do sistema e o instalador. A app compilada (`LearnLayer.exe`, sem assinatura) seria muito provavelmente bloqueada também.

**O que não trava.** O `core/` em TypeScript (lógica, prompts, verificação, testes) e a interface em React, que corre no browser com `npm run dev`. É nisso que continuo.

**Não mexi no SAC.** É uma definição de segurança tua, e desligá-la **não tem volta** sem reinstalar o Windows. As opções, por ordem do que eu faria:

1. **Compilar noutro sítio que não tenha SAC.** O mais simples é o CI: cria um repositório privado no GitHub, faz `git remote add origin …` e `git push -u origin main` (eu não faço push). O workflow `.github/workflows/ci.yml` corre `cargo test` e a build em `windows-latest`. Serve para os testes; não serve para experimentares a app nesta máquina.
2. **Uma máquina virtual ou outro PC de desenvolvimento** sem SAC (o Windows Sandbox e o Hyper-V não existem no Windows Home; o VirtualBox ou um PC antigo servem). Abres lá a pasta e escreves «continua».
3. **Desligar o SAC nesta máquina:** Definições › Privacidade e segurança › Segurança do Windows › Controlo de aplicações e browser › Definições do Smart App Control › Desativado. Fica desligado para sempre (só volta com uma reposição do Windows). O Defender e o SmartScreen continuam a funcionar.
4. **Assinatura de código** (ponto 5) resolve o bloqueio da app final para os alunos, mas não o dos build scripts durante o desenvolvimento.

Quando uma destas estiver feita, diz «continua» e eu retomo a parte nativa a partir de `docs/PROGRESSO.md`.

**Atualização 2026-11-16 (tarde):**
- O repositório privado [Dinnisz/learnlayer-windows](https://github.com/Dinnisz/learnlayer-windows) já existe e tem o `main`. Criei-o com o GitHub CLI depois de entrares na conta e de autorizares o push.
- O CI não arrancou. O GitHub recusou os trabalhos com «recent account payments have failed or your spending limit needs to be increased».
- **Causa (vista na página de faturação):** não há pagamento em falta. A conta é GitHub Free e os minutos grátis de novembro já se gastaram (12,46 USD de uso, quase todo do repositório do Mac, «LearnLayer»). Com o limite de gastos a 0 USD, o GitHub para os trabalhos em vez de cobrar.
- **Decisão: não pagar.** A 17/11 o Dinis tornou o repositório **público**, e o Actions é grátis e sem limite em repositórios públicos. O CI corre a cada push.

### 0. Trabalho do Mac que não está no GitHub (2026-11-20)
A cópia `referencia-mac/` que me deste tinha alterações que não estão em nenhum ramo do `Dinnisz/LearnLayer`: `TextHelp` v5 e `VoiceTutorPrompt` v24 (o `main` tem v4 e v23), a resposta a uma dúvida a partir da resolução no ecrã («explica o ponto 2»: `TextHelpContext.followUp(solution:step:)`, `StepRequest`, `SelectionAsk`) e `FollowUpAnswer` no `QuestionOverlay`. Juntei-as ao `main` na referência do Windows. Se forem para ficar, faz push desse ramo do Mac; se foram experiências, diz-me e volto ao `main`. A cópia antiga está em `referencia-mac-2026-11-05/`.

### 0a. Ctrl + Win não começa a ouvir (2026-11-20)
Com uma pergunta aberta no palco, mantém **Ctrl+Win** carregado um segundo e larga, duas ou três vezes. Depois abre `%APPDATA%\LearnLayer\talk-keys.jsonl` (funciona na app instalada e na de desenvolvimento). Cada linha tem só a hora e se a tecla estava premida.
- **Sem o ficheiro, ou sem linhas novas:** o Windows não deixa o gancho ver o Ctrl+Win neste teclado. Diz-me a marca do teclado ou do portátil, e experimenta em Definições › Geral a tecla **Ctrl direito**.
- **Com linhas:** o gancho vê as teclas e o problema está na interface. Na app de desenvolvimento (`npm run tauri dev`) também fica `talk-debug.jsonl`, com o que o palco tinha nesse momento. Manda-me os dois ficheiros.

### 0b. Cabeçalho `X-LearnLayer-Step` (painel de administração)
O servidor passou a ler `X-LearnLayer-Step` (`explain`, `hint`, `attempt`, `solution`, `other`) para o painel de administração (a0b88dd), mas nem o Mac (em 5701363) nem o Windows o enviam, por isso a coluna fica vazia. Se o quiseres, diz-me que valor cada pedido deve levar e ponho-o nos dois clientes (no Windows é uma linha em `core/ai/modelClient.ts`). O `X-LearnLayer-Continuation`, esse, já vai: na confirmação pelo modelo forte e na lição da mascote.

### 1b. Identidade dos commits
Os commits estão com `Dinis Santos <dinis@learnlayer.invalid>` (só na configuração local deste repositório), para não pôr um e-mail verdadeiro no histórico sem tu decidires. Antes do primeiro push: `git config user.email "o-teu@email"` e, se quiseres corrigir os commits antigos, `git rebase -r --root --exec "git commit --amend --no-edit --reset-author"`.

### 2. Segundo link de download (Windows) no site
A página `/download` lê `DOWNLOAD_URL`, que hoje é o do Mac. Para o Windows é preciso um segundo valor (por exemplo `DOWNLOAD_URL_WINDOWS`) e o botão correspondente na página. Mudança no backend/landing — não a fiz.

### 3. Modelo da transcrição rápida fora da lista do servidor
`qwen/qwen3.8-flash` não está na lista de modelos permitidos do Worker, por isso pelo backend sai Haiku. Para a transcrição rápida funcionar como no Mac em Debug, acrescenta o modelo à lista do plano em `backend/src/routing.ts`.

### 4. Conta de assinatura de código (Azure Trusted Signing)
Até existir, as builds não são assinadas e o SmartScreen avisa. Quando tiveres a conta:
1. Instala a ferramenta de assinatura: `cargo install trusted-signing-cli`.
2. Antes de correr `scripts\build-installer.ps1`, define estas variáveis na consola (nunca num ficheiro do repositório):
   - `AZURE_SIGNING_ENDPOINT` (por exemplo `https://weu.codesigning.azure.net`), `AZURE_SIGNING_ACCOUNT` e `AZURE_SIGNING_PROFILE`;
   - a identidade do Azure: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` e `AZURE_TENANT_ID`.
3. O script assina o `LearnLayer.exe` e o instalador. Sem estas variáveis, a build sai sem assinatura (só para testes).

### 5. URL de atualização automática
O código está pronto (`src-tauri/src/updates.rs`). A app procura uma versão nova ao arrancar e de 6 em 6 horas, descarrega-a e confirma a assinatura. Depois mostra «Reiniciar para atualizar» na janela principal. Sem configuração, não faz nenhum pedido. Para a ligar:
1. Gera o par de chaves das atualizações (uma vez): `npx tauri signer generate -w %USERPROFILE%\.tauri\learnlayer-updates.key`.
   Guarda a chave privada e a palavra-passe num sítio seguro: sem elas não podes publicar mais atualizações para quem já instalou.
2. Copia `src-tauri\tauri.updater.conf.example.json` para `src-tauri\tauri.updater.conf.json`. Nesse ficheiro:
   - em `pubkey`, cola o conteúdo do ficheiro `.pub`;
   - em `endpoints`, põe o URL HTTPS onde vais pôr o `latest.json` (por exemplo um bucket R2 da Cloudflare).
3. Antes da build, carrega a chave e a palavra-passe na consola:
   - `$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $env:USERPROFILE\.tauri\learnlayer-updates.key -Raw`
   - `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "…"`
4. Sobe o número da versão em `src-tauri\tauri.conf.json` e em `package.json`. Corre `scripts\build-installer.ps1`.
5. Põe no servidor o `*-setup.exe` e o `latest.json` que ficam em `dist\`. O instalador vai para a mesma pasta do `latest.json`, ou define `LEARNLAYER_DOWNLOAD_BASE` com outro sítio.

### 6. Entrar na conta no Worker de teste
Para verificar a Fase 1 ao vivo: abrir a app, «Sign in or create an account», entrar no browser. Os critérios que dependem disto ficam marcados «falta verificação do Dinis».

### 7. Experimentar o Alt-clique (Fase 4), quando a app compilar
Depende do ponto 1. Com a app aberta (`npm run tauri dev`):
1. Abre `referencia-mac/Tools/AnywhereProbe/quiz.html` no Chrome, carrega em **Alt** e clica numa pergunta. Deve abrir o palco por cima do Chrome com essa pergunta. O link por baixo não pode abrir e o menu do Chrome não pode aparecer quando largas o Alt.
2. Faz o mesmo num PDF de `exames/` aberto no Edge, no Acrobat Reader e no Word (um `.docx` qualquer com perguntas numeradas).
3. Em cada caso, preenche uma linha em `docs/anywhere-medicao.md`: o texto saiu completo? De onde veio («pdf», «text-range», «block», «region»: aparece em `%APPDATA%\LearnLayer\anywhere-log.jsonl`)? Quanto tempo demorou?
4. Com o palco aberto e o foco noutra app, **Esc** tem de o fechar.
5. **Ações da pílula:** passa o rato pela pílula no topo do ecrã.
   - «Capturar uma área»: o ecrã fica parado; arrasta um retângulo sobre uma pergunta e o palco abre-a. Esc cancela.
   - «Explicar o texto selecionado»: com texto selecionado no Edge ou no Word, abre a passagem com «Explicar / O que é pedido? / Dá-me uma dica». Sem nada selecionado, aparece «Seleciona primeiro algum texto.».
   - Com uma pergunta aberta, a pílula mostra só «Perguntar sobre este exercício».
6. Para a transcrição rápida em Debug (como no Mac): guarda a tua chave da OpenRouter no Gestor de Credenciais com
   `cmdkey /generic:LearnLayer.OpenRouter /user:openrouter /pass:<a chave>`.
   Numa build de release isto não é usado nunca. Cada chamada real fica em `docs/CUSTOS.md`.

### 8. Experimentar a voz (Fase 5), quando a app compilar
1. **Voz pt-PT do Windows**, para quando a voz premium não está ligada: Definições › Hora e idioma › Voz › Adicionar vozes › «Português (Portugal)». Sem ela, as respostas aparecem escritas em vez de faladas.
2. **Microfone:** na primeira vez que carregas em **Ctrl+Win**, o Windows pode perguntar se a app pode usar o microfone. Diz que sim, ou ativa-o em Definições › Privacidade e segurança › Microfone.
3. **«Explica-me»:** abre `exames/` (Matemática A) no leitor, escolhe uma pergunta, carrega em 3 e depois em «Explica-me». Confirma que a voz é de Portugal e que cada passo acende enquanto é dito.
4. **Tecla de falar:** mantém **Ctrl+Win**, diz «não percebi o passo 2» e larga. Deve ouvir-se logo «Vamos ao ponto 2.» e depois a resposta. Anota em `docs/DECISOES.md` quanto tempo passa entre largar a tecla e começar a ouvir-se.
5. **Custos:** com a voz premium desligada, confirma no Worker de teste que não há pedidos `/v1/audio/speech`.

### 9. Clipes de voz do onboarding para o Windows
Os clipes `onboarding_talk_*` e `onboarding_tryIt_*` do Mac falam de Control + Option e do ⌥-clique. No Windows esses dois ecrãs aparecem sem voz até haver gravações com as teclas do Windows. As frases estão em `scripts/onboarding-clips/lines.windows.json`, no mesmo estilo curto das do Mac:
- talk, pt: «Mantém premidas as teclas Ctrl e Windows, diz olá e larga.»
- talk, en: «Hold Ctrl and the Windows key together, say hi, then let go.»
- tryIt, pt: «Experimenta numa pergunta. Mantém a tecla Alt premida e clica.»
- tryIt, en: «Try it on a question. Hold the Alt key and click.»

Para as gravar com as mesmas vozes do Mac (Kokoro «af_heart» em en, grátis; «Joana» em pt, menos de 1 cêntimo):
1. `pip install kokoro-onnx soundfile keyring` e o `ffmpeg` no PATH (`winget install Gyan.FFmpeg`).
2. Descarrega `kokoro-v1.0.onnx` e `voices-v1.0.bin` (releases de `thewh1teagle/kokoro-onnx`) para `scripts/onboarding-clips/models/` (está no `.gitignore`).
3. `python scripts/onboarding-clips/generate.py en` e `python scripts/onboarding-clips/generate.py pt --cost-cap 0.05` (lê a chave da OpenRouter do Credential Manager, `LearnLayer.OpenRouter`; regista o custo em `docs/CUSTOS.md`).
4. Acrescenta `"talk_en", "tryIt_en", "talk_pt", "tryIt_pt"` a `windowsClips` em `core/onboarding/onboarding.ts`.

**Feito em inglês a 2026-11-19, neste PC** (Python 3.12, FFmpeg e os modelos do Kokoro instalados com a tua autorização): `onboarding_talk_windows_en.m4a` (3,8 s) e `onboarding_tryIt_windows_en.m4a` (2,9 s), já em `windowsClips`. **Falta o português:** `generate.py pt` custa menos de 1 cêntimo e precisa da tua autorização e de uma chave da OpenRouter no Credential Manager (`LearnLayer.OpenRouter`). Até lá, em português, esses dois ecrãs aparecem sem voz.

### 10. Gerar o instalador (quando houver uma máquina que compile, ponto 1)
**Feito a 2026-11-17 pelo CI:** `dist\LearnLayer_0.1.0_x64-setup.exe`, sem assinatura. Cada push para o `main` gera um novo, no artefacto «learnlayer-windows-installer» da corrida do CI. Para o trazer: `gh run download <id da corrida> --name learnlayer-windows-installer --dir dist`. Experimentado a 2026-11-17: o Smart App Control desta máquina **bloqueou o instalador** («Uma política de Controlo de Aplicações bloqueou este ficheiro») e nada foi instalado. Para o experimentar aqui é precisa a assinatura (ponto 4), ou usa outro PC.

Há duas formas de o gerar:
- numa máquina que compile, com `powershell -ExecutionPolicy Bypass -File scripts\build-installer.ps1`;
- no CI, que guarda o instalador sem assinatura como artefacto «learnlayer-windows-installer».

O instalador fica em `dist\LearnLayer_<versão>_x64-setup.exe`. Para ARM64:
1. `rustup target add aarch64-pc-windows-msvc`
2. `npx tauri build --bundles nsis --target aarch64-pc-windows-msvc`

Depois, num Windows limpo:
1. Instala e abre a app: deve aparecer o cartão de boas-vindas.
2. Segue a introdução até à pergunta de exemplo resolvida.
3. Liga «Abrir com o Windows» e reinicia: só devem aparecer a pílula e o ícone na área de notificação.

### 11. Mac: permissões, assinatura e notarização (2026-11-21)
**Permissões (cada Mac, uma vez):** ao abrir, a app pede a Acessibilidade e depois a Gravação de Ecrã.
1. Definições do Sistema › Privacidade e Segurança › Acessibilidade: arrasta a app para a lista e liga-a.
2. Privacidade e Segurança › Gravação de Ecrã e Áudio do Sistema: o mesmo. O macOS pede para «Sair e reabrir».
3. No macOS 15 aparece, uma vez por mês, «… is requesting to bypass the system private window picker»: «Permitir».
4. O microfone só vai funcionar depois de corrigido o ponto M1 do relatório (`docs/RELATORIO-MAC-2026-11-21.md`).

**Para distribuir aos alunos (só tu podes):**
1. Inscrição no Apple Developer Program (99 USD/ano), se ainda não tiveres.
2. Em developer.apple.com › Certificates, cria um certificado **Developer ID Application** e instala-o no Porta-chaves.
3. Cria uma palavra-passe específica da app em appleid.apple.com (para a notarização) e diz-me o Team ID.
   A palavra-passe nunca vai para o repositório: fica nos segredos do GitHub (`APPLE_ID`, `APPLE_PASSWORD`,
   `APPLE_TEAM_ID`, `APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE` em base64 e `APPLE_CERTIFICATE_PASSWORD`). O Tauri assina e notariza o `.app` e
   o `.dmg` com estes segredos.
4. O identificador da app será `si.learnlayer.LearnLayer.Desktop` até decidires se fica com o da app Swift
   (`si.learnlayer.LearnLayer`). Com o mesmo identificador e a mesma equipa, as permissões e as Chaves passam da Swift
   para esta app; com outro, os alunos dão as permissões outra vez.
5. Atualizações: o Sparkle da app Swift não serve. Será o atualizador do Tauri, com o URL do ponto 5.

**Para testar no teu Mac (já feito a 2026-11-21):** `~/Applications/LearnLayer Desktop.app`, assinada com «LearnLayer
Local Signing», com o servidor de teste em `~/Library/Application Support/LearnLayer Desktop/config.json`. A app Swift
(`~/Applications/LearnLayer.app`) não foi tocada. Não abras as duas ao mesmo tempo: o ⌥-clique responderia duas vezes.

## Etiquetas dos exames (Mac e Windows)
**Corrigido no Windows a 2026-11-19** (DECISOES): a numeração por grupo passou a ser decidida no documento todo, o grupo passa de página em página, os passos numerados de um procedimento já não contam como itens, e as partes numeradas em seguida («Parte A» 1–3, «Parte B» 4–6) ficam sem prefixo. Biologia: I.1–I.20, II.1–II.3, III.1–III.5. História: I.1–IV.5. Português: 1–7, II.1–II.7, III.1–III.2. O Mac ainda tem a regra antiga (só olha para uma página). Se quiseres as mesmas etiquetas nas duas apps, porta para o `QuestionDetector.swift` as funções `documentNumbering`, `sectionBefore` e `withoutNumberedLists` de `core/problems/questionDetector.ts`. Para ver o relatório:
```
EXAM_LABELS=1 npx vitest run scripts/exam-labels.test.ts --silent=false
```
