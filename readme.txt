GPS FM Synthesizer
Overview
The GPS FM Synthesizer is a web-based audio application that generates dynamic FM synthesis sounds modulated by real-world inputs: GPS location, device orientation, accelerometer, and camera brightness. Built with the Web Audio API, it creates an interactive soundscape where physical movement and environmental factors shape the audio output, ideal for experimental music, sound art, or location-based performances.
Features

GPS Tracking: Modulates the FM synthesis modulation depth based on the distance from a locked GPS position. Moving farther or closer adjusts the sound's intensity.
Device Orientation: Adjusts the modulator frequency (±5 Hz) based on the device's forward/backward tilt (beta angle), creating pitch variations.
Accelerometer: Controls modulation depth (0–500 Hz) based on device shake intensity, adding dynamic effects through physical movement.
Camera Brightness: Modulates modulation depth (0–500 Hz) based on ambient light captured by the device's camera, linking visual environment to sound.
Manual Controls:
Adjust base frequency (100–1000 Hz), modulation range (0–500 Hz), and modulator rate (0.1–50 Hz) via sliders.
Select carrier waveform (sine, square, triangle, sawtooth).
Invert GPS distance mapping to reverse modulation behavior.


Smooth Audio: Implements linear ramping for parameter changes to eliminate audio glitches, ensuring a seamless sound experience.

Requirements

Browser: Modern browser (Chrome, Firefox, Safari) with support for Web Audio API, Geolocation API, DeviceOrientation API, DeviceMotion API, and getUserMedia.
Device: Smartphone or tablet with GPS, gyroscope, accelerometer, and camera (environment-facing preferred).
Connection: Secure context (HTTPS or localhost) for accessing location, motion, and camera APIs.
Permissions: Grant access to location, motion sensors, and camera when prompted.

Setup

Clone or Download:

Download the project files: index.html and fm-synth.js.
Place both in a directory (e.g., GPS-FMSynth/).


Run a Local Server:

Navigate to the directory in a terminal.
Start a server:python -m http.server 8000


Open http://localhost:8000 in your browser.


Verify Files:

Ensure index.html references fm-synth.js correctly (case-sensitive).
Check that both files are in the same directory.



Usage

Launch the App:

Open http://localhost:8000 on a mobile device for full functionality (desktop browsers may lack sensors).
Grant permissions for location, motion, and camera when prompted.


Controls:

Test Audio: Click to initialize and test the synthesizer with default settings.
Lock GPS: Sets a reference GPS position and starts tracking distance (use outdoors for best results).
Invert Frequency: Toggles whether greater distance increases or decreases modulation depth.
Enable Orientation: Activates device tilt control for modulator frequency (forward/backward tilt).
Toggle Accelerometer: Enables shake-based control for modulation depth.
Toggle Camera: Activates camera-based control for modulation depth based on brightness.
Sliders:
Base Frequency: Sets the carrier frequency (100–1000 Hz).
Modulation Range: Sets the maximum modulation depth (0–500 Hz).
Modulator Rate: Sets the base modulator frequency (0.1–50 Hz).


Waveform: Selects the carrier waveform (sine, square, triangle, sawtooth).


Interact:

Move to change GPS distance, tilt the device, shake it, or point the camera at different light levels to modulate the sound.
Monitor feedback in the UI (e.g., “300.0 Hz (Shake: 5.2g)” or “250.0 Hz (Brightness: 128.5)”).
Adjust sliders for manual control.


Status:

The #status div displays messages (e.g., “Audio initialized,” “Camera disabled”).
Check the browser console (F12) for detailed logs.



Technical Details

Technology:
Web Audio API: Generates FM synthesis with a carrier oscillator modulated by a sine wave oscillator.
Geolocation API: Tracks position for distance-based modulation.
DeviceOrientation API: Reads beta angle (tilt) for modulator frequency.
DeviceMotion API: Measures acceleration for shake-based modulation.
getUserMedia API: Accesses camera to compute brightness.
HTML/CSS/JS: Responsive UI with sliders, buttons, and a hidden video element for camera input.


Audio Optimizations:
Linear ramping (20ms) for frequency and gain changes to prevent clicks.
Audio context resumed on all user interactions to avoid suspension.
Throttled camera processing (~10 FPS) to reduce CPU load.
Proper oscillator cleanup in initAudio to prevent glitches.


Compatibility:
Uses string concatenation (e.g., "Status: " + msg) for ES5 compatibility, avoiding template literals.
Tested on modern mobile browsers (Chrome, Safari).


Limitations:
Accelerometer and camera both affect freqRange, with the latest input taking precedence.
GPS accuracy depends on device and environment (open areas improve performance).
High CPU usage on low-end devices may cause minor delays.



Troubleshooting

No Sound:
Ensure audio context is active (click “Test Audio”).
Check browser audio permissions and device volume.
Verify fm-synth.js is loaded (console errors).


Audio Hiccups:
Test on a powerful device (e.g., recent smartphone).
Use Chrome or Safari for better audio scheduling.
Report specific triggers (e.g., camera toggle, rapid shaking).


Permissions:
Grant location, motion, and camera access in browser settings.
Use HTTPS or localhost for secure context.


Camera:
Ensure the environment-facing camera is available.
Check console for errors (e.g., “Camera error: NotAllowedError”).


Editor Errors:
Verify your editor supports JavaScript (ES5).
Share linter settings (e.g., .eslintrc) if syntax issues arise.



Future Enhancements

Parameter Locking: Prevent accelerometer/camera from overwriting manual freqRange.
Audio Effects: Add reverb or delay to enhance the sound.
Visualization: Reintroduce waveform or sensor data display.
Multi-user Mode: Share sensor data via WebRTC for collaborative soundscapes.

License
Creative Commons (2025). Feel free to modify and distribute.
Contact tokenomusic@gmail.com / tokeno.net
For issues or suggestions.

Last updated: May 27, 2025
