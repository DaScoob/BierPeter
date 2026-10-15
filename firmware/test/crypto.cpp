// SPDX-License-Identifier: AGPL-3.0-only
#include "RunCrypto.h"
#include <AES.h>
#include <GCM.h>
#include <cassert>
#include <iomanip>
#include <iostream>
void hex(const uint8_t *p, size_t n) {
  for (size_t i = 0; i < n; ++i)
    std::cout << std::hex << std::setw(2) << std::setfill('0') << unsigned(p[i]);
  std::cout << '\n';
}
int main() {
  uint8_t a[32], b[32], pub[32], other[32], key[32], reverse[32], zero[32] = {}, iv[12] = {};
  for (int i = 0; i < 32; ++i) {
    a[i] = i + 1;
    b[i] = 100 + i;
  }
  assert(bp::publicRunKey(a, pub));
  assert(bp::publicRunKey(b, other));
  const char *scope = "BierPeter:result:v1:test-run:AABBCCDDEEFF:recipient";
  assert(bp::deriveRunKey(a, other, scope, strlen(scope), key));
  assert(bp::deriveRunKey(b, pub, scope, strlen(scope), reverse));
  assert(memcmp(key, reverse, 32) == 0);
  assert(!bp::deriveRunKey(a, zero, scope, strlen(scope), reverse));
  const char *plain =
      "{\"v\":1,\"run\":\"test-run\",\"demo\":true,\"total_us\":[3000000,4500000],\"splits\":[]}";
  uint8_t cipher[256], tag[16];
  GCM<AES256> g;
  assert(g.setKey(key, 32));
  assert(g.setIV(iv, 12));
  g.addAuthData(scope, strlen(scope));
  g.encrypt(cipher, reinterpret_cast<const uint8_t *>(plain), strlen(plain));
  g.computeTag(tag, 16);
  memcpy(cipher + strlen(plain), tag, 16);
  hex(pub, 32);
  hex(other, 32);
  hex(key, 32);
  hex(cipher, strlen(plain) + 16);
}
