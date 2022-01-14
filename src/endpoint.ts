export interface Endpoint {
  id: Buffer;
  ip: string;
  udpPort: number;
  tcpPort: number;
}

export function parseEnode (url: string): Endpoint {
  const [id, endpoint] = url.replace('enode://', '').split('@');
  const [ip, port] = endpoint.split(':');
  return {
    id: Buffer.from(id, 'hex'),
    ip: ip,
    udpPort: parseInt(port),
    tcpPort: parseInt(port)
  };
}