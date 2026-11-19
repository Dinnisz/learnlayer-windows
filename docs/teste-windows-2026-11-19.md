# Teste na app real (Windows), 2026-11-19

Build de desenvolvimento (`LEARNLAYER_TEST_INPUT=1 npm run tauri dev`), Windows 11, ecrã 2560×1440. Ramo `fix/windows-live-test`. Capturas em `docs/capturas-windows/`.

## Parte 1 (sem sessão, sem custos)

| Ponto | Resultado | Notas |
|---|---|---|
| Palco com acrílico | passou | Fundo escurecido e desfocado por cima da app (`08-palco-com-acrilico.png`). |
| Transparência desligada | passou | Preto opaco (`07-palco-sem-transparencia.png`). Animações desligadas: só se viu o estado final; o fade não se mede numa captura. |
| Janela principal e pílula | passou | Pílula centrada no topo; ao passar o rato abre os seis ícones (`05-pilula-aberta.png`); janela principal escura com a barra lateral (`06-janela-principal.png`). O Mica nota-se pouco com fundo escuro. |
| Escala 100 % | passou, depois de uma correção | Uma pergunta alta (Matemática A, item 3) deixava as opções 3 e 4 do menu fora do ecrã; corrigido como no Mac (`09-…`, `10-…`). |
| Escala 150 % e 200 % | passou | Palco nítido, nada cortado (`11-…`, `12-…`). |
| StageScale | passou | `currentCSSZoom` da `.stage-column`: 1,205 com 1152 px de altura (125 %) e 1,506 com 1440 px (100 %), igual a altura ÷ 956. Medido na mesma página no browser (na app não há consola). |
| Voo da pergunta | não verificado | As capturas (a cada ~250 ms) só apanham o estado final; é preciso ver a olho. |
| Dois monitores | não testado | Só há um monitor neste PC. |
| Alt-clique: Chrome, Edge (web e PDF), Bloco de Notas | passou, depois de duas correções | Tabela em `anywhere-medicao.md`. Corrigido: o expoente de uma página web saía numa linha à parte, e uma fórmula KaTeX ficava colada à palavra antes. |
| Alt-clique: Word, Acrobat | não testado | Word precisa de licença do Microsoft 365; a instalação do Acrobat foi cancelada no pedido de administrador. |
| O clique e o Alt não chegam à app de baixo | passou | Nada selecionado no Chrome; cursor do Bloco de Notas parado; nenhum menu ativado. |
| Esc com o foco noutra app | passou | |
| Hook com cliques rápidos | passou | 30 Alt-cliques seguidos com o palco aberto: atraso do rato de 10,5 ms no máximo (média 1,9 ms). |
| Numeração dos exames | passou | Relatório: Biologia I.1–I.20, II.1–II.3, III.1–III.5 (sem os passos do procedimento); História com o prefixo do grupo em todas as páginas; Português 1–7, II.1–II.7, III.1–III.2. |
| Clipes do onboarding (en) | gravados | `onboarding_talk_windows_en.m4a` (3,8 s) e `onboarding_tryIt_windows_en.m4a` (2,9 s), ligados aos ecrãs «talk» e «tryIt». Os de português esperam autorização (custam menos de 1 cêntimo). |

Instalado neste PC, com autorização: Chrome, Edge, Python 3.12, FFmpeg, `kokoro-onnx`, `soundfile`, `keyring` e os modelos do Kokoro (em `scripts/onboarding-clips/models/`, fora do git).

## Parte 2 (com sessão iniciada)

Por fazer: precisa de entrares na conta.
