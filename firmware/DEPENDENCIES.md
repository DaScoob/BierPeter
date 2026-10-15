# Firmware-Abhängigkeiten

Eigener Code: AGPL-3.0-only. Die Fremdkomponenten behalten ihre jeweiligen Lizenzen. Es wird keine Eigenentwicklung kryptografischer Algorithmen verwendet. `RunCrypto.h` definiert ausschließlich das Protokoll und die standardisierte HKDF-Verknüpfung der Bibliotheksprimitive.

| Komponente | Version | Lizenz | Quelle |
|---|---|---|---|
| ArduinoJson | 7.3.1 | MIT | https://github.com/bblanchon/ArduinoJson/tree/v7.3.1 |
| Arduino Cryptography Library | 0.4.0 | MIT | https://github.com/rweather/arduinolibs/tree/master/libraries/Crypto |
| ESPAsyncWebServer | 3.7.6 | LGPL-3.0 | https://github.com/ESP32Async/ESPAsyncWebServer/tree/v3.7.6 |
| ESPAsyncTCP, ESP8266 | 2.0.0 | LGPL-3.0 | https://github.com/ESP32Async/ESPAsyncTCP/tree/v2.0.0 |
| AsyncTCP, ESP32 | 3.4.0 | LGPL-3.0 | https://github.com/ESP32Async/AsyncTCP/tree/v3.4.0 |
| Arduino Core ESP8266 | 3.1.2 | LGPL-2.1 und beigefügte Komponentenlizenzen | https://github.com/esp8266/Arduino/tree/3.1.2 |
| Arduino Core ESP32 | 2.0.17 | LGPL-2.1 und beigefügte Komponentenlizenzen | https://github.com/espressif/arduino-esp32/tree/2.0.17 |
| PlatformIO ESP8266-Plattform | 4.2.1 | Apache-2.0 | https://github.com/platformio/platform-espressif8266/tree/v4.2.1 |
| PlatformIO ESP32-Plattform | 6.10.0 | Apache-2.0 | https://github.com/platformio/platform-espressif32/tree/v6.10.0 |

`platformio.ini` legt die tatsächlich verwendeten Versionen fest. Die zum Build heruntergeladenen Bibliotheksquellen und Lizenzdateien befinden sich lokal unter `.pio/libdeps/<ziel>/`. Die Plattform enthält weitere bereits vom Hersteller gelieferte SDK-Komponenten; deren Lizenzdateien bleiben unverändert erhalten.

Die Software ist aus dem vollständigen Quellcode mit PlatformIO neu baubar und kann mit geänderten Bibliotheken erneut verknüpft und per USB installiert werden. Keine Signatursperre wird eingeführt. Das Updatepaket enthält zusätzlich die für den Build benutzten Anwendungsbibliotheksquellen einschließlich ihrer Lizenzdateien.
