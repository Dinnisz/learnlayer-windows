# Fase 4 — Alt-clique em qualquer app

## O que foi feito

- **Onde está a pergunta na janela (`core/anywhere/`)**, porte do Mac com os testes dele:
  - `questionBand.ts`: as linhas da pergunta tocada, da etiqueta («Questão 2», «3.», «I.2)») à seguinte, sem o cabeçalho do exame nem o rodapé; alíneas «2.1» com o enunciado comum. São os 19 casos de `QuestionCropTests`.
  - `questionRegion.ts`: a região na imagem da janela (`InkMap`: tinta, margens da página, figuras), os recortes e onde ficam as figuras. São os casos do `OptionClickFixesTests` (janela tipo Preview desenhada ponto a ponto) e do `VectorFigureTests` (figuras unidas às etiquetas).
  - `screenQuestion.ts`: o texto lido pela UI Automation cortado à pergunta da região (`trimmed`, `keepingPart`, `questionRange`), a `ExamQuestion` que daí sai e a linha do `anywhere-log.jsonl` (só contagens e nomes de apps).
  - `uiaQuestion.ts`: a escolha da pergunta no texto de um documento ou num bloco de página web alargado aos vizinhos (`AccessibilityReader`).
  - `pdfQuestionRead.ts`: encaixar a página do PDF no ecrã pelas linhas lidas (semelhança de texto e mínimos quadrados) e a pergunta debaixo do clique, tirada do texto do próprio ficheiro (`PDFQuestionReadTests`).
  - `clickReading.ts`: o que um clique abre. Primeiro o PDF por caminho; depois o texto da UI Automation cortado à região; depois o texto do OCR. A imagem da região vai para o modelo só quando o texto não chega.
  - `preread.ts`: o plano da leitura antecipada (`PrereadTests`), local e grátis no Windows (ver DECISOES).
- **Transcrição rápida**, porte do `FastTranscription`:
  - `core/problems/questionTranscription.ts` e `fastTranscription.ts`, com cache em `fast-questions.json`, uma chamada por imagem, prazos pelo relógio, nova tentativa noutro fornecedor e leitura antecipada dois a dois.
  - A corrida com a resolução está na `QuestionSession`: a leitura que chegar primeiro e passar a verificação é a que se mostra.
  - O modelo `qwen` só se usa com a chave local em Debug, como no Mac (PARA-O-DINIS, ponto 3).
- **O palco por cima do ecrã (`ui/overlay.html`)**: o mesmo `Stage` do leitor com uma segunda origem, a imagem da pergunta.
  - Enquanto o modelo lê a imagem, mostra o rascunho do OCR, depois a leitura tipografada (KaTeX, figuras recortadas da imagem). Se a leitura falhar ou demorar mais de 12 s, mostra o recorte.
  - «Reading…» e «Couldn’t read this here.» aparecem junto ao cursor.
  - Uma pergunta encontrada no PDF abre exatamente como no leitor.
- **Lado nativo (`src-tauri/src/platform/windows/anywhere/`)**:
  - `hook.rs`: hooks `WH_MOUSE_LL` e `WH_KEYBOARD_LL` numa thread própria. Engolem o Alt-clique (o «down» e o «up»), impedem o menu do Alt e tratam do Esc global com o palco aberto e de `Ctrl+Shift+Espaço`. São reinstalados de 5 em 5 s e avisam se o Windows os tiver tirado.
  - `capture.rs`: a janela debaixo do ponto e a sua imagem (`PrintWindow`).
  - `ocr.rs`: `Windows.Media.Ocr` em pt-PT e inglês.
  - `uia.rs`: UI Automation (texto do documento, blocos, seleção, barra de endereço), nunca em campos de palavra-passe.
  - `pdf_path.rs`: o caminho do PDF que a janela mostra.
  - `overlay.rs`: a janela do palco no monitor do clique, com acrílico, que devolve o teclado à app ao fechar.
  - Exclusões: Safe Exam Browser, LockDown Browser e gestores de palavras-passe.
- **Pílula:** quando o Windows tira o hook, oferece «Ativar Alt-clique em qualquer app». O interruptor fica guardado entre arranques.

## Como verificar

```
npm test
```

```
npm run dev
```

Abrir `http://localhost:1420/overlay.html?demo=anywhere`: um clique inventado numa janela de exame inventada (sem lado nativo nem custos). Abre a pergunta I.2 com o circuito; com «3» abre a resolução de exemplo; com Esc fecha.

Na app (quando compilar): `PARA-O-DINIS.md`, ponto 7, e a tabela `docs/anywhere-medicao.md`.

## Falta (registado em PROGRESSO.md)

- Compilar e experimentar o lado nativo, e medir em Edge, Chrome, Word e Acrobat (`anywhere-medicao.md`). Falta verificação do Dinis: o Smart App Control impede compilar o Rust nesta máquina.
- Ler antecipadamente o PDF que está à frente antes do primeiro clique. Hoje o PDF fica aberto e lido a partir do primeiro clique, e os cliques seguintes encontram-no pronto.
- A sessão própria do texto selecionado (`SelectionSession`) entra com o «Explicar texto selecionado» da pílula (fase 7).
- Redesenhar as figuras a partir dos traços do PDF (`VectorPage`) entra na fase 6.
