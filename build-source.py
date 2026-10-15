#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Build the running source offer from an explicit file manifest, never from /data."""
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parent


def build(target):
    paths = (ROOT / 'SOURCE_FILES.txt').read_text().splitlines()
    with tarfile.open(target, 'w:gz') as archive:
        for entry in paths:
            path = ROOT / entry
            if not entry or path.is_symlink() or not path.is_file() or '..' in Path(entry).parts or Path(entry).is_absolute():
                raise ValueError('Invalid source manifest entry')
            archive.add(path, arcname='BierPeter/' + entry, recursive=False)


if __name__ == '__main__':
    import sys
    build(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'source.tar.gz')
