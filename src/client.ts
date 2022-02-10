import { Endpoint, parseEnode } from "./endpoint";
import { ETH } from "./eth";
import { Peer } from "./peer";
import { RLPxPeer } from "./rlpx-peer";
import { Server } from "./server";
import { bigIntToBuffer, bufferToInt, generatePrivateKey, intToBuffer, publicFromPrivate } from "./util";
import net from 'net';
import { Block } from "./block";
import { rlpEncode } from "./rlp";

const levelup = require('levelup');
const leveldown = require('leveldown');

const bootNodes = [
  "enode://d860a01f9722d78051619d1e2351aba3f43f943f6f00718d1b9baa4101932a1f5011f16bb2b1bb35db20d6fe28fa0bf09636d26a87d31de9ec6203eeedb1f666@18.138.108.67:30303",   // bootnode-aws-ap-southeast-1-001
  "enode://22a8232c3abc76a16ae9d6c3b164f98775fe226f0917b0ca871128a74a8e9630b458460865bab457221f1d448dd9791d24c4e5d88786180ac185df813a68d4de@3.209.45.79:30303",     // bootnode-aws-us-east-1-001
  "enode://ca6de62fce278f96aea6ec5a2daadb877e51651247cb96ee310a318def462913b653963c155a0ef6c7d50048bba6e6cea881130857413d9f50a621546b590758@34.255.23.113:30303",   // bootnode-aws-eu-west-1-001
  "enode://279944d8dcd428dffaa7436f25ca0ca43ae19e7bcf94a8fb7d1641651f92d121e972ac2e8f381414b80cc8e5555811c2ec6e1a99bb009b3f53c4c69923e11bd8@35.158.244.151:30303",  // bootnode-aws-eu-central-1-001
  "enode://8499da03c47d637b20eee24eec3c356c9a2e6148d6fe25ca195c7949ab8ec2c03e3556126b0d7ed644675e78c4318b08691b7b57de10e5f0d40d05b09238fa0a@52.187.207.27:30303",   // bootnode-azure-australiaeast-001
  "enode://103858bdb88756c71f15e9b5e09b56dc1be52f0a5021d46301dbbfb7e130029cc9d0d6f73f693bc29b665770fff7da4d34f3c6379fe12721b5d7a0bcb5ca1fc1@191.234.162.198:30303", // bootnode-azure-brazilsouth-001
  "enode://715171f50508aba88aecd1250af392a45a330af91d7b90701c436b618c86aaa1589c9184561907bebbb56439b8f8787bc01f49a7c77276c58c1b09822d75e8e8@52.231.165.108:30303",  // bootnode-azure-koreasouth-001
  "enode://5d6d7cd20d6da4bb83a1d28cadb5d409b64edf314c0335df658c1a54e32c7c4a7ab7823d57c39b6a757556e68ff1df17c748b698544a55cb488b52479a92b60f@104.42.217.25:30303",   // bootnode-azure-westus-001
];

export class Client {

  privateKey: Buffer;
  publicKey: Buffer;
  id: Buffer;

  endpoint: Endpoint;
  server: Server;

  triedPeers: Set<Peer>;
  tcpPeers: RLPxPeer[];
  eth: ETH;

  db: any;

  latestBlock: number = 3913997;

  constructor () {
    this.privateKey = generatePrivateKey();
    this.publicKey = publicFromPrivate(this.privateKey);
    this.id = this.publicKey.slice(1);

    this.endpoint = {
      id: this.id,
      ip: '83.85.218.241',
      udpPort: 21112,
      tcpPort: 21112
    };

    this.server = new Server(this.privateKey, this.endpoint);

    this.triedPeers = new Set<Peer>();
    this.tcpPeers = [];
    this.eth = new ETH();

    this.db = levelup(leveldown(process.env.DATA))
  }

  start () {
    for (const node of bootNodes) {
      this.server.boot(parseEnode(node)).catch(e => console.error(e));
    }
    
    const tcpSocket = net.createServer((socket) => {
      const address = socket.address() as net.AddressInfo;
      console.log('TCP socket connected', address);
    
      const incomingEndpoint: Endpoint = {
        ip: address.address,
        id: Buffer.alloc(0),
        udpPort: address.port,
        tcpPort: address.port
      };
      
      const tcpPeer = new RLPxPeer(this.privateKey, this.endpoint, incomingEndpoint, socket);
      this.tcpPeers.push(tcpPeer);
    });
    
    tcpSocket.listen(this.endpoint.tcpPort, '192.168.178.17');
    let refreshSelector = 0;
    
    setInterval(() => {
      for (const peer of this.tcpPeers) {
        if (peer.closed) {
          this.tcpPeers.splice(this.tcpPeers.indexOf(peer), 1);
          this.eth.onDisconnect(peer);
        }
      }
    
      for (const peer of this.server.table.list()) {
        if (peer.pingTime > 0 && Date.now() - peer.pingTime > 2000) {
          // timeout
          this.server.remove(peer);
        }
      }
    
      console.log('UDP peers', this.server.table.list().length + '/' + this.server.table.list().filter(peer => peer.verified).length, 'TCP peers', this.tcpPeers.length + '/' + this.tcpPeers.filter(peer => peer.verified).length, 'TxPool size', this.eth.transactionHashes.size, 'Blocks', this.eth.blocks.size);
    
      const verified = this.server.table.list().filter(peer => peer.verified && !this.tcpPeers.some(tp => tp.receiverEndpoint.id.equals(peer.receiverEndpoint.id)));
      if (verified.length === 0) return;
    
      for (const peer of verified) {
        if (bufferToInt(peer.receiverEndpoint.id) % 10 !== refreshSelector % 10) continue;
        this.triedPeers.add(peer);
    
        if (!peer.receiverEndpoint.tcpPort) continue;
    
        const tcpPeer = new RLPxPeer(this.privateKey, this.endpoint, peer.receiverEndpoint);
        this.tcpPeers.push(tcpPeer);
    
        tcpPeer.on('eth', () => this.eth.onConnect(tcpPeer));
        tcpPeer.on('message', (code, body) => this.eth.onMessage(tcpPeer, code, body));
      }
    
      refreshSelector++;
    }, 2000);
    
    setInterval(() => {
      this.server.refresh();
    }, 6000);

    this.sync();
  }

  async sync () {
    const verified = this.tcpPeers.filter(peer => peer.verified);
    verified.sort((a, b) => a.timeout - b.timeout);
  
    if (verified.length > 0 && this.latestBlock < 14063719) {
      const peer = verified[0];
  
      try {
        let headers = await this.eth.getBlockHeaders(peer, this.latestBlock + 1, 14063719);
        console.log('Got headers', headers.length);
        
        while (headers.length > 0) {
          const blocks = headers.map(header => new Block([header]));
          const hashes = blocks.map(block => block.hash());
          
          const result = await this.eth.getBlockBodies(peer, hashes);
          if (result.length === 0) break;
  
          const numbers = blocks.map(block => block.number());
          const ops = [];
          
          for (let i = 0; i < result.length; i++) {
            const numberB = intToBuffer(numbers[i]);
  
            const headerKey = Buffer.concat([Buffer.from('h'), numberB]);
            const bodyKey = Buffer.concat([Buffer.from('b'), numberB]);
            const hashToNumberKey = Buffer.concat([Buffer.from('n'), hashes[i]]);
  
            ops.push({
              type: 'put',
              key: headerKey,
              value: rlpEncode(headers[i])
            });
  
            ops.push({
              type: 'put',
              key: bodyKey,
              value: rlpEncode(result[i])
            });
  
            ops.push({
              type: 'put',
              key: hashToNumberKey,
              value: numberB
            });
          }
  
          this.db.batch(ops);
  
          console.log('Got ', result.length, ' bodies from ', numbers[0], ' to ', numbers[result.length - 1]);
    
          this.latestBlock = numbers[numbers.length - 1];
          headers = headers.slice(result.length);
        }
      } catch (e) {
        if (e === 'timeout') {
          peer.timeout = Date.now();
          console.log('Peer timed out', peer.idString());
        } else {
          console.error('Error while syncing blocks', e);
        }
      }
    }
  
    setTimeout(() => {
      this.sync();
    }, 100);
  }
}