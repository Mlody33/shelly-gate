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
    // this is first update of gate states
    if (typeof this.lastState === 'undefined' || typeof this.targetState === 'undefined') {

      this.log.debug('First check. lastState | targetState undefined');
      if (res.result['input:0'].state) {
        this.lastState = this.CurrentDoorState.OPEN;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
      } else {
        this.lastState = this.CurrentDoorState.CLOSED;
        this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
      }

      this.targetState = this.lastState;

    } else {

      if (this.targetState === this.lastState) {

        this.log.debug('Gate is in it desired state. So just to make sure that state is correct');
        if (res.result['input:0'].state) {
          this.lastState = this.CurrentDoorState.OPEN;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.OPEN);
        } else if (!res.result['input:0'].state) {
          this.lastState = this.CurrentDoorState.CLOSED;
          this.service.setCharacteristic(this.CurrentDoorState, this.CurrentDoorState.CLOSED);
        }
        this.targetState = this.lastState;
      } else {

        this.log.debug('Gate is still opereting. Do not update');
        if (this.lastState === this.CurrentDoorState.OPENING) {
          this.log.debug('Gate is still opening');
        } else if (this.lastState === this.CurrentDoorState.CLOSING) {
          this.log.debug('Gate is still closing');
        }
        this.log.debug('I will wait 10 sec and check state again');
        setTimeout(() => {
          this.log.debug('checking state');
          this.sendGetStatus();
        }, 10000);
        // shoudl check again in few second, maybe store some information that i double check if not meet condition the obtructed detected case
      }
    }
  }

  protected handleSet(res: SetSwitch): void {
    this.log('Gate switch changed', res);
  }

  protected handleNotifyStatus(res: NotifyStatus): void {
    this.log.debug('<< NotifyStatus', res);

    if (res.params['input:0']?.state === true) {
      this.log.debug('received event that gate is not closed anymore');
      if (this.lastState === this.CurrentDoorState.OPENING &&
        this.targetState === this.TargetDoorState.OPEN) {
        this.log.debug('gate is opening');
      } else {
        this.log.warn('GATE IS NOT OPENING');
      }
    } else if (res.params['input:0']?.state === false) {
      this.log.debug('received event that gate has been closed');
      if (this.lastState === this.platform.Characteristic.CurrentDoorState.CLOSING &&
        this.targetState === this.TargetDoorState.CLOSED) {

        this.log.warn('it seems that gate closed little bit faster than i expected. Consider to shorten close time');
        this.lastState = this.platform.Characteristic.CurrentDoorState.CLOSED;
        this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, this.platform.Characteristic.CurrentDoorState.CLOSED);
      }
    } else {
      this.log.debug('any other event i got');
    }

    //monitor event that gate has been closed durning openning or closing (i can detect this when i gate event that switch state has been changed)
  }

  handleCurrentDoorStateGet() {
    this.log.debug('Triggered GET CurrentDoorState', this.translateState(this.lastState));
    //should not send event if lastState != targetDoorState as it means that still openning or closing
    return this.lastState;
  }

  handleTargetDoorStateGet() {
    this.log.debug('Triggered GET TargetDoorState', this.translateState(this.targetState));
    return this.targetState;
  }

  handleTargetDoorStateSet(targetValue: CharacteristicValue) {
    this.log.info('Triggered SET TargetDoorState:', this.translateState(targetValue));

    if (targetValue === this.TargetDoorState.OPEN) {
      if (this.lastState === this.platform.Characteristic.CurrentDoorState.CLOSED) {
        this.sendSet();
        this.log.debug(`Opening... ${this.deviceConfig.openTime}s remaining`);
        this.targetState = targetValue;
        this.lastState = this.CurrentDoorState.OPENING;
        this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, this.CurrentDoorState.OPENING);

        //i can only check if gate isn't closed yet
        setTimeout(() => {
          this.log.debug('Should be opened now');
          this.targetState = this.TargetDoorState.OPEN;
          this.lastState = this.platform.Characteristic.CurrentDoorState.OPEN;
          this.sendGetStatus();
        }, this.deviceConfig.openTime * 1000);

      } else {
        this.log.warn('The gate is not closed so cant open it, AND THAT IS STRANGE');
      }

    } else if (targetValue === this.TargetDoorState.CLOSED) {
      if (this.lastState === this.platform.Characteristic.CurrentDoorState.OPEN) {
        this.sendSet();
        this.log.debug(`Closing... ${this.deviceConfig.closeTime}s remaining`);
        this.targetState = targetValue;
        this.lastState = this.platform.Characteristic.CurrentDoorState.CLOSING;
        this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, this.platform.Characteristic.CurrentDoorState.CLOSING);

        setTimeout(() => {
          this.log.debug('Should be closed now, and i ahould already receive closed event');
          if (this.lastState === this.platform.Characteristic.CurrentDoorState.CLOSED) {
            this.log.debug('its ok, looks closed');
            this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, this.platform.Characteristic.CurrentDoorState.CLOSED);
          } else {
            this.log.warn('smth went wrong. The gate is still not closed. Consider to extend close time or check is there is a obstruction detected');
          }
        }, this.deviceConfig.openTime * 1000);

      } else if (this.lastState === this.CurrentDoorState.OPENING) {
        this.log.debug('Stopped gate as it still was opening');
        this.sendSet();
        this.lastState = this.platform.Characteristic.CurrentDoorState.STOPPED;
        this.service.setCharacteristic(this.platform.Characteristic.CurrentDoorState, this.platform.Characteristic.CurrentDoorState.STOPPED);
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
