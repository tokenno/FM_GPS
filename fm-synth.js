let audioCtx;
let carrierOsc, modulatorOsc, modGain;
let lockPosition = null;
let reverseMapping = false;
let watchId = null;
let orientationActive = false;
let motionActive = false;
let cameraActive = false;
let currentHeading = 0;

let baseFreq = 440;
let freqRange = 200;
let modRate = 4; // Set to 4Hz as per previous request
let waveform = 'sine';
let maxDistance = 50; // Default max distance (meters)

const statusEl = document.getElementById("status");
let compassSection = null;
let compassSvg = null;
let directionArrow = null;
let distanceDisplay = null;

function log(msg) {
  console.log(msg);
  if (statusEl) {
    statusEl.textContent = "Status: " + msg;
    statusEl.className = msg.includes("error") || msg.includes("denied") || msg.includes("unavailable")
      ? "status error"
      : "status success";
  }
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

    if (carrierOsc) {
      carrierOsc.stop();
      carrierOsc.disconnect();
    }
    if (modulatorOsc) {
      modulatorOsc.stop();
      modulatorOsc.disconnect();
    }
    if (modGain) {
      modGain.disconnect();
    }

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
    log("Audio error: " + err.message);
    return false;
  }
}

function updateModulation(distance) {
  if (!carrierOsc || !modGain) {
    log("Audio nodes not initialized");
    return;
  }
  
  // Scale distance to [0, 100] based on maxDistance
  const scaledDistance = Math.min(distance / maxDistance, 1) * 100;
  const modDepthHz = reverseMapping 
    ? ((100 - scaledDistance) / 100) * freqRange 
    : (scaledDistance / 100) * freqRange;

  const now = audioCtx.currentTime;
  modGain.gain.linearRampToValueAtTime(modDepthHz, now + 0.02);
  carrierOsc.frequency.linearRampToValueAtTime(baseFreq, now + 0.02);
}

// ... (rest of the functions unchanged: updateCompassDisplay, calculateBearing, startGpsTracking, calculateDistance, handleOrientation, requestOrientationPermission, initCamera, requestMotionPermission, handleMotion)

document.addEventListener("DOMContentLoaded", () => {
  const lockBtn = document.getElementById("lockBtn");
  const testBtn = document.getElementById("testBtn");
  const toggleDirectionBtn = document.getElementById("toggleDirectionBtn");
  const orientationBtn = document.getElementById("orientationBtn");
  const motionBtn = document.getElementById("motionBtn");
  const cameraBtn = document.getElementById("cameraBtn");
  const baseFreqInput = document.getElementById("baseFreq");
  const modRangeInput = document.getElementById("modRange");
  const modRateInput = document.getElementById("modRate");
  const waveformSelect = document.getElementById("waveform");
  const maxDistanceSelect = document.getElementById("maxDistance");

  compassSection = document.getElementById("compass-section");
  compassSvg = document.getElementById("compass");
  directionArrow = document.getElementById("direction-arrow");
  distanceDisplay = document.getElementById("distance-display");

  if (!lockBtn || !testBtn || !toggleDirectionBtn || !orientationBtn || !motionBtn || !cameraBtn || !baseFreqInput || !modRangeInput || !modRateInput || !waveformSelect || !maxDistanceSelect) {
    log("One or more UI elements not found. Check HTML IDs.");
    console.error("Missing elements:", { lockBtn, testBtn, toggleDirectionBtn, orientationBtn, motionBtn, cameraBtn, baseFreqInput, modRangeInput, modRateInput, waveformSelect, maxDistanceSelect });
    return;
  }

  // Initialize UI values
  baseFreqInput.value = baseFreq;
  document.getElementById("baseFreqValue").textContent = baseFreq + " Hz";
  baseFreqInput.setAttribute("aria-valuenow", baseFreq);

  modRangeInput.value = freqRange;
  document.getElementById("modRangeValue").textContent = freqRange + " Hz";
  modRangeInput.setAttribute("aria-valuenow", freqRange);

  modRateInput.value = modRate;
  document.getElementById("modRateValue").textContent = modRate + " Hz";
  modRateInput.setAttribute("aria-valuenow", modRate);

  maxDistanceSelect.value = maxDistance;

  // Event listeners
  lockBtn.addEventListener("click", async () => {
    console.log("Lock GPS button clicked");
    await audioCtx?.resume();
    log("Initializing audio and GPS...");
    const audioSuccess = await initAudio();
    if (!audioSuccess) return;
    await startGpsTracking();
    compassSection.style.display = "block";
  });

  testBtn.addEventListener("click", async () => {
    console.log("Test Audio button clicked");
    await audioCtx?.resume();
    const audioSuccess = await initAudio();
    if (audioSuccess) updateModulation(10);
  });

  toggleDirectionBtn.addEventListener("click", async () => {
    await audioCtx?.resume();
    reverseMapping = !reverseMapping;
    log("Frequency mapping " + (reverseMapping ? "reversed" : "normal"));
  });

  orientationBtn.addEventListener("click", async () => {
    console.log("Enable Orientation button clicked");
    await audioCtx?.resume();
    orientationActive = !orientationActive;
    if (orientationActive) {
      requestOrientationPermission();
    } else {
      window.removeEventListener("deviceorientation", handleOrientation);
      log("Orientation disabled");
    }
  });

  cameraBtn.addEventListener("click", async () => {
    console.log("Toggle Camera button clicked");
    await audioCtx?.resume();
    cameraActive = !cameraActive;
    if (cameraActive) {
      initCamera();
    } else {
      log("Camera disabled");
      const video = document.getElementById("video");
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
      }
    }
  });

  motionBtn.addEventListener("click", async () => {
    console.log("Toggle Accelerometer button clicked");
    await audioCtx?.resume();
    motionActive = !motionActive;
    if (motionActive) {
      requestMotionPermission();
    } else {
      window.removeEventListener("devicemotion", handleMotion);
      log("Accelerometer disabled");
    }
  });

  baseFreqInput.addEventListener("input", async (e) => {
    await audioCtx?.resume();
    baseFreq = parseFloat(e.target.value);
    document.getElementById("baseFreqValue").textContent = baseFreq + " Hz";
    baseFreqInput.setAttribute("aria-valuenow", baseFreq);
    if (carrierOsc) {
      carrierOsc.frequency.linearRampToValueAtTime(baseFreq, audioCtx.currentTime + 0.02);
    }
  });

  modRangeInput.addEventListener("input", async (e) => {
    await audioCtx?.resume();
    freqRange = parseFloat(e.target.value);
    document.getElementById("modRangeValue").textContent = freqRange + " Hz";
    modRangeInput.setAttribute("aria-valuenow", freqRange);
    if (modGain) {
      modGain.gain.linearRampToValueAtTime(freqRange, audioCtx.currentTime + 0.02);
    }
  });

  modRateInput.addEventListener("input", async (e) => {
    await audioCtx?.resume();
    modRate = parseFloat(e.target.value);
    document.getElementById("modRateValue").textContent = modRate + " Hz";
    modRateInput.setAttribute("aria-valuenow", modRate);
    if (modulatorOsc) {
      modulatorOsc.frequency.linearRampToValueAtTime(modRate, audioCtx.currentTime + 0.02);
    }
  });

  waveformSelect.addEventListener("change", async (e) => {
    await audioCtx?.resume();
    waveform = e.target.value;
    if (carrierOsc) {
      carrierOsc.type = waveform;
    }
    log("Waveform changed to " + waveform);
  });

  maxDistanceSelect.addEventListener("change", async (e) => {
    await audioCtx?.resume();
    maxDistance = parseFloat(e.target.value);
    log(`Maximum distance set to ${maxDistance}m`);
    // Update modulation immediately if GPS is active
    if (lockPosition) {
      navigator.geolocation.getCurrentPosition(pos => {
        const distance = calculateDistance(pos.coords, lockPosition);
        updateModulation(distance);
      });
    }
  });
});
