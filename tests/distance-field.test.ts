import { describe, it, expect } from 'vitest';
import { computeVolumeBounds, DistanceFieldConfig } from '../src/sdf/distance-field';
import { BoundingBox } from '../src/mesh/types';

describe('computeVolumeBounds', () => {
  const defaultConfig: DistanceFieldConfig = { resolution: 64, padding: 0.1 };

  it('creates a cubic volume centered on the mesh', () => {
    const meshBounds: BoundingBox = {
      min: { x: -0.5, y: -0.5, z: -0.5 },
      max: { x: 0.5, y: 0.5, z: 0.5 },
    };
    const { bounds } = computeVolumeBounds(meshBounds, defaultConfig);

    // Center should be at origin
    const cx = (bounds.min.x + bounds.max.x) / 2;
    const cy = (bounds.min.y + bounds.max.y) / 2;
    const cz = (bounds.min.z + bounds.max.z) / 2;
    expect(cx).toBeCloseTo(0, 10);
    expect(cy).toBeCloseTo(0, 10);
    expect(cz).toBeCloseTo(0, 10);
  });

  it('produces a cubic (equal-sided) volume', () => {
    const meshBounds: BoundingBox = {
      min: { x: -1, y: -2, z: -3 },
      max: { x: 1, y: 2, z: 3 },
    };
    const { bounds } = computeVolumeBounds(meshBounds, defaultConfig);

    const sizeX = bounds.max.x - bounds.min.x;
    const sizeY = bounds.max.y - bounds.min.y;
    const sizeZ = bounds.max.z - bounds.min.z;

    // Volume should be cubic
    expect(sizeX).toBeCloseTo(sizeY, 10);
    expect(sizeY).toBeCloseTo(sizeZ, 10);
  });

  it('uses the largest mesh dimension for the volume size', () => {
    const meshBounds: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 2, y: 4, z: 6 },
    };
    const config: DistanceFieldConfig = { resolution: 64, padding: 0 };
    const { bounds } = computeVolumeBounds(meshBounds, config);

    // Max extent is 6 (z-axis), so volume side = 6
    const sizeX = bounds.max.x - bounds.min.x;
    expect(sizeX).toBeCloseTo(6, 10);
  });

  it('applies padding correctly', () => {
    const meshBounds: BoundingBox = {
      min: { x: -5, y: -5, z: -5 },
      max: { x: 5, y: 5, z: 5 },
    };

    const noPadding = computeVolumeBounds(meshBounds, { resolution: 64, padding: 0 });
    const withPadding = computeVolumeBounds(meshBounds, { resolution: 64, padding: 0.2 });

    const sizeNoPad = noPadding.bounds.max.x - noPadding.bounds.min.x;
    const sizeWithPad = withPadding.bounds.max.x - withPadding.bounds.min.x;

    // With 20% padding, volume should be 20% larger
    expect(sizeWithPad / sizeNoPad).toBeCloseTo(1.2, 10);
  });

  it('computes correct voxel size', () => {
    const meshBounds: BoundingBox = {
      min: { x: -5, y: -5, z: -5 },
      max: { x: 5, y: 5, z: 5 },
    };
    const config: DistanceFieldConfig = { resolution: 100, padding: 0 };
    const { bounds, voxelSize } = computeVolumeBounds(meshBounds, config);

    const volumeSize = bounds.max.x - bounds.min.x;
    expect(voxelSize).toBeCloseTo(volumeSize / 100, 10);
  });

  it('handles unit cube mesh (the sample cube.obj bounds)', () => {
    // cube.obj has vertices from -0.5 to 0.5
    const meshBounds: BoundingBox = {
      min: { x: -0.5, y: -0.5, z: -0.5 },
      max: { x: 0.5, y: 0.5, z: 0.5 },
    };
    const config: DistanceFieldConfig = { resolution: 64, padding: 0.1 };
    const { bounds, voxelSize } = computeVolumeBounds(meshBounds, config);

    // Max extent = 1, halfExtent = 1 * 1.1 / 2 = 0.55
    expect(bounds.min.x).toBeCloseTo(-0.55, 10);
    expect(bounds.max.x).toBeCloseTo(0.55, 10);
    expect(voxelSize).toBeCloseTo(1.1 / 64, 10);
  });

  it('handles asymmetric mesh bounds', () => {
    const meshBounds: BoundingBox = {
      min: { x: 10, y: 20, z: 30 },
      max: { x: 14, y: 22, z: 31 },
    };
    const config: DistanceFieldConfig = { resolution: 32, padding: 0 };
    const { bounds } = computeVolumeBounds(meshBounds, config);

    // Center should be at (12, 21, 30.5)
    const cx = (bounds.min.x + bounds.max.x) / 2;
    const cy = (bounds.min.y + bounds.max.y) / 2;
    const cz = (bounds.min.z + bounds.max.z) / 2;
    expect(cx).toBeCloseTo(12, 10);
    expect(cy).toBeCloseTo(21, 10);
    expect(cz).toBeCloseTo(30.5, 10);

    // Max extent is 4 (x-axis), so volume side = 4
    const sizeX = bounds.max.x - bounds.min.x;
    expect(sizeX).toBeCloseTo(4, 10);
  });

  it('produces volume that fully contains the mesh', () => {
    const meshBounds: BoundingBox = {
      min: { x: -3, y: -1, z: -2 },
      max: { x: 3, y: 1, z: 2 },
    };
    const { bounds } = computeVolumeBounds(meshBounds, defaultConfig);

    expect(bounds.min.x).toBeLessThanOrEqual(meshBounds.min.x);
    expect(bounds.min.y).toBeLessThanOrEqual(meshBounds.min.y);
    expect(bounds.min.z).toBeLessThanOrEqual(meshBounds.min.z);
    expect(bounds.max.x).toBeGreaterThanOrEqual(meshBounds.max.x);
    expect(bounds.max.y).toBeGreaterThanOrEqual(meshBounds.max.y);
    expect(bounds.max.z).toBeGreaterThanOrEqual(meshBounds.max.z);
  });

  it('higher resolution produces smaller voxels', () => {
    const meshBounds: BoundingBox = {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    };

    const low = computeVolumeBounds(meshBounds, { resolution: 32, padding: 0.1 });
    const high = computeVolumeBounds(meshBounds, { resolution: 128, padding: 0.1 });

    expect(high.voxelSize).toBeLessThan(low.voxelSize);
    expect(low.voxelSize / high.voxelSize).toBeCloseTo(128 / 32, 10);
  });
});
