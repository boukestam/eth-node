import crypto, { Decipher } from 'crypto';
import secp256k1 from 'secp256k1';
import { rlpDecode, rlpEncode } from './rlp';
import { bufferToInt, generatePrivateKey, idToPK, intToBuffer, keccak256, printBytes, unstrictDecode, zfill } from './util';
import {xor} from 'bitwise-buffer';
import { ECIES } from './ecies';
import net from 'net';
import { Endpoint } from './endpoint';
import { MAC } from './mac';
import * as rlp from 'rlp';
import { compressSync, uncompressSync } from 'snappy';
import { BN } from 'bn.js';
import { Peer } from './peer';
import EventEmitter from 'events';

const DISCONNECT_REASONS = {
  0x00:	"Disconnect requested",
  0x01:	"TCP sub-system error",
  0x02:	"Breach of protocol, e.g. a malformed message, bad RLP, ...",
  0x03:	"Useless peer",
  0x04:	"Too many peers",
  0x05:	"Already connected",
  0x06:	"Incompatible P2P protocol version",
  0x07:	"Null node identity received - this is automatically invalid",
  0x08:	"Client quitting",
  0x09:	"Unexpected identity in handshake",
  0x0a:	"Identity is the same as this node (i.e. connected to itself)",
  0x0b:	"Ping timeout",
  0x10:	"Some other reason specific to a subprotocol"
};

export class RLPxPeer extends EventEmitter {

  privateKey: Buffer;
  
  initiatorEndpoint: Endpoint;
  receiverEndpoint: Endpoint

  buffer: Buffer;
  socket: net.Socket;
  state: 'auth' | 'header' | 'body';
  closed: boolean;
  bodySize: number;
  verified: boolean;

  incoming: boolean;

  eceis: ECIES;

  constructor (privateKey: Buffer, initiatorEndpoint: Endpoint, receiverEndpoint: Endpoint, socket?: net.Socket) {
    super();

    this.buffer = Buffer.from([]);

    this.privateKey = privateKey;
    this.initiatorEndpoint = initiatorEndpoint;
    this.receiverEndpoint = receiverEndpoint;

    this.state = 'auth';
    this.closed = false;
    this.verified = false;

    this.incoming = !!socket;

    this.eceis = new ECIES(privateKey, initiatorEndpoint.id, receiverEndpoint.id);

    this.socket = socket || new net.Socket();

    if (!this.incoming) {
      this.socket.connect(receiverEndpoint.tcpPort, receiverEndpoint.ip, () => {
        const auth = this.eceis.createAuthEIP8();
        this.socket.write(auth);
      });
    }

    this.socket.on('data', (data) => {
      this.buffer = Buffer.concat([this.buffer, data]);

      try {
        while (this.buffer.length > 0) {
          const size = this.parse();
          if (size === 0) break;
          
          this.buffer = this.buffer.slice(size);
        }
      } catch (e) {
        console.error(e);
        this.socket.destroy();
        this.closed = true;
      }
    });

    this.socket.on('error', (error) => {
      this.close(error);
    });

    this.socket.on('close', (error) => {
      this.close(error);
    });
  }

  send (code: number, data: Buffer, compress: boolean) {
    if (this.closed) return;

    const msg = Buffer.concat([rlp.encode(code), compress ? compressSync(data) : data]);

    const header = this.eceis.createHeader(msg.length);
    this.socket.write(header);

    const body = this.eceis.createBody(msg);
    this.socket.write(body);
  }

  sendHello () {
    this.send(0x00, rlp.encode([
      intToBuffer(5),
      Buffer.from('eth-node/v0.1', 'ascii'),
      [
        [Buffer.from('eth', 'ascii'), intToBuffer(66)]
      ],
      intToBuffer(this.initiatorEndpoint.tcpPort),
      this.initiatorEndpoint.id
    ]), false);
  }

  close (error?: any) {
    this.closed = true;
    this.emit('close');
  }

  disconnect (reason: number) {
    this.send(0x01, rlp.encode([
      intToBuffer(reason)
    ]), true);
    this.close();
  }

  idString () {
    return this.receiverEndpoint.id.toString('hex');
  }

  parse (): number {
    if (this.state === 'auth') {
      const sizeBuffer = this.buffer.slice(0, 2);
      const size = bufferToInt(sizeBuffer);
      const data = this.buffer.slice(0, size + 2);

      if (this.incoming) {
        this.eceis.parseAuthEIP8(data);

        const ack = this.eceis.createAckEIP8();
        this.socket.write(ack);
      } else {
        this.eceis.parseAckEIP8(data);
      }

      this.state = 'header';
      process.nextTick(() => this.sendHello());

      return size + 2;
    } else if (this.state === 'header') {
      this.bodySize = this.eceis.parseHeader(this.buffer.slice(0, 32)) + 16;
      if (this.bodySize % 16 > 0) this.bodySize += 16 - this.bodySize % 16;

      this.state = 'body';

      return 32;
    } else if (this.state === 'body') {
      if (this.buffer.length < this.bodySize) return 0;

      const body = this.eceis.parseBody(this.buffer.slice(0, this.bodySize));

      // RLP hack
      let code = body[0];
      if (code === 0x80) code = 0;

      let data = unstrictDecode((code === 0x00 || (code === 0x01 && body.length <= 3)) ? body.slice(1) : uncompressSync(body.slice(1)) as Buffer);

      if (code === 0x00) { // hello
        const [version, clientId, capabilities, listenPort, nodeId] = data as [Buffer, Buffer, Buffer[][], Buffer, Buffer]

        this.receiverEndpoint.id = nodeId;
        this.receiverEndpoint.tcpPort = bufferToInt(listenPort);

        if (capabilities.some(c => c[0].toString('ascii') === 'eth' && bufferToInt(c[1]) == 66)) {
          // supports eth 66
          this.emit('eth');
        } else {
          this.disconnect(0x10);
        }
      } else if (code === 0x01) { // disconnect
        this.socket.destroy();
        this.closed = true;
      } else if (code >= 0x10) {
        this.emit('message', code - 0x10, data);
      } else {
        console.log('Unhandled code', code);
      }

      this.state = 'header';

      return this.bodySize;
    }

    return 0;
  }
}