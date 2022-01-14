import { generatePrivateKey, publicFromPrivate } from './util';
import { Endpoint, parseEnode } from './endpoint';
import { Server } from './server';

const privateKey = generatePrivateKey();
const publicKey = publicFromPrivate(privateKey);
const id = publicKey.slice(1);

const endpoint: Endpoint = {
  id: id,
  ip: '83.85.218.241',
  udpPort: 21112,
  tcpPort: 21112
};

const bootEndpoint = parseEnode("enode://22a8232c3abc76a16ae9d6c3b164f98775fe226f0917b0ca871128a74a8e9630b458460865bab457221f1d448dd9791d24c4e5d88786180ac185df813a68d4de@3.209.45.79:30303")

const server = new Server(privateKey, endpoint);
server.boot(bootEndpoint);

setInterval(() => {
  console.log(server.table.size(), server.table.list().filter(peer => peer.verified).length);
  server.findNodes(3);
}, 2000);