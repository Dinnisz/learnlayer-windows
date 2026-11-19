# Prompt para o Claude Code no PC Windows

Abre o Claude Code na pasta `learnlayer-windows` do PC Windows e cola o texto abaixo, tal como está.

---

Vais testar a app LearnLayer para Windows a sério, neste PC. Lê primeiro `CLAUDE.md`, `docs/PROGRESSO.md` e `docs/anywhere-medicao.md`. Responde em português de Portugal.

**Preparação**
1. `git fetch` e `git checkout main && git pull`. Se os PRs «Mac visual parity» (#1) e «Windows onboarding clips» ainda não estiverem no `main`, trabalha a partir de um ramo novo que os junte (`git merge origin/feat/mac-visual-parity origin/feat/windows-onboarding-clips`).
2. `npm ci`, depois `$env:LEARNLAYER_TEST_INPUT=1; npm run tauri dev`. Usa os utilitários de `scripts/desktop-test/` (README) para cliques, teclas e capturas de ecrã. Se faltar Edge, Chrome, Word ou Acrobat Reader, instala-os com `winget`. Diz-me antes de instalar outra coisa.
3. Guarda as capturas em `docs/capturas-windows/`.

**Parte 1: sem sessão iniciada (não gasta nada)**
1. **Janelas e materiais.** O palco tem acrílico escuro por cima da app de baixo. Com «Efeitos de transparência» desligado fica preto opaco, e com «Mostrar animações» desligado só há fades. A janela principal tem Mica e a pílula fica centrada no topo. Liga e desliga as duas definições do Windows e tira capturas.
2. **DPI.** Muda a escala do ecrã para 100 %, 125 %, 150 % e 200 %. Em cada uma, abre o leitor com `exames/` (Matemática A), clica numa pergunta e confirma três coisas: a pergunta voa da página para o palco e assenta sem saltos, o texto e o recorte estão nítidos, e nada fica cortado. Num ecrã com mais de 956 px de altura lógica, o palco tem de ficar maior (StageScale): mede `document.querySelector('.stage-column').currentCSSZoom` e confirma que é a altura a dividir por 956, entre 1 e 1,6. Se houver dois monitores com escalas diferentes, o palco tem de abrir no monitor do clique e com a escala desse monitor.
3. **Alt-clique em cada app.** Preenche as linhas «por medir» de `docs/anywhere-medicao.md`: Edge (página web e PDF de `exames/`), Chrome (`referencia-mac/Tools/AnywhereProbe/quiz.html`), Word (um `.docx` com perguntas numeradas, que podes criar) e Acrobat Reader (`exames/`). Para cada uma: o texto saiu completo, de onde veio (o `method` em `%APPDATA%\LearnLayer\anywhere-log.jsonl`) e quanto tempo passou do clique ao palco. Confirma também que a pergunta voa a partir da zona onde clicaste, que o clique e o Alt nunca chegam à app de baixo (nenhum link abre, nenhum menu se ativa) e que o Esc fecha mesmo com o foco noutra app. Faz ainda o teste do hook: com o palco a desenhar uma figura pesada, clica muitas vezes depressa. O rato nunca pode congelar.
4. **Numeração dos exames.** Corre `EXAM_LABELS=1 npx vitest run scripts/exam-labels.test.ts --silent=false` e vê Biologia e Geologia, Português, História A, Francês e Inglês. Hoje alguns itens de um grupo saem com o prefixo e outros sem ele («II.1», «2», «3»), e os passos numerados de um procedimento (Biologia, p. 11) contam como itens. A causa está explicada em `docs/DECISOES.md` (2026-11-18): `withoutRepeatedLabels` e `numberingRestarts` só olham para uma página. Propõe e implementa a versão que olha para o documento todo, com testes que usam esses PDFs. Os PDFs ficam fora do git, por isso os testes saltam quando eles não existem. Mostra-me as etiquetas antes e depois. Não pode piorar nenhum dos outros exames nem os testes de `QuestionDetectorTests` portados.
5. **Clipes do onboarding.** Grava os clipes em inglês (Kokoro, grátis), seguindo `docs/PARA-O-DINIS.md` ponto 9. Os de português custam menos de 1 cêntimo: pede-me autorização antes de os gravar. Depois corre o onboarding do início (Definições › repor) e confirma que os ecrãs «talk» e «tryIt» têm voz.

**Parte 2: com a minha sessão iniciada (gasta API: máximo 0,50 USD nesta sessão, cada chamada registada em `docs/CUSTOS.md`)**
Pede-me para entrar na conta pelo browser e espera até eu dizer que entrei. Depois:
1. **Resolução ao vivo.** Abre uma pergunta de Matemática A e outra de Física e Química A e carrega em 3. A resolução aparece por partes, as fórmulas não têm erros do KaTeX e passar o rato num passo sublinha os dados no enunciado.
2. **«Explica-me».** A voz tem de ser de Portugal (nunca brasileira). Cada passo acende quando é dito. A mascote repousa ao lado da explicação, e o ponto e a lupa de cada passo aparecem no sítio certo.
3. **Tutor por voz.** Mantém Ctrl+Win premidas, diz «não percebi o passo 2» e larga. Tem de se ouvir logo a frase de abertura e depois a resposta. Mede o tempo entre largar a tecla e o envio (tem de ser menos de 300 ms) e regista-o em `docs/DECISOES.md`.
4. **Voz premium.** Com a voz premium desligada, confirma que não sai nenhum pedido `/v1/audio/speech`.

**Regras**
- Não alteres o backend, a landing page, a Paddle nem a base de dados. Não ponhas chaves nem tokens no código. Nunca chames a API paga em testes automáticos. Nunca enfraqueças nem apagues testes.
- Cada bug que encontrares: corrige-o num commit pequeno, com a mensagem em inglês, num ramo `fix/windows-live-test`. No fim faz push e abre um PR para o `main`.
- No fim, dá-me um resumo curto: o que passou, o que falhou e o que corrigiste, com as capturas.
