#!/usr/bin/env python3
"""Turn a MuJoCo MJCF robot into an ARTICULATED GLB the website can animate.

Unlike build_robot.py (which merges everything into a few static parts), this keeps the
kinematic tree: every MJCF body becomes a glTF node named after the body, with its local
transform, so the page can rotate joints. Meshes keep their original material colors.

Writes <out>.glb plus <out>.json with, per joint: the body node it moves, its axis (in the
body frame) and range; and per body: which part (head / torso / arms / hands / legs) it is.

Example:
  python3 tools/build_articulated.py --mjcf g1_with_hands.xml --out assets/g1 --faces 120000 \
      --parts '{"hands":"hand","legs":"hip|knee|ankle","arms":"shoulder|elbow|wrist","head":"head","torso":"."}'

Needs: pip install trimesh fast_simplification
"""
import argparse
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import trimesh
from trimesh.transformations import euler_matrix, quaternion_matrix, rotation_matrix, translation_matrix


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mjcf", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path, help="output path without extension")
    ap.add_argument("--parts", required=True, help='JSON {part: regex on "body/mesh"}; first match wins')
    ap.add_argument("--faces", type=int, default=120000, help="total face budget")
    ap.add_argument("--yaw", type=float, default=-np.pi / 2, help="turn so the robot faces +z (the camera)")
    a = ap.parse_args()
    parts = json.loads(a.parts)

    root = ET.parse(a.mjcf).getroot()
    comp = root.find("compiler").attrib if root.find("compiler") is not None else {}
    degrees = comp.get("angle", "degree") == "degree"
    meshdir = a.mjcf.parent / comp.get("meshdir", "")

    classes = {}

    def walk_defaults(el, inherited, name):
        g = dict(inherited)
        if el.find("geom") is not None:
            g.update(el.find("geom").attrib)
        classes[name] = g
        for child in el.findall("default"):
            walk_defaults(child, g, child.get("class"))

    if root.find("default") is not None:
        walk_defaults(root.find("default"), {}, "main")
    materials = {m.get("name"): [float(v) for v in m.get("rgba", "1 1 1 1").split()] for m in root.iter("material")}
    meshes = {(m.get("name") or Path(m.get("file")).stem): meshdir / m.get("file") for m in root.iter("mesh") if m.get("file")}

    def frame(el):
        T = translation_matrix([float(v) for v in el.get("pos", "0 0 0").split()])
        if el.get("quat"):
            T = T @ quaternion_matrix([float(v) for v in el.get("quat").split()])
        elif el.get("euler"):
            e = [float(v) for v in el.get("euler").split()]
            T = T @ euler_matrix(*(np.radians(e) if degrees else e), axes="sxyz")
        return T

    # pass 1: collect bodies, geoms, joints
    bodies, geoms, joints = [], [], {}

    def walk(body, parent, childclass):
        name = body.get("name")
        cc = body.get("childclass", childclass)
        bodies.append((name, parent, frame(body)))
        for j in body.findall("joint"):
            if j.get("type", "hinge") != "hinge":
                continue
            rng = [float(v) for v in j.get("range", "-3.14 3.14").split()]
            joints[j.get("name")] = {"body": name, "axis": [float(v) for v in j.get("axis", "0 0 1").split()],
                                     "range": rng, "pos": [float(v) for v in j.get("pos", "0 0 0").split()]}
        for g in body.findall("geom"):
            at = dict(classes.get(g.get("class", cc), classes.get("main", {})))
            at.update(g.attrib)
            if at.get("type", "sphere") != "mesh" or at.get("group", "0") == "3":
                continue
            rgba = materials.get(at["material"]) if at.get("material") else None
            rgba = rgba or [float(v) for v in at.get("rgba", "0.5 0.5 0.5 1").split()]
            if rgba[3] < 0.5:
                continue
            geoms.append((name, frame(g), at["mesh"], [*rgba[:3], 1.0]))
        for c in body.findall("body"):
            walk(c, name, cc)

    for b in root.find("worldbody").findall("body"):
        walk(b, None, None)

    # decimate all meshes by one ratio
    loaded = {}
    for _, _, mname, _ in geoms:
        if mname not in loaded:
            loaded[mname] = trimesh.load(meshes[mname], force="mesh")
    total = sum(len(loaded[m].faces) for _, _, m, _ in geoms)
    ratio = min(1.0, a.faces / total)

    scene = trimesh.Scene()
    base = "robot"
    scene.graph.update(frame_from=scene.graph.base_frame, frame_to=base, matrix=np.eye(4))
    for name, parent, T in bodies:
        scene.graph.update(frame_from=parent or base, frame_to=name, matrix=T)
    part_of = {}
    for i, (body, T, mname, rgba) in enumerate(geoms):
        m = loaded[mname].copy()
        tgt = max(200, int(len(m.faces) * ratio))
        if len(m.faces) > tgt:
            m = m.simplify_quadric_decimation(face_count=tgt, aggression=3)
        m.visual = trimesh.visual.ColorVisuals(m, face_colors=(np.array(rgba) * 255).astype(np.uint8))
        node = f"{body}__g{i}"
        scene.add_geometry(m, node_name=node, geom_name=node, parent_node_name=body, transform=T)
        # match on "body/mesh" so a head mesh fixed to the torso body still counts as head
        part_of[node] = next((p for p, rx in parts.items() if re.search(rx, f"{body}/{mname}")), "torso")

    # z-up -> y-up, face the camera, feet on the ground
    R = rotation_matrix(-np.pi / 2, [1, 0, 0]) @ rotation_matrix(a.yaw, [0, 0, 1])
    scene.graph.update(frame_from=scene.graph.base_frame, frame_to=base, matrix=R)
    lo, hi = scene.bounds
    shift = translation_matrix([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    scene.graph.update(frame_from=scene.graph.base_frame, frame_to=base, matrix=shift @ R)

    a.out.parent.mkdir(parents=True, exist_ok=True)
    glb = a.out.with_suffix(".glb")
    scene.export(glb)
    meta = {"joints": joints, "parts": part_of, "height": float(hi[1] - lo[1])}
    a.out.with_suffix(".json").write_text(json.dumps(meta, indent=1))
    faces = sum(len(g.faces) for g in scene.geometry.values())
    print(f"{glb}: {faces} faces, {glb.stat().st_size/1e6:.2f} MB, {len(joints)} joints, {len(bodies)} bodies")


if __name__ == "__main__":
    main()
