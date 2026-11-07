const fs = require('fs');

function writeWav(filename, samples, sampleRate = 44100) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.floor(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filename, buffer);
}

function generatePurrBuffer(sampleRate = 44100) {
  const duration = 2.2;
  const totalSamples = Math.floor(sampleRate * duration);
  const data = new Float32Array(totalSamples);

  let b0 = 0, b1 = 0, b2 = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    // Двухфазный цикл кошачьего дыхания (вдох 0..0.95с, микро-пауза 0.95..1.05с, выдох 1.05..2.2с)
    let breathEnv = 0;
    let pulseRate = 24.5;
    let formantFreq = 82;

    if (t < 0.95) {
      // Фаза 1: Вдох (чуть легче, чуть быстрее трепет гортани ~26 Гц, форманта 94 Гц)
      const u = t / 0.95;
      breathEnv = Math.sin(u * Math.PI) * 0.75;
      pulseRate = 25.8;
      formantFreq = 94;
    } else if (t < 1.05) {
      // Мягкий переход дыхания
      breathEnv = 0.08;
      pulseRate = 24.0;
      formantFreq = 86;
    } else {
      // Фаза 2: Выдох (глубокий, теплый, расслабленный рокот грудной клетки ~23.5 Гц, форманта 76 Гц)
      const u = (t - 1.05) / 1.15;
      breathEnv = Math.sin(u * Math.PI) * 1.0;
      pulseRate = 23.4;
      formantFreq = 76;
    }

    // Период и фаза одиночного щелчка/импульса голосовых складок
    const pulsePeriod = 1 / pulseRate;
    const pulsePhase = (t % pulsePeriod) / pulsePeriod; // 0..1

    // Огибающая единичного импульса: быстрое нарастание (~3мс), экспоненциальный спад (~14мс), затем тишина
    let glottalEnv = 0;
    if (pulsePhase < 0.42) {
      const pNorm = pulsePhase / 0.42;
      glottalEnv = Math.sin(pNorm * Math.PI) * Math.exp(-pNorm * 2.2);
    }

    // Акустический резонанс грудной клетки: затухающие колебания мягких тканей
    const pulseT = pulsePhase * pulsePeriod;
    const chestResonance = Math.sin(2 * Math.PI * formantFreq * pulseT) * Math.exp(-pulseT * 88);
    const throatOvertone = Math.sin(2 * Math.PI * (formantFreq * 2.05) * pulseT) * 0.28 * Math.exp(-pulseT * 125);

    // Мягкий шум трения воздуха в гортани (низкочастотный броуновский шум)
    const white = Math.random() * 2 - 1;
    b0 = 0.93 * b0 + white * 0.07;
    b1 = 0.91 * b1 + b0 * 0.09;
    const filteredNoise = b1 * 1.6;

    // Суммирование импульса складок с дыхательным шумом
    const pulseAudio = (chestResonance + throatOvertone + filteredNoise * 0.48) * glottalEnv;

    // Очень тихое непрерывное фоновое тепло дыхания
    b2 = 0.97 * b2 + white * 0.03;
    const ambientRumble = b2 * 0.08;

    data[i] = (pulseAudio * 1.5 + ambientRumble) * breathEnv;
  }

  // Мягкое сглаживание начала и конца буфера от щелчков
  const fade = Math.floor(sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    data[i] *= (i / fade);
    data[totalSamples - 1 - i] *= (i / fade);
  }

  // Нормализация к оптимальной громкости без клиппинга (пик ~ 0.65)
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
  }
  if (peak > 0) {
    const scale = 0.65 / peak;
    for (let i = 0; i < totalSamples; i++) data[i] *= scale;
  }

  return data;
}

const samples = generatePurrBuffer(44100);
writeWav('scratch/purr_v2.wav', samples, 44100);
let sumSq = 0;
for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
const rms = Math.sqrt(sumSq / samples.length);
console.log('Generated purr_v2.wav:', { length: samples.length, rms, peak: 0.65 });
