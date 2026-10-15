// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include "RunCrypto.h"
#include <AES.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Crypto.h>
#include <Curve25519.h>
#include <GCM.h>
#include <SHA256.h>
#if defined(ESP32)
#include <esp_system.h>
#else
extern "C" {
#include <user_interface.h>
}
#endif
namespace sealed {
inline void randomBytes(uint8_t *p, size_t n) {
#if defined(ESP32)
  esp_fill_random(p, n);
#else
  os_get_random(p, n);
#endif
}
inline String hex(const uint8_t *p, size_t n) {
  String s;
  s.reserve(n * 2);
  const char *h = "0123456789abcdef";
  for (size_t i = 0; i < n; ++i) {
    s += h[p[i] >> 4];
    s += h[p[i] & 15];
  }
  return s;
}
inline bool unhex(const String &s, uint8_t *p, size_t n) {
  if (s.length() != n * 2)
    return false;
  for (size_t i = 0; i < n; ++i) {
    char a = s[2 * i], b = s[2 * i + 1];
    if (!isxdigit(a) || !isxdigit(b))
      return false;
    p[i] = (strtol(s.substring(i * 2, i * 2 + 2).c_str(), nullptr, 16));
  }
  return true;
}
inline String b64(const uint8_t *p, size_t n) {
  const char *h = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String s;
  s.reserve((n + 2) / 3 * 4);
  for (size_t i = 0; i < n; i += 3) {
    uint32_t v = uint32_t(p[i]) << 16;
    if (i + 1 < n)
      v |= uint32_t(p[i + 1]) << 8;
    if (i + 2 < n)
      v |= p[i + 2];
    s += h[(v >> 18) & 63];
    s += h[(v >> 12) & 63];
    s += i + 1 < n ? h[(v >> 6) & 63] : '=';
    s += i + 2 < n ? h[v & 63] : '=';
  }
  return s;
}
inline bool unb64(const String &s, uint8_t *p, size_t cap, size_t &n) {
  n = 0;
  uint32_t v = 0;
  int bits = 0;
  for (size_t i = 0; i < s.length(); ++i) {
    char c = s[i];
    if (c == '=')
      break;
    const char *h = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const char *q = strchr(h, c);
    if (!q)
      return false;
    v = (v << 6) | (q - h);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (n >= cap)
        return false;
      p[n++] = (v >> bits) & 255;
    }
  }
  return true;
}
class Box {
  uint8_t secret[32], pub[32];
  bool derive(const String &peer, const String &scope, uint8_t key[32]) {
    uint8_t other[32];
    if (!unhex(peer, other, 32))
      return false;
    return bp::deriveRunKey(secret, other, scope.c_str(), scope.length(), key);
  }

public:
  void begin(const uint8_t *stored = nullptr) {
    if (stored)
      memcpy(secret, stored, 32);
    else
      randomBytes(secret, 32);
    bp::publicRunKey(secret, pub);
  }
  void exportSecret(uint8_t *out) const { memcpy(out, secret, 32); }
  String publicKey() const { return hex(pub, 32); }
  bool seal(const String &peer, const String &scope, const String &plain, JsonObject out) {
    uint8_t key[32], iv[12], tag[16];
    if (!derive(peer, scope, key))
      return false;
    randomBytes(iv, 12);
    GCM<AES256> g;
    g.setKey(key, 32);
    g.setIV(iv, 12);
    g.addAuthData(scope.c_str(), scope.length());
    size_t n = plain.length();
    uint8_t *buf = new (std::nothrow) uint8_t[n + 16];
    if (!buf) {
      clean(key, 32);
      return false;
    }
    g.encrypt(buf, reinterpret_cast<const uint8_t *>(plain.c_str()), n);
    g.computeTag(tag, 16);
    memcpy(buf + n, tag, 16);
    out["v"] = 1;
    out["alg"] = "X25519-HKDF-SHA256-A256GCM";
    out["public"] = publicKey();
    out["iv"] = b64(iv, 12);
    out["ciphertext"] = b64(buf, n + 16);
    clean(key, 32);
    delete[] buf;
    return true;
  }
  bool open(const String &peer, const String &scope, JsonObjectConst in, String &plain) {
    if (in["public"].as<String>() != peer || in["alg"].as<String>() != "X25519-HKDF-SHA256-A256GCM")
      return false;
    uint8_t key[32], iv[12];
    size_t ivn, n;
    String cipher = in["ciphertext"].as<String>();
    if (cipher.length() > 9000 || !derive(peer, scope, key) ||
        !unb64(in["iv"].as<String>(), iv, 12, ivn) || ivn != 12)
      return false;
    uint8_t *buf = new (std::nothrow) uint8_t[cipher.length() + 1];
    if (!buf) {
      clean(key, 32);
      return false;
    }
    bool ok = unb64(cipher, buf, cipher.length(), n) && n >= 16;
    if (ok) {
      GCM<AES256> g;
      g.setKey(key, 32);
      g.setIV(iv, 12);
      g.addAuthData(scope.c_str(), scope.length());
      uint8_t tag[16];
      memcpy(tag, buf + n - 16, 16);
      g.decrypt(buf, buf, n - 16);
      ok = g.checkTag(tag, 16);
      if (ok) {
        buf[n - 16] = 0;
        plain = String((char *)buf);
      }
    }
    clean(key, 32);
    delete[] buf;
    return ok;
  }
};
} // namespace sealed
