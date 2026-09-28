/**
 * Packs the Qualifier 1 robot export and seals it for the password page.
 *
 *   npm i --no-save @gltf-transform/core @gltf-transform/functions \
 *     @gltf-transform/extensions meshoptimizer
 *   SEAL_PASSWORD=... node scripts/seal-q1-cad.mjs "path/to/export.glb"
 *
 * Writes public/biobuzz/q1.bin (the sealed model) and src/data/q1-seal.json
 * (salt, iteration count and a sealed check token, none of them secret).
 * The password is read from the environment and written nowhere.
 *
 * Pack: every CAD face material collapses into one, since the viewer paints
 * parts by name and Onshape's per-face materials only split draw calls. Then
 * dedup, weld, join primitives inside each part (keepNamed, so every part
 * stays its own node and the assembly tree survives), simplify to a 0.0005
 * relative error, quantize and meshopt-compress. 137 MB went to 3.7 MB.
 *
 * Seal: PBKDF2-SHA256 (600k rounds) derives an AES-256-GCM key; the file is
 * iv(12) + ciphertext. The page derives the same key in the browser, opens
 * the check token first, and only then downloads the model. A static host
 * cannot check a password, so encryption is the only lock that holds: the
 * bin is public, and useless without the password.
 */
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as crypto } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, join, simplify, quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const src = process.argv[2];
const password = process.env.SEAL_PASSWORD;
if (!src || !password) {
  console.error('usage: SEAL_PASSWORD=... node scripts/seal-q1-cad.mjs <export.glb>');
  process.exit(1);
}

const ITERATIONS = 600_000;
const root = path.resolve(import.meta.dirname, '..');
const binOut = path.join(root, 'public/biobuzz/q1.bin');
const sealOut = path.join(root, 'src/data/q1-seal.json');

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(src);
const gltf = doc.getRoot();
const part = doc.createMaterial('part').setBaseColorFactor([0.7, 0.7, 0.7, 1]).setRoughnessFactor(0.6);
for (const mesh of gltf.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    prim.setMaterial(part);
    prim.setAttribute('TEXCOORD_0', null);
  }
}
for (const m of gltf.listMaterials()) if (m !== part) m.dispose();

await doc.transform(
  dedup(),
  weld({}),
  join({ keepNamed: true }),
  weld({}),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: 0.0005 }),
  prune(),
  quantize({ quantizePosition: 16, quantizeNormal: 10 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
const glb = await io.writeBinary(doc);

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  base,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
);
const seal = async (bytes) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
};

const bin = await seal(glb);
const check = await seal(enc.encode('onyx'));
const b64 = (u8) => Buffer.from(u8).toString('base64');

fs.mkdirSync(path.dirname(binOut), { recursive: true });
fs.mkdirSync(path.dirname(sealOut), { recursive: true });
fs.writeFileSync(binOut, bin);
fs.writeFileSync(
  sealOut,
  JSON.stringify({ salt: b64(salt), iterations: ITERATIONS, check: b64(check), bytes: bin.length }, null, 2) + '\n',
);
console.log(`source ${(fs.statSync(src).size / 1e6).toFixed(1)} MB -> glb ${(glb.length / 1e6).toFixed(2)} MB -> sealed ${(bin.length / 1e6).toFixed(2)} MB`);
