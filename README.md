<p align="center">
  <img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

# Homebridge Shelly Door Controller

Hi there! :wave:  
This Homebridge plugin lets you use your Shelly Plus 1 as a door controller in HomeKit.  
Tested with: [Shelly Plus 1](https://www.shelly.com/products/shelly-plus-1-x1)

## Wiring

![image](Plus_1_12_V_wiring_diagram.png)

## Shelly Device Setup

Follow these steps to configure your Shelly as momentary switch:

- **Access Device**
  - Open your Shelly’s IP address in a browser
- **Switches and attached inputs** *(red rectangle on image below)*
  - Find the **Switches and Attached Inputs** section
  - Click **Output(0)** row
    - Find **Output Settings** section *(blue rectangle on image below)*
    - Go to **Input/Output Settings** row
    - Set **Select input mode for Input(0)**: `Switch`
    - **Set output type for Output(0)**: `Detached - Input is separated/not changing state of the output/relay`
    - Set **Action on power on for Output(0)**: `Turn OFF`
    ---
    - Find **Automations** sections *(blue rectangle on image below)*
    - Go to the **Timers** tab
    - Set **Auto ON**: `0`
    - Set **Auto OFF**: `0.5`
- **Detached inputs** *(red rectangle on image below)*
  - Click the existing input.
  - Ensure **Enable** is checked.
  - *(Optional)* If your contact sensor is **NO (Normally Open)**, enable **Invert Input**. If **NC (Normally Closed)**, leave it disabled.

![image](Plus_1_214526.png)
![image](Plus_1_214859.png)

## Homebridge Plugin Configuration

| Setting                | Description                                                                                 |
|------------------------|---------------------------------------------------------------------------------------------|
| **Device ID**          | Find under `Settings > Device Settings > Device Name` on the Shelly web UI.<br>Use a unique ID (e.g., `shellyplus1-deviceID`) to avoid duplication. |
| **Name**               | Friendly name as it will appear in HomeKit.                                                 |
| **IP Address/Hostname**| Local network IP or hostname for your Shelly device.                                        |
| **Open Gate Time**     | Expected duration (in seconds) for the gate to open.                                        |
| **Close Gate Time**    | Expected duration (in seconds) for the gate to close.                                       |
| **Obstruction Detection** | Enables detection if the gate fails to close within the expected time.<br>**Requires a contact sensor that monitors closed state.** |


> **Note:**  
> For obstruction detection, you must connect a contact sensor to your Shelly device on the closed position of your gate/door. If the plugin requests the door to close but the sensor does not confirm closure, an obstruction will be reported.


## Recommendations

- **Magnetic Contact Sensor:**  
  Without a contact sensor, the plugin can lose sync with the actual state of your gate/door—especially if your gate closes automatically after a set time
- **Sensor Type:**
  Configure the input inversion based on your sensor type (**NO** or **NC**) for accurate detection


**Enjoy seamless control of your gate or door with HomeKit!**
