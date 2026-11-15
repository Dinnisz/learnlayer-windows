# Para o Dinis

O que só tu podes fazer. O código fica pronto com o valor em configuração e testado com mocks.

## Pendente

### 1. ⛔ O Smart App Control bloqueia a compilação nativa (o mais importante)

**O que acontece.** O Smart App Control (SAC) do Windows 11 está ligado nesta máquina (`VerifiedAndReputablePolicyState = 1`). O Rust compila pequenos executáveis temporários (*build scripts*) e corre-os durante a build. O SAC bloqueia os que não conhece:

```
error: failed to run custom build command for `typeid v1.0.3`
  Uma política de Controlo de Aplicações bloqueou este ficheiro. (os error 4551)
```

Repeti a build e o bloqueio é o mesmo. O registo `Microsoft-Windows-CodeIntegrity/Operational` (eventos 3077/3033) confirma que foi o SAC.

**O que isto trava.** Tudo o que é Rust: `cargo test`, `npm run tauri dev`, a janela real da app, a pílula, o tray, o Credential Manager, o deep link `learnlayer://`, o Alt-clique (hook, UI Automation, OCR), a voz do sistema e o instalador. A app compilada (`LearnLayer.exe`, sem assinatura) seria muito provavelmente bloqueada também.

**O que não trava.** O `core/` em TypeScript (lógica, prompts, verificação, testes) e a interface em React, que corre no browser com `npm run dev`. É nisso que continuo.

**Não mexi no SAC.** É uma definição de segurança tua, e desligá-la **não tem volta** sem reinstalar o Windows. As opções, por ordem do que eu faria:

1. **Compilar noutro sítio que não tenha SAC.** O mais simples é o CI: cria um repositório privado no GitHub, faz `git remote add origin …` e `git push -u origin main` (eu não faço push). O workflow `.github/workflows/ci.yml` corre `cargo test` e a build em `windows-latest`. Serve para os testes; não serve para experimentares a app nesta máquina.
2. **Uma máquina virtual ou outro PC de desenvolvimento** sem SAC (o Windows Sandbox e o Hyper-V não existem no Windows Home; o VirtualBox ou um PC antigo servem). Abres lá a pasta e escreves «continua».
3. **Desligar o SAC nesta máquina:** Definições › Privacidade e segurança › Segurança do Windows › Controlo de aplicações e browser › Definições do Smart App Control › Desativado. Fica desligado para sempre (só volta com uma reposição do Windows). O Defender e o SmartScreen continuam a funcionar.
4. **Assinatura de código** (ponto 5) resolve o bloqueio da app final para os alunos, mas não o dos build scripts durante o desenvolvimento.

Quando uma destas estiver feita, diz «continua» e eu retomo a parte nativa a partir de `docs/PROGRESSO.md`.

### 1b. Identidade dos commits
Os commits estão com `Dinis Santos <dinis@learnlayer.invalid>` (só na configuração local deste repositório), para não pôr um e-mail verdadeiro no histórico sem tu decidires. Antes do primeiro push: `git config user.email "o-teu@email"` e, se quiseres corrigir os commits antigos, `git rebase -r --root --exec "git commit --amend --no-edit --reset-author"`.

### 2. Segundo link de download (Windows) no site
A página `/download` lê `DOWNLOAD_URL`, que hoje é o do Mac. Para o Windows é preciso um segundo valor (por exemplo `DOWNLOAD_URL_WINDOWS`) e o botão correspondente na página. Mudança no backend/landing — não a fiz.

### 3. Modelo da transcrição rápida fora da lista do servidor
`qwen/qwen3.8-flash` não está na lista de modelos permitidos do Worker, por isso pelo backend sai Haiku. Para a transcrição rápida funcionar como no Mac em Debug, acrescenta o modelo à lista do plano em `backend/src/routing.ts`.

### 4. Conta de assinatura de código (Azure Trusted Signing)
Até existir, as builds não são assinadas e o SmartScreen avisa. Quando tiveres a conta, preciso de: endpoint, nome da conta, nome do perfil de certificado. Ficam em variáveis de ambiente do CI, nunca no repositório.

### 5. URL de atualização automática
O `updater` do Tauri precisa de um URL HTTPS com o `latest.json` e de um par de chaves de assinatura das atualizações (a chave privada fica contigo).

### 6. Entrar na conta no Worker de teste
Para verificar a Fase 1 ao vivo: abrir a app, «Sign in or create an account», entrar no browser. Os critérios que dependem disto ficam marcados «falta verificação do Dinis».

### 7. Experimentar o Alt-clique (Fase 4), quando a app compilar
Depende do ponto 1. Com a app aberta (`npm run tauri dev`):
1. Abre `referencia-mac/Tools/AnywhereProbe/quiz.html` no Chrome, carrega em **Alt** e clica numa pergunta. Deve abrir o palco por cima do Chrome com essa pergunta. O link por baixo não pode abrir e o menu do Chrome não pode aparecer quando largas o Alt.
2. Faz o mesmo num PDF de `exames/` aberto no Edge, no Acrobat Reader e no Word (um `.docx` qualquer com perguntas numeradas).
3. Em cada caso, preenche uma linha em `docs/anywhere-medicao.md`: o texto saiu completo? De onde veio («pdf», «text-range», «block», «region»: aparece em `%APPDATA%\LearnLayer\anywhere-log.jsonl`)? Quanto tempo demorou?
4. Com o palco aberto e o foco noutra app, **Esc** tem de o fechar.
5. Para a transcrição rápida em Debug (como no Mac): guarda a tua chave da OpenRouter no Gestor de Credenciais com
   `cmdkey /generic:LearnLayer.OpenRouter /user:openrouter /pass:<a chave>`.
   Numa build de release isto não é usado nunca. Cada chamada real fica em `docs/CUSTOS.md`.

### 8. Experimentar a voz (Fase 5), quando a app compilar
1. **Voz pt-PT do Windows**, para quando a voz premium não está ligada: Definições › Hora e idioma › Voz › Adicionar vozes › «Português (Portugal)». Sem ela, as respostas aparecem escritas em vez de faladas.
2. **Microfone:** na primeira vez que carregas em **Ctrl+Win**, o Windows pode perguntar se a app pode usar o microfone. Diz que sim, ou ativa-o em Definições › Privacidade e segurança › Microfone.
3. **«Explica-me»:** abre `exames/` (Matemática A) no leitor, escolhe uma pergunta, carrega em 3 e depois em «Explica-me». Confirma que a voz é de Portugal e que cada passo acende enquanto é dito.
4. **Tecla de falar:** mantém **Ctrl+Win**, diz «não percebi o passo 2» e larga. Deve ouvir-se logo «Vamos ao ponto 2.» e depois a resposta. Anota em `docs/DECISOES.md` quanto tempo passa entre largar a tecla e começar a ouvir-se.
5. **Custos:** com a voz premium desligada, confirma no Worker de teste que não há pedidos `/v1/audio/speech`.
