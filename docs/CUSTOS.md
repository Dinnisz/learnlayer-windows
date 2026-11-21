# Custos de API

Teto do projeto: **3,00 USD**. Cada chamada real ao Worker de teste fica aqui. Os testes automáticos nunca chamam a API paga.

| Data | Fase | O quê | Modelo | Custo (USD) | Total acumulado |
|---|---|---|---|---|---|
| — | — | (nenhuma chamada real até agora) | — | 0,00 | 0,00 |
| 2026-11-19 | teste ao vivo, parte 2 | 2 resoluções (MatA 2.2, FQA 1.3), com transcrição rápida | rota do servidor (Haiku com raciocínio / Gemini Flash) | ~0,04 (estimativa) | ~0,04 |
| 2026-11-19 | teste ao vivo, parte 2 | 1 lição «Explica-me» com voz | DeepSeek v4.1 flash + ElevenLabs turbo | ~0,06 (estimativa) | ~0,10 |
| 2026-11-19 | teste ao vivo, parte 2 | 2–3 turnos de voz ao clicar na mascote | Haiku + ElevenLabs | ~0,05 (estimativa) | ~0,15 |
| 2026-11-21 | teste das correções do relatório do Mac | 1 resolução (física, pergunta numa página web), aberta duas vezes (a segunda veio da cache) | rota do servidor (Haiku com raciocínio) | ~0,01 (estimativa) | ~0,16 |

Nota (2026-11-20): a app não guarda um registo local do custo de cada chamada (o `cost-ledger.json` do Mac é das avaliações de debug, que não foram portadas). Os valores da parte 2 são estimativas a partir dos preços da OpenRouter e do tamanho das respostas; o valor exato está no uso da conta de teste («Plano e uso», `/v1/me`, `monthlyCostUsdMicros`). Abaixo do teto de 0,50 USD dado para a parte 2.
