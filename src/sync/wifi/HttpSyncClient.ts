import TcpSocket from 'react-native-tcp-socket';
import type {VectorClock} from '../crdt/VectorClock';
import type {SyncOperation} from '../../models/SyncOperation';
import {getLocalUser} from '../../db/queries/userQueries';

interface SyncResponse {
  status: number;
  body: any;
}

export class HttpSyncClient {
  private async makeRequest(
    ip: string,
    port: number,
    method: string,
    path: string,
    body?: any,
  ): Promise<SyncResponse> {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : '';
      const request = [
        `${method} ${path} HTTP/1.1`,
        `Host: ${ip}:${port}`,
        'Content-Type: application/json',
        `Content-Length: ${Buffer.byteLength(bodyStr)}`,
        'Connection: close',
        '',
        bodyStr,
      ].join('\r\n');

      let responseData = '';
      let timedOut = false;
      const socket = TcpSocket.createConnection({host: ip, port}, () => {
        socket.write(request);
      });

      // Timeout after 10 seconds
      const timer = setTimeout(() => {
        timedOut = true;
        socket.destroy();
        reject(new Error('Connection timeout'));
      }, 10000);

      socket.on('data', (chunk: string | Buffer) => {
        responseData += chunk.toString();
      });

      socket.on('close', () => {
        if (timedOut) return;
        clearTimeout(timer);
        try {
          const headerEnd = responseData.indexOf('\r\n\r\n');
          const statusLine = responseData.substring(0, responseData.indexOf('\r\n'));
          const status = parseInt(statusLine.split(' ')[1], 10);
          const bodyPart = responseData.substring(headerEnd + 4);
          resolve({status, body: JSON.parse(bodyPart)});
        } catch (e) {
          reject(new Error('Invalid response'));
        }
      });

      socket.on('error', (err: Error) => {
        if (timedOut) return;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async ping(ip: string, port: number): Promise<boolean> {
    try {
      const res = await this.makeRequest(ip, port, 'GET', '/sync/ping');
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async handshake(
    ip: string,
    port: number,
    myPhone: string,
    myVectorClock: VectorClock,
  ): Promise<{phone: string; vectorClock: VectorClock}> {
    const res = await this.makeRequest(ip, port, 'POST', '/sync/handshake', {
      phone: myPhone,
      vectorClock: myVectorClock,
    });
    return res.body;
  }

  async pull(
    ip: string,
    port: number,
    vectorClock: VectorClock,
  ): Promise<SyncOperation[]> {
    const senderPhone = getLocalUser()?.phone_number || '';
    const res = await this.makeRequest(ip, port, 'POST', '/sync/pull', {vectorClock, senderPhone});
    return res.body.operations || [];
  }

  async push(
    ip: string,
    port: number,
    operations: SyncOperation[],
  ): Promise<{accepted: number; rejected: number}> {
    const senderPhone = getLocalUser()?.phone_number || '';
    const res = await this.makeRequest(ip, port, 'POST', '/sync/push', {operations, senderPhone});
    return res.body;
  }
}
