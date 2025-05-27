let audioCtx;
let carrierOsc, modulatorOsc, modGain;
let lockPosition = null;
let reverseMapping = false;
let watchId = null;
let orientationActive = false;
let micActive = false;
let cameraActive = false;
let motionActive = false;

let baseFreq = 440;
let freqRange = 200;
let modRate = 10;
let waveform = 'sine';

let distanceHistory = [];
let betaHistory = [];

const statusEl = document.getElementById("status");
const canvas = document.getElementById("visualCanvas");
const canvasCtx = canvas?.getContext("2d");

function log(msg) {
  console.log(msg);
  if (statusEl) statusEl.textContent = "Status: " + msg; // Fallback to concatenation
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
    log("Audio error: " + err.message);
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
  distanceHistory.push({ time: now, distance });
  if (distanceHistory.length > 100) distanceHistory.shift();
  updateVisualization();
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
  if (beta === null) {
    log("Orientation data unavailable");
    return;
  }

  const maxModRateChange = 5;
  const modRateOffset = (beta / 180) * maxModRateChange;
  const adjustedModRate = modRate + modRateOffset;
  const finalModRate = Math.max(0.1, Math.min(50, adjustedModRate));
  modulatorOsc.frequency.setValueAtTime(finalModRate, audioCtx.currentTime);
  document.getElementById("modRateValue").textContent = finalModRate.toFixed(1) + " Hz (Tilt: " + beta.toFixed(1) + "°)";
  betaHistory.push({ time: audioCtx.currentTime, beta });
  if (betaHistory.length > 100) betaHistory.shift();
  updateVisualization();
}

async function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
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
    orientationActive = true;
    window.addEventListener("deviceorientation", handleOrientation);
    log("Orientation enabled. Tilt device to adjust modulator frequency.");
  }
}

async function initMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const dataArray = new Float32Array(analyser.fftSize);

    function processMic() {
      if (!micActive) return;
      analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] ** 2;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const maxBaseFreqChange = 100;
      const adjustedBaseFreq = baseFreq + rms * maxBaseFreqChange * 100;
      const finalBaseFreq = Math.max(100, Math.min(1000, adjustedBaseFreq));
      if (carrierOsc) {
        carrierOsc.frequency.setValueAtTime(finalBaseFreq, audioCtx.currentTime);
        document.getElementById("baseFreqValue").textContent = finalBaseFreq.toFixed(1) + " Hz (Mic: " + (rms * 100).toFixed(1) + ")";
      }
      requestAnimationFrame(processMic);
    }
    processMic();
    log("Microphone initialized");
  } catch (err) {
    log("Microphone error: " + err.message);
  }
}

async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.getElementById("video");
    video.srcObject = stream;
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");

    function processCamera() {
      if (!cameraActive) return;
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
        modGain.gain.setValueAtTime(finalFreqRange, audioCtx.currentTime);
        document.getElementById("modRangeValue").textContent = finalFreqRange.toFixed(1) + " Hz (Brightness: " + avgBrightness.toFixed(1) + ")";
      }
      requestAnimationFrame(processCamera);
    }
    video.onloadedmetadata = () => processCamera();
    log("Camera initialized");
  } catch (err) {
    log("Camera error: " + err.message);
  }
}

async function requestMotionPermission() {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    try {
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
  modGain.gain.setValueAtTime(finalFreqRange, audioCtx.currentTime);
  document.getElementById("modRangeValue").textContent = finalFreqRange.toFixed(1) + " Hz (Shake: " + magnitude.toFixed(1) + "g)";
}

function updateVisualization() {
  if (!canvasCtx) return;
  const visType = document.getElementById("visualization").value;
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  canvasCtx.strokeStyle = "#333";
  canvasCtx.lineWidth = 2;

  if (visType === "waveform" && audioCtx && carrierOsc) {
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    carrierOsc.connect(analyser);
    const dataArray = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(dataArray);
    canvasCtx.beginPath();
    for (let i = 0; i < dataArray.length; i++) {
      const x = (i / dataArray.length) * canvas.width;
      const y = (0.5 + dataArray[i] * 0.5) * canvas.height;
      if (i === 0) canvasCtx.moveTo(x, y);
      else canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();
    analyser.disconnect();
  } else if (visType === "distance" && distanceHistory.length > 1) {
    canvasCtx.beginPath();
    const maxDistance = Math.max(...distanceHistory.map(d => d.distance), 100);
    for (let i = 0; i < distanceHistory.length; i++) {
      const x = (i / (distanceHistory.length - 1)) * canvas.width;
      const y = canvas.height * (1 - distanceHistory[i].distance / maxDistance);
      if (i === 0) canvasCtx.moveTo(x, y);
      else canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();
  } else if (visType === "orientation" && betaHistory.length > 1) {
    canvasCtx.beginPath();
    const maxBeta = 180;
    for (let i = 0; i < betaHistory.length; i++) {
      const x = (i / (betaHistory.length - 1)) * canvas.width;
      const y = canvas.height * (1 - (betaHistory[i].beta + maxBeta) / (2 * maxBeta));
      if (i === 0) canvasCtx.moveTo(x, y);
      else canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();
  }
  requestAnimationFrame(updateVisualization);
}

document.addEventListener("DOMContentLoaded", () => {
  const lockBtn = document.getElementById("lockBtn");
  const testBtn = document.getElementById("testBtn");
  const toggleDirectionBtn = document.getElementById("toggleDirectionBtn");
  const orientationBtn = document.getElementById("orientationBtn");
  const micBtn = document.getElementById("micBtn");
  const cameraBtn = document.getElementById("cameraBtn");
  const motionBtn = document.getElementById("motionBtn");
  const baseFreqInput = document.getElementById("baseFreq");
  const modRangeInput = document.getElementById("modRange");
  const modRateInput = document.getElementById("modRate");
  const waveformSelect = document.getElementById("waveform");
  const visSelect = document.getElementById("visualization");

  if (!lockBtn || !testBtn || !toggleDirectionBtn || !orientationBtn || !micBtn || !cameraBtn || !motionBtn || !baseFreqInput || !modRangeInput || !modRateInput || !waveformSelect || !visSelect || !canvas) {
    log("One or more UI elements not found. Check HTML IDs.");
    console.error("Missing elements:", { lockBtn, testBtn, toggleDirectionBtn, orientationBtn, micBtn, cameraBtn, motionBtn, baseFreqInput, modRangeInput, modRateInput, waveformSelect, visSelect, canvas });
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
    log("Frequency mapping " + (reverseMapping ? "reversed" : "normal"));
  });

  orientationBtn.addEventListener("click", () => {
    console.log("Enable Orientation button clicked");
    orientationActive = !orientationActive;
    if (orientationActive) {
      requestOrientationPermission();
    } else {
      window.removeEventListener("deviceorientation", handleOrientation);
      log("Orientation disabled");
    }
  });

  micBtn.addEventListener("click", () => {
    console.log("Toggle Microphone button clicked");
    micActive = !micActive;
    if (micActive) {
      initMicrophone();
    } else {
      log("Microphone disabled");
    }
  });

  cameraBtn.addEventListener("click", () => {
    console.log("Toggle Camera button clicked");
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

  motionBtn.addEventListener("click", () => {
    console.log("Toggle Accelerometer button clicked");
    motionActive = !motionActive;
    if (motionActive) {
      requestMotionPermission();
    } else {
      window.removeEventListener("devicemotion", handleMotion);
      log("Accelerometer disabled");
    }
  });

  baseFreqInput.addEventListener("input", (e) => {
    baseFreq = parseFloat(e.target.value);
    document.getElementById("baseFreqValue").textContent = baseFreq + " Hz";
    if (carrierOsc) carrierOsc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
  });

  modRangeInput.addEventListener("input", (e) => {
    freqRange = parseFloat(e.target.value);
    document.getElementById("modRangeValue").textContent = freqRange + " Hz";
    if (modGain) modGain.gain.setValueAtTime(freqRange, audioCtx.currentTime);
  });

  modRateInput.addEventListener("input", (e) => {
    modRate = parseFloat(e.target.value);
    document.getElementById("modRateValue").textContent = modRate + " Hz";
    if (modulatorOsc) modulatorOsc.frequency.setValueAtTime(modRate, audioCtx.currentTime);
  });

  waveformSelect.addEventListener("change", (e) => {
    waveform = e.target.value;
    if (carrierOsc) carrierOsc.type = waveform;
    log("Waveform changed to " + waveform);
  });

  visSelect.addEventListener("change", () => {
    updateVisualization();
  });

  updateVisualization();
});
