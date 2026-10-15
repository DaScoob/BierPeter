// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include <Arduino.h>
#ifdef ESP32
#include <AsyncTCP.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
static portMUX_TYPE bpMux = portMUX_INITIALIZER_UNLOCKED;
#define BP_LOCK() portENTER_CRITICAL(&bpMux)
#define BP_UNLOCK() portEXIT_CRITICAL(&bpMux)
#else
#include <ESP8266WiFi.h>
#include <ESPAsyncTCP.h>
extern "C" {
#include <espnow.h>
#include <user_interface.h>
}
#define BP_LOCK() noInterrupts()
#define BP_UNLOCK() interrupts()
#endif
#include <DNSServer.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
inline void radioChannel(uint8_t ch) {
#ifdef ESP32
  esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);
#else
  wifi_set_channel(ch);
#endif
}
inline uint64_t monotonicUs() {
  static uint32_t last = 0;
  static uint64_t high = 0;
  uint32_t now = micros();
  if (now < last)
    high += (uint64_t(1) << 32);
  last = now;
  return high + now;
}
