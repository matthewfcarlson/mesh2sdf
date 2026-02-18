import { describe, it, expect } from 'vitest';
import { parseSTL, STLParseError } from '../src/mesh/stl-loader';
import * as fs from 'fs';
import * as path from 'path';

const MESHES_DIR = path.join(__dirname, '..', 'public', 'meshes');

function textToArrayBuffer(text: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(text).buffer;
}

describe('parseSTL - ASCII format', () => {
  it('parses a simple ASCII STL triangle', () => {
    const stl = `solid triangle
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid triangle`;

    const mesh = parseSTL(textToArrayBuffer(stl));
    expect(mesh.triangleCount).toBe(1);
    expect(mesh.vertices.length).toBe(9);
    expect(mesh.indices.length).toBe(3);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2]);
  });

  it('parses multiple facets', () => {
    const stl = `solid quad
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 1 1 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 1 0
      vertex 0 1 0
    endloop
  endfacet
endsolid quad`;

    const mesh = parseSTL(textToArrayBuffer(stl));
    expect(mesh.triangleCount).toBe(2);
    expect(mesh.vertices.length).toBe(18);
    expect(mesh.indices.length).toBe(6);
  });

  it('computes correct bounding box', () => {
    const stl = `solid test
  facet normal 0 0 1
    outer loop
      vertex -1 -2 -3
      vertex 4 5 6
      vertex 0 0 0
    endloop
  endfacet
endsolid test`;

    const mesh = parseSTL(textToArrayBuffer(stl));
    expect(mesh.bounds.min).toEqual({ x: -1, y: -2, z: -3 });
    expect(mesh.bounds.max).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('handles scientific notation in coordinates', () => {
    const stl = `solid sci
  facet normal 0 0 1
    outer loop
      vertex 1.5e-2 2.0E+1 -3.0e0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid sci`;

    const mesh = parseSTL(textToArrayBuffer(stl));
    expect(mesh.vertices[0]).toBeCloseTo(0.015, 6);
    expect(mesh.vertices[1]).toBeCloseTo(20, 6);
    expect(mesh.vertices[2]).toBeCloseTo(-3, 6);
  });

  it('throws on empty ASCII STL', () => {
    const stl = `solid empty
endsolid empty`;

    expect(() => parseSTL(textToArrayBuffer(stl))).toThrow(STLParseError);
    expect(() => parseSTL(textToArrayBuffer(stl))).toThrow('No vertices found');
  });
});

describe('parseSTL - Binary format', () => {
  it('parses a minimal binary STL (one triangle)', () => {
    // 80-byte header + 4-byte count + 50 bytes per triangle
    const buffer = new ArrayBuffer(80 + 4 + 50);
    const view = new DataView(buffer);

    // Write triangle count
    view.setUint32(80, 1, true);

    // Skip normal (12 bytes at offset 84)
    let offset = 84 + 12;

    // Vertex 0: (0, 0, 0)
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;

    // Vertex 1: (1, 0, 0)
    view.setFloat32(offset, 1, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;

    // Vertex 2: (0, 1, 0)
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 1, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;

    // Attribute byte count
    view.setUint16(offset, 0, true);

    const mesh = parseSTL(buffer);
    expect(mesh.triangleCount).toBe(1);
    expect(mesh.vertices.length).toBe(9);
    expect(mesh.bounds.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(mesh.bounds.max).toEqual({ x: 1, y: 1, z: 0 });
  });

  it('throws on truncated binary STL', () => {
    const buffer = new ArrayBuffer(50); // Too small
    expect(() => parseSTL(buffer)).toThrow(STLParseError);
  });

  it('throws on binary STL with mismatched triangle count', () => {
    const buffer = new ArrayBuffer(84); // Header + count but no triangle data
    const view = new DataView(buffer);
    view.setUint32(80, 10, true); // Claims 10 triangles

    expect(() => parseSTL(buffer)).toThrow('truncated');
  });
});

describe('parseSTL - file loading', () => {
  it('loads ASCII STL sphere file', () => {
    const data = fs.readFileSync(path.join(MESHES_DIR, 'sphere.stl'));
    const mesh = parseSTL(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

    expect(mesh.triangleCount).toBeGreaterThan(100);
    expect(mesh.vertices.length).toBe(mesh.triangleCount * 9);
    expect(mesh.indices.length).toBe(mesh.triangleCount * 3);

    // Sphere should be roughly centered at origin with radius 0.5
    const cx = (mesh.bounds.min.x + mesh.bounds.max.x) / 2;
    const cy = (mesh.bounds.min.y + mesh.bounds.max.y) / 2;
    const cz = (mesh.bounds.min.z + mesh.bounds.max.z) / 2;
    expect(cx).toBeCloseTo(0, 1);
    expect(cy).toBeCloseTo(0, 1);
    expect(cz).toBeCloseTo(0, 1);

    // Bounds should be approximately -0.5 to 0.5
    expect(mesh.bounds.max.x).toBeCloseTo(0.5, 1);
    expect(mesh.bounds.min.x).toBeCloseTo(-0.5, 1);
  });

  it('loads binary STL cylinder file', () => {
    const data = fs.readFileSync(path.join(MESHES_DIR, 'cylinder.stl'));
    const mesh = parseSTL(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

    expect(mesh.triangleCount).toBe(128);
    expect(mesh.vertices.length).toBe(128 * 9);

    // Cylinder: radius 0.5, height 1.0, centered at origin
    expect(mesh.bounds.min.y).toBeCloseTo(-0.5, 1);
    expect(mesh.bounds.max.y).toBeCloseTo(0.5, 1);
  });
});
