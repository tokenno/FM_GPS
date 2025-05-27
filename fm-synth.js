// fm-synth.js

let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let baseFreqInput = document.getElementById('baseFreq');
let modRangeInput = document.getElementById('modRange');
let modRateInput = document.getElementById('modRate');
let waveformSelect = document.getElementById('waveform');

let oscillator, modulator, modGain;
let isPlaying = false;

let midiAccess = null;
let midiOutput = null;
let lockedPosition = null;
const statusDiv = document.getElementById('status');
const lockBtn = document.getElementById('lockBtn');

lockBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    statusDiv.textContent = "Geolocation not supported by your browser.";
    statusDiv.className = "status error";
    return;
  }
  statusDiv.textContent = "Locking GPS position...";
  statusDiv.className = "status";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lockedPosition = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      statusDiv.textContent = `GPS Locked: Lat ${lockedPosition.latitude.toFixed(5)}, Lon ${lockedPosition.longitude.toFixed(5)} (±${lockedPosition.accuracy}m)`;
      statusDiv.className = "status success";
      console.log("GPS locked:", lockedPosition);
    },
    (err) => {
      statusDiv.textContent = `Error locking GPS: ${err.message}`;
      statusDiv.className = "status error";
      console.error("GPS error:", err);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
});


function setupMIDI() {
  if (!navigator.requestMIDIAccess) {
    console.warn("Web MIDI API not supported in this browser.");
    return;
  }
  navigator.requestMIDIAccess()
    .then((access) => {
      midiAccess = access;
      const outputs = Array.from(midiAccess.outputs.values());
      console.log("MIDI Outputs:", outputs.map(o => o.name));

      // Try to find a virtual MIDI port automatically; adjust this string as needed
      midiOutput = outputs.find(o => o.name.includes("IAC") || o.name.includes("loopMIDI"));
      if (!midiOutput && outputs.length > 0) {
        // fallback to first output if no virtual port found
        midiOutput = outputs[0];
      }
      if (midiOutput) {
        console.log("Using MIDI Output:", midiOutput.name);
      } else {
        console.warn("No MIDI output found.");
      }
    })
    .catch((err) => {
      console.error("Failed to get MIDI access", err);
    });
}

function sendMIDINoteOn(note, velocity = 127, channel = 0) {
  if (!midiOutput) return;
  // 0x90 = note on for channel 1, so add channel offset
  midiOutput.send([0x90 + channel, note, velocity]);
}

function sendMIDINoteOff(note, velocity = 0, channel = 0) {
  if (!midiOutput) return;
  midiOutput.send([0x80 + channel, note, velocity]);
}

function sendMIDIControlChange(controller, value, channel = 0) {
  if (!midiOutput) return;
  midiOutput.send([0xB0 + channel, controller, value]);
}

function frequencyToMIDINote(freq) {
  // MIDI note number = 69 + 12*log2(freq/440)
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

function startSynth() {
  oscillator = audioCtx.createOscillator();
  modulator = audioCtx.createOscillator();
  modGain = audioCtx.createGain();

  oscillator.type = waveformSelect.value;
  oscillator.frequency.value = parseFloat(baseFreqInput.value);

  modulator.frequency.value = parseFloat(modRateInput.value);
  modGain.gain.value = parseFloat(modRangeInput.value);

  modulator.connect(modGain);
  modGain.connect(oscillator.frequency);
  oscillator.connect(audioCtx.destination);

  oscillator.start();
  modulator.start();

  isPlaying = true;

  // Send MIDI Note On based on current frequency
  let freq = oscillator.frequency.value;
  let midiNote = frequencyToMIDINote(freq);
  sendMIDINoteOn(midiNote);

  console.log(`Synth started at freq: ${freq}Hz, MIDI note: ${midiNote}`);
}

function stopSynth() {
  if (!isPlaying) return;

  let freq = oscillator.frequency.value;
  let midiNote = frequencyToMIDINote(freq);
  sendMIDINoteOff(midiNote);

  oscillator.stop();
  modulator.stop();

  oscillator.disconnect();
  modulator.disconnect();
  modGain.disconnect();

  isPlaying = false;

  console.log(`Synth stopped, MIDI note off sent for note: ${midiNote}`);
}

function updateSynth() {
  if (!isPlaying) return;

  oscillator.type = waveformSelect.value;
  oscillator.frequency.value = parseFloat(baseFreqInput.value);
  modulator.frequency.value = parseFloat(modRateInput.value);
  modGain.gain.value = parseFloat(modRangeInput.value);

  // Send updated MIDI note if frequency changed
  let freq = oscillator.frequency.value;
  let midiNote = frequencyToMIDINote(freq);

  // For simplicity, send Note On for new note, Note Off for old note could be managed if tracking notes
  // Here we just send a CC message with frequency info for continuous control
  sendMIDIControlChange(74, Math.min(127, Math.floor(freq / 10))); // CC74 = Brightness, as an example

  console.log(`Synth updated freq: ${freq}Hz, MIDI note approx: ${midiNote}`);
}

// UI event listeners
document.getElementById('testBtn').addEventListener('click', () => {
  if (isPlaying) {
    stopSynth();
  } else {
    startSynth();
  }
});

baseFreqInput.addEventListener('input', () => {
  document.getElementById('baseFreqValue').textContent = baseFreqInput.value + " Hz";
  updateSynth();
});

modRangeInput.addEventListener('input', () => {
  document.getElementById('modRangeValue').textContent = modRangeInput.value + " Hz";
  updateSynth();
});

modRateInput.addEventListener('input', () => {
  document.getElementById('modRateValue').textContent = modRateInput.value + " Hz";
  updateSynth();
});

waveformSelect.addEventListener('change', () => {
  updateSynth();
});

// Initialize MIDI on load
window.addEventListener('load', () => {
  setupMIDI();
});
