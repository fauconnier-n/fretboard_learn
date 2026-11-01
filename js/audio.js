// @ts-check
// Audio input: device + channel selection, gain, and an analyser to read samples from.

export class AudioInput {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.running = false;
    this.channels = 1;
    this.channel = 0;
    this.label = '';
    this.buf = new Float32Array(4096);
    this.gen = 0; // bumped by start() and stop(): a start overtaken during its awaits drops its stream
    /** @type {(() => void) | null} called when the input goes away (interface unplugged) */
    this.onLost = null;
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }

  async listInputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  async start({ deviceId, channel = 0, gain = 1 }) {
    this.stop();
    const id = this.gen;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Audio input needs http://localhost or https');
    // 48 kHz whatever the interface runs at: detection cost grows with the sample rate (a 96 kHz
    // interface would double it) and the browser resamples for free
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
      } catch {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
      }
    }
    await this.ctx.resume();
    if (id !== this.gen) return;
    // raw signal: no voice processing on a DI
    const audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
    };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { ...audio, deviceId: { exact: deviceId } } : audio,
      });
    } catch (e) {
      if (id !== this.gen) return;
      if (!deviceId || e.name !== 'OverconstrainedError') throw e;
      stream = await navigator.mediaDevices.getUserMedia({ audio }); // saved device is gone
    }
    if (id !== this.gen) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    track.onended = () => {
      if (id !== this.gen) return;
      this.stop();
      this.onLost?.();
    };
    const settings = track.getSettings();
    this.label = track.label || 'Audio input';
    this.deviceId = settings.deviceId || '';
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.channels = Math.max(1, settings.channelCount || 1);
    this.splitter = this.ctx.createChannelSplitter(Math.max(2, this.channels));
    this.source.connect(this.splitter);
    // one small analyser per channel, to show which input carries the signal
    this.probes = Array.from({ length: this.channels }, (_, i) => {
      const a = this.ctx.createAnalyser();
      a.fftSize = 1024;
      this.splitter.connect(a, i);
      return a;
    });
    this.probeBuf = new Float32Array(1024);
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = gain;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.gainNode.connect(this.analyser);
    // keep the graph pulled without making any sound
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.analyser.connect(this.sink);
    this.sink.connect(this.ctx.destination);
    this.setChannel(channel);
    this.running = true;
  }

  setChannel(channel) {
    if (!this.splitter) return;
    try {
      this.splitter.disconnect(this.gainNode); // keeps the per-channel probes connected
    } catch {} // not connected yet
    this.channel = Math.min(Math.max(0, Number(channel) || 0), this.channels - 1);
    this.splitter.connect(this.gainNode, this.channel);
  }

  // peak level of each input channel before gain, 0..1
  levels() {
    if (!this.running) return [];
    return this.probes.map((a) => {
      a.getFloatTimeDomainData(this.probeBuf);
      let peak = 0;
      for (const v of this.probeBuf) peak = Math.max(peak, Math.abs(v));
      return peak;
    });
  }

  setGain(g) {
    if (this.gainNode) this.gainNode.gain.value = g;
  }

  read() {
    if (!this.running) return null;
    this.analyser.getFloatTimeDomainData(this.buf);
    return this.buf;
  }

  stop() {
    this.gen++;
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    for (const n of [this.source, this.splitter, this.gainNode, this.analyser, this.sink, ...(this.probes || [])]) n?.disconnect();
    this.source = this.splitter = this.gainNode = this.analyser = this.sink = null;
    this.probes = [];
  }
}
