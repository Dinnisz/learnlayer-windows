# Alt-clique: medição por app

> Falta verificação do Dinis. Nesta máquina o Smart App Control impede compilar o lado nativo (`PARA-O-DINIS.md`, pontos 1 e 7), por isso nenhuma linha foi medida ainda. O palco e a decisão foram verificados no browser (`overlay.html?demo=anywhere`) e com testes.

Para cada app: o texto da pergunta saiu completo? De onde veio (`method` em `%APPDATA%\LearnLayer\anywhere-log.jsonl`: `pdf` = o próprio ficheiro, `text-range` = texto do documento pela UI Automation, `block` = bloco de uma página web, `region` = OCR da imagem, `+region` = cortado pela região encontrada na imagem)? Quanto tempo do clique ao palco?

| App | Página / ficheiro | Texto completo? | De onde veio | Tempo | Notas |
|---|---|---|---|---|---|
| Edge (PDF) | `exames/` (Matemática A) | por medir | esperado `pdf` (barra de endereço `file:///`) | | |
| Edge (página web) | `Tools/AnywhereProbe/quiz.html` | por medir | esperado `block` | | |
| Chrome | `Tools/AnywhereProbe/quiz.html` | por medir | esperado `block` (1.º clique numa app nova pode levar +0,8 s) | | |
| Word | `.docx` com perguntas numeradas | por medir | esperado `text-range` | | |
| Acrobat Reader | `exames/` | por medir | esperado `pdf` (título da janela + pastas habituais), senão `region` | | |

## O que se espera e porquê

- **PDF por caminho:** a barra de endereço do Edge e do Chrome (`file:///…pdf`), ou o nome do ficheiro no título da janela procurado em Transferências, Ambiente de trabalho, Documentos e OneDrive. O PDF abre-se localmente com o pdf.js e a pergunta sai do texto do ficheiro.
- **UI Automation:** texto do documento quando a app tem `TextPattern` (Word, leitores de PDF que o expõem), senão o bloco de elementos à volta do ponto e os vizinhos (páginas web).
- **Imagem + OCR:** a janela desenha-se a si própria (`PrintWindow`), o `Windows.Media.Ocr` lê as linhas, e o `QuestionLocator` encontra a região da pergunta. Só essa região vai para o modelo, e só quando o texto não chega.
