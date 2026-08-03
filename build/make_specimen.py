#!/usr/bin/env python
"""
make_specimen.py - one command from a description to a web-ready 3D specimen.

    python make_specimen.py specimens.json --out /path/to/models

Reads a manifest of specimens, and for each one:
    1. generate   SDXL-Turbo renders the object on a plain plate   (.venv-gen)
    2. cut        the plate is keyed out to transparency
    3. model      TripoSR reconstructs a mesh                      (.venv)
    4. pack       meshopt compressed GLB

Generation and reconstruction need different, mutually incompatible dependency
sets (diffusers wants a modern huggingface-hub, the TripoSR checkpoint needs
transformers 4.35), so this script drives each stage in its own venv as a
subprocess rather than trying to import both.

Manifest entry:
    { "id": "u1-brain", "subject": "a human brain, lateral view",
      "style": "anatomical specimen" }

Skips anything already built unless --force.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GEN_PY = HERE / ".venv-gen" / "bin" / "python"
REC_PY = HERE / ".venv" / "bin" / "python"

ENV = {
    "COPYFILE_DISABLE": "1",
    "HF_HOME": str(HERE.parent / "hf"),
    "PYTORCH_ENABLE_MPS_FALLBACK": "1",
}

PLATE = ("centered on a plain flat warm ivory background, soft studio lighting "
         "from the upper left, gentle contact shadow, photorealistic 3D render, "
         "museum specimen photography, sharp focus, no text, no labels, no watermark")
NEGATIVE = ("text, letters, watermark, signature, cluttered background, multiple "
            "objects, cropped, blurry, cartoon, flat illustration")

GEN_SCRIPT = r'''
import json, sys, torch, time
from pathlib import Path
from diffusers import AutoPipelineForText2Image

manifest, outdir, plate, negative = sys.argv[1], Path(sys.argv[2]), sys.argv[3], sys.argv[4]
items = json.loads(Path(manifest).read_text())
outdir.mkdir(parents=True, exist_ok=True)

pipe = AutoPipelineForText2Image.from_pretrained(
    "stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16").to("mps")

for it in items:
    dst = outdir / f"{it['id']}.png"
    if dst.exists():
        print(f"  have {it['id']}"); continue
    prompt = f"{it['subject']}, {it.get('style','')}, {plate}"
    t = time.time()
    img = pipe(prompt=prompt, negative_prompt=negative,
               num_inference_steps=6, guidance_scale=0.0,
               height=768, width=768).images[0]
    img.save(dst)
    print(f"  gen {it['id']} {time.time()-t:.1f}s")
'''


def run(py, code, args, label):
    r = subprocess.run([str(py), "-c", code, *args], env={**__import__("os").environ, **ENV},
                       capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if line.strip() and "it/s" not in line and "%|" not in line:
            print(line)
    if r.returncode != 0:
        print(f"{label} failed:\n{r.stderr[-1500:]}", file=sys.stderr)
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", type=Path)
    ap.add_argument("--out", type=Path, required=True, help="where the GLBs go")
    ap.add_argument("--work", type=Path, default=HERE / "work")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    items = json.loads(args.manifest.read_text())
    raw = args.work / "raw"
    cut = args.work / "cut"
    for d in (raw, cut, args.out):
        d.mkdir(parents=True, exist_ok=True)

    todo = [i for i in items if args.force or not (args.out / f"{i['id']}.glb").exists()]
    if not todo:
        print("everything is already built")
        return
    print(f"{len(todo)} specimen(s) to build\n")

    tmp = args.work / "_todo.json"
    tmp.write_text(json.dumps(todo))

    print("1. generating images")
    if not run(GEN_PY, GEN_SCRIPT, [str(tmp), str(raw), PLATE, NEGATIVE], "generation"):
        return

    print("\n2. cutting out backgrounds")
    r = subprocess.run([str(REC_PY), str(HERE / "cutout.py"), str(raw), str(cut)],
                       env={**__import__("os").environ, **ENV}, capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr[-800:])

    print("\n3. reconstructing meshes")
    want = {i["id"] for i in todo}
    pngs = sorted(str(p) for p in cut.glob("*.png") if p.stem in want)
    subprocess.run([str(REC_PY), str(HERE / "img2glb.py"), *pngs,
                    "--out", str(args.out), "--compress"],
                   env={**__import__("os").environ, **ENV})

    print(f"\ndone -> {args.out}")


if __name__ == "__main__":
    main()
