# LearnLayer para Windows: instruções de construção

> Este ficheiro é o `CLAUDE.md` do projeto. Tudo o que precisas está nesta pasta: `referencia-mac/` (código e capturas da app Mac, só leitura) e `exames/` (PDFs de teste). Ambos estão no `.gitignore` e nunca vão para o git.

---

## 0. Quem és e o que vais fazer

Vais construir a versão **Windows** do LearnLayer, uma app de estudo que já existe para macOS (Swift + SwiftUI, ~88 000 linhas). Não tens acesso ao repositório do Mac. Tens uma cópia de referência do código-fonte em `referencia-mac/` (só leitura) e capturas de ecrã e vídeos da app em `referencia-mac/capturas/`.

O backend (Cloudflare Worker + Postgres Neon) e os pagamentos (Paddle) **já existem e são partilhados** entre Mac e Windows. **Não os reescreves e não os alteras.** A app Windows é mais um cliente da mesma API, com as mesmas contas, os mesmos planos e as mesmas quotas. Se precisares de uma mudança no backend, escreve-a em `docs/PARA-O-DINIS.md` e continua sem ela.

O objetivo é paridade de comportamento com a app Mac, adaptada às convenções do Windows. Quando este texto e o código Swift discordarem, o código Swift é que manda, exceto nas regras marcadas como decisões do Windows (secção 4).

### Modo de trabalho: autónomo, do início ao fim
O Dinis vai abrir esta pasta e escrever só «começa». A partir daí **trabalhas sozinho até a app estar feita**, fase a fase (secção 9), sem pedir aprovação entre fases nem antes de mudanças grandes. Não faças perguntas a meio: quando houver uma dúvida, escolhe a opção mais razoável à luz deste texto e do código Swift, regista-a em `docs/DECISOES.md` (data, dúvida, escolha, porquê) e continua.

- **Estado persistente:** mantém `docs/PROGRESSO.md` sempre atualizado (fase atual, o que está feito, o que falta, próximo passo). Se a sessão for interrompida ou o contexto for resumido, lê esse ficheiro primeiro e continua de onde ficaste. Nunca recomeces do zero.
- **Git:** inicializa o repositório no início se não existir. Commits pequenos, um por funcionalidade, mensagens em inglês, diretamente no `main` (o repositório é novo e só teu). Nunca faças push nem cries repositórios remotos.
- **Língua:** responde em português de Portugal (nunca brasileiro). Código, nomes e commits em inglês.
- **Instala o que faltar** (Node LTS, Rust, as ferramentas de build do Visual Studio, WebView2) com `winget`, e anota em `docs/PROGRESSO.md`.
- **API paga:** desenvolve com respostas falsas (`referencia-mac/LearnLayer/Resources/Mock*.json`) e respostas gravadas. Chamadas reais só pelo Worker de teste, com a conta em que o Dinis entrar, e no máximo **3 USD no total do projeto**; regista cada chamada real e o custo em `docs/CUSTOS.md`. Nunca chames a API paga em testes automáticos.
- **O que só o Dinis pode fazer** (entrar na conta no browser, criar uma chave, uma conta de assinatura de código, um link de download, mudanças no backend): não pares por isso. Escreve o pedido em `docs/PARA-O-DINIS.md` com passos exatos, deixa o código pronto com o valor em configuração, testa com mocks, e segue para a tarefa seguinte. Os critérios de aceitação que dependem dele ficam marcados «falta verificação do Dinis».
- **Verificação:** no fim de cada fase corre os testes, a build e a app (capturas de ecrã para comparar com `referencia-mac/capturas/`), corrige o que falhar, escreve `docs/fase-N.md` (o que foi feito, como verificar) e passa logo à fase seguinte.
- Nunca enfraqueças, saltes ou apagues um teste para ele passar: corrige o código. Se não conseguires, regista o bug em `docs/PROGRESSO.md` e continua.
- Nunca mostres matemática errada. Uma figura que falha a verificação não aparece. Uma citação que não existe no texto não é sublinhada.
- **Só paras quando** as fases 0 a 8 estiverem feitas (ou bloqueadas apenas por itens de `docs/PARA-O-DINIS.md`) e houver um instalador em `dist/`. Aí escreves um resumo final em `docs/RESUMO-FINAL.md` e mostras-mo.

---

## 1. O produto

LearnLayer é um tutor para alunos do secundário português que se preparam para os **exames nacionais (IAVE)** e para alunos do 1.º ano da faculdade (Cálculo, Física, Química, Programação). O aluno está a estudar num PDF, num site (Moodle, Google Classroom) ou num documento. **Carrega Alt e clica numa pergunta** (no Mac é ⌥-clique) e a app abre, por cima dessa janela, um "palco": a pergunta levantada da página e escrita a branco, a página por trás escurecida e desfocada, e um menu:

```
What do you want to do?        (pt: O que queres fazer?)
1  Give me a hint              (Dá-me uma pista)
2  Let me try                  (Deixa-me tentar)
3  Show the solution           (Mostra a resolução)   ← "Show the explanation" em disciplinas de texto
4  Ask about this exercise     (Pergunta sobre este exercício)
```

Teclas 1 a 4 escolhem; **Enter abre a resolução**; **Esc fecha tudo**, sempre, em qualquer estado.

A resolução mostra, sem scroll se couber: a caixa da **Resposta** no topo (maior do que a pergunta), depois 3 a 6 **cartões numerados** (título, fórmula em LaTeX, uma nota curta a explicar *porquê*), uma coluna à direita com **Fórmulas** usadas e uma **figura** calculada pela app (gráfico com parâmetro arrastável, quadro de sinais, figura 3D rodável, circuito, plano complexo…). Passar o rato por um passo **sublinha a azul** no enunciado os dados que esse passo usa. Por baixo: campo «Pergunta sobre este exercício…» e ações «Hint · Let me try · Try a Similar One · Draw It · Hide Graph».

Há uma **mascote** (uma esfera azul com dois olhos, a cor é escolhida pelo aluno) que **explica falando** («Explica-me»): percorre a resolução escrita, passo a passo, em voz pt-PT, enquanto acende linhas, circula opções, aponta para partes da figura e sublinha palavras do enunciado. O aluno pode **falar com o tutor** carregando numa tecla (push-to-talk) e perguntar «não percebi o passo 2».

Há um único elemento sempre visível: uma **pílula preta no topo do ecrã** (no Mac vive no notch). Ao passar o rato abre-se para baixo com uma fila de ícones: capturar o ecrã, abrir a janela, capturar uma área, explicar texto selecionado, Documentos, Memória. Com um exercício aberto mostra só «Ask about this exercise». Quando o tutor fala ou ouve, mostra uma onda sonora.

A **janela principal** tem uma barra lateral: Documentos, Memória (mapa das perguntas e conceitos que o aluno viu), Conta, Plano e uso, Geral, Permissões, IA e uso, Dados e privacidade.

A **conta** faz-se no site (Google, Apple ou código por e-mail) e a app recebe a sessão por um link `learnlayer://auth/callback`. Os planos são Grátis, Plus (20 €/mês) e Pro (50 €/mês), pagos no site com a Paddle.

Vê `referencia-mac/capturas/` antes de desenhar qualquer ecrã. Os vídeos `open-q14.mp4`, `demo-q14-steps.mp4`, `mascot-pt.mp4` e `notch.mp4` mostram o movimento e o ritmo que quero.

---

## 2. Regras de produto (vinculativas, iguais às do Mac)

1. **Silêncio por defeito.** Nada aparece sem um gesto do aluno. Antes do clique não se mostra nada (pode ler-se em segundo plano, mas não se mostra).
2. **Esc fecha tudo**, de qualquer estado, mesmo quando a janela de baixo tem o foco.
3. **No máximo um elemento de explicação aberto de cada vez.**
4. **Pedagogia: o plano é da app, o texto é do modelo.** Um exercício começa no menu. A pista não revela a resposta. «Let me try» deixa o aluno escrever a resposta e a app verifica-a. A resolução completa está a um toque (Enter ou 3).
5. **O modelo devolve JSON; a app desenha, anima e verifica.** O modelo nunca escreve código de animação nem inventa coordenadas de figuras. As figuras saem de templates calculados pela app a partir dos números e expressões do JSON.
6. **Verificação antes de mostrar.** As expressões ASCII do modelo (`answer.expression`, `checks`) são avaliadas numericamente pela app. Um quadro de sinais cujos sinais não batem com a expressão não aparece e a resposta passa ao modelo forte. Uma figura que falha não aparece. Uma citação (`quotes`, `evidence.quote`) só é sublinhada se existir carácter a carácter no texto.
7. **Cliques instantâneos.** O palco abre em menos de 150 ms depois do clique, com a pergunta como foi lida (mesmo antes de haver resposta do modelo). A espera mostra uma linha de progresso com frases curtas («A ler a figura…», «A montar as equações…», ver `SolveProgress.swift`).
8. **Estilo visual:** só branco/preto e **um** acento azul (o azul de destaque do sistema, `#0A84FF` em escuro / `#007AFF` em claro). Sem néon, sem brilhos, sem HUD. Os sublinhados dos dados de um passo são todos no mesmo azul. **Exceção única:** blocos de código usam as cores de sintaxe do VS Code (Dark+ / Light+), em fonte mono, com linhas e indentação preservadas.
9. **Movimento:** ao explicar, a janela por trás escurece e desfoca; a pergunta "levanta-se" da página e desliza; os traços aparecem como desenhados à mão; as curvas desenham-se progressivamente; animações com mola. Respeitar **"Mostrar animações no Windows"** desligado (equivalente a Reduzir movimento: só fades) e **"Efeitos de transparência"** desligado (fundo preto opaco em vez de acrílico). Respeitar também o Alto Contraste.
10. **Todos os textos visíveis em ficheiros de tradução**, nunca escritos no código. Língua base inglês, tradução **pt-PT** completa desde o início. Os textos já existem: `referencia-mac/LearnLayer/Resources/Localizable.xcstrings` (609 entradas, en + pt-PT). Converte-o para o formato da stack e usa as mesmas chaves.
11. **Voz e texto em pt-PT, nunca brasileiro.** As regras de pt-PT dos prompts (ver `ProblemPrompt.languageRule`) aplicam-se a tudo o que geras.
12. **Privacidade:** nada é lido em campos de palavra-passe, em janelas de exame seguro (Safe Exam Browser e afins) nem em apps de banco. O PDF do aluno nunca sai do computador; só o texto e o recorte da pergunta clicada vão para o modelo.
13. **Nada de segredos no código** nem no repositório. A chave da OpenRouter vive só no servidor (secção 5).

---

## 3. Funcionalidades, por ordem de importância

### 3.1 Alt-clique em qualquer app ("Anywhere") — o caminho principal
Referência: `Anywhere/AnywhereController.swift`, `ClickMonitor.swift`, `AccessibilityReader.swift`, `QuestionRegion.swift`, `QuestionBand.swift`, `PDFQuestionRead.swift`, `DocumentPreread.swift`, `Problems/QuestionReading.swift`, `FastTranscription.swift`, `LocalQuestionReader.swift`.

1. Um hook global do rato vê **Alt + clique esquerdo**. Esse clique é **consumido** (não chega à app de baixo: nenhum link abre, nenhum texto é selecionado) e o Alt solto a seguir não pode ativar a barra de menus da app (injeta uma tecla neutra, por exemplo `VK_NONAME`/0xFF, antes do Alt subir). Todos os outros cliques passam diretos. O hook corre na sua própria thread com o seu message loop, nunca na thread da UI, e responde em microssegundos (o Windows remove hooks lentos); se o hook morrer, a app deteta-o, volta a instalá-lo e, se falhar, a pílula diz como reativar (equivalente ao `onFailSafe` do Mac).
2. Um clique numa janela da própria LearnLayer não é intercetado.
3. A pergunta lê-se por esta ordem, a mais barata e exata primeiro:
   1. **Texto do documento**: se a janela é um leitor de PDF de que conseguimos saber o caminho do ficheiro (Edge, Acrobat, SumatraPDF… via UI Automation ou título da janela + ficheiros recentes), abre-se o PDF localmente (pdf.js/PDFium) e lê-se a pergunta do text layer, como `PDFQuestionRead.swift` faz no Preview.
   2. **UI Automation** (`TextPattern` / `RangeFromPoint`) no elemento debaixo do cursor: Chrome, Edge, Firefox, Word, Teams, Notepad. Para o Chrome/Electron, a acessibilidade só acorda quando um cliente UIA a pede: trata disso.
   3. **Captura da zona da pergunta + OCR local** (`Windows.Media.Ocr`, língua pt-PT e en) quando não há texto, o texto é matemática "achatada" (`FlattenedMath.swift`) ou a pergunta tem figura. A zona encontra-se localmente com as regras de `QuestionRegion.swift` (a numeração "3.", "Questão 2" delimita em cima e em baixo; espaço em branco quando não há; tinta que não é texto é a figura).
   4. **Transcrição rápida na nuvem** do recorte (modelo `qwen/qwen3.8-flash`, prompt em `FastTranscription.swift`), em paralelo com a resolução. O que chegar primeiro e passar a verificação de `QuestionSession.acceptsFastTranscription` é o que o aluno vê, tipografado.
4. Enquanto lê, uma palavra pequena junto ao cursor diz «Reading…» ou «Couldn’t read this here.».
5. O palco abre numa janela sem moldura, sempre por cima, que **cobre o monitor onde foi o clique**, com acrílico escuro por cima da app de baixo, e que aceita teclado sem roubar a app da frente mais do que o necessário. O primeiro clique dentro do palco tem de funcionar logo (no Mac isto exigiu `FirstClickHostingView`).
6. Um PDF aberto à frente tem as perguntas **lidas antecipadamente** (`DocumentPreread.swift` + `PrereadPlan.swift`): as das páginas visíveis e vizinhas primeiro, com teto de gasto por PDF, guardadas em cache para o clique as encontrar prontas.
7. Desligável em Definições › Geral («⌥-click in any app» → «Alt-click in any app»).
8. Regista em `anywhere-log.jsonl` só contagens e nomes de apps (nunca texto), como `AnywhereLog`.

### 3.2 O palco da pergunta (resolver, pista, tentar, perguntar)
Referência: `Problems/QuestionSession.swift` (o coração), `QuestionOverlay.swift`, `SolutionReveal.swift`, `SolutionSteps.swift`, `StepFocus.swift`, `StatementUnderlines.swift`, `StatementQuotes.swift`, `EvidenceAnswerView.swift`, `Passage.swift`, `ChoiceCheck.swift`, `SignTable*.swift`, `StreamingAnswerView.swift`, `SolveProgress*.swift`, `ExplanationLayout.swift`, `PanelFit.swift`, `Explanation/ChoiceList.swift`.

- O pedido ao modelo só sai quando o aluno escolhe uma opção (`openQuietly` + `solveOnFirstChoice`): abrir o palco não gasta nada. Uma resposta guardada em cache aparece logo.
- **Hint**: mostra a pista; depois os passos um a um.
- **Let me try**: campo para a resposta do aluno («Your answer»), avaliada com `answer.expression` (aceita `*`, `^`, `sqrt()`, `abs()`), escolha múltipla com `ChoiceCheck`. Respostas: «That’s right.», «Not yet: it differs from the expected result.», etc.
- **Solution**: a resposta numa caixa no topo e todos os passos visíveis numa coluna compacta («cascata»: aparecem em sequência rápida). Clicar num passo abre o detalhe e põe a figura nesse momento. Passar o rato num passo sublinha os seus `quotes` no enunciado.
- **Escolha múltipla**: a opção certa fica circulada a azul na própria pergunta.
- **Perguntas de texto** (Português, Filosofia, História, línguas): o excerto aparece logo, as citações sublinham-se à medida que chegam (só se existirem), depois os pontos-chave, depois a resposta em parágrafos ligados a eles.
- **Ask about this exercise**: pergunta livre, respondida com o contexto do exercício e do passo aberto (`TextHelp.swift`, `SelectionAsk.swift`).
- **Try a Similar One**: a mesma pergunta com números novos (`ProblemVariant.swift`); a app calcula a resposta certa com a fórmula verificada, o modelo só escreve o enunciado.
- **Explain Better**: pede outra vez a um modelo mais forte (`ModelRouting.explainBetterModel`).
- Itens de **escuta** (Inglês/Francês) sem transcrição: pede ao aluno que cole a transcrição antes de resolver.
- Tamanhos: depois de «Solution» a pergunta recua para ~14 pt e a resolução tem tamanhos fixos (resposta 17–23 pt, títulos 14, notas 13), nunca encolhe. Se faltar espaço: primeiro saem as perguntas sugeridas, depois encolhe a pergunta, só no fim os passos fazem scroll.

### 3.3 Leitor de PDF próprio
Referência: `Reader/*`, `Problems/QuestionDetector.swift`, `QuestionPages.swift`, `PageImage.swift`, `PDFColumns.swift`, `PDFReadingOrder.swift`, `TextNormalizer.swift`, `Explanation/EquationDetector.swift`.

Abrir PDF, scroll, zoom, arrastar um PDF para a janela, abrir `.pdf` pela app (associação de ficheiro opcional). O `QuestionDetector` encontra os itens do exame (2.1., 4.2., 5.(AE2018), I.1…), ignora opções e páginas de cotações. Clicar (ou Alt-clicar) numa pergunta abre o mesmo palco. Clicar numa **equação solta** abre o explicador de fórmulas (menu «Explain it / Show the graph / Let me try», `Explanation/*`, `AI/ExplanationPrompt.swift`). O que se envia com a pergunta: o bloco da pergunta e as páginas de «Figura N», «Documento N», «Texto N» que ela refere (no máximo 2 páginas extra, recortadas, até 1100 px de lado, JPEG qualidade 0,7).

### 3.4 Mascote e voz
Referência: `Lesson/*` (lição «Explica-me»), `Voice/*` (tutor de voz, TTS, plano de reprodução, push-to-talk, mascote), `Resources/OpenerClips/`, `Resources/OnboardingClips/`.

- **«Explica-me»**: pede uma lição (`MascotLessonPrompt.swift` v14, modelo `deepseek/deepseek-v4.1-flash`, com `anthropic/claude-sonnet-5.5` como recurso se a resposta não for jogável ou saltar um passo). A lição é um guião de *beats*: cada um tem uma frase falada e marcas (`zoom, highlight, underline, circle, crossOut, point, arrow`) com alvos que a app encontra (letra de opção, palavras copiadas do enunciado, uma caixa na imagem, um rótulo da figura). A app toca o guião sincronizado com o áudio (`LessonRun.swift`, `SpeechSync.swift`, `HighlightPlan.swift`).
- **Tutor por voz**: o aluno mantém carregada a tecla de falar, fala, solta; o texto vai ao modelo com o contexto do exercício (`VoiceTutorPrompt.swift` v24) e a resposta é falada com marcas no ecrã. Enquanto a resposta não chega, toca uma frase de abertura pré-gravada adequada à intenção («Vamos ao ponto 2», `VoiceTutorOpener.swift` + `OpenerClips/`), sem chamada ao modelo.
- **Fala (TTS)**: `POST /v1/audio/speech` no backend (ElevenLabs via OpenRouter). Voz pt-PT: `nJ5NFqyKb8kn9JBPmo6i` («Joana»); outras línguas: `river`. Modelos: `elevenlabs/eleven-v4-turbo` (só planos pagos e com «Premium voice» ligada) e `elevenlabs/eleven-flash-v2.5` (grátis). Lê `OpenRouterSpeech.swift` para o corpo exato (`language_code` só em flash/turbo v2.5; v4 rejeita `speed`). Sem voz premium, fala a voz do sistema (Windows `SpeechSynthesizer`, preferindo uma voz pt-PT instalada, nunca pt-BR).
- **Ouvir (STT)**: no Mac é local. No Windows, ver decisão 4.5.
- **Mascote**: esfera azul com dois olhos, nunca muda de forma; respira em repouso, olha e "acena" para o que está a ser dito, brilha quando aponta (`VoiceMascot*.swift`, `MascotMotion.swift`). Cores: Blue, Purple, Pink, Teal, Graphite (`MascotColor.swift`). Referência visual: `capturas/mascot-poster.png`, `capturas/marketing/blue-mascot.png`.

### 3.5 Pílula no topo (equivalente ao notch)
Referência: `Notch/*`. Uma pílula preta pequena, centrada no topo do monitor principal, sempre por cima, que não rouba o foco e não entra no Alt-Tab. Estados por prioridade (`NotchMode.resolve`): pedido de permissão > a ouvir > a falar > aviso curto > exercício aberto > rato por cima > repouso. Ao passar o rato abre para baixo com os ícones de `NotchAction.catalog` (sem números nem selos). Com o tutor a falar/ouvir mostra a onda (`WaveformBars`). Também um ícone na área de notificação (tray) com «Open window», «Settings», «Quit».

### 3.6 Janela principal, definições, onboarding
Referência: `Home/*`, `Settings/*`, `Onboarding/*`, `Brain/*`, `Memory/*`, `Account/*`, `Study/StudyExport.swift`.
- Barra lateral: **Documentos**, **Memória** (mapa e lista das perguntas feitas, por documento; dados reais de `MemoryStore`, não os de exemplo do `BrainSampleData`), **Conta**, **Plano e uso**, **Geral** (língua, disciplina por defeito, voz, mascote, tecla de falar, Alt-clique), **Permissões** (no Windows: microfone, e o estado do hook/UIA), **IA e uso**, **Dados e privacidade** (exportar, apagar dados locais, sincronizar memória, consentimentos).
- **Onboarding** (`OnboardingFlow.swift`): welcome → language → mic → talk → permissions → tryIt → look → plan → done, com os clips de voz de `OnboardingClips/` (pt e en). No passo tryIt o aluno faz Alt-clique numa pergunta de exemplo («A car goes from 0 to 20 m/s in 5 s. What is its acceleration?»).
- **Memória** local (`MemoryStore.swift`) num ficheiro JSON em `%APPDATA%\LearnLayer\`; sincronização cifrada opcional (`BrainSync*.swift`, `MemorySync.swift`) com os endpoints `/v1/memory/*`. Fica para a última fase.

---

## 4. Decisões do Windows (já tomadas, salvo se tiveres uma razão forte; nesse caso pergunta)

### 4.1 Stack recomendada: **Tauri 2 + interface web (React + TypeScript) + Rust para o nativo**
- **Interface** (palco, resolução, mascote, janela principal, onboarding): React + TypeScript + Vite, **KaTeX** para LaTeX, **SVG/Canvas** para traços à mão e curvas que se desenham, **three.js** para figuras 3D, **pdf.js** para o leitor (dá o text layer com coordenadas exatas, o equivalente ao PDFKit).
- **Nativo em Rust** (crate `windows`): hook global do rato e teclado, UI Automation, captura de ecrã (`Windows.Graphics.Capture` ou GDI), OCR (`Windows.Media.Ocr`), voz do sistema, janelas sem moldura transparentes com acrílico (`window-vibrancy`), Credential Manager (`keyring`).
- Plugins Tauri: `deep-link` + `single-instance` (para `learnlayer://`), `updater`, `autostart`, `global-shortcut`, `notification`.
- **Porquê:** quase toda a UI é matemática, texto e animação, onde a web (KaTeX, SVG, three.js) é mais forte do que XAML; o leitor ganha o pdf.js; a mesma interface pode mais tarde dar uma versão web/Chromebook para as escolas; o Tauri gera um instalador pequeno e já tem deep links, atualização automática e janelas transparentes no Windows. O preço é escrever a camada nativa em Rust, que é pequena e bem delimitada.
- Alternativa aceitável se o Rust te travar: .NET 8 + WinUI 3 com WebView2 para a mesma interface web. Não uses Electron.
- Alvo: Windows 10 22H2 e Windows 11, x64 e ARM64. WebView2 Evergreen.

### 4.2 Arquitetura
- `core/` em TypeScript puro, sem DOM: porte fiel da lógica Swift sem UI (prompts, esquemas JSON, `PartialJSON`, `Expression`/`Verifier`, `ChoiceCheck`, `SignTable`, `LatexText`, `Passage`, `QuestionDetector`, `QuestionLabels`, `ModelRouting`, `FigureTopic`, `IllustrationTemplate`, `SolutionReveal`, `MascotLesson`, caches). Testado com Vitest, **portando os testes de `referencia-mac/LearnLayerTests/` com os mesmos casos**.
- `ui/` em React, só apresentação.
- `src-tauri/` em Rust, só o que precisa do Windows, exposto por comandos Tauri pequenos e testáveis.
- Porta os ficheiros um a um. Quando portares um ficheiro Swift, põe no topo do ficheiro novo `// Port of LearnLayer/<caminho>.swift @ <commit da referência>` para se saber de onde veio.

### 4.3 Atalhos (o Windows não tem ⌥ nem Fn)
- **Perguntar:** Alt + clique (ver 3.1 para engolir o clique e o Alt). Atalho alternativo configurável: `Ctrl+Shift+Espaço` lê a pergunta debaixo do cursor.
- **Falar com o tutor (manter carregado):** por defeito **Ctrl + Win**; alternativas em Definições: tecla **Copilot** (chega como Win+Shift+F23), **Ctrl direito**, ou o botão do microfone no palco. Não uses Ctrl+Alt (é o AltGr dos teclados portugueses: @, €, {).
- Esc fecha tudo. 1–4 escolhem no menu, Enter abre a resolução.

### 4.4 Dados locais
`%APPDATA%\LearnLayer\` para ficheiros (equivalente a `~/Library/Application Support/LearnLayer/`): `solutions.json` (cache de resoluções, indexada pela versão do prompt, rota e páginas enviadas), `fast-questions.json`, `memory.json`, `onboarding.json`, `anywhere-log.jsonl`, `cost-ledger.json`. Tokens de sessão no **Credential Manager** (alvo `LearnLayer.Session`), nunca em ficheiro.

### 4.5 Reconhecimento de voz
Ordem: (1) `Windows.Media.SpeechRecognition` se houver o pacote de fala pt-PT instalado; (2) senão, gravar o áudio e enviá-lo como `input_audio` numa mensagem a `google/gemini-3.8-flash` pelo `/v1/chat/completions` do backend (modelo permitido em todos os planos), pedindo só a transcrição. Mede a latência das duas e regista-a em `docs/DECISOES.md`.

### 4.6 Distribuição
Instalador NSIS/MSI do Tauri, assinado com **Azure Trusted Signing** (eu trato da conta; até lá, builds não assinadas só para mim). Atualização automática com o `updater` do Tauri, a partir de um URL que eu dou. A página `/download` do site já existe e lê `DOWNLOAD_URL`; para o Windows vai ser preciso um segundo link: põe isso em `docs/PARA-O-DINIS.md`.

---

## 5. Contrato da API (backend partilhado, não alterar)

**Bases:** API `LEARNLAYER_API_BASE` (por defeito `https://api.learnlayer.app`; hoje, enquanto não há DNS: `https://learnlayer-api-test.dinnisz.workers.dev`). Site `LEARNLAYER_SITE_BASE` (por defeito `https://learnlayer.app`). Lê ambos de variáveis de ambiente e de um ficheiro de configuração; uma build de release recusa `http://` e volta ao valor por defeito. Local: `wrangler dev` em `http://127.0.0.1:8787` (o backend em modo `development` devolve `devCode` no login por e-mail).

**Erros:** sempre `{"error": {"code": "...", "message": "..."}}`. Mostra a mensagem traduzida pelo `code`, não a do servidor.

### 5.1 Autenticação
- Tokens: `accessToken` (JWT, 15 min), `refreshToken` (opaco, 30 dias, **rotativo**: cada refresh revoga o anterior). Resposta de todos os endpoints que dão sessão:
  ```json
  {"accessToken":"…","refreshToken":"…","accessExpiresAt":"2026-11-14T16:41:00.000Z","user":{"id":"…","email":"…","name":null}}
  ```
- Pedidos autenticados: `Authorization: Bearer <accessToken>`. Um `401` num pedido ao modelo → **um** refresh forçado e repete uma vez. Refresh falhado → sessão terminada, pede novo login. Serializa os refreshes (dois pedidos em paralelo não podem gastar o mesmo refresh token).
- **Login pelo browser com PKCE (o principal):**
  1. Gera `verifier` = 32 bytes aleatórios em base64url (43 caracteres) e `state` aleatório (16–200 caracteres `[A-Za-z0-9._~-]`). `code_challenge` = base64url(SHA-256(verifier)).
  2. Abre no browser: `{SITE}/login?code_challenge=…&state=…&redirect_uri=learnlayer://auth/callback` (exatamente como `AppLogin.loginURL`).
  3. O site (Google, Apple ou código por e-mail) redireciona para `learnlayer://auth/callback?code=…&state=…`. Regista o protocolo `learnlayer` no Windows (deep-link) com instância única, para o link chegar à app já aberta. Confirma que o `state` bate; se não, «That sign-in link didn’t match this computer.».
  4. `POST /v1/auth/app/token` `{"code","codeVerifier","deviceName"}` → tokens. `deviceName` = nome do computador (por exemplo «Windows · DESKTOP-ABC»), até 80 caracteres.
- **Alternativa por código de e-mail** (na própria app): `POST /v1/auth/email/start` `{"email"}` → `{ok:true}` (reenvio só passados 30 s; o código dura 10 min; 5 tentativas); `POST /v1/auth/email/verify` `{"email","code":"123456","deviceName"}` → tokens.
- `POST /v1/auth/refresh` `{"refreshToken"}` → tokens novos.
- `POST /v1/auth/logout` (Bearer) `{"refreshToken"}` → `{ok:true}`.
- Limites: 8 tentativas de login por hora por IP e por e-mail (`429 rate_limited`).

### 5.2 Conta, planos, pagamentos
- `GET /v1/me` (Bearer):
  ```json
  {"user":{"id","email","name"},
   "plan":{"id":"free|plus|pro","status":"active|trialing|past_due|canceled","interval":"month|year|null","renewsAt":"ISO|null"},
   "usage":{"dailyRequests","dailyLimit","monthlyRequests","monthlyLimit","monthlyCostUsdMicros","monthlyCostLimitUsdMicros","resetsDailyAt","resetsMonthlyAt"}}
  ```
  Chama-o ao entrar, ao abrir «Plano e uso», depois de um pagamento, e de vez em quando. **Nunca escrevas limites ou preços no código: lê-os sempre do servidor.**
- `GET /v1/plans` (público) → `{"currency":"EUR","plans":[{id,name,monthlyPriceCents,yearlyPriceCents,currency,dailyRequestLimit,monthlyRequestLimit,monthlyCostLimitUsdMicros}]}`. Valores de produção no repositório: Grátis 8/dia, 30/mês, 0,40 USD; Plus 2000 cêntimos/mês (anual 19000), 35/dia, 350/mês, 8 USD; Pro 5000/mês (anual 48000), 100/dia, 1000/mês, 20 USD. O Worker de teste pode ter outros valores.
- **Upgrade:** a app **não abre a Paddle diretamente**. Abre no browser `{SITE}/checkout?interval=month` (ou `year`; e `plan=pro` para o Pro). O site trata da sessão e da Paddle. No fim, o site abre `learnlayer://billing/success`; a app volta a «Plano e uso» e chama `/v1/me`. Texto obrigatório junto ao botão: «Billed by Paddle. Tax is included.»
- **Gerir subscrição / apagar conta / exportar dados**: no site (`{SITE}/account`). A app pode também usar `GET /v1/devices`, `POST /v1/devices/:id/revoke`, `GET /v1/account/export`, `POST /v1/account/delete` `{"confirm":"<email>"}`, `GET|POST /v1/account/consents` (`{"terms":"2026-10","privacy":"2026-10"}`).

### 5.3 Modelos (proxy da OpenRouter)
- `POST /v1/chat/completions` (Bearer): **o mesmo corpo da API da OpenRouter**. O servidor só passa os campos `model, messages, max_tokens, temperature, top_p, stream, response_format, stop, seed, provider` e acrescenta `usage`. Corpo até 12 MB (imagens em base64 incluídas). Com `"stream": true` devolve SSE igual ao da OpenRouter (linhas `data:`, comentários `: OPENROUTER PROCESSING`, último bloco com `usage`, `data: [DONE]`).
- Cabeçalhos que o cliente envia nos pedidos de resolução:
  - `X-LearnLayer-Area`: `math | physicsChemistry | biologyGeology | reading | other` (de `ModelRouting.area(of:)`)
  - `X-LearnLayer-Route`: `fast | strong`
  - `X-LearnLayer-Figure`: `1 | 0` (vão imagens de página)
  - `X-LearnLayer-Purpose`: `chat` ou `speech`
  - opcional `X-Request-Id`
- **O servidor impõe o modelo.** Com Area + Route presentes escolhe ele (figura → Gemini; math/other → Haiku com 2000 tokens de raciocínio; resto → Gemini). Sem esses cabeçalhos, aceita o `model` pedido se estiver na lista do plano (Grátis: Haiku, Gemini, DeepSeek; Plus/Pro: + Sonnet); senão usa Haiku. `max_tokens` fica entre 1 e 16000. O servidor também define `reasoning`. Por isso o cliente: pede o modelo de `ModelRouting.cheapFirstChoice`, manda os cabeçalhos nas resoluções, e não manda os cabeçalhos quando pede um modelo pelo nome (Explain better, lição da mascote, transcrição rápida).
- `POST /v1/audio/speech` (Bearer): corpo da OpenRouter (`model, input, voice, response_format, speed, provider`), `input` até 5000 caracteres. Devolve o áudio.
- **Códigos de recusa** a tratar com mensagem própria e sem tentar outra vez:
  - `402 quota_daily` → «You’ve reached today’s limit. It resets at midnight UTC.»
  - `402 quota_monthly` / `quota_cost` → «You’ve used this month’s allowance. Upgrade to keep going.» com botão Upgrade
  - `503 spend_kill` → «LearnLayer is paused right now. Try again later.»
  - `429 rate_limited` (30 pedidos/min por utilizador, 90 por IP)
  - `413 too_large`, `502 upstream`, `401 unauthorized`
  - Um `400` da OpenRouter com «Reasoning is mandatory» ou «schema too large» tem tratamento especial em `OpenRouterClient.swift` (repetir uma vez sem/com outro formato): copia esse comportamento.
- **Lacuna conhecida:** o modelo da transcrição rápida (`qwen/qwen3.8-flash`) não está na lista do servidor, por isso pelo backend sai Haiku. Não mudes o backend; aponta em `docs/PARA-O-DINIS.md`.

### 5.4 Memória sincronizada (última fase)
`GET/PUT /v1/memory/keys`, `GET /v1/memory/blobs?since=ISO`, `PUT /v1/memory/blobs/:id` `{expectedVersion,keyVersion,nonce,ciphertext}` (base64, até 1 MB, `409 version_conflict` com `currentVersion`). O servidor só guarda texto cifrado. O formato da cifra tem de ser **idêntico** ao do Mac (`BrainSyncCrypto.swift`) para Mac e Windows partilharem a memória.

### 5.5 Modo de desenvolvimento com a chave própria
Como no Mac (`AIGateway.prefersLocalKey`): numa build de debug, com `LEARNLAYER_USE_LOCAL_KEY=1` e uma chave da OpenRouter guardada no Credential Manager (`LearnLayer.OpenRouter`), os pedidos vão diretos a `https://openrouter.ai/api/v1/...`. Em release isto não existe. Com chave própria, aplica tu o `reasoning` que o servidor aplicaria (`backend/src/routing.ts`, `applyModel`).

---

## 6. Os prompts e os esquemas JSON

**Porta-os palavra a palavra**, como strings, com o mesmo número de versão. Não os resumas, não os traduzas, não os "melhores". Se achares que um prompt tem um problema, regista-o em `docs/DECISOES.md` e mantém-no igual. A versão entra na chave das caches; a cache partilhada futura (`docs/shared-answer-cache.md`) depende de Mac e Windows produzirem a mesma chave para a mesma pergunta.

| Ficheiro | Versão | Para quê | Modelo |
|---|---|---|---|
| `Problems/ProblemPrompt.swift` | 33 | Resolver um grupo de perguntas de exame: `subject`, `figure`, `parts[]` (label, topic, figureTopic, asks, evidence, paragraphs, answer, answerLatex, cards[] com title/note/latex/branches/quotes/say/highlight/focus, hint, steps, checks, graph, equation, uses…) | rota (5.3) |
| `Problems/QuestionClassifier.swift` | — | Classificar a pergunta (reading, calculation, figure_data, mixed) para escolher a rota | Haiku |
| `Problems/FastTranscription.swift` | — | Transcrever o recorte da pergunta para blocos tipografáveis | qwen3.8-flash |
| `Problems/QuestionTranscription.swift` | — | Formato dos blocos da pergunta transcrita | — |
| `AI/ExplanationPrompt.swift` | 14 | Explicar uma fórmula solta (passos, traços, curva) | Haiku/Sonnet |
| `Illustrations/IllustrationPrompt.swift` | 22 | Números e expressões para uma figura que a app desenha | figura |
| `Problems/TextHelp.swift` | 5 | Texto selecionado e perguntas de seguimento | Haiku |
| `Problems/ProblemVariant.swift` | — | Pergunta semelhante com números novos | Haiku |
| `Lesson/MascotLessonPrompt.swift` | 14 | Lição falada da mascote («Explica-me») | DeepSeek → Sonnet |
| `Voice/VoiceTutorPrompt.swift` | 24 | Turno falado do tutor | ver o ficheiro |
| `Memory/ExplanationPlanner.swift` | — | Bloco de plano pedagógico acrescentado ao prompt | — |

Os esquemas vão em `response_format: {"type":"json_schema","json_schema":{"name","strict":true,"schema"}}`; os grandes demais vão descritos no prompt com `json_object` (`OpenRouterClient.looseSchemas`). A resposta chega em streaming e é lida com um leitor de **JSON parcial** (`AI/PartialJSON.swift`): o enunciado transcrito, as citações e os primeiros passos aparecem antes de a resposta estar completa. A ordem dos campos no prompt existe por isso; não a mudes.

**Escalada para o modelo forte** (`QuestionSession.confirm`): JSON ilegível, sem texto aos 30 s (`firstTextDeadline`), escolha múltipla hesitante ou fora das opções, quadro de sinais que não bate, `checks` que falham, figura que não bate com a resposta. Até a confirmação chegar, a pista está disponível e a resposta espera.

---

## 7. Aparência no Windows

- Fonte: **Segoe UI Variable** (texto), **Cascadia Mono** (código), KaTeX com as fontes dele para matemática. Ícones: **Segoe Fluent Icons** no lugar dos SF Symbols.
- Palco: acrílico escuro sobre a app de baixo (com transparência desligada: preto a ~85 %). Texto a branco. Um único azul.
- Janela principal: Mica no Windows 11, barra lateral à esquerda, modo claro/escuro do sistema.
- Pílula: preta, cantos totalmente redondos, ~180×32 px em repouso, centrada no topo do monitor principal, abre-se para baixo com mola.
- DPI: tudo per-monitor DPI aware v2; o palco abre no monitor do clique com a escala certa. Testa a 100 %, 125 %, 150 % e 200 %.
- Leitor de ecrã: Narrador lê o menu, os passos, o estado da pílula («Listening…», «Speaking…»).

---

## 8. O que NÃO fazer

- Não reescrever nem alterar o backend, a landing, a Paddle ou a base de dados.
- Não pôr chaves, tokens, `.env`, `.dev.vars` ou ligações à base de dados no repositório.
- Não mandar o PDF inteiro ao modelo, nem texto lido de campos de palavra-passe.
- Não chamar a API paga em testes automáticos. Os testes usam mocks e respostas gravadas.
- Não inventar funcionalidades que o Mac não tem.
- Não portar os modos de avaliação de debug do Mac (`App/*Evaluation.swift`, `-evalPapers`, etc.) nesta fase; só mais tarde, se eu pedir.
- Não usar o pacote `Study/` (revisões, cartões, «Weak spots»): está a ser desligado no Mac.

---

## 9. Fases e critérios de aceitação

Cada fase termina com: testes a passar, um `docs/fase-N.md` curto com o que foi feito e como verificar, e uma build que corre. Depois passa logo à seguinte.

**Fase 0. Esqueleto (sem API)**
Repo Tauri 2 + React + TS + Vite + Vitest + Rust; lint e formatação; CI no GitHub Actions em `windows-latest` (build + testes, sem segredos). Traduções convertidas do `.xcstrings` (en + pt-PT).
*Aceito quando:* `npm test` e `cargo test` passam no CI; a app abre uma janela vazia com a língua do sistema; as 609 chaves existem nas duas línguas.

**Fase 1. Conta e plano**
Pílula + tray + janela principal com Conta e Plano e uso. Login PKCE pelo browser e por código de e-mail; deep link `learnlayer://`; tokens no Credential Manager; refresh serializado; `/v1/me`; Upgrade abre o checkout do site; `learnlayer://billing/success` atualiza o plano.
*Aceito quando:* com o Worker de teste, entro, fecho e reabro a app e continuo dentro; vejo o plano e o uso iguais aos do Mac na mesma conta; logout revoga a sessão; um segundo clique no link com a app aberta não abre uma segunda instância.

**Fase 2. Núcleo portado e cliente de IA**
`core/` com os prompts e esquemas (secção 6), `PartialJSON`, `Expression`/`Verifier`, `ChoiceCheck`, `SignTable`, `LatexText`, `Passage`, `QuestionDetector`, `QuestionLabels`, `ModelRouting`, `FigureTopic`. Cliente SSE com refresh no 401, cabeçalhos da 5.3, tratamento de todos os códigos de erro, cache de resoluções em disco.
*Aceito quando:* os testes portados de `LearnLayerTests/` para estes módulos passam com os mesmos casos; um pedido de streaming ao Worker de teste chega por partes (uma única chamada real, registada em `docs/CUSTOS.md`); `402` e `503` mostram as mensagens certas.

**Fase 3. Leitor de PDF e palco**
pdf.js com scroll, zoom, arrastar ficheiro; deteção das perguntas; clique abre o palco com o menu; Hint, Let me try, Solution, Ask; caixa da resposta, cartões, cascata, Fórmulas, sublinhados ao passar o rato, escolha múltipla circulada, texto com excerto e citações; Esc; teclas 1–4 e Enter. Tudo primeiro com `Mock*.json`, depois ao vivo.
*Aceito quando:* com `Tools/TestPDFs/` e os exames de `exames/`, as etiquetas detetadas batem com as do Mac (compara com os testes de `QuestionDetectorTests`); o palco reproduz as capturas `idemo/*`, `resolucao-*`, `pergunta-*` sem scroll em 1366×768 e 1920×1080; o palco abre em menos de 150 ms; matemática renderizada sem erros em todas as fórmulas dos mocks.

**Fase 4. Alt-clique em qualquer app**
Hook, UIA, PDF por caminho, captura + OCR, transcrição rápida, região da pergunta, palco por cima de outra app com acrílico, leitura antecipada.
*Aceito quando:* o Alt-clique lê a pergunta certa em Edge (PDF e página web), Chrome (página `Tools/AnywhereProbe/quiz.html`), Word e Acrobat Reader, com tabela em `docs/anywhere-medicao.md` (texto completo? de onde veio? tempo?); o clique e o Alt nunca chegam à app de baixo; o hook nunca congela o rato (teste: palco a desenhar algo pesado enquanto se clica); Esc fecha mesmo com o foco noutra app.

**Fase 5. Voz e mascote**
TTS pelo backend com a voz pt-PT, voz do sistema como recurso, clips de abertura, push-to-talk, STT (4.5), tutor de voz, «Explica-me» com marcas sincronizadas, mascote animada, onda na pílula.
*Aceito quando:* «Explica-me» numa pergunta de Matemática A fala em pt-PT (nunca brasileiro) e as marcas acendem no momento da frase certa; soltar a tecla de falar envia em menos de 300 ms; sem voz premium nada é faturado.

**Fase 6. Figuras**
Templates de `Illustrations/` (function, series, unitCircle, complexPlane, inclinedPlane, timeline, geometry, premade figures), figuras 3D (`Explanation/Figure3D*.swift`, `Circuit3D*.swift`, `SpaceFigure*.swift`), quadros de sinais, diagramas temporais (`Timing/`), código com cores VS Code.
*Aceito quando:* os testes portados das figuras passam; cada figura que falha a verificação não aparece; arrastar o parâmetro de um gráfico atualiza a curva a 60 fps.

**Fase 7. Onboarding, Memória, Definições completas**
Fluxo inicial com clips; Documentos; Memória local (mapa e lista); todas as páginas de Definições; exportar e apagar dados; consentimentos.
*Aceito quando:* um utilizador novo chega do instalador a uma pergunta resolvida sem ajuda; o mapa da Memória mostra perguntas reais.

**Fase 8. Distribuição**
Instalador, assinatura (quando eu tiver a conta), atualização automática, arranque com o Windows (opcional, desligado por defeito), sincronização cifrada da memória compatível com o Mac.
*Aceito quando:* instalo num Windows limpo sem avisos do SmartScreen (com assinatura), a app atualiza-se sozinha, e a memória criada no Mac aparece no Windows.

---

## 10. Quando o Dinis escrever «começa»

1. Se `docs/PROGRESSO.md` existir, lê-o e continua daí. Se não:
2. Lê `referencia-mac/CLAUDE.md`, `AGENTS.md`, `SETUP.md` e vê as capturas e os vídeos de `referencia-mac/capturas/`.
3. Lê os ficheiros-chave: `Problems/QuestionSession.swift`, `Problems/ProblemPrompt.swift`, `Problems/QuestionOverlay.swift`, `Anywhere/AnywhereController.swift`, `AI/OpenRouterClient.swift`, `AI/AIGateway.swift`, `AI/BackendClient.swift`, `Account/AppLogin.swift`, `Notch/*`, e `referencia-mac/backend/src/app.ts`, `proxy.ts`, `routing.ts`, `config.ts`.
4. Escreve em `docs/PROGRESSO.md` a estrutura de pastas e o plano das fases, com os riscos do Alt-clique.
5. Começa a Fase 0 e não pares até ao fim (secção «Modo de trabalho»).
