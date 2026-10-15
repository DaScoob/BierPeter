// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include <stdint.h>
namespace bp {
enum class SetupStage : uint8_t { Idle, Wifi, Health, Auth, Passed, Failed, Switching, Online };
class SetupFlow {
public:
  SetupStage stage = SetupStage::Idle;
  uint32_t revision = 0, verified = 0;
  uint64_t deadline = 0;
  const char *error = "";
  bool testing() const {
    return stage == SetupStage::Wifi || stage == SetupStage::Health || stage == SetupStage::Auth;
  }
  bool busy() const { return testing() || stage == SetupStage::Switching; }
  bool passed() const {
    return stage == SetupStage::Passed && verified == revision && verified != 0;
  }
  void saved() {
    ++revision;
    verified = 0;
    stage = SetupStage::Idle;
    deadline = 0;
    error = "";
  }
  bool begin(uint64_t now, bool runOpen) {
    if (runOpen || busy() || revision == 0)
      return false;
    verified = 0;
    stage = SetupStage::Wifi;
    error = "";
    deadline = now + 20000000;
    return true;
  }
  void fail(const char *reason) {
    stage = SetupStage::Failed;
    verified = 0;
    deadline = 0;
    error = reason;
  }
  bool wifi(bool connected, uint64_t now) {
    if (stage != SetupStage::Wifi)
      return false;
    if (connected) {
      stage = SetupStage::Health;
      deadline = now + 10000000;
      return true;
    }
    if (now >= deadline)
      fail("WLAN-Verbindung fehlgeschlagen. Netzwerkname und Passwort prüfen.");
    return false;
  }
  void health(bool ok, uint64_t now) {
    if (stage != SetupStage::Health)
      return;
    if (!ok) {
      fail(
          "Server nicht erreichbar oder keine gültige BierPeter-Antwort. Adresse und Port prüfen.");
      return;
    }
    stage = SetupStage::Auth;
    deadline = now + 10000000;
  }
  void auth(bool ok, bool denied) {
    if (stage != SetupStage::Auth)
      return;
    if (!ok) {
      fail(denied
               ? "Server-Zugriffsschlüssel nicht akzeptiert. DEVICE_API_KEY des Servers verwenden."
               : "Geräteanmeldung fehlgeschlagen. Serverantwort und Geräteschnittstelle prüfen.");
      return;
    }
    verified = revision;
    stage = SetupStage::Passed;
    deadline = 0;
  }
  bool online(uint64_t now, bool runOpen) {
    if (runOpen || !passed())
      return false;
    stage = SetupStage::Switching;
    deadline = now + 6000000;
    return true;
  }
  bool switchDue(uint64_t now) {
    if (stage != SetupStage::Switching || now < deadline)
      return false;
    stage = SetupStage::Online;
    deadline = 0;
    return true;
  }
  void tick(uint64_t now, bool runOpen) {
    if (testing() && runOpen) {
      fail("Verbindungstest wegen eines Runs beendet.");
      return;
    }
    if (testing() && now >= deadline)
      fail("Verbindungstest hat keine Antwort erhalten. Erneut testen.");
  }
};
inline const char *setupName(SetupStage s) {
  switch (s) {
  case SetupStage::Wifi:
    return "wifi";
  case SetupStage::Health:
    return "health";
  case SetupStage::Auth:
    return "auth";
  case SetupStage::Passed:
    return "passed";
  case SetupStage::Failed:
    return "failed";
  case SetupStage::Switching:
    return "switching";
  case SetupStage::Online:
    return "online";
  default:
    return "idle";
  }
}
} // namespace bp
