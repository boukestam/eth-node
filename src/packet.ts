import { keccak256, keccak256Array } from "./util";
import secp256k1 from 'secp256k1';
import { Endpoint } from "./endpoint";
import ip from 'ip';

export interface Packet {
  packetType: number;
  packetData: Buffer;
  hash: Buffer;
  publicKey: Buffer;
}

export function decodePacket (data: Buffer): Packet {
  const hash = keccak256(data.slice(32));
  const givenHash = data.slice(0, 32);
  if (!hash.equals(givenHash)) throw new Error('Invalid hash');

  const typeAndData = data.slice(97);
  const packetType = typeAndData[0];
  const packetData = typeAndData.slice(1);

  const sighash = keccak256(typeAndData);
  const signature = data.slice(32, 96);
  const recoverId = data[96];
  const publicKey = secp256k1.ecdsaRecover(signature, recoverId, sighash, false);

  return {packetType, packetData, hash, publicKey: Buffer.from(publicKey)};
}

export function encodePacket (privateKey: Buffer, type: number, packetData: Buffer): Buffer {
  const packetType = Buffer.from([type]);

  const sig = secp256k1.ecdsaSign(
    keccak256(Buffer.concat([packetType, packetData])), 
    privateKey
  );
  const signature = Buffer.concat([ sig.signature, Buffer.from([sig.recid])]);

  const hash = keccak256Array([signature, packetType, packetData]);
  const packetHeader = Buffer.concat([hash, signature, packetType]);

  return Buffer.concat([packetHeader, packetData]);
}

export function encodeEndpoint (endpoint: Endpoint): Buffer[] {
  return [
    ip.toBuffer(endpoint.ip),
    endpoint.udpPort ? Buffer.from([endpoint.udpPort]) : Buffer.from([]),
    endpoint.tcpPort ? Buffer.from([endpoint.tcpPort]) : Buffer.from([])
  ];
}

export function encodeExpiration () {
  const expiration = Buffer.allocUnsafe(4);
  expiration.writeUInt32BE(Date.now() / 1000 + 60); // Timeout after 60 seconds
  return expiration;
}