# Chain synchronization



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