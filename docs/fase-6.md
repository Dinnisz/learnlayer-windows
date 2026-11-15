# Fase 6 — Figuras

## O que foi feito

- **Núcleo (`core/illustrations/`)**, porte do Mac com os testes dele:
  - o modelo das figuras (`illustration.ts`), o `LabelPlacer` e o compilador de templates (função, série com reta de ajuste, círculo trigonométrico, plano complexo, plano inclinado, cronologia, geometria analítica, continuidade num ponto);
  - o renderizador (`renderer.ts`): lista de desenho com rótulos que não tapam traços, pontos nem outros rótulos;
  - a curva lida das fórmulas (`FunctionGraph`, `FunctionPlot`, `GraphRelevance`): Bolzano com os extremos e o zero, esboços para g'(c) < 0 e limites, nada para uma indução;
  - o plano complexo verificado (zⁿ multiplicado), a geometria no espaço (`spaceFigure.ts`: caixa [ABCDEFGH] completada, reta e plano verificados, nomes colocados a qualquer rotação);
  - o prompt v22 (`illustrationPrompt.ts`) e o fornecedor (`illustrations.json`), com as novas tentativas do Mac e as figuras pré-feitas que usam templates.
- **Sessão:** a figura ao lado dos passos (quadro de sinais só se todos os sinais batem, curva local, plano complexo, espaço, desenho do modelo), o gráfico da resolução e os botões «Desenhar» e «Esconder gráfico».
- **Interface (`ui/figures/`):** o desenho em SVG com traços desenhados à mão e parâmetros, a curva com eixos que se desenham e parâmetro arrastável, o quadro de sinais, a figura no espaço que roda ao arrastar.
- **Código:** blocos de código com as cores do VS Code (Dark+ e Light+), em qualquer texto do palco (`core/code/`).
- **Diagramas temporais:** o diagrama impresso encontrado na página, o circuito do modelo simulado antes de confirmar, as ondas desenhadas sobre o diagrama («Desenhar ondas»).
- **Explicador de fórmulas:** clicar numa equação solta no leitor abre-a em branco sobre a página, com o menu, os passos, as marcas, as peças a clicar em «Deixa-me tentar», as linhas resolvidas e o gráfico (`core/explanation/`, prompt v14).

## Como verificar

```
npm test
```

```
npm run dev
```

1. `http://localhost:1420/overlay.html?demo=anywhere`, carregar em «3»: à direita, as fórmulas, o desenho (exemplo animado com controlos) e a curva com «R» arrastável.
2. `http://localhost:1420/reader.html?open=/@fs/<caminho>/exames/EX-MatA635-F1-2026_net.pdf`, página 2 (formulário): clicar numa fórmula abre o explicador.

Com as respostas falsas não há chamadas pagas.

## Falta (registado em PROGRESSO.md)

- Figuras 3D com three.js (sólidos de revolução, circuitos 3D) e as figuras pré-feitas animadas.
- As marcas da voz e da lição «Explica-me» sobre a figura.
- O menu de estudo em português do explicador de fórmulas.
