#!/usr/bin/env python3
"""Import the existing firmware device key locally, without printing secrets."""
import ast
import os
import re
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent

def key_from(path):
    try:
        content = path.read_text()
    except (OSError, UnicodeError):
        return None
    macro = re.search(r'^\s*#define\s+DEVICE_API_KEY\s+("(?:[^"\\]|\\.)*")', content, re.M)
    env = re.search(r'^\s*DEVICE_API_KEY\s*=\s*(.+?)\s*$', content, re.M)
    if macro:
        try: key=ast.literal_eval(macro[1])
        except (ValueError,SyntaxError): return None
    elif env:
        key=env[1].strip().strip("'\"")
    else:
        return None
    if len(key)<32 or 'REPLACE_WITH' in key or not re.fullmatch(r'[A-Za-z0-9_!@#%+=:.,/\-]{32,256}',key):
        return None
    return key

def discover():
    candidates=[]
    roots=[p for p in Path.home().iterdir() if p.is_dir() and re.search(r'esp|race|bier|firmware|arduino|platformio|projekt|document|dokument',p.name,re.I)]
    for root in roots:
        for directory,dirs,files in os.walk(root):
            rel=Path(directory).relative_to(root)
            dirs[:]=[d for d in dirs if not d.startswith('.') and d not in ('node_modules','venv','data','target','build') and len(rel.parts)<6]
            for name in ('secrets.h','.env'):
                if name in files and (name=='secrets.h' or re.search(r'esp|race|bier',directory,re.I)):
                    path=Path(directory)/name
                    if path.resolve()!=(ROOT/'.env').resolve():candidates.append(path)
    return candidates

def main():
    if len(sys.argv)==1 and key_from(ROOT/'.env'):
        print('Geräteschlüssel ist in der lokalen .env bereits konfiguriert.')
        return 0
    paths=[Path(sys.argv[1]).expanduser()] if len(sys.argv)>1 else discover()
    found={}
    for p in paths:
        key=key_from(p)
        if key:found.setdefault(key,[]).append(p)
    if len(found)>1:
        print('Mehrere Geräteschlüssel gefunden. Das passende secrets.h explizit angeben:')
        for candidates in found.values():
            for p in candidates:print(p)
        print('Aufruf: python3 configure-device-key.py /vollständiger/Pfad/secrets.h')
        return 1
    if not found:
        print('Kein eindeutiger Geräteschlüssel gefunden. Es wurden keine Dateien verändert.')
        print('Aufruf mit der vorhandenen Firmwaredatei: python3 configure-device-key.py /vollständiger/Pfad/secrets.h')
        return 1
    key=next(iter(found))
    path=ROOT/'.env'
    existing=path.read_text() if path.exists() else ''
    lines=[line for line in existing.splitlines() if not re.match(r'^\s*DEVICE_API_KEY\s*=',line)]
    lines.append("DEVICE_API_KEY='"+key+"'")
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    os.fchmod(fd,0o600)
    with os.fdopen(fd,'w') as f:f.write('\n'.join(lines)+'\n')
    print('Vorhandener Firmware-Geräteschlüssel lokal übernommen. Schlüsselwert wird nicht ausgegeben.')
    return 0
if __name__=='__main__':raise SystemExit(main())
