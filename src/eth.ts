import { RLPxPeer } from "./rlpx-peer";
import { bufferToInt, intToBuffer } from "./util";
import * as rlp from 'rlp';
import BN from "bn.js";

export class ETH {

  peers: RLPxPeer[];

  pool: Set<string>;
  poolByPeer: Map<string, Set<string>>;

  constructor () {
    this.peers = [];

    this.pool = new Set<string>();
    this.poolByPeer = new Map<string, Set<string>>();
  }

  send (peer: RLPxPeer, code: number, data: Buffer) {
    peer.send(code + 0x10, data, true);
  }

  sendStatus (peer: RLPxPeer) {
    this.send(peer, 0x00, rlp.encode([
      intToBuffer(66),
      intToBuffer(1),
      new BN('17179869184').toBuffer(),
      Buffer.from('d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3', 'hex'),
      Buffer.from('d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3', 'hex'),
      [
        Buffer.from('20c327fc', 'hex'),
        Buffer.alloc(0)
      ]
    ]));
  }

  onConnect (peer: RLPxPeer) {
    process.nextTick(() => this.sendStatus(peer));
  }

  onMessage (peer: RLPxPeer, code: number, body: any) {
    if (code === 0x00) { // eth status
      const [version, networkId, totalDifficulty, blockHash, genesis, forkId] = body as [Buffer, Buffer, Buffer, Buffer, Buffer, Buffer];
      
      if (bufferToInt(version) === 66 && bufferToInt(networkId) === 1) {
        peer.verified = true;

        this.peers.push(peer);
        if (!this.poolByPeer.has(peer.idString())) {
          this.poolByPeer.set(peer.idString(), new Set<string>());
        }
      } else {
        peer.disconnect(0x10);
      }
    } else if (code === 0x03) { // get block headers
      this.send(peer, 0x04, rlp.encode([]));
    } else if (code === 0x08) { // new pooled transaction hashes
      const hashes = body as Buffer[];
      const hashStrings = body.map(buffer => buffer.toString('hex'));

      const peerPool = this.poolByPeer.get(peer.idString());

      for (const hash of hashStrings) {
        if (!peerPool.has(hash)) peerPool.add(hash);
        if (!this.pool.has(hash)) this.pool.add(hash);
      }

      for (const broadcastPeer of this.peers) {
        if (broadcastPeer === peer) continue;

        const broadcastPeerPool = this.poolByPeer.get(broadcastPeer.idString());
        const broadcastHashes = hashes.filter((v, i) => broadcastPeerPool.has(hashStrings[i]));

        this.send(broadcastPeer, 0x08, rlp.encode(broadcastHashes));

        hashes.forEach((v, i) => broadcastPeerPool.add(hashStrings[i]));
      }
    }
  }
}