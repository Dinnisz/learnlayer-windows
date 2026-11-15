# Fase 2 — Núcleo portado e cliente de IA

## O que foi feito

Tudo em `core/`, TypeScript sem DOM, com os testes do Mac portados com os mesmos casos.

| Módulo | Porte de | Testes portados |
|---|---|---|
| `ai/partialJSON.ts` | `AI/PartialJSON.swift` (JSON parcial, chamadas de ferramenta, `SolutionJSON`, `StreamedPart`) | `PartialJSONTests` |
| `math/expression.ts`, `math/verifier.ts` | `Explanation/Expression.swift`, `Verifier.swift` | `ExpressionVerifierTests` (+ casos do parser) |
| `problems/choiceCheck.ts` | `Problems/ChoiceCheck.swift` | `ChoiceCheckTests` |
| `problems/signTable.ts` | `Problems/SignTable.swift` | `SignTableTests` |
| `math/latexText.ts` | `Math/LatexText.swift` | `LatexTextTests` |
| `problems/passage.ts` | `Problems/Passage.swift` (sem a leitura da página PDF, que vem com o pdf.js) | `PassageTests` |
| `problems/questionLabels.ts`, `textNormalizer.ts` | `QuestionLabels.swift`, `Reader/TextNormalizer.swift` | `QuestionLabelsTests` (+ casos de `FlattenedMathTests`, `FigureTopicTests`, `QuestionDetectorTests`) |
| `problems/flattenedMath.ts` | `Problems/FlattenedMath.swift` | `FlattenedMathTests` |
| `problems/problemSolution.ts` | `Problems/ProblemSolution.swift`, `FormulaUse.swift` (leitura tolerante) | `NeedsFigureTests`, `SolveScopeTests` (etiquetas), `SolutionJSONRepairTests`, casos de `LiveRunFixTests` |
| `ai/modelRouting.ts` | `ModelRouting.swift`, `AISettings.swift`, `ModelPrice.swift` | `ModelRoutingTests`, `CheapFirstRoutingTests` |
| `illustrations/figureTopic.ts` | `Illustrations/FigureTopic.swift` (as regras) | `FigureTopicTests` |
| `prompts/` | os prompts e esquemas da secção 6 | `portuguesePromptRulesOutBrazilianForms`, casos de `SolveScopeTests` e `FlattenedMathTests` |
| `ai/modelClient.ts` | `OpenRouterClient.swift` (pedido, SSE, falhas), `ReportedUsage`, `OpenRouterMessages`, `NetworkFailure` | `quotaAndRateLimitsAreNotRetried`, o campo `reasoning`, `withFirstTextDeadline` |
| `ai/diskCache.ts` | `DiskCache`, `QuestionImageCache.digest`, a chave de `SolutionProvider` | novos |
| `problems/solutionRequest.ts` | `OpenRouterClient.solution`/`streamedSolution`, `TutorLanguage` | novos |

**Prompts palavra a palavra.** `scripts/extract-prompts.mjs` lê cada literal de texto dos ficheiros de prompts do Mac tal como o Swift o constrói (indentação, `\` no fim da linha, escapes, interpolações) e avalia os esquemas JSON a partir dos dicionários Swift. O resultado fica em `core/prompts/swift/*.json` (no git). O TypeScript só junta os textos e preenche as interpolações; falta de um valor é erro, nunca texto vazio. Um teste volta a extrair e compara sempre que `referencia-mac/` existe.

Já com função própria: `ProblemPrompt` (v33), `QuestionClassifier`, `FigureTranscription` (v2), as regras de `QuestionTranscription`, `OptionFigures` e o prompt da transcrição rápida (fq5). Os outros (`ExplanationPrompt` v14, `IllustrationPrompt` v22, `TextHelp` v5, `ProblemVariant`, `MascotLessonPrompt` v14, `VoiceTutorPrompt` v24, `ExplanationPlanner`) já têm o texto e o esquema extraídos; as funções que os montam entram na fase da funcionalidade (ver `DECISOES.md`).

**Cliente de IA.** Mesmo corpo do Mac (chaves ordenadas como o `JSONSerialization`, prompt do sistema em cache nos modelos Anthropic, imagens JPEG em base64), cabeçalhos `X-LearnLayer-*` só pela API, streaming SSE com JSON parcial, timeout por inatividade (como o `URLRequest`), um refresh forçado num 401, repetição única para «reasoning is mandatory» e «schema too large», chamadas de ferramenta lidas como JSON ou recusadas logo. Todas as recusas têm mensagem própria do catálogo (`failureMessage`), e as quotas mensais pedem o botão Upgrade (`offersUpgrade`).

**Cache em disco.** As chaves são as do Mac (SHA-256 das partes separadas por U+001F); os ficheiros ficam em `%APPDATA%\LearnLayer\` através de `data_file_read`/`data_file_write` (só os nomes da secção 4.4, escrita atómica).

## Como verificar

```
npm test          # 279 testes
npm run lint      # inclui a verificação de caracteres invisíveis
node scripts/extract-prompts.mjs --check   # os textos no git são os do Mac
```

## Critérios de aceitação

| Critério | Estado |
|---|---|
| Os testes portados de `LearnLayerTests/` para estes módulos passam com os mesmos casos | ✅ (exceto `QuestionDetectorTests`, que passa para a Fase 3 com o pdf.js — ver `DECISOES.md`) |
| Um pedido de streaming ao Worker de teste chega por partes (uma chamada real, em `CUSTOS.md`) | ⛔ **falta verificação do Dinis**: precisa da app nativa a correr (Smart App Control) e de uma conta com sessão. O streaming está testado contra um servidor simulado (pedaços, comentários, linhas partidas, uso no fim). |
| `402` e `503` mostram as mensagens certas | ✅ no núcleo (teste); a apresentação no palco vem com a Fase 3 |
