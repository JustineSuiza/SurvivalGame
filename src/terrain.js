export function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function vnoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, octaves = 5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export const WATER_LEVEL = 0;

export function smoothstep(a, b, t) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

export function heightAt(x, z) {
  const base = fbm(x * 0.0016, z * 0.0016);
  const ridgeRaw = fbm(x * 0.0007 + 100, z * 0.0007 + 100);
  const ridge = 1 - Math.abs(ridgeRaw * 2 - 1);
  const mountain = Math.pow(Math.max(0, ridge - 0.55) * 2.22, 2.4) * 95;
  const detail = fbm(x * 0.009, z * 0.009, 3) * 5 - 2.5;
  const d = Math.sqrt(x * x + z * z) / 1000;
  const edge = smoothstep(0.8, 1, d) * 26;
  return (base - 0.45) * 72 + 2 + mountain + detail - edge;
}

export function slopeAt(x, z, e = 2.5) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.sqrt(hx * hx + hz * hz) / (2 * e);
}
