// fm-synth.js

// Global synth variables
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let carrierOsc, modOsc, modGain, gainNode;
let isPlaying = false;

// UI elements
const baseFreqSlider = document.getElementById("baseFreq");
const modRangeSlider = document.getElementById("modRange");
const modRateSlider = document.getElementById("modRate");
const waveformSelect = document.getElementById("waveform");
const statusDiv = document.getElementById("status");

// Current frequency (Hz)
let currentFrequency = parseFloat(baseFreqSlider.value);

// --- MIDI Setup ---
let midiAccess = null;
let midiOutput = null;

navigator.requestMIDIAccess()
  .then(onMIDISuccess)
  .catch(onMIDIFailure);

function onMIDISuccess(midi) {
  midiAccess = midi;
  const outputs = Array.from(midiAccess.outputs.values());
  if (outputs.length > 0) {
    midiOutput = outputs[0];
    updateStatus("MIDI ready");
  } else {
    updateStatus("No MIDI outputs found");
  }
}

function onMIDIFailure() {
  updateStatus("MIDI access failed");
}

function sendMIDINote(frequency) {
  if (!midiOutput || !frequency) return;

  const midiNote = Math.round(69 + 12 * Math.log2(frequency / 440));
  const velocity = 100;

  midiOutput.send([0x90, midiNote, velocity]); // Note On
  setTimeout(() => {
    midiOutput.send([0x80, midiNote, 0]); // Note Off
  }, 100);
}

// --- Status update helper ---
function updateStatus(message, isError = false) {
  statusDiv.textContent = `Status: ${message}`;
  statusDiv.className = isError ? "status error" : "status success";
}

// --- Audio Synth Setup ---
function setupSynth() {
  carrierOsc = audioCtx.createOscillator();
  modOsc = audioCtx.createOscillator();
  modGain = audioCtx.createGain();
  gainNode = audioCtx.createGain();

  // Modulator chain
  modOsc.connect(modGain);
  modGain.connect(carrierOsc.frequency);

  // Carrier chain
  carrierOsc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // Initial values
  carrierOsc.frequency.value = currentFrequency;
  carrierOsc.type = waveformSelect.value;

  modOsc.frequency.value = parseFloat(modRateSlider.value);
  modGain.gain.value = parseFloat(modRangeSlider.value);

  gainNode.gain.value = 0.3; // Moderate volume

  carrierOsc.start();
  modOsc.start();

  isPlaying = true;
  updateStatus("Audio started");
}

function stopSynth() {
  if (!isPlaying) return;
  carrierOsc.stop();
  modOsc.stop();
  isPlaying = false;
  updateStatus("Audio stopped");
}

// --- Frequency update with MIDI send ---
function updateFrequency(newFreq) {
  if (!isPlaying) setupSynth();

  currentFrequency = newFreq;
  carrierOsc.frequency.setValueAtTime(currentFrequency, audioCtx.currentTime);

  sendMIDINote(currentFrequency);
  updateStatus(`Frequency: ${currentFrequency.toFixed(2)} Hz`);
}

// --- UI event listeners ---

baseFreqSlider.addEventListener("input", () => {
  const freq = parseFloat(baseFreqSlider.value);
  updateFrequency(freq);
  document.getElementById("baseFreqValue").textContent = `${freq} Hz`;
});

modRangeSlider.addEventListener("input", () => {
  const modRange = parseFloat(modRangeSlider.value);
  modGain.gain.setValueAtTime(modRange, audioCtx.currentTime);
  document.getElementById("modRangeValue").textContent = `${modRange} Hz`;
});

modRateSlider.addEventListener("input", () => {
  const modRate = parseFloat(modRateSlider.value);
  modOsc.frequency.setValueAtTime(modRate, audioCtx.currentTime);
  document.getElementById("modRateValue").textContent = `${modRate} Hz`;
});

waveformSelect.addEventListener("change", () => {
  carrierOsc.type = waveformSelect.value;
});

// Button to test audio start/stop
document.getElementById("testBtn").addEventListener("click", () => {
  if (isPlaying) {
    stopSynth();
  } else {
    setupSynth();
  }
});

// Initialize UI values on load
window.addEventListener("load", () => {
  document.getElementById("baseFreqValue").textContent = `${baseFreqSlider.value} Hz`;
  document.getElementById("modRangeValue").textContent = `${modRangeSlider.value} Hz`;
  document.getElementById("modRateValue").textContent = `${modRateSlider.value} Hz`;
  updateStatus("Ready");
});

// Export updateFrequency for external use (e.g., GPS updates)
window.updateFrequency = updateFrequency;

// GPS Lock logic
let lockedPosition = null;

const lockBtn = document.getElementById("lockBtn");
const distanceDisplay = document.getElementById("distance-display");
const compassSection = document.getElementById("compass-section");
const compassArrow = document.getElementById("direction-arrow");

lockBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation not supported by your browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      lockedPosition = position.coords;
      updateStatus("GPS Locked");
      compassSection.classList.remove("hidden");
      updateDistanceAndDirection();
    },
    (err) => {
      updateStatus("Error locking GPS: " + err.message, true);
    }
  );
});

// Function to update distance and direction from locked position
function updateDistanceAndDirection() {
  if (!lockedPosition) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const current = pos.coords;

      // Calculate distance in meters using Haversine formula
      const R = 6371000; // Earth radius in meters
      const lat1 = lockedPosition.latitude * (Math.PI / 180);
      const lat2 = current.latitude * (Math.PI / 180);
      const deltaLat = (current.latitude - lockedPosition.latitude) * (Math.PI / 180);
      const deltaLon = (current.longitude - lockedPosition.longitude) * (Math.PI / 180);

      const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(deltaLon/2) * Math.sin(deltaLon/2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      distanceDisplay.textContent = `${distance.toFixed(1)} m`;

      // Calculate bearing (direction)
      const y = Math.sin(deltaLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) -
                Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

      let bearing = Math.atan2(y, x);
      bearing = bearing * (180 / Math.PI); // Convert to degrees
      bearing = (bearing + 360) % 360; // Normalize

      // Rotate compass arrow
      compassArrow.setAttribute("transform", `rotate(${bearing}, 100, 100)`);

      // Repeat update every second while locked
      setTimeout(updateDistanceAndDirection, 1000);
    },
    (err) => {
      updateStatus("Error getting current position: " + err.message, true);
    }
  );
}
