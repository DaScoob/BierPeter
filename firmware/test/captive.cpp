// SPDX-License-Identifier: AGPL-3.0-only
#include "CaptivePortal.h"
#include <assert.h>
#include <initializer_list>
#include <stdio.h>

int main() {
  using bp::PortalRoute;
  for (const char *host : {"192.168.4.1", "192.168.4.1:80"}) {
    assert(bp::portalRoute(true, true, host) == PortalRoute::Page);
    assert(bp::portalRoute(false, true, host) == PortalRoute::Deny);
    assert(bp::portalRoute(true, false, host) == PortalRoute::Redirect);
  }
  // Includes arbitrary sites at '/', hostile prefix lookalikes, alternate
  // ports and OS probe origins. None may host the configuration form.
  for (const char *host : {"example.org", "connectivitycheck.gstatic.com", "captive.apple.com",
                           "www.msftconnecttest.com", "", "192.168.4.1.evil.example",
                           "192.168.4.10", "192.168.4.1:8080"}) {
    assert(bp::portalRoute(true, true, host) == PortalRoute::Redirect);
    assert(bp::portalRoute(false, true, host) == PortalRoute::Deny);
  }
  assert(bp::portalRoute(true, true, nullptr) == PortalRoute::Redirect);
  assert(!bp::portalScanReady(60000000, 0)); // OS probes alone never start scans.
  assert(!bp::portalScanReady(100, 200));
  assert(!bp::portalScanReady(8000099, 100));
  assert(bp::portalScanReady(8000100, 100));
  assert(bp::portalScanReady(9000100, 100));
  assert(!bp::portalScanReady(9000100, 100, 17000100));
  assert(bp::portalScanReady(17000100, 100, 17000100));
  assert(!bp::portalScanReady(17000100, 16000100, 17000100));
  puts("Captive portal: canonical origins, probe redirects, LAN denial and "
       "scan grace OK");
}
