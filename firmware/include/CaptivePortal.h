// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include <stdint.h>
#include <string.h>

namespace bp {
enum class PortalRoute : uint8_t { Deny, Page, Redirect };

// Only the canonical root serves HTML. Foreign hosts, even at '/', must
// redirect so a browser leaves the intercepted origin before entering secrets.
inline PortalRoute portalRoute(bool accessPoint, bool root, const char *host) {
  if (!accessPoint)
    return PortalRoute::Deny;
  if (root && host && (!strcmp(host, "192.168.4.1") || !strcmp(host, "192.168.4.1:80")))
    return PortalRoute::Page;
  return PortalRoute::Redirect;
}

// Each actual portal load, rather than an OS probe, starts this grace
// period. Scans temporarily visit other channels even with an asynchronous API.
inline bool portalScanReady(uint64_t now, uint64_t lastPage, uint64_t quietUntil = 0) {
  return lastPage && now >= lastPage && now >= quietUntil && now - lastPage >= 8000000;
}
} // namespace bp
