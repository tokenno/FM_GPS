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
let modRate = 4;
let waveform = 'sine';
let maxDistance = 50;

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
  
  const scaledDistance = Math.min(distance / maxDistance, 1) * 100;
  const modDepthHz = reverseMapping 
    ? ((100 - scaledDistance) / 100) * freqRange 
    : (scaledDistance / 100) * freqRange;

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
    log("GPS position locked: Lat " + lockPosition.latitude.toFixed(4) + ", Lon " + lockPosition.longitude.toFixed(4));

    watchId = navigator.geolocation.watchPosition(
      pos => {
        if (!lockPosition) {
          log("Lock position not set");
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
        if (err.code === 1) {
          log("GPS permission denied. Please allow location access.");
        } else if (err.code === 2) {
          log("GPS unavailable. Check your device's location services.");
        } else if (err.code === 3) {
          log("GPS request timed out. Try again in an open area.");
        } else {
          log("GPS watch error: " + err.message);
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
      log("GPS error: " + err.message);
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

function handleOrientation(event) {
  if (!orientationActive || !modulatorOsc) return;

  const beta = event.beta;
  const gamma = event.gamma;
  const alpha = event.alpha;
  
  if (beta === null || gamma === null || alpha === null) {
    log("Orientation data unavailable");
    return;
  }

  currentHeading = alpha;
  
  const maxModRateChange = 5;
  const modRateOffset = (beta / 180) * maxModRateChange;
  const adjustedModRate = modRate + modRateOffset;
  const finalModRate = Math.max(0.1, Math.min(50, adjustedModRate));
  modulatorOsc.frequency.linearRampToValueAtTime(finalModRate, audioCtx.currentTime + 0.02);
  document.getElementById("modRateValue").textContent = finalModRate.toFixed(1) + " Hz (Tilt: " + beta.toFixed(1) + "°)";
  
  if (lockPosition) {
    navigator.geolocation.getCurrentPosition(pos => {
      const distance = calculateDistance(pos.coords, lockPosition);
      const bearing = calculateBearing(pos.coords, lockPosition);
      updateCompassDisplay(distance, bearing);
    });
  }
}

async function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      await audioCtx.resume();
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission === "granted") {
        orientationActive = true;
        window.addEventListener("deviceorientation", handleOrientation);
        log("Orientation access granted. Tilt device to adjust modulator frequency.");
      } else {
        log("Orientation permission denied.");
      }
    } catch (err) {
      log("Orientation error: " + err.message);
    }
  } else {
    await audioCtx.resume();
    orientationActive = true;
    window.addEventListener("deviceorientation", handleOrientation);
    log("Orientation enabled. Tilt device to adjust modulator frequency.");
  }
}

async function initCamera() {
  try {
    await audioCtx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.getElementById("video");
    video.srcObject = stream;
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
        document.getElementById("modRangeValue").textContent = finalFreqRange.toFixed(1) + " Hz (Brightness: " + avgBrightness.toFixed(1) + ")";
      }
      requestAnimationFrame(processCamera);
    }
    video.onloadedmetadata = () => requestAnimationFrame(processCamera);
    log("Camera initialized");
  } catch (err) {
    log("Camera error: " + err.message);
  }
}

async function requestMotionPermission() {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      await audioCtx.resume();
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission === "granted") {
        motionActive = true;
        window.addEventListener("devicemotion", handleMotion);
        log("Motion access granted. Shake device to adjust modulation depth.");
      } else {
        log("Motion permission denied.");
      }
    } catch (err) {
      log("Motion error: " + err.message);
    }
  } else {
    await audioCtx.resume();
    motionActive = true;
    window.addEventListener("devicemotion", handleMotion);
    log("Motion enabled. Shake device to adjust modulation depth.");
  }
}

function handleMotion(event) {
  if (!motionActive || !modGain) return;
  const accel = event.acceleration;
  if (!accel || accel.x === null) {
    log("Motion data unavailable");
    return;
  }
  const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
  const maxFreqRangeChange = 500;
  const mappedMagnitude = Math.min(magnitude, 10);
  const adjustedFreqRange = (mappedMagnitude / 10) * maxFreqRangeChange;
  const finalFreqRange = Math.max(0, Math.min(500, adjustedFreqRange));
  modGain.gain.linearRampToValueAtTime(finalFreqRange, audioCtx.currentTime + 0.02);
  document.getElementById("modRangeValue").textContent = finalFreqRange.toFixed(1) + " Hz (Shake: " + magnitude.toFixed(1) + "g)";
}

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

  if (!lockBtn || !testBtn || !toggleDirectionBtn || !orientationBtn || !motionBtn || !cameraBtn || !baseFreqInput || !modRangeInput || !modRateInput || !waveformSelect || !maxDistanceSelect || !compassSection || !compassSvg || !directionArrow || !distanceDisplay) {
    log("One or more UI elements not found. Check HTML IDs.");
    console.error("Missing elements:", {
      lockBtn: !!lockBtn,
      testBtn: !!testBtn,
      toggleDirectionBtn: !!toggleDirectionBtn,
      orientationBtn: !!orientationBtn,
      motionBtn: !!motionBtn,
      cameraBtn: !!cameraBtn,
      baseFreqInput: !!baseFreqInput,
      modRangeInput: !!modRangeInput,
      modRateInput: !!modRateInput,
      waveformSelect: !!waveformSelect,
      maxDistanceSelect: !!maxDistanceSelect,
      compassSection: !!compassSection,
      compassSvg: !!compassSvg,
      directionArrow: !!directionArrow,
      distanceDisplay: !!distanceDisplay
    });
    return;
  }

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
    if (lockPosition) {
      navigator.geolocation.getCurrentPosition(pos => {
        const distance = calculateDistance(pos.coords, lockPosition);
        updateModulation(distance);
      });
    }
  });
});