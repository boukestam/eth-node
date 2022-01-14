# Kademlia Table

In the previous part we found out how to connect to nodes, send ping and pong messages and finally get a list of neighbor nodes. Now we need to continue this process until we have enough neighbors. But how much is enough? After reading [the documentation](https://github.com/ethereum/devp2p/blob/master/discv4.md#kademlia-table) I found out that we need to use a ```Kademlia Table```.

The table is actually more like a tree. We start of by calculating the distance between two nodes like this:

```
distance(n₁, n₂) = keccak256(n₁) XOR keccak256(n₂)
```

This leaves us with a 256-bit number. We start of with the highest (left-most) bit. If this is a 1, we move to the left, if it's a zero, we move to the right. Then onto the next bit. We stop when we find a bucket with enough space in it. If there the bucket is full, but it can still be split further down, we do it. If we end up in a full bucket, we revalidate the nodes in there by sending a ping. If one of them doesn't respond, we replace it with the new one. We don't split further then one branch 'away' in the 1 direction. See [this presentation](https://docs.google.com/presentation/d/11qGZlPWu6vEAhA7p3qsQaQtWH7KofEC9dMeBFZ1gYeA/edit#slide=id.g1718cc2bc_0661) for a more visual explanation.

![image-20220113222022618](C:\Users\bouke\Documents\blog\kademlia.png)

Because our target is always a distance of 0, we actually don't ever need to split into the '1' direction. Therefore we don't actually need it to be a tree. We can just treat it like a flat array. Index 0 is the 1 branch of the first split, index 1 the second split, etc... Therefore we can do it like this:

- we have 256 buckets
- bucket ```i``` stores nodes with bit ```i``` set
- we start filling from left to right
- when the current last bucket is full we split it
- if the end destination bucket is full we try to replace an inactive node

After this I made the most simple implementation I could come up with. The code is a bit too long, and hard to explain piece by piece, so you can see it [on github](https://github.com/boukestam/eth-node/blob/main/main.ts) if you are interested.



