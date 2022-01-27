# Chain synchronization

Chain synchronization is the process of downloading blocks from other peers in the network.
After the status message is sent, each node checks how long the other's chain is.
If one node has a shorter chain than the other, it starts downloading the missing blocks.

### What is a block?

An ethereum block is basically a container that holds a bundle of transactions that is to be executed.
The number of transactions is limited by the block gas limit. Which is currently around 30,000,000.

Blocks are mined by miners by doing a very difficult calculation. The miner that solves this the first can claim the block.
The difficulty of the calculation increases or decreases based on the amount of mining power.
This makes sure that blocks will not be mined too quickly or too slowly. Ethereum has a target block time of 13 seconds, this means that on average, every 13 seconds a new block is created. The difficulty is adjusted to maintain this.

When a block is mined, the miner get's a reward, this is called the block reward and is currently around 2 ETH.
The address of the miner that the reward is 'sent to' is called the 'coinbase'.
When someone mines the same block, but is just too late and is no longer the first person anymore, this block will be added as an 'uncle block'. The uncles also receive a bit of reward. This makes sure that mining is not a winner takes all game, where the biggest miner will quickly become the fastest and keep snowballing this keep being the first one to mine the block.

- parent hash
- ommers
- coinbase
- number
- difficulty
- total difficulty (sum of all blocks in chain)
- gas limit
- gas used
- time (UTC)
- proof of work

The exact definition can be found [in the documentation](https://github.com/ethereum/devp2p/blob/master/caps/eth.md#block-encoding-and-validity).

### Synchronization process

The synchronization process works like this:

1. download block header
2. verify proof of work
3. download block body (transactions)
4. execute transactions

The first block in the chain is called the genesis block. It's block number is 0.
The genesis block is hardcoded and contains 8893 ETH transactions to wallets that participated in the presale.
The presale was an event held in 2014 to raise funds for the development of the Ethereum network.

The chain synchronization therefore starts at block number 1, since we already defined the genesis block.

### Downloading blocks

```typescript
getBlockHeaders (peer: RLPxPeer, start: number, count: number): Promise<Buffer[][]> {
  return this.request(peer, 0x03, [
    intToBuffer(start),
    intToBuffer(count),
    intToBuffer(0),
    intToBuffer(0)
  ]);
}
```

```typescript
getBlockBodies (peer: RLPxPeer, hashes: Buffer[]): Promise<any[]> {
  return this.request(peer, 0x05, hashes);
}
```