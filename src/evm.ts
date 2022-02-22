import { Account } from "./account";
import { Block } from "./block";
import { opcodes } from "./opcodes";
import { bigIntToBuffer, bufferToBigInt, keccak256, keccak256Array } from "./util";
import { WorldState } from "./world-state";

const TWO_POW_256 = 2n ** 256n;

type Stack = bigint[];
type Memory = {
  [key: string]: number
};

function uint256(n: bigint): bigint {
  return BigInt.asUintN(256, n);
}

function int256(n: bigint): bigint {
  return BigInt.asIntN(256, n);
}

interface ExecutionInformation {
  account: Buffer; // the address of the account which owns the code that is executing.
  origin: Buffer; // the sender address of the transaction that originated this execution.
  gasPrice: bigint; // the price of gas in the transaction that originated this execution.
  callData: Buffer; // the byte array that is the input data to this execution; if the execution agent is a transaction, this would be the transaction data.
  sender: Buffer; // the address of the account which caused the code to be executing; if the execution agent is a transaction, this would be the transaction sender.
  value: bigint; // the value, in Wei, passed to this account as part of the same procedure as execution; if the execution agent is a transaction, this would be the transaction value.
  code: Buffer; // the byte array that is the machine code to be executed.
  block: Block; // the block header of the present block.
  callDepth: number; // the depth of the present message-call or contract-creation (i.e. the number of CALLs or CREATE(2)s being executed at present).
  canModifyState: boolean; // the permission to make modifications to the state.
}

interface Log {
  logger: Buffer; // address of the logger
  topics: Buffer[]; // 32 byte log topics
  data: Buffer; // log data
}

interface ExecutionSubstate {
  selfDestructSet: Buffer[];
  logSeries: Log[];
  touchedAccounts: Buffer[];
  refundBalance: bigint;
}

export class EVM {

  worldState: WorldState;

  constructor(worldState: WorldState) {
    this.worldState = worldState;
  }

  createAddress(address: Buffer, nonce: Buffer): Buffer {
    const hash = keccak256Array([address, nonce]);
    return hash.slice(-20);
  }

  async getCode(account: Account): Promise<Buffer> {
    return await this.worldState.db.get(account.codeHash());
  }

  async create(code: Buffer, value: bigint): Promise<Buffer> {
    // TODO: implementation
    return Buffer.alloc(0);
  }

  async call(remainingGas: number, substate: ExecutionSubstate, info: ExecutionInformation): Promise<{
    remainingGas: number;
    substate: ExecutionSubstate;
    output: Buffer;
  }> {
    const chainId = 1n;

    const stack: Stack = [];
    const memory: Memory = {};

    let pc = -1;
    let result: Buffer = Buffer.alloc(0);

    const push = (n: bigint) => stack.push(n);
    const pop = () => stack.pop();

    const mread = (offset: bigint, length: bigint): Buffer => {
      const output: number[] = [];

      for (let i = offset; i < offset + length; i++) {
        const key = i.toString(16);
        output.push(key in memory ? memory[key] : 0);
      }

      return Buffer.from(output);
    };

    const mwrite = (offset: bigint, bytes: Buffer, length: bigint) => {
      for (let i = 0; i < length; i++) {
        const key = (offset + BigInt(i)).toString(16);
        memory[key] = i < bytes.length ? bytes[i] : 0;
      }
    };

    while (pc < info.code.length) {
      const byte = info.code[++pc];
      let gas = 0;

      // STOP
      if (byte === opcodes.STOP) {
        break;
      }

      // NUMBER OPERATORS
      else if (byte >= opcodes.ADD && byte <= opcodes.SAR) {
        const a = stack.pop();

        // ISZERO
        if (byte === opcodes.ISZERO) {
          gas = 3;
          push(a == 0n ? 1n : 0n);
        }

        // NOT
        else if (byte === opcodes.NOT) {
          gas = 3;
          push(~a);
        }

        else {
          const b = pop();

          // ADD
          if (byte === opcodes.ADD) {
            gas = 3;
            push((a + b) % TWO_POW_256);
          }

          // MUL
          else if (byte === opcodes.MUL) {
            gas = 5;
            push((a * b) % TWO_POW_256);
          }

          // SUB
          else if (byte === opcodes.SUB) {
            gas = 3;
            push((a - b) % TWO_POW_256);
          }

          // DIV
          else if (byte === opcodes.DIV) {
            gas = 5;
            push(uint256(a) / uint256(b));
          }

          // SDIV
          else if (byte === opcodes.SDIV) {
            gas = 5;
            push(int256(a) / int256(b));
          }

          // MOD
          else if (byte === opcodes.MOD) {
            gas = 5;
            push(uint256(a) % uint256(b));
          }

          // SMOD
          else if (byte === opcodes.SMOD) {
            gas = 5;
            push(int256(a) % int256(b));
          }

          // ADDMOD
          else if (byte === opcodes.ADDMOD) {
            gas = 8;
            const n = pop();
            push((a + b) % n);
          }

          // MULMOD
          else if (byte === opcodes.ADDMOD) {
            gas = 8;
            const n = pop();
            push((a * b) % n);
          }

          // EXP
          else if (byte === opcodes.EXP) {
            // TODO: Gas calculation
            gas = 10; //b == 0n ? 10 : (10 + 10 * (1 + Math.log(b)) / Math.log(256)));
            push((a ** b) % TWO_POW_256);
          }

          // SIGNEXTEND
          else if (byte === opcodes.SIGNEXTEND) {
            // TODO: ???
            gas = 5;
            const sign = (b >> (a * 8n)) && 0b10000000;
            // https://jsbin.com/rekijuqede/edit?js,console
          }

          // LT
          else if (byte === opcodes.LT) {
            gas = 3;
            push(a < b ? 1n : 0n);
          }

          // GT
          else if (byte === opcodes.GT) {
            gas = 3;
            push(a > b ? 1n : 0n);
          }

          // SLT
          else if (byte === opcodes.SLT) {
            gas = 3;
            push(int256(a) < int256(b) ? 1n : 0n);
          }

          // SGT
          else if (byte === opcodes.SGT) {
            gas = 3;
            push(int256(a) > int256(b) ? 1n : 0n);
          }

          // EQ
          else if (byte === opcodes.EQ) {
            gas = 3;
            push(a == b ? 1n : 0n);
          }

          // AND
          else if (byte === opcodes.AND) {
            gas = 3;
            push(a & b);
          }

          // OR
          else if (byte === opcodes.OR) {
            gas = 3;
            push(a | b);
          }

          // XOR
          else if (byte === opcodes.XOR) {
            gas = 3;
            push(a ^ b);
          }

          // BYTE
          else if (byte === opcodes.BYTE) {
            gas = 3;
            push((b >> (248n - a * 8n)) & 0xFFn);
          }

          // SHL
          else if (byte === opcodes.SHL) {
            gas = 3;
            push(b << a);
          }

          // SHR
          else if (byte === opcodes.SHL) {
            gas = 3;
            push(b >> a);
          }

          // SAR
          else if (byte === opcodes.SHL) {
            gas = 3;
            push(int256(b) >> a);
          }

          // SHA3
          else if (byte === opcodes.SHA3) {
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
      else if (byte === opcodes.ADDRESS) {
        gas = 2;
        push(bufferToBigInt(info.account));
      }

      // BALANCE
      else if (byte === opcodes.BALANCE) {
        gas = 400;
        const address = pop();
        const account = await this.worldState.getAccount(bigIntToBuffer(address));
        const balance = account.balance();
        push(balance);
      }

      // ORIGIN
      else if (byte === opcodes.ORIGIN) {
        gas = 2;
        push(bufferToBigInt(info.origin));
      }

      // CALLER
      else if (byte === opcodes.CALLER) {
        gas = 2;
        push(bufferToBigInt(info.sender));
      }

      // CALLVALUE
      else if (byte === opcodes.CALLVALUE) {
        gas = 2;
        push(info.value);
      }

      // CALLDATALOAD
      else if (byte === opcodes.CALLDATALOAD) {
        gas = 3;
        const i = pop();

        const value = bufferToBigInt(info.callData.slice(Number(i), Number(i) + 32));

        push(value);
      }

      // CALLDATASIZE
      else if (byte === opcodes.CALLDATASIZE) {
        gas = 2;
        push(BigInt(info.callData.length / 2));
      }

      // CALLDATACOPY
      else if (byte === opcodes.CALLDATACOPY) {
        const destOffset = pop();
        const offset = pop();
        const length = pop();

        gas = 2 + 3 * Number(length);

        mwrite(destOffset, info.callData.slice(Number(offset), Number(offset) + Number(length)), length);
      }

      // CODESIZE
      else if (byte === opcodes.CODESIZE) {
        gas = 2;
        push(BigInt(info.code.length || 0));
      }

      // CODECOPY
      else if (byte === opcodes.CODECOPY) {
        const destOffset = pop();
        const offset = pop();
        const length = pop();

        gas = 2 + 3 * Number(length);

        mwrite(destOffset, info.code.slice(Number(offset), Number(offset) + Number(length)), length);
      }

      // GASPRICE
      else if (byte === opcodes.GASPRICE) {
        gas = 2;
        push(info.gasPrice);
      }

      // EXTCODESIZE
      else if (byte === opcodes.EXTCODESIZE) {
        gas = 700;
        const address = pop();
        const account = await this.worldState.getAccount(bigIntToBuffer(address));
        const code = await this.getCode(account);
        const size = BigInt(code.length);
        push(size);
      }

      // EXTCODECOPY
      else if (byte === opcodes.EXTCODECOPY) {
        const address = pop();
        const account = await this.worldState.getAccount(bigIntToBuffer(address));
        const code = await this.getCode(account);

        const destOffset = pop();
        const offset = pop();
        const length = pop();

        gas = 700 + 3 * Number(length);

        mwrite(destOffset, code.slice(Number(offset), Number(offset) + Number(length)), length);
      }

      // RETURNDATASIZE
      else if (byte === opcodes.RETURNDATASIZE) {
        // TODO: implementation
      }

      // RETURNDATACOPY
      else if (byte === opcodes.RETURNDATACOPY) {
        // TODO: implementation
      }

      // EXTCODEHASH
      else if (byte === opcodes.EXTCODEHASH) {
        // TODO: implementation
      }

      // BLOCKHASH
      else if (byte === opcodes.BLOCKHASH) {
        gas = 20;
        // TODO: implementation
      }

      // COINBASE
      else if (byte === opcodes.COINBASE) {
        gas = 2;
        push(info.block.coinbase());
      }

      // TIMESTAMP
      else if (byte === opcodes.TIMESTAMP) {
        gas = 2;
        push(info.block.time());
      }

      // NUMBER
      else if (byte === opcodes.NUMBER) {
        gas = 2;
        push(BigInt(info.block.number()));
      }

      // DIFFICULTY 
      else if (byte === opcodes.DIFFICULTY) {
        gas = 2;
        push(info.block.difficulty());
      }

      // GASLIMIT
      else if (byte === opcodes.GASLIMIT) {
        gas = 2;
        push(info.block.gasLimit());
      }

      // CHAINID
      else if (byte === opcodes.CHAINID) {
        gas = 2;
        push(chainId);
      }

      // SELFBALANCE
      else if (byte === opcodes.SELFBALANCE) {
        gas = 2;

        const account = await this.worldState.getAccount(info.account);
        const balance = account.balance();
        push(balance);
      }

      // BASEFEE
      else if (byte === opcodes.BASEFEE) {
        // TODO: implementation
      }

      // POP
      else if (byte === opcodes.POP) {
        gas = 2;
        pop();
      }

      // MLOAD
      else if (byte === opcodes.MLOAD) {
        gas = 3;
        const offset = pop();
        push(bufferToBigInt(mread(offset, 32n)));
      }

      // MSTORE
      else if (byte === opcodes.MSTORE) {
        gas = 3;
        const offset = pop();
        const value = pop();

        mwrite(offset, bigIntToBuffer(value), 32n);
      }

      // MSTORE8
      else if (byte === opcodes.MSTORE8) {
        gas = 3;
        const offset = pop();
        const value = pop();

        mwrite(offset, Buffer.from([Number(value & 0xFFn)]), 1n);
      }

      // SLOAD
      else if (byte === opcodes.SLOAD) {
        gas = 200;
        const key = pop();
        const account = await this.worldState.getAccount(info.account);
        const value = bufferToBigInt(await this.worldState.getStorageAt(account, key))
        push(value);
      }

      // SSTORE
      else if (byte === opcodes.SSTORE) {
        const key = pop();
        const value = pop();

        gas = ((value != 0n) && (key == 0n)) ? 20000 : 5000;

        const account = await this.worldState.getAccount(info.account);
        await this.worldState.putStorageAt(account, key, bigIntToBuffer(value));
      }

      // JUMP
      else if (byte === opcodes.JUMP) {
        gas = 8;
        pc = Number(pop());
      }

      // JUMPI
      else if (byte === opcodes.JUMPI) {
        gas = 10;
        const destination = pop();
        if (pop()) pc = Number(destination);
      }

      // PC
      else if (byte === opcodes.PC) {
        gas = 2;
        push(BigInt(pc));
      }

      // MSIZE
      else if (byte === opcodes.MSIZE) {
        gas = 2;
        // TODO: implementation
      }

      // GAS
      else if (byte === opcodes.GAS) {
        gas = 2;
        // TODO: implementation
      }

      // JUMPDEST
      else if (byte === opcodes.JUMPDEST) {
        gas = 1;
        // TODO: implementation
      }

      // PUSH
      else if (byte >= opcodes.PUSH1 && byte <= opcodes.PUSH32) {
        gas = 3;
        const numBytes = (byte - opcodes.PUSH1) + 1;

        const valueBytes: number[] = [];
        for (let i = 0; i < numBytes; i++) {
          valueBytes.push(info.code[Number(++pc)]);
        }

        const value = bufferToBigInt(Buffer.from(valueBytes));

        push(value);
      }

      // DUP
      else if (byte >= opcodes.DUP1 && byte <= opcodes.DUP16) {
        gas = 3;
        const offset = byte - opcodes.DUP1;
        push(stack[stack.length - (1 + offset)]);
      }

      // SWAP
      else if (byte >= opcodes.SWAP1 && byte <= opcodes.SWAP16) {
        gas = 3;
        const offset = (byte - opcodes.SWAP1) + 1;

        const a = pop();

        const keep = [];
        for (let i = 1; i < offset - 1; i++) keep.push(pop());

        const b = pop();

        push(a);

        for (let i = keep.length - 1; i >= 0; i--) push(keep[i]);

        push(b);
      }

      // LOG
      else if (byte >= opcodes.LOG0 && byte <= opcodes.LOG4) {
        const offset = pop();
        const length = pop();
        const data = mread(offset, length);

        const numTopics = byte - opcodes.LOG0;
        const topics = [];
        for (let i = 0; i < numTopics; i++) topics.push(pop());

        gas = 375 + (8 * data.length) + (numTopics * 375);

        substate.logSeries.push({
          logger: info.account,
          topics: topics,
          data: data
        });
      }

      // CREATE
      else if (byte === opcodes.CREATE) {
        const value = pop();
        const offset = pop();
        const length = pop();

        const code = mread(offset, length);

        const address = await this.create(code, value);
        push(bufferToBigInt(address));

        gas = 32000 + (code.length * 200);
      }

      // CALL
      else if (byte === opcodes.CALL) {
        const callGas = pop();
        const address = bigIntToBuffer(pop());
        const value = pop();
        const argsOffset = pop();
        const argsLength = pop();
        const retOffset = pop();
        const retLength = pop();

        const account = await this.worldState.getAccount(address);

        try {
          const callInfo: ExecutionInformation = {
            account: address,
            origin: info.origin,
            gasPrice: info.gasPrice,
            callData: mread(argsOffset, argsLength),
            sender: info.account,
            value: value,
            code: await this.getCode(account),
            block: info.block,
            callDepth: info.callDepth + 1,
            canModifyState: true
          };

          const result = await this.call(Number(callGas), substate, callInfo);

          mwrite(retOffset, result.output, retLength)

          push(1n);
        } catch {
          push(0n);
        }

        //gas = Number(callGas);
        // TODO: calculate gas the correct way
      }

      // CALLCODE
      else if (byte === opcodes.CALLCODE) {

      }

      // RETURN
      else if (byte === opcodes.RETURN) {
        const offset = pop();
        const length = pop();

        result = mread(offset, length);
        break;
      }

      // DELEGATECALL
      else if (byte === opcodes.DELEGATECALL) {

      }

      // CREATE2
      else if (byte === opcodes.CREATE2) {

      }

      // STATICCALL
      else if (byte === opcodes.STATICCALL) {

      }

      // REVERT
      else if (byte === opcodes.REVERT) {
        const offset = pop();
        const length = pop();

        const error = mread(offset, length);
        throw new Error(error.toString());
      }

      // SELFDESTRUCT
      else if (byte === opcodes.SELFDESTRUCT) {
        substate.selfDestructSet.push(info.account);
      }

      else {
        throw new Error('Unknown opcode ' + byte.toString(16));
      }

      remainingGas -= gas;

      if (remainingGas < 0) throw new Error('Out of gas');
    }

    return {
      remainingGas: remainingGas,
      substate: substate,
      output: result
    };
  }
}