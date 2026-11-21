# Relatório do teste ao vivo no Mac (2026-11-21)

App comum (Tauri) no MacBook Air do Dinis (macOS 15.6, ecrã de 60 Hz com notch), ramo `feat/macos-native`.
Instalada como `~/Applications/LearnLayer Desktop.app` (compilação Debug, `npx tauri build --debug --bundles app`,
assinada com «LearnLayer Local Signing»), com as permissões de Acessibilidade e Gravação de Ecrã dadas pelo Dinis e
sessão iniciada na conta dele (servidor de teste). Nada foi corrigido: este relatório só regista (pedido do Dinis).
As capturas estão em `docs/capturas-mac/`.

Como foi testado: cliques, teclas e arrastos sintéticos (CGEvent) e capturas de ecrã a tempos fixos. Nota sobre o
método: a meio do teste a tecla ⌥ ficou «presa» no estado do sistema por causa da ferramenta de teste (não da app),
o que fez os cliques seguintes parecerem ⌥-cliques. Foi libertada e os passos afetados foram repetidos.

Gravidade: **bloqueia lançamento** · **importante** · **pequeno**.

## Os 5 mais importantes

1. A resposta certa em «Let me try» é dada como errada (M3).
2. A voz não funciona no Mac: falta `NSMicrophoneUsageDescription` no Info.plist (M1).
3. A app instalada aponta para o site de produção, que ainda não existe, e entrar na conta falha (M2).
4. Definições e onboarding falam de Windows: «Ctrl + Win», «Alt», «Start with Windows», «Windows UI Automation», o passo
   das permissões vazio (M4, M5).
5. O palco demora o dobro da app Swift a abrir (1,3–2,0 s contra 0,5–1,0 s) e o fundo fica quase opaco em vez de
   «escurece e desfoca ligeiramente» (I1, I2).

## Bloqueia lançamento

### M1. Microfone recusado sem pergunta (voz e tecla de falar)
- **O que acontece:** segurar Control+Option mostra «LearnLayer needs the microphone. Allow it in System Settings ›
  Privacy & Security › Microphone.», mas o macOS nunca mostra o pedido e a app não aparece na lista do Microfone.
- **Reproduzir:** app instalada → segurar Control+Option 2 s.
- **Causa:** o `Info.plist` do bundle não tem `NSMicrophoneUsageDescription` (nem `NSSpeechRecognitionUsageDescription`).
  A app Swift tem as duas. Sem a chave, o macOS recusa logo.
- **Ficheiro provável:** criar `src-tauri/Info.plist` (o Tauri junta-o ao do bundle no macOS) com as duas chaves, com os
  mesmos textos da app Swift. Ver também `src-tauri/tauri.macos.conf.json`.
- A tecla em si funciona: `talk-keys.jsonl` regista held:true/false e o palco reage.

### M2. Entrar na conta abre `learnlayer.app/login` («Safari can't find the server»)
- **O que acontece:** «Sign in» abre o Safari num endereço que não existe.
- **Causa:** a app instalada usa os valores de produção de `src-tauri/src/config.rs` (`https://learnlayer.app`). A app
  Swift instalada usa o servidor de teste através de `LSEnvironment`.
- **Contornado para o teste** sem mexer no código: `~/Library/Application Support/LearnLayer Desktop/config.json` com
  `LEARNLAYER_API_BASE` e `LEARNLAYER_SITE_BASE` = `https://learnlayer-api-test.dinnisz.workers.dev`. Depois disso,
  entrar funcionou.
- **Sugestão:** um `Tools/install-local-mac.sh` para a app Tauri que escreva esse `config.json` (ou `LSEnvironment`) e
  assine; quando o site existir, nada a fazer.

### M3. «Let me try»: resposta certa marcada como errada
- **O que acontece:** na pergunta «carro parte do repouso com a = 2 m/s²; distância em 5 s», a resposta `25 m` (certa:
  ½·2·5² = 25 m) dá «Not yet: it differs from the expected result.» (captura 16).
- **Reproduzir:** Safari, `pergunta.html`, capturar a área da pergunta 2 → 2 (Let me try) → escrever `25 m` → Enter.
- **Ficheiro provável:** `core/problems/questionSession.ts` (verificação da tentativa). Suspeita: a unidade «m» é lida
  como variável (25·m ≠ 25). Sugestão: tirar as unidades do SI no fim da resposta antes de comparar, ou comparar só o
  número quando o resultado esperado tem unidades. Acrescentar um teste com `25 m`, `25m` e `25`.
- Regra do projeto: «nunca mostrar matemática errada». Dizer «errado» a uma resposta certa é pior.

## Importante

### M4. Definições com textos do Windows
- **Permissions** (captura 04): «Windows asks the first time you hold the talk key…», «The Alt-click hook», «Text is
  read through Windows UI Automation». Faltam as linhas do Mac: Acessibilidade e Gravação de Ecrã, com o estado e um
  botão para abrir cada página das Definições do Sistema.
- **General** (capturas 05 e 17): Talk key «Ctrl + Win»; «Lets Alt-click…»; «Ctrl + Shift + Space»; «Start with
  Windows / when you sign in to Windows»; atalhos «Alt + Click».
- **Ficheiros:** `ui/windows/main/panes/PermissionsPane.tsx`, `ui/windows/main/panes/GeneralPane.tsx`, `ui/native.ts`
  (nomes das teclas). Sugestão: escolher os textos por `usePlatformName()`, como o onboarding já faz em parte, e no Mac
  usar ⌥, ⌃⌥ e «Open at login».

### M5. Onboarding com teclas do Windows e passo das permissões vazio
- «This is how you talk to me» diz Control+Option mas desenha as teclas «Ctrl» e «Win» (captura 19).
- «Try it on a question» desenha «Alt» em vez de ⌥ (captura 21).
- O passo seguinte ao da fala («Once you allow it in the next step…») aparece **vazio**, só com Continue (captura 20).
  No Mac era aí que se pediam Acessibilidade e Gravação de Ecrã.
- **Ficheiro:** `ui/onboarding/OnboardingCard.tsx` (l. ~377 «Not on the Windows path», l. ~567 `Keycap symbol="Win"`),
  `core/onboarding`. Sugestão: no Mac, mostrar o ecrã de permissões portado da app Swift (OnboardingPermissions), com
  os dois pedidos e o estado de cada um.

### I1. O palco demora mais a abrir do que na app Swift
- ⌥-clique na pergunta 2 do exame no Pré-visualização: app Tauri 1,3–2,0 s até o palco aparecer; app Swift
  0,5–1,0 s (capturas 02 e 22, mesmo ponto e mesmo PDF).
- **Ficheiros:** `src-tauri/src/platform/macos/anywhere.rs` (`read_click`: imagem da janela com `screencapture`, OCR
  Vision e leitura do PDF em série) e `overlay.rs` (`hide_for_reading` dorme 40 ms). Sugestão: mostrar o palco (o
  «Reading…» e o fundo) logo no clique e preencher depois; correr a imagem/OCR em paralelo com a leitura de
  Acessibilidade; numa leitura `pdf`, não esperar pelo OCR.
- Regra do projeto: «os cliques têm de parecer instantâneos».

### I2. Fundo do palco quase opaco
- A página por trás fica quase invisível (capturas 02, 08, 10). Na app Swift vê-se a página escurecida e um pouco
  desfocada (captura 22), como pede o CLAUDE.md («escurece e desfoca ligeiramente»).
- **Ficheiro:** `src-tauri/src/platform/macos/overlay.rs` (`NSVisualEffectMaterial::HudWindow`). Sugestão: material
  mais leve (ex.: `.underWindowBackground`/`.fullScreenUI`) com um véu preto ~35 %, ou o mesmo material da app Swift.

### I3. A app rouba o primeiro plano ao abrir o palco
- Com o palco aberto, a barra de menus passa a «LearnLayer» (File, Edit, View…). Na app Swift continua «Preview»,
  porque o palco é um `NSPanel` não ativador. Efeito: o ⌘-Tab e os menus mudam; ao fechar, o foco volta (Esc testado
  e funciona).
- **Ficheiros:** `overlay.rs` (`set_interactive` chama `set_focus`), `NotchPill.swift`/`Bridge.swift`. Sugestão: tornar
  a janela do palco um painel `nonactivatingPanel` que aceita o teclado (`becomesKeyOnlyIfNeeded`), como
  `AnywhereController.StagePanel`.

### I4. O primeiro clique numa janela inativa perde-se
- Na pílula, o primeiro clique numa ação (ex.: «Capture an area») só traz a app para a frente; é preciso um segundo
  clique. O mesmo na janela principal e no leitor quando estão atrás de outra app.
- **Ficheiros:** `NotchPill.swift` (o `WKWebView` não aceita o primeiro clique). Sugestão: subclasse/`acceptsFirstMouse`
  na vista web da pílula e do palco (o Tauri tem `accept_first_mouse(true)` no `WebviewWindowBuilder`).

### I5. Reabrir a app não mostra a janela principal
- Com a app aberta e a janela principal atrás do Safari, `open "LearnLayer Desktop.app"` (o mesmo que clicar no
  ícone da Dock) não a traz para a frente. Só a ação «Open window» da pílula o faz.
- **Ficheiro:** `src-tauri/src/lib.rs` (tratar `RunEvent::Reopen` no macOS: mostrar e focar a janela `main`).

### I6. Pergunta de uma página web: só barras cinzentas durante 5 s ou mais
- ⌥-clique no Safari: o palco mostra três barras cinzentas no lugar da pergunta até a transcrição chegar (> 5 s,
  captura 13). Com o PDF, a pergunta aparece logo (lida do texto do PDF).
- **Ficheiros:** `ui/stage/Stage.tsx`, `core/anywhere`. Sugestão: mostrar já o recorte da imagem da janela (a app
  Swift e o Windows têm-no em `picture`) e trocar pela versão tipografada quando chegar.

### I7. A primeira transcrição perde o expoente («2 m/s» em vez de «2 m/s²»)
- «Capture an area» na pergunta 2: a primeira versão mostra «2 m/s.» (captura 15); segundos depois aparece «m/s²».
  Durante esse tempo a pergunta está matematicamente errada.
- **Ficheiros:** transcrição rápida (`core/problems/fastTranscription.ts`, `core/problems/questionTranscription.ts`) e o texto do OCR Vision usado
  como rascunho (`ScreenGrab.swift` não lê expoentes). Sugestão: não mostrar o rascunho do OCR quando tem unidades
  com expoente possível, ou mostrar logo o recorte (I6).

### I8. Leitor de PDF: o clique numa equação apanha só metade
- No leitor próprio, clicar no somatório da pergunta 2 abre «= n(n+1)/4, n ∈ ℕ» (sem o Σ do lado esquerdo) e um menu
  de função (Graph, Zeros, Derivative…) que não faz sentido para uma afirmação de indução (captura 24).
- **Ficheiros:** `core/explanation` (deteção da equação a partir do clique) e o menu de estudo. Sugestão: juntar as
  linhas da mesma equação exibida (Σ com limites em cima e em baixo) e, quando não há função de x, não mostrar o menu de
  função.

### I9. Explicações em inglês para um exame em português
- Pistas, resolução e passos vieram em inglês (capturas 08–10, 14), apesar de o exame estar em português. A língua da
  interface está em «Same as the Mac» (inglês). Na app Swift, o texto do modelo segue a língua da pergunta.
- Também os títulos do lado direito mudam de língua entre pistas («Princípio de Indução Matemática» e depois
  «Principle of induction»).
- **Ficheiros:** prompts em `core/problems` / `core/ai`. Sugestão: pedir ao modelo a língua da pergunta, ou a escolhida
  no onboarding.

### I10. Resolução comprida sai do ecrã
- Na resolução da pergunta 2 a «Conclusion» fica cortada à direita e o resto continua abaixo do fundo do ecrã, sem
  forma visível de descer (captura 11). A pergunta encolhe muito.
- **Ficheiros:** `ui/stage/Stage.tsx` e o layout do palco. Sugestão: quebrar equações largas e deixar o painel rolar.

### I11. Pista demora 16–25 s com «Solving…» parado
- Depois de «Give me a hint» só aparece «Solving…» durante 16–25 s (captura 07). Sugestão: mostrar a primeira pista
  assim que chegar (streaming), ou uma pista curta de um modelo rápido.

## Pequeno

- **P1.** Documentos: o nome aparece com extensão dupla, «teste1a-CDI-1s-2526.pdf.pdf», e «1 documents» (plural)
  (captura 06). `ui/windows/main/panes/DocumentsPane.tsx`.
- **P2.** Documentos: as linhas dos recentes não abrem nada ao clicar. Deviam abrir o PDF no leitor.
- **P3.** «2 questions asked» não conta as perguntas feitas depois (hint, solução, Safari).
- **P4.** Memória: o mapa tem uma só bolha com o texto cortado «2 usando o princípio».
- **P5.** Unidades em itálico na resposta («9 *J*», «3 *m/s*»): devem ser direitas (`\mathrm{}`).
- **P6.** «Your answer» em fonte mono, diferente do resto do palco.
- **P7.** Documents › Open… abre primeiro um leitor vazio («Open a PDF to get started») e só depois o diálogo; mais um
  clique do que o necessário. No diálogo, o teclado só funciona depois de clicar dentro dele.
- **P8.** A pílula mostra a disciplina com nomes diferentes na mesma pergunta («Mathematics» e depois «Calculus»).
- **P9.** Conta: a lista de dispositivos repete o mesmo Mac várias vezes («macbook-air-de-dinis.local» três vezes).
- **P10.** O macOS 15 mostra «… is requesting to bypass the system private window picker…» na primeira imagem de
  janela (captura 01). A app Swift faz o mesmo (também usa `/usr/sbin/screencapture`). A longo prazo,
  `SCScreenshotManager` (ScreenCaptureKit) evita o aviso mensal.

## O que funciona bem

- ⌥-clique no Pré-visualização: a pergunta é lida do próprio PDF (método `pdf`), com a matemática certa (Σ, frações,
  ℕ). No Safari também lê a pergunta certa. Chrome não está instalado neste Mac, por isso não foi testado.
- Esc fecha o palco e devolve o teclado à app de onde veio.
- Teclas 1–4 e Enter (seguinte) no palco.
- Pista, segunda pista, resolução com passos, «Explain It to Me» com a mascote a percorrer e realçar os passos, e as
  fórmulas do lado direito, tudo com a conta do Dinis.
- Resolução da pergunta de física (9 J) correta.
- «Capture an area»: escurece o ecrã, arrasta-se a área e o palco abre com a pergunta em cerca de 3 s.
- Pílula no notch: envolve o notch, abre ao passar o rato mesmo com outra app à frente e fecha ao sair; as ações
  «Open window», «Capture an area» e «Documents» funcionam (com o I4).
- Janela principal: Memória, Documentos, Conta (entrar, dispositivos), Plano e uso, Geral, Permissões, IA, Dados e
  privacidade abrem todas.
- Leitor de PDF próprio: abre e desenha o exame com nitidez.
- Onboarding: os 9 passos navegam com Continue; escolha de língua, cor da mascote e plano.
- Memória da app em repouso (3 janelas): processo principal ~104 MB, mais ~232 MB nos 5 processos WebKit (~336 MB no
  total). Pegada física do processo principal: 32 MB.
- Fluidez a 120 Hz: não testável, porque o ecrã deste Mac é de 60 Hz. A 60 Hz, a pílula e o palco animam sem saltos
  visíveis nas capturas.

## Não testado

- Voz falada e a ouvir (bloqueado por M1). A reprodução da voz premium na lição não foi ouvida, porque o teste não tem
  som.
- Chrome (não instalado).
- Mais exames do projeto Mac: só o CDI de `~/Downloads` e a página `pergunta.html`.

## Correções feitas depois (2026-11-21, sessão do Windows)

Corrigido no código comum. Os testes passam no Windows; o que é do Mac falta experimentar num Mac.

| Ponto | O que mudou | Onde |
|---|---|---|
| M3 | «Let me try» aceita unidades («25 m», «2,5 m/s²»), vírgula decimal, «v = 22» e expoentes em sobrescrito. Uma unidade só sai quando a resposta esperada não usa esse nome. As equações diferenciais aceitam qualquer solução, como no Swift. A «pergunta semelhante» também aceita unidades. | `core/problems/typedAnswer.ts`, `questionSession.ts` |
| M1 | `src-tauri/Info.plist` com `NSMicrophoneUsageDescription` e `NSSpeechRecognitionUsageDescription`; `Entitlements.plist` com `audio-input` (para a assinatura com hardened runtime). | `tauri.macos.conf.json` |
| M4 | Tabela de textos do Mac para as frases escritas para o Windows: «Control + Option», «Open at login», «⌥-click», «macOS Accessibility». As frases novas (disciplinas, créditos, menu de estudo) e os plurais passam a valer nos dois sistemas: no Mac em português já não aparecem chaves em inglês. Geral: no Mac só há Control + Option e o botão do microfone, e não aparece a linha do Ctrl + Shift + Espaço. Permissões no Mac: Acessibilidade, Gravação de Ecrã e Microfone, com o estado lido a cada 1,5 s e um botão que pede ou abre as Definições do Sistema. | `core/i18n/macos/`, `core/i18n/shared/`, `GeneralPane.tsx`, `PermissionsPane.tsx`, `Platform::permissions` |
| M5 | Onboarding no Mac: teclas ⌃ e ⌥ e atalho Control+Option na própria janela; o passo das permissões tem as duas permissões, com estado e botão «Open». | `ui/onboarding/OnboardingCard.tsx` |
| I5 | `RunEvent::Reopen` mostra a janela principal (ícone da Dock). | `src-tauri/src/lib.rs` |
| I6, I7 | Enquanto o modelo lê uma pergunta do ecrã, o palco mostra logo o recorte da pergunta, e não barras nem o rascunho do OCR, que perdia expoentes. | `ui/stage/Stage.tsx` (`ScreenQuestionView`) |
| I8 | Meia equação («= n(n+1)/4, n ∈ ℕ») ou uma afirmação com Σ/∈/ℕ já não abre o menu de função. Juntar as linhas da equação exibida continua por fazer. | `core/explanation/studyAction.ts` |
| I9 | Com a língua «igual ao sistema», a resposta segue a língua da pergunta: um exame em português é explicado em português num computador em inglês. Isto vale para a resolução, a ajuda, a lição e a voz. Uma escolha explícita nas Definições continua a mandar. | `TutorLanguage.forQuestion` |
| I10 | As fórmulas largas encolhem até caberem (no mínimo 72 %). Quando a resolução passa do fundo da janela, aparece um botão «Mais abaixo». | `ui/components/Math.tsx`, `ScrollCue` |
| P1 | Sem «.pdf.pdf»; plurais certos («1 document»). | `Stage.tsx`, `DocumentsPane.tsx`, `core/i18n/shared/` |
| P5 | As unidades na caixa da resposta aparecem direitas («9 J»). | `core/math/units.ts` |
| P6 | O campo «Your answer» usa a fonte do palco, com algarismos de largura fixa. | `stage.css` |

Por fazer:
- I1: a velocidade do palco no Mac.
- I2: o material do fundo.
- I3: o painel que não ativa a app.
- I4: o primeiro clique numa janela inativa.
- I11: a pista chega no fim, porque o `hint` vem depois dos cartões na ordem do prompt, que não se muda.
- P2: os Documentos não guardam o caminho do PDF.
- P3, P4, P7, P8, P9 e P10.
- M2: falta o script de instalação local no Mac.

Os pontos I1–I4 e M2 são código do Mac (Swift/Rust do macOS) e precisam de um Mac para testar.

**I2 (também no Windows):** por cima de outra app, o palco pintava um cinzento a 62 % com desfoque por cima do acrílico e do véu, e a página de trás desaparecia. Passou a pôr só um véu preto a 38 %, sem desfoque próprio. A página vê-se escurecida e desfocada (`ui/windows/overlay/overlay.css`). No Mac aplica-se a mesma folha de estilos; falta ver o resultado com o material do Mac.

**Verificado ao vivo no Windows (2026-11-21):**
- Alt-clique numa página web no Brave: o palco lê a pergunta com «m/s²» certo.
- «Deixa-me tentar» com «25 m» dá «Está certo.», e com «21 m» dá «Ainda não».
- A resolução vem em português, com «25 m» direito e o sublinhado azul no enunciado.
- O fundo novo deixa ver a página.
- O Esc fecha tudo.
- Capturas em `docs/capturas-windows/2026-11-21-*.png`.
