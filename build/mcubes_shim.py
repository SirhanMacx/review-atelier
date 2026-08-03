"""
Drop-in replacement for torchmcubes.marching_cubes.

torchmcubes needs a CUDA-oriented C++ build that does not compile cleanly on
Apple Silicon. scikit-image gives the same surface; the only thing to match is
the axis order. skimage returns vertices as (i, j, k) index coordinates, while
the caller immediately reorders with [2, 1, 0], so we hand back a reversed view
and the two cancel out.
"""
import numpy as np
import torch
from skimage import measure


def marching_cubes(volume, iso=0.0):
    vol = volume.detach().cpu().numpy() if torch.is_tensor(volume) else np.asarray(volume)
    vol = np.ascontiguousarray(vol, dtype=np.float32)

    # A field that never crosses the isolevel has no surface to extract.
    if vol.min() > iso or vol.max() < iso:
        return torch.zeros((0, 3), dtype=torch.float32), torch.zeros((0, 3), dtype=torch.long)

    verts, faces, _normals, _values = measure.marching_cubes(vol, float(iso))
    verts = np.ascontiguousarray(verts[:, ::-1])          # (i,j,k) -> caller re-swaps
    faces = np.ascontiguousarray(faces[:, ::-1])          # keep winding outward
    return torch.from_numpy(verts).float(), torch.from_numpy(faces.astype(np.int64))
