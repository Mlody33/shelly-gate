import type { API } from 'homebridge';

import { ShellyDoorPlatformPlugin } from './platform.js';
import { PLATFORM_NAME } from './settings.js';

export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, ShellyDoorPlatformPlugin);
};
