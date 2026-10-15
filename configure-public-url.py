#!/usr/bin/env python3
"""Set a proposed LAN URL without transmitting any network packets."""
import ipaddress
import os
import re
import socket
import sys
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parent

def main():
    target=ROOT/'.env';existing=target.read_text() if target.exists() else ''
    if len(sys.argv)==1 and re.search(r'^\s*BIERPETER_PUBLIC_URL\s*=\s*[^\s]+',existing,re.M):
        print('Einladungsadresse ist bereits lokal konfiguriert.');return 0
    if len(sys.argv)>1:value=sys.argv[1]
    else:
        try:
            with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:
                # connect() chooses the local route; no send(), no packets.
                s.connect(('192.0.2.1',9));host=s.getsockname()[0]
            address=ipaddress.ip_address(host)
            if not address.is_private or address.is_loopback:raise ValueError()
            value='http://'+host+':6017'
        except (OSError,ValueError):
            print('LAN-Adresse nicht eindeutig ermittelbar; sie kann in der Lobby eingestellt werden.');return 1
    from server import public_url, Error
    try:
        public_url(value)
    except (Error,ValueError):
        print('Ungültige LAN-Basisadresse.');return 1
    if any(c in value for c in "'\"\n\r$"):
        print('Ungültige LAN-Basisadresse.');return 1
    lines=[line for line in existing.splitlines() if not re.match(r'^\s*BIERPETER_PUBLIC_URL\s*=',line)]
    lines.append("BIERPETER_PUBLIC_URL='"+value.rstrip('/')+"'")
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600);os.fchmod(fd,0o600)
    with os.fdopen(fd,'w') as f:f.write('\n'.join(lines)+'\n')
    print('Vorgeschlagene Einladungsadresse:',value.rstrip('/'))
    print('Falls mehrere Netze aktiv sind, Erreichbarkeit vom Smartphone prüfen. Die Adresse bleibt in der Lobby änderbar.')
    return 0
if __name__=='__main__':raise SystemExit(main())
