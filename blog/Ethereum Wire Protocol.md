# Ethereum Wire Protocol

The ethereum wire protocol is the build on top of the RLPx protocol. 
It's messages are offset by 0x10 (right after the RLPx builtin messages).
There are 3 main functionalities in the protocol:

- transaction exchange
- block propagation
- chain synchronization

We will start by focusing on the transaction exchange and block propagation.
These parts relay new transactions and blocks troughout the network.
By doing this first, we can already be a helpful node while we are synchronizing (downloading) the chain.

### Status message

The protocol starts off with both peers sending a status messages (0x00) to the other peer.
The status message contains:

- protocol version (latest is 66)
- chain id (e.g. 1 for mainnet, 4 for rinkeby testnet)
- total difficulty of our chain
- hash of latest block of our chain
- hash of the genesis block
- hash of the current fork
- blocknumber of the next fork

Since we don't have not downloaded any blocks yet, our current block is the [genesis block](https://etherscan.io/block/0).
The current fork at the time of writing is 'Arrow Glacier'.
The code to send the status message looks like this:

```typescript
this.send(peer, 0x00, rlp.encode([
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
```

When we receive their status message, we can determine if the other peer uses the same protocol version, chain id and fork.
If they don't, we immediately disconnect:

```typescript
if (code === 0x00) { // status
  const [version, networkId, totalDifficulty, blockHash, genesis, forkId] = body;
        
  if (bufferToInt(version) !== 66 || bufferToInt(networkId) !== 1) {
    peer.disconnect(0x10);
    return;
  }
}
```

If they do, we set their status to verified.

### Transaction pool

Every node is expected to keep track of a pool of pending transactions. 
Right after the status message is received, each node sends the hashes of it's pooled transactions to the other node.
Whenever new transaction hashes are received, we need to 'forward' them to all nodes that don't know about it.
Also, we need to retrieve the actual transaction information.
To know which nodes know about which transactions, we also keep a record of all exchanged transaction hashes for each node.

```typescript
transactionHashes: Set<string>;
hashesByPeer: Map<string, Set<string>>;
```

### Block propagation