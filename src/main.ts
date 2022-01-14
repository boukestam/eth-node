import { generatePrivateKey, publicFromPrivate } from './util';
import { Endpoint, parseEnode } from './endpoint';
import { discover } from './discover';

const initiatorPrivate = generatePrivateKey();
const initiatorPublic = publicFromPrivate(initiatorPrivate);
const initiatorId = initiatorPublic.slice(1);

const initiatorEndpoint: Endpoint = {
  id: initiatorId,
  ip: '83.85.218.241',
  udpPort: 21112,
  tcpPort: 21112
};

const receiverEndpoint = parseEnode("enode://22a8232c3abc76a16ae9d6c3b164f98775fe226f0917b0ca871128a74a8e9630b458460865bab457221f1d448dd9791d24c4e5d88786180ac185df813a68d4de@3.209.45.79:30303")

discover(initiatorId, initiatorPrivate, initiatorEndpoint, receiverEndpoint);