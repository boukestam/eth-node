import { generatePrivateKey, publicFromPrivate } from './util';
import { Endpoint, parseEnode } from './endpoint';
import { Server } from './server';
import { RLPxPeer } from './rlpx-peer';
import { ETH } from './eth';
import { Peer } from './peer';
import net from 'net';

const privateKey = generatePrivateKey();
const publicKey = publicFromPrivate(privateKey);
const id = publicKey.slice(1);

const endpoint: Endpoint = {
  id: id,
  ip: '83.85.218.241',
  udpPort: 21112,
  tcpPort: 21112
};

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

const server = new Server(privateKey, endpoint);

for (const node of bootNodes) {
  server.boot(parseEnode(node)).catch(e => console.error(e));
}

const triedPeers = new Set<Peer>();
const tcpPeers: RLPxPeer[] = [];
const eth = new ETH();

const tcpSocket = net.createServer((socket) => {
  const address = socket.address() as net.AddressInfo;
  console.log('TCP socket connected', address);

  const incomingEndpoint: Endpoint = {
    ip: address.address,
    id: Buffer.alloc(0),
    udpPort: address.port,
    tcpPort: address.port
  };
  
  const tcpPeer = new RLPxPeer(privateKey, endpoint, incomingEndpoint, socket);
  tcpPeers.push(tcpPeer);
});

tcpSocket.listen(endpoint.tcpPort, '192.168.178.12');

setInterval(() => {
  for (const peer of tcpPeers) {
    if (peer.closed) {
      tcpPeers.splice(tcpPeers.indexOf(peer), 1);
    }
  }

  for (const peer of server.table.list()) {
    if (!peer.verified && peer.pingTime > 0 && Date.now() - peer.pingTime > 2000) {
      // timeout
      server.remove(peer);
    }
  }

  console.log('Verified UDP peers', server.table.list().filter(peer => peer.verified).length);
  console.log('Verified TCP peers', tcpPeers.filter(peer => peer.verified).length);

  const verified = server.table.list().filter(peer => peer.verified && !triedPeers.has(peer));
  if (verified.length === 0) return;

  for (let i = 0; i < 10 && i < verified.length; i++) {
    const peer = verified[i];
    triedPeers.add(peer);

    const tcpPeer = new RLPxPeer(privateKey, endpoint, peer.receiverEndpoint);
    tcpPeers.push(tcpPeer);

    tcpPeer.on('eth', () => eth.onConnect(tcpPeer));
    tcpPeer.on('message', (code, body) => eth.onMessage(tcpPeer, code, body));
  }
}, 2000);

setInterval(() => {
  server.refresh();
}, 6000);