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
| Chrome / Edge | — | por medir | | | Não instalados neste PC. O Brave cobre o mesmo motor. |
| Word | `.docx` com perguntas numeradas | por medir | esperado `text-range` | | Não instalado neste PC. |
| Acrobat Reader | `exames/` | por medir | esperado `pdf`, senão `region` | | Não instalado neste PC. |

## O que se espera e porquê

- **PDF por caminho:** a barra de endereço do Edge e do Chrome (`file:///…pdf`), ou o nome do ficheiro no título da janela procurado em Transferências, Ambiente de trabalho, Documentos e OneDrive. O PDF abre-se localmente com o pdf.js e a pergunta sai do texto do ficheiro.
- **UI Automation:** texto do documento quando a app tem `TextPattern` (Word, leitores de PDF que o expõem), senão o bloco de elementos à volta do ponto e os vizinhos (páginas web).
- **Imagem + OCR:** a janela desenha-se a si própria (`PrintWindow`), o `Windows.Media.Ocr` lê as linhas, e o `QuestionLocator` encontra a região da pergunta. Só essa região vai para o modelo, e só quando o texto não chega.
