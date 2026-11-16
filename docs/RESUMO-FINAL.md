# Resumo final — LearnLayer para Windows

As fases 0 a 8 estão feitas no código. O que falta depende de ti (`PARA-O-DINIS.md`), sobretudo do ponto 1: o Smart App Control desta máquina bloqueia a compilação do Rust. Por isso a app nativa ainda não correu e **não há um instalador em `dist/`**. O script para o gerar está pronto (`scripts/build-installer.ps1`) e o CI também o gera.

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
