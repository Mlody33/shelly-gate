import type { CharacteristicValue, Logging, PlatformAccessory, Service } from 'homebridge';
import type { ShellyDoorPlatformPlugin } from './platform.js';
import type { DeviceConfig } from './config.js';
import { CommunicationHandler } from './communicationHandler.js';
import { NotifyStatus, SetSwitch, GetStatus, GetDeviceInfo } from './response.js';
import { Utils } from './utils.js';

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

    this.service.getCharacteristic(TargetDoorState)
      .onSet(this.handleTargetDoorStateSet.bind(this));
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
    this.log.info('<< GetDeviceInfo', res.result.id);
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Allterco')
      .setCharacteristic(this.platform.Characteristic.Model, res.result.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, res.result.mac)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, res.result.ver);
  }

  protected handleGetStatus(res: GetStatus): void {
    this.log.info('<< GetStatus', res.result['input:0']);
    Utils.printCurrentStates(this.currentState, this.lastState, this.targetState);

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
        this.lastState = this.CurrentDoorState.OPEN;
        this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
      } else {
        this.log.warn(`${this.deviceConfig.name} should be open but it is still closed`);
        this.lastState = this.CurrentDoorState.CLOSED;
        this.targetState = this.TargetDoorState.CLOSED;
        this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
        if (this.deviceConfig.obstructionDetection) {
          this.service.updateCharacteristic(this.ObstructionDetected, true);
        }
      }

    } else if (this.lastState === this.CurrentDoorState.CLOSING && this.targetState === this.TargetDoorState.CLOSED) {

      if (this.currentState === this.CurrentDoorState.CLOSED) {
        this.log.warn(`Something went wrong with the status update. But ${this.deviceConfig.name} seems to be closed`);
      } else {
        this.log.warn(`${this.deviceConfig.name} should be closed now but it is not`);
        if (this.deviceConfig.obstructionDetection) {
          this.service.updateCharacteristic(this.ObstructionDetected, true);
        }
      }
      this.log.warn(`Consider to extend closingTime [current: ${this.deviceConfig.closeTime}]`);

    } else if (this.targetState === this.lastState) {

      this.log.info(`${this.deviceConfig.name} is in it expected state: ${Utils.translateState(this.lastState)}`);
      if (res.result['input:0'].state) {
        this.lastState = this.CurrentDoorState.OPEN;
        this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
      } else {
        this.lastState = this.CurrentDoorState.CLOSED;
        this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
      }
      this.targetState = this.lastState;

    }
  }

  protected handleNotifyStatus(res: NotifyStatus): void {
    Utils.printCurrentStates(this.currentState, this.lastState, this.targetState);
    if (res.params['input:0']?.state === true) {
      this.log.info('received event that gate is not closed anymore');
      this.currentState = this.CurrentDoorState.OPEN;
      if (this.lastState === this.CurrentDoorState.OPENING && this.targetState === this.TargetDoorState.OPEN) {
        this.log.info(`${this.deviceConfig.name} opening...`);
      } else {
        this.log.warn(`${this.deviceConfig.name} opening... triggered by external device`);
        this.targetState = this.TargetDoorState.OPEN;
        this.lastState = this.CurrentDoorState.OPEN;
        this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
        this.service.updateCharacteristic(this.TargetDoorState, this.TargetDoorState.OPEN);
      }
    } else if (res.params['input:0']?.state === false) {
      this.log.info('received event that gate has been closed');
      this.currentState = this.CurrentDoorState.CLOSED;
      if (this.lastState === this.CurrentDoorState.CLOSING && this.targetState === this.TargetDoorState.CLOSED) {
        this.log.info(`${this.deviceConfig.name} closed`);
        this.service.updateCharacteristic(this.ObstructionDetected, false);
      } else if (this.lastState === this.CurrentDoorState.OPENING && this.targetState === this.TargetDoorState.OPEN) {
        this.log.warn(`${this.deviceConfig.name} was openning but for some reason has been closed`);
        if (this.deviceConfig.obstructionDetection) {
          this.service.updateCharacteristic(this.ObstructionDetected, true);
        }
      } else {
        this.log.info(`${this.deviceConfig.name} closed... triggered by external device`);
      }
      this.targetState = this.TargetDoorState.CLOSED;
      this.lastState = this.CurrentDoorState.CLOSED;
      this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
      this.service.updateCharacteristic(this.TargetDoorState, this.TargetDoorState.CLOSED);
    } else {
      this.log.info('received other events');
      if (res.params['switch:0']?.output === true) {
        this.log.info(`${this.deviceConfig.name} switch activated`);
      } else if (res.params['switch:0']?.output === false) {
        this.log.info(`${this.deviceConfig.name} switch deactivated`);
      } else {
        this.log.info('received event that is not implemented', res.params);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected handleSet(res: SetSwitch): void { }

  handleTargetDoorStateSet(targetValue: CharacteristicValue) {
    this.log.info(`Triggered SET TargetDoorState; targetValue=${Utils.translateState(targetValue)}, lastState=${Utils.translateState(this.lastState)}`);
    Utils.printCurrentStates(this.currentState, this.lastState, this.targetState);

    if (targetValue === this.TargetDoorState.OPEN && this.lastState === this.CurrentDoorState.CLOSED) {

      this.sendSet();
      this.log.info(`Triggered ${this.deviceConfig.name} to open [${this.deviceConfig.openTime}]s`);
      this.targetState = targetValue;
      this.lastState = this.CurrentDoorState.OPENING;
      this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPENING);

      setTimeout(() => {
        this.sendGetStatus();
      }, this.deviceConfig.openTime * 1000);

    } else if (targetValue === this.TargetDoorState.CLOSED && this.lastState === this.CurrentDoorState.OPEN) {
      this.sendSet();
      this.log.info(`Trigger ${this.deviceConfig.name} to close: [${this.deviceConfig.closeTime}]s`);
      this.targetState = targetValue;
      this.lastState = this.CurrentDoorState.CLOSING;
      this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSING);

      setTimeout(() => {
        this.sendGetStatus();
      }, this.deviceConfig.closeTime * 1000);

    } else if (this.lastState === this.CurrentDoorState.CLOSING || this.lastState === this.CurrentDoorState.OPENING) {
      this.sendSet();
      this.lastState = this.CurrentDoorState.STOPPED;
      this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.STOPPED);
    } else if (
      (targetValue === this.TargetDoorState.OPEN && this.lastState === this.CurrentDoorState.OPEN) ||
      (targetValue === this.TargetDoorState.CLOSED && this.lastState === this.CurrentDoorState.CLOSED)
    ) {
      this.log.warn(`${this.deviceConfig.name} is already ${Utils.translateState(targetValue)}`);
      this.targetState = this.currentState;
    } else if (targetValue === this.TargetDoorState.OPEN && this.lastState === this.CurrentDoorState.STOPPED) {
      this.sendSet();

      this.targetState = this.TargetDoorState.OPEN;
      this.lastState = this.CurrentDoorState.OPENING;
      this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPENING);

      setTimeout(() => {
        this.sendGetStatus();
      }, this.deviceConfig.openTime * 1000);

    } else if (targetValue === this.TargetDoorState.CLOSED && this.lastState === this.CurrentDoorState.STOPPED) {
      this.sendSet();
      this.targetState = this.TargetDoorState.CLOSED;
      this.lastState = this.CurrentDoorState.CLOSING;
      this.service.updateCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSING);
    }

  }

}
