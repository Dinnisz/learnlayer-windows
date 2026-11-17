# Testes na app real (Windows)

Pequenos utilitários para experimentar a app nativa sem pessoa ao teclado. Só servem com uma build de
**desenvolvimento**: o hook do Alt-clique ignora eventos injetados, exceto com `LEARNLAYER_TEST_INPUT=1`.

```
LEARNLAYER_TEST_INPUT=1 npm run tauri dev
```

- `desk.ps1 shot <ficheiro.png> [x y w h] [escala]`: captura do ecrã (píxeis físicos).
- `desk.ps1 move x y`, `desk.ps1 click x y [alt]`, `desk.ps1 drag x1 y1 x2 y2`: rato.
- `desk.ps1 key esc|enter|1..4`, `desk.ps1 keys ctrl+shift space`: teclado.
- `front.ps1 "<início do título>"`: põe essa janela à frente, maximizada.

A build de desenvolvimento escreve a última leitura de um Alt-clique em `%APPDATA%\LearnLayer\anywhere-debug.json`.
A pílula fica no topo, ao centro; os ícones abertos ficam em y≈70 (ecrã 2560 a 125 %).
