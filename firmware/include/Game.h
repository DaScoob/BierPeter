// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include <stddef.h>
#include <stdint.h>
namespace bp {
constexpr uint8_t MaxDevices = 8;
enum class SensorEvent : uint8_t { Ready, Clink, Lift, Return };
enum class Phase : uint8_t { Idle, Prepared, Running, Finished };
struct Lane {
  bool present = false, ready = false, lifted = false, done = false;
  uint64_t lift = 0, returned = 0, duration = 0;
};
// All timestamps share a monotonic microsecond clock. No game timeout or minimum duration.
class Engine {
public:
  Phase phase = Phase::Idle;
  Lane lane[2];
  uint8_t mask = 0;
  bool demo = false;
  uint64_t start = 0;
  void prepare(uint8_t used, bool virtualSensors) {
    mask = used;
    demo = virtualSensors;
    start = 0;
    lane[0] = Lane{};
    lane[1] = Lane{};
    phase = Phase::Prepared;
  }
  bool active() const { return phase == Phase::Running; }
  bool ready() const {
    return phase == Phase::Prepared && (!(mask & 1) || lane[0].ready) &&
           (!(mask & 2) || lane[1].ready);
  }
  bool begin(uint64_t now) {
    if (!ready())
      return false;
    start = now;
    phase = Phase::Running;
    return true;
  }
  bool sensor(uint8_t side, SensorEvent event, uint64_t now) {
    if (side > 1 || !(mask & (1 << side)))
      return false;
    Lane &l = lane[side];
    if (event == SensorEvent::Ready && phase == Phase::Prepared) {
      l.ready = l.present = true;
      return true;
    }
    if (phase != Phase::Running || l.done)
      return false;
    if (event == SensorEvent::Clink)
      return true;
    if (event == SensorEvent::Lift && !l.lifted) {
      l.lifted = true;
      l.present = false;
      l.lift = now;
      return true;
    }
    if (event == SensorEvent::Return && l.lifted && now >= l.lift) {
      l.present = true;
      l.done = true;
      l.returned = now;
      l.duration = now - l.lift;
      return true;
    }
    return false;
  }
  void finish() { phase = Phase::Finished; }
  void abort() {
    phase = Phase::Idle;
    mask = 0;
  }
};
// Real adapters implement this same interface. Demo changes inputs and clock only.
class SensorSource {
public:
  virtual ~SensorSource() {};
  virtual void arm(uint8_t side, uint32_t durationMs) = 0;
  virtual uint64_t timestamp() const = 0;
  virtual bool poll(uint64_t now, uint8_t &side, SensorEvent &event) = 0;
};
// Real hardware can feed timestamped events without introducing a second game engine.
class EventSensors : public SensorSource {
  struct Event {
    uint8_t side;
    SensorEvent kind;
    uint64_t at;
  };
  Event queue[16];
  uint8_t read = 0, write = 0;
  uint64_t emitted = 0;

public:
  void arm(uint8_t, uint32_t) override {}
  uint64_t timestamp() const override { return emitted; }
  bool feed(uint8_t side, SensorEvent event, uint64_t at) {
    uint8_t next = (write + 1) % 16;
    if (next == read || side > 1)
      return false;
    queue[write] = {side, event, at};
    write = next;
    return true;
  }
  bool poll(uint64_t, uint8_t &side, SensorEvent &event) override {
    if (read == write)
      return false;
    auto e = queue[read];
    read = (read + 1) % 16;
    side = e.side;
    event = e.kind;
    emitted = e.at;
    return true;
  }
};
class VirtualSensors : public SensorSource {
  uint64_t emitted = 0;
  uint8_t stage[2] = {0, 0};
  uint64_t due[2] = {0, 0};
  uint32_t duration[2] = {0, 0};

public:
  uint64_t timestamp() const override { return emitted; }
  void reset() { stage[0] = stage[1] = 0; }
  void arm(uint8_t s, uint32_t ms) override {
    if (s < 2) {
      stage[s] = 1;
      duration[s] = ms;
      due[s] = 0;
    }
  }
  bool poll(uint64_t now, uint8_t &side, SensorEvent &event) override {
    for (uint8_t s = 0; s < 2; ++s) {
      if (!stage[s])
        continue;
      side = s;
      emitted = now;
      if (stage[s] == 1) {
        event = SensorEvent::Clink;
        stage[s] = 2;
        return true;
      }
      if (stage[s] == 2) {
        event = SensorEvent::Lift;
        stage[s] = 3;
        due[s] = now + uint64_t(duration[s]) * 1000;
        return true;
      }
      if (stage[s] == 3 && now >= due[s]) {
        emitted = due[s];
        event = SensorEvent::Return;
        stage[s] = 0;
        return true;
      }
    }
    return false;
  }
  uint64_t next() const {
    uint64_t t = UINT64_MAX;
    for (int s = 0; s < 2; ++s)
      if (stage[s] == 1 || stage[s] == 2)
        return 0;
      else if (stage[s] == 3 && due[s] < t)
        t = due[s];
    return t;
  }
};
struct Result {
  bool done = false;
  uint64_t duration = 0, finish = 0;
};
class Relay {
public:
  uint8_t count = 0, masks[MaxDevices] = {}, next[2] = {0, 0};
  Result result[MaxDevices][2];
  uint64_t start = 0, starts[2] = {0, 0}, total[2] = {0, 0};
  bool completed = false;
  void reset(uint8_t n, const uint8_t *m, uint64_t now) {
    count = n;
    start = now;
    starts[0] = starts[1] = now;
    completed = false;
    total[0] = total[1] = 0;
    for (int i = 0; i < MaxDevices; ++i) {
      masks[i] = i < n ? m[i] : 0;
      for (int s = 0; s < 2; ++s)
        result[i][s] = Result{};
    }
    for (int s = 0; s < 2; ++s) {
      next[s] = 0;
      while (next[s] < count && !(masks[next[s]] & (1 << s)))
        ++next[s];
    }
  }
  void startSide(uint8_t side, uint64_t now) {
    if (side < 2)
      starts[side] = now;
  }
  bool accept(uint8_t device, uint8_t side, uint64_t duration, uint64_t finish) {
    if (device >= count || side > 1 || next[side] != device || result[device][side].done ||
        finish < starts[side] || duration > finish - starts[side])
      return false;
    result[device][side] = {true, duration, finish};
    do {
      ++next[side];
    } while (next[side] < count && !(masks[next[side]] & (1 << side)));
    if (next[side] == count)
      total[side] = finish - starts[side];
    completed = next[0] == count && next[1] == count;
    return true;
  }
};
} // namespace bp
