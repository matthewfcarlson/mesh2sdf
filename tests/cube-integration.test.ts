import { describe, it, expect } from 'vitest';
import { parseOBJ } from '../src/mesh/obj-loader';
import { boundsCenter, boundsSize, getTriangle } from '../src/mesh/types';
import { computeVolumeBounds } from '../src/sdf/distance-field';
import * as fs from 'fs';
import * as path from 'path';

// Read the actual cube.obj sample file
const cubeOBJ = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'meshes', 'cube.obj'),
  'utf-8'
);

describe('cube.obj integration', () => {
  const mesh = parseOBJ(cubeOBJ);

  it('parses the correct number of vertices', () => {
    // cube.obj has 8 vertices
    expect(mesh.vertices.length / 3).toBe(8);
  });

  it('parses the correct number of triangles', () => {
    // 6 faces * 2 triangles per face = 12 triangles
    expect(mesh.triangleCount).toBe(12);
    expect(mesh.indices.length).toBe(36); // 12 * 3
  });

  it('has correct bounding box for unit cube', () => {
    expect(mesh.bounds.min.x).toBeCloseTo(-0.5, 5);
    expect(mesh.bounds.min.y).toBeCloseTo(-0.5, 5);
    expect(mesh.bounds.min.z).toBeCloseTo(-0.5, 5);
    expect(mesh.bounds.max.x).toBeCloseTo(0.5, 5);
    expect(mesh.bounds.max.y).toBeCloseTo(0.5, 5);
    expect(mesh.bounds.max.z).toBeCloseTo(0.5, 5);
  });

  it('has a centered bounding box at origin', () => {
    const center = boundsCenter(mesh.bounds);
    expect(center.x).toBeCloseTo(0, 5);
    expect(center.y).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
  });

  it('has unit size bounding box', () => {
    const size = boundsSize(mesh.bounds);
    expect(size.x).toBeCloseTo(1, 5);
    expect(size.y).toBeCloseTo(1, 5);
    expect(size.z).toBeCloseTo(1, 5);
  });

  it('all triangle indices are within vertex range', () => {
    const vertexCount = mesh.vertices.length / 3;
    for (let i = 0; i < mesh.indices.length; i++) {
      expect(mesh.indices[i]).toBeGreaterThanOrEqual(0);
      expect(mesh.indices[i]).toBeLessThan(vertexCount);
    }
  });

  it('all triangle vertices are within the bounding box', () => {
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

  it('computes a valid volume for the cube mesh', () => {
    const { bounds, voxelSize } = computeVolumeBounds(
      mesh.bounds,
      { resolution: 64, padding: 0.1 }
    );

    // Volume should fully contain the mesh
    expect(bounds.min.x).toBeLessThan(mesh.bounds.min.x);
    expect(bounds.min.y).toBeLessThan(mesh.bounds.min.y);
    expect(bounds.min.z).toBeLessThan(mesh.bounds.min.z);
    expect(bounds.max.x).toBeGreaterThan(mesh.bounds.max.x);
    expect(bounds.max.y).toBeGreaterThan(mesh.bounds.max.y);
    expect(bounds.max.z).toBeGreaterThan(mesh.bounds.max.z);

    // Voxel size should be reasonable
    expect(voxelSize).toBeGreaterThan(0);
    expect(voxelSize).toBeLessThan(1); // For a unit cube at 64 resolution
  });

  it('produces consistent results when parsed multiple times', () => {
    const mesh2 = parseOBJ(cubeOBJ);
    expect(Array.from(mesh2.vertices)).toEqual(Array.from(mesh.vertices));
    expect(Array.from(mesh2.indices)).toEqual(Array.from(mesh.indices));
    expect(mesh2.triangleCount).toBe(mesh.triangleCount);
  });
});
