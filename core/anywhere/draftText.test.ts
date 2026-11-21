// Port of AnywherePanelTests.noDraftWhenTheWindowTextIsGarbled @ 5701363: while the model reads the picture, the
// computer's own reading is shown as a draft, never when the window's text is a garbled formula (the same formula
// read from the picture is no better, only plausibly wrong).
import { describe, expect, it } from "vitest";
import { draftText } from "./clickReading";

describe("the draft while the model reads", () => {
  it("is not shown when the window's text is garbled", () => {
    const ocr = "5) (2.0) Sej& A E M3x3 (R) tal que PA (I) (2 - 1) (3 - 1)'. Escreva A-I como combin4ao lineu das";
    const screen =
      "5) (2.0)SejaA2M3 3(R)talquepA( )=(2 )(3 )2. EscrevaA 1 comocombinaÁ„olineardas matrizesA2;AeI,ecalculeopolinÛmiocaracterÌsticodeA 1";
    expect(draftText(ocr, [], screen)).toBeNull();
    const clean = "Qual é a capital de Portugal? Justifique a sua resposta.";
    expect(draftText(clean, [], clean)).toBe(clean);
  });
});
