# Fase 0 — Esqueleto

## O que foi feito

- Repositório git (`main`), Tauri 2 + React 19 + TypeScript 6 + Vite 8 + Vitest 5 + Rust 1.100.
- Três pastas, como no CLAUDE.md §4.2:
  - `core/` — TypeScript puro (compila com a lib `WebWorker`, por isso `document`/`window` são erro de compilação).
  - `ui/` — React, só apresentação. Janela principal com a barra lateral das oito secções.
  - `src-tauri/` — Rust. Para já só `config.rs` (API/site base, com as regras do `AIGateway`) e o comando `app_config`.
- Lint e formatação: ESLint (com a regra «`core/` não importa UI nem Tauri»), Prettier, `cargo fmt` (`rustfmt.toml`).
- CI: `.github/workflows/ci.yml` em `windows-latest` — lint, testes, build web, `cargo fmt`, `clippy`, `cargo test`. Sem segredos.
- Traduções: `scripts/convert-xcstrings.mjs` converte `Localizable.xcstrings` em `core/i18n/locales/en.json` e `pt-PT.json` (609 chaves cada, mesmas chaves, plurais e substituições incluídos).
- Textos próprios do Windows: `core/i18n/windows/*.json` trocam «Mac», «⌥-clique», «Porta-chaves», «notch», «Control + Option» em 51 chaves. Um teste falha se algum texto visível ainda falar do Mac.
- Primeiros portes com os testes do Mac: `AppLogin` (PKCE), `HomeRoute`, `NotchMode`, `NotchAction`, `AIGateway`, `BackendClient` + `AccountAPI`.

## Como verificar

```
npm install
npm run lint        # ESLint + Prettier
npm test            # 55 testes
npm run build       # typecheck + bundle em dist-ui/
npm run dev         # http://localhost:1420 — a janela principal no browser
```

Nativo (precisa de o Smart App Control deixar correr os build scripts — ver PARA-O-DINIS.md, ponto 1):

```
cd src-tauri
cargo fmt --check
cargo test
cd ..
npm run tauri dev
```

## Critérios de aceitação

| Critério | Estado |
|---|---|
| `npm test` passa | ✅ 55 testes (local) |
| `cargo test` passa | ⛔ não corre nesta máquina: o Smart App Control bloqueia o build script do crate `typeid` (erro 4551). **Falta verificação do Dinis** (ou do CI). Os 5 testes de `config.rs` estão escritos. |
| passam no CI | ⏳ o workflow existe; só corre depois de um push, que é do Dinis |
| a app abre uma janela vazia com a língua do sistema | ✅ no browser (`npm run dev`): barra lateral em pt-PT num Windows em português. ⛔ na janela Tauri: depende do build nativo |
| as 609 chaves existem nas duas línguas | ✅ teste `scripts/locales.test.mjs` |
