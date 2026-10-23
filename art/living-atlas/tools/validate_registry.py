#!/usr/bin/env python3
"""Verify every committed asset recorded in the Living Atlas registry."""

from pathlib import Path
import argparse
import hashlib
import json
import sys


TEXT_SUFFIXES = {'.json', '.md', '.py', '.svg'}


def canonical_bytes(path):
    data = path.read_bytes()
    return data.replace(b'\r\n', b'\n') if path.suffix.lower() in TEXT_SUFFIXES else data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo-root', type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    registry_path = args.repo_root / 'art/living-atlas/asset-registry.json'
    registry = json.loads(registry_path.read_text())
    failures = []
    seen = set()

    def check(condition, label):
        print(('PASS' if condition else 'FAIL') + ' ' + label)
        if not condition:
            failures.append(label)

    check(registry.get('schemaVersion') == 1, 'registry schema version 1')
    check(registry.get('status') == 'concept-graybox-not-production', 'registry remains non-production')
    for entry in registry.get('assets', []):
        relative = entry.get('path', '')
        check(relative not in seen, f'unique registry path {relative}')
        seen.add(relative)
        path = args.repo_root / relative
        present = path.is_file()
        check(present, f'exists {relative}')
        if not present:
            continue
        data = canonical_bytes(path)
        check(len(data) == entry.get('bytes'), f'bytes {relative}')
        check(hashlib.sha256(data).hexdigest() == entry.get('sha256'), f'SHA256 {relative}')

    check(len(seen) == len(registry.get('assets', [])), 'all registry entries have unique paths')
    if failures:
        print(f'\nVALIDATION FAILED: {len(failures)} failed checks')
        return 1
    print(f'\nLIVING ATLAS REGISTRY PASSED: {len(seen)} assets. Source-archive paths, rights, cultural review and production approval are not verified.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
