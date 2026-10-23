#!/usr/bin/env python3
"""Validate the Pass 06 graybox GLBs and their mechanical asset contract."""

from collections import Counter
from pathlib import Path
import argparse
import hashlib
import json
import re
import struct
import sys


def load_glb(path):
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError('file is too short')
    magic, version, declared_length = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF' or version != 2 or declared_length != len(data):
        raise ValueError('invalid glTF 2 header or declared length')
    offset = 12
    document = None
    binary_chunks = 0
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from('<I4s', data, offset)
        offset += 8
        chunk = data[offset:offset + chunk_length]
        offset += chunk_length
        if len(chunk) != chunk_length:
            raise ValueError('truncated GLB chunk')
        if chunk_type == b'JSON':
            if document is not None:
                raise ValueError('multiple JSON chunks')
            document = json.loads(chunk.rstrip(b' \0'))
        elif chunk_type == b'BIN\0':
            binary_chunks += 1
    if offset != len(data) or document is None or binary_chunks != 1:
        raise ValueError('invalid GLB chunk layout')
    return data, document


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root
    repo_root = Path(__file__).resolve().parents[5]
    registry = json.loads((repo_root / 'art/living-atlas/asset-registry.json').read_text())
    registered = {Path(item['path']).name: item for item in registry['assets'] if item['path'].endswith('.glb')}
    notes = []

    def check(condition, label):
        print(('PASS' if condition else 'FAIL') + ' ' + label)
        if not condition:
            notes.append(label)

    glb_dir = root / 'glb'
    paths = sorted(glb_dir.glob('*.glb'))
    check(len(paths) == 8, 'exactly eight Pass 06 GLBs')
    documents = {}
    for path in paths:
        try:
            data, document = load_glb(path)
        except (ValueError, json.JSONDecodeError, struct.error) as error:
            check(False, f'{path.name} valid GLB: {error}')
            continue
        documents[path.name] = document
        check(True, f'{path.name} valid glTF 2 binary')
        entry = registered.get(path.name)
        check(entry is not None, f'{path.name} registered')
        if entry:
            check(len(data) == entry['bytes'], f'{path.name} registered byte length')
            check(hashlib.sha256(data).hexdigest() == entry['sha256'], f'{path.name} registered SHA256')
        check(document.get('asset', {}).get('version') == '2.0', f'{path.name} asset version 2.0')
        check(len(document.get('scenes', [])) == 1 and document.get('scene') == 0, f'{path.name} one default scene')
        check(not document.get('materials'), f'{path.name} remains material-free graybox')
        primitives = [primitive for mesh in document.get('meshes', []) for primitive in mesh.get('primitives', [])]
        check(bool(primitives), f'{path.name} contains mesh primitives')
        check(all({'POSITION', 'COLOR_0'} <= set(p.get('attributes', {})) for p in primitives), f'{path.name} position and vertex colors')
        check(all(not ({'NORMAL', 'TANGENT', 'TEXCOORD_0'} & set(p.get('attributes', {}))) for p in primitives), f'{path.name} has no production normals, tangents or UVs')

    manifest = json.loads((root / 'manifest/graybox_manifest.json').read_text())
    check(manifest['coordinateSystem'] == 'glTF Y-up, gameplay XZ', 'Y-up / XZ coordinate contract')
    check(manifest['cellUnit'] == 1.0, 'one-unit cell contract')
    check(manifest['assembleFixture'] == {'rows': 5, 'cols': 5, 'rackCapacity': 10, 'rackLayout': [2, 5]}, 'Assemble manifest contract')
    check(manifest['planarFixture']['rows'] == 6 and manifest['planarFixture']['cols'] == 6, 'Planar 6x6 manifest contract')
    check(manifest['planarFixture']['kinds'] == ['sun', 'river', 'seed', 'ember', 'indigo', 'clay'], 'Planar six-kind manifest contract')

    assemble = documents.get('assemble_5x5_with_rack_graybox.glb', {})
    assemble_names = [node.get('name', '') for node in assemble.get('nodes', [])]
    board_pieces = [name for name in assemble_names if re.fullmatch(r'assemble\.piece\.\d+\.board', name)]
    rack_pieces = [name for name in assemble_names if re.fullmatch(r'assemble\.piece\.\d+\.rack', name)]
    rack_slots = [name for name in assemble_names if re.fullmatch(r'assemble\.rack\.slot\.[01]\.[0-4]', name)]
    check(len(board_pieces) == 15 and len(rack_pieces) == 10, 'Assemble 15 board + 10 rack piece fixtures')
    check(len(rack_slots) == 10, 'Assemble two-row ten-slot rack')
    check({int(name.split('.')[2]) for name in board_pieces + rack_pieces} == set(range(25)), 'Assemble stable piece IDs 0-24')

    planar = documents.get('planar_6x6_with_rails_graybox.glb', {})
    planar_names = [node.get('name', '') for node in planar.get('nodes', [])]
    tile_pattern = re.compile(r'planar\.tile\.r([0-5])\.c([0-5])\.(sun|river|seed|ember|indigo|clay)')
    tiles = [tile_pattern.fullmatch(name) for name in planar_names]
    tiles = [match for match in tiles if match]
    check(len(tiles) == 36, 'Planar exactly 36 named tile fixtures')
    check({(int(m.group(1)), int(m.group(2))) for m in tiles} == {(r, c) for r in range(6) for c in range(6)}, 'Planar complete 6x6 coordinates')
    check(Counter(m.group(3) for m in tiles) == Counter({kind: 6 for kind in manifest['planarFixture']['kinds']}), 'Planar six fixtures per kind')
    rails = {name for name in planar_names if name.startswith('planar.rail.channel.')}
    check(rails == {f'planar.rail.channel.{side}' for side in ('north', 'south', 'east', 'west')}, 'Planar four named rail channels')

    tile = documents.get('tile_beveled.glb', {})
    tile_primitive = tile.get('meshes', [{}])[0].get('primitives', [{}])[0]
    tile_position = tile.get('accessors', [{}])[tile_primitive.get('attributes', {}).get('POSITION', 0)] if tile else {}
    tile_min, tile_max = tile_position.get('min', []), tile_position.get('max', [])
    expected = manifest['tile']
    if len(tile_min) == 3 and len(tile_max) == 3:
        dimensions = [tile_max[i] - tile_min[i] for i in range(3)]
        check(abs(dimensions[0] - expected['width']) < 1e-5 and abs(dimensions[2] - expected['depth']) < 1e-5, 'tile width/depth match manifest')
        check(abs(dimensions[1] - expected['height']) < 1e-5 and abs(tile_min[1]) < 1e-6, 'tile height and bottom-center pivot match manifest')
    else:
        check(False, 'tile position bounds available')

    if notes:
        print(f'\nVALIDATION FAILED: {len(notes)} failed checks')
        return 1
    print('\nPASS 06 GLB/MECHANICAL CONTRACT CHECKS PASSED. NOT VERIFIED: Blender import, GPU UVs/materials, authored LODs, physical-device performance or art approval.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
