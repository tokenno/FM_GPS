let audioCtx = null;
let carrierOsc = null;
let modulatorOsc = null;
let modGain = null;
let lockPosition = null;
let reverseMapping = false;
let watchId = null;
let orientationActive = false;
let motionActive = false;
let cameraActive = false;
let currentHeading = 0;

let baseFreq = 440;
let freqRange = 200;
let modRate = 4;
let waveform = 'sine';
let distanceBand = 50; // Default distance band in meters

const statusEl = document.getElementById("status");
let compassSection = null;
let compassSvg = null;
let directionArrow = null;
let distanceDisplay = null;

function log(msg, isError = false) {
  console.log(msg);
  if (statusEl) {
    statusEl.textContent = `Status: ${msg}`;
    statusEl.className = `status ${isError ? 'error' : 'success'}`;
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

    // Clean up existing oscillators
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

    // Create new audio nodes
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
    log("Audio error: " + err.message, true);
    return false;
  }
}

function updateModulation(distance) {
  if (!carrierOsc || !modGain) {
    log("Audio nodes not initialized", true);
    return;
  }
  
  // Normalize distance relative to selected distance band
  const normalizedDistance = Math.min(Math.max(distance / distanceBand, 0), 1);
  const modDepthHz = reverseMapping 
    ? (1 - normalizedDistance) * freqRange 
    : normalizedDistance * freqRange;

  const now = audioCtx.currentTime;
  modGain.gain.linearRampToValueAtTime(modDepthHz, now + 0.02);
  carrierOsc.frequency.linearRampToValueAtTime(baseFreq, now + 0.02);
}

function updateCompassDisplay(distance, bearing) {
  if (!compassSection || !directionArrow || !distanceDisplay) return;
  
  const arrowRotation = bearing - currentHeading;
  directionArrow.setAttribute('transform', `rotate(${-arrowRotation}, 100, 100)`);
  distanceDisplay.textContent = `${distance.toFixed(0)}m`;
}

function calculateBearing(coords1, coords2) {
  const φ1 = coords1.latitude * Math.PI / 180;
  const φ2 = coords2.latitude * Math.PI / 180;
  const λ1 = coords1.longitude * Math.PI / 180;
  const λ2 = coords2.longitude * Math.PI / 180;
  
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - 
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);
  
  return (θ * 180 / Math.PI + 360) % 360;
}

async function startGpsTracking() {
  if (!navigator.geolocation) {
    log("Geolocation not supported by this browser or device.", true);
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
          log("Lock position not set", true);
          return;
        }
        const distance = calculateDistance(pos.coords, lockPosition);
        updateModulation(distance);
        
        if (currentHeading !== null) {
          const bearing = calculateBearing(pos.coords, lockPosition);
          updateCompassDisplay(distance, bearing);
        }
      },
      err => {
        log(`GPS error: ${err.message}`, true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } catch (err) {
    log(`GPS error: ${err.message}`, true);
  }
}

function calculateDistance(coords1, coords2) {
  if (!coords1 || !coords2 || !coords1.latitude || !coords2.latitude) {
    log("Invalid coordinates for distance calculation", true);
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

function handleOrientation(event) {
  if (!orientationActive || !modulatorOsc) return;

  const beta = event.beta;
  const alpha = event.alpha;
  
  if (beta === null || alpha === null) {
    log("Orientation data unavailable", true);
    return;
  }

  currentHeading = alpha;
  
  const maxModRateChange = 5;
  const modRateOffset = (beta / 180) * maxModRateChange;
  const adjustedModRate = modRate + modRateOffset;
  const finalModRate = Math.max(0.1, Math.min(50, adjustedModRate));
  modulatorOsc.frequency.linearRampToValueAtTime(finalModRate, audioCtx.currentTime + 0.02);
  document.getElementById("modRateValue").textContent = `${finalModRate.toFixed(1)} Hz (Tilt: ${beta.toFixed(1)}°)`;
  
  if (lockPosition) {
    navigator.geolocation.getCurrentPosition(pos => {
      const distance = calculateDistance(pos.coords, lockPosition);
      const bearing = calculateBearing(pos.coords, lockPosition);
      updateCompassDisplay(distance, bearing);
    });
  }
}

async function requestOrientationPermission() {
  try {
    await audioCtx?.resume();
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission === "granted") {
        orientationActive = true;
        window.addEventListener("deviceorientation", handleOrientation);
        log("Orientation access granted. Tilt device to adjust modulator frequency.");
      } else {
        log("Orientation permission denied.", true);
      }
    } else {
      orientationActive = true;
      window.addEventListener("deviceorientation", handleOrientation);
      log("Orientation enabled. Tilt device to adjust modulator frequency.");
    }
  } catch (err) {
    log("Orientation error: " + err.message, true);
  }
}

async function initCamera() {
  try {
    await audioCtx?.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.getElementById("video");
    video.srcObject = stream;
    video.classList.remove("hidden");
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");

    let lastUpdate = 0;
    function processCamera(timestamp) {
      if (!cameraActive) return;
      if (timestamp - lastUpdate < 100) {
        requestAnimationFrame(processCamera);
        return;
      }
      lastUpdate = timestamp;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        const brightness = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
        sum += brightness;
      }
      const avgBrightness = sum / (imageData.data.length / 4);
      const normalizedBrightness = avgBrightness / 255;
      const adjustedFreqRange = normalizedBrightness * 500;
      const finalFreqRange = Math.max(0, Math.min(500, adjustedFreqRange));
      if (modGain) {
        modGain.gain.linearRampToValueAtTime(finalFreqRange, audioCtx.currentTime + 0.02);
        document.getElementById("modRangeValue").textContent = `${finalFreqRange.toFixed(1)} Hz (Brightness: ${avgBrightness.toFixed(1)})`;
      }
      requestAnimationFrame(processCamera);
    }
    video.onloadedmetadata = () => requestAnimationFrame(processCamera);
    log("Camera initialized");
  } catch (err) {
    log("Camera error: " + err.message, true);
  }
}

async function requestMotionPermission() {
  try {
    await audioCtx?.resume();
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission === "granted") {
        motionActive = true;
        window.addEventListener("devicemotion", handleMotion);
        log("Motion access granted. Shake device to adjust modulation depth.");
      } else {
        log("Motion permission denied.", true);
      }
    } else {
      motionActive = true;
      window.addEventListener("devicemotion", handleMotion);
      log("Motion enabled. Shake device to adjust modulation depth.");
    }
  } catch (err) {
    log("Motion error: " + err.message, true);
  }
}

function handleMotion(event) {
  if (!motionActive || !modGain) return;
  const accel = event.acceleration;
  if (!accel || accel.x === null) {
    log("Motion data unavailable", true);
    return;
  }
  const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
  const maxFreqRangeChange = 500;
  const mappedMagnitude = Math.min(magnitude, 10);
  const adjustedFreqRange = (mappedMagnitude / 10) * maxFreqRangeChange;
  const finalFreqRange = Math.max(0, Math.min(500, adjustedFreqRange));
  modGain.gain.linearRampToValueAtTime(finalFreqRange, audioCtx.currentTime + 0.02);
  document.getElementById("modRangeValue").textContent = `${finalFreqRange.toFixed(1)} Hz (Shake: ${magnitude.toFixed(1)}g)`;
}

document.addEventListener("DOMContentLoaded", () => {
  compassSection = document.getElementById("compass-section");
  compassSvg = document.getElementById("compass");
  directionArrow = document.getElementById("direction-arrow");
  distanceDisplay = document.getElementById("distance-display");

  const elements = {
    lockBtn: document.getElementById("lockBtn"),
    testBtn: document.getElementById("testBtn"),
    toggleDirectionBtn: document.getElementById("toggleDirectionBtn"),
    orientationBtn: document.getElementById("orientationBtn"),
    motionBtn: document.getElementById("motionBtn"),
    cameraBtn: document.getElementById("cameraBtn"),
    baseFreqInput: document.getElementById("baseFreq"),
    modRangeInput: document.getElementById("modRange"),
    modRateInput: document.getElementById("modRate"),
    waveformSelect: document.getElementById("waveform"),
    distanceBandSelect: document.getElementById("distanceBand"),
  };

  if (Object.values(elements).some(el => !el)) {
    log("One or more UI elements not found. Check HTML IDs.", true);
    console.error("Missing elements:", elements);
    return;
  }

  elements.lockBtn.addEventListener("click", async () => {
    console.log("Lock GPS button clicked");
    await initAudio();
    await startGpsTracking();
    compassSection.style.display = "block";
  });

  elements.testBtn.addEventListener("click", async () => {
    console.log("Test Audio button clicked");
    const audioSuccess = await initAudio();
    if (audioSuccess) updateModulation(10);
  });

  elements.toggleDirectionBtn.addEventListener("click", async () => {
    await audioCtx?.resume();
    reverseMapping = !reverseMapping;
    log(`Frequency mapping ${reverseMapping ? "reversed" : "normal"}`);
  });

  elements.orientationBtn.addEventListener("click", async () => {
    console.log("Toggle Orientation button clicked");
    orientationActive = !orientationActive;
    if (orientationActive) {
      await initAudio();
      await requestOrientationPermission();
    } else {
      window.removeEventListener("deviceorientation", handleOrientation);
      log("Orientation disabled");
    }
  });

  elements.cameraBtn.addEventListener("click", async () => {
    console.log("Toggle Camera button clicked");
    cameraActive = !cameraActive;
    if (cameraActive) {
      await initAudio();
      await initCamera();
    } else {
      log("Camera disabled");
      const video = document.getElementById("video");
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.classList.add("hidden");
      }
    }
  });

  elements.motionBtn.addEventListener("click", async () => {
    console.log("Toggle Accelerometer button clicked");
    motionActive = !motionActive;
    if (motionActive) {
      await initAudio();
      await requestMotionPermission();
    } else {
      window.removeEventListener("devicemotion", handleMotion);
      log("Accelerometer disabled");
    }
  });

  elements.baseFreqInput.addEventListener("input", async (e) => {
    await audioCtx?.resume();
    baseFreq = parseFloat(e.target.value);
    document.getElementById("baseFreqValue").textContent = `${baseFreq} Hz`;
    e.target.setAttribute("aria-valuenow", baseFreq);
    if (carrierOsc) {
      carrierOsc.frequency.linearRampToValueAtTime(baseFreq, audioCtx.currentTime + 0.02);
    }
  });

  elements.modRangeInput.addEventListener("input", async (e) => {
    await audioCtx?.resume();
    freqRange = parseFloat(e.target.value);
    document.getElementById("modRangeValue").textContent = `${freqRange} Hz`;
    e.target.setAttribute("aria-valuenow", freqRange);
    if (modGain) {
      modGain.gain.linearRampToValueAtTime(freqRange, audioCtx.currentTime + 0.02);
    }
  });

  elements.modRateInput.addEventListener("input", async (e) => {
    await audioCtx?.resume();
    modRate = parseFloat(e.target.value);
    document.getElementById("modRateValue").textContent = `${modRate} Hz`;
    e.target.setAttribute("aria-valuenow", modRate);
    if (modulatorOsc) {
      modulatorOsc.frequency.linearRampToValueAtTime(modRate, audioCtx.currentTime + 0.02);
    }
  });

  elements.waveformSelect.addEventListener("change", async (e) => {
    await audioCtx?.resume();
    waveform = e.target.value;
    if (carrierOsc) {
      carrierOsc.type = waveform;
    }
    log(`Waveform changed to ${waveform}`);
  });

  elements.distanceBandSelect.addEventListener("change", async (e) => {
    await audioCtx?.resume();
    distanceBand = parseFloat(e.target.value);
    log(`Distance band changed to ${distanceBand} meters`);
  });
});