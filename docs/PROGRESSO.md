# Progresso — LearnLayer para Windows

> Se a sessão parar: lê este ficheiro primeiro e continua do «Próximo passo». Nunca recomeces do zero.

## Estado atual

- **Fase atual:** 8 fechada (fases 0–8 feitas; o que falta depende do Dinis: `PARA-O-DINIS.md`)
- **Próximo passo:** a app real está a ser testada neste PC (Smart App Control desligado). Arrancar com `LEARNLAYER_TEST_INPUT=1 npm run tauri dev` e usar `scripts/desktop-test/` (README). Já verificados: Alt-clique numa página web e num PDF no Brave, Esc, pílula, Capturar uma área, Explicar o texto selecionado, microfone sem pedido do WebView2 (`docs/anywhere-medicao.md`). Falta: tecla de falar e voz com sessão iniciada, «Explica-me». Pendentes no código, por esta ordem: resolvedor de circuitos (`Circuit3DSolve`, lógica com testes do Mac), figuras 3D (three.js), figuras animadas, marcas da voz e da lição na figura, menu de estudo, seleção de texto no leitor.
- **Última atualização:** 2026-11-16
- **Bloqueio que só o Dinis resolve:** nenhum para desenvolver. Para distribuir: assinatura (PARA-O-DINIS ponto 4) e URL e chave das atualizações (ponto 5).

## Ambiente (máquina do Dinis, Windows 11 Home x64)

| Ferramenta | Estado | Como foi instalada |
|---|---|---|
| winget 1.29 | já existia | — |
| WebView2 Evergreen 157 | já existia | — |
| Git 2.56 | instalado | `winget install Git.Git` |
| Node 26.13 LTS (npm 11.20) | instalado | `winget install OpenJS.NodeJS.LTS` |
| Rust 1.100 (rustup, stable-msvc) | instalado | `winget install Rustlang.Rustup` |
| VS 2022 Build Tools 17.14 (C++ x64 + ARM64) | instalado | `winget install Microsoft.VisualStudio.2022.BuildTools` com o workload `VCTools` |

Os instaladores foram lançados com `--accept-source-agreements --accept-package-agreements` (aceitam as licenças dos pacotes em nome do Dinis, que autorizou as instalações).

Nas sessões, o PATH não traz as ferramentas novas: usar `C:\Program Files\nodejs`, `C:\Program Files\Git\cmd` e `%USERPROFILE%\.cargo\bin`.

**Cuidado com as ferramentas desta sessão:** escrever código com barras invertidas pela linha de comandos (Bash/heredoc) perde-as (`\\` → `\`) e os escapes `\uXXXX` viram o próprio carácter. Código com `\` vai sempre pelo Write; `npm run lint` apanha caracteres invisíveis que escapem.

## Estrutura de pastas

```
Learnlayer/
├─ CLAUDE.md               instruções de construção (não alterar)
├─ referencia-mac/         código Swift, backend e capturas — só leitura, fora do git
├─ exames/                 PDFs de teste — fora do git
├─ core/                   TypeScript puro, sem DOM: porte fiel da lógica Swift
│  ├─ account/             AppLogin (PKCE), HomeRoute, AccountModel
│  ├─ ai/                  AIGateway, BackendClient, ModelClient (SSE), PartialJSON, ModelRouting, DiskCache
│  ├─ pdf/                 PageText (texto + caixa de cada carácter), colunas, ordem de leitura, pdf.js → PageText
│  ├─ problems/            QuestionDetector, QuestionPages, RouteDecision, ProblemSolution, ChoiceCheck, SignTable, Passage…
│  ├─ testing/             páginas de teste (CoreText imitado, PDFs reais via pdf.js em Node)
│  ├─ prompts/             prompts e esquemas (swift/*.json gerados do Mac; problemPrompt.ts junta-os)
│  ├─ math/                Expression/Verifier, LatexText
│  ├─ illustrations/       FigureTopic
│  ├─ notch/               NotchMode, NotchAction, NotchLayout
│  ├─ i18n/                leitor das traduções + locales/ (gerados do .xcstrings) + windows/ (texto próprio)
│  ├─ mocks/               Mock*.json do Mac (respostas falsas para desenvolver sem API)
│  └─ platform.ts          o que muda entre sistemas (nome do dispositivo, atalhos)
├─ ui/                     React + Vite, só apresentação
│  ├─ windows/             main (janela principal), pill, reader (leitor de PDF)
│  ├─ reader/              ReaderDocument (pdf.js)
│  ├─ components/          SettingsKit, Sheet, Icon (Segoe Fluent), Mascot
│  ├─ account/             accountStore, demo (?demo=…)
│  └─ native.ts            a única porta para o nativo
├─ src-tauri/              Rust: config, session, api, tray, data_files, platform/ (windows/: pill, credenciais)
├─ scripts/                xcstrings → locales, extração dos prompts Swift, verificação de caracteres invisíveis
├─ docs/                   PROGRESSO, DECISOES, PARA-O-DINIS, CUSTOS, fase-N
└─ .github/workflows/      CI em windows-latest (build + testes, sem segredos)
```

Os testes ficam ao lado do código (`*.test.ts`), portados de `referencia-mac/LearnLayerTests/` com os mesmos casos.

## Plano das fases

| Fase | O quê | Estado |
|---|---|---|
| 0 | Esqueleto: Tauri 2 + React + TS + Vite + Vitest + Rust, lint, CI, traduções (609 chaves, en + pt-PT) | ✅ feito (`cargo test` por verificar: SAC) — `fase-0.md` |
| 1 | Conta e plano: pílula, tray, janela principal, login PKCE e por código, deep link, Credential Manager, `/v1/me`, checkout | ✅ núcleo + interface; nativo escrito, por compilar — `fase-1.md` |
| 2 | Núcleo portado (`core/`) e cliente de IA (SSE, refresh no 401, erros, cache) | ✅ feito; chamada real por verificar — `fase-2.md` |
| 3 | Leitor de PDF (pdf.js) e palco (menu, Hint, Let me try, Solution, Ask, Try a Similar One) | ✅ feito no browser com mocks; explicador de fórmulas passou para a fase 6 — `fase-3.md` |
| 4 | Alt-clique em qualquer app (hook, UIA, PDF por caminho, captura + OCR, transcrição rápida) | ✅ núcleo, palco e nativo escritos; nativo por compilar e medir (SAC) — `fase-4.md` |
| 5 | Voz e mascote (TTS, STT, push-to-talk, «Explica-me») | ✅ feito no browser; voz pt-PT, microfone e latência por verificar — `fase-5.md` |
| 6 | Figuras (templates, 3D, quadros de sinais, diagramas temporais, código) | ✅ feito no browser, salvo 3D e figuras animadas — `fase-6.md` |
| 7 | Onboarding, Memória, Definições completas | ✅ feito no browser; caminho completo com a app compilada por verificar — `fase-7.md` |
| 8 | Distribuição (instalador, assinatura, atualização, sincronização cifrada) | ✅ sincronização cifrada (testada), arranque com o Windows, atualizações, script do instalador e CI; instalador por gerar (SAC) — `fase-8.md` |

## O que ainda falta portar, por fase

- **Fase 3 (feito, salvo):** `QuestionTranscription` (blocos), `QuestionSession` (o coração: cache, escalada, `confirm`), `SolutionReveal`, `StatementQuotes`, `SolveProgress`, `TextHelp`/`SelectionAsk` (builder do prompt v5), `ProblemVariant` (builder), `ExplanationPrompt` (builder v14), mensagens de recusa no palco.
- **Fase 4 (feito, salvo):** ler antecipadamente o PDF à frente antes do primeiro clique; `SelectionSession` (fase 7, com a pílula).
- **Fase 5 (feito, salvo):** STT nativo do Windows; `holdingTheSymbol`, `namingTheFormula` e `VoiceTutorGuard` (com as figuras); gestos da mascote; `SpeechActivity` e os testes de `NotchGlyphTests` que ficaram.
- **Fase 6:** `IllustrationPrompt` (v22), `ComplexFigure`, templates, 3D.
- **Fase 7 (feito, salvo):** clipes de voz do onboarding com as teclas do Windows (PARA-O-DINIS, ponto 9). `BrainSync*` passou para a fase 8.

## Deteção nos exames de `exames/` (relatório, `EXAM_LABELS=1 npx vitest run scripts/exam-labels.test.ts`)

- Matemática A, FQ A, Geografia A, Filosofia: etiquetas como esperado (5.(AE2018)/5.(AE2023)…).
- Biologia e Geologia, Português, História A, Francês, Inglês: em algumas páginas a numeração mistura «II.1» com «2», «3» (grupos que recomeçam a numeração). Falta comparar com a app Mac nos mesmos PDFs (o texto do pdf.js pode vir por outra ordem que o do PDFKit). Cada página leva no máximo ~20 ms.

## Reparos ao Mac (comportamentos portados tal como estão)

- `DiskCache.store` tira da memória a entrada mais antiga quando passa do limite, mas o `save()` funde com o ficheiro e volta a trazê-la: o ficheiro em disco nunca encolhe. Portado igual (teste em `core/ai/diskCache.test.ts`).
- Alguns prompts falam do «Mac» e do «SwiftMath» (`QuestionTranscription.instruction`). Ficam iguais: a versão do prompt entra na chave da cache partilhada.

## Riscos do Alt-clique (Fase 4)

1. **Hook lento é removido pelo Windows.** `WH_MOUSE_LL` tem de responder em menos de `LowLevelHooksTimeout` (~300 ms; no Windows 10+ o hook é removido em silêncio após alguns atrasos). O hook corre numa thread própria com o seu message loop, só decide «engolir ou passar» e envia o resto por canal. Um vigia verifica periodicamente que o hook ainda responde e reinstala-o.
2. **O Alt solto ativa a barra de menus.** Depois de engolir o clique, injeta-se `VK_NONAME` (0xFF) antes do Alt subir, para a app de baixo não entrar no modo de menu. A testar em Edge, Chrome, Word, Acrobat.
3. **Engolir o `WM_LBUTTONDOWN` mas não o `UP`** deixa a app de baixo com o botão «preso». Engolem-se os dois (o `UP` correspondente ao `DOWN` engolido).
4. **Apps elevadas (admin).** Um hook de um processo normal não vê cliques em janelas elevadas (UIPI). Não há solução sem elevar a app; fica documentado e a pílula explica.
5. **UI Automation no Chrome/Electron** só acorda quando um cliente UIA pede a árvore; a primeira leitura pode ser lenta ou vazia. Acordar a acessibilidade ao detetar a janela à frente, não no clique.
6. **`TextPattern.RangeFromPoint`** não existe em todos os controlos (Firefox e PDFs do Edge variam). Ordem de recurso: PDF por caminho → UIA → captura + OCR → transcrição na nuvem.
7. **Caminho do PDF aberto.** O Edge e o Acrobat não expõem o caminho de forma uniforme; combina-se título da janela, valor UIA da barra de endereço (`file:///…`) e ficheiros recentes.
8. **DPI por monitor.** Coordenadas do hook são físicas; UIA e captura têm de usar o mesmo espaço. Tudo per-monitor DPI aware v2, testado a 100/125/150/200 %.
9. **Janela do palco sem roubar o foco** mas a aceitar teclado, com o primeiro clique a funcionar logo (`WS_EX_NOACTIVATE` não serve porque precisamos de teclado; ativa-se a janela e devolve-se o foco ao fechar).
10. **Esc global** enquanto o palco está aberto: hook de teclado de baixo nível só ativo nesse período.
11. **Janelas protegidas** (Safe Exam Browser, campos de palavra-passe, bancos): lista de exclusão por processo e verificação `IsPassword` via UIA antes de ler.
12. **`Windows.Media.Ocr` sem pt-PT instalado:** recorre a `en` ou à língua do perfil; a transcrição na nuvem cobre o resto.

## Registo

- 2026-11-17 — Testes na app real: corrigidos o «Pergunta I» do OCR, o texto estragado sem região, a seleção do leitor de PDF do Chromium (copiada, área de transferência reposta), o teclado que ficava na pílula e o pedido do microfone do WebView2. Utilitários em `scripts/desktop-test/`.
- 2026-11-17 — O Dinis desligou o Smart App Control. O instalador do CI instalou-se e a app abriu (janela principal com a introdução, pílula no topo). `cargo fmt` e `cargo test` (22) passam localmente.
- 2026-11-17 — Instalador experimentado neste PC: o Smart App Control bloqueou-o antes de correr. Para abrir a app falta a assinatura ou outro PC.
- 2026-11-17 — Primeira compilação do Rust (no CI). Correções: uma linha de formatação, 9 avisos do clippy, e o manifesto da app embutido pelo linker para os testes arrancarem. CI todo verde (22 testes Rust) e instalador em `dist/`.
- 2026-11-17 — O Dinis tornou o repositório público, o que deixa o CI grátis. Push das notas e nova corrida do CI.
- 2026-11-16 — GitHub CLI instalado (`winget install GitHub.cli`). O Dinis entrou na conta Dinnisz e autorizou o push. Repositório privado `learnlayer-windows` criado e `main` enviado. O primeiro CI não arrancou por falta de faturação no GitHub.
- 2026-11-16 — Depois da fase 8: as ações da pílula passaram a funcionar. «Perguntar sobre este exercício» e as sugestões chegam ao palco, «Silenciar» também. «Capturar uma área» congela o monitor e deixa arrastar um retângulo; «Explicar texto selecionado» lê a app à frente. O texto selecionado abre uma passagem própria (`SelectionSession`). 762 testes.
- 2026-11-16 — Fase 8 fechada: sincronização cifrada da memória no formato do Mac (WebCrypto, testes do Mac e o vetor do RFC 7748), memória fundida entre janelas, «Abrir com o Windows», atualizações com «Reiniciar para atualizar», `scripts/build-installer.ps1` e trabalho do CI. O instalador não sai nesta máquina (o SAC bloqueia a compilação e agora também o `rustfmt`). 759 testes.
- 2026-11-16 — Fase 7 fechada: memória local com o plano pedagógico, páginas Memória e Documentos com dados reais, Definições completas, onboarding de oito ecrãs com a pergunta de exemplo a abrir o palco. 740 testes.
- 2026-11-14 — Pacote extraído; ferramentas instaladas; Fase 0 (esqueleto, traduções, CI) e Fase 1 (conta, plano, pílula, tray, sessão nativa). O SAC bloqueia o `cargo build`.
- 2026-11-14 — Pedido do Dinis (num fork): código do sistema operativo atrás do trait `Platform`; textos, nome do dispositivo e atalhos dependentes da plataforma. Feito.
- 2026-11-15 — Fase 2: núcleo portado (279 testes), prompts e esquemas extraídos do Swift palavra a palavra, cliente SSE, cache em disco.
- 2026-11-15 — Fase 6 fechada (sem 3D nem figuras animadas): templates, renderizador SVG, curva arrastável, quadro de sinais, plano complexo, espaço Oxyz, prompt v22, código com cores VS Code, diagramas temporais, explicador de fórmulas. 684 testes.
- 2026-11-15 — Fase 5 fechada: voz premium ou do sistema, tecla de falar, transcrição na nuvem, tutor por voz, «Explica-me» (lição v14, DeepSeek com o Sonnet por trás), mascote animada. 572 testes.
- 2026-11-15 — Fase 4 fechada: lado nativo escrito (hooks, UIA, captura, OCR, caminho do PDF, janela do palco), pílula com «Ativar Alt-clique». Por compilar e medir: SAC. 506 testes.
- 2026-11-15 — Fase 4 (em curso): núcleo do Alt-clique portado com os testes do Mac (QuestionCropTests, OptionClickFixes, PDFQuestionRead, FastTranscription, Preread); palco por cima do ecrã. 501 testes.
- 2026-11-15 — Fase 3 fechada: TextHelp v5 na pergunta livre, ProblemVariant («Try a Similar One»). 430 testes.
- 2026-11-15 — Fase 3: palco sobre o leitor (`ui/stage/`), verificado no browser com o exam.pdf do Mac.
- 2026-11-15 — Fase 3: SolutionProvider + QuestionSession (núcleo) com testes; 415 testes.
- 2026-11-15 — Fase 3 (em curso): detetor de perguntas com os testes do Mac (páginas sintéticas e `exam.pdf`/`teste-modelo-eo.pdf` via pdf.js), RouteDecision, QuestionPages, leitor pdf.js. 340 testes.
