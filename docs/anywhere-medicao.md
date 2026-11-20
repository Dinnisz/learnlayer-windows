# Alt-clique: medição por app

> Medido a 2026-11-17 na app real (build de desenvolvimento, Windows 11, ecrã 2560×1440 a 125 %). Os cliques vieram de um utilitário de teste: com `LEARNLAYER_TEST_INPUT=1`, só em builds de desenvolvimento, o hook aceita eventos injetados. Neste PC não há Edge, Chrome, Word nem Acrobat; o Brave usa o mesmo Chromium e o mesmo leitor de PDF que o Chrome e o Edge.

Para cada app: o texto da pergunta saiu completo? De onde veio (`method` em `%APPDATA%\LearnLayer\anywhere-log.jsonl`: `pdf` = o próprio ficheiro, `text-range` = texto do documento pela UI Automation, `block` = bloco de uma página web, `region` = OCR da imagem, `+region` = cortado pela região encontrada na imagem)? Quanto tempo do clique ao palco?

| App | Página / ficheiro | Texto completo? | De onde veio | Tempo | Notas |
|---|---|---|---|---|---|
| Brave (página web) | `Tools/AnywhereProbe/quiz.html`, Pergunta 2 | sim (117 caracteres) | `block+region` | ~1 s | Palco por cima do Brave, fundo escurecido, menu em pt-PT. Esc fecha e o clique não chega à página. |
| Brave (página web) | `quiz.html`, Pergunta 1 (fórmula em KaTeX) | sim, depois da correção | `text-range` + região | ~1 s | A UI Automation dá a fórmula um símbolo por linha. O OCR leu «Pergunta 1» como «Pergunta I» e a região falhava; corrigido (DECISOES). Agora aparece «y‴ + 2y″ + 10y′ = 0» numa linha. |
| Brave (PDF) | `exames/` Matemática A, p. 3, item 2.2 | sim (500 caracteres, com o enunciado do grupo 2) | `pdf` (barra de endereço `file:///`) | ~1 s | Recorte do próprio PDF, como no Mac. «Mostra a resolução» sem sessão iniciada pede para entrar, sem custos. |
| Pílula › Capturar uma área | o mesmo PDF, item 1 | sim (a imagem; o rascunho do OCR deixou de fora as opções) | `capture` | — | Ecrã congelado, retângulo arrastado, recorte com as opções (A)–(D) no palco. |
| Pílula › Explicar o texto selecionado | frase selecionada no PDF | sim | cópia (Ctrl+C) | ~1 s | O leitor de PDF do Chromium não dá a seleção pela UI Automation: lida copiando-a, com a área de transferência reposta. Corrigido também: a pílula ficava com o teclado. |
| Chrome (página web) | `quiz.html`, Pergunta 2 | sim (117 caracteres) | `block+region` | ~1,1 s | Medido a 2026-11-19 (Chrome instalado com `winget`). Esc fecha; nada selecionado na página. Captura `capturas-windows/01-chrome-pergunta2.png`. |
| Chrome (página web) | `quiz.html`, Pergunta 1 (KaTeX) | sim, depois da correção | `block+region` | ~1,1 s | Saía «da equaçãoy ‴ + 2 y ″»; corrigido: «da equação y‴ + 2 y″ + 10 y′ = 0.» (`02-chrome-pergunta1-formula.png`). |
| Chrome (página web) | `quiz.html`, Pergunta 3 (`<sup>`) | sim, depois da correção | `block+region` | ~1,1 s | O expoente saía numa linha à parte («x² e» / «−x»); corrigido: «x² e⁻ˣ.» (`03-chrome-pergunta3-expoente.png`). |
| Edge (página web) | `quiz.html`, Perguntas 2 e 3 | sim (117 e 115 caracteres) | `block+region` | ~1,1 s | Igual ao Chrome, com o expoente certo. |
| Edge (PDF) | `exames/` Matemática A, p. 3, itens 2.2 e 2.3 | sim (500 e 393 caracteres, com o enunciado do grupo 2) | `pdf` | ~1,1 s; ~1,8 s no primeiro clique num PDF | O primeiro clique lê o ficheiro (~0,6 s). A captura da janela e a leitura do PDF passaram a correr em paralelo (o TypeScript desceu de ~850 para ~300 ms). Recorte do próprio PDF (`04-edge-pdf-mata-2.2.png`). |
| Bloco de Notas (em vez do Word) | ficheiro `.txt` com três perguntas numeradas | sim (só a pergunta 2, 94 caracteres) | `text-range+region` | ~1,1 s | O Word não se instala por `winget` sem licença do Microsoft 365; o Bloco de Notas usa o mesmo caminho (`TextPattern`). O cursor do Bloco de Notas não se mexeu e nenhum menu se ativou com o Alt. |
| Word | `.docx` com perguntas numeradas | por medir | esperado `text-range` | | Não instalado (precisa de licença do Microsoft 365). |
| Acrobat Reader | `exames/` | por medir | esperado `pdf`, senão `region` | | A instalação foi cancelada no pedido de administrador do Windows. |

Tempos: do clique ao palco, descontando o arranque do utilitário de teste (~0,9 s por chamada do `desk.ps1`).

**Hook do rato (2026-11-19):** com o palco aberto sobre o PDF do Edge, 30 Alt-cliques seguidos, a medir quanto tempo cada movimento do rato leva a chegar ao cursor: no máximo 10,5 ms (média 1,9 ms). O rato nunca congelou. **Esc com o foco noutra app:** abre-se o palco, põe-se o Chrome à frente e o Esc fecha o palco.

## O que se espera e porquê

- **PDF por caminho:** a barra de endereço do Edge e do Chrome (`file:///…pdf`), ou o nome do ficheiro no título da janela procurado em Transferências, Ambiente de trabalho, Documentos e OneDrive. O PDF abre-se localmente com o pdf.js e a pergunta sai do texto do ficheiro.
- **UI Automation:** texto do documento quando a app tem `TextPattern` (Word, leitores de PDF que o expõem), senão o bloco de elementos à volta do ponto e os vizinhos (páginas web).
- **Imagem + OCR:** a janela desenha-se a si própria (`PrintWindow`), o `Windows.Media.Ocr` lê as linhas, e o `QuestionLocator` encontra a região da pergunta. Só essa região vai para o modelo, e só quando o texto não chega.

## Um PDF mostrado como imagem, sem a app (2026-11-20)

Quando a app não sabe o caminho do PDF, lê a pergunta pelo OCR do ecrã. Esse caminho mede-se sem ninguém a clicar, com os exames de `exames/`:

```bash
node scripts/render-page.mjs exames/EX-FQA715-F1-2026-V1_net.pdf 4 1.5 <pasta>/EX-FQA715-p4
node scripts/browser-window.mjs <pasta>/EX-FQA715-p4 300 <pasta-janelas>/EX-FQA715-p4-s300
cd src-tauri && LEARNLAYER_OCR_JSON=1 LEARNLAYER_OCR_PAGE=<pasta>\EX-FQA715-p4 cargo test --release --lib ocr_on_a_saved_page -- --ignored
SCREEN_LABELS=<pasta> npx vitest run scripts/screen-labels.test.ts
```

Resultado depois das correções de 2026-11-20 (ver DECISOES). O relatório clica em cada pergunta que o texto do PDF tem: na primeira linha, a meio e na última linha. Para cada clique compara a etiqueta encontrada e verifica que o recorte tem todas as linhas da pergunta, nenhuma etiqueta de outra pergunta e, se houver uma legenda «Figura N», a figura. `SCREEN_DRAFTS=1` mostra o rascunho local ao lado do texto do PDF.

| Páginas | Perguntas encontradas | Cliques a meio e na última linha |
|---|---|---|
| 2–9 dos 9 exames, a 1,5× | 132 de 132 | 264 de 264 |
| 10–16, a 1,5× | 71 de 71 | 142 de 142 |
| 2–9 numa janela de browser 1600×1000, scroll 0 e 300 | 201 de 201 | 396 de 396 |
| 2–9 a 2,0× | 131 de 132 (um «1.» lido «I.» sem nada que o desfaça) | 262 de 262 |
| 2–9 a 1,0× (página com ~600 px) | 92 de 132 | — |

Nas páginas inteiras nenhum recorte deixa de fora uma linha da sua pergunta nem leva a etiqueta de outra; nas janelas também não, com a página a continuar abaixo da borda. A 1,0× o próprio motor lê mal o texto de 10 px; ver DECISOES, «Letra pequena no ecrã».
