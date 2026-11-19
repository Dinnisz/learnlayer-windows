#!/usr/bin/env python3
"""Records the onboarding lines that name Windows keys (lines.windows.json) into ui/public/clips/onboarding/, as
onboarding_<step>_windows_<lang>.m4a, with the Mac clips' voices (Tools/OnboardingClips/generate.py):

  python scripts/onboarding-clips/generate.py en                   Kokoro "af_heart", local and free.
  python scripts/onboarding-clips/generate.py pt --cost-cap 0.05   ElevenLabs Flash v2.5 via OpenRouter, voice Joana.

pt reads the OpenRouter key from the Credential Manager (LearnLayer.OpenRouter, as the app does in debug); it is never
an argument and never written anywhere. The four lines cost well under 1 cent; record each paid call in docs/CUSTOS.md.
en needs `pip install kokoro-onnx soundfile` and the model files in KOKORO_MODELS (kokoro-v1.0.onnx, voices-v1.0.bin).
Both need ffmpeg on the PATH. Existing clips are skipped, so a rerun never pays twice. Afterwards, add the recorded
names to `windowsClips` in core/onboarding/onboarding.ts.
"""
import argparse, json, os, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "ui", "public", "clips", "onboarding")
MODEL, VOICE, RATE = "elevenlabs/eleven-flash-v2.5", "nJ5NFqyKb8kn9JBPmo6i", 20.0 / 1_000_000
KOKORO = os.environ.get("KOKORO_MODELS", os.path.join(HERE, "models"))


def to_m4a(src, dst):
    # AAC at 48 kb/s, as the Mac's afconvert call.
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-c:a", "aac", "-b:a", "48k", dst], check=True)


def openrouter_key():
    import keyring  # pip install keyring

    key = keyring.get_password("LearnLayer.OpenRouter", "openrouter")
    if not key:
        sys.exit("no OpenRouter key in the Credential Manager (LearnLayer.OpenRouter)")
    return key


def speak_pt(text, key, dst):
    body = json.dumps({"model": MODEL, "input": text, "voice": VOICE, "response_format": "mp3",
                       "provider": {"options": {"elevenlabs": {"language_code": "pt"}}}}).encode()
    request = urllib.request.Request("https://openrouter.ai/api/v1/audio/speech", data=body, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response, tempfile.NamedTemporaryFile(
            suffix=".mp3", delete=False) as tmp:
        tmp.write(response.read())
    to_m4a(tmp.name, dst)
    os.unlink(tmp.name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("lang", choices=["en", "pt"])
    parser.add_argument("--cost-cap", type=float)
    args = parser.parse_args()
    lines = json.load(open(os.path.join(HERE, "lines.windows.json"), encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    todo = [(step, texts[args.lang]) for step, texts in lines.items()
            if not os.path.exists(os.path.join(OUT, f"onboarding_{step}_windows_{args.lang}.m4a"))]
    if not todo:
        print("nothing to do")
        return
    if args.lang == "pt":
        cost = sum(len(text) for _, text in todo) * RATE
        if args.cost_cap is None or cost > args.cost_cap:
            sys.exit(f"estimated {cost:.4f} USD; pass --cost-cap at or above it")
        key = openrouter_key()
        for step, text in todo:
            speak_pt(text, key, os.path.join(OUT, f"onboarding_{step}_windows_pt.m4a"))
            print(f"ok {step} ({len(text) * RATE:.5f} USD)")
    else:
        import soundfile
        from kokoro_onnx import Kokoro

        kokoro = Kokoro(os.path.join(KOKORO, "kokoro-v1.0.onnx"), os.path.join(KOKORO, "voices-v1.0.bin"))
        for step, text in todo:
            samples, rate = kokoro.create(text, voice="af_heart", speed=1.0, lang="en-us")
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                soundfile.write(tmp.name, samples, rate)
            to_m4a(tmp.name, os.path.join(OUT, f"onboarding_{step}_windows_en.m4a"))
            os.unlink(tmp.name)
            print(f"ok {step}")


if __name__ == "__main__":
    main()
