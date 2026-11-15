// The microphone while the talk key is held (the Mac's OnDeviceListener records the same way before it transcribes):
// mono samples, a level for the waveform, and a 16 kHz WAV when the key is let go.

import { encodeWAV, resample, SpeechToText } from "@core/voice/speechToText";

export class Recorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private startedAt = 0;

  /** Starts listening; false when there is no microphone or it is not allowed. */
  async start(onLevel?: (level: number) => void): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      return false;
    }
    this.context = new AudioContext();
    const source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.startedAt = performance.now();
    this.processor.onaudioprocess = (event) => {
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      this.chunks.push(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      onLevel?.(Math.min(1, Math.sqrt(sum / samples.length) * 6));
    };
    source.connect(this.processor);
    this.processor.connect(this.context.destination);
    return true;
  }

  /** Stops and returns what was said as WAV, or null when the key was only tapped. */
  async stop(): Promise<Uint8Array | null> {
    const seconds = (performance.now() - this.startedAt) / 1000;
    const rate = this.context?.sampleRate ?? SpeechToText.sampleRate;
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.context?.close().catch(() => {});
    this.processor = null;
    this.stream = null;
    this.context = null;
    if (seconds < SpeechToText.shortestSeconds || this.chunks.length === 0) return null;
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(total);
    let at = 0;
    for (const chunk of this.chunks) {
      samples.set(chunk, at);
      at += chunk.length;
    }
    this.chunks = [];
    return encodeWAV(resample(samples, rate, SpeechToText.sampleRate), SpeechToText.sampleRate);
  }
}
