# Fase 7 — Onboarding, Memória, Definições

## O que foi feito

- **Memória local** (`core/memory/memory.ts`, porte de `MemoryStore`, `ExplanationPlanner`, `Beliefs`, `PedagogicalFloor` com os testes do Mac): perguntas abertas e fórmulas explicadas ficam em `%APPDATA%\LearnLayer\memory.json`, com os conceitos, as crenças sobre o que o aluno sabe e os hábitos notados. O plano pedagógico vai no prompt do explicador de fórmulas, como no Mac.
- **Página Memória:** mapa dos conceitos (tamanho = número de perguntas) e lista por documento, com dados reais (o Mac mostra dados de exemplo). Pesquisa, e «Esquecer» em cada pergunta.
- **Página Documentos:** os PDFs onde o aluno fez perguntas, por data ou nome, com pesquisa, e o botão para abrir o leitor.
- **Definições completas:**
  - Geral: disciplina por defeito, data do exame, voz, voz premium, mascote e a sua cor, tecla de falar (Ctrl+Win, Copilot, Ctrl direito, só o botão), Alt-clique, língua, rever a introdução.
  - Permissões: microfone e estado do Alt-clique.
  - IA e uso.
  - Dados e privacidade: exportar e apagar a memória, consentimentos (sincronizar, adaptar aos hábitos, uso anónimo), hábitos notados.
- **Onboarding** (`core/onboarding/`, porte de `OnboardingFlow`, `OnboardingStore`, `OnboardingCoordinator` e `OnboardingPresentation` com os testes do Mac; `ui/onboarding/`):
  - um cartão sobre a janela principal na primeira abertura, com oito ecrãs: olá, língua, microfone (barras ao vivo), tecla de falar (Ctrl+Win), experimentar, cor, plano, fim;
  - as frases gravadas do Mac em pt e en, com silenciar lembrado;
  - Esc fecha o cartão; ao fim de dois Esc deixa de abrir sozinho; o primeiro «Saltar» pergunta antes de acabar tudo.
  - No passo «Experimentar», clicar (ou Alt-clicar) na pergunta de exemplo abre o palco com ela. Com as respostas falsas, a resolução é a do carro (a = 4 m/s²).
  - Os preços e limites do ecrã do plano vêm de `/v1/plans`, com os valores por defeito do Mac enquanto não chegam.

## Como verificar

```
npm test
```

```
npm run dev
```

1. Abrir `http://localhost:1420/` numa janela privada (sem dados): aparece o cartão de boas-vindas. Percorrer os ecrãs.
2. No passo «Experimentar», clicar na pergunta de exemplo e carregar em Enter: o palco mostra a resposta e os passos. Esc fecha o palco e deixa o cartão.
3. No fim, «Começar a aprender» fecha o cartão. Definições › Geral › «Mostrar» abre-o outra vez.
4. Abrir uma pergunta no leitor (`reader.html`): aparece em Memória e em Documentos.

## Critérios de aceitação

- «Um utilizador novo chega do instalador a uma pergunta resolvida sem ajuda»: o caminho está feito e verificado no browser com as respostas falsas. Falta a verificação do Dinis com a app compilada e a conta real (depende do Smart App Control, `PARA-O-DINIS.md`, ponto 1).
- «O mapa da Memória mostra perguntas reais»: sim, lê `memory.json` (verificado no browser).

## Falta

- Os clipes de voz dos passos «tecla de falar» e «experimentar» dizem as teclas do Mac. No Windows esses dois passos mostram o texto sem voz até haver clipes novos (`PARA-O-DINIS.md`, ponto 9).
- A sincronização cifrada da memória é da fase 8.
