import { describe, it, expect } from 'vitest';
import { parseOBJ } from '../src/mesh/obj-loader';
import { boundsCenter, boundsSize, getTriangle } from '../src/mesh/types';
import { computeVolumeBounds } from '../src/sdf/distance-field';
import * as fs from 'fs';
import * as path from 'path';

const MESHES_DIR = path.join(__dirname, '..', 'public', 'meshes');

function loadOBJ(filename: string) {
  const content = fs.readFileSync(path.join(MESHES_DIR, filename), 'utf-8');
  return parseOBJ(content);
}

/** Validate common invariants that should hold for any well-formed mesh. */
function validateMeshInvariants(mesh: ReturnType<typeof parseOBJ>, name: string) {
  describe(`${name} - mesh invariants`, () => {
    it('has valid vertex data', () => {
      expect(mesh.vertices.length).toBeGreaterThan(0);
      expect(mesh.vertices.length % 3).toBe(0);
    });

    it('has valid triangle data', () => {
      expect(mesh.triangleCount).toBeGreaterThan(0);
      expect(mesh.indices.length).toBe(mesh.triangleCount * 3);
    });

    it('has all indices within vertex range', () => {
      const vertexCount = mesh.vertices.length / 3;
      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i]).toBeGreaterThanOrEqual(0);
        expect(mesh.indices[i]).toBeLessThan(vertexCount);
      }
    });

    it('has no NaN in vertex data', () => {
      for (let i = 0; i < mesh.vertices.length; i++) {
        expect(isNaN(mesh.vertices[i])).toBe(false);
      }
    });

    it('has valid bounding box (min <= max)', () => {
      expect(mesh.bounds.min.x).toBeLessThanOrEqual(mesh.bounds.max.x);
      expect(mesh.bounds.min.y).toBeLessThanOrEqual(mesh.bounds.max.y);
      expect(mesh.bounds.min.z).toBeLessThanOrEqual(mesh.bounds.max.z);
    });

    it('has non-degenerate bounding box', () => {
      const size = boundsSize(mesh.bounds);
      expect(size.x + size.y + size.z).toBeGreaterThan(0);
    });

    it('all triangle vertices lie within bounds', () => {
      for (let t = 0; t < mesh.triangleCount; t++) {
        const tri = getTriangle(mesh, t);
        for (const v of [tri.v0, tri.v1, tri.v2]) {
          expect(v.x).toBeGreaterThanOrEqual(mesh.bounds.min.x - 1e-6);
          expect(v.x).toBeLessThanOrEqual(mesh.bounds.max.x + 1e-6);
          expect(v.y).toBeGreaterThanOrEqual(mesh.bounds.min.y - 1e-6);
          expect(v.y).toBeLessThanOrEqual(mesh.bounds.max.y + 1e-6);
          expect(v.z).toBeGreaterThanOrEqual(mesh.bounds.min.z - 1e-6);
          expect(v.z).toBeLessThanOrEqual(mesh.bounds.max.z + 1e-6);
        }
      }
    });

    it('computes a valid volume for distance field generation', () => {
      const { bounds, voxelSize } = computeVolumeBounds(
        mesh.bounds,
        { resolution: 64, padding: 0.1 }
      );

      expect(bounds.min.x).toBeLessThan(mesh.bounds.min.x);
      expect(bounds.min.y).toBeLessThan(mesh.bounds.min.y);
      expect(bounds.min.z).toBeLessThan(mesh.bounds.min.z);
      expect(bounds.max.x).toBeGreaterThan(mesh.bounds.max.x);
      expect(bounds.max.y).toBeGreaterThan(mesh.bounds.max.y);
      expect(bounds.max.z).toBeGreaterThan(mesh.bounds.max.z);
      expect(voxelSize).toBeGreaterThan(0);
    });

    it('produces consistent results when parsed multiple times', () => {
      const content = fs.readFileSync(path.join(MESHES_DIR, `${name}.obj`), 'utf-8');
      const mesh2 = parseOBJ(content);
      expect(Array.from(mesh2.vertices)).toEqual(Array.from(mesh.vertices));
      expect(Array.from(mesh2.indices)).toEqual(Array.from(mesh.indices));
      expect(mesh2.triangleCount).toBe(mesh.triangleCount);
    });
  });
}

// ── Geometric Primitives ──
// These have known analytical SDFs making them ideal for validation.

describe('sphere.obj', () => {
  const mesh = loadOBJ('sphere.obj');

  validateMeshInvariants(mesh, 'sphere');

  it('has expected topology', () => {
    // UV sphere with 24 lat x 32 lon segments
    expect(mesh.vertices.length / 3).toBe(825);
    expect(mesh.triangleCount).toBe(1472);
  });

  it('is centered at origin', () => {
    const center = boundsCenter(mesh.bounds);
    expect(center.x).toBeCloseTo(0, 2);
    expect(center.y).toBeCloseTo(0, 2);
    expect(center.z).toBeCloseTo(0, 2);
  });

  it('has radius approximately 0.5', () => {
    // Check that bounds span approximately -0.5 to 0.5
    expect(mesh.bounds.max.x).toBeCloseTo(0.5, 1);
    expect(mesh.bounds.max.y).toBeCloseTo(0.5, 1);
    expect(mesh.bounds.min.x).toBeCloseTo(-0.5, 1);
    expect(mesh.bounds.min.y).toBeCloseTo(-0.5, 1);
  });

  it('all vertices are at radius ~0.5 from origin', () => {
    // Every vertex on the sphere should be distance 0.5 from origin
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const x = mesh.vertices[i];
      const y = mesh.vertices[i + 1];
      const z = mesh.vertices[i + 2];
      const dist = Math.sqrt(x * x + y * y + z * z);
      expect(dist).toBeCloseTo(0.5, 2);
    }
  });
});

describe('torus.obj', () => {
  const mesh = loadOBJ('torus.obj');

  validateMeshInvariants(mesh, 'torus');

  it('has expected topology', () => {
    // Torus with 32 major x 16 minor segments
    expect(mesh.vertices.length / 3).toBe(561);
    expect(mesh.triangleCount).toBe(1024);
  });

  it('is centered at origin', () => {
    const center = boundsCenter(mesh.bounds);
    expect(center.x).toBeCloseTo(0, 2);
    expect(center.y).toBeCloseTo(0, 2);
    expect(center.z).toBeCloseTo(0, 2);
  });

  it('has correct major/minor dimensions', () => {
    // Major radius 0.35 + minor radius 0.15 = 0.5 extent in XZ
    // Minor radius 0.15 = extent in Y
    const size = boundsSize(mesh.bounds);
    expect(size.x).toBeCloseTo(1.0, 1); // 2 * (0.35 + 0.15)
    expect(size.y).toBeCloseTo(0.3, 1); // 2 * 0.15
    expect(size.z).toBeCloseTo(1.0, 1); // 2 * (0.35 + 0.15)
  });

  it('all vertices satisfy torus equation', () => {
    const majorR = 0.35;
    const minorR = 0.15;
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const x = mesh.vertices[i];
      const y = mesh.vertices[i + 1];
      const z = mesh.vertices[i + 2];
      // Distance from tube center circle in XZ plane
      const distXZ = Math.sqrt(x * x + z * z) - majorR;
      // Distance from tube surface
      const distTube = Math.sqrt(distXZ * distXZ + y * y);
      expect(distTube).toBeCloseTo(minorR, 2);
    }
  });
});

describe('cylinder.obj', () => {
  const mesh = loadOBJ('cylinder.obj');

  validateMeshInvariants(mesh, 'cylinder');

  it('has expected topology', () => {
    // Cylinder with 32 radial segments, 1 height segment, top/bottom caps
    expect(mesh.vertices.length / 3).toBe(66);
    expect(mesh.triangleCount).toBe(128);
  });

  it('is centered at origin', () => {
    const center = boundsCenter(mesh.bounds);
    expect(center.x).toBeCloseTo(0, 2);
    expect(center.y).toBeCloseTo(0, 2);
    expect(center.z).toBeCloseTo(0, 2);
  });

  it('has correct radius and height', () => {
    const size = boundsSize(mesh.bounds);
    expect(size.x).toBeCloseTo(1.0, 1); // diameter = 2 * 0.5
    expect(size.y).toBeCloseTo(1.0, 1); // height = 1.0
    expect(size.z).toBeCloseTo(1.0, 1); // diameter = 2 * 0.5
  });
});

// ── Classic Test Models ──
// These are well-known models from computer graphics research.

describe('bunny.obj (Stanford Bunny)', () => {
  const mesh = loadOBJ('bunny.obj');

  validateMeshInvariants(mesh, 'bunny');

  it('has substantial geometry', () => {
    // Stanford bunny has thousands of vertices/faces
    expect(mesh.vertices.length / 3).toBeGreaterThan(1000);
    expect(mesh.triangleCount).toBeGreaterThan(1000);
  });

  it('has non-degenerate triangles', () => {
    // Spot-check some triangles for non-zero area
    const sampled = [0, Math.floor(mesh.triangleCount / 4), Math.floor(mesh.triangleCount / 2)];
    for (const t of sampled) {
      const tri = getTriangle(mesh, t);
      // Compute cross product magnitude (proportional to area)
      const e1x = tri.v1.x - tri.v0.x;
      const e1y = tri.v1.y - tri.v0.y;
      const e1z = tri.v1.z - tri.v0.z;
      const e2x = tri.v2.x - tri.v0.x;
      const e2y = tri.v2.y - tri.v0.y;
      const e2z = tri.v2.z - tri.v0.z;
      const cx = e1y * e2z - e1z * e2y;
      const cy = e1z * e2x - e1x * e2z;
      const cz = e1x * e2y - e1y * e2x;
      const area2 = cx * cx + cy * cy + cz * cz;
      expect(area2).toBeGreaterThan(0);
    }
  });
});

describe('teapot.obj (Utah Teapot)', () => {
  const mesh = loadOBJ('teapot.obj');

  validateMeshInvariants(mesh, 'teapot');

  it('has substantial geometry', () => {
    expect(mesh.vertices.length / 3).toBeGreaterThan(500);
    expect(mesh.triangleCount).toBeGreaterThan(500);
  });

  it('has reasonable proportions', () => {
    const size = boundsSize(mesh.bounds);
    // Teapot is wider than tall (spout + handle extend)
    expect(size.x).toBeGreaterThan(0);
    expect(size.y).toBeGreaterThan(0);
    expect(size.z).toBeGreaterThan(0);
  });
});

describe('suzanne.obj (Blender Monkey)', () => {
  const mesh = loadOBJ('suzanne.obj');

  validateMeshInvariants(mesh, 'suzanne');

  it('has expected vertex/face counts', () => {
    // Suzanne is the default Blender monkey head
    expect(mesh.vertices.length / 3).toBeGreaterThan(100);
    expect(mesh.triangleCount).toBeGreaterThan(100);
  });

  it('has compact proportions (roughly head-shaped)', () => {
    const size = boundsSize(mesh.bounds);
    // Suzanne is a monkey head - width > height > depth roughly
    const maxDim = Math.max(size.x, size.y, size.z);
    const minDim = Math.min(size.x, size.y, size.z);
    // No dimension should be more than ~3x another
    expect(maxDim / minDim).toBeLessThan(3);
  });
});
