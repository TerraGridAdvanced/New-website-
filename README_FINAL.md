# TerraGrid FINAL — ESP32 + Website

## 1. ESP32 firmware

Open:

`TerraGrid_ESP32_FINAL.ino`

Install these Arduino libraries:

- ArduinoJson
- TinyGPSPlus
- DHT sensor library
- Adafruit MPU6050
- Adafruit Unified Sensor

The ESP32 Arduino core already provides WiFi/WebServer support.

## 2. Change Wi-Fi

At the top of the `.ino`:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
```

If the ESP32 cannot join that Wi-Fi, it automatically creates:

- SSID: `TerraGrid-Rover`
- Password: `terragrid`
- IP: `192.168.4.1`

## 3. Website

The existing TerraGrid files have been preserved.

The website now has:

`Test connection`
`Get rover GPS`
`Send coordinates`
`Start AgriBot`

Workflow:

1. Start the ESP32.
2. Make sure NEO-6M has a valid outdoor GPS fix.
3. Start TerraGrid.
4. Enter the ESP32 `/mission` endpoint.
5. Click **Test connection**.
6. Click **Get rover GPS**.
7. TerraGrid receives the rover's actual starting latitude/longitude.
8. TerraGrid reorders the generated sampling points from the rover's actual starting position using a nearest-neighbour route.
9. Click **Send coordinates**.
10. Click **Start AgriBot**.
11. ESP32 navigates to each waypoint.
12. At each waypoint the rover stops and reads DHT22, soil moisture and LDR.
13. After the mission, TerraGrid can fetch `/results`.

## 4. ESP32 API

### GET `/gps`

Example:

```json
{
  "valid": true,
  "latitude": 22.804321,
  "longitude": 86.202145,
  "satellites": 8,
  "hdop": 1.2
}
```

### POST `/mission`

TerraGrid sends:

```json
{
  "mission_id": "TG-123",
  "start": {
    "latitude": 22.804321,
    "longitude": 86.202145
  },
  "points": [
    {
      "id": 1,
      "latitude": 22.804410,
      "longitude": 86.202300
    }
  ]
}
```

### POST `/start`

Starts navigation.

### POST `/stop`

Immediately stops the motors.

### GET `/status`

Returns GPS, heading, current waypoint and distance.

### GET `/results`

Returns the samples collected at the waypoints.

## 5. Important calibration

### QMC5883L

The code contains:

```cpp
X_OFFSET
Y_OFFSET
DECLINATION_DEG
```

The compass needs physical calibration on the completed rover.

### Soil moisture

Calibrate:

```cpp
DRY_RAW
WET_RAW
```

using your actual sensor and soil.

### Motor direction

If the rover drives backwards when commanded forward, change:

```cpp
LEFT_REVERSED
RIGHT_REVERSED
```

## 6. Navigation safety

The rover stops when:

- GPS becomes stale/invalid
- MPU6050 detects excessive tilt
- the rover reaches the waypoint
- the mission is complete
- `/stop` is called

## 7. Sensor behaviour

Sensors are only sampled after the rover reaches the waypoint.

The firmware:

1. stops motors
2. powers the sensor rail
3. waits for DHT22 startup
4. takes readings
5. stores the result
6. powers the sensor rail off
7. continues to the next waypoint

Actual physical soil-probe insertion requires a separate actuator; this firmware does not move a probe because no actuator was specified.
