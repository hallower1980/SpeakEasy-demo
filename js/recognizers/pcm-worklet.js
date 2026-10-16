/* AudioWorklet: microphone audio -> 16 kHz mono PCM16, posted in 100 ms chunks with
 * each chunk's RMS level (0..1) so the main thread can gate out silence.
 * Downsampling averages the input samples that fall in each output sample's window,
 * which is a cheap low-pass and fine for speech recognition. */
class SpeakEasyPcm extends AudioWorkletProcessor {
  constructor(options) {
    super();
    var o = (options && options.processorOptions) || {};
    this.rate = Math.min(o.targetRate || 16000, sampleRate);
    this.ratio = sampleRate / this.rate;
    this.size = Math.round(this.rate * (o.chunkMs || 100) / 1000);
    this.buf = new Int16Array(this.size);
    this.n = 0; this.t = 0; this.acc = 0; this.accN = 0; this.sumsq = 0;
    this.port.postMessage({ type: "format", sampleRate: this.rate, chunkSamples: this.size });
  }
  process(inputs) {
    var input = inputs[0];
    if (!input || !input.length) return true;
    var ch = input[0], chs = input.length;
    for (var i = 0; i < ch.length; i++) {
      var x = ch[i];
      if (chs > 1) { for (var c = 1; c < chs; c++) x += input[c][i]; x /= chs; }
      this.acc += x; this.accN++; this.t += 1;
      if (this.t >= this.ratio) {
        this.t -= this.ratio;
        var v = this.acc / this.accN;
        this.acc = 0; this.accN = 0;
        if (v > 1) v = 1; else if (v < -1) v = -1;
        this.sumsq += v * v;
        this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.n === this.size) {
          var out = this.buf;
          this.port.postMessage({ type: "chunk", pcm: out.buffer, rms: Math.sqrt(this.sumsq / this.size) }, [out.buffer]);
          this.buf = new Int16Array(this.size);
          this.n = 0; this.sumsq = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("speakeasy-pcm", SpeakEasyPcm);
