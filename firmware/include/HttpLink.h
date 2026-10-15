// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include "Platform.h"
// LAN HTTP is deliberately asynchronous. Private measurements are sealed before use.
// HTTPS origins are rejected, never downgraded and never accepted with insecure TLS.
class HttpLink {
  AsyncClient client;
  String request;
  char *rx = nullptr;
  size_t length = 0;
  bool done = false, busyFlag = false, failed = false;

public:
  String tag;
  void begin() {
    client.onConnect(
        [](void *arg, AsyncClient *c) {
          auto *h = (HttpLink *)arg;
          c->write(h->request.c_str(), h->request.length());
        },
        this);
    client.onData(
        [](void *arg, AsyncClient *c, void *p, size_t n) {
          auto *h = (HttpLink *)arg;
          bool overflow;
          BP_LOCK();
          overflow = !h->rx || h->length + n > 8191;
          if (!overflow) {
            memcpy(h->rx + h->length, p, n);
            h->length += n;
            h->rx[h->length] = 0;
          } else
            h->failed = true;
          BP_UNLOCK();
          if (overflow)
            c->close(true);
        },
        this);
    client.onDisconnect(
        [](void *arg, AsyncClient *) {
          auto *h = (HttpLink *)arg;
          BP_LOCK();
          h->done = true;
          BP_UNLOCK();
        },
        this);
    client.onError(
        [](void *arg, AsyncClient *, int8_t) {
          auto *h = (HttpLink *)arg;
          BP_LOCK();
          h->failed = true;
          h->done = true;
          BP_UNLOCK();
        },
        this);
    client.onTimeout(
        [](void *arg, AsyncClient *c, uint32_t) {
          auto *h = (HttpLink *)arg;
          BP_LOCK();
          h->failed = true;
          BP_UNLOCK();
          c->close(true);
        },
        this);
    client.setRxTimeout(4);
  }
  bool busy() const { return busyFlag; }
  bool send(const String &origin, const String &key, const String &method, const String &path,
            const String &body, const String &kind) {
    if (busyFlag || !origin.startsWith("http://"))
      return false;
    String authority = origin.substring(7);
    if (authority.indexOf('/') >= 0 || authority.indexOf('@') >= 0 ||
        authority.indexOf('\r') >= 0 || authority.indexOf('\n') >= 0)
      return false;
    int colon = authority.indexOf(':');
    String host = colon < 0 ? authority : authority.substring(0, colon);
    uint16_t port = colon < 0 ? 80 : authority.substring(colon + 1).toInt();
    if (!port || !host.length())
      return false;
    rx = new (std::nothrow) char[8192];
    if (!rx)
      return false;
    request = method + " " + path + " HTTP/1.0\r\nHost: " + authority +
              "\r\nConnection: close\r\nX-Device-Key: " + key +
              "\r\nContent-Type: application/json\r\nContent-Length: " + String(body.length()) +
              "\r\n\r\n" + body;
    BP_LOCK();
    length = 0;
    done = false;
    failed = false;
    busyFlag = true;
    BP_UNLOCK();
    tag = kind;
    if (!client.connect(host.c_str(), port)) {
      BP_LOCK();
      failed = true;
      done = true;
      BP_UNLOCK();
    }
    return true;
  }
  bool receive(String &kind, String &body, int &status) {
    BP_LOCK();
    bool ready = done;
    BP_UNLOCK();
    if (!busyFlag || !ready)
      return false;
    status = 0;
    body = "";
    if (!failed) {
      String response(rx);
      status = response.substring(9, 12).toInt();
      int split = response.indexOf("\r\n\r\n");
      if (split >= 0)
        body = response.substring(split + 4);
    }
    kind = tag;
    request = "";
    delete[] rx;
    rx = nullptr;
    busyFlag = false;
    return true;
  }
};
