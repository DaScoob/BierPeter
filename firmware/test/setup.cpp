// SPDX-License-Identifier: AGPL-3.0-only
#include "SetupFlow.h"
#include <cassert>
#include <cstring>
#include <iostream>
using namespace bp;
int main() {
  SetupFlow f;
  assert(!f.begin(1, false));
  f.saved();
  assert(f.revision == 1);
  assert(!f.begin(10, true));
  assert(f.begin(10, false));
  assert(f.testing());
  assert(!f.online(10, false));
  assert(!f.wifi(false, 100));
  assert(f.wifi(true, 200));
  assert(f.stage == SetupStage::Health);
  f.health(true, 300);
  assert(f.stage == SetupStage::Auth);
  f.auth(false, true);
  assert(f.stage == SetupStage::Failed);
  assert(strstr(f.error, "Zugriffsschlüssel"));
  assert(!f.passed());
  assert(f.begin(1000, false));
  assert(f.wifi(true, 2000));
  f.health(false, 3000);
  assert(f.stage == SetupStage::Failed);
  assert(strstr(f.error, "Server"));
  assert(f.begin(4000, false));
  f.wifi(false, 20004000);
  assert(f.stage == SetupStage::Failed);
  assert(strstr(f.error, "WLAN"));
  assert(f.begin(21000000, false));
  f.wifi(true, 21000001);
  f.tick(31000001, false);
  assert(f.stage == SetupStage::Failed);
  assert(f.begin(32000000, false));
  f.tick(32000001, true);
  assert(f.stage == SetupStage::Failed);
  assert(!f.online(32000002, false));
  assert(f.begin(40000000, false));
  f.wifi(true, 40000001);
  f.health(true, 40000002);
  f.auth(true, false);
  assert(f.passed());
  assert(!f.online(40000003, true));
  f.saved();
  assert(f.revision == 2 && !f.passed());
  assert(!f.online(40000004, false));
  assert(f.begin(50000000, false));
  f.wifi(true, 50000001);
  f.health(true, 50000002);
  f.auth(true, false);
  assert(f.passed());
  assert(f.online(50000003, false));
  assert(f.busy());
  assert(!f.switchDue(56000002));
  assert(f.switchDue(56000003));
  assert(f.stage == SetupStage::Online);
  assert(!f.begin(56000004, true));
  // Duplicate/late HTTP responses do not revive a timed-out or invalidated test.
  f.saved();
  assert(f.begin(60000000, false));
  f.wifi(true, 60000001);
  f.tick(70000001, false);
  f.health(true, 70000002);
  f.auth(true, false);
  assert(f.stage == SetupStage::Failed && !f.passed());
  f.saved();
  f.auth(true, false);
  assert(!f.passed());
  std::cout << "Setup FSM passed: staged test, bad credentials/server, deadlines, run priority, "
               "invalidation, explicit online transition and late replies.\n";
}
