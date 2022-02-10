import { Block } from "./block";
import { Transaction } from "./transaction";
import { bigIntToBuffer, bufferToBigInt, keccak256, keccak256Array } from "./util";

export interface Account {
  address: Buffer;
  nonce: Buffer;
  balance: bigint;
  code?: Buffer;
  storage?: {[key: string]: bigint}
}

interface Message {
  caller: bigint;
  value: bigint;
  data: Buffer;
}

type Stack = bigint[];
type Memory = {
  [key: string]: number
};
type Storage = {
  [key: string]: bigint
};

interface MemoryWrite {
  offset: bigint;
  bytes: Buffer;
  length: bigint;
};

function uint256 (n: bigint): bigint {
  return BigInt.asUintN(256, n);
}

function int256 (n: bigint): bigint {
  return BigInt.asIntN(256, n);
}

export class EVM {

  accounts: {
    [address: string]: Account
  };

  constructor () {
    this.accounts = {};
  }

  createAddress (addr: Buffer, nonce: Buffer): Buffer {
    const hash = keccak256Array([addr, nonce]);
    return hash.slice(-20);
  }

  createAccount (addr: Buffer) {
    this.accounts[addr.toString('hex')] = {
      address: addr,
      nonce: Buffer.alloc(0),
      balance: 0n
    };
  }

  getAccount (addr: bigint): Account {
    const key = addr.toString(16);
    if (key in this.accounts) return this.accounts[key];

    return {
      address: bigIntToBuffer(addr),
      nonce: Buffer.alloc(0),
      balance: 0n
    };
  }

  setCode (addr: Buffer, code: Buffer) {
    this.accounts[addr.toString('hex')].code = code;
  }

  async run (block: Block, transaction: Transaction): Promise<Buffer> {
    const bytes = transaction.data();
    
    const account: Account = {
      address: Buffer.alloc(0),
      nonce: Buffer.alloc(0),
      balance: 0n,
      code: bytes,
      storage: {}
    };

    const msg: Message = {
      caller: 0x00n,
      value: 0n,
      data: bytes
    };

    const chainId = 1n;

    // Stack of uin256, max 1024
    const stack: Stack = [];

    // Array of uint8
    const memory: Memory = {};

    // Mapping of uint256 => uint256
    const storage: Storage = {};

    let pc = -1n;
    let gasUsed = 0;
    let result: Buffer = Buffer.alloc(0);

    const push = (n: bigint) => stack.push(uint256(n));
    const pop = () => uint256(stack.pop() as bigint);

    const mread = (offset: bigint, length: bigint): Buffer => {
      const output: number[] = [];

      for (let i = offset; i < offset + length; i++) {
        const key = i.toString(16);
        output.push(key in memory ? memory[key] : 0);
      }

      return Buffer.from(output);
    };

    const memoryWrites: MemoryWrite[] = [];

    const mwrite = (offset: bigint, bytes: Buffer, length: bigint) => {
      for (let i = 0; i < length; i++) {
        const key = (offset + BigInt(i)).toString(16);
        memory[key] = i < bytes.length ? bytes[i] : 0;
      }

      memoryWrites.push({offset, bytes, length});
    };

    const sread = (n: bigint): bigint => {
      const key = n.toString(16);
      return key in storage ? storage[key] : 0n;
    };

    const swrite = (n: bigint, value: bigint) => {
      const key = n.toString(16);
      storage[key] = value;
    };

    while (pc < bytes.length) {
      const byte = bytes[Number(++pc)];
      let gas = 0;

      // STOP
      if (byte === 0x00) {
        break;
      }

      // NUMBER OPERATORS
      else if (byte >= 0x01 && byte <= 0x1D) {
        const a = stack.pop();

        // ISZERO
        if (byte === 0x15) {
          gas = 3;
          push(a == 0n ? 1n: 0n);
        }

        // NOT
        else if (byte === 0x19) {
          gas = 3;
          push(~a);
        }

        else {
          const b = pop();

          // ADD
          if (byte === 0x01) {
            gas = 3;
            push(a + b);
          }

          // MUL
          else if (byte === 0x02) {
            gas = 5;
            push(a * b);
          }

          // SUB
          else if (byte === 0x03) {
            gas = 3;
            push(a - b);
          }

          // DIV
          else if (byte === 0x04) {
            gas = 5;
            push(a / b);
          }

          // SDIV
          else if (byte === 0x05) {
            gas = 5;
            push(int256(a) / int256(b));
          }

          // MOD
          else if (byte === 0x06) {
            gas = 5;
            push(a % b);
          }

          // SMOD
          else if (byte === 0x07) {
            gas = 5;
            push(int256(a) % int256(b));
          }

          // ADDMOD
          else if (byte === 0x08) {
            gas = 8;
            const n = pop();
            push((a + b) % n);
          }

          // MULMOD
          else if (byte === 0x08) {
            gas = 8;
            const n = pop();
            push((a * b) % n);
          }

          // EXP
          else if (byte === 0x0A) {
            // TODO: Gas calculation
            gas = 10; //b == 0n ? 10 : (10 + 10 * (1 + Math.log(b)) / Math.log(256)));
            push(a ** b);
          }

          // SIGNEXTEND
          else if (byte === 0x0B) {
            // TODO: ???
          }

          // LT
          else if (byte === 0x10) {
            gas = 3;
            push(a < b ? 1n : 0n);
          }

          // GT
          else if (byte === 0x11) {
            gas = 3;
            push(a > b ? 1n : 0n);
          }

          // SLT
          else if (byte === 0x12) {
            gas = 3;
            push(int256(a) < int256(b) ? 1n : 0n);
          }

          // SGT
          else if (byte === 0x13) {
            gas = 3;
            push(int256(a) > int256(b) ? 1n : 0n);
          }

          // EQ
          else if (byte === 0x14) {
            gas = 3;
            push(a == b ? 1n : 0n);
          }

          // AND
          else if (byte === 0x16) {
            gas = 3;
            push(a & b);
          }

          // OR
          else if (byte === 0x17) {
            gas = 3;
            push(a | b);
          }

          // XOR
          else if (byte === 0x18) {
            gas = 3;
            push(a ^ b);
          }

          // BYTE
          else if (byte === 0x1A) {
            gas = 3;
            push((b >> (248n - a * 8n)) & 0xFFn);
          }

          // SHL
          else if (byte === 0x1B) {
            gas = 3;
            push(b << a);
          }

          // SHR
          else if (byte === 0x1B) {
            gas = 3;
            push(b >> a);
          }

          // SAR
          else if (byte === 0x1B) {
            gas = 3;
            push(int256(b) << int256(a));
          }

          // SHA3
          else if (byte === 0x20) {
            const offset = a;
            const length = b;

            gas = 30 + 6 * Number(length);

            const hash = bufferToBigInt(keccak256(mread(offset, length)));
            push(hash);
          }

          else {
            throw new Error('Unknown numeric operator ' + byte.toString(16));
          }
        }
      }

      // ADDRESS
      else if (byte === 0x30) {
        gas = 2;
        push(bufferToBigInt(account.address));
      }

      // BALANCE
      else if (byte === 0x31) {
        gas = 400;
        const addr = pop();
        const balance = this.getAccount(addr).balance;
        push(balance);
      }

      // ORIGIN
      else if (byte === 0x32) {
        gas = 2;
        push(bufferToBigInt(transaction.origin()));
      }

      // CALLER
      else if (byte === 0x33) {
        gas = 2;
        push(msg.caller);
      }

      // CALLVALUE
      else if (byte === 0x34) {
        gas = 2;
        push(msg.value);
      }

      // CALLDATALOAD
      else if (byte === 0x35) {
        gas = 3;
        const i = pop();

        const value = bufferToBigInt(msg.data.slice(Number(i), Number(i) + 32));

        push(value);
      }

      // CALLDATASIZE
      else if (byte === 0x36) {
        gas = 2;
        push(BigInt(msg.data.length / 2));
      }

      // CALLDATACOPY
      else if (byte === 0x37) {
        const destOffset = pop();
        const offset = pop();
        const length = pop();

        gas = 2 + 3 * Number(length);

        mwrite(destOffset, msg.data.slice(Number(offset), Number(offset) + Number(length)), length);
      }

      // CODESIZE
      else if (byte === 0x38) {
        gas = 2;
        push(BigInt(account.code?.length || 0));
      }

      // CODECOPY
      else if (byte === 0x39) {
        const destOffset = pop();
        const offset = pop();
        const length = pop();

        gas = 2 + 3 * Number(length);

        mwrite(destOffset, (account.code || Buffer.alloc(0)).slice(Number(offset), Number(offset) + Number(length)), length);
      }

      // GASPRICE
      else if (byte === 0x3A) {
        gas = 2;
        push(transaction.gasPrice());
      }

      // EXTCODESIZE
      else if (byte === 0x3B) {
        gas = 700;
        const addr = pop();
        const size = BigInt(this.getAccount(addr).code?.length || 0);
        push(size);
      }

      // EXTCODECOPY
      else if (byte === 0x3C) {
        const addr = pop();
        const code = this.getAccount(addr).code || Buffer.alloc(0);

        const destOffset = pop();
        const offset = pop();
        const length = pop();

        gas = 700 + 3 * Number(length);

        mwrite(destOffset, code.slice(Number(offset), Number(offset) + Number(length)), length);
      }

      // RETURNDATASIZE
      else if (byte === 0x3D) {
        // TODO: implementation
      }

      // RETURNDATACOPY
      else if (byte === 0x3E) {
        // TODO: implementation
      }

      // EXTCODEHASH
      else if (byte === 0x3F) {
        // TODO: implementation
      }

      // BLOCKHASH
      else if (byte === 0x40) {
        gas = 20;
        // TODO: implementation
      }

      // COINBASE
      else if (byte === 0x41) {
        gas = 2;
        push(block.coinbase());
      }

      // TIMESTAMP
      else if (byte === 0x42) {
        gas = 2;
        push(block.time());
      }

      // NUMBER
      else if (byte === 0x43) {
        gas = 2;
        push(BigInt(block.number()));
      }

      // DIFFICULTY	
      else if (byte === 0x44) {
        gas = 2;
        push(block.difficulty());
      }

      // GASLIMIT
      else if (byte === 0x45) {
        gas = 2;
        push(block.gasLimit());
      }

      // CHAINID
      else if (byte === 0x46) {
        gas = 2;
        push(chainId);
      }

      // SELFBALANCE
      else if (byte === 0x47) {
        gas = 2;
        push(account.balance);
      }

      // BASEFEE
      else if (byte === 0x48) {
        // TODO: implementation
      }

      // POP
      else if (byte === 0x50) {
        gas = 2;
        pop();
      }

      // MLOAD
      else if (byte === 0x51) {
        gas = 3;
        const offset = pop();
        push(bufferToBigInt(mread(offset, 32n)));
      }

      // MSTORE
      else if (byte === 0x52) {
        gas = 3;
        const offset = pop();
        const value = pop();

        mwrite(offset, bigIntToBuffer(value), 32n);
      }

      // MSTORE8
      else if (byte === 0x53) {
        gas = 3;
        const offset = pop();
        const value = pop();

        mwrite(offset, Buffer.from([Number(value & 0xFFn)]), 1n);
      }

      // SLOAD
      else if (byte === 0x54) {
        gas = 200;
        const key = pop();
        push(sread(key));
      }

      // SSTORE
      else if (byte === 0x55) {
        const key = pop();
        const value = pop();

        gas = ((value != 0n) && (key == 0n)) ? 20000 : 5000;
        
        swrite(key, value);
      }

      // JUMP
      else if (byte === 0x56) {
        gas = 8;
        pc = pop();
      }

      // JUMPI
      else if (byte === 0x57) {
        gas = 10;
        const destination = pop();
        if (pop())  pc = destination;
      }

      // PC
      else if (byte === 0x58) {
        gas = 2;
        push(pc);
      }

      // MSIZE
      else if (byte === 0x59) {
        gas = 2;
        // TODO: implementation
      }

      // GAS
      else if (byte === 0x5A) {
        gas = 2;
        // TODO: implementation
      }

      // JUMPDEST
      else if (byte === 0x5B) {
        gas = 1;
        // TODO: implementation
      }
      
      // PUSH
      else if (byte >= 0x60 && byte <= 0x7F) {
        gas = 3;
        const numBytes = (byte - 0x60) + 1;

        const valueBytes: number[] = [];
        for (let i = 0; i < numBytes; i++) {
          valueBytes.push(bytes[Number(++pc)]);
        }

        const value = bufferToBigInt(Buffer.from(valueBytes));

        push(value);
      }
      
      // DUP
      else if (byte >= 0x80 && byte <= 0x8F) {
        gas = 3;
        const offset = byte - 0x80;
        push(stack[stack.length - (1 + offset)]);
      }
      
      // SWAP
      else if (byte >= 0x90 && byte <= 0x9F) {
        gas = 3;
        const offset = (byte - 0x90) + 1;

        const a = pop();

        const keep = [];
        for (let i = 1; i < offset - 1; i++) keep.push(pop());

        const b = pop();

        push(a);

        for (let i = keep.length - 1; i >= 0; i--) push(keep[i]);

        push(b);
      }

      // LOG
      else if (byte >= 0xA0 && byte <= 0xA4) {
        //gas = 375 + 8 * (number of bytes in log data) + 3 * 375;
        // TODO: implementation
      }

      // RETURN
      else if (byte === 0xF3) {
        const offset = pop();
        const length = pop();
        
        result = mread(offset, length);
        break;
      }

      // REVERT
      else if (byte === 0xFD) {
        const offset = pop();
        const length = pop();
        
        const error = mread(offset, length);
        throw new Error(error.toString());
      }

      else {
        throw new Error('Unknown opcode ' + byte.toString(16));
      }

      gasUsed += gas;
    }

    return result;
  }
}