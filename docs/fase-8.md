# Fase 8 — Distribuição

## O que foi feito

- **Sincronização cifrada da memória** (`core/memory/brainSync.ts`, porte de `BrainSync.swift` e `BrainSyncCrypto.swift` com os testes do Mac). O formato é o do Mac, para Mac e Windows partilharem a mesma memória:
  - 16 fragmentos `memoria-00` a `memoria-0f`, escolhidos por FNV-1a;
  - cada fragmento é selado com AES-GCM 256: `nonce` e `ciphertext ‖ tag` em base64;
  - uma chave da memória por conta, que só viaja embrulhada para a chave X25519 de cada computador: chave pública efémera ‖ AES-GCM combinado, com a chave de cifra tirada por HKDF-SHA256 e o sal `LearnLayer.memory.wrap.v1`;
  - fusão pelo registo mais recente, com as eliminações como marcas, e repetição num `409`.
  - Feita com a WebCrypto, verificada com o vetor X25519 do RFC 7748 e com um fragmento escrito como o Mac o escreve.
  - As chaves ficam no Gestor de Credenciais (`LearnLayer.Session/memory-sync.device.<conta>` e `…memory.<conta>`), através de dois comandos que só aceitam esses nomes.
  - Corre na janela principal ao arrancar, de 15 em 15 minutos e em «Sincronizar agora», e só com a opção ligada e a sessão iniciada.
  - Em «Dados e privacidade» aparece o estado da sincronização.
- **Memória entre janelas:** cada janela (principal, leitor, palco) grava o `memory.json` fundindo primeiro o que as outras escreveram, e a janela principal relê-o quando vem para a frente.
- **Abrir com o Windows** (`tauri-plugin-autostart`): desligado por defeito, ligado em Definições › Geral. Arrancada com o Windows, a app mostra só a pílula e o ícone; a janela principal começa escondida e abre-se nos outros arranques.
- **Atualização automática** (`tauri-plugin-updater`, `src-tauri/src/updates.rs`):
  - só existe numa build com `tauri.updater.conf.json` (o URL e a chave pública);
  - procura ao arrancar e de 6 em 6 horas, descarrega e verifica a assinatura;
  - mostra «Reiniciar para atualizar» na janela principal; instalar é um clique do aluno.
- **Instalador:**
  - `scripts/build-installer.ps1` gera o NSIS e copia-o para `dist\`, com assinatura Azure Trusted Signing e `latest.json` quando as configurações existem;
  - o CI tem um trabalho que gera o instalador sem assinatura como artefacto.

## Como verificar

```
npm test
```

- Testes da sincronização: `npx vitest run core/memory`. Dois computadores convergem, o servidor só vê texto cifrado, há conflitos e `409`, sem rede nada muda, um computador revogado não recebe a chave.
- No browser (`npm run dev`): em Definições › Dados e privacidade, ligar «Sincronizar a memória entre os meus dispositivos» mostra «Inicia sessão para sincronizar a tua memória.».
- Instalador, arranque com o Windows e atualizações: `PARA-O-DINIS.md`, pontos 4, 5 e 10.

## Critérios de aceitação

- «Instalo num Windows limpo sem avisos do SmartScreen»: falta a conta de assinatura (ponto 4) e uma máquina que compile (ponto 1). Falta verificação do Dinis.
- «A app atualiza-se sozinha»: o código está feito; falta o URL e a chave (ponto 5). Falta verificação do Dinis.
- «A memória criada no Mac aparece no Windows»: o formato é o do Mac e está testado com fragmentos escritos como o Mac os escreve. Falta experimentar com as duas apps na mesma conta (precisa da app compilada). Falta verificação do Dinis.
- **Instalador em `dist/`:** não foi possível gerá-lo nesta máquina, porque o Smart App Control bloqueia a compilação (ponto 1). O script e o trabalho do CI estão prontos (ponto 10).
