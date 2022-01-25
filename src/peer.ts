import { Endpoint } from "./endpoint";
import udp, { RemoteInfo, Socket } from 'dgram';
import { encodePacket, encodeEndpoint, encodeExpiration, decodePacket, Packet } from "./packet";
import EventEmitter from "events";
import * as rlp from 'rlp';
import { KademliaTable } from "./kademlia";

function bufferToNumber (buffer: Buffer) {
  if (buffer.length === 0) return 0;
  if (buffer.length === 1) return buffer.readUInt8();
  if (buffer.length === 2) return buffer.readUInt16BE();
  if (buffer.length === 2) return buffer.readUInt32BE();
  throw new Error('Buffer number too long');
}

export class Peer extends EventEmitter {
  privateKey: Buffer;
  initiatorEndpoint: Endpoint;
  receiverEndpoint: Endpoint
  socket: Socket;

  verified: boolean;
  queried: boolean;
  pingTime: number;

  table: KademliaTable<Peer>;

  constructor (privateKey: Buffer, initiatorEndpoint: Endpoint, receiverEndpoint: Endpoint, socket: Socket, table: KademliaTable<Peer>) {
    super();

    this.privateKey = privateKey;
    this.initiatorEndpoint = initiatorEndpoint;
    this.receiverEndpoint = receiverEndpoint;
    this.socket = socket;

    this.verified = false;
    this.queried = false;

    this.table = table;
  }

  send (msg: Buffer, log?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.send(msg, this.receiverEndpoint.udpPort, this.receiverEndpoint.ip, function(error) {
        if(error) {
          this.socket.close();
          reject();
        } else {
          //if (log) console.log(log);
          resolve();
        }
      });
    });
  }

  async ping () {
    await this.send(
      encodePacket(this.privateKey, 0x01, rlp.encode([
        Buffer.from([0x04]),
        encodeEndpoint(this.initiatorEndpoint),
        encodeEndpoint(this.receiverEndpoint), 
        encodeExpiration()
      ]))
    );

    this.pingTime = Date.now();
  }

  async pong (hash: Buffer) {
    await this.send(
      encodePacket(this.privateKey, 0x02, rlp.encode([
        encodeEndpoint(this.receiverEndpoint),
        hash,
        encodeExpiration()
      ]))
    );
  }

  async findNodes (target: Buffer) {
    await this.send(
      encodePacket(this.privateKey, 0x03, rlp.encode([
        target,
        encodeExpiration()
      ]))
    );
  }

  async onMessage (packet: Packet) {
    const data = rlp.decode(packet.packetData) as any;

    if (packet.packetType === 0x01) { // Ping
      await this.pong(packet.hash);
      this.pingTime = 0;
      this.verified = true;
      this.emit('verified');
    } else if (packet.packetType === 0x02) { // Pong
      const [to, pingHash,  expiration] = data as [Buffer[], Buffer, Buffer];
    } else if (packet.packetType === 0x03) { // FindNodes
      const [target, expiration] = data as [Buffer, Buffer];
      const peers = this.table.closest(16, undefined, target);
      
      await this.send(
        encodePacket(this.privateKey, 0x04, rlp.encode([
          peers.map(peer => encodeEndpoint(peer.receiverEndpoint)),
          encodeExpiration()
        ]))
      );
    } else if (packet.packetType === 0x04) { // Neighbors
      const [nodes, expiration] = data as [Buffer[][], Buffer];

      for (const node of nodes) {
        const endpoint: Endpoint = {
          id: node[3],
          ip: node[0].slice(-4).join('.'),
          udpPort: bufferToNumber(node[1]),
          tcpPort: bufferToNumber(node[2])
        };
        
        this.emit('neighbor', endpoint);
      }
    } else {
      console.error('Unknown packet', packet.packetType);
    }
  }
}