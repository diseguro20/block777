import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const sampleRate = 44100;
const duration = 20;
const samples = new Float32Array(sampleRate * duration);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const addKick = (time, gain = 0.75) => {
  const start = Math.floor(time * sampleRate);
  const length = Math.floor(0.22 * sampleRate);
  let phase = 0;
  for (let i = 0; i < length && start + i < samples.length; i++) {
    const t = i / sampleRate;
    const frequency = 145 * Math.exp(-t * 18) + 42;
    phase += (Math.PI * 2 * frequency) / sampleRate;
    samples[start + i] += Math.sin(phase) * Math.exp(-t * 18) * gain;
  }
};

const addHat = (time, gain = 0.13) => {
  const start = Math.floor(time * sampleRate);
  const length = Math.floor(0.055 * sampleRate);
  let previous = 0;
  for (let i = 0; i < length && start + i < samples.length; i++) {
    const noise = Math.random() * 2 - 1;
    const high = noise - previous * 0.82;
    previous = noise;
    samples[start + i] += high * Math.exp(-(i / sampleRate) * 52) * gain;
  }
};

const addTone = (time, frequency, length, gain, bright = false) => {
  const start = Math.floor(time * sampleRate);
  const count = Math.floor(length * sampleRate);
  for (let i = 0; i < count && start + i < samples.length; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.012);
    const release = Math.min(1, (length - t) / 0.12);
    const fundamental = Math.sin(Math.PI * 2 * frequency * t);
    const harmonic = Math.sin(Math.PI * 4 * frequency * t) * (bright ? 0.32 : 0.12);
    samples[start + i] += (fundamental + harmonic) * attack * Math.max(0, release) * gain;
  }
};

const bass = [65.41, 77.78, 98.0, 87.31];
const arp = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 392.0];

for (let beat = 0; beat < duration * 2; beat++) {
  const time = beat * 0.5;
  addKick(time, beat % 4 === 0 ? 0.78 : 0.55);
  addHat(time + 0.25, 0.12);
  addHat(time + 0.375, 0.075);
  addTone(time, bass[Math.floor(beat / 4) % bass.length], 0.43, 0.12);
}

for (let step = 0; step < duration * 4; step++) {
  const time = step * 0.25;
  addTone(time, arp[step % arp.length], 0.18, step % 4 === 0 ? 0.1 : 0.065, true);
}

let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
const scale = 0.86 / Math.max(peak, 0.001);
const pcm = Buffer.alloc(samples.length * 2);
for (let i = 0; i < samples.length; i++) {
  const value = Math.max(-1, Math.min(1, samples[i] * scale));
  pcm.writeInt16LE(Math.round(value * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

fs.mkdirSync(path.join(root, "public"), {recursive: true});
fs.writeFileSync(path.join(root, "public", "blockerino-beat.wav"), Buffer.concat([header, pcm]));
