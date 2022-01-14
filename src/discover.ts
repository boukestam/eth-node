import { Endpoint } from "./endpoint";
import udp from 'dgram';
import secp256k1 from 'secp256k1';
import { keccak256 } from "./util";
import { rlpDecode, rlpEncode, RLPItem, } from "./rlp";
import ip from 'ip';
import {xor} from 'bitwise-buffer';

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
    endpoint.udpPort ? Buffer.from([endpoint.udpPort]) : Buffer.from([]),
    endpoint.tcpPort ? Buffer.from([endpoint.tcpPort]) : Buffer.from([])
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

  return {packetType, packetData, hash, publicKey};
}

function encodeExpiration () {
  const expiration = Buffer.allocUnsafe(4);
  expiration.writeUInt32BE(Date.now() / 1000 + 60); // Timeout after 60 seconds
  return expiration;
}

function bufferToNumber (buffer: Buffer) {
  if (buffer.length === 0) return 0;
  if (buffer.length === 1) return buffer.readUInt8();
  if (buffer.length === 2) return buffer.readUInt16BE();
  if (buffer.length === 2) return buffer.readUInt32BE();
  throw new Error('Buffer number too long');
}

function printEndpoint (endpoint: Buffer[]) {
  console.log(`IP ${endpoint[0].join('.')} UDP ${bufferToNumber(endpoint[1])} TCP ${bufferToNumber(endpoint[2])}`);
}

export async function discover (initiatorId: Buffer, initiatorPrivate: Buffer, initiatorEndpoint: Endpoint, receiverEndpoint: Endpoint) {
  const client = udp.createSocket('udp4');

  function send (msg: Buffer, log?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.send(msg, receiverEndpoint.udpPort, receiverEndpoint.ip, function(error) {
        if(error) {
          client.close();
          reject();
        } else {
          //if (log) console.log(log);
          resolve();
        }
      });
    });
  }

  async function receive (msg, info) {
    const packet = decodePacket(msg);
    const data = rlpDecode(packet.packetData);

    if (packet.packetType === 0x01) {
      // Ping
      await send(
        encodePacket(initiatorPrivate, 0x02, rlpEncode([
          encodeEndpoint(receiverEndpoint),
          packet.hash,
          encodeExpiration()
        ]))
      );
      
      await send(
        encodePacket(initiatorPrivate, 0x03, rlpEncode([
          initiatorId,
          encodeExpiration()
        ]))
      );
    } else if (packet.packetType === 0x02) {
      // Pong
      const [to, pingHash,  expiration] = data as [Buffer[], Buffer, Buffer];

      
    } else if (packet.packetType === 0x04) {
      // Neighbors

      const [nodes, expiration] = data as [Buffer[][], Buffer];

      for (const endpoint of nodes) {
        console.log(`IP ${endpoint[0].join('.')} UDP ${bufferToNumber(endpoint[1])} TCP ${bufferToNumber(endpoint[2])} Distance ${xor(keccak256(initiatorId), keccak256(endpoint[3])).toString('hex')}`);
      }
    } else {
      console.log('Unknown packet');
    }
  }

  client.on('message', function(msg, info) {
    receive(msg, info).catch(e => {
      console.error;
      client.close();
    });
  });

  await send(
    encodePacket(initiatorPrivate, 0x01, rlpEncode([
      Buffer.from([0x04]),
      encodeEndpoint(initiatorEndpoint),
      encodeEndpoint(receiverEndpoint), 
      encodeExpiration()
    ]))
  );
}