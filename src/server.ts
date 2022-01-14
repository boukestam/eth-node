import udp, { Socket } from "dgram";
import { Endpoint } from "./endpoint";
import { KademliaTable } from "./kademlia";
import { decodePacket } from "./packet";
import { Peer } from "./peer";

export class Server {
  privateKey: Buffer;
  endpoint: Endpoint;

  socket: Socket;
  table: KademliaTable<Peer>;

  constructor (privateKey: Buffer, endpoint: Endpoint) {
    this.privateKey = privateKey;
    this.endpoint = endpoint;

    this.table = new KademliaTable<Peer>(endpoint.id, async (peer: Peer) => {
      return true;
    });

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
  }

  async boot (endpoint: Endpoint) {
    const peer = new Peer(this.privateKey, this.endpoint, endpoint, this.socket);
    await this.addPeer(peer);
    
    peer.on('verified', () => {
      peer.findNode();
      peer.queried = true;
    });

    peer.ping();
  }

  async addPeer (peer: Peer): Promise<boolean> {
    const added = await this.table.add(peer.receiverEndpoint.id, peer);
    if (!added) return false;

    peer.on('neighbor', (endpoint: Endpoint) => {
      if (this.table.exists(endpoint.id)) return;

      const neighbor = new Peer(this.privateKey, this.endpoint, endpoint, this.socket);
      this.addPeer(neighbor).then(added => {
        if (added) neighbor.ping();
      });
    });

    return true;
  }

  async findNodes (concurrent: number) {
    const closest = this.table.closest(16, (peer) => peer.verified);
    const notQueried = closest.filter(peer => !peer.queried)

    for (const peer of notQueried.slice(0, concurrent)) {
      peer.findNode();
      peer.queried = true;
    }
  }
}