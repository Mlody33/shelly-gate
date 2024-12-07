import type { CharacteristicValue } from 'homebridge';

export class Utils {

  static translateState(state: CharacteristicValue): string {
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

  static printCurrentStates(currentState: number, lastState: number, targetState: number): string {
    return `[CURRENT=${Utils.translateState(currentState)}] [LAST=${Utils.translateState(lastState)}] [TARGET=${Utils.translateState(targetState)}]`;
  }

}