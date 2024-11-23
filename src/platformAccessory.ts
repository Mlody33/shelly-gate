import type { CharacteristicValue, Logging, PlatformAccessory, Service } from 'homebridge';
import type { DrivewayGatePlatformPlugin } from './platform.js';
import type { DeviceConfig } from './config.js';
import { CommunicationHandler } from './communicationHandler.js';
import { NotifyStatus, SetSwitch, GetStatus, GetDeviceInfo } from './response.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */

export class DrivewayGateAccessory extends CommunicationHandler {

  private service: Service;

  constructor(
    private readonly platform: DrivewayGatePlatformPlugin,
    private readonly accessory: PlatformAccessory,
    public readonly deviceConfig: DeviceConfig,
    public readonly log: Logging,
    private readonly CurrentDoorState = platform.Characteristic.CurrentDoorState,
    private readonly TargetDoorState = platform.Characteristic.TargetDoorState,
  ) {
    super(deviceConfig, log);
    this.sendGetDeviceInfo();
    this.sendGetStatus();

    this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener) || this.accessory.addService(this.platform.Service.GarageDoorOpener);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    this.service.getCharacteristic(CurrentDoorState)
      .onGet(this.handleCurrentDoorStateGet.bind(this));

    this.service.getCharacteristic(TargetDoorState)
      .onGet(this.handleTargetDoorStateGet.bind(this))
      .onSet(this.handleTargetDoorStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.ObstructionDetected)
      .onGet(this.handleObstructionDetectedGet.bind(this));
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

  private get obstructionDetected(): number {
    return this.accessory.context.obstruction;
  }

  private set obstructionDetected(value: number) {
    this.accessory.context.obstruction = value;
  }

  protected async handleGetDeviceInfo(res: GetDeviceInfo): Promise<void> {
    this.log.debug('<< GetDeviceInfo', res.result.id);
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Shelly Plus 1')
      .setCharacteristic(this.platform.Characteristic.Model, res.result.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, res.result.mac)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, res.result.ver);
  }

  protected handleGetStatus(res: GetStatus): void {
    this.log.debug('<< GetStatus', res.result['input:0']);

    if (typeof this.obstructionDetected === 'undefined') {
      this.obstructionDetected = 0;
    }
    if (typeof this.lastState === 'undefined' || typeof this.targetState === 'undefined') {
      this.log.debug('lastState | targetState === undefined');
      if (res.result['input:0'].state) {
        this.currentState = this.CurrentDoorState.OPEN;
        this.lastState = this.CurrentDoorState.OPEN;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
      } else {
        this.currentState = this.CurrentDoorState.CLOSED;
        this.lastState = this.CurrentDoorState.CLOSED;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
      }

      this.targetState = this.lastState;

    } else {


      if (this.lastState === this.CurrentDoorState.OPENING && this.targetState === this.TargetDoorState.OPEN) {

        this.log.info('The gate should be opened');
        if (this.currentState === this.CurrentDoorState.OPEN) {
          this.lastState = this.CurrentDoorState.OPEN;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
        } else {
          this.log.warn('Gate should be open but it looks like is still closed');
          this.obstructionDetected = 1;
          this.service.setCharacteristic(this.platform.Characteristic.ObstructionDetected, 1);
          this.lastState = this.CurrentDoorState.CLOSED;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
        }

      } else if (this.lastState === this.CurrentDoorState.CLOSING && this.targetState === this.TargetDoorState.CLOSED) {

        if (this.currentState === this.CurrentDoorState.CLOSED) {
          this.log.warn('WRONG');
        } else {
          this.log.warn('The gate should be closed now. Consider to extend closingTime', this.deviceConfig.closeTime);
          this.obstructionDetected = 1;
          this.service.setCharacteristic(this.platform.Characteristic.ObstructionDetected, 1);
          // this.lastState = this.CurrentDoorState.OPEN;
          // this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
        }
        
      } else if (this.targetState === this.lastState) {

        this.log.debug('Gate is in it expected state. Update its value');
        if (res.result['input:0'].state) {
          this.lastState = this.CurrentDoorState.OPEN;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
        } else if (!res.result['input:0'].state) {
          this.lastState = this.CurrentDoorState.CLOSED;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
        }
        this.targetState = this.lastState;

      }
    }
  }

  protected handleNotifyStatus(res: NotifyStatus): void {
    this.log.debug('<< NotifyStatus', res);

    if (res.params['input:0']?.state === true) {
      this.log.debug('received event that gate is not closed anymore');
      this.currentState = this.CurrentDoorState.OPEN;
      if (this.lastState === this.CurrentDoorState.OPENING && this.targetState === this.TargetDoorState.OPEN) {
        this.log.debug('Gate opening...');
      } else {
        this.log.warn('Change state trigerred by others device');
        this.lastState = this.CurrentDoorState.OPEN;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
      }
    } else if (res.params['input:0']?.state === false) {
      this.log.debug('received event that gate has been closed');
      this.currentState = this.CurrentDoorState.CLOSED;
      if (this.lastState === this.CurrentDoorState.CLOSING && this.targetState === this.TargetDoorState.CLOSED) {
        this.log.info('Gate closed');
      } else {
        this.log.info('Gate closed triggered by other devices');
        this.targetState = this.TargetDoorState.CLOSED;
      }
      this.lastState = this.CurrentDoorState.CLOSED;
      this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
    } else {
      this.log.debug('Other events that Im not interested right now');
    }

  }

  protected handleSet(res: SetSwitch): void {
    this.log('Gate switch changed', res);
  }

  handleCurrentDoorStateGet() {
    this.log.debug('Triggered GET CurrentDoorState', this.translateState(this.lastState));
    return this.lastState;
  }

  handleTargetDoorStateGet() {
    this.log.debug('Triggered GET TargetDoorState', this.translateState(this.targetState));
    return this.targetState;
  }

  handleObstructionDetectedGet() {
    this.log.debug('Triggered GET ObstructionDetected');
    return this.obstructionDetected;
  }

  handleTargetDoorStateSet(targetValue: CharacteristicValue) {
    this.log.info('Triggered SET TargetDoorState:', this.translateState(targetValue));

    if (targetValue === this.TargetDoorState.OPEN) {
      if (this.lastState === this.CurrentDoorState.CLOSED) {
        this.sendSet();
        this.log.debug(`Trigger gate to open: [${this.deviceConfig.openTime}]s`);
        this.targetState = targetValue;
        this.lastState = this.CurrentDoorState.OPENING;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPENING);

        setTimeout(() => {
          this.log.debug('Gate should be open now');
          this.sendGetStatus();
        }, this.deviceConfig.openTime * 1000);

      } else if (this.lastState === this.CurrentDoorState.CLOSING) {
        this.sendSet();
        this.lastState = this.CurrentDoorState.STOPPED;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.STOPPED);
      } else if (this.lastState === this.CurrentDoorState.OPENING) {
        this.sendSet();
        this.lastState = this.CurrentDoorState.STOPPED;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.STOPPED);
      } else if (this.lastState === this.CurrentDoorState.OPEN) {
        this.log.warn('Gate is alreaady open');
        this.targetState = this.currentState;
      } else if (this.lastState === this.CurrentDoorState.STOPPED) {
        this.sendSet();
        if (this.targetState === this.TargetDoorState.CLOSED) {
          this.lastState = this.CurrentDoorState.OPENING;
          this.targetState = this.TargetDoorState.OPEN;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPENING);
          setTimeout(() => {
            this.log.debug('Gate should be open now after stop operation');
            this.sendGetStatus();
          }, this.deviceConfig.openTime * 1000);
        } else if (this.targetState === this.TargetDoorState.OPEN) {
          this.lastState = this.CurrentDoorState.CLOSING;
          this.targetState = this.TargetDoorState.CLOSED;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSING);
        }
      }

    } else if (targetValue === this.TargetDoorState.CLOSED) {
      if (this.lastState === this.CurrentDoorState.OPEN) {
        this.sendSet();
        this.log.debug(`Trigger gate to close: [${this.deviceConfig.closeTime}]s`);
        this.targetState = targetValue;
        this.lastState = this.CurrentDoorState.CLOSING;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSING);

        setTimeout(() => {
          this.log.debug('Gate should be closed now');
          this.sendGetStatus();
        }, this.deviceConfig.closeTime * 1000);

      } else if (this.lastState === this.CurrentDoorState.OPENING) {
        this.sendSet();
        this.lastState = this.CurrentDoorState.STOPPED;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.STOPPED);
      } else if (this.lastState === this.CurrentDoorState.CLOSING) {
        this.sendSet();
        this.lastState = this.CurrentDoorState.STOPPED;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.STOPPED);
      } else if (this.lastState === this.CurrentDoorState.CLOSED) {
        this.log.warn('Gate is alreaady closed');
        this.targetState = this.currentState;
      } else if (this.lastState === this.CurrentDoorState.STOPPED) {
        this.sendSet();
        if (this.targetState === this.TargetDoorState.CLOSED) {
          this.lastState = this.CurrentDoorState.OPENING;
          this.targetState = this.TargetDoorState.OPEN;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPENING);
          setTimeout(() => {
            this.log.debug('Gate should be open now after stop operation');
            this.sendGetStatus();
          }, this.deviceConfig.openTime * 1000);
        } else if (this.targetState === this.TargetDoorState.OPEN) {
          this.lastState = this.CurrentDoorState.CLOSING;
          this.targetState = this.TargetDoorState.CLOSED;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSING);
        }
      }
    }
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
