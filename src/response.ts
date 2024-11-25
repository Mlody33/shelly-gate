type Switch = {
    id: number;
    source: string;
    output: boolean;
    temperature: SwitchTemp | null;
    timer_duration: number | null;
    timer_started_at: number | null;
}

type Input = {
    id: number;
    state: boolean;
}

// GetStatus
type BLE = unknown

type Cloud = {
    connected: boolean;
}


type MQTT = {
    connected: boolean;
}

type SwitchTemp = {
    tC: number;
    tF: number;
}

type Sys = {
    mac: string;
    restart_required: boolean;
    time: string | null;
    unixtime: number | null;
    uptime: number;
    ram_size: number;
    ram_free: number;
    fs_size: number;
    fs_free: number;
    cfg_rev: number;
    kvs_rev: number;
    schedule_rev: number;
    webhook_rev: number;
    available_updates: Record<string, unknown>;
    reset_reason: number;
}

type Wifi = {
    sta_ip: string;
    status: string;
    ssid: string;
    rssi: number;
}

type WS = {
    connected: boolean;
}

type DeviceState = {
    ble: BLE;
    cloud: Cloud;
    'input:0': Input;
    mqtt: MQTT;
    'switch:0': Switch;
    sys: Sys;
    wifi: Wifi;
    ws: WS;
}

// GetDeviceInfo
type DeviceInfo = {
    name: string | null;
    id: string;
    mac: string;
    slot: number;
    model: string;
    gen: number;
    fw_id: string;
    ver: string;
    app: string;
    auth_en: boolean;
    auth_domain: string | null;
}

// Set
type Set = {
    was_on: boolean
}

// NotifyStatus
interface NotifyParams {
    ts: number;
    'switch:0'?: Switch | null;
    'input:0'?: Input | null;
}

// Responses
interface Event {
    src: string;
    dst: string;
}

export interface GetDeviceInfo extends Event {
    id: number;
    result: DeviceInfo
}

export interface GetStatus extends Event {
    id: number;
    result: DeviceState
}

export interface SetSwitch extends Event {
    id: number;
    result: Set;
}

export interface NotifyStatus extends Event {
    method: string;
    params: NotifyParams;
}
