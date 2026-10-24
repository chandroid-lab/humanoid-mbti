#!/usr/bin/env python3
"""Turn a robot URDF + STL meshes into one small GLB for the website.

- Poses the robot with forward kinematics (joint angles from --pose).
- Decimates every mesh so the whole robot fits a face budget (mobile friendly).
- Keeps each link's original URDF color (stored as vertex colors).
- Merges links into named parts (head / torso / arms / hands / legs / base) so the
  page can highlight one part per research field.
- Converts URDF z-up to glTF y-up and puts the feet on y=0.

Example:
  python3 tools/build_robot.py --urdf EIR.urdf --mesh-dir meshes/ --out assets/eir.glb \
      --parts '{"head":"head_","torso":"torso_","arms":"arm_link","base":"base_"}' \
      --pose '{"Joint_L3_L":1.3,"Joint_L3_R":-1.3}' --faces 60000

Needs: pip install trimesh fast_simplification
"""
import argparse
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import trimesh
from trimesh.transformations import euler_matrix, rotation_matrix, translation_matrix


def origin_matrix(el):
    if el is None:
        return np.eye(4)
    xyz = [float(v) for v in el.get("xyz", "0 0 0").split()]
    rpy = [float(v) for v in el.get("rpy", "0 0 0").split()]
    return translation_matrix(xyz) @ euler_matrix(*rpy, axes="sxyz")


def find_mesh(filename, urdf_dir, mesh_dirs):
    name = Path(filename.replace("package://", "")).name
    rel = urdf_dir / filename
    if not filename.startswith("package://") and rel.exists():
        return rel
    for d in mesh_dirs:
        if (d / name).exists():
            return d / name
    raise FileNotFoundError(filename)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--urdf", required=True, type=Path)
    ap.add_argument("--mesh-dir", action="append", default=[], type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--parts", required=True, help='JSON {part: regex on link name}; first match wins')
    ap.add_argument("--pose", default="{}", help="JSON {joint_name: angle_rad}")
    ap.add_argument("--faces", type=int, default=60000, help="total face budget")
    ap.add_argument("--skip", default="", help="regex of link names to leave out")
    ap.add_argument("--replace", default="{}", help='JSON {link: "box:x,y,z"} simple stand-in shapes')
    ap.add_argument("--yaw", type=float, default=0.0, help="turn the robot (rad, about vertical) so it faces the camera")
    a = ap.parse_args()

    root = ET.parse(a.urdf).getroot()
    parts = json.loads(a.parts)
    pose = json.loads(a.pose)
    replace = json.loads(a.replace)
    skip = re.compile(a.skip) if a.skip else None

    joints = {}
    for j in root.findall("joint"):
        child = j.find("child").get("link")
        axis = j.find("axis")
        joints[child] = dict(
            name=j.get("name"), type=j.get("type"), parent=j.find("parent").get("link"),
            T=origin_matrix(j.find("origin")),
            axis=[float(v) for v in axis.get("xyz").split()] if axis is not None else [0, 0, 1],
        )

    # URDF colors: named materials at the top level, or inline <material><color> per visual
    named = {}
    for m in root.findall("material"):
        c = m.find("color")
        if c is not None:
            named[m.get("name")] = [float(v) for v in c.get("rgba").split()]

    def visual_rgba(vis):
        m = vis.find("material")
        if m is None:
            return None
        c = m.find("color")
        if c is not None:
            return [float(v) for v in c.get("rgba").split()]
        return named.get(m.get("name"))

    cache = {}

    def world(link):
        if link in cache:
            return cache[link]
        if link not in joints:
            cache[link] = np.eye(4)
            return cache[link]
        j = joints[link]
        q = pose.get(j["name"], 0.0)
        M = j["T"] @ (rotation_matrix(q, j["axis"]) if j["type"] in ("revolute", "continuous") and q else np.eye(4))
        cache[link] = world(j["parent"]) @ M
        return cache[link]

    # collect visual meshes
    items = []
    for link in root.findall("link"):
        name = link.get("name")
        if skip and skip.search(name):
            continue
        part = next((p for p, rx in parts.items() if re.search(rx, name)), None)
        if part is None:
            continue
        for vis in link.findall("visual"):
            if name in replace:
                kind, dims = replace[name].split(":")
                mesh = trimesh.creation.box(extents=[float(v) for v in dims.split(",")])
            elif vis.find("geometry/box") is not None:
                mesh = trimesh.creation.box(extents=[float(v) for v in vis.find("geometry/box").get("size").split()])
            elif vis.find("geometry/cylinder") is not None:
                c = vis.find("geometry/cylinder")
                mesh = trimesh.creation.cylinder(radius=float(c.get("radius")), height=float(c.get("length")), sections=32)
            elif vis.find("geometry/sphere") is not None:
                mesh = trimesh.creation.icosphere(radius=float(vis.find("geometry/sphere").get("radius")))
            else:
                m = vis.find("geometry/mesh")
                if m is None:
                    continue
                mesh = trimesh.load(find_mesh(m.get("filename"), a.urdf.parent, a.mesh_dir), force="mesh")
                if m.get("scale"):
                    mesh.apply_scale([float(v) for v in m.get("scale").split()])
            rgba = visual_rgba(vis)
            if rgba is None and hasattr(mesh.visual, "main_color"):
                rgba = (np.array(mesh.visual.main_color) / 255.0).tolist()  # color stored in the mesh file
            items.append((part, world(name) @ origin_matrix(vis.find("origin")), mesh, rgba or [0.7, 0.7, 0.7, 1]))

    # decimate: share the budget in proportion to sqrt(face count) so small parts keep detail
    weights = np.array([np.sqrt(len(m.faces)) for _, _, m, _ in items])
    targets = np.maximum(200, (weights / weights.sum() * a.faces).astype(int))
    merged = {}
    for (part, T, mesh, rgba), tgt in zip(items, targets):
        if len(mesh.faces) > 4 * tgt:
            # CAD exports often hold thousands of screws and tiny details that block decimation;
            # drop pieces smaller than 3% of the mesh size (invisible at web size).
            diag = np.linalg.norm(mesh.extents)
            pieces = [c for c in mesh.split(only_watertight=False) if np.linalg.norm(c.extents) >= 0.03 * diag]
            if pieces:
                mesh = trimesh.util.concatenate(pieces)
        if len(mesh.faces) > tgt:
            mesh = mesh.simplify_quadric_decimation(face_count=int(tgt), aggression=7)
        mesh.apply_transform(T)
        mesh.visual = trimesh.visual.ColorVisuals(mesh, face_colors=(np.array(rgba) * 255).astype(np.uint8))
        merged.setdefault(part, []).append(mesh)

    scene = trimesh.Scene()
    zup_to_yup = rotation_matrix(-np.pi / 2, [1, 0, 0]) @ rotation_matrix(a.yaw, [0, 0, 1])
    all_meshes = {p: trimesh.util.concatenate(ms) for p, ms in merged.items()}
    for m in all_meshes.values():
        m.apply_transform(zup_to_yup)
    bounds = np.vstack([m.bounds for m in all_meshes.values()])
    lo, hi = bounds.min(0), bounds.max(0)
    shift = [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2]
    for p, m in all_meshes.items():
        m.apply_translation(shift)
        scene.add_geometry(m, node_name=p, geom_name=p)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    scene.export(a.out)
    total = sum(len(m.faces) for m in all_meshes.values())
    print(f"{a.out}: {total} faces, {a.out.stat().st_size/1e6:.2f} MB, height {hi[1]-lo[1]:.2f} m, parts {list(all_meshes)}")


if __name__ == "__main__":
    main()
