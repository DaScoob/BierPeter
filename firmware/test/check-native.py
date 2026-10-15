#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Native engine and exact embedded-crypto interoperability checks."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[2]
LIB=ROOT/'firmware/.pio/libdeps/esp8266/Crypto'
with tempfile.TemporaryDirectory(prefix='bierpeter-native-') as tmp:
    common=['g++','-std=c++17','-O2','-I',str(ROOT/'firmware/include')]
    engine=Path(tmp)/'game'
    subprocess.run([*common,'-Wall','-Wextra','-Werror','-fsanitize=undefined',str(ROOT/'firmware/test/game.cpp'),'-o',str(engine)],check=True)
    subprocess.run([str(engine)],check=True)
    setup=Path(tmp)/'setup'
    subprocess.run([*common,'-Wall','-Wextra','-Werror','-fsanitize=undefined',str(ROOT/'firmware/test/setup.cpp'),'-o',str(setup)],check=True)
    subprocess.run([str(setup)],check=True)
    captive=Path(tmp)/'captive'
    subprocess.run([*common,'-Wall','-Wextra','-Werror','-fsanitize=undefined',str(ROOT/'firmware/test/captive.cpp'),'-o',str(captive)],check=True)
    subprocess.run([str(captive)],check=True)
    if not LIB.is_dir():raise SystemExit('Zuerst: pio pkg install -d firmware -e esp8266')
    names=['Curve25519','BigNumberUtil','SHA256','Hash','Crypto','GCM','GHASH','GF128','AES128','AES192','AES256','AESCommon','BlockCipher','AuthenticatedCipher','Cipher']
    binary=Path(tmp)/'crypto'
    subprocess.run([*common,'-I',str(LIB),'-ffunction-sections','-fdata-sections','-Wl,--gc-sections',str(ROOT/'firmware/test/crypto.cpp'),*[str(LIB/(p+'.cpp')) for p in names],'-o',str(binary)],check=True)
    vector=subprocess.check_output([str(binary)],text=True)
    subprocess.run(['node',str(ROOT/'tests/firmware-crypto.cjs')],input=vector,text=True,check=True,cwd=ROOT)
