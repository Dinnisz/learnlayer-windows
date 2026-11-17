# Resumo final — LearnLayer para Windows

As fases 0 a 8 estão feitas no código.

**Atualização 2026-11-17:** o repositório público [Dinnisz/learnlayer-windows](https://github.com/Dinnisz/learnlayer-windows) compila no CI. Passam o lint, os testes de TypeScript, `cargo fmt`, `clippy` e os 22 testes do Rust. O CI gerou o instalador **`dist/LearnLayer_0.1.0_x64-setup.exe`** (5,9 MB, sem assinatura).

O que falta depende de ti (`PARA-O-DINIS.md`). O Smart App Control foi desligado e a app instalada já abre neste PC (janela principal com a introdução e pílula no topo). Para distribuir aos alunos falta a assinatura (ponto 4).

## Atualização de 2026-11-17

- **A app real corre neste PC.** O Smart App Control foi desligado. O CI no GitHub (repositório público `Dinnisz/learnlayer-windows`) está verde: lint, 808 testes de TypeScript, `cargo fmt`, `clippy` e 22 testes de Rust. O instalador está em `dist/`.
- **Testado na app real** (`docs/anywhere-medicao.md`): Alt-clique numa página web e num PDF, Esc, pílula, «Capturar uma área», «Explicar o texto selecionado» e microfone. Corrigi o que esses testes mostraram:
  - o OCR lia «Pergunta 1» como «Pergunta I»;
  - fórmulas de páginas web saíam um símbolo por linha;
  - a seleção do leitor de PDF do Chromium não era lida;
  - a pílula ficava com o teclado;
  - aparecia o pedido de microfone «localhost».
- **Figuras novas:**
  - circuitos: resolvidos e verificados contra a resposta, e desenhados como esquema 2D;
  - sólidos em 3D com three.js: revoluções, superfícies, secções e os sólidos fixos do Mac, com o volume verificado contra a resposta;
  - o passo em foco comanda a figura: junta as resistências e acende a parte do sólido;
  - o passo que escreve o integral do volume faz a fatia percorrer o sólido (a app calcula esse integral e compara-o com o volume); os cartões podem montar o sólido peça a peça;
  - nas figuras de geometria no espaço, o passo acende os pontos, arestas, plano, reta, normal e o ponto de interseção que nomeia;
  - 17 figuras animadas do Mac portadas com os testes: Cálculo 1, séries e curvas, e as cenas de física (carro, lançamento vertical, plano inclinado). Ver em `overlay.html?demo=animated`.
- **Leitor de PDF:** o texto seleciona-se. O botão «Ask» (ou Enter) pergunta sobre a seleção: prosa abre o excerto e uma linha de matemática abre o explicador.
- Utilitários para testar a app real sem pessoa: `scripts/desktop-test/`.

## Em números

- Cerca de 80 commits no `main`, nenhum push.
- ~51 000 linhas de TypeScript (`core/` e `ui/`) e ~3 200 de Rust (`src-tauri/src/`).
- 763 testes a passar no Vitest. A maioria são os testes do Mac portados com os mesmos casos. O lint e a verificação de tipos estão limpos.
- Custo da API paga: **0,00 USD**. Nenhuma chamada real: tudo foi desenvolvido com as respostas falsas do Mac.

## O que está feito, por fase

| Fase | Estado |
|---|---|
| 0 Esqueleto | Tauri 2 + React + TS + Vite + Vitest + Rust; lint; CI em `windows-latest`; 609 chaves en + pt-PT. |
| 1 Conta e plano | Pílula, tray, janela principal; login PKCE e por código; `learnlayer://`; tokens no Gestor de Credenciais; refresh serializado; `/v1/me`; checkout no site. |
| 2 Núcleo e IA | Prompts e esquemas palavra a palavra e com as mesmas versões; JSON parcial; verificação das expressões; cliente SSE com refresh no 401 e todos os códigos de recusa; cache em disco. |
| 3 Leitor e palco | pdf.js; deteção das perguntas; palco com menu, pista, «Deixa-me tentar», resolução em cascata, fórmulas, sublinhados, escolha múltipla, texto com citações, pergunta livre, pergunta semelhante. |
| 4 Alt-clique | Hook, UI Automation, PDF por caminho, captura + OCR, transcrição rápida, região da pergunta, palco por cima de outra app. O núcleo está em TypeScript com os testes do Mac; o lado nativo está escrito mas por compilar. |
| 5 Voz e mascote | Voz premium (Joana, pt-PT) ou do sistema (nunca pt-BR); tecla de falar; transcrição; tutor por voz; «Explica-me» com marcas sincronizadas; mascote animada. |
| 6 Figuras | Templates, renderizador SVG com rótulos que não se tapam, curva arrastável, quadro de sinais, plano complexo, espaço Oxyz, diagramas temporais, código com as cores do VS Code, explicador de fórmulas. |
| 7 Onboarding, Memória, Definições | Memória local com o plano pedagógico; páginas Memória e Documentos com dados reais; todas as Definições; introdução de oito ecrãs em que a pergunta de exemplo abre o palco. |
| 8 Distribuição | Sincronização cifrada no formato do Mac; «Abrir com o Windows»; atualizações com «Reiniciar para atualizar»; script do instalador com assinatura Azure; trabalho do CI. |
| Depois da fase 8 | As ações da pílula passaram a funcionar: perguntar sobre o exercício, sugestões, silenciar, «Capturar uma área» e «Explicar o texto selecionado». O texto selecionado abre uma passagem própria, como no Mac. |

## O que só tu podes fazer (por ordem)

1. **Uma máquina que compile o Rust**, ou o CI depois de um push teu (ponto 1). Sem isto não há app nativa nem instalador. Quando a tiveres, diz «continua»: corro `cargo fmt`, `clippy` e `cargo test` e corrijo o que o compilador apontar. Quase todo o Rust das fases 4–8 foi escrito sem compilar.
2. **Entrar na conta do Worker de teste** e experimentar o Alt-clique, a voz e a introdução (pontos 6–8 e 10).
3. **Assinatura de código** com o Azure Trusted Signing (ponto 4) e o **URL e a chave das atualizações** (ponto 5).
4. **Backend e site** (não lhes toquei): o segundo link de download para o Windows (ponto 2) e o modelo da transcrição rápida na lista do servidor (ponto 3).
5. **Clipes do onboarding** com as teclas do Windows (ponto 9).

## O que ficou mais simples do que no Mac (registado em `PROGRESSO.md` e `DECISOES.md`)

- Figuras 3D com three.js e as figuras pré-feitas animadas: uma figura que não se pode desenhar não aparece.
- Marcas da voz e da lição «Explica-me» por cima da figura.
- O menu de estudo em português do explicador de fórmulas.
- O reconhecimento de voz local do Windows: hoje a transcrição vai sempre para a nuvem, e a latência dos dois caminhos está por medir.

## Onde está cada coisa

- `docs/PROGRESSO.md`: o estado e o próximo passo.
- `docs/fase-0.md` a `docs/fase-8.md`: o que cada fase fez e como se verifica.
- `docs/DECISOES.md`: cada dúvida e a escolha feita.
- `docs/PARA-O-DINIS.md`: o que falta de ti, com os passos exatos.
- `docs/CUSTOS.md`: as chamadas pagas (nenhuma).
