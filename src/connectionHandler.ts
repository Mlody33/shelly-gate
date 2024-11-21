import WebSocket from 'ws';
import type { Logging } from 'homebridge';

export abstract class ConnectionHandler {

  private socket: WebSocket;

  private readonly openHandler = this.handleOpen.bind(this);
  private readonly closeHandler = this.handleClose.bind(this);
  private readonly messageHandler = this.handleMessage.bind(this);
  private readonly errorHandler = this.handleError.bind(this);

  constructor(
    protected readonly hostname: string,
    protected readonly log: Logging,
  ) {
    this.socket = this.openSocket(hostname);
  }

  protected abstract handleMessage(data: Buffer): void;
  protected abstract handleError(): void

  protected async sendMessage(message: string) {
    await this.connect();
    try {
      this.socket.send(message);
    } catch (e) {
      new Promise<void>((resolve, reject) => {
        this.socket.once('close', () => {
          reject(new Error('error connecting'));
        });

        this.socket.once('open', () => {
          resolve();
        });
      });
    }
  }

  private handleOpen() {
    this.log.debug('Handle open socket');
  }

  private handleClose() {
    this.log.debug('Handle close socket');
    this.closeSocket();
  }

  private async connect() {
    switch (this.socket.readyState) {
      case WebSocket.CLOSED:
      case WebSocket.CLOSING: {
        this.log.warn('CLOSED or CLOSING socket');
        this.socket = this.openSocket(this.hostname);
        break;
      }
      case WebSocket.CONNECTING: {
        this.log.warn('CONNECTING socket');
        await this.awaitConnection();
      }
    }
  }

  private awaitConnection(): Promise<void> {
    this.log.warn('Await connection', this.socket.readyState);
    const soc = this.socket;
    if (soc.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    } else if (soc.readyState !== WebSocket.CONNECTING) {
      return Promise.reject(new Error('websocket still not ready'));
    }

    return new Promise((resolve, reject) => {
      soc.once('close', () => {
        reject(new Error('error connecting'));
      });

      soc.once('open', () => {
        resolve();
      });
    });

  }

  private openSocket(hostname: string): WebSocket {
    return new WebSocket(`ws://${hostname}/rpc`)
      .on('open', this.openHandler)
      .on('close', this.closeHandler)
      .on('message', this.messageHandler)
      .on('error', this.errorHandler);
  }

  private closeSocket() {
    this.socket
      .off('open', this.openHandler)
      .off('close', this.closeHandler)
      .off('message', this.messageHandler)
      .off('error', this.errorHandler);
  }

}