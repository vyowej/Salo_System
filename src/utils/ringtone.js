/**
 * Web Audio API ringtone + Browser Notification + Document Title flash helpers
 * for incoming rider call alerts. No external audio files required.
 */

const CALL_SOUND_STORAGE_KEY = 'salo-customer-call-sounds';
let audioCtx = null;

export function isCallSoundEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CALL_SOUND_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setCallSoundEnabled(enabled) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CALL_SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
  if (enabled) {
    unlockCallAudio();
  }
}

export function unlockCallAudio() {
  if (typeof window === 'undefined') return false;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;
  try {
    if (!audioCtx) {
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return true;
  } catch {
    return false;
  }
}

export function playRingToneBurst() {
  if (!isCallSoundEnabled()) return;
  if (!audioCtx) {
    unlockCallAudio();
  }
  if (!audioCtx || audioCtx.state !== 'running') return;
  try {
    const now = audioCtx.currentTime;
    [0, 0.22].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(offset === 0 ? 660 : 880, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } catch {
    // ignore audio playback errors
  }
}

export async function requestBrowserNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'default';
  }
}

export function showIncomingCallBrowserNotification(orderReference) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('SALO — Incoming Call', {
      body: `Your rider is calling you for ${orderReference || 'your order'}. Open the order page to respond.`,
      tag: `salo-call-${orderReference || 'order'}`,
    });
  } catch {
    // ignore notification errors
  }
}
