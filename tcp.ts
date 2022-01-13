import crypto from 'crypto';
import secp256k1 from 'secp256k1';
import { rlpEncode } from './rlp';
import { generatePrivateKey, int16ToBuffer, printBytes } from './util';
import {xor} from 'bitwise-buffer';
import { eciesEncrypt } from './ecies';

export function createAuth (initiatorPrivate: Buffer, initiatorPublic: Buffer, receiverPublic: Buffer) {
  printBytes('Initiator public', initiatorPublic);

  printBytes('Receiver public', receiverPublic);

  const initiatorNonce = crypto.randomBytes(32);
  const ecdheRandomKey = generatePrivateKey();

  printBytes('ECDHE random', ecdheRandomKey);
  
  const sharedSecret = secp256k1.ecdh(receiverPublic, initiatorPrivate);
  printBytes('Shared secret', sharedSecret);

  const sig = secp256k1.ecdsaSign(xor(sharedSecret, initiatorNonce), ecdheRandomKey);
  const signature = Buffer.concat([sig.signature, Buffer.from([sig.recid])]);
  printBytes('Signature', signature);

  const data = [
    signature, 
    Buffer.from(initiatorPublic).slice(1), 
    initiatorNonce, 
    Buffer.from([0x04])
  ];
  const dataRLP = rlpEncode(data);

  console.log('Data lengths', data.map(buffer => buffer.length));

  const padding = crypto.randomBytes(100 + Math.floor(Math.random() * 150));
  const authBody = Buffer.concat([dataRLP, padding]);

  printBytes('Auth body', authBody);

  const authSize = int16ToBuffer(authBody.length + 113);

  const encryptedAuthBody = eciesEncrypt(receiverPublic, authBody, authSize);

  printBytes('Encrypted auth body', encryptedAuthBody);

  return Buffer.concat([authSize, encryptedAuthBody]);
}