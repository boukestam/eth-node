import { Endpoint } from "./endpoint";
import udp from 'dgram';
import secp256k1 from 'secp256k1';
import { keccak256 } from "./util";
import { rlpEncode, } from "./rlp";
import ip from 'ip';

function encodePacket (privateKey: Buffer, type: number, packetData: Buffer): Buffer {
  const packetType = Buffer.from([type]);

  const sig = secp256k1.ecdsaSign(
    keccak256(Buffer.concat([packetType, packetData])), 
    privateKey
  );
  const signature = Buffer.concat([ sig.signature, Buffer.from([sig.recid])]);

  const hash = keccak256(signature, packetType, packetData);
  const packetHeader = Buffer.concat([hash, signature, packetType]);

  return Buffer.concat([packetHeader, packetData]);
}

function encodeEndpoint (endpoint: Endpoint): Buffer[] {
  return [
    ip.toBuffer(endpoint.ip),
    Buffer.from([endpoint.udpPort]),
    Buffer.from([endpoint.tcpPort])
  ];
}

function decodePacket (data: Buffer) {
  const hash = keccak256(data.slice(32));
  const givenHash = data.slice(0, 32);
  if (!hash.equals(givenHash)) throw new Error('Invalid hash');

  const typeAndData = data.slice(97);
  const packetType = typeAndData[0];
  const packetData = typeAndData.slice(1);

  const sighash = keccak256(typeAndData);
  const signature = data.slice(32, 96);
  const recoverId = data[96];
  const publicKey = secp256k1.ecdsaRecover(signature, recoverId, sighash);

  return {packetType, packetData, publicKey};
}

export function discover (initiatorId: Buffer, initiatorPrivate: Buffer, initiatorEndpoint: Endpoint, receiverEndpoint: Endpoint) {
  

  const expiration = Buffer.allocUnsafe(4);
  expiration.writeUInt32BE(Date.now() / 1000 + 60); // Timeout after 60 seconds

  const pingData = rlpEncode([
    Buffer.from([0x04]),
    encodeEndpoint(initiatorEndpoint),
    encodeEndpoint(receiverEndpoint), 
    expiration
  ]);

  const ping = encodePacket(initiatorPrivate, 0x01, pingData);
  
  //const find = encodePacket(initiatorPrivate, 0x03, [initiatorId]);

  const client = udp.createSocket('udp4');

  client.on('message', function(msg, info) {
    console.log('Package type', decodePacket(msg).packetType);
  });

  client.send(ping, receiverEndpoint.udpPort, receiverEndpoint.ip, function(error) {
    if(error) client.close();
    else console.log('Ping sent');
  });
}