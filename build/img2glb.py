#!/usr/bin/env python
"""
img2glb - turn a picture of a thing into a web-ready 3D model.

A local stand-in for Tripo's image-to-3D service, built on TripoSR (MIT, the
open release from the same people). Runs on Apple Silicon via MPS.

    img2glb brain.png busts.png --out models/

Pipeline, per image:
    1. reconstruct   TripoSR predicts a radiance field, marching cubes -> mesh
    2. simplify      quadric decimation to a triangle budget
    3. export        GLB with vertex colours, optionally meshopt compressed

Raw TripoSR output is 4 to 6 MB, which is already in the range the web wants,
but --target-tris and --compress bring a set of specimens down to roughly a
third of that with no visible difference at the sizes a page renders them.

Notes for future me:
  - torchmcubes will not build on Apple Silicon. TripoSR/tsr/models/mcubes_shim.py
    replaces it with scikit-image and is wired in via isosurface.py.
  - transformers must be pinned to 4.35: the checkpoint uses the legacy ViT
    parameter names and silently fails to load on anything newer.
  - Feed it a cut-out image with a transparent background and pass --no-remove-bg;
    the built in rembg pass is only for photos that still have a background.
"""
import argparse
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "TripoSR"))

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("HF_HOME", str(HERE.parent / "hf"))

import numpy as np                      # noqa: E402
import torch                            # noqa: E402
import trimesh                          # noqa: E402
from PIL import Image                   # noqa: E402


def pick_device(requested):
    if requested:
        return requested
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda:0"
    return "cpu"


def load_image(path, foreground_ratio, remove_bg):
    im = Image.open(path)
    if remove_bg:
        import rembg
        im = rembg.remove(im.convert("RGB"), session=rembg.new_session())
    im = im.convert("RGBA")

    # Drop the soft contact shadow. Partially transparent pixels around the
    # base otherwise get reconstructed as a flat disc floating near the object.
    a = np.array(im)
    a[..., 3] = np.where(a[..., 3] > 128, 255, 0)
    im = Image.fromarray(a)

    # Centre the subject and leave a consistent margin; TripoSR is sensitive to
    # how much of the frame the object fills.
    a = np.array(im)
    alpha = a[..., 3]
    ys, xs = np.nonzero(alpha > 8)
    if len(xs):
        a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        im = Image.fromarray(a)
    side = int(max(im.size) / foreground_ratio)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    im = canvas.resize((512, 512), Image.LANCZOS)

    # Composite onto grey: the model expects an opaque image, and grey keeps it
    # from reading the background as part of the object.
    rgb = np.array(im).astype(np.float32) / 255.0
    out = rgb[..., :3] * rgb[..., 3:4] + 0.5 * (1 - rgb[..., 3:4])
    return Image.fromarray((out * 255).astype(np.uint8))


def keep_main_body(mesh, min_share=0.06):
    """Drop stray shells.

    Single-image reconstruction often leaves thin floating sheets beside the
    subject. They are cosmetically bad and, worse, they inflate the bounding
    box, so the real object gets normalised down to a fraction of the frame.
    Keep the biggest component plus anything of comparable size (a pair of
    lungs, five separate jars), and discard the rest.
    """
    try:
        parts = mesh.split(only_watertight=False)
    except Exception:
        return mesh
    if len(parts) <= 1:
        return mesh
    parts = sorted(parts, key=lambda m: len(m.faces), reverse=True)
    biggest = len(parts[0].faces)
    kept = [m for m in parts if len(m.faces) >= biggest * min_share]
    dropped = len(parts) - len(kept)
    if dropped:
        print(f"    dropped {dropped} stray shell(s) of {len(parts)}")
    return trimesh.util.concatenate(kept) if len(kept) > 1 else parts[0]


def simplify(mesh, target):
    if target <= 0 or len(mesh.faces) <= target:
        return mesh
    try:
        return mesh.simplify_quadric_decimation(face_count=target)
    except Exception as e:                      # older/newer trimesh signatures
        try:
            return mesh.simplify_quadric_decimation(target)
        except Exception:
            print(f"    (could not simplify: {e})")
            return mesh


def compress(path):
    """Run gltfpack if it is available; meshopt typically halves the file."""
    import shutil, subprocess
    exe = shutil.which("gltfpack")
    cmd = [exe, "-i", str(path), "-o", str(path), "-cc"] if exe else \
          ["npx", "-y", "gltfpack", "-i", str(path), "-o", str(path), "-cc"]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=240)
        return r.returncode == 0
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser(description="Image to web-ready GLB.")
    ap.add_argument("images", nargs="+", type=Path)
    ap.add_argument("--out", type=Path, default=Path("out"))
    ap.add_argument("--device", default=None, help="mps, cuda:0 or cpu. Auto by default.")
    ap.add_argument("--resolution", type=int, default=256, help="marching cubes grid")
    ap.add_argument("--target-tris", type=int, default=120000, help="0 to keep every triangle")
    ap.add_argument("--foreground-ratio", type=float, default=0.85)
    ap.add_argument("--remove-bg", action="store_true", help="for images that still have a background")
    ap.add_argument("--compress", action="store_true", help="meshopt compress via gltfpack")
    ap.add_argument("--no-clean", dest="clean", action="store_false",
                    help="keep stray shells instead of dropping them")
    args = ap.parse_args()

    device = pick_device(args.device)
    args.out.mkdir(parents=True, exist_ok=True)

    from tsr.system import TSR
    print(f"loading TripoSR on {device} ...")
    t0 = time.time()
    model = TSR.from_pretrained("stabilityai/TripoSR",
                                config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(8192)
    model.to(device)
    print(f"  ready in {time.time() - t0:.1f}s\n")

    for path in args.images:
        if not path.exists():
            print(f"skip {path}: not found")
            continue
        name = path.stem
        print(f"{name}")
        t0 = time.time()

        image = load_image(path, args.foreground_ratio, args.remove_bg)
        with torch.no_grad():
            codes = model([image], device=device)
        mesh_t = model.extract_mesh(codes, has_vertex_color=True,
                                    resolution=args.resolution)[0]

        mesh = trimesh.Trimesh(vertices=np.asarray(mesh_t.vertices),
                               faces=np.asarray(mesh_t.faces),
                               vertex_colors=np.asarray(mesh_t.visual.vertex_colors)
                               if hasattr(mesh_t, "visual") else None,
                               process=False)
        before = len(mesh.faces)
        if args.clean:
            mesh = keep_main_body(mesh)
        mesh = simplify(mesh, args.target_tris)

        # TripoSR hands back a Y-down mesh; stand it up and face it forward.
        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [0, 1, 0]))

        dst = args.out / f"{name}.glb"
        mesh.export(dst)
        kb = dst.stat().st_size / 1024
        note = ""
        if args.compress and compress(dst):
            note = f" -> {dst.stat().st_size / 1024:.0f}KB compressed"
        print(f"  {before} tris -> {len(mesh.faces)}   {kb:.0f}KB{note}   "
              f"{time.time() - t0:.1f}s\n")

    print(f"done, wrote to {args.out}")


if __name__ == "__main__":
    main()
