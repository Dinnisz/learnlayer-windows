# Fase 3 — Leitor de PDF e palco

## O que foi feito

- **Página pura (`core/pdf/page.ts`)**: o texto da página e a caixa de cada carácter, como o PDFKit dá. O pdf.js preenche-a (`core/pdf/pdfjsText.ts`). Os testes do Mac que desenham páginas com CoreText usam páginas sintéticas (`core/testing/testPages.ts`).
- **Detetor de perguntas (`core/problems/questionDetector.ts`)**: porte do `QuestionDetector.swift` com colunas (`PDFColumns`) e ordem de leitura (`PDFReadingOrder`). Os 26 casos de `QuestionDetectorTests` passam, incluindo `exam.pdf` e `teste-modelo-eo.pdf` lidos pelo pdf.js. Cada página leva no máximo ~20 ms.
- **Que páginas e que recortes vão com a pergunta**: `QuestionPages`, `PassagePages`, a geometria do `PageImage` (JPEG até 1100 px, qualidade 0,7) e `Passage.lines`.
- **Rota e escalada**: `RouteDecision` (+ classificador), `ReadingAnswerCheck`, `AnswerAudit`, `FigureConsistency`, `ListeningDetection`.
- **O palco**: `StatementQuotes` (sublinhados só do que existe carácter a carácter), `SolutionReveal` (cascata), `SolveProgress` (frases da espera).
- **`SolutionProvider` e `QuestionSession`** (o coração): cache em disco, rota, streaming com prazo para o primeiro texto, escalada para o modelo forte, Let me try, pergunta livre, transcrição de itens de escuta.
- **Leitor (`ui/reader.html`)**: abrir, arrastar um PDF, scroll, zoom (Ctrl + = / − / 0), Ctrl+O; páginas desenhadas perto do ecrã; o rato muda para mão sobre o rótulo de uma pergunta.
- **Palco (`ui/stage/`)**: página escurecida e desfocada; o enunciado do grupo e a parte levantados como recortes brancos; menu 1–4, Enter, Esc; Pista com passos (← →), Let me try, Resolução (caixa da resposta, cartões em cascata, Fórmulas), respostas de texto com excerto e pontos-chave, pergunta livre, linha de progresso, recusas (402/503 com Upgrade), entrar na conta. A opção certa de uma escolha múltipla fica circulada no próprio recorte.

## Como verificar

```
npm test
```

```
npm run dev
```

Abrir `http://localhost:1420/reader.html?open=/@fs/<caminho>/referencia-mac/Tools/TestPDFs/exam.pdf`, clicar em «I.1)», carregar em 3. Num browser em desenvolvimento as resoluções vêm do `MockSolution.json` do Mac (sem custos); `?live=1` usa a API.

O relatório das etiquetas detetadas nos exames de `exames/`:

```
EXAM_LABELS=1 npx vitest run scripts/exam-labels.test.ts --silent=false
```

## Falta (fica para depois, registado em PROGRESSO.md)

- Builders dos prompts `TextHelp` v5 (a pergunta livre usa por agora um contexto simples), `ProblemVariant` («Try a Similar One») e `ExplanationPrompt` v14 (explicador de fórmulas soltas).
- Comparar com a app Mac as etiquetas de Biologia, Português e História (grupos que recomeçam a numeração).
- Medir os 150 ms da abertura do palco na app Tauri, e as capturas a 1366×768 e 1920×1080 — falta verificação do Dinis (o Rust não compila nesta máquina por causa do Smart App Control).
- Uma chamada real em streaming ao Worker de teste (fase 2) — falta verificação do Dinis.
