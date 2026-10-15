// SPDX-License-Identifier: AGPL-3.0-only
#pragma once
#include <Crypto.h>
#include <Curve25519.h>
#include <SHA256.h>
#include <string.h>
namespace bp {
inline void clampX25519(uint8_t key[32]) {
  key[0] &= 248;
  key[31] = (key[31] & 127) | 64;
}
inline bool publicRunKey(const uint8_t secret[32], uint8_t publicKey[32]) {
  uint8_t scalar[32];
  memcpy(scalar, secret, 32);
  clampX25519(scalar);
  bool ok = Curve25519::eval(publicKey, scalar, nullptr);
  clean(scalar, 32);
  return ok;
}
inline bool deriveRunKey(const uint8_t secret[32], const uint8_t peer[32], const char *scope,
                         size_t length, uint8_t key[32]) {
  uint8_t shared[32], prk[32], scalar[32];
  memcpy(scalar, secret, 32);
  clampX25519(scalar);
  bool valid = Curve25519::eval(shared, scalar, peer);
  clean(scalar, 32);
  if (!valid) {
    clean(shared, 32);
    return false;
  }
  uint8_t nonzero = 0;
  for (auto b : shared)
    nonzero |= b;
  if (!nonzero) {
    clean(shared, 32);
    return false;
  }
  const char *salt = "BierPeter:run:v1";
  SHA256 h;
  h.resetHMAC(salt, strlen(salt));
  h.update(shared, 32);
  h.finalizeHMAC(salt, strlen(salt), prk, 32);
  h.resetHMAC(prk, 32);
  h.update(scope, length);
  const uint8_t one = 1;
  h.update(&one, 1);
  h.finalizeHMAC(prk, 32, key, 32);
  clean(shared, 32);
  clean(prk, 32);
  return true;
}
} // namespace bp
