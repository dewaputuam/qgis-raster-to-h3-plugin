import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Ground-truth kecamatan -> kabupaten/kota mapping for Bali, generated from
// the official Kode Kemendagri (kode wilayah administrasi) reference. Every
// kecamatan name in Bali maps to exactly one kabupaten/kota (no collisions),
// so this is a reliable way to double-check the kabupaten label the app
// assigns to a SIK event without depending on any guess about the API's
// internal kabkota_id numbering.
const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/wilayah-bali.json');
const wilayah = JSON.parse(readFileSync(dataPath, 'utf-8'));

function normalize(name) {
  return (name || '').trim().toLowerCase();
}

const normalizedLookup = new Map(
  Object.entries(wilayah.kecamatanToKabupaten).map(([kec, kab]) => [normalize(kec), kab])
);

export function kabupatenFromKecamatan(kecamatan) {
  return normalizedLookup.get(normalize(kecamatan)) || null;
}
