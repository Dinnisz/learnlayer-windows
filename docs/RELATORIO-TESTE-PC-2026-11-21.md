# Teste ao vivo no PC do Dinis (2026-11-21, de madrugada)

Ramo `fix/windows-live-test`, app de desenvolvimento (`tauri dev`), Brave com o exame de Matemática A 2026
(`exames/EX-MatA635`), aberto como PDF e também como imagem. Conta do Dinis no Worker de teste, que já aceita o
`qwen/qwen3.8-flash`. Custo deste teste: 3 resoluções e 2 leituras rápidas, cerca de 0,05 USD.

## Corrigido e gravado nesta sessão

| Problema | Correção | Commit |
|---|---|---|
| Clique 3 pt acima da etiqueta «2.2.» abria a 2.1 | O clique na meia linha acima de uma etiqueta pertence a essa etiqueta | e7bbef1 |
| Abrir um PDF pedia o tamanho das páginas uma a uma; o worker do pdf.js só arrancava no primeiro Alt-clique | Tamanhos pedidos em paralelo; um worker partilhado, arrancado quando a janela do palco carrega | 2a2e31c |
| Exame como imagem: clicar na 2.1 abria a página inteira, das perguntas 1 a 2.3 (as etiquetas com estrela começam 23 px mais à esquerda do que «2.») | A tolerância das etiquetas passou de 1,2 para 2 alturas de linha. Relatórios de ecrã: iguais ou melhores (recortes curtos 2→1 a 2×, 2→0 no conjunto B, cliques 85→86) | f481a97 |
| A transcrição rápida nunca corria com sessão iniciada (só com chave local, como no Mac em Debug) | Corre também pelo backend, com sessão iniciada | 9d52377 |
| A transcrição rápida devolveu a fórmula de f(x) vazia, e o palco trocou o recorte certo por um enunciado sem a função | Uma leitura com um bloco de fórmula vazio é rejeitada e fica o recorte | 9d52377 |
| Pista e resposta com matemática em texto simples; `<=` e `*` em ASCII; frase dentro da fórmula na coluna Fórmulas | Matemática composta na pista e na resposta escrita; ≤ e ·; a frase passa para baixo da fórmula | e7bbef1 |
| Fórmulas e figura presas ao scroll da resolução | Coluna fixa no canto superior direito, sem caixas (`FixedSide`) | 4f6295b (sessão principal) |
| Script para repetir um Alt-clique guardado (`anywhere-debug.json`) com uma captura do ecrã | `scripts/replay-click.test.ts` | f481a97 |

## Medições

| Caso | Antes | Agora |
|---|---|---|
| 1.º Alt-clique num PDF no Brave (`pdf` → decisão) | 3817 → 4020 ms | por medir a frio (o teste foi interrompido); com o PDF em memória: 2 → 539 ms |
| Alt-clique numa imagem (sem PDF) | — | imagem 153 ms, decisão 249 ms |
| Transcrição rápida (2.2 em imagem, depois de «Dica») | não corria | cerca de 17 s, e veio sem a fórmula (agora rejeitada) |
| Resolução com a pergunta composta (2.1 em imagem) | — | cerca de 25 s |
| Pista (2.3 em PDF) | — | cerca de 15 s |

## O que falta melhorar (por ordem de importância)

### Tempo
1. **A transcrição rápida demora cerca de 17 s.** O servidor já desliga o raciocínio deste modelo. A causa provável: o pedido vai primeiro ao fornecedor mais rápido (`provider.sort = latency`); sem nenhuma palavra em 6 s (`FastTranscription.timeout`), é abandonado e repetido noutro fornecedor. Próximo passo: registar em desenvolvimento a hora do pedido, da primeira palavra, da troca de fornecedor e o `model` da resposta (`modelClient.ts` lê-o), para saber onde está o tempo. Ver também se a imagem enviada (até 1000 px, JPEG 0,7) é maior do que precisa.
2. **A transcrição rápida só começa quando se escolhe uma opção** (regra: abrir não gasta). Se pudesse começar no clique, a pergunta composta chegava antes de o aluno escolher. Isto muda uma regra de produto: decisão tua.
3. **O palco espera pelo PDF.** A leitura de acessibilidade (UIA) já tem o texto certo logo no início. O palco devia abrir com esse texto em menos de 150 ms e trocar pela versão do PDF quando chegasse. Hoje só abre no fim (`OverlayWindow.sourceFor`).
4. **O primeiro clique num PDF ainda lê o texto de todas as páginas** (até 60) antes de decidir. Devia ler primeiro só a página clicada e as vizinhas, e o resto em segundo plano. Melhor ainda: ler o PDF que está à frente antes do clique (`DocumentPreread`).
5. **A imagem da janela leva 150–470 ms.** Bastava capturar só a zona à volta do clique.
6. **A pista leva cerca de 15 s.** Vem depois dos cartões, pela ordem do prompt (igual ao Mac). Só mudaria com uma chamada curta à parte: decisão tua.

### Transcrição
7. **ℝ aparece como «R»** na leitura rápida. Podia corrigir-se no texto antes de compor: «domínio $R$» → `\mathbb{R}`.
8. **A fórmula por ramos sai pequena** quando composta (frações dentro de `cases` em tamanho de texto). Usar `\dfrac` dentro de `cases` resolveria.
9. **A leitura da resolução (o enunciado composto) chega só ao fim da resolução.** Até lá, fica o recorte em imagem, que está correto mas é menos nítido.

### Posição e movimento
10. **Gráfico de f na 2.1:** a escala vai até 12 000, porque e^(3−x) explode para x negativo. O gráfico não mostra nada de útil. Devia cortar o eixo y num intervalo com significado, ou não mostrar o gráfico.
11. **Anel de foco durante a cascata:** desenhado pela caixa que o modelo dá. A etiqueta («condição pedida») caiu por cima da caixa da Resposta. A etiqueta devia evitar a Resposta e os passos.
12. **A pergunta encolhe a 14 pt** ao abrir a resolução (como no Mac). No ecrã de 2560×1440 a 125 %, o enunciado do grupo fica pequeno. Vale a pena ver se pode ficar maior quando há espaço.
13. **Figuras 3D, figura do circuito e quadro de sinais:** não foram testados ao vivo nesta sessão. Precisam de uma pergunta de cada (Física, Geometria no espaço).
14. **«Explica-me» com voz:** por testar. Na próxima vez, com a app em inglês, para usar a voz grátis do sistema.

### Para ti
- O patch do `qwen` está aplicado (confirmaste que funciona).
- Decidir os pontos 2 e 6.

## Ficheiros úteis
- `docs/capturas-windows/` e as capturas deste teste no scratchpad da sessão (perdem-se ao reiniciar).
- `scripts/replay-click.test.ts`: `REPLAY_DEBUG=<anywhere-debug.json> REPLAY_SHOT=<captura.png> npx vitest run scripts/replay-click.test.ts`.
