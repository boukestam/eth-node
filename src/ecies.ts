import crypto from 'crypto';
import secp256k1 from 'secp256k1';
import { generatePrivateKey } from './util';

// https://github.com/vaporyjs/vaporyjs-devp2p/blob/master/src/rlpx/ecies.js

export function concatKDF (keyMaterial: Uint8Array, keyLength: number) {
  const SHA256BlockSize = 64;
  const reps = ((keyLength + 7) * 8) / (SHA256BlockSize * 8);

  const buffers = [];
  for (let counter = 0, tmp = Buffer.allocUnsafe(4); counter <= reps;) {
    counter += 1;
    tmp.writeUInt32BE(counter);
    buffers.push(crypto.createHash('sha256').update(tmp).update(keyMaterial).digest());
  }

  return Buffer.concat(buffers).slice(0, keyLength);
}

export function eciesEncrypt (remotePublicKey: Buffer, data: Buffer, sharedMacData: Buffer | null = null) {
  const privateKey = generatePrivateKey();
  const x = secp256k1.ecdh(remotePublicKey, privateKey);
  const key = concatKDF(x, 32);
  const ekey = key.slice(0, 16); // encryption key
  const mkey = crypto.createHash('sha256').update(key.slice(16, 32)).digest(); // MAC key

  // encrypt
  const IV = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-ctr', ekey, IV);
  const encryptedData = cipher.update(data);
  const dataIV = Buffer.concat([ IV, encryptedData ]);

  // create tag
  if (!sharedMacData) sharedMacData = Buffer.from([]);

  const tag = crypto.createHmac('sha256', mkey).update(Buffer.concat([dataIV, sharedMacData])).digest();

  const publicKey = secp256k1.publicKeyCreate(privateKey, false);
  return Buffer.concat([ publicKey, dataIV, tag ]);
}

export function eciesDecrypt (privateKey: Buffer, data: Buffer, sharedMacData: Buffer | null = null) {
  if (!data.slice(0, 1).equals(Buffer.from('04', 'hex'))) throw new Error('wrong ecies header');

  const publicKey = data.slice(0, 65);
  const dataIV = data.slice(65, -32);
  const tag = data.slice(-32);

  // derive keys
  const x = secp256k1.ecdh(publicKey, privateKey);
  const key = concatKDF(x, 32);
  const ekey = key.slice(0, 16); // encryption key
  const mkey = crypto.createHash('sha256').update(key.slice(16, 32)).digest(); // MAC key

  // check the tag
  if (!sharedMacData) sharedMacData = Buffer.from([]);

  const _tag = crypto.createHmac('sha256', mkey).update(Buffer.concat([dataIV, sharedMacData])).digest();
  if (!_tag.equals(tag)) throw new Error('should have valid tag');

  // decrypt data
  const IV = dataIV.slice(0, 16);
  const encryptedData = dataIV.slice(16);
  const decipher = crypto.createDecipheriv('aes-128-ctr', ekey, IV);
  return decipher.update(encryptedData);
}