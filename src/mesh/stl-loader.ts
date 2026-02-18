/**
 * STL file parser for loading triangle meshes.
 * Supports both ASCII and binary STL formats.
 */

import { Mesh, computeBounds } from './types';

export class STLParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'STLParseError';
  }
}

/**
 * Parse an STL file (auto-detects ASCII vs binary).
 */
export function parseSTL(data: ArrayBuffer): Mesh {
  if (isASCII(data)) {
    return parseASCIISTL(data);
  }
  return parseBinarySTL(data);
}

/**
 * Detect whether an STL file is ASCII format.
 * ASCII STL files start with "solid" followed by a name.
 * Binary STL files have an 80-byte header that may also start with "solid",
 * so we also check for "facet" or "endsolid" keywords.
 */
function isASCII(data: ArrayBuffer): boolean {
  const header = new Uint8Array(data, 0, Math.min(80, data.byteLength));
  const headerStr = new TextDecoder('ascii').decode(header).trim();

  if (!headerStr.startsWith('solid')) {
    return false;
  }

  // Look further into the file for ASCII STL keywords
  const sampleSize = Math.min(1000, data.byteLength);
  const sample = new TextDecoder('ascii').decode(new Uint8Array(data, 0, sampleSize));
  return sample.includes('facet') || sample.includes('endsolid');
}

function parseASCIISTL(data: ArrayBuffer): Mesh {
  const text = new TextDecoder('utf-8').decode(data);
  const vertices: number[] = [];
  const indices: number[] = [];

  const vertexRegex = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  let match;
  let vertexIndex = 0;

  while ((match = vertexRegex.exec(text)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const z = parseFloat(match[3]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      throw new STLParseError(`Invalid vertex coordinates: ${match[0]}`);
    }

    vertices.push(x, y, z);
    vertexIndex++;

    // Every 3 vertices form a triangle
    if (vertexIndex % 3 === 0) {
      const base = vertexIndex - 3;
      indices.push(base, base + 1, base + 2);
    }
  }

  if (vertices.length === 0) {
    throw new STLParseError('No vertices found in ASCII STL file');
  }

  if (vertices.length % 9 !== 0) {
    throw new STLParseError('Incomplete triangle data in ASCII STL file');
  }

  const verticesArray = new Float32Array(vertices);
  const indicesArray = new Uint32Array(indices);
  const bounds = computeBounds(verticesArray);

  return {
    vertices: verticesArray,
    indices: indicesArray,
    triangleCount: indicesArray.length / 3,
    bounds,
  };
}

function parseBinarySTL(data: ArrayBuffer): Mesh {
  if (data.byteLength < 84) {
    throw new STLParseError('Binary STL file too small (must be at least 84 bytes)');
  }

  const view = new DataView(data);
  const numTriangles = view.getUint32(80, true); // little-endian

  const expectedSize = 84 + numTriangles * 50;
  if (data.byteLength < expectedSize) {
    throw new STLParseError(
      `Binary STL file truncated: expected ${expectedSize} bytes, got ${data.byteLength}`
    );
  }

  // Each triangle has 3 vertices, stored per-face (not indexed)
  const vertices = new Float32Array(numTriangles * 9);
  const indices = new Uint32Array(numTriangles * 3);

  let offset = 84;
  for (let i = 0; i < numTriangles; i++) {
    // Skip normal (12 bytes)
    offset += 12;

    // Read 3 vertices (each 12 bytes = 3 floats)
    for (let v = 0; v < 3; v++) {
      const vertIdx = i * 9 + v * 3;
      vertices[vertIdx] = view.getFloat32(offset, true);
      vertices[vertIdx + 1] = view.getFloat32(offset + 4, true);
      vertices[vertIdx + 2] = view.getFloat32(offset + 8, true);
      offset += 12;
    }

    // Skip attribute byte count (2 bytes)
    offset += 2;

    // Indices (simple sequential)
    const base = i * 3;
    indices[base] = base;
    indices[base + 1] = base + 1;
    indices[base + 2] = base + 2;
  }

  const bounds = computeBounds(vertices);

  return {
    vertices,
    indices,
    triangleCount: numTriangles,
    bounds,
  };
}

/**
 * Load an STL file from a URL.
 */
export async function loadSTLFromURL(url: string): Promise<Mesh> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new STLParseError(`Failed to load STL file: ${response.statusText}`);
  }
  const data = await response.arrayBuffer();
  return parseSTL(data);
}

/**
 * Load an STL file from a File object (e.g., from file input).
 */
export async function loadSTLFromFile(file: File): Promise<Mesh> {
  const data = await file.arrayBuffer();
  return parseSTL(data);
}
