import { randomBytes } from "crypto";
import udp, { Socket } from "dgram";
import { Endpoint } from "./endpoint";
import { KademliaTable } from "./kademlia";
import { decodePacket } from "./packet";
import { Peer } from "./peer";
import { bufferToInt } from "./util";

export class Server {
  privateKey: Buffer;
  endpoint: Endpoint;

  socket: Socket;
  table: KademliaTable<Peer>;

  banned: {
    [id: string]: boolean;
  };

  refreshSelector: number;

  constructor (privateKey: Buffer, endpoint: Endpoint) {
    this.privateKey = privateKey;
    this.endpoint = endpoint;

    this.table = new KademliaTable<Peer>(endpoint.id, async (peer: Peer) => {
      return true;
    });

    this.banned = {};
    this.refreshSelector = 0;

    this.socket = udp.createSocket('udp4');
    
    this.socket.on('message', (msg, info) => {
      const packet = decodePacket(msg);
      const peer = this.table.get(packet.publicKey.slice(1));
    
      if (peer) {
        peer.onMessage(packet).catch(e => {
          console.error(e);
        });
      } else {
        console.log('Unknown peer');
        console.log(packet.publicKey.slice(1).toString('hex'));
      }
    });

    this.socket.on('error', (error) => {
      console.error(error);
    });

    this.socket.on('close', () => {
      console.log('UDP server closed');
    });
  }

  async boot (endpoint: Endpoint) {
    const peer = new Peer(this.privateKey, this.endpoint, endpoint, this.socket);
    await this.addPeer(peer);
    
    peer.on('verified', () => {
      peer.findNodes(this.endpoint.id);
      peer.queried = true;
    });

    peer.ping();
  }

  async addPeer (peer: Peer): Promise<boolean> {
    if (this.banned[peer.receiverEndpoint.id.toString('hex')]) {
      return false;
    }

    if (this.table.exists(peer.receiverEndpoint.id)) {
      return false;
    }

    const added = await this.table.add(peer.receiverEndpoint.id, peer);
    if (!added) {
      return false;
    }

    peer.on('neighbor', (endpoint: Endpoint) => {
      const neighbor = new Peer(this.privateKey, this.endpoint, endpoint, this.socket);
      this.addPeer(neighbor).then(added => {
        if (added) {
          neighbor.ping();
        }
      });
    });

    return true;
  }

  // async findNodes (concurrent: number) {
  //   const closest = this.table.closest(16, (peer) => peer.verified);
  //   const notQueried = closest.filter(peer => !peer.queried);

  //   for (const peer of notQueried.slice(0, concurrent)) {
  //     peer.findNode();
  //     peer.queried = true;
  //   }
  // }

  remove (peer: Peer) {
    this.table.remove(peer.receiverEndpoint.id);
    this.banned[peer.receiverEndpoint.id.toString('hex')] = true;
  }

  refresh () {
    for (const peer of this.table.list()) {
      if (bufferToInt(peer.receiverEndpoint.id) % 10 !== this.refreshSelector) continue;
      peer.findNodes(randomBytes(64));
    }

    this.refreshSelector++;
  }
}