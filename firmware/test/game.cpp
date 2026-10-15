// SPDX-License-Identifier: AGPL-3.0-only
#include "Game.h"
#include <cassert>
#include <iostream>
#include <random>
using namespace bp;
int main() {
  Engine g;
  g.prepare(3, true);
  assert(!g.begin(0));
  assert(g.sensor(0, SensorEvent::Ready, 0));
  assert(g.sensor(1, SensorEvent::Ready, 0));
  assert(g.begin(1000000));
  assert(!g.sensor(0, SensorEvent::Return, 1000001));
  assert(g.sensor(0, SensorEvent::Lift, 1000001));
  assert(g.sensor(0, SensorEvent::Return, 1000002));
  assert(g.lane[0].duration == 1);
  assert(!g.sensor(0, SensorEvent::Return, 1000003));
  // No penalty, no timeout, arbitrarily fast real measurement and hours-long run.
  assert(g.sensor(1, SensorEvent::Lift, 1000000));
  assert(g.sensor(1, SensorEvent::Return, 100000000000ULL));
  assert(g.active());
  std::mt19937 rng(20261015);
  unsigned runs = 0, measurements = 0;
  for (int iteration = 0; iteration < 20000; ++iteration) {
    uint8_t count = 1 + rng() % 8, masks[8] = {};
    Engine devices[8];
    VirtualSensors sensors[8];
    uint64_t clock = 1000000;
    Relay relay;
    for (int i = 0; i < count; ++i) {
      masks[i] = 1 + rng() % 3;
      devices[i].prepare(masks[i], true);
      for (int s = 0; s < 2; ++s)
        if (masks[i] & (1 << s))
          devices[i].sensor(s, SensorEvent::Ready, clock);
      assert(devices[i].begin(clock));
    }
    masks[0] = 3;
    devices[0].prepare(3, true);
    devices[0].sensor(0, SensorEvent::Ready, clock);
    devices[0].sensor(1, SensorEvent::Ready, clock);
    assert(devices[0].begin(clock));
    relay.reset(count, masks, clock);
    for (int s = 0; s < 2; ++s)
      sensors[relay.next[s]].arm(s, 3000 + rng() % 12001);
    int steps = 0;
    while (!relay.completed) {
      uint64_t next = UINT64_MAX;
      for (int i = 0; i < count; ++i) {
        uint8_t side;
        SensorEvent event;
        while (sensors[i].poll(clock, side, event)) {
          assert(devices[i].sensor(side, event, clock));
          if (event == SensorEvent::Return) {
            auto &l = devices[i].lane[side];
            assert(l.duration >= 3000000 && l.duration <= 15000000);
            assert(relay.accept(i, side, l.duration, l.returned));
            assert(!relay.accept(i, side, l.duration, l.returned));
            ++measurements;
            if (relay.next[side] < count)
              sensors[relay.next[side]].arm(side, 3000 + rng() % 12001);
          }
        }
      }
      for (int i = 0; i < count; ++i)
        if (sensors[i].next() < next)
          next = sensors[i].next();
      if (next != UINT64_MAX && next > clock)
        clock = next;
      else
        ++clock;
      assert(++steps < 200);
    }
    for (int s = 0; s < 2; ++s) {
      uint64_t sum = 0, last = 0;
      for (int i = 0; i < count; ++i)
        if (masks[i] & (1 << s)) {
          assert(relay.result[i][s].done);
          sum += relay.result[i][s].duration;
          last = relay.result[i][s].finish;
        }
      assert(relay.total[s] == last - relay.start);
      assert(relay.total[s] >= sum);
    }
    ++runs;
  }
  // Handover delay is included, rather than summing drink times.
  uint8_t masks[] = {3, 3};
  Relay r;
  r.reset(2, masks, 0);
  assert(r.accept(0, 0, 3000000, 3000000));
  assert(r.accept(1, 0, 3000000, 7000000));
  assert(r.total[0] == 7000000);
  std::cout << runs << " simulated runs; " << measurements
            << " individual measurements; all invariants passed\n";
}
