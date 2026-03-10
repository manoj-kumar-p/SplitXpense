import TcpSocket from 'react-native-tcp-socket';
import {SYNC_PORT} from '../../constants/syncConstants';
import {CRDTEngine} from '../crdt/CRDTEngine';
import {getVectorClock, updateVectorClock} from '../../db/queries/syncQueries';
import {getLocalUser} from '../../db/queries/userQueries';
import type {VectorClock} from '../crdt/VectorClock';
import type {SyncOperation} from '../../models/SyncOperation';

interface ParsedRequest {
  method: string;
  path: string;
  body: string;
}

export class HttpSyncServer {
  private server: any = null;
  private crdtEngine: CRDTEngine;

  constructor(crdtEngine: CRDTEngine) {
    this.crdtEngine = crdtEngine;
  }

  async start(): Promise<void> {
    this.server = TcpSocket.createServer((socket: any) => {
      let data = '';

      socket.on('data', (chunk: Buffer) => {
        data += chunk.toString();

        // Check if we have a complete HTTP request
        if (data.includes('\r\n\r\n')) {
          const request = this.parseRequest(data);
          const response = this.handleRequest(request);
          socket.write(this.formatResponse(response.status, response.body));
          socket.destroy();
        }
      });

      socket.on('error', () => {
        // Ignore socket errors
      });
    });

    this.server.listen({port: SYNC_PORT, host: '0.0.0.0'});
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private parseRequest(raw: string): ParsedRequest {
    const headerEnd = raw.indexOf('\r\n\r\n');
    const headerPart = raw.substring(0, headerEnd);
    const body = raw.substring(headerEnd + 4);
    const firstLine = headerPart.split('\r\n')[0];
    const [method, path] = firstLine.split(' ');

    return {method: method || 'GET', path: path || '/', body};
  }

  private handleRequest(req: ParsedRequest): {status: number; body: string} {
    try {
      if (req.path === '/sync/ping' && req.method === 'GET') {
        return this.handlePing();
      }
      if (req.path === '/sync/handshake' && req.method === 'POST') {
        return this.handleHandshake(req.body);
      }
      if (req.path === '/sync/pull' && req.method === 'POST') {
        return this.handlePull(req.body);
      }
      if (req.path === '/sync/push' && req.method === 'POST') {
        return this.handlePush(req.body);
      }
      return {status: 404, body: JSON.stringify({error: 'Not found'})};
    } catch (error: any) {
      return {status: 500, body: JSON.stringify({error: error.message})};
    }
  }

  private handlePing(): {status: number; body: string} {
    const user = getLocalUser();
    return {
      status: 200,
      body: JSON.stringify({
        status: 'ok',
        phone: user?.phone_number,
        timestamp: new Date().toISOString(),
      }),
    };
  }

  private handleHandshake(body: string): {status: number; body: string} {
    const {phone, vectorClock}: {phone: string; vectorClock: VectorClock} = JSON.parse(body);
    const user = getLocalUser();
    if (!user) return {status: 500, body: JSON.stringify({error: 'Not set up'})};

    const myVectorClock = getVectorClock(phone);

    return {
      status: 200,
      body: JSON.stringify({
        phone: user.phone_number,
        vectorClock: myVectorClock,
      }),
    };
  }

  private handlePull(body: string): {status: number; body: string} {
    const {vectorClock}: {vectorClock: VectorClock} = JSON.parse(body);
    const operations = this.crdtEngine.getDeltasSince(vectorClock);

    return {
      status: 200,
      body: JSON.stringify({operations}),
    };
  }

  private handlePush(body: string): {status: number; body: string} {
    const {operations}: {operations: SyncOperation[]} = JSON.parse(body);
    let accepted = 0;
    let rejected = 0;

    for (const op of operations) {
      const applied = this.crdtEngine.applyRemote(op);
      if (applied) accepted++;
      else rejected++;
    }

    return {
      status: 200,
      body: JSON.stringify({accepted, rejected}),
    };
  }

  private formatResponse(status: number, body: string): string {
    const statusText = status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error';
    return [
      `HTTP/1.1 ${status} ${statusText}`,
      'Content-Type: application/json',
      `Content-Length: ${Buffer.byteLength(body)}`,
      'Connection: close',
      '',
      body,
    ].join('\r\n');
  }
}
