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
- **Ainda por portar (registado em PROGRESSO.md):** ~~as figuras 3D, as figuras pré-feitas animadas, as marcas da lição, o pedido «visual aid» e o menu de estudo~~ — todos feitos em 2026-11-17/18 (o «visual aid» em `core/problems/visualAid.ts`, prompt v1 palavra a palavra, ligado à sessão como no Mac). Fica a animação de transformação da equação (`EquationMorph.swift`).

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

## 2026-11-16 — Ações da pílula e texto selecionado
- **Encontrado ao rever:** os comandos da pílula («Perguntar sobre este exercício», as perguntas sugeridas, silenciar, parar a fala, «Capturar uma área», «Explicar texto selecionado») não chegavam a nenhuma janela. A pílula também nunca sabia que havia um exercício aberto. Agora o palco publica o exercício aberto (com as perguntas sugeridas e a disciplina) e responde aos comandos.
- **Silenciar:** como o `SpeechActivity.toggleMute` do Mac, liga e desliga Definições › Geral › Voz. A frase que está a ser dita acaba; as seguintes aparecem escritas.
- **Capturar uma área:** o Mac usa o `screencapture -i` do sistema. No Windows o lado nativo congela o monitor do ponteiro (`BitBlt`) e o palco mostra-o com uma cruz para arrastar o retângulo. Não se usou o recorte do sistema (`ms-screenclip:`), porque esse deixa a imagem na área de transferência do aluno e é preciso adivinhar quando acabou. O recorte vai ao modelo como imagem, com o OCR do Windows feito só nesse recorte, como no Mac. Com o Alt-clique ligado, «Capturar o ecrã» faz o mesmo (no Mac esse botão volta a ligar o Alt-clique, que aí já está ligado).
- **Explicar texto selecionado:** a seleção da app que está à frente é lida pela UI Automation (a pílula nunca fica com o teclado), e nada é lido nos browsers de exame. Sem seleção, aparece «Select some text first.».
- **Texto selecionado como passagem:** esta entrada substitui a de 2026-11-15 sobre o texto selecionado. Um Alt-clique em texto selecionado, ou «Explicar texto selecionado», abre agora uma passagem própria, como a `SelectionSession` do Mac: explica-o, o que pede, ou uma pista, num só pedido TextHelp v5.
  - O gráfico que o TextHelp pode trazer aparece por baixo da resposta («Gráfico»), com o parâmetro para arrastar, como no Mac.
  - O contexto à volta da seleção vai vazio, porque a UI Automation não o dá como o `AccessibilityReader` do Mac.
  - A seleção no leitor de PDF da própria app ainda não acende a ação da pílula (`hasReaderSelection`).

## 2026-11-17 — Primeiros testes na app real (Alt-clique, pílula)
- **Cliques de teste:** o hook ignora eventos injetados, de propósito, para não reagir a programas que simulam cliques. Para testar sem pessoa, uma build de **desenvolvimento** lançada com `LEARNLAYER_TEST_INPUT=1` aceita-os. A release nunca lê esta variável (`cfg!(debug_assertions)`).
- **Registo de diagnóstico:** uma build de desenvolvimento escreve a última leitura em `%APPDATA%\LearnLayer\anywhere-debug.json` (texto lido, linhas do OCR, decisão). A release não escreve nada (`import.meta.env.DEV`).
- **OCR do Windows e «Pergunta 1»:** o `Windows.Media.Ocr` leu «Pergunta 1» como «Pergunta I» numa página em Times. Sem o título, a regra do cabeçalho do exame recusava a pergunta. Os títulos com palavra («Pergunta», «Questão», «Exercício»…) aceitam agora «I», «l» ou «|» como 1. O padrão do Mac é igual exceto nisto (o Vision lê bem).
- **Texto estragado sem região:** se a UI Automation devolve texto estragado (fórmulas um símbolo por linha) e não se encontra região, recorta-se a imagem onde a UI Automation diz que o texto está, para o modelo a ler. Não se recorta quando esse sítio é a janela quase toda.
- **Seleção que a UI Automation não dá:** o leitor de PDF do Chromium (Edge, Chrome, Brave) tem seleção mas não a expõe. A app copia-a com Ctrl+C na app da frente, lê a área de transferência e repõe o texto que lá estava. Não o faz se a área de transferência tiver uma imagem ou ficheiros, que se perderiam. O Mac lê sempre pela acessibilidade.
- **A pílula e o teclado:** clicar na pílula pode dar-lhe o teclado. Antes de ler a seleção, a app devolve o teclado à primeira janela visível com título abaixo das do LearnLayer.

## 2026-11-17 — Circuitos
- **Resolvedor e verificação:** portados do Mac (`Circuit3DSolve.swift`) com os testes dele. Um circuito desenhado tem de ter, entre os terminais, a resistência que a resposta dá (e a tensão de Thévenin, se a resposta a tiver). Se a diferença for só de escala (kΩ escritos como ohms), corrige-se; se a fonte estiver virada, vira-se; senão o fornecedor pede outra vez com uma nota, e a sessão não mostra o circuito.
- **Desenho:** o Mac monta uma placa 3D (SceneKit). No Windows desenha-se o mesmo traçado (a colocação na grelha do Mac, `CircuitPlacement` e `CircuitLayout`, com os testes dele) como esquema 2D em SVG, com os símbolos dos enunciados portugueses (resistência em retângulo IEC, pilha com placa longa no +, condensador, bobina, lâmpada, interruptor, fonte de corrente). Os terminais ficam a azul. Ficam de fora a corrente animada (pontos ao longo dos fios), as cores das bandas e as junções de resistências da lição, que dependem da placa 3D.
- Demonstração: `overlay.html?demo=circuit` no browser.

## 2026-11-17 — Sólidos em 3D
- **Portado do Mac:** a leitura segura das fórmulas (`SafeFormula`), o sólido genérico (premade `solid3d`: revolução, superfície, paramétrica, sólido limitado, secções), o construtor das malhas (`GenericSolidBuilder`) e a verificação do volume contra a resposta (`SolidCheck`), com os testes do Mac. Como no Mac, um sólido que não se pode desenhar honestamente (atravessa o eixo, topo abaixo da base, pouco definido) não é aceite, e um sólido cujo volume não é o da resposta é pedido outra vez e depois não aparece.
- **Desenho:** com three.js (0.186) em vez do SceneKit, a partir das mesmas malhas. O exterior é branco translúcido, o buraco e as paredes mais ténues, e a região, a secção e as curvas no único azul. Roda devagar sozinho até o aluno o arrastar; com o movimento reduzido fica parado.
- **Ainda não:** as figuras 3D fixas (`solid_cone` e as outras de `Figure3D.swift`), a montagem passo a passo e o realce das partes pela mascote (`Figure3DSteps`, `GenericFigure3DController`), e a fatia que percorre o intervalo.
- Demonstração: `overlay.html?demo=circuit` mostra também três sólidos.

## 2026-11-17 — O passo comanda o sólido: integral, fatia e montagem
- **Portado do Mac:** `LatexIntegral` (o integral que um passo escreve em LaTeX, lido e calculado pela app pela regra de Simpson), o plano dos passos de um sólido (o passo cujo integral dá o volume do sólido desenhado, a menos de 0,5 %, manda a fatia percorrer [a, b], só em revoluções e secções), `playSweep` (uma fatia exata depois da outra em 1,8 s, a última fica, o sólido enche-se por trás; com movimento reduzido, três fatias paradas) e `apply` do `GenericFigure3DController` (`assembleStep` mostra as primeiras partes pela ordem de montagem; o realce aceita os sinónimos e várias partes; as outras ficam a 30 %). `stepFigureHooks` também está portado para a lição da mascote.
- **Dúvida:** no Mac os ganchos do passo (`stepFigureHooks`) só servem à mascote que percorre os passos, e um realce deduzido só aparece no passo em que muda. **Escolha:** num passo clicado pelo aluno, o realce do cartão (`figureHighlight`) vem primeiro e senão usa-se o plano desse passo mesmo que seja igual ao do anterior. **Porquê:** quem clica no passo 3 quer ver o que ele faz à figura, não a figura sem realce só porque o passo 2 fazia o mesmo.

## 2026-11-17 — Figuras pré-feitas animadas e seleção no leitor
- **Portado do Mac, com os testes:** a base das figuras animadas (`FigureCanvas`, `PremadeFrame`, `Anim`, `LabelBoard`), as 10 de Cálculo 1, as séries e curvas (4) e as cenas de física (3, com a viagem da mascote que se transforma no objeto). O renderizador já animava com `t` e `duration`, por isso o porte é só lógica. As figuras que o Mac oferece e o Windows ainda não desenha continuam a devolver `null`: o fornecedor pede um template e uma figura que não se pode desenhar nunca aparece.
- **Ainda não:** os passos discretos (`stepPlayback`) não têm controlos na interface; as figuras repetem em ciclo, como as outras animadas. A preferência «mascote desligada» não chega às cenas de física (a mascote aparece sempre na viagem).
- **Seleção no leitor:** camada de texto do pdf.js (CSS adaptado de `pdf_viewer.css`), botão «Ask» junto ao fim da seleção e Enter, como o `AskButton` do Mac. Uma linha de matemática abre o explicador de fórmulas com o contexto «o aluno selecionou este passo…» do Mac; prosa abre o painel do excerto. Um arrasto sobre uma etiqueta de pergunta seleciona texto e não abre a pergunta (`isPlainClick`).

## 2026-11-17 — Mais figuras animadas
- **Portado do Mac, com os testes:** várias variáveis, algoritmos e estruturas de dados, curva de aquecimento, ótica (Batch 2), programação (ciclo, recursão, fluxograma com interpretador), lógica (fórmulas, tabela de verdade), mapa de argumentos e silogismos (Batch 4), os controlos de passos (`IllustrationStepControls`) e as regras dos sliders (`mergingParameters`, `adjustingBatch4`, `mergeBatch4Parameter`).
- **Dúvida:** o teste genérico «params inválidos voltam para trás» do Mac só percorre `AnimatedKind`. **Escolha:** o porte usa a mesma lista explícita. **Porquê:** as famílias Batch têm valores por defeito para todos os parâmetros (a ótica, por exemplo), por isso o teste não se lhes aplica no Mac.
- **Feito depois:** a matemática de Batch 3 (todas as famílias pré-feitas do Mac estão portadas).

## 2026-11-17 — Arredondamento dos números nas figuras e tempos dos testes
- **Dúvida:** `formatG`/`formatF` (porte do `String(format:)`) usavam `toFixed`/`toExponential`, que num empate exato (1086,5 com 4 algarismos) arredondam para cima; o C do Mac arredonda para o par («1086»). Apareceu ao portar as tendências periódicas. **Escolha:** os empates exatos (vistos na expansão decimal exata do double) vão para o algarismo par, como no C; o resto não muda. **Porquê:** os rótulos e as chaves de cache têm de ser iguais aos do Mac. Testes novos em `core/math/printf.test.ts`.
- **Dúvida:** com o conjunto completo de testes em paralelo, este PC passa os 5 s por teste em testes que sozinhos demoram 1 a 2 s. **Escolha:** `testTimeout` de 20 s no `vitest.config.ts` (só tempo, nenhuma verificação muda); os testes de tempo do circuito mantêm o limite de 100 ms do Mac, medido na mais rápida de três execuções.
- **Feito:** portas lógicas, eletromagnetismo de Batch 2 (linhas de campo e equipotenciais traçadas pela app, placas, fio, espira, solenoide, Lorentz, Faraday-Lenz, RC, CA), a física de Batch 3 (diagrama de forças, movimento circular, energias, colisões, mola, resistências, roldanas) e a química e biologia de Batch 3 (Lewis, perfil energético, titulação, tabela ICE, tendências periódicas, cinética, Punnett), cada uma com os testes do Mac. As verificações de cena dos testes (`AnimatedFigureCheck`) estão em `core/illustrations/animated/sceneCheck.ts`.

## 2026-11-18 — Ruffini: um só sinal de menos
- **Dúvida:** no Mac, `formatCoeff` (PremadeFigureKinds.swift) escreve um coeficiente negativo não inteiro com dois sinais («−−0,5»), porque o `TemplateWords.number` já põe o «−». **Escolha:** o porte escreve o sinal uma vez («−0,5»). **Porquê:** nunca mostrar matemática errada. Vale a pena corrigir também no Mac.
- **Portado:** diagrama de orbitais, regra de Ruffini e passos de uma equação (`core/illustrations/animated/kinds.ts`), que faltavam. **Feito depois:** as marcas da lição «Explica-me» no palco seguem agora a ordem do Mac (`LessonGeometry.region`): a opção, um rótulo da figura procurado no texto da página, a citação e, por fim, uma caixa do modelo validada (`core/lesson/lessonGeometry.ts`). Falta vê-las com uma lição real (precisa da conta).

## 2026-11-18 — Menu de estudo do explicador
- **Dúvida:** o Mac mostra sempre o menu de estudo em português (Gráfico, Zeros, Máximos e mínimos / monotonia, Derivada, Integral / área, Domínio e assíntotas, Quadro de sinal e, numa equação, Resolver); o CLAUDE.md descreve o menu Explicar / Mostrar o gráfico / Deixa-me tentar / Resolver passo a passo, que o Windows tinha. **Escolha:** um clique que se lê como função ou equação (`ParsedStandaloneMath`) mostra o menu de estudo do Mac, com a nota ao modelo (`promptAddendum`), a tarefa na chave da cache e a figura que a app constrói (`ExplanationFigure`); qualquer outra fórmula (v = d/t, E = mc²) mostra o menu do CLAUDE.md. **Porquê:** o código Swift manda, e para uma fórmula de física «Zeros» ou «Domínio e assíntotas» não fazem sentido. Os títulos são chaves em inglês com tradução pt-PT («Graph» já existia no catálogo do Mac, «Gráfico»). Código em `core/explanation/studyAction.ts`. Verificado no leitor com um PDF de teste: o menu aparece e «Gráfico» desenha a função.
- **Dúvida:** uma função lida do PDF vem com produtos implícitos («x^2-4x+3»); as figuras trocam a variável pelo nome, e o «x» de «4x» fica por trocar, por isso a figura não se desenhava (no Mac também). **Escolha:** a figura local do menu escreve os produtos de forma explícita (`explicitProducts`: «4x» → «4*x», sem tocar em «log10(x)» nem em «1e5»). Vale a pena corrigir também no Mac.

## 2026-11-18 — Uma linha da resolução a tornar-se a seguinte
- **Portado do Mac, com os testes:** `EquationMorph` (peças, chave, diff, leitura do passo, plano, linhas alinhadas, tempos) e `MorphPacer` (as linhas de um bloco ao compasso da voz). O desenho (`ui/components/MorphView.tsx`) segue o `EquationMorphView`: cada peça é composta à parte pelo KaTeX e colocada pelo espaçamento da linha.
- **Dúvida:** o Mac acerta cada peça na tinta da linha composta (`Ink.locate`, lendo os píxeis). **Escolha:** aqui não; as peças ficam onde o espaçamento as põe. **Porquê:** no browser não há imagem da fórmula para ler sem desenhá-la num canvas; medido em `?demo=morph`, as peças acabam no mesmo retângulo que a linha final (diferença ≤ 0,6 px), e no último fotograma a linha composta toma o lugar delas.
- **Feito como no Mac:** com a voz ligada, a linha espera até 2 s que a voz se ouça e acerta o ritmo das linhas de um bloco pelo que a voz já disse (`LessonPlayer.voiceProgressed`, a partir do `onProgress` do `speak`; o início da voz é a primeira palavra ouvida). Sem voz, começa logo e o ritmo vem da velocidade de fala (`MorphPacer.speakingSeconds`).
- **Não portado:** os testes do Mac que leem píxeis (`Laid`, `Ink`) e a parte de `theRunPacesItsMorph…` com a duração da voz conhecida antes de tocar (aqui não há clips medidos); os da `LessonRun` estão em `ui/lesson/lessonPlayer.test.ts`; o caso `a = 5 + k − k + 2 → a = 7` faz crossfade, também no Mac (confiança 3/9 < 0,34).
- **Corrigido pelo caminho:** medir uma fórmula antes de as fontes do KaTeX chegarem dá larguras erradas; a medição repete-se quando chegam (`document.fonts.ready`). Uma fórmula em linha tem como caixa só a altura da linha; mede-se pela união das `.katex-base`.

## 2026-11-18 — O aviso «Cuidado» e a resposta que espera pela lição
- **Portado do Mac (`LessonRun`, `PitfallTag`, `showsFinalAnswer`), com os testes:** o aviso de uma lição é conhecido desde o início e fica dobrado no seu passo («Cuidado»), abre-se só enquanto a frase dele é dita, e um toque abre-o ou dobra-o; enquanto a lição corre, a caixa da resposta espera até a lição chegar à linha da resposta e a transformação dela acabar (ou até ao fecho).
- **Dúvida:** o CLAUDE.md pede só um acento azul, mas o `PitfallTag` do Mac usa um âmbar («a única cor quente do tema: um erro a evitar, não uma resposta errada»). **Escolha:** âmbar, como o Mac. **Porquê:** quando o texto e o código Swift discordam, manda o código Swift; com Alto Contraste o Windows troca as cores.

## 2026-11-18 — Matemática dentro das notas dos passos
- **Portado do Mac (`NoteMath`, `NoteText`, `formulaRepeats`), com os testes de `NoteTextTests` e os casos de `LayoutFixTests`/`LiveRunFixTests`:** numa nota como «f' < 0 em ]−∞, 0[», as fórmulas são compostas pelo KaTeX no meio das palavras; as marcas «$…$» nunca aparecem; uma fórmula de passo que só repete a frase da nota, ou só a letra de uma opção, não é desenhada.
- **Não portado:** `NoteLayout` (o Mac dispõe palavras e fórmulas linha a linha à mão, porque o SwiftUI não junta texto e imagens numa linha); no browser o texto em linha faz isso sozinho. Os testes de `NoteLayout` ficam por isso de fora.

## 2026-11-18 — O guarda das respostas do tutor de voz
- **Portado do Mac (`VoiceTutorGuard`), com os testes de `MascotCouncilFixTests` e `OptionFiguresAndAngleGuardTests`:** uma curva de uma função que os passos nunca usam não é desenhada; relações geométricas, ângulos que mudam de vértice e autocorreções que nada no ecrã sustenta ficam registados na consola (o Mac regista-os no log, sem os mostrar).
- **Dúvida:** o ICU aceita `(?i:…)` dentro de uma expressão; o JavaScript só nas versões mais recentes. **Escolha:** os nomes dos ângulos e as palavras são escritos com as duas caixas (`[aA][lL]…`). **Porquê:** o mesmo comportamento sem depender da versão do WebView2.
- **Ainda não:** `holdingTheSymbol` e `namingTheFormula` (dependem de `VoiceCheckPlan`).
