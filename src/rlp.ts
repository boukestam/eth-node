export type RLPItem = Buffer | Buffer[];
export type RLPList = RLPItem[];

export function rlpEncode (input: RLPItem | RLPList): Buffer {
  const toBinary = (x: number): Uint8Array => x === 0 ? new Uint8Array() :
    Buffer.concat([
      toBinary(Math.floor(x / 256)), 
      new Uint8Array([x % 256])
    ]);

  const encodeLength = (length: number, offset: number): Uint8Array => {
    if (length < 56) return new Uint8Array([length + offset]);

    const binaryLength = toBinary(length);
    return Buffer.concat([
      new Uint8Array([binaryLength.length + offset + 55]), 
      binaryLength
    ]);
  };

  if (input instanceof Buffer) {
    if (input.length === 1 && input[0] < 0x80) return input;
    return Buffer.concat([encodeLength(input.length, 0x80), input]);
  }

  const output = Buffer.concat(input.map(buffer => rlpEncode(buffer)));
  return Buffer.concat([encodeLength(output.length, 0xc0), output]);
}

export function rlpDecode(input: Buffer): RLPItem {
  return _rlpDecode(input, [])[0];
}

function _rlpDecode(input: Buffer, list: RLPList) {
  while (input.length > 0) {
    const [offset, dataLength, type] = decodeLength(input);
    const data = input.slice(offset, offset + dataLength);

    if (type === 'str') {
      list.push(data);
    } else if (type === 'list') {
      const l = [];
      _rlpDecode(data, l);
      list.push(l);
    }

    input = input.slice(offset + dataLength);
  }

  return list;
}

function decodeLength (input: Buffer) {
  const length = input.length;
  if (length === 0) throw new Error('input is null');

  const prefix = input[0];
  if (prefix <= 0x7f) {
    return [0, 1, 'str'];
  } else if (prefix <= 0xb7 && length > prefix - 0x80) {
    return [1, prefix - 0x80, 'str'];
  } else if (prefix <= 0xbf && length > prefix - 0xb7 && length > prefix - 0xb7 + toInteger(input.slice(1, 1 + prefix - 0xb7))) {
    const lengthOfStringLength = prefix - 0xb7;
    const stringLength = toInteger(input.slice(1, 1 + lengthOfStringLength));
    return [1 + lengthOfStringLength, stringLength, 'str'];
  } else if (prefix <= 0xf7 && length > prefix - 0xc0) {
    return [1, prefix - 0xc0, 'list'];
  } else if (prefix <= 0xff && length > prefix - 0xf7 && length > prefix - 0xf7 + toInteger(input.slice(1, 1 + prefix - 0xf7))) {
    const lengthOfListLength = prefix - 0xf7;
    const listLength = toInteger(input.slice(1, 1 + lengthOfListLength));
    return [1 + lengthOfListLength, listLength, 'list'];
  } else {
    console.log(prefix, length);
    console.log(input.toString('hex'))
    throw new Error('input doesn\'t confirm to RLP encoding form');
  }
}

function toInteger (b: Buffer) {
  const length = b.length;

  if (length === 0) throw new Error('input is null');

  if (length === 1) return b[0];

  return b[length - 1] + toInteger(b.slice(0, length - 1)) * 256;
}