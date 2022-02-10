import { RLPxPeer } from "./rlpx-peer";
import { bigIntToBuffer, bufferToInt, intToBuffer } from "./util";
import { Transaction } from "./transaction";
import { Block } from "./block";
import { rlpEncode } from "./rlp";

export class ETH {

  peers: RLPxPeer[];

  transactionHashes: Set<string>;
  blockHashes: Set<string>;

  hashesByPeer: Map<string, Set<string>>;

  transactions: Map<string, Transaction>;
  blocks: Map<string, Block>;
  blocksByNumber: Map<number, Block>;

  requests: Map<number, (err: Error, result: any) => void>;

  constructor () {
    this.peers = [];

    this.transactionHashes = new Set<string>();
    this.blockHashes = new Set<string>();

    this.hashesByPeer = new Map<string, Set<string>>();

    this.transactions = new Map<string, Transaction>();
    this.blocks = new Map<string, Block>();
    this.blocksByNumber = new Map<number, Block>();

    this.requests = new Map<number, (err: Error, result: any) => void>();
  }

  send (peer: RLPxPeer, code: number, data: Buffer) {
    peer.send(code + 0x10, data, true);
  }

  sendStatus (peer: RLPxPeer) {
    this.send(peer, 0x00, rlpEncode([
      intToBuffer(66),  // protocol version
      intToBuffer(1),   // chain id
      intToBuffer(17179869184), // genesis total difficulty
      Buffer.from('d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3', 'hex'), // genesis hash
      Buffer.from('d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3', 'hex'), // genesis hash
      [
        Buffer.from('20c327fc', 'hex'), // arrowGlacier hash
        Buffer.alloc(0) // unknown block for merge fork
      ]
    ]));
  }

  broadcast (from: RLPxPeer, set: Set<string>, hashStrings: string[], bodies: any[]) {
    const peerPool = this.hashesByPeer.get(from.idString());

    for (const hash of hashStrings) {
      set.add(hash);
      peerPool.add(hash);
    }

    for (const broadcastPeer of this.peers) {
      if (broadcastPeer === from) continue;

      const broadcastPeerPool = this.hashesByPeer.get(broadcastPeer.idString());
      const broadcastHashes = bodies.filter((v, i) => broadcastPeerPool.has(hashStrings[i]));

      this.send(broadcastPeer, 0x08, rlpEncode(broadcastHashes));

      for (const hash of hashStrings) broadcastPeerPool.add(hash);
    }
  }

  removeTransaction (hash: string) {
    this.transactionHashes.delete(hash);
    this.transactions.delete(hash);
  }

  request (peer: RLPxPeer, code: number, data: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = Math.floor(Math.random() * 1000000);

      this.send(peer, code, rlpEncode([
        intToBuffer(requestId),
        data
      ]));

      const timeout = setTimeout(() => {
        reject('timeout');
        this.requests.delete(requestId);
      }, 5000);

      this.requests.set(requestId, (err: Error, result: any) => {
        clearTimeout(timeout);
        this.requests.delete(requestId);

        if (err) return reject(err);

        resolve(result);
      });
    });
  }

  getBlockHeaders (peer: RLPxPeer, start: number, count: number): Promise<Buffer[][]> {
    return this.request(peer, 0x03, [
      intToBuffer(start),
      intToBuffer(count),
      intToBuffer(0),
      intToBuffer(0)
    ]);
  }

  getBlockBodies (peer: RLPxPeer, hashes: Buffer[]): Promise<any[]> {
    return this.request(peer, 0x05, hashes);
  }

  onConnect (peer: RLPxPeer) {
    process.nextTick(() => this.sendStatus(peer));
  }

  onDisconnect (peer: RLPxPeer) {
    const index = this.peers.indexOf(peer);
    if (index < 0) return;

    this.peers = this.peers.splice(index, 1);
  }

  onMessage (peer: RLPxPeer, code: number, body: any) {
    if (code === 0x00) { // status
      const [version, networkId, totalDifficulty, blockHash, genesis, forkId] = body;
      
      if (bufferToInt(version) !== 66 || bufferToInt(networkId) !== 1) {
        peer.disconnect(0x10);
        return;
      }

      peer.verified = true;

      this.peers.push(peer);
      if (!this.hashesByPeer.has(peer.idString())) {
        this.hashesByPeer.set(peer.idString(), new Set<string>());
      }

      const hashes = this.transactionHashes.values();
      let chunk = [];

      for (const hash of hashes) {
        chunk.push(Buffer.from(hash, 'hex'));

        if (chunk.length === 4096) {
          this.send(peer, 0x08, rlpEncode(chunk));
          chunk = [];
        }
      }

      if (chunk.length > 0) this.send(peer, 0x08, rlpEncode(chunk));
    } else if (code === 0x01) { // new block hashes
      const blocks = body as [Buffer, Buffer][];
      const hashStrings = blocks.map(([hash, _]) => hash.toString('hex'));

      this.broadcast(peer, this.blockHashes, hashStrings, blocks);
    } else if (code === 0x02) { // transactions
      const transactions = (body as Buffer[][]).map(raw => new Transaction(raw));

      for (const transaction of transactions) {
        const hash = transaction.hash();
        this.transactions.set(hash.toString('hex'), transaction);
      }
    } else if (code === 0x03) { // get block headers
      const [requestId, [startB, limitB, skipB, reverseB]] = body as [Buffer, [Buffer, Buffer, Buffer, Buffer]];

      let start: number;

      if (startB.length === 32) {
        // start is a hash
        const startHash = startB.toString('hex');
        if (this.blocks.has(startHash)) {
          start = this.blocks.get(startHash).number();
        } else {
          this.send(peer, 0x04, rlpEncode([requestId, []]));
          return;
        }
      } else {
        start = bufferToInt(startB);
      }

      const reverse = !!bufferToInt(reverseB);
      const limit = bufferToInt(limitB);
      const skip = bufferToInt(skipB);

      const end = reverse ? start - limit : start + limit;
      const increment = (skip + 1) * (reverse ? -1 : 1);

      const headers = [];
      for (let i = start; reverse ? i > end : i < end; i += increment) {
        if (this.blocksByNumber.has(i)) {
          headers.push(this.blocksByNumber.get(i).header());
          if ((headers.length + 1) * Block.HEADER_SIZE > 2 * 1024 * 1024) break; // 2MB
        }
      }

      this.send(peer, 0x04, rlpEncode([requestId, headers]));
    } else if (code === 0x04 || code === 0x06) { // block headers or bodies
      const requestId = bufferToInt(body[0]);

      if (this.requests.has(requestId)) {
        this.requests.get(requestId)(null, body[1]);
      }
    } else if (code === 0x07) { // new block
      const [raw, td] = body as [any[], Buffer];
      const block = new Block(raw, );

      this.blocks.set(block.hash().toString('hex'), block);
      this.blocksByNumber.set(block.number(), block);

      for (const hash of block.transactionHashes()) {
        this.removeTransaction(hash.toString('hex'));
      }
    } else if (code === 0x08) { // new pooled transaction hashes
      const hashes = body as Buffer[];
      const hashStrings = body.map(buffer => buffer.toString('hex'));

      this.broadcast(peer, this.transactionHashes, hashStrings, hashes);
    } else if (code === 0x09) { // get pooled transactions
      const [requestId, hashes] = body as [Buffer, Buffer[]];
      const transactions = [];

      for (const hash of hashes) {
        const hashString = hash.toString('hex');
        if (this.transactions.has(hashString)) {
          transactions.push(this.transactions.get(hashString).raw);
        }
      }

      this.send(peer, 0x0a, rlpEncode([requestId, transactions]));
    } else {
      console.log('Unhandled ETH code', code);
    }
  }
}