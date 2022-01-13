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

const receiverEndpoint = parseEnode("enode://d860a01f9722d78051619d1e2351aba3f43f943f6f00718d1b9baa4101932a1f5011f16bb2b1bb35db20d6fe28fa0bf09636d26a87d31de9ec6203eeedb1f666@18.138.108.67:30303")

discover(initiatorId, initiatorPrivate, initiatorEndpoint, receiverEndpoint);