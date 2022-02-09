import { parentPort } from 'worker_threads';
import { generateCache, getCacheSize, getSeed } from './ethash';

parentPort.on('message', (value => {
  const blockNumber = value;
  const cacheSize = getCacheSize(blockNumber);
  const seed = getSeed(blockNumber);
  const cache = generateCache(cacheSize, seed);
   
  parentPort.postMessage(cache);
}));