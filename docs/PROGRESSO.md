# Progresso — LearnLayer para Windows

> Se a sessão parar: lê este ficheiro primeiro e continua do «Próximo passo». Nunca recomeces do zero.

## Estado atual

- **Fase atual:** 0 (Esqueleto)
- **Próximo passo:** terminar a instalação das ferramentas, criar o projeto Tauri 2 + React + TS, converter as traduções.
- **Última atualização:** 2026-11-14

## Ambiente (máquina do Dinis, Windows 11 Home x64)

| Ferramenta | Estado | Como foi instalada |
|---|---|---|
| winget 1.29 | já existia | — |
| WebView2 Evergreen 157 | já existia | — |
| Git | a instalar | `winget install Git.Git` |
| Node LTS | a instalar | `winget install OpenJS.NodeJS.LTS` |
| Rust (rustup, stable-msvc) | a instalar | `winget install Rustlang.Rustup` |
| VS 2022 Build Tools (C++ x64 + ARM64) | a instalar | `winget install Microsoft.VisualStudio.2022.BuildTools` com o workload `VCTools` |

Os instaladores foram lançados com `--accept-source-agreements --accept-package-agreements` (aceitam as licenças dos pacotes em nome do Dinis, que autorizou as instalações).

## Estrutura de pastas

```
Learnlayer/
├─ CLAUDE.md               instruções de construção (não alterar)
├─ referencia-mac/         código Swift, backend e capturas — só leitura, fora do git
├─ exames/                 PDFs de teste — fora do git
├─ core/                   TypeScript puro, sem DOM: porte fiel da lógica Swift
│  ├─ account/             AppLogin (PKCE), HomeRoute, tipos da conta
│  ├─ ai/                  AIGateway, BackendClient, cliente SSE, PartialJSON, caches
│  ├─ problems/            prompts, esquemas, QuestionDetector, ChoiceCheck, SignTable…
│  ├─ math/                Expression/Verifier, LatexText
│  ├─ illustrations/       FigureTopic, IllustrationTemplate
│  ├─ notch/               NotchMode, NotchAction
│  └─ i18n/                leitor das traduções + locales/en.json, pt-PT.json (gerados do .xcstrings)
├─ ui/                     React + Vite, só apresentação
│  ├─ windows/             main (janela principal), pill, stage
│  ├─ components/
│  └─ locales/             textos próprios do Windows (substituem «Mac», «⌥-click»)
├─ src-tauri/              Rust: hook, UIA, captura, OCR, credenciais, janelas
├─ scripts/                conversão do .xcstrings, utilitários de build
├─ docs/                   PROGRESSO, DECISOES, PARA-O-DINIS, CUSTOS, fase-N
└─ .github/workflows/      CI em windows-latest (build + testes, sem segredos)
```

Os testes ficam ao lado do código (`*.test.ts`), portados de `referencia-mac/LearnLayerTests/` com os mesmos casos.

## Plano das fases

| Fase | O quê | Estado |
|---|---|---|
| 0 | Esqueleto: Tauri 2 + React + TS + Vite + Vitest + Rust, lint, CI, traduções (609 chaves, en + pt-PT) | em curso |
| 1 | Conta e plano: pílula, tray, janela principal, login PKCE e por código, deep link, Credential Manager, `/v1/me`, checkout | por fazer |
| 2 | Núcleo portado (`core/`) e cliente de IA (SSE, refresh no 401, erros, cache) | por fazer |
| 3 | Leitor de PDF (pdf.js) e palco (menu, Hint, Let me try, Solution, Ask) | por fazer |
| 4 | Alt-clique em qualquer app (hook, UIA, PDF por caminho, captura + OCR, transcrição rápida) | por fazer |
| 5 | Voz e mascote (TTS, STT, push-to-talk, «Explica-me») | por fazer |
| 6 | Figuras (templates, 3D, quadros de sinais, diagramas temporais, código) | por fazer |
| 7 | Onboarding, Memória, Definições completas | por fazer |
| 8 | Distribuição (instalador, assinatura, atualização, sincronização cifrada) | por fazer |

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

- 2026-11-14 — Pacote extraído; lidos `referencia-mac/CLAUDE.md`, `AGENTS.md`, `SETUP.md`, capturas `open-q14-poster` e `s2-end`, e os ficheiros de conta/gateway/notch/home. Instalação das ferramentas lançada.
