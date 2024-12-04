import type { CharacteristicValue, Logging, PlatformAccessory, Service } from 'homebridge';
import type { ShellyDoorPlatformPlugin } from './platform.js';
import type { DeviceConfig } from './config.js';
import { CommunicationHandler } from './communicationHandler.js';
import { NotifyStatus, SetSwitch, GetStatus, GetDeviceInfo } from './response.js';

export class DrivewayGateAccessory extends CommunicationHandler {

  private service: Service;

  constructor(
    private readonly platform: ShellyDoorPlatformPlugin,
    private readonly accessory: PlatformAccessory,
    public readonly deviceConfig: DeviceConfig,
    public readonly log: Logging,
    private readonly CurrentDoorState = platform.Characteristic.CurrentDoorState,
    private readonly TargetDoorState = platform.Characteristic.TargetDoorState,
    private readonly ObstructionDetected = platform.Characteristic.ObstructionDetected,
  ) {
    super(deviceConfig, log);
    this.sendGetDeviceInfo();
    this.sendGetStatus();

    this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener) || this.accessory.addService(this.platform.Service.GarageDoorOpener);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    this.service.getCharacteristic(CurrentDoorState)
      .onGet(this.handleCurrentDoorStateGet.bind(this))
      .onSet(this.handleCurrentDoorStateSet.bind(this));

    this.service.getCharacteristic(TargetDoorState)
      .onGet(this.handleTargetDoorStateGet.bind(this))
      .onSet(this.handleTargetDoorStateSet.bind(this));

    this.service.getCharacteristic(ObstructionDetected)
      .onGet(this.handleObstructionDetectedGet.bind(this))
      .onSet(this.handleObstructionDetectedSet.bind(this));
  }

  private get currentState(): number {
    return this.accessory.context.currentState;
  }

  private set currentState(value: number) {
    this.accessory.context.currentState = value;
  }

  private get lastState(): number {
    return this.accessory.context.lastState;
  }

  private set lastState(value: number) {
    this.accessory.context.lastState = value;
  }

  private get targetState(): number {
    return this.accessory.context.targetState;
  }

  private set targetState(value: number) {
    this.accessory.context.targetState = value;
  }

  private get obstructionDetected(): boolean {
    return this.accessory.context.obstruction;
  }

  private set obstructionDetected(value: boolean) {
    this.accessory.context.obstruction = value;
  }

  protected async handleGetDeviceInfo(res: GetDeviceInfo): Promise<void> {
    this.log.debug('<< GetDeviceInfo', res.result.id);
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Allterco')
      .setCharacteristic(this.platform.Characteristic.Model, res.result.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, res.result.mac)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, res.result.ver);
  }

  protected handleGetStatus(res: GetStatus): void {
    this.log.debug('<< GetStatus', res.result['input:0']);
    this.printCurrentStates();

    if (typeof this.obstructionDetected === 'undefined' || typeof this.lastState === 'undefined' || typeof this.targetState === 'undefined') {

      if (typeof this.obstructionDetected === 'undefined') {
        this.obstructionDetected = false;
      }
      if (typeof this.lastState === 'undefined') {
        if (res.result['input:0'].state) {
          this.currentState = this.CurrentDoorState.OPEN;
          this.lastState = this.CurrentDoorState.OPEN;
        } else {
          this.currentState = this.CurrentDoorState.CLOSED;
          this.lastState = this.CurrentDoorState.CLOSED;
        }
      }
      if (typeof this.targetState === 'undefined') {
        if (this.lastState) {
          this.targetState = this.TargetDoorState.OPEN;
        } else {
          this.targetState = this.TargetDoorState.CLOSED;
        }
      }

    } else if (this.lastState === this.CurrentDoorState.OPENING && this.targetState === this.TargetDoorState.OPEN) {

      if (this.currentState === this.CurrentDoorState.OPEN) {
        this.log.info(`${this.deviceConfig.name} should be open now`);
        this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
      } else {
        this.log.warn(`${this.deviceConfig.name} should be open but it is still closed`);
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
        this.service.setCharacteristic(this.ObstructionDetected, true);
      }

    } else if (this.lastState === this.CurrentDoorState.CLOSING && this.targetState === this.TargetDoorState.CLOSED) {

      if (this.currentState === this.CurrentDoorState.CLOSED) {
        this.log.warn(`Something went wrong with the status update. But ${this.deviceConfig.name} seems to be closed`);
      } else {
        this.log.warn(`${this.deviceConfig.name} should be closed now but it is not. Consider to extend closingTime [current: ${this.deviceConfig.closeTime}]`);
        this.service.setCharacteristic(this.ObstructionDetected, true);
      }

    } else if (this.targetState === this.lastState) {

      this.log.debug(`${this.deviceConfig.name} is in it expected state. Updating states`);
      if (res.result['input:0'].state) {
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
      } else {
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
      }
      this.targetState = this.lastState;

    }
  }


  protected handleNotifyStatus(res: NotifyStatus): void {
    this.log.debug('<< NotifyStatus', res.params);
    this.printCurrentStates();

    if (res.params['input:0']?.state === true) {
      this.log.debug('received event that gate is not closed anymore');
      this.currentState = this.CurrentDoorState.OPEN;
      if (this.lastState === this.CurrentDoorState.OPENING && this.targetState === this.TargetDoorState.OPEN) {
        this.log.info(`${this.deviceConfig.name} opening...`);
      } else {
        this.log.warn(`${this.deviceConfig.name} opening... triggered by external device`);
        this.targetState = this.TargetDoorState.OPEN;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
        this.service.updateCharacteristic(this.TargetDoorState, this.TargetDoorState.OPEN);
      }
    } else if (res.params['input:0']?.state === false) {
      this.log.debug('received event that gate has been closed');
      this.currentState = this.CurrentDoorState.CLOSED;
      if (this.lastState === this.CurrentDoorState.CLOSING && this.targetState === this.TargetDoorState.CLOSED) {
        this.log.info(`${this.deviceConfig.name} closed`);
        this.service.setCharacteristic(this.ObstructionDetected, false);
      } else if (this.lastState === this.CurrentDoorState.OPENING && this.targetState === this.TargetDoorState.OPEN) {
        this.log.warn(`${this.deviceConfig.name} was openning but for some reason has been closed`);
        this.service.setCharacteristic(this.ObstructionDetected, true);
      } else {
        this.log.info(`${this.deviceConfig.name} closed... triggered by external device`);
      }
      this.targetState = this.TargetDoorState.CLOSED;
      this.lastState = this.CurrentDoorState.CLOSED;
      this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
      this.service.updateCharacteristic(this.TargetDoorState, this.TargetDoorState.CLOSED);
    } else {
      this.log.debug('received other events that are not implemented for now');
      if (res.params['switch:0']?.output === true) {
        this.log.debug('shelly switch state changed');
      }
    }

  }

  protected handleSet(res: SetSwitch): void {
    this.log.debug('Gate switch changed', res);
  }

  handleCurrentDoorStateGet() {
    this.log.debug('Triggered GET CurrentDoorState', this.translateState(this.lastState));
    return this.lastState;
  }

  handleCurrentDoorStateSet(currentState: CharacteristicValue) {
    this.log.info('Triggered SET CurrentDoorState', this.translateState(currentState));
    this.lastState = currentState as number;
  }

  handleTargetDoorStateGet() {
    this.log.debug('Triggered GET TargetDoorState', this.translateState(this.targetState));
    return this.targetState;
  }

  handleObstructionDetectedGet() {
    this.log.debug('Triggered GET ObstructionDetected', this.obstructionDetected);
    return this.obstructionDetected;
  }

  handleObstructionDetectedSet(obstructionValue: CharacteristicValue) {
    this.log.info('Triggered SET ObstructionDetected', obstructionValue);
    this.obstructionDetected = obstructionValue as boolean;
  }

  handleTargetDoorStateSet(targetValue: CharacteristicValue) {
    this.log.info('Triggered SET TargetDoorState:', this.translateState(targetValue));
    this.printCurrentStates();

    if (targetValue === this.TargetDoorState.OPEN) {
      if (this.lastState === this.CurrentDoorState.CLOSED) {
        this.sendSet();
        this.log.debug(`Trigger ${this.deviceConfig.name} to open: [${this.deviceConfig.openTime}]s`);
        this.targetState = targetValue;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPENING);

        setTimeout(() => {
          this.sendGetStatus();
        }, this.deviceConfig.openTime * 1000);

      } else if (this.lastState === this.CurrentDoorState.CLOSING) {
        this.sendSet();
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.STOPPED);
      } else if (this.lastState === this.CurrentDoorState.OPENING) {
        this.sendSet();
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.STOPPED);
      } else if (this.lastState === this.CurrentDoorState.OPEN) {
        this.log.warn('Gate is alreaady open');
        this.targetState = this.currentState;
      } else if (this.lastState === this.CurrentDoorState.STOPPED) {
        this.sendSet();
        if (this.targetState === this.TargetDoorState.CLOSED) {
          this.targetState = this.TargetDoorState.OPEN;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPENING);

          setTimeout(() => {
            this.sendGetStatus();
          }, this.deviceConfig.openTime * 1000);

        } else if (this.targetState === this.TargetDoorState.OPEN) {
          this.targetState = this.TargetDoorState.CLOSED;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSING);
        }
      }

    } else if (targetValue === this.TargetDoorState.CLOSED) {
      if (this.lastState === this.CurrentDoorState.OPEN) {
        this.sendSet();
        this.log.debug(`Trigger ${this.deviceConfig.name} to close: [${this.deviceConfig.closeTime}]s`);
        this.targetState = targetValue;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSING);

        setTimeout(() => {
          this.sendGetStatus();
        }, this.deviceConfig.closeTime * 1000);

      } else if (this.lastState === this.CurrentDoorState.OPENING) {
        this.sendSet();
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.STOPPED);
      } else if (this.lastState === this.CurrentDoorState.CLOSING) {
        this.sendSet();
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.STOPPED);
      } else if (this.lastState === this.CurrentDoorState.CLOSED) {
        this.log.warn('Gate is alreaady closed');
        this.targetState = this.currentState;
      } else if (this.lastState === this.CurrentDoorState.STOPPED) {
        this.sendSet();
        if (this.targetState === this.TargetDoorState.CLOSED) {
          this.targetState = this.TargetDoorState.OPEN;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPENING);

          setTimeout(() => {
            this.sendGetStatus();
          }, this.deviceConfig.openTime * 1000);

        } else if (this.targetState === this.TargetDoorState.OPEN) {
          this.targetState = this.TargetDoorState.CLOSED;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSING);
        }
      }
    }
  }

  printCurrentStates() {
    // eslint-disable-next-line max-len
    this.log.debug(`[CURRENT=${this.translateState(this.currentState)}] [LAST=${this.translateState(this.lastState)}] [TARGET=${this.translateState(this.targetState)}]`);
  }

  translateState(state: CharacteristicValue): string {
    switch (state) {
      case 0:
        return 'OPEN';
      case 1:
        return 'CLOSED';
      case 2:
        return 'OPENING';
      case 3:
        return 'CLOSING';
      case 4:
        return 'STOPPED';
      default:
        return 'undefined';
    }
  }

}
