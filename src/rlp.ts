import * as rlp from 'rlp';

export function rlpEncode (data: rlp.Input): Buffer {
  return rlp.encode(data);
}

export function rlpDecode (data: Buffer, stream: boolean = false): any {
  return rlp.decode(data, stream);
}