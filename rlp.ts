export type RLPInputList = (Buffer | Buffer[])[];

export function rlpEncode (input: Buffer | RLPInputList): Buffer {
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