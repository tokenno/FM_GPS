let audioCtx;
let carrierOsc, modulatorOsc, modGain;
let lockPosition = null;
let reverseMapping = false;
let watchId = null;

let baseFreq = 440;
let freqRange = 200;
let modRate = 10;
let waveform = 'sine';

const statusEl = document.getElementById("status");

function log(msg) {
  console.log(msg);
  if (statusEl) statusEl.textContent = msg;
}

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Carrier
  carrierOsc = audioCtx.createOscillator();
  carrierOsc.type = waveform;
  carrierOsc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);

  // Modulator
  modulatorOsc = audioCtx.createOscillator();
  modulatorOsc.type = 'sine';
  modulatorOsc.frequency.setValueAtTime(modRate, audioCtx.currentTime);

  modGain = audioCtx.createGain();
  modGain.gain.setValueAtTime(0, audioCtx.currentTime); // Start with no modulation

  // Modulate via detune (in cents)
  modulatorOsc.connect(modGain);
  modGain.connect(carrierOsc.detune);

  // Output
  carrierOsc.connect(audioCtx.destination);

  carrierOsc.start();
  modulatorOsc.start();
}

function updateModulation(distance) {
  // Simple log mapping
  const mapped = Math.min(Math.max(Math.log10(distance + 1) * 100, 0), 100);

  const modDepthHz = reverseMapping
    ? ((100 - mapped) / 100) * freqRange
    : (mapped / 100) * freqRange;

  const modDepthCents = (modDepthHz / baseFreq) * 100;

  modGain.gain.setValueAtTime(modDepthCents, audioCtx.currentTime);
