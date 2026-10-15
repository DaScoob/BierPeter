// SPDX-License-Identifier: AGPL-3.0-only
#include "CaptivePortal.h"
#include "Game.h"
#include "HttpLink.h"
#include "Platform.h"
#include "Portal.h"
#include "Sealed.h"
#include "SetupFlow.h"
#include <ArduinoJson.h>

namespace {
constexpr char Version[] = "0.3.3-alpha";
constexpr uint32_t Magic = 0x42503033;
constexpr uint16_t FragmentSize = 180, MaxMessage = 6144;
struct __attribute__((packed)) Packet {
  uint32_t magic;
  uint32_t sequence;
  uint16_t length;
  uint8_t part, parts;
  char data[FragmentSize];
};
struct Received {
  uint8_t mac[6];
  Packet p;
};
Received inbox[10];
volatile uint8_t inboxRead = 0, inboxWrite = 0;
struct Peer {
  String id, pub;
  uint64_t seen = 0, contact = 0;
  int64_t offset = 0;
  uint8_t mask = 3, sensors = 0;
  bool admitted = false, prepared = false;
};
Peer peers[bp::MaxDevices];
uint8_t peerCount = 0;
struct Outbound {
  String to, body, sequence;
  uint64_t sent = 0;
  uint8_t fragment = 0;
  bool used = false, relay = false;
};
Outbound outgoing[12];
struct Reassembly {
  String from, body;
  uint32_t sequence = 0;
  uint8_t next = 0, parts = 0;
  uint16_t length = 0;
  uint64_t seen = 0;
} reassembly[2];
struct Buffered {
  String body;
  bool used = false;
};
constexpr uint8_t MaxUploads = 2;
Buffered uploads[MaxUploads];
struct SeenMessage {
  String from, seq;
} seenMessages[32];
uint8_t seenCursor = 0;
String id, hostId, runId, mode = "relay", selection = "auto", ssid, password, serverOrigin,
                          deviceKey, lastCommand, errorText;
String recipientsId[16], recipientsPublic[16];
uint8_t recipientCount = 0;
bool configSent[8] = {};
bool sideStarted[2] = {false, false};
bool hostLocked = false, managed = false, isDemo = false, realtime = true, serverDirty = false,
     apRunning = false;
bool onlineEnabled = false, scanWanted = false, scanRunning = false;
bool dnsReady = false;
uint64_t lastPortalPage = 0, scanQuietUntil = 0, lastDnsStart = 0, lastPortalLog = 0;
uint8_t portalClients = 0;
volatile bool portalPageSeen = false;
uint32_t portalPages = 0, portalRedirects = 0;
bp::SetupFlow setupFlow;
uint64_t lastServerAck = 0, lastScan = 0, lastSetupSnapshot = 0;
String scanJson = "[]", scanError, setupMessage, testedServerVersion;
String actionId, actionState = "idle", actionError;
uint32_t webSerial = 0, queuedSerial = 0;
char *setupSnapshot = nullptr;
uint64_t nowUs = 0, lastBeacon = 0, lastHeartbeat = 0, lastHttp = 0, lastHop = 0, wifiLost = 0,
         lastReconnect = 0, lastSnapshot = 0, logical = 0;
uint32_t sequence = 0;
uint8_t channel = 11, hop = 0, prepareCursor = 0;
uint64_t preparedSent[bp::MaxDevices] = {};
bp::Engine game;
bp::Relay relay;
bp::VirtualSensors virtualSensors;
bp::EventSensors physicalSensors;
bp::SensorSource *sensorSource = &physicalSensors;
sealed::Box box;
HttpLink http;
AsyncWebServer portal(80);
DNSServer dns;
char webRequest[1600] = {};
uint8_t webKind = 0;
char *snapshot = nullptr;
String resultPlain;
uint32_t randomDuration() {
  uint32_t value;
  sealed::randomBytes((uint8_t *)&value, 4);
  return 3000 + value % 12001;
}
int peerIndex(const String &);
bool isHost();
uint64_t clockUs() {
  if (isDemo && !realtime)
    return logical;
  if (game.active() && !isHost()) {
    int i = peerIndex(hostId);
    if (i >= 0)
      return uint64_t(int64_t(nowUs) + peers[i].offset);
  }
  return nowUs;
}
int peerIndex(const String &value) {
  for (uint8_t i = 0; i < peerCount; ++i)
    if (peers[i].id == value)
      return i;
  return -1;
}
bool isHost() { return hostId == id; }
bool runOpen() { return (game.phase == bp::Phase::Prepared && runId.length()) || game.active(); }
String serialize(JsonDocument &doc) {
  String s;
  serializeJson(doc, s);
  return s;
}
String stateName() {
  switch (game.phase) {
  case bp::Phase::Prepared:
    return "prepared";
  case bp::Phase::Running:
    return "running";
  case bp::Phase::Finished:
    return "finished";
  default:
    return "idle";
  }
}
String context(const String &kind, const String &from, const String &to, const String &seq = "") {
  return "BierPeter:" + kind + ":v1:" + runId + ":" + from + ":" + to +
         (seq.length() ? ":" + seq : "");
}
bool macBytes(const String &s, uint8_t *m) { return sealed::unhex(s, m, 6); }
void radioPeer(const uint8_t *m) {
#ifdef ESP32
  if (!esp_now_is_peer_exist(m)) {
    esp_now_peer_info_t p = {};
    memcpy(p.peer_addr, m, 6);
    p.channel = 0;
    p.ifidx = WIFI_IF_STA;
    p.encrypt = false;
    esp_now_add_peer(&p);
  }
#else
  if (!esp_now_is_peer_exist(const_cast<uint8_t *>(m)))
    esp_now_add_peer(const_cast<uint8_t *>(m), ESP_NOW_ROLE_COMBO, 0, nullptr, 0);
#endif
}
void rawSend(const String &to, const Packet &p) {
  uint8_t m[6];
  if (!macBytes(to, m))
    return;
  radioPeer(m);
  esp_now_send(m, (uint8_t *)&p, sizeof(p));
}
void receivePacket(const uint8_t *mac, const uint8_t *data, int len) {
  if (len != (int)sizeof(Packet))
    return;
  Packet p;
  memcpy(&p, data, sizeof(p));
  if (p.magic != Magic || p.length > MaxMessage || !p.parts || p.parts > 35 || p.part >= p.parts)
    return;
  BP_LOCK();
  uint8_t next = (inboxWrite + 1) % 10;
  if (next != inboxRead) {
    memcpy(inbox[inboxWrite].mac, mac, 6);
    inbox[inboxWrite].p = p;
    inboxWrite = next;
  }
  BP_UNLOCK();
}
#ifdef ESP32
void onReceive(const uint8_t *mac, const uint8_t *data, int len) { receivePacket(mac, data, len); }
#else
void onReceive(uint8_t *mac, uint8_t *data, uint8_t len) { receivePacket(mac, data, len); }
#endif
bool bufferUpload(const String &body) {
  for (auto &u : uploads)
    if (!u.used) {
      u.body = body;
      u.used = true;
      return true;
    }
  errorText = "Ergebnis-Puffer voll; neuer Run gesperrt";
  return false;
}
void ackRadio(const String &to, const String &seq) {
  JsonDocument d;
  d["t"] = "ACK";
  d["seq"] = seq;
  String body = serialize(d);
  Packet p = {Magic, ++sequence, (uint16_t)body.length(), 0, 1, {}};
  memcpy(p.data, body.c_str(), body.length());
  rawSend(to, p);
}
bool sendMessage(const String &to, JsonDocument &doc) {
  if (to == id)
    return true;
  String body = serialize(doc);
  if (body.length() > MaxMessage) {
    errorText = "Gerätepaket zu groß";
    return false;
  }
  for (auto &q : outgoing)
    if (!q.used) {
      q.to = to;
      q.body = body;
      q.sequence = String(++sequence, HEX);
      q.sent = 0;
      q.fragment = 0;
      q.relay = false;
      q.used = true;
      return true;
    }
  errorText = "Sendepuffer voll";
  return false;
}
void fireBeacon() {
  JsonDocument d;
  d["t"] = "BEACON";
  d["h"] = hostId;
  d["p"] = box.publicKey();
  d["u"] = nowUs;
  d["r"] = game.ready();
  uint8_t sensors = 0;
  for (int s = 0; s < 2; ++s) {
    if (game.lane[s].present)
      sensors |= 1 << s;
    if (game.lane[s].lifted)
      sensors |= 1 << (s + 2);
    if (game.lane[s].done)
      sensors |= 1 << (s + 4);
  }
  d["s"] = sensors;
  d["l"] = hostLocked || runOpen();
  String body = serialize(d);
  Packet p = {Magic, ++sequence, (uint16_t)body.length(), 0, 1, {}};
  if (body.length() <= FragmentSize) {
    memcpy(p.data, body.c_str(), body.length());
    rawSend("FFFFFFFFFFFF", p);
  }
}
void transmit() {
  static uint64_t lastPacket = 0;
  if (nowUs - lastPacket < 4000)
    return;
  lastPacket = nowUs;
  for (auto &q : outgoing) {
    if (!q.used)
      continue;
    if (!q.fragment && q.sent && nowUs - q.sent < 700000)
      continue;
    Packet p = {Magic,
                (uint32_t)strtoul(q.sequence.c_str(), nullptr, 16),
                (uint16_t)q.body.length(),
                q.fragment,
                (uint8_t)((q.body.length() + FragmentSize - 1) / FragmentSize),
                {}};
    size_t offset = size_t(q.fragment) * FragmentSize, n = q.body.length() - offset;
    if (n > FragmentSize)
      n = FragmentSize;
    memcpy(p.data, q.body.c_str() + offset, n);
    rawSend(q.to, p);
    if (++q.fragment >= p.parts) {
      q.fragment = 0;
      q.sent = nowUs;
      q.relay = managed;
    }
    break;
  }
}
void clearTraffic() {
  for (auto &q : outgoing) {
    q.used = false;
    q.body = "";
  }
  for (auto &s : seenMessages) {
    s.from = "";
    s.seq = "";
  }
  for (auto &r : reassembly)
    r.body = "";
}
void makeLocalConfig(JsonDocument &d) {
  d["t"] = "LOCAL";
  d["host"] = hostId;
  d["mode"] = mode;
  auto a = d["peers"].to<JsonArray>();
  for (uint8_t i = 0; i < peerCount; ++i)
    if (peers[i].admitted) {
      auto p = a.add<JsonObject>();
      p["id"] = peers[i].id;
      p["public"] = peers[i].pub;
      p["mask"] = peers[i].mask;
    }
}
void configureLocalMasks() {
  uint8_t admitted = 0;
  for (int i = 0; i < peerCount; ++i)
    if (peers[i].admitted)
      ++admitted;
  uint8_t position = 0;
  for (int i = 0; i < peerCount; ++i)
    if (peers[i].admitted) {
      peers[i].mask = mode == "duel" && admitted > 1 ? (position == 0   ? 1
                                                        : position == 1 ? 2
                                                                        : 0)
                                                     : 3;
      ++position;
    }
}
void localPrepare() {
  sideStarted[0] = sideStarted[1] = false;
  configureLocalMasks();
  uint8_t masks[8] = {};
  for (uint8_t i = 0; i < peerCount; ++i)
    masks[i] = peers[i].admitted ? peers[i].mask : 0;
  relay.reset(peerCount, masks, 0);
  int own = peerIndex(id);
  game.prepare(own >= 0 ? peers[own].mask : 0, false);
  virtualSensors.reset();
  isDemo = false;
  sensorSource = &physicalSensors;
  managed = false;
  runId = "";
  resultPlain = "";
}
void admitPeer(int index) {
  if (index < 0 || peers[index].admitted)
    return;
  Peer admitted = peers[index];
  admitted.admitted = true;
  int insert = 0;
  while (insert < peerCount && peers[insert].admitted)
    ++insert;
  for (int i = index; i > insert; --i)
    peers[i] = peers[i - 1];
  peers[insert] = admitted;
}
void announceLocal() {
  if (!isHost() || runOpen())
    return;
  configureLocalMasks();
  int own = peerIndex(id);
  if (own >= 0 && game.phase == bp::Phase::Prepared)
    game.mask = peers[own].mask;
  JsonDocument d;
  makeLocalConfig(d);
  for (uint8_t i = 0; i < peerCount; ++i)
    if (peers[i].admitted && peers[i].id != id)
      sendMessage(peers[i].id, d);
}
void markReady() {
  for (int s = 0; s < 2; ++s)
    if (game.mask & (1 << s))
      game.sensor(s, bp::SensorEvent::Ready, clockUs());
}
bool applyRun(JsonObjectConst cfg) {
  String incoming = cfg["run"].as<String>();
  if (incoming == runId)
    return true;
  bool buffered = false;
  for (auto &u : uploads)
    if (u.used)
      buffered = true;
  if (runOpen() || buffered || (resultPlain.length() && managed)) {
    errorText = "Vorheriger Run noch offen";
    return false;
  }
  JsonArrayConst list = cfg["peers"];
  if (list.size() == 0 || list.size() > 8 || !incoming.length())
    return false;
  bool self = false;
  for (auto p : list)
    if (p["id"].as<String>() == id) {
      self = true;
      if (p["public"].as<String>() != box.publicKey())
        return false;
    }
  if (!self)
    return false;
  clearTraffic();
  runId = incoming;
  hostId = cfg["host"].as<String>();
  mode = cfg["mode"].as<String>();
  isDemo = cfg["demo"] | false;
  realtime = cfg["realtime"] | true;
  managed = true;
  logical = 1000000;
  resultPlain = "";
  recipientCount = 0;
  uint64_t observed[8] = {};
  int observedIndex = 0;
  for (auto p : list) {
    int old = peerIndex(p["id"].as<String>());
    if (old >= 0)
      observed[observedIndex] = peers[old].seen;
    ++observedIndex;
  }
  peerCount = 0;
  for (auto p : list) {
    Peer &x = peers[peerCount++];
    x.id = p["id"].as<String>();
    x.pub = p["public"].as<String>();
    x.mask = p["mask"] | 0;
    x.admitted = true;
    x.prepared = x.id == id;
    x.offset = 0;
    x.seen = observed[peerCount - 1];
    x.contact = x.seen;
  }
  if (peerIndex(hostId) < 0)
    return false;
  if (isHost())
    for (auto r : cfg["recipients"].as<JsonArrayConst>()) {
      if (recipientCount >= 16)
        return false;
      recipientsId[recipientCount] = r["id"].as<String>();
      recipientsPublic[recipientCount++] = r["public"].as<String>();
    }
  sideStarted[0] = sideStarted[1] = false;
  sensorSource = isDemo ? static_cast<bp::SensorSource *>(&virtualSensors)
                        : static_cast<bp::SensorSource *>(&physicalSensors);
  game.prepare(peers[peerIndex(id)].mask, isDemo);
  virtualSensors.reset();
  if (isDemo)
    markReady();
  prepareCursor = 0;
  memset(preparedSent, 0, sizeof(preparedSent));
  memset(configSent, 0, sizeof(configSent));
  return true;
}
void armSide(uint8_t side, uint64_t at) {
  if (side > 1 || sideStarted[side])
    return;
  sideStarted[side] = true;
  if (isDemo) {
    if (!realtime && logical < at)
      logical = at;
    virtualSensors.arm(side, randomDuration());
  }
}
void beginRun(uint64_t at) {
  if (game.active() || game.phase == bp::Phase::Finished)
    return;
  if (!game.ready())
    return;
  if (WiFi.status() != WL_CONNECTED)
    WiFi.disconnect();
  if (!game.begin(at))
    return;
  if (isHost()) {
    uint8_t masks[8] = {};
    for (int i = 0; i < peerCount; ++i)
      masks[i] = peers[i].admitted ? peers[i].mask : 0;
    relay.reset(peerCount, masks, at);
  }
}
void sendTurn(uint8_t device, uint8_t side, uint64_t at) {
  if (device >= peerCount)
    return;
  JsonDocument d;
  d["t"] = "TURN";
  d["run"] = runId;
  d["side"] = side;
  d["at"] = at;
  d["start"] = relay.start;
  d["offset"] = peers[device].offset;
  if (peers[device].id == id)
    armSide(side, at);
  else
    sendMessage(peers[device].id, d);
}
void finishRun() {
  if (!isHost() || !relay.completed || game.phase == bp::Phase::Finished)
    return;
  game.finish();
  JsonDocument result;
  result["v"] = 1;
  result["run"] = runId;
  result["mode"] = mode;
  result["demo"] = isDemo;
  result["realtime"] = realtime;
  auto totals = result["total_us"].to<JsonArray>();
  totals.add(relay.total[0]);
  totals.add(relay.total[1]);
  auto splits = result["splits"].to<JsonArray>();
  for (uint8_t i = 0; i < peerCount; ++i)
    for (uint8_t s = 0; s < 2; ++s)
      if (relay.result[i][s].done) {
        auto r = splits.add<JsonObject>();
        r["device"] = peers[i].id;
        r["side"] = s;
        r["duration_us"] = relay.result[i][s].duration;
        r["finish_us"] = relay.result[i][s].finish - relay.starts[s];
      }
  resultPlain = serialize(result);
  JsonDocument done;
  done["t"] = "FINISH";
  done["run"] = runId;
  for (uint8_t i = 0; i < peerCount; ++i)
    if (peers[i].id != id)
      sendMessage(peers[i].id, done);
}
void acceptDone(uint8_t device, uint8_t side, uint64_t duration, uint64_t finish) {
  if (!isHost() || !game.active() || !relay.accept(device, side, duration, finish))
    return;
  if (!realtime && logical < finish)
    logical = finish;
  sendTurn(relay.next[side], side, finish);
  finishRun();
}
// Future real-sensor adapters call this exact function; virtual inputs follow
// the same path.
void sensorEvent(uint8_t side, bp::SensorEvent event, uint64_t at) {
  if (side > 1)
    return;
  if (event == bp::SensorEvent::Ready && game.phase == bp::Phase::Finished && !managed) {
    runId = "";
    sideStarted[0] = sideStarted[1] = false;
    game.prepare(game.mask, false);
  }
  if (event == bp::SensorEvent::Clink && game.phase == bp::Phase::Prepared && isHost() && !isDemo) {
    bool all = game.ready();
    for (int i = 0; i < peerCount; ++i)
      if (peers[i].admitted && peers[i].id != id && !peers[i].prepared)
        all = false;
    if (!all)
      return;
    if (!runId.length()) {
      uint8_t r[12];
      sealed::randomBytes(r, 12);
      runId = sealed::hex(r, 12);
    }
    beginRun(at);
    for (uint8_t side = 0; side < 2; ++side)
      sendTurn(relay.next[side], side, at);
    for (int i = 0; i < peerCount; ++i)
      if (peers[i].admitted && peers[i].id != id) {
        JsonDocument start;
        start["t"] = "LOCALSTART";
        start["run"] = runId;
        start["at"] = at;
        sendMessage(peers[i].id, start);
      }
  }
  if (game.active() && (event == bp::SensorEvent::Lift || event == bp::SensorEvent::Return) &&
      !sideStarted[side])
    return;
  if (!game.sensor(side, event, at))
    return;
  if (event == bp::SensorEvent::Return) {
    int own = peerIndex(id);
    if (own < 0)
      return;
    auto &l = game.lane[side];
    if (isHost())
      acceptDone(own, side, l.duration, l.returned);
    else {
      JsonDocument d;
      d["t"] = "DONE";
      d["run"] = runId;
      d["side"] = side;
      d["duration"] = l.duration;
      d["finish"] = l.returned;
      sendMessage(hostId, d);
    }
  }
}
void process(const String &from, JsonObjectConst d, bool viaRadio) {
  String type = d["t"].as<String>();
  int index = peerIndex(from);
  if (type == "BEACON") {
    if (from == id)
      return;
    String publicKey = d["p"].as<String>();
    if (publicKey.length() != 64)
      return;
    if (index < 0 && !runOpen() && peerCount < 8) {
      index = peerCount++;
      peers[index] = Peer{};
      peers[index].id = from;
      peers[index].pub = publicKey;
    }
    if (index < 0)
      return;
    peers[index].seen = nowUs;
    peers[index].contact = nowUs;
    peers[index].sensors = d["s"] | uint8_t(0);
    if (runOpen())
      return;
    peers[index].pub = publicKey;
    peers[index].prepared = d["r"] | false;
    // An established earlier host wins; close boot times use MAC as
    // tie-breaker.
    uint64_t uptime = d["u"] | uint64_t(0);
    bool earlier = uptime > nowUs + 500000 || (uptime + 500000 >= nowUs && from < id);
    bool solo = true;
    for (int i = 0; i < peerCount; ++i)
      if (peers[i].admitted && peers[i].id != id)
        solo = false;
    if (selection == "auto" && isHost() && solo && earlier && d["h"].as<String>() == from &&
        !(d["l"] | true)) {
      hostId = from;
      JsonDocument join;
      join["t"] = "JOIN";
      join["public"] = box.publicKey();
      sendMessage(from, join);
    }
    return;
  }
  if (type == "JOIN" && !runOpen() && isHost() && !hostLocked && selection == "auto") {
    unsigned admitted = 0;
    for (int i = 0; i < peerCount; ++i)
      if (peers[i].admitted)
        ++admitted;
    if (mode == "duel" && admitted >= 2)
      return;
    if (index < 0 && peerCount < 8) {
      index = peerCount++;
      peers[index] = Peer{};
      peers[index].id = from;
    }
    if (index >= 0) {
      peers[index].pub = d["public"].as<String>();
      peers[index].seen = nowUs;
      admitPeer(index);
      announceLocal();
    }
    return;
  }
  if (type == "LOCAL" && !runOpen() && from == hostId) {
    JsonArrayConst list = d["peers"];
    if (list.size() > 8)
      return;
    peerCount = 0;
    for (auto p : list) {
      auto &x = peers[peerCount++];
      x.id = p["id"].as<String>();
      x.pub = p["public"].as<String>();
      x.mask = p["mask"] | 3;
      x.admitted = true;
      x.prepared = false;
      x.seen = x.id == from ? nowUs : 0;
      x.contact = x.seen;
    }
    mode = d["mode"].as<String>();
    localPrepare();
    return;
  }
  if (type == "CFG") {
    if (runOpen() && runId != d["run"].as<String>())
      return;
    // Only a previously admitted coordinator may configure an existing local
    // group.
    if (from != hostId && !managed && (index < 0 || !peers[index].admitted))
      return;
    applyRun(d);
    return;
  }
  if (type == "LOCALSTART" && from == hostId && !managed && game.ready()) {
    runId = d["run"].as<String>();
    int h = peerIndex(hostId);
    if (h >= 0)
      peers[h].offset = int64_t(d["at"].as<uint64_t>()) - int64_t(nowUs);
    beginRun(d["at"].as<uint64_t>());
    return;
  }
  if (d["run"].as<String>() != runId || index < 0 || !peers[index].admitted)
    return;
  peers[index].contact = nowUs;
  if (viaRadio)
    peers[index].seen = nowUs;
  if (type == "PREPARE" && from == hostId) {
    JsonDocument ready;
    ready["t"] = "READY";
    ready["run"] = runId;
    ready["echo"] = d["at"];
    ready["clock"] = clockUs();
    ready["ready"] = game.ready();
    sendMessage(hostId, ready);
    return;
  }
  if (type == "READY" && isHost() && (d["ready"] | false)) {
    uint64_t echoed = d["echo"] | uint64_t(0), remote = d["clock"] | uint64_t(0);
    if (!preparedSent[index] || echoed != preparedSent[index])
      return;
    peers[index].offset = (int64_t)((echoed + clockUs()) / 2) - (int64_t)remote;
    peers[index].prepared = true;
    return;
  }
  if (type == "START" && from == hostId) {
    if (game.active() || game.phase == bp::Phase::Finished)
      return;
    int64_t offset = d["offset"] | int64_t(0);
    peers[peerIndex(hostId)].offset = offset;
    uint64_t at = d["at"] | uint64_t(0);
    if (!realtime)
      logical = at;
    beginRun(at);
    return;
  }
  if (type == "TURN" && from == hostId) {
    uint8_t side = d["side"] | uint8_t(255);
    if (side > 1)
      return;
    if (!game.active()) {
      peers[peerIndex(hostId)].offset = d["offset"] | int64_t(0);
      uint64_t start = d["start"] | clockUs();
      if (!realtime)
        logical = start;
      beginRun(start);
    }
    armSide(side, d["at"] | clockUs());
    return;
  }
  if (type == "DONE" && isHost()) {
    uint8_t side = d["side"] | uint8_t(255);
    uint64_t finish = d["finish"] | uint64_t(0);
    acceptDone(index, side, d["duration"] | uint64_t(0), finish);
    return;
  }
  if (type == "FINISH" && from == hostId) {
    game.finish();
    return;
  }
}
void consume(const String &from, const String &seq, const String &body, bool radio) {
  JsonDocument d;
  if (deserializeJson(d, body))
    return;
  if (d["t"].as<String>() == "ACK") {
    String ack = d["seq"].as<String>();
    for (auto &q : outgoing)
      if (q.used && q.to == from && q.sequence == ack) {
        q.used = false;
        q.body = "";
      }
    return;
  }
  if (radio)
    ackRadio(from, seq);
  for (auto &s : seenMessages)
    if (s.from == from && s.seq == seq)
      return;
  seenMessages[seenCursor] = {from, seq};
  seenCursor = (seenCursor + 1) % 32;
  process(from, d.as<JsonObjectConst>(), radio);
}
void drainRadio() {
  for (int count = 0; count < 10; ++count) {
    Received r;
    BP_LOCK();
    if (inboxRead == inboxWrite) {
      BP_UNLOCK();
      break;
    }
    r = inbox[inboxRead];
    inboxRead = (inboxRead + 1) % 10;
    BP_UNLOCK();
    String from = sealed::hex(r.mac, 6);
    from.toUpperCase();
    auto &p = r.p;
    String seq(p.sequence, HEX);
    if (p.parts == 1) {
      if (p.length > FragmentSize)
        continue;
      String single;
      single.concat(p.data, p.length);
      consume(from, seq, single, true);
      continue;
    }
    Reassembly *a = nullptr;
    for (auto &x : reassembly)
      if (x.from == from && x.sequence == p.sequence) {
        a = &x;
        break;
      }
    if (!a && p.part == 0)
      for (auto &x : reassembly)
        if (!x.body.length() || nowUs - x.seen > 500000) {
          a = &x;
          x.from = from;
          x.sequence = p.sequence;
          x.body = "";
          x.next = 0;
          x.parts = p.parts;
          x.length = p.length;
          break;
        }
    if (a && p.part == 0) {
      a->body = "";
      a->next = 0;
    }
    if (!a || a->next != p.part || a->parts != p.parts || a->length != p.length)
      continue;
    a->seen = nowUs;
    size_t n = p.length - size_t(p.part) * FragmentSize;
    if (n > FragmentSize)
      n = FragmentSize;
    a->body.concat(p.data, n);
    ++a->next;
    if (a->next == a->parts) {
      consume(from, seq, a->body, true);
      a->body = "";
    }
  }
}
void prepareTick() {
  if (!isHost() || game.phase != bp::Phase::Prepared || !runId.length())
    return;
  bool all = game.ready();
  for (int i = 0; i < peerCount; ++i)
    if (!peers[i].prepared)
      all = false;
  if (all) {
    uint64_t at = clockUs();
    beginRun(at);
    for (int i = 0; i < peerCount; ++i)
      if (peers[i].id != id) {
        JsonDocument d;
        d["t"] = "START";
        d["run"] = runId;
        d["at"] = at;
        d["offset"] = peers[i].offset;
        sendMessage(peers[i].id, d);
      }
    for (uint8_t s = 0; s < 2; ++s)
      sendTurn(relay.next[s], s, at);
    return;
  }
  for (int step = 0; step < peerCount; ++step) {
    int i = (prepareCursor++) % peerCount;
    if (peers[i].id == id || peers[i].prepared)
      continue;
    if (!configSent[i]) {
      JsonDocument cfg;
      cfg["t"] = "CFG";
      cfg["run"] = runId;
      cfg["host"] = hostId;
      cfg["mode"] = mode;
      cfg["demo"] = isDemo;
      cfg["realtime"] = realtime;
      auto a = cfg["peers"].to<JsonArray>();
      for (int j = 0; j < peerCount; ++j) {
        auto p = a.add<JsonObject>();
        p["id"] = peers[j].id;
        p["public"] = peers[j].pub;
        p["mask"] = peers[j].mask;
      }
      if (sendMessage(peers[i].id, cfg))
        configSent[i] = true;
      break;
    }
    bool queued = false;
    for (auto &q : outgoing)
      if (q.used && q.to == peers[i].id)
        queued = true;
    if (!queued && (!preparedSent[i] || clockUs() - preparedSent[i] > 1000000)) {
      JsonDocument d;
      d["t"] = "PREPARE";
      d["run"] = runId;
      d["at"] = clockUs();
      if (sendMessage(peers[i].id, d))
        preparedSent[i] = clockUs();
    }
    break;
  }
}
void sensorTick() {
  if (game.phase != bp::Phase::Prepared && !game.active())
    return;
  if (isDemo && !game.active())
    return;
  if (!realtime) {
    uint64_t t = virtualSensors.next();
    if (t != UINT64_MAX && t > logical)
      logical = t;
  }
  uint8_t side;
  bp::SensorEvent event;
  for (int count = 0; count < 4 && sensorSource->poll(clockUs(), side, event); ++count)
    sensorEvent(side, event, sensorSource->timestamp());
}
void heartbeat(JsonDocument &d) {
  d["device_id"] = id;
  d["firmware"] = Version;
  d["wifi_rssi"] = WiFi.RSSI();
  d["wifi_channel"] = WiFi.channel();
  d["uptime_ms"] = nowUs / 1000;
  d["run_public"] = box.publicKey();
  d["game_state"] = stateName();
  d["ready"] = game.ready();
  String peer = "";
  for (int i = 0; i < peerCount; ++i)
    if (peers[i].id != id && peers[i].admitted) {
      peer = peers[i].id;
      break;
    }
  d["peer_mac"] = peer;
  int pi = peerIndex(peer);
  d["peer_active"] = pi >= 0 && peers[pi].seen > 0 && nowUs - peers[pi].seen < 9000000;
  auto list = d["neighbors"].to<JsonArray>();
  for (int i = 0; i < peerCount; ++i)
    if (peers[i].id != id && peers[i].seen > 0 && nowUs - peers[i].seen < 9000000) {
      auto p = list.add<JsonObject>();
      p["device_id"] = peers[i].id;
      p["transport"] = "esp-now";
      p["channel"] = channel;
      p["run_public"] = peers[i].pub;
    }
}
void httpResponse() {
  String tag, body;
  int status;
  if (!http.receive(tag, body, status))
    return;
  JsonDocument d;
  bool ok = status == 200 && !deserializeJson(d, body);
  if (tag.startsWith("upload:")) {
    if (ok || status == 403 || status == 404 || status == 409) {
      int i = tag.substring(7).toInt();
      uploads[i].used = false;
      uploads[i].body = "";
    }
    return;
  }
  if (tag.startsWith("relay-send:")) {
    if (ok) {
      int i = tag.substring(11).toInt();
      outgoing[i].relay = false;
      JsonDocument sent;
      deserializeJson(sent, outgoing[i].body);
      if (sent["t"].as<String>() == "ACK") {
        outgoing[i].used = false;
        outgoing[i].body = "";
      }
    }
    return;
  }
  if (tag == "test-health") {
    if (ok)
      testedServerVersion = d["version"].as<String>();
    setupFlow.health(ok && d["status"].as<String>() == "ok" && d["version"].is<const char *>(),
                     nowUs);
    return;
  }
  if (tag == "test-auth") {
    bool accepted = ok && d["status"].as<String>() == "ok" && d["device_id"].as<String>() == id;
    setupFlow.auth(accepted, status == 401 || status == 403 || status == 503);
    if (accepted) {
      lastServerAck = nowUs;
      setupMessage = "Verbindung geprüft. Serverkommunikation pausiert bis zum "
                     "Onlinebetrieb.";
    }
    return;
  }
  if (tag == "heartbeat" && ok && d["device_id"].as<String>() == id)
    lastServerAck = nowUs;
  if (!ok) {
    serverDirty = true;
    return;
  }
  if (tag == "command") {
    JsonObjectConst c = d["command"];
    if (c.isNull())
      return;
    String command = c["command_id"].as<String>();
    bool success = command == lastCommand;
    String action = c["action"].as<String>();
    if (!success && action == "demo")
      success = applyRun(c["payload"]);
    else if (!success && action == "abort" && c["payload"]["run"].as<String>() == runId) {
      game.abort();
      clearTraffic();
      runId = "";
      resultPlain = "";
      success = true;
    } else if (!success && action == "pair" && !runOpen()) {
      String other = c["peer_mac"].as<String>();
      int i = peerIndex(other);
      if (i >= 0) {
        peers[i].admitted = true;
        announceLocal();
        success = true;
      }
    }
    if (success)
      lastCommand = command;
    JsonDocument ack;
    ack["device_id"] = id;
    ack["command_id"] = command;
    ack["success"] = success;
    ack["detail"] = success ? "Firmware hat Befehl übernommen"
                            : "Gerät beschäftigt oder ungültige Konfiguration";
    http.send(serverOrigin, deviceKey, "POST", "/api/v1/commands/ack", serialize(ack), "ack");
  }
  if (tag == "relay-get")
    for (auto message : d["messages"].as<JsonArray>()) {
      String from = message["sender"].as<String>(), seq = message["sequence"].as<String>(),
             rid = message["run"].as<String>();
      int i = peerIndex(from);
      String plain;
      if (rid != runId || i < 0 ||
          !box.open(peers[i].pub, context("wire", from, id, seq), message["envelope"], plain))
        continue;
      consume(from, seq, plain, false);
      // Radio-style ACK travels encrypted over the same relay as ordinary
      // messages.
      JsonDocument ack;
      ack["t"] = "ACK";
      ack["seq"] = seq;
      ack["run"] = runId;
      sendMessage(from, ack);
      JsonDocument ackRelay;
      ackRelay["device_id"] = id;
      ackRelay["run"] = runId;
      ackRelay["sender"] = from;
      ackRelay["sequence"] = seq;
      http.send(serverOrigin, deviceKey, "POST", "/api/v1/relay/ack", serialize(ackRelay),
                "relay-ack");
      break;
    }
}
void sealResult() {
  if (!managed || !isHost() || game.phase != bp::Phase::Finished || !resultPlain.length())
    return;
  unsigned buffered = 0;
  for (auto &u : uploads)
    if (u.used)
      ++buffered;
  if (buffered >= MaxUploads)
    return;
  for (uint8_t r = 0; r < recipientCount; ++r)
    if (recipientsId[r].length()) {
      JsonDocument d;
      d["device_id"] = id;
      d["run"] = runId;
      d["recipient"] = recipientsId[r];
      auto e = d["envelope"].to<JsonObject>();
      if (box.seal(recipientsPublic[r], context("result", id, recipientsId[r]), resultPlain, e) &&
          bufferUpload(serialize(d)))
        recipientsId[r] = "";
      return; // Crypto is performed after timing completes, one recipient per
              // loop.
    }
  bool pending = false;
  for (auto &u : uploads)
    if (u.used)
      pending = true;
  if (!pending)
    resultPlain = ""; // Keep display result independently in relay state.
}
void networkTick() {
  httpResponse();
  if (!onlineEnabled)
    return;
  if (http.busy() || WiFi.status() != WL_CONNECTED || deviceKey.length() < 32 ||
      !serverOrigin.length() || nowUs - lastHttp < 180000)
    return;
  lastHttp = nowUs;
  for (int i = 0; i < MaxUploads; ++i)
    if (uploads[i].used) {
      http.send(serverOrigin, deviceKey, "POST", "/api/v1/run-result", uploads[i].body,
                "upload:" + String(i));
      return;
    }
  if (nowUs - lastHeartbeat > 4000000) {
    JsonDocument d;
    heartbeat(d);
    if (http.send(serverOrigin, deviceKey, "POST", "/api/v1/heartbeat", serialize(d), "heartbeat"))
      lastHeartbeat = nowUs;
    return;
  }
  static uint8_t turn = 0;
  turn = (turn + 1) % 3;
  if (turn == 0) {
    http.send(serverOrigin, deviceKey, "GET", "/api/v1/commands?device_id=" + id, "", "command");
    return;
  }
  if (managed && runId.length()) {
    if (turn == 1)
      for (int i = 0; i < 12; ++i)
        if (outgoing[i].used && outgoing[i].relay) {
          auto &q = outgoing[i];
          int p = peerIndex(q.to);
          if (p < 0)
            continue;
          JsonDocument d;
          d["device_id"] = id;
          d["run"] = runId;
          d["recipient"] = q.to;
          d["sequence"] = q.sequence;
          if (box.seal(peers[p].pub, context("wire", id, q.to, q.sequence), q.body,
                       d["envelope"].to<JsonObject>()))
            http.send(serverOrigin, deviceKey, "POST", "/api/v1/relay", serialize(d),
                      "relay-send:" + String(i));
          return;
        }
    http.send(serverOrigin, deviceKey, "GET", "/api/v1/relay?device_id=" + id, "", "relay-get");
  }
}
bool saveConfigValues(const String &newSsid, const String &newPassword, const String &origin,
                      const String &key, bool online) {
  JsonDocument d;
  d["ssid"] = newSsid;
  d["password"] = newPassword;
  d["server"] = origin;
  d["key"] = key;
  d["online"] = online;
  File f = LittleFS.open("/config.tmp", "w");
  if (!f)
    return false;
  size_t wanted = measureJson(d), written = serializeJson(d, f);
  f.flush();
  f.close();
  if (written != wanted) {
    LittleFS.remove("/config.tmp");
    return false;
  }
  File verify = LittleFS.open("/config.tmp", "r");
  JsonDocument saved;
  bool valid = verify && !deserializeJson(saved, verify) && saved["ssid"].as<String>() == newSsid &&
               saved["password"].as<String>() == newPassword &&
               saved["server"].as<String>() == origin && saved["key"].as<String>() == key &&
               saved["online"].as<bool>() == online;
  verify.close();
  if (!valid) {
    LittleFS.remove("/config.tmp");
    return false;
  }
  bool previous = LittleFS.exists("/config.json");
  if (previous) {
    if (LittleFS.exists("/config.old") && !LittleFS.remove("/config.old"))
      return false;
    if (!LittleFS.rename("/config.json", "/config.old"))
      return false;
  }
  if (!LittleFS.rename("/config.tmp", "/config.json")) {
    if (previous)
      LittleFS.rename("/config.old", "/config.json");
    return false;
  }
  return true;
}
void loadConfig() {
  for (const char *name : {"/config.json", "/config.old"}) {
    File f = LittleFS.open(name, "r");
    if (!f)
      continue;
    JsonDocument d;
    if (deserializeJson(d, f))
      continue;
    ssid = d["ssid"].as<String>();
    password = d["password"].as<String>();
    serverOrigin = d["server"].as<String>();
    deviceKey = d["key"].as<String>();
    onlineEnabled = d["online"] | false;
    setupFlow.saved();
    if (onlineEnabled)
      setupFlow.stage = bp::SetupStage::Online;
    break;
  }
}
void startAP() {
  if (apRunning || game.active())
    return;
  WiFi.mode(WIFI_AP_STA);
  if (!setupSnapshot) {
    setupSnapshot = new (std::nothrow) char[4096];
    if (setupSnapshot)
      strcpy(setupSnapshot, "{}");
  }
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1),
                    IPAddress(255, 255, 255, 0));
  // A standalone setup group uses the preferred common discovery channel.
  // Never move an existing peer group or an associated station to another
  // channel.
  bool group = false;
  for (int i = 0; i < peerCount; ++i)
    group |= peers[i].admitted && peers[i].id != id;
  if (WiFi.status() != WL_CONNECTED && !group && !runOpen()) {
    channel = 11;
    radioChannel(channel);
  }
  if (!WiFi.softAP(("BierPeter-" + id.substring(6)).c_str(), nullptr, channel, false, 4))
    return;
  dns.setTTL(0);
  dns.setErrorReplyCode(DNSReplyCode::NoError);
  dnsReady = dns.start(53, "*", WiFi.softAPIP());
  lastDnsStart = nowUs;
  apRunning = true;
  scanWanted = false;
  lastPortalPage = 0;
  portalClients = 0;
  scanQuietUntil = nowUs + 8000000;
  BP_LOCK();
  portalPageSeen = false;
  BP_UNLOCK();
}
void handleWeb() {
  uint8_t kind;
  uint32_t serial;
  BP_LOCK();
  kind = webKind;
  serial = queuedSerial;
  BP_UNLOCK();
  if (!kind)
    return;
  String request;
  BP_LOCK();
  request = webRequest;
  webKind = 0;
  BP_UNLOCK();
  actionId = String(serial);
  actionState = "error";
  actionError = "";
  if (runOpen()) {
    actionError = errorText = "Änderung während eines Runs verworfen";
    return;
  }
  JsonDocument d;
  if (deserializeJson(d, request)) {
    actionError = "Ungültiges JSON";
    return;
  }
  if (kind == 1) {
    if (setupFlow.busy() || http.busy()) {
      actionError = "Verbindungsvorgang läuft. Kurz warten.";
      return;
    }
    String origin = d["server"].as<String>(), newSsid = d["ssid"].as<String>();
    origin.trim();
    while (origin.endsWith("/"))
      origin.remove(origin.length() - 1);
    if (origin.length()) {
      String authority = origin.substring(7);
      int colon = authority.indexOf(':');
      String host = colon < 0 ? authority : authority.substring(0, colon);
      String port = colon < 0 ? "80" : authority.substring(colon + 1);
      bool validPort = port.length() > 0;
      for (size_t i = 0; i < port.length(); ++i)
        if (!isdigit(port[i]))
          validPort = false;
      if (!origin.startsWith("http://") || authority.indexOf('/') >= 0 ||
          authority.indexOf('@') >= 0 || authority.indexOf('?') >= 0 ||
          authority.indexOf('#') >= 0 || authority.indexOf(' ') >= 0 ||
          authority.indexOf('\r') >= 0 || authority.indexOf('\n') >= 0 || host == "localhost" ||
          host == "127.0.0.1" || host == "0.0.0.0" || !host.length() || !validPort ||
          port.toInt() < 1 || port.toInt() > 65535) {
        actionError = "Erreichbare lokale Serveradresse als "
                      "http://Hostname:Port angeben. Kein "
                      "localhost, HTTPS oder Pfad.";
        return;
      }
    }
    String key = d["key"].as<String>(), pass = d["password"].as<String>();
    if (newSsid.length() > 32 || pass.length() > 64 || origin.length() > 180 ||
        key.length() > 128) {
      actionError = "Eingabe überschreitet die zulässige Länge.";
      return;
    }
    if (key.length() && (key.length() < 32 || key.indexOf('\r') >= 0 || key.indexOf('\n') >= 0)) {
      actionError = "Server-Zugriffsschlüssel benötigt mindestens 32 Zeichen.";
      return;
    }
    if (!key.length())
      key = deviceKey;
    bool clearPassword = d["clear_password"] | false;
    if (!pass.length() && !clearPassword) {
      if (newSsid != ssid && password.length()) {
        actionError = "Für ein anderes WLAN Passwort eingeben oder "
                      "ausdrücklich ein offenes WLAN auswählen.";
        return;
      }
      pass = password;
    }
    if (!saveConfigValues(newSsid, pass, origin, key, false)) {
      actionError = "Einstellungen konnten nicht dauerhaft gespeichert werden. Bisherige "
                    "Konfiguration bleibt erhalten.";
      return;
    }
    ssid = newSsid;
    password = pass;
    serverOrigin = origin;
    deviceKey = key;
    onlineEnabled = false;
    lastServerAck = 0;
    WiFi.disconnect();
    setupFlow.saved();
    setupMessage = "Einstellungen gespeichert. Verbindung jetzt testen.";
    errorText = "";
    actionState = "done";
    return;
  }
  if (kind == 3) {
    if (setupFlow.busy() || scanRunning || http.busy()) {
      actionError = "Suche oder Verbindung läuft. Kurz warten.";
      return;
    }
    if (!ssid.length() || !serverOrigin.length() || deviceKey.length() < 32) {
      actionError = "Zuerst WLAN, Serveradresse und Server-Zugriffsschlüssel speichern.";
      return;
    }
    if (!setupFlow.begin(nowUs, runOpen())) {
      actionError = "Verbindungstest kann momentan nicht starten.";
      return;
    }
    onlineEnabled = false;
    lastServerAck = 0;
    setupMessage = "WLAN-Verbindung wird geprüft. Bei kurzer Unterbrechung erneut mit dem "
                   "BierPeter-WLAN verbinden.";
    WiFi.disconnect();
    WiFi.begin(ssid.c_str(), password.c_str());
    actionState = "done";
    return;
  }
  if (kind == 4) {
    if (!setupFlow.passed() || WiFi.status() != WL_CONNECTED) {
      actionError = "Zuerst einen erfolgreichen Verbindungstest mit den gespeicherten "
                    "Einstellungen durchführen.";
      return;
    }
    if (!saveConfigValues(ssid, password, serverOrigin, deviceKey, true)) {
      actionError = "Onlinebetrieb konnte nicht gespeichert werden. SoftAP "
                    "bleibt erreichbar.";
      return;
    }
    if (!setupFlow.online(nowUs, runOpen())) {
      actionError = "Onlinebetrieb derzeit nicht möglich.";
      return;
    }
    setupMessage = "Onlinebetrieb startet in sechs Sekunden. Danach ins "
                   "Heimnetz wechseln.";
    actionState = "done";
    return;
  }
  if (kind == 5) {
    if (setupFlow.busy() || scanRunning || http.busy()) {
      actionError = "Suche oder Verbindung läuft. Kurz warten.";
      return;
    }
    scanWanted = true;
    actionState = "done";
    return;
  }
  if (kind == 2) {
    if (setupFlow.busy() || scanRunning) {
      actionError = "Einrichtung oder WLAN-Suche läuft.";
      return;
    }
    if (!isHost()) {
      actionError = errorText = "Aufstellung nur auf dem Host ändern";
      return;
    }
    String select = d["selection"].as<String>(), newMode = d["mode"].as<String>();
    if ((select != "auto" && select != "manual") || (newMode != "relay" && newMode != "duel"))
      return;
    selection = select;
    mode = newMode;
    hostLocked = d["locked"] | false;
    if (selection == "manual") {
      if (mode == "duel" && d["devices"].as<JsonArray>().size() > 2) {
        errorText = "1vs1 erlaubt höchstens zwei Geräte";
        return;
      }
      Peer ordered[8];
      uint8_t count = 0;
      bool included = false;
      for (auto value : d["devices"].as<JsonArray>()) {
        String candidate = value.as<String>();
        int i = peerIndex(candidate);
        if (i < 0)
          continue;
        bool duplicate = false;
        for (int j = 0; j < count; ++j)
          if (ordered[j].id == candidate)
            duplicate = true;
        if (!duplicate && count < 8) {
          ordered[count] = peers[i];
          ordered[count++].admitted = true;
          if (candidate == id)
            included = true;
        }
      }
      if (!included) {
        errorText = "Host muss in der Auswahl bleiben";
        return;
      }
      peerCount = count;
      for (int i = 0; i < count; ++i)
        peers[i] = ordered[i];
    }
    localPrepare();
    announceLocal();
    actionState = "done";
  }
}
void updateSnapshot() {
  if (!snapshot || nowUs - lastSnapshot < 500000)
    return;
  lastSnapshot = nowUs;
  JsonDocument d;
  d["id"] = id;
  d["host"] = hostId;
  d["channel"] = channel;
  d["public"] = box.publicKey();
  d["state"] = stateName();
  d["ready"] = game.ready();
  d["demo"] = isDemo;
  d["error"] = errorText;
  auto a = d["devices"].to<JsonArray>();
  for (int i = 0; i < peerCount; ++i) {
    auto p = a.add<JsonObject>();
    p["id"] = peers[i].id;
    p["selected"] = peers[i].admitted;
    p["connected"] =
        peers[i].admitted &&
        (peers[i].id == id || (peers[i].contact > 0 && nowUs - peers[i].contact < 9000000));
    p["public"] = peers[i].pub;
    p["ready"] = peers[i].prepared;
    p["sensors"] = peers[i].id == id
                       ? uint8_t((game.lane[0].present ? 1 : 0) | (game.lane[1].present ? 2 : 0) |
                                 (game.lane[0].done ? 16 : 0) | (game.lane[1].done ? 32 : 0))
                       : peers[i].sensors;
  }
  auto lanes = d["lanes"].to<JsonArray>();
  for (int s = 0; s < 2; ++s) {
    auto l = lanes.add<JsonObject>();
    l["side"] = s;
    l["present"] = game.lane[s].present;
    l["done"] = game.lane[s].done;
    l["duration_us"] = game.lane[s].duration;
    l["elapsed_us"] = game.lane[s].lifted && !game.lane[s].done ? clockUs() - game.lane[s].lift
                                                                : game.lane[s].duration;
  }
  if (isHost() && relay.completed) {
    auto r = d["result"].to<JsonObject>();
    auto totals = r["total_us"].to<JsonArray>();
    totals.add(relay.total[0]);
    totals.add(relay.total[1]);
    auto splits = r["splits"].to<JsonArray>();
    for (int i = 0; i < peerCount; ++i)
      for (int s = 0; s < 2; ++s)
        if (relay.result[i][s].done) {
          auto x = splits.add<JsonObject>();
          x["device"] = peers[i].id;
          x["side"] = s;
          x["duration_us"] = relay.result[i][s].duration;
        }
  }
  String json = serialize(d);
  if (json.length() < 4096) {
    BP_LOCK();
    memcpy(snapshot, json.c_str(), json.length() + 1);
    BP_UNLOCK();
  }
}
void updateSetupSnapshot() {
  if (!setupSnapshot || nowUs - lastSetupSnapshot < 250000)
    return;
  lastSetupSnapshot = nowUs;
  JsonDocument d;
  d["firmware"] = Version;
  d["server_version"] = testedServerVersion;
  d["id"] = id;
  d["stage"] = bp::setupName(setupFlow.stage);
  d["revision"] = setupFlow.revision;
  d["saved"] = setupFlow.revision > 0;
  d["tested"] = setupFlow.passed();
  d["busy"] = setupFlow.busy();
  d["online_enabled"] = onlineEnabled;
  d["wifi_connected"] = WiFi.status() == WL_CONNECTED;
  d["server_online"] = onlineEnabled && WiFi.status() == WL_CONNECTED && lastServerAck > 0 &&
                       nowUs - lastServerAck < 15000000;
  d["ssid"] = ssid;
  d["server"] = serverOrigin;
  d["password_saved"] = password.length() > 0;
  d["key_saved"] = deviceKey.length() >= 32;
  d["error"] = setupFlow.error;
  d["message"] = setupMessage;
  d["action_id"] = actionId;
  d["action_state"] = actionState;
  d["action_error"] = actionError;
  d["scanning"] = scanRunning || scanWanted;
  d["scan_error"] = scanError;
  d["scan_age_s"] = lastScan ? (nowUs - lastScan) / 1000000 : 0;
  d["run_open"] = runOpen();
  auto diagnostic = d["portal"].to<JsonObject>();
  diagnostic["dns_ready"] = dnsReady;
  diagnostic["channel"] = WiFi.channel();
  diagnostic["clients"] = WiFi.softAPgetStationNum();
  BP_LOCK();
  uint32_t pages = portalPages, redirects = portalRedirects;
  BP_UNLOCK();
  diagnostic["pages"] = pages;
  diagnostic["redirects"] = redirects;
  JsonDocument networks;
  deserializeJson(networks, scanJson);
  d["networks"] = networks.as<JsonArray>();
  String json = serialize(d);
  if (json.length() < 4096) {
    BP_LOCK();
    if (setupSnapshot)
      memcpy(setupSnapshot, json.c_str(), json.length() + 1);
    BP_UNLOCK();
  }
}
void setupTick() {
  if (runOpen()) {
    if (setupFlow.testing())
      setupFlow.fail("Verbindungstest wegen eines Runs beendet.");
    return;
  }
  BP_LOCK();
  bool pageSeen = portalPageSeen;
  portalPageSeen = false;
  BP_UNLOCK();
  if (pageSeen)
    lastPortalPage = nowUs;
  if (apRunning && !dnsReady && nowUs - lastDnsStart >= 1000000) {
    lastDnsStart = nowUs;
    dns.stop();
    dnsReady = dns.start(53, "*", WiFi.softAPIP());
  }
  if (scanWanted && !scanRunning && !setupFlow.busy() && apRunning && !http.busy() &&
      bp::portalScanReady(nowUs, lastPortalPage, scanQuietUntil)) {
    scanWanted = false;
    scanError = "";
    WiFi.scanDelete();
    int result = WiFi.scanNetworks(true, true);
    scanRunning = result >= -1;
    if (result == -2)
      scanError = "WLAN-Suche konnte nicht gestartet werden.";
  }
  if (scanRunning) {
    int count = WiFi.scanComplete();
    if (count >= 0) {
      JsonDocument d;
      auto list = d.to<JsonArray>();
      // Keep the strongest duplicate SSID and cap the list for ESP8266 memory.
      int chosen[16];
      int used = 0;
      for (int i = 0; i < count; ++i) {
        String name = WiFi.SSID(i);
        if (!name.length())
          continue;
        int duplicate = -1;
        for (int j = 0; j < used; ++j)
          if (WiFi.SSID(chosen[j]) == name)
            duplicate = j;
        if (duplicate >= 0) {
          if (WiFi.RSSI(i) > WiFi.RSSI(chosen[duplicate]))
            chosen[duplicate] = i;
          continue;
        }
        if (used < 16)
          chosen[used++] = i;
        else {
          int weakest = 0;
          for (int j = 1; j < used; ++j)
            if (WiFi.RSSI(chosen[j]) < WiFi.RSSI(chosen[weakest]))
              weakest = j;
          if (WiFi.RSSI(i) > WiFi.RSSI(chosen[weakest]))
            chosen[weakest] = i;
        }
      }
      for (int i = 0; i < used; ++i)
        for (int j = i + 1; j < used; ++j)
          if (WiFi.RSSI(chosen[j]) > WiFi.RSSI(chosen[i])) {
            int tmp = chosen[i];
            chosen[i] = chosen[j];
            chosen[j] = tmp;
          }
      for (int j = 0; j < used; ++j) {
        int i = chosen[j];
        auto n = list.add<JsonObject>();
        n["ssid"] = WiFi.SSID(i);
        n["rssi"] = WiFi.RSSI(i);
        n["channel"] = WiFi.channel(i);
#ifdef ESP32
        n["open"] = WiFi.encryptionType(i) == WIFI_AUTH_OPEN;
#else
        n["open"] = WiFi.encryptionType(i) == ENC_TYPE_NONE;
#endif
      }
      scanJson = serialize(d);
      WiFi.scanDelete();
      scanRunning = false;
      lastScan = nowUs;
    } else if (count == -2) {
      scanRunning = false;
      scanError = "WLAN-Suche fehlgeschlagen. Erneut suchen.";
    }
  }
  if (setupFlow.stage == bp::SetupStage::Wifi)
    setupFlow.wifi(WiFi.status() == WL_CONNECTED, nowUs);
  if (setupFlow.stage == bp::SetupStage::Health && !http.busy())
    http.send(serverOrigin, "", "GET", "/api/v1/health", "", "test-health");
  if (setupFlow.stage == bp::SetupStage::Auth && !http.busy()) {
    JsonDocument d;
    heartbeat(d);
    http.send(serverOrigin, deviceKey, "POST", "/api/v1/heartbeat", serialize(d), "test-auth");
  }
  setupFlow.tick(nowUs, runOpen());
  if (setupFlow.switchDue(nowUs)) {
    onlineEnabled = true;
    dns.stop();
    dnsReady = false;
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    apRunning = false;
    lastHeartbeat = 0;
    BP_LOCK();
    char *previous = setupSnapshot;
    setupSnapshot = nullptr;
    BP_UNLOCK();
    delete[] previous;
  }
}
void captiveRedirect(AsyncWebServerRequest *r) {
  if (r->client()->localIP() != WiFi.softAPIP()) {
    r->send(403);
    return;
  }
  BP_LOCK();
  ++portalRedirects;
  BP_UNLOCK();
  auto *response =
      r->beginResponse(302, "text/plain", "BierPeter Einrichtung: http://192.168.4.1/");
  response->addHeader("Location", "http://192.168.4.1/");
  response->addHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  response->addHeader("Pragma", "no-cache");
  response->addHeader("Expires", "0");
  r->send(response);
}
void portalSetup() {
  snapshot = new char[4096];
  strcpy(snapshot, "{}");
  portal.on("/setup", HTTP_GET, [](AsyncWebServerRequest *r) {
    if (r->client()->localIP() != WiFi.softAPIP()) {
      r->send(403);
      return;
    }
    char *copy = new (std::nothrow) char[4096];
    if (!copy) {
      r->send(503);
      return;
    }
    BP_LOCK();
    strcpy(copy, setupSnapshot ? setupSnapshot : "{}");
    BP_UNLOCK();
    r->send(200, "application/json", copy);
    delete[] copy;
  });
  portal.on("/status", HTTP_GET, [](AsyncWebServerRequest *r) {
    if (r->client()->localIP() != WiFi.softAPIP()) {
      r->send(403);
      return;
    }
    char *copy = new (std::nothrow) char[4096];
    if (!copy) {
      r->send(503);
      return;
    }
    BP_LOCK();
    strcpy(copy, snapshot);
    BP_UNLOCK();
    r->send(200, "application/json", copy);
    delete[] copy;
  });
  portal.on("/", HTTP_GET, [](AsyncWebServerRequest *r) {
    String host = r->host();
    auto route = bp::portalRoute(r->client()->localIP() == WiFi.softAPIP(), true, host.c_str());
    if (route == bp::PortalRoute::Deny) {
      r->send(403);
      return;
    }
    if (route == bp::PortalRoute::Redirect) {
      captiveRedirect(r);
      return;
    }
    BP_LOCK();
    portalPageSeen = true;
    ++portalPages;
    BP_UNLOCK();
#ifdef ESP8266
    auto *response = r->beginResponse_P(200, "text/html; charset=utf-8", PortalPage);
#else
    auto *response = r->beginResponse(200, "text/html; charset=utf-8", PortalPage);
#endif
    response->addHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    r->send(response);
  });
  for (const char *path : {"/config", "/session", "/test", "/online", "/scan"})
    portal.on(
        path, HTTP_POST, [](AsyncWebServerRequest *r) {}, nullptr,
        [](AsyncWebServerRequest *r, uint8_t *data, size_t len, size_t index, size_t total) {
          if (r->client()->localIP() != WiFi.softAPIP()) {
            r->send(403);
            return;
          }
          if (game.active() || runOpen()) {
            r->send(409, "application/json",
                    "{\"error\":\"Aufstellung während eines Runs gesperrt\"}");
            return;
          }
          if (!r->hasHeader("X-BierPeter-Local") || r->header("X-BierPeter-Local") != "1") {
            r->send(403, "application/json",
                    "{\"error\":\"Lokaler Anfrageursprung erforderlich\"}");
            return;
          }
          if (total == 0 || total >= sizeof(webRequest)) {
            r->send(413, "application/json", "{\"error\":\"Anfrage zu groß\"}");
            return;
          }
          if (index == 0) {
            r->_tempObject = calloc(1, total + 1);
            if (!r->_tempObject) {
              r->send(503);
              return;
            }
          }
          if (!r->_tempObject || index + len > total) {
            r->send(400);
            return;
          }
          memcpy(static_cast<char *>(r->_tempObject) + index, data, len);
          if (index + len != total)
            return;
          BP_LOCK();
          bool busy = webKind != 0;
          uint32_t serial = 0;
          if (!busy) {
            memcpy(webRequest, r->_tempObject, total);
            webRequest[total] = 0;
            queuedSerial = serial = ++webSerial;
            webKind = r->url() == "/config"    ? 1
                      : r->url() == "/session" ? 2
                      : r->url() == "/test"    ? 3
                      : r->url() == "/online"  ? 4
                                               : 5;
          }
          BP_UNLOCK();
          free(r->_tempObject);
          r->_tempObject = nullptr;
          if (busy) {
            r->send(409, "application/json", "{\"error\":\"Anfrage wartet\"}");
            return;
          }
          r->send(202, "application/json", "{\"request\":\"" + String(serial) + "\"}");
        });
  for (const char *path :
       {"/generate_204", "/gen_204", "/hotspot-detect.html", "/library/test/success.html",
        "/connecttest.txt", "/ncsi.txt", "/redirect", "/success.txt"})
    portal.on(path, HTTP_GET, captiveRedirect);
  portal.onNotFound(captiveRedirect);
  portal.begin();
}
void wifiTick() {
  if (apRunning) {
    uint8_t clients = WiFi.softAPgetStationNum();
    if (clients > portalClients)
      scanQuietUntil = nowUs + 8000000;
    portalClients = clients;
  }
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected) {
    wifiLost = 0;
    channel = WiFi.channel();
  } else if (!wifiLost)
    wifiLost = nowUs;
  if (game.active())
    return;
  if (!apRunning && (!ssid.length() || (wifiLost && nowUs - wifiLost > 30000000)))
    startAP();
  if (onlineEnabled && !connected && ssid.length() && nowUs - lastReconnect > 30000000 &&
      !runOpen() && !scanRunning && !setupFlow.busy() &&
      (!apRunning || (WiFi.softAPgetStationNum() == 0 && nowUs >= scanQuietUntil))) {
    WiFi.begin(ssid.c_str(), password.c_str());
    lastReconnect = nowUs;
  }
  bool group = false;
  for (int i = 0; i < peerCount; ++i)
    if (peers[i].admitted && peers[i].id != id)
      group = true;
  // SoftAP beacons, association and captive probes need one stable channel,
  // including the time BEFORE a station appears in softAPgetStationNum().
  // Same-channel ESP-NOW remains available. Hopping resumes after AP handoff.
  if (!apRunning && !connected && !group && !runOpen() && !setupFlow.busy() && !scanRunning &&
      nowUs - lastHop > (channel == 11 ? 2000000 : 300000)) {
    lastHop = nowUs;
    channel = ++hop % 12;
    if (!channel)
      channel = 11;
    radioChannel(channel);
  }
}
} // namespace
void setup() {
  Serial.begin(115200);
  WiFi.persistent(false);
  WiFi.mode(WIFI_AP_STA);
#ifdef ESP8266
  WiFi.setAutoReconnect(false);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);
#else
  WiFi.setAutoReconnect(false);
  WiFi.setSleep(false);
#endif
  id = WiFi.macAddress();
  id.replace(":", "");
  id.toUpperCase();
  hostId = id;
#ifdef ESP32
  LittleFS.begin(true);
#else
  LittleFS.begin();
#endif
  uint8_t identity[32];
  File keyFile = LittleFS.open("/identity.key", "r");
  bool existing = keyFile && keyFile.size() == 32;
  if (existing)
    keyFile.read(identity, 32);
  keyFile.close();
  box.begin(existing ? identity : nullptr);
  if (!existing) {
    box.exportSecret(identity);
    File target = LittleFS.open("/identity.key", "w");
    if (target) {
      target.write(identity, 32);
      target.close();
    }
  }
  clean(identity, 32);
  loadConfig();
  if (onlineEnabled)
    WiFi.mode(WIFI_STA);
  radioChannel(11);
  esp_now_init();
#ifdef ESP8266
  esp_now_set_self_role(ESP_NOW_ROLE_COMBO);
#endif
  esp_now_register_recv_cb(onReceive);
  uint8_t broadcast[6] = {255, 255, 255, 255, 255, 255};
  radioPeer(broadcast);
  peerCount = 1;
  peers[0].id = id;
  peers[0].pub = box.publicKey();
  peers[0].admitted = true;
  localPrepare();
  http.begin();
  portalSetup();
  if (onlineEnabled && ssid.length())
    WiFi.begin(ssid.c_str(), password.c_str());
  else
    startAP();
  Serial.println("BierPeter " + id + " · " + Version);
}
void loop() {
  nowUs = monotonicUs();
  drainRadio();
  prepareTick();
  sensorTick();
  transmit();
  networkTick();
  sealResult();
  handleWeb();
  wifiTick();
  setupTick();
  if (nowUs - lastBeacon > 500000) {
    lastBeacon = nowUs;
    fireBeacon();
  }
  if (apRunning)
    dns.processNextRequest();
  if (apRunning && !runOpen() && nowUs - lastPortalLog >= 5000000) {
    lastPortalLog = nowUs;
    BP_LOCK();
    uint32_t pages = portalPages, redirects = portalRedirects;
    BP_UNLOCK();
    Serial.printf("[portal] firmware=%s dns=%u channel=%u clients=%u pages=%lu "
                  "redirects=%lu scan=%u\n",
                  Version, unsigned(dnsReady), unsigned(WiFi.channel()),
                  unsigned(WiFi.softAPgetStationNum()), (unsigned long)pages,
                  (unsigned long)redirects, unsigned(scanRunning));
  }
  updateSnapshot();
  updateSetupSnapshot();
  yield();
}
