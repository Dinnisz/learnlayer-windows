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

## 2026-11-15 — `QuestionDetector` passa para a Fase 3
- **Dúvida:** o CLAUDE.md põe o `QuestionDetector` no núcleo da Fase 2, mas no Mac ele lê uma `PDFPage` (texto, caixas de cada carácter, seleções, colunas).
- **Escolha:** porta-se na Fase 3, junto com o leitor pdf.js, contra uma interface de página pura (`core/pdf/page.ts`: texto, caixa de cada carácter, caixa da página) que o pdf.js preenche e que os testes constroem à mão como o Mac faz com `Self.page(...)`. As partes que só leem texto (`QuestionLabels`, `TextNormalizer`, `ChoiceCheck`) já estão portadas.
- **Porquê:** portar agora obrigava a inventar a geometria do pdf.js antes de a ter; os testes de `QuestionDetectorTests` só fazem sentido com páginas reais (`Tools/TestPDFs/`).

## 2026-11-15 — Caracteres invisíveis no código
- **Dúvida:** as ferramentas de escrita desta sessão transformam escapes como ` ` no próprio carácter; num regex, um separador de linha literal parte o código, e um espaço não separável é invisível na revisão.
- **Escolha:** `scripts/escape-invisible.mjs` escreve esses caracteres como escapes; `npm run lint` corre-o com `--check`.
- **Porquê:** o código tem de dizer o que faz à vista; o CI apanha qualquer recaída.

## 2026-11-15 — Prompts extraídos do Swift por um programa, não reescritos à mão
- **Dúvida:** a secção 6 manda portar os prompts palavra a palavra; são milhares de linhas com interpolações, escapes e LaTeX, e as ferramentas desta sessão alteram barras invertidas.
- **Escolha:** `scripts/extract-prompts.mjs` lê os literais e os dicionários de esquema do Swift e grava-os em `core/prompts/swift/` (no git). O TypeScript só junta os pedaços. Um teste re-extrai e compara sempre que `referencia-mac/` existe.
- **Porquê:** é a única forma de garantir «palavra a palavra» e a mesma chave de cache que o Mac. As duas linhas Swift que o avaliador não lê (`var graph = …` e o `if` que o segue) estão escritas como exceções explicadas no próprio gerador.

## 2026-11-15 — Funções dos prompts entram na fase de cada funcionalidade
- **Dúvida:** a Fase 2 pede «os prompts e esquemas»; vários prompts (`VoiceTutorPrompt`, `MascotLessonPrompt`, `IllustrationPrompt`, `ExplanationPlanner`…) têm funções que montam o pedido a partir de tipos que ainda não existem.
- **Escolha:** todos os textos e esquemas ficam extraídos já; as funções que os montam entram com a funcionalidade (lista em `PROGRESSO.md`).
- **Porquê:** portar a montagem sem os tipos obrigava a inventá-los e a reescrevê-los depois.

## 2026-11-15 — KaTeX: comandos que o renderizador do Mac aceita e o KaTeX não
- **Dúvida:** o `LatexText.normalized` do Mac escreve `\decimalcomma`, `\sen`, `\tg` (SwiftMath).
- **Escolha:** o `normalized` fica igual (mesmos testes); a interface define estes comandos como macros do KaTeX.
- **Porquê:** mantém o núcleo idêntico ao Mac e o texto bem desenhado no Windows.

## 2026-11-15 — Explicador de fórmulas soltas passa para a fase 6
- **Dúvida:** a secção 3.3 põe o explicador de fórmulas soltas (clicar numa equação → «Explain it / Show the graph / Let me try», `ExplanationPrompt` v14) no leitor da fase 3, mas metade dele é o gráfico com parâmetro arrastável e as curvas que se desenham, que são da fase 6.
- **Escolha:** a fase 3 fica com as perguntas de exame (detetor, palco, pista, tentar, resolução, pergunta livre, variante). O explicador de fórmulas (deteção de equações `EquationDetector`, prompt v14, menu e curva) entra na fase 6, com os gráficos.
- **Porquê:** sem os gráficos, o explicador ficaria com um terço do comportamento do Mac; assim chega completo e testado de uma vez.

## 2026-11-15 — Alt-clique num PDF: a pergunta mostra-se como a própria página
- **Dúvida:** no Mac, uma pergunta lida do PDF aberto noutra app é tipografada a partir do texto do PDF e as figuras são redesenhadas a partir dos traços da página (`VectorPage`); quando o texto perdeu a forma das fórmulas, o modelo lê a imagem (transcrição rápida) e o PDF é lido antecipadamente para isso (`DocumentPreread`, com teto de gasto).
- **Escolha:** no Windows, uma pergunta encontrada no PDF por caminho abre o mesmo palco do leitor da fase 3: o recorte da página desenhado pelo pdf.js (nunca do ecrã). O texto do PDF continua a ir para o modelo como no Mac. A leitura antecipada (`core/anywhere/preread.ts`) faz o plano do Mac (`PrereadPlan`, os mesmos testes) mas lê só o texto das páginas e as perguntas, de graça; o passo pago fica como gancho, com o mesmo teto. O redesenho das figuras a partir dos traços entra na fase 6.
- **Porquê:** o recorte do pdf.js é exato e sem custo, e é o que o leitor já mostra. Uma leitura paga antecipada só servia para tipografar texto que o recorte já mostra bem.

## 2026-11-15 — Sem leitor local de fórmulas no Windows
- **Dúvida:** o Mac lê a imagem da pergunta primeiro com um modelo local de fórmulas (`LocalQuestionReader`, Pix2Text em CoreML) e só depois pergunta à nuvem.
- **Escolha:** no Windows, o OCR local (`Windows.Media.Ocr`) dá só as linhas de texto: servem para encontrar a região da pergunta, o rascunho enquanto se espera e a verificação dos números. A leitura em LaTeX é sempre a transcrição rápida da nuvem (`core/problems/fastTranscription.ts`).
- **Porquê:** não há um modelo de fórmulas equivalente no Windows sem descarregar e correr um modelo próprio. Fica como melhoria possível.

## 2026-11-15 — Teste da confirmação tornado determinístico
- **Dúvida:** o teste «does not confirm an answer whose check fails» verificava `isConfirmed` no momento em que a resposta ficava pronta. A confirmação pelo modelo forte corre logo a seguir, por isso o teste dependia do tempo e falhou depois de a transcrição rápida acrescentar um passo assíncrono.
- **Escolha:** o teste espera pela confirmação e verifica que a resposta com a verificação falhada foi refeita pelo modelo forte (duas resoluções, `solvedByStrongerModel`), e que a resposta certa ficou confirmada sem segunda chamada.
- **Porquê:** verifica o mesmo comportamento, sem depender do tempo, e verifica mais do que antes.

## 2026-11-15 — Alt-clique no Windows: escolhas do lado nativo
- **Tecla que impede o menu do Alt:** `0xE8` (não atribuída), a que o AutoHotkey usa para o mesmo fim. O CLAUDE.md sugere `VK_NONAME`/`0xFF` «por exemplo»; o `VK_NONAME` (0xFC) é usado por alguns controladores de teclado.
- **Imagem da janela:** `PrintWindow` com `PW_RENDERFULLCONTENT` (a janela desenha-se a si própria). Assim o palco, que pode já estar visível com «Reading…», nunca aparece na imagem. Se sair em branco, copia-se do ecrã (`BitBlt`).
- **Caminho do PDF:** primeiro a barra de endereço do Edge e do Chrome (`file:///…pdf`, pela UI Automation); depois o nome no título da janela, procurado em Transferências, Ambiente de trabalho, Documentos e OneDrive (até 2 níveis). Ler os atalhos de «Recentes» exigia mais COM (`IShellLinkW`), e a procura nas pastas habituais cobre o caso comum.
- **Divisão do trabalho:** o Rust só recolhe (texto do documento e índice do ponto, bloco de elementos e vizinhos, linhas do OCR, píxeis). Escolher a pergunta (`questionRange`, alargamento aos vizinhos, `QuestionLocator`, `readClick`) é TypeScript em `core/anywhere/`, porque aí tem os testes do Mac e corre sem o Rust compilado.
- **Texto selecionado:** um Alt-clique em texto selecionado abre-o como pergunta (com «Ask about this exercise» e a resolução). O Mac abre aí uma sessão própria de explicação de passagem (`SelectionSession`), que entra com a pílula e o «Explicar texto selecionado» (fase 7).
- **Apps protegidas:** nada é lido no Safe Exam Browser, no Respondus LockDown Browser nem em gestores de palavras-passe (KeePass, KeePassXC, 1Password, Bitwarden), nem em campos de palavra-passe (`IsPassword` da UI Automation). Não há uma forma geral de reconhecer apps de banco no Windows: ficam cobertas pelo campo de palavra-passe.

## 2026-11-15 — Voz no Windows: o que fala e o que ouve
- **Voz do sistema:** a interface fala com a Web Speech API do WebView2, que usa as vozes do Windows. Em pt-PT escolhe-se uma voz de Portugal pela regra do Mac (`SystemVoicePlan`: «Joana» se existir, senão qualquer pt-PT, por exemplo «Microsoft Helia»). Nunca uma brasileira. Sem voz pt-PT instalada, a resposta aparece escrita durante o tempo de a ler, e a lição avança ao ritmo de leitura. Não se usa o `SpeechSynthesizer` nativo porque a Web Speech dá as mesmas vozes e as posições das palavras (para acender as marcas) sem Rust.
- **Voz premium:** igual ao Mac. Em pt-PT, com a voz premium ligada (por defeito) e sessão iniciada, fala a «Joana» da ElevenLabs (Flash v2.5) pelo `/v1/audio/speech`, frase a frase, cada frase comprada uma vez por arranque. Com a voz premium desligada, nada é faturado. As frases de abertura e o onboarding são os clipes gravados do Mac (`ui/public/clips/`), por isso não custam nada.
- **Ouvir (STT):** primeiro só o caminho 2 da secção 4.5. Grava-se o microfone enquanto a tecla está premida (WAV 16 kHz mono) e pede-se a transcrição a `google/gemini-3.8-flash` com `input_audio`. O prompt é do Windows: o Mac transcreve no próprio Mac e não tem nenhum. O caminho 1 (`Windows.Media.SpeechRecognition`) precisa do pacote de fala pt-PT e da permissão de reconhecimento de voz; fica para depois de medir os dois (PARA-O-DINIS, ponto 8).
- **Tecla de falar:** Ctrl+Win no hook de teclado. O Win é engolido enquanto o Ctrl está premido, para o menu Iniciar não abrir. Há também a tecla Copilot (Win+Shift+F23) e o Ctrl direito, como no CLAUDE.md. A escolha nas Definições entra na fase 7 (comando `talk_key_set` já existe).
- **O que ficou mais simples do que no Mac (por agora):**
  - A resposta falada porta a leitura do JSON, a abertura, as marcas e as continuações. Falta o que depende das figuras: a fórmula que contém o símbolo explicado (`holdingTheSymbol`, `namingTheFormula`), as verificações do `VoiceTutorGuard` e os gráficos da resposta. Entram na fase 6.
  - A lição desenha passo aceso, citações sublinhadas ou circuladas, opções, conta, verificação e frase final. A lupa, os chips que voam e a figura 3D (`LessonLayer`, `LessonGeometry`) entram com as figuras.
  - A mascote respira, cresce com a voz e brilha quando fala. Olhar e apontar (`MascotMotion`) fica para depois.

## 2026-11-15 — Figuras no Windows (fase 6)
- **Desenho:** o renderizador do Mac (`IllustrationRenderer`) foi portado sem DOM: produz uma lista de desenho (caminhos e caixas de texto em pontos) que a interface desenha em SVG. A colocação dos rótulos é a do Mac, com o texto medido pelo canvas (Segoe UI Variable). Nos testes mede-se com 0,5 em por carácter (média do Segoe UI); com 0,56 em o rótulo de g(0) da figura de Bolzano não cabia a 170 px.
- **Gráfico arrastável:** enquanto o aluno arrasta, o valor do parâmetro fica no próprio gráfico e só passa à sessão ao largar. Assim só o gráfico se redesenha (cerca de 1–2 ms por movimento, medido no browser), em vez de todo o palco (até 8 ms). O Mac grava-o na sessão a cada movimento.
- **Figuras pré-feitas:** portadas as que assentam nos templates (functionGraph, inclinedPlane, simpleCircuit, triangle, motionGraph, vectors, sineCosine, integralArea, parabola, circle, unitCircle, projectile, wave, lens, statsChart). As animadas (`FigureCanvas`: Ruffini, orbitais, passos de equação e os lotes 2–4 de cálculo, física, química, lógica e algoritmos) e as 3D (SceneKit: sólidos, circuitos 3D) ainda não: `compile` devolve nulo, o fornecedor pede outra vez com um template, e uma figura que não se pode desenhar não aparece. O prompt v22 continua igual ao do Mac, com todos os tipos.
- **Explicador de fórmulas:** o Mac mostra hoje o menu de estudo em português (Gráfico, Zeros, Monotonia…, `EquationStudyAction`). No Windows o menu é o que o CLAUDE.md descreve (Explicar / Mostrar o gráfico / Deixa-me tentar / Resolver passo a passo), com a mesma sessão e o mesmo prompt v14. O bloco do plano pedagógico que a Memória acrescenta ao prompt entra com a Memória (fase 7). O pdf.js não diz em que tipo de letra está cada glifo, por isso a regra «tipo de letra matemático» do detetor de equações fica de fora; ficam as regras do texto.
- **Diagramas temporais:** a página é desenhada pelo pdf.js numa imagem cinzenta; o resto é o detetor e o simulador do Mac.
- **Ainda por portar (registado em PROGRESSO.md):** as figuras 3D com three.js (`Figure3D*`, `Circuit3D*`), as figuras pré-feitas animadas, as marcas da voz e da lição sobre a figura, o pedido «visual aid» ao Haiku e o menu de estudo.

## 2026-11-16 — Onboarding, Memória e Definições (fase 7)
- **Onboarding sem o ecrã das permissões:** no Windows não há as três permissões do Mac (Acessibilidade, Gravação do ecrã, Monitorização de entrada). O microfone é pedido no seu próprio ecrã. O caminho do Windows tem oito ecrãs; o fluxo, o armazenamento e os testes são os do Mac (que correm no caminho «macos»), mais testes do caminho Windows. Os eventos de reinício ficam portados, mas o Windows nunca os usa.
- **Onde aparece:** num cartão por cima da janela principal, que abre ao arrancar. No Mac é uma janela própria. O resultado é o mesmo e não é preciso uma janela nova.
- **Quem já é aluno:** quem já tem perguntas na memória ou uma sessão iniciada não vê o cartão sozinho (no Mac: dados de estudo ou chave da API).
- **Clipes de voz:** os clipes «talk» e «tryIt» do Mac falam de Control + Option e do ⌥. No Windows esses dois passos mostram o texto sem voz. Os outros clipes tocam como no Mac. Novos clipes: PARA-O-DINIS, ponto 9.
- **Pergunta de exemplo:** é uma pergunta «do ecrã» (etiqueta «Q»), igual a uma lida pelo Alt-clique, e abre o mesmo palco. Com as respostas falsas, o `MockSolution.json` do Mac (I.1–I.3) nunca tem a parte «Q» e o palco ficava em «A ler…». Por isso as perguntas do ecrã têm o seu próprio mock (`SampleQuestionSolution.json`, a resolução certa do carro). O `mockSolution` passou a receber o pedido.
- **Ecrã do plano:** os preços e limites vêm de `/v1/plans`, como na página «Plano e uso». O Mac usa aqui `PlanDefaults`.
- **Documentos:** o `FoldersScreen` do Mac é um protótipo com dados de exemplo. No Windows, a página lista os PDFs onde o aluno fez perguntas (da memória) e abre o leitor. O leitor abre ficheiros pelo browser e não sabe o caminho deles, por isso não há «abrir outra vez este PDF».
- **Plurais:** «%lld questions», «%lld documents» e «%lld questions asked» não têm plural no catálogo do Mac, por isso saía «1 questions asked». As traduções do Windows dão-lhes plural em en e pt-PT.
- **Memória:** as datas dos nós são segundos Unix, como no Mac. As crenças e os hábitos usam a data de referência do Swift (2001), como o `BeliefStore` do Mac, para a memória sincronizada ser a mesma.

## 2026-11-16 — Distribuição (fase 8)
- **Cifra da memória com a WebCrypto:** AES-GCM, X25519 e HKDF-SHA256 existem na WebCrypto do WebView2 e do Node. A sincronização é TypeScript em `core/` e corre com os testes do Mac sem o Rust compilado. A chave X25519 de cada computador guarda-se como os 32 bytes privados (o `rawRepresentation` do CryptoKit). A WebCrypto lê-a em PKCS #8 com um cabeçalho fixo de 16 bytes.
- **Onde ficam as chaves:** no Gestor de Credenciais, pelos dois comandos `memory_secret_read` e `memory_secret_write`. Estes só aceitam nomes `device.*` e `memory.*` e guardam-nos como `memory-sync.<nome>`, por isso a página nunca chega aos tokens da sessão. No browser de desenvolvimento ficam no localStorage.
- **Várias janelas:** o Mac tem uma só `MemoryStore` para a app toda. No Windows cada janela tem a sua. Por isso a gravação funde primeiro o que está no disco, com a mesma regra da sincronização (vence a mudança mais recente; as eliminações são marcas). Apagar a memória substitui sem fundir. Uma janela que ainda tenha as perguntas antigas em memória pode voltar a gravá-las; fecha-se esse caso quando o leitor e o palco forem reabertos.
- **Sem rede:** um pedido sem resposta conta como «sem rede» (`OfflineFailure`). O Mac distingue-o pelo `URLError`.
- **Abrir com o Windows:** o plugin `autostart` do Tauri escreve na chave `Run` do utilizador, com `--autostart`. Com esse argumento a janela principal não se abre. Para isso a janela começa escondida (`visible: false`) e o arranque normal mostra-a.
- **Atualizações:** o plugin só se regista quando a build traz o `tauri.updater.conf.json`, porque a configuração dele exige a chave pública. A atualização é descarregada em segundo plano e instalada com um clique («Reiniciar para atualizar»), nunca sozinha: o instalador fecha a app e o aluno pode estar a meio de uma pergunta. Está ligado o `requireSignedVersion`, que impede que um `latest.json` falso faça a app voltar a uma versão antiga.
- **Assinatura:** o `signCommand` do Tauri chama o `trusted-signing-cli` só quando há as variáveis do Azure. O ficheiro de configuração temporário é escrito sem BOM, porque o Tauri não o leria com BOM.
- **O plugin `process` foi retirado:** reiniciar é o `app.restart()` do próprio Tauri.
