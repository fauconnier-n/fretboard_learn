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
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Audio input needs http://localhost or https');
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.resume();
    // raw signal: no voice processing on a DI
    const audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { ...audio, deviceId: { exact: deviceId } } : audio,
      });
    } catch (e) {
      if (!deviceId || e.name !== 'OverconstrainedError') throw e;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio }); // saved device is gone
    }
    const track = this.stream.getAudioTracks()[0];
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
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    for (const n of [this.source, this.splitter, this.gainNode, this.analyser, this.sink, ...(this.probes || [])]) n?.disconnect();
    this.source = this.splitter = this.gainNode = this.analyser = this.sink = null;
    this.probes = [];
  }
}
