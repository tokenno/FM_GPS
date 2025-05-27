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

async function initAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Resume context if suspended
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // Clean up previous nodes if they exist
    if (carrierOsc) carrierOsc.stop();
    if (modulatorOsc) modulatorOsc.stop();

    // Create new nodes
    carrierOsc = audioCtx.createOscillator();
    carrierOsc.type = waveform;
    carrierOsc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);

    modulatorOsc = audioCtx.createOscillator();
    modulatorOsc.type = 'sine';
    modulatorOsc.frequency.setValueAtTime(modRate, audioCtx.currentTime);

    modGain = audioCtx.createGain();
    modGain.gain.setValueAtTime(freqRange, audioCtx.currentTime);

    // Connect modulation
    modulatorOsc.connect(modGain);
    modGain.connect(carrierOsc.frequency); // Modulate frequency directly

    // Output
    carrierOsc.connect(audioCtx.destination);

    // Start oscillators
    carrierOsc.start();
    modulatorOsc.start();

    log("Audio initialized");
    return true;
  } catch (err) {
    log(`Audio error: ${err.message}`);
    return false;
  }
}

function updateModulation(distance) {
  if (!carrierOsc || !modGain) return;
  
  // Simple log mapping
  const mapped = Math.min(Math.max(Math.log10(distance + 1) * 100, 0), 100);
  const modDepthHz = reverseMapping 
    ? ((100 - mapped) / 100) * freqRange 
    : (mapped / 100) * freqRange;

  // Update modulation in real-time
  const now = audioCtx.currentTime;
  modGain.gain.setValueAtTime(modDepthHz, now);
  carrierOsc.frequency.setValueAtTime(baseFreq, now);
}

// GPS Functions
async function startGpsTracking() {
  if (!navigator.geolocation) {
    log("Geolocation not supported");
    return;
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 5000
      });
    });

    lockPosition = position.coords;
    log("GPS position locked");

    watchId = navigator.geolocation.watchPosition(
      pos => {
        const distance = calculateDistance(pos.coords, lockPosition);
        updateModulation(distance);
      },
      err => log(`GPS error: ${err.message}`),
      { enableHighAccuracy: true }
    );
  } catch (err) {
    log(`GPS error: ${err.message}`);
  }
}

function calculateDistance(coords1, coords2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = coords1.latitude * Math.PI/180;
  const φ2 = coords2.latitude * Math.PI/180;
  const Δφ = (coords2.latitude-coords1.latitude) * Math.PI/180;
  const Δλ = (coords2.longitude-coords1.longitude) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

// UI Event Listeners
document.getElementById("testBtn").addEventListener("click", async () => {
  await initAudio();
  updateModulation(10); // Test with moderate modulation
});

document.getElementById("lockBtn").addEventListener("click", async () => {
  await initAudio();
  await startGpsTracking();
});

document.getElementById("toggleDirectionBtn").addEventListener("click", () => {
  reverseMapping = !reverseMapping;
  log(`Mapping ${reverseMapping ? "reversed" : "normal"}`);
});

// Parameter Controls
document.getElementById("baseFreq").addEventListener("input", (e) => {
  baseFreq = parseFloat(e.target.value);
  if (carrierOsc) carrierOsc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
});

document.getElementById("modRange").addEventListener("input", (e) => {
  freqRange = parseFloat(e.target.value);
});

document.getElementById("modRate").addEventListener("input", (e) => {
  modRate = parseFloat(e.target.value);
  if (modulatorOsc) modulatorOsc.frequency.setValueAtTime(modRate, audioCtx.currentTime);
});

document.getElementById("waveform").addEventListener("change", (e) => {
  waveform = e.target.value;
  if (carrierOsc) carrierOsc.type = waveform;
});