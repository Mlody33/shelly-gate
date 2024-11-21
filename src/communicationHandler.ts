import type { Logging } from 'homebridge';
import { ConnectionHandler } from './connectionHandler.js';
import type { DeviceConfig } from './config.js';
import { NotifyStatus, SetSwitch, GetStatus, GetDeviceInfo } from './response.js';

enum ShellyMethod {
  GetDeviceInfo = 'Shelly.GetDeviceInfo',
  GetStatus = 'Shelly.GetStatus',
  SwitchSet = 'Switch.Set',
}

export abstract class CommunicationHandler extends ConnectionHandler {

  constructor(
    protected readonly deviceConfig: DeviceConfig,
    protected readonly log: Logging,
  ) {
    super(deviceConfig.hostname, log);
  }

  protected abstract handleGetDeviceInfo(res: GetDeviceInfo): void
  protected abstract handleGetStatus(res: GetStatus): void
  protected abstract handleSet(res: SetSwitch): void
  protected abstract handleNotifyStatus(res: NotifyStatus): void

  protected async sendGetDeviceInfo() {
    this.log.debug('>> GetDeviceInfo');
    await this.send(ShellyMethod.GetDeviceInfo);
  }

  protected async sendGetStatus() {
    this.log.debug('>> GetStatus');
    return await this.send(ShellyMethod.GetStatus);
  }

  protected async sendSet() {
    this.log.debug('>> Set');
    // return await this.send(ShellyMethod.SwitchSet);
  }

  async handleMessage(data: Buffer) {
    const response = JSON.parse(data.toString());
    // this.log.debug('<< RES ', response);

    if (response.id) {
      if ('name' in response.result) {
        this.handleGetDeviceInfo(response as GetDeviceInfo);
      } else if ('sys' in response.result) {
        this.handleGetStatus(response as GetStatus);
      } else if ('was_on' in response.result) {
        this.handleSet(response as SetSwitch);
      }
    } else if (response.method) {
      this.handleNotifyStatus(response as NotifyStatus);
    }

  }

  protected handleError(): void {
    this.log.debug('Handle error');
  }

  private async send(method: ShellyMethod) {
    switch (method) {
      case ShellyMethod.GetDeviceInfo:
      case ShellyMethod.GetStatus: {
        const message = JSON.stringify({ id: 2, src: this.deviceConfig.name, method: method });
        this.log.debug('msg', message);
        this.sendMessage(message);
        break;
      }
      case ShellyMethod.SwitchSet: {
        const message = JSON.stringify({ id: 2, src: this.deviceConfig.name, method: method, params: { id: 0, on: true } });
        this.sendMessage(message);
        break;
      }
    }
  }

}