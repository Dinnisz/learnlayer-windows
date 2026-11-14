# Decisões

Cada entrada: data, dúvida, escolha, porquê.

## 2026-11-14 — `.claude/settings.json` do pacote não foi extraído
- **Dúvida:** o zip trazia um `settings.json` que dá permissão automática a `powershell:*`, `winget install`, `npm`, `cargo`, `git`.
- **Escolha:** ficou de fora; o Dinis foi avisado e pode pedi-lo.
- **Porquê:** alargar as permissões do agente a partir de um ficheiro descarregado deve ser uma escolha explícita do Dinis.

## 2026-11-14 — Um só `package.json` na raiz
- **Dúvida:** workspaces npm (`core`, `ui`) ou um pacote único?
- **Escolha:** um pacote único na raiz; `core/` e `ui/` são pastas, com a regra de lint «`core/` não importa de `ui/` nem do DOM» (tsconfig próprio sem `lib: dom`).
- **Porquê:** menos peças no CI e no Tauri; a separação que interessa (core sem DOM) é garantida pelo compilador.

## 2026-11-14 — Leitura dos ficheiros-chave por fase
- **Dúvida:** a secção 10 manda ler logo `QuestionSession.swift`, `QuestionOverlay.swift`, `AnywhereController.swift`, etc. (mais de 6 000 linhas).
- **Escolha:** no arranque li os de conta, gateway, pílula e janela principal (Fases 0–1) e a estrutura dos restantes; os grandes são lidos por inteiro no início da fase que os porta.
- **Porquê:** o contexto da sessão é resumido ao longo do trabalho; ler um ficheiro muito antes de o portar obriga a relê-lo.

## 2026-11-14 — Smart App Control: não contornar
- **Dúvida:** o SAC bloqueia os build scripts do Rust (erro 4551). Tentar contorná-lo (WSL, toolchains alternativas, desligar o SAC)?
- **Escolha:** não. Fica registado em `PARA-O-DINIS.md` (ponto 1) com as opções; continuo com `core/` e `ui/`, que não dependem do nativo. O Rust que for escrito entretanto fica marcado «não compilado».
- **Porquê:** é uma proteção de segurança da máquina, e desligá-la é irreversível. A decisão é do Dinis.

## 2026-11-14 — A sessão vive no lado nativo
- **Dúvida:** onde ficam os tokens e quem faz o refresh? A app tem várias janelas (principal, pílula, palco), cada uma com o seu contexto JavaScript.
- **Escolha:** tokens no Credential Manager, lidos e renovados em Rust (`session.rs`), atrás de um `Mutex` assíncrono; as janelas pedem `session_access_token(force)`. O `BackendClient` em TypeScript faz as restantes chamadas com esse token.
- **Porquê:** o refresh token é rotativo; dois refreshes em paralelo, vindos de duas janelas, gastavam o mesmo token e terminavam a sessão. Só o processo nativo consegue serializar entre janelas (é o papel do `actor SessionCoordinator` no Mac).

## 2026-11-14 — Marca «ref 2026-11-04» nos portes
- **Dúvida:** o CLAUDE.md pede `// Port of … @ <commit da referência>`, mas a cópia em `referencia-mac/` não traz git.
- **Escolha:** `@ ref 2026-11-04`, a data do «Estado dos ramos» em `referencia-mac/CLAUDE.md` (main em `7ec708c` mais o ramo `feat/local-first` instalado).
- **Porquê:** é a identificação mais precisa que a cópia permite.

## 2026-11-14 — Ícones: nomes SF Symbols no código, glifos Segoe Fluent no ecrã
- **Dúvida:** o código portado refere símbolos da Apple (`folder`, `gearshape`…).
- **Escolha:** `core/` mantém os nomes do Mac (os testes portados comparam-nos); `ui/components/Icon.tsx` traduz cada nome para um glifo Segoe Fluent Icons (com Segoe MDL2 Assets como recurso no Windows 10).
- **Porquê:** paridade com os testes do Mac e aparência nativa no Windows (CLAUDE.md §7).

## 2026-11-14 — Textos que dizem «Mac»
- **Dúvida:** várias chaves do `.xcstrings` dizem «this Mac», «⌥-click», «every Mac».
- **Escolha:** as chaves ficam iguais (regra 10: mesmas chaves). O valor mostrado no Windows vem de uma camada de substituição (`ui/locales/windows-overrides.*.json`) que troca «Mac» por «computer/computador» e «⌥-click» por «Alt-click/Alt-clique», como o CLAUDE.md indica («That sign-in link didn’t match this computer.», «Alt-click in any app»).
- **Porquê:** mantém a paridade de chaves com o Mac sem mostrar texto errado no Windows.

## 2026-11-14 — Código do sistema operativo atrás de um trait `Platform` (pedido do Dinis)
- **Dúvida:** esta app vai mais tarde substituir também a versão Mac. Onde fica o código que só existe no Windows?
- **Escolha:** todo o código específico do Windows (hook do rato, UI Automation, OCR, acrílico, pílula no topo, instalador) fica em `src-tauri/src/platform/windows/`, atrás do trait `Platform` de `src-tauri/src/platform/mod.rs`. No frontend, `ui/native.ts` é a única porta para o nativo. A interface React, o palco, a matemática, a mascote, a API e os prompts não dependem de nada do Windows. Nada é implementado para o Mac agora: `platform::current()` só tem o ramo Windows.
- **Porquê:** um porte para o Mac passa a ser acrescentar `platform/macos/`, sem tocar no resto.
- **Por fazer:** mover para `platform/windows/` o `CredentialManager` (`session.rs`), `data_dir`/`COMPUTERNAME` (`config.rs`); tornar a tabela de textos do Windows (`core/i18n/windows/`), o prefixo «Windows ·» de `deviceNameFor` e o «Ctrl+» da barra lateral dependentes da plataforma.
