# Fase 5 — Voz e mascote

## O que foi feito

- **Núcleo (`core/voice/`, `core/lesson/`)**, porte do Mac com os testes dele:
  - `speechPlan.ts`: que motor fala, a voz ElevenLabs por língua («Joana» em pt-PT), o corpo do pedido de fala, o preço por carácter e a voz do sistema que substitui.
  - `spokenText.ts`: o texto limpo de Markdown e LaTeX antes de ser dito, os marcadores `[[n]]` e o corte em frases.
  - `voiceTutorPrompt.ts`: prompt v24, palavra a palavra, com a mensagem e a nota do item aberto. `voiceTutorReply.ts` lê a resposta (fala, marcas, frase de abertura) e `voiceTurn.ts` trata das novas tentativas e das continuações.
  - `voiceTutorOpener.ts`: a frase de abertura escolhida pelo que foi dito («Vamos ao ponto 2.») e os pedidos de um passo.
  - `speechToText.ts`: o WAV e o pedido de transcrição.
  - `mascotLesson.ts`, `mascotLessonPrompt.ts` (v14) e `mascotLessonProvider.ts`: a lição «Explica-me», com as guardas do Mac, a lição em streaming (a primeira frase é dita enquanto o resto chega), a cache `lessons.json` e o Sonnet por trás do DeepSeek.
- **Interface:**
  - `ui/voice/speaker.ts`: voz premium pelo backend ou voz do Windows.
  - `ui/voice/recorder.ts`: o microfone.
  - `ui/voice/VoiceUI.tsx`: o tutor por voz no palco.
  - `ui/lesson/`: a lição a tocar, com o passo aceso, as marcas na pergunta, a conta, a pergunta de verificação, a frase final e a mascote animada.
- **Clipes gravados do Mac** em `ui/public/clips/`: as 39 frases de abertura em pt-PT e em inglês, e o onboarding.
- **Nativo:** a tecla de falar (Ctrl+Win, Copilot ou Ctrl direito) no hook de teclado, sem abrir o menu Iniciar; o evento `talk` chega a todas as janelas.

## Como verificar

```
npm test
```

```
npm run dev
```

1. Abrir `http://localhost:1420/overlay.html?demo=anywhere` e carregar em «3». Com as respostas falsas, a lição é feita a partir dos passos escritos.
2. Carregar em «Explica-me»: o passo 1 acende, depois o 2, depois a frase final. Sem voz, cada frase fica o tempo de a ler.
3. Manter carregado o botão do microfone e largar: «A pensar…» com a abertura gravada, depois «A falar…».

Na app, ver `PARA-O-DINIS.md`, ponto 8.

## Falta (registado em PROGRESSO.md)

- Medir a latência entre largar a tecla e enviar (critério: menos de 300 ms) e ouvir a voz pt-PT na app. Falta verificação do Dinis.
- O reconhecimento de voz nativo do Windows (caminho 1 da secção 4.5). Fica para depois de medir os dois.
- O que depende das figuras: as marcas na figura, a fórmula que contém o símbolo explicado e os gráficos da resposta (fase 6).
- Os gestos da mascote (olhar, apontar) e as definições de voz, mascote e tecla (fase 7).
