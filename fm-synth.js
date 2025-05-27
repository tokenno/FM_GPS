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
  if (statusEl) statusEl.textContent = `Status: ${msg}`;
}

async function initAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
      log("Audio context resumed");
    }

    if (carrierOsc) carrierOsc.stop();
    if (modulatorOsc) modulatorOsc.stop();

    carrierOsc = audioCtx.createOscillator();
    carrierOsc.type = waveform;
    carrierOsc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);

    modulatorOsc = audioCtx.createOscillator();
    modulatorOsc.type = 'sine';
    modulatorOsc.frequency.setValueAtTime(modRate, audioCtx.currentTime);

    modGain = audioCtx.createGain();
    modGain.gain.setValueAtTime(freqRange, audioCtx.currentTime);

    modulatorOsc.connect(modGain);
    modGain.connect(carrierOsc.frequency);
    carrierOsc.connect(audioCtx.destination);

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
  if (!carrierOsc || !modGain) {
    log("Audio nodes not initialized");
    return;
  }
  
  const mapped = Math.min(Math.max(Math.log10(distance + 1) * 100, 0), 100);
  const modDepthHz = reverseMapping 
    ? ((100 - mapped) / 100) * freqRange 
    : (mapped / 100) * freqRange;

  const now = audioCtx.currentTime;
  modGain.gain.setValueAtTime(modDepthHz, now);
  carrierOsc.frequency.setValueAtTime(baseFreq, now);
  log(`Modulation updated: ${modDepthHz.toFixed(2)} Hz, Distance: ${distance.toFixed(2)} meters`);
}

async function startGpsTracking() {
  if (!navigator.geolocation) {
    log("Geolocation not supported by this browser or device.");
    return;
  }

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    log("Cleared previous GPS watch");
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });
    lockPosition = position.coords;
    log(`GPS position locked: Lat ${lockPosition.latitude.toFixed(4)}, Lon ${lockPosition.longitude.toFixed(4)}`);

    watchId = navigator.geolocation.watchPosition(
      pos => {
        if (!lockPosition) {
          log("Lock position not set");
          return;
        }
        const distance = calculateDistance(pos.coords, lockPosition);
        updateModulation(distance);
      },
      err => {
        if (err.code === 1) {
          log("GPS permission denied. Please allow location access.");
        } else if (err.code === 2) {
          log("GPS unavailable. Check your device's location services.");
        } else if (err.code === 3) {
          log("GPS request timed out. Try again in an open area.");
        } else {
          log(`GPS watch error: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } catch (err) {
    if (err.code === 1) {
      log("GPS permission denied. Please allow location access.");
    } else if (err.code === 2) {
      log("GPS unavailable. Check your device's location services.");
    } else if (err.code === 3) {
      log("GPS request timed out. Try again in an open area.");
    } else {
      log(`GPS error: ${err.message}`);
    }
  }
}

function calculateDistance(coords1, coords2) {
  if (!coords1 || !coords2 || !coords1.latitude || !coords2.latitude) {
    log("Invalid coordinates for distance calculation");
    return 0;
  }
  const R = 6371e3;
  const φ1 = coords1.latitude * Math.PI / 180;
  const φ2 = coords2.latitude * Math.PI / 180;
  const Δφ = (coords2.latitude - coords1.latitude) * Math.PI / 180;
  const Δλ = (coords2.longitude - coords1.longitude) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

document.addEventListener("DOMContentLoaded", () => {
  const lockBtn = document.getElementById("lockBtn");
  const testBtn = document.getElementById("testBtn");
  const toggleDirectionBtn = document.getElementById("toggleDirectionBtn");
  const baseFreqInput = document.getElementById("baseFreq");
  const modRangeInput = document.getElementById("modRange");
  const modRateInput = document.getElementById("modRate");
  const waveformSelect = document.getElementById("waveform");

  if (!lockBtn || !testBtn || !toggleDirectionBtn || !baseFreqInput || !modRangeInput || !modRateInput || !waveformSelect) {
    log("One or more UI elements not found. Check HTML IDs.");
    console.error("Missing elements:", { lockBtn, testBtn, toggleDirectionBtn, baseFreqInput, modRangeInput, modRateInput, waveformSelect });
    return;
  }

  lockBtn.addEventListener("click", async () => {
    console.log("Lock GPS button clicked");
    log("Initializing audio and GPS...");
    const audioSuccess = await initAudio();
    if (!audioSuccess) return;
    await startGpsTracking();
  });

  testBtn.addEventListener("click", async () => {
    console.log("Test Audio button clicked");
    const audioSuccess = await initAudio();
    if (audioSuccess) updateModulation(10);
  });

  toggleDirectionBtn.addEventListener("click", () => {
    reverseMapping = !reverseMapping;
    log(`Frequency mapping ${reverseMapping ? "reversed" : "normal"}`);
  });

  baseFreqInput.addEventListener("input", (e) => {
    baseFreq = parseFloat(e.target.value);
    document.getElementById("baseFreqValue").textContent = `${baseFreq} Hz`;
    if (carrierOsc) carrierOsc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
  });

  modRangeInput.addEventListener("input", (e) => {
    freqRange = parseFloat(e.target.value);
    document.getElementById("modRangeValue").textContent = `${freqRange} Hz`;
  });

  modRateInput.addEventListener("input", (e) => {
    modRate = parseFloat(e.target.value);
    document.getElementById("modRateValue").textContent = `${modRate} Hz`;
    if (modulatorOsc) modulatorOsc.frequency.setValueAtTime(modRate, audioCtx.currentTime);
  });

  waveformSelect.addEventListener("change", (e) => {
    waveform = e.target.value;
    if (carrierOsc) carrierOsc.type = waveform;
    log(`Waveform changed to ${waveform}`);
  });
});