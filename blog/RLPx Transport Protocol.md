# RLPx Transport Protocol

I think the easiest way to start is by just trying to connect to another node and seeing what data we get sent. We'll pick it up from there. 

Through the Ethereum documentation I manage to find [a document](https://github.com/ethereum/devp2p/blob/master/rlpx.md) that explains the process of connecting to another node. The protocol is called the **RLPx Transport protocol**. It's TCP-based and starts out a handshake. The first step in the handshake is to send an ```auth``` message. The ```auth``` message looks like this:

```
auth = auth-size || enc-auth-body
auth-size = size of enc-auth-body, encoded as a big-endian 16-bit integer
auth-vsn = 4
auth-body = [sig, initiator-pubk, initiator-nonce, auth-vsn, ...]
enc-auth-body = ecies.encrypt(recipient-pubk, auth-body || auth-padding, auth-size)
auth-padding = arbitrary data
```

Apparently the ```auth``` message consists of the size of the message and then an encrypted body, got that part. The size is a big-endian 16-bit integer. The body consists of the following parts:

- signature (ECDSA signature)
- public key (our public key, 64 bytes long)
- nonce (random 32 bytes)
- version number (needs to be 4)

Apparently the signature is a signed message using standard ECDSA with P256 Curve. It's calculated like this:

```
shared-secret = SSK(initiator-privkey, receiver-pubkey)
signature := Sign(ecdhe-random-key, shared-secret ^ init_nonce) 

Where SSK(initiator-privkey, receiver-pubkey) is a symmetric shared secret key as given by ECDH.
```

The nonce is just a random 32 byte sequence that we can decide ourselves. The ECIES encryption is new to me, so let's look that up.

#### ECIES

A quick google search tells us that ECIES stands for Elliptic Curve Integrated Encryption Scheme. I tried multiple libraries, but unfortunately none of them give the correct output. I then found the [vaporyjs-devp2p repository](https://github.com/vaporyjs/vaporyjs-devp2p/blob/master/src/rlpx/ecies.js) that has a nice implementation that I can use. The implementation is too big to put in this post, but if you're interested you can find it [here](https://github.com/boukestam/eth-node/blob/main/ecies.ts). 

#### Auth message

We should now have all the knowledge/libraries that we need to start building the ```auth``` message. So let's finally write some code! 

```typescript
// Create our private and public key
const initiatorPrivate = crypto.randomBytes(32);
const initiatorPublic = await ecies.getPublic(initiatorPrivate);
```

We then generate the nonce and random ECDHE key and we can calculate the signature. To compute the secret we need another library to perform bitwise operations on buffers. I chose [bitwise-buffer](https://www.npmjs.com/package/bitwise-buffer) for this.

```typescript
const initiatorNonce = crypto.randomBytes(32);
const ecdheRandomKey = crypto.randomBytes(32);

const sharedSecret = await ecies.derive(initiatorPrivate, receiverPublic);
const signature = await ecies.sign(ecdheRandomKey, xor(sharedSecret, initiatorNonce));
```

We now need to combine these elements to create the body. As a refresher, this is what the documentation says:

```
auth-body = [sig, initiator-pubk, initiator-nonce, auth-vsn, ...]
```

And also:

```
[X, Y, Z, ...]
    denotes recursive encoding as an RLP list.
```

So I guess the next step is to learn about RLP encoding.

Using this function we can now create and encrypt the ```auth body```:

```typescript
const authBody = rlpEncode([
    signature, 
    initiatorPublic, 
    initiatorNonce, 
    Buffer.from(new Uint8Array([4]))
]);

const encryptedAuthBody = await ecies.encrypt(receiverPublic, authBody);

return Buffer.concat([
    Buffer.from(new Uint16Array([encryptedAuthBody.length])), 
    encryptedAuthBody
]);
```

If we print out the final message in hex format it looks like this:

```
2104caac696564980a9b2320cdec841c00d5ff7799c962c939ff248eebb1e1dc6c6071a1956550c63e0b2ec9e029fcc1adf826160b9450e12b7c8968017b8b0aff53b0f64803d063ef1842a98cfc582154d31394547dbdd8ab95c35be67305c81732be9d01f3f24c6591df9b72e60ea357977820dba20f7ea1b62c0f4e2bd43e0eeafac701fc5675e8201f2e233c501dd7f441502f53febe76d0ef99a85f2d78db2adecb70262b2c38d523299bb28210c0630563907997da3d01b7bcca2173094e25f0dac7442473428cb6ac14aefc5ef541734dbda19dd6378d8be3da339140a7dd0a0e839958db52be4075a72869d2ace7d564169bc5ec8cacbd0ab414363747cfdce63649058175c8461260d41a0bee530e393c539df2de1e7b6a262b431110b0
```

### 