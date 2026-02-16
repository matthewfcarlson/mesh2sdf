/**
 * Distance field generation from meshes using WebGPU compute shaders.
 */

import { GPUContext, createBuffer, createShaderModule } from '../webgpu/context';
import { Mesh, BoundingBox, boundsCenter, boundsSize } from '../mesh/types';
import distanceFieldShader from '../shaders/mesh-distance.wgsl?raw';

export interface DistanceFieldConfig {
  /** Resolution of the 3D texture (e.g., 64 for 64³) */
  resolution: number;
  /** Padding around the mesh bounds (as fraction of max extent) */
  padding: number;
}

export interface DistanceField {
  /** 3D texture containing signed distances */
  texture: GPUTexture;
  /** Resolution of the texture */
  resolution: number;
  /** World-space bounds of the distance field volume */
  bounds: BoundingBox;
  /** Size of one voxel in world units */
  voxelSize: number;
}

const DEFAULT_CONFIG: DistanceFieldConfig = {
  resolution: 64,
  padding: 0.1,
};

export interface VolumeInfo {
  /** World-space bounds of the padded volume */
  bounds: BoundingBox;
  /** Size of one voxel in world units */
  voxelSize: number;
}

/**
 * Compute the padded cubic volume bounds and voxel size for a mesh's bounding box.
 * Creates a cube centered on the mesh with uniform padding.
 */
export function computeVolumeBounds(
  meshBounds: BoundingBox,
  config: DistanceFieldConfig
): VolumeInfo {
  const meshCenter = boundsCenter(meshBounds);
  const meshSize = boundsSize(meshBounds);
  const maxExtent = Math.max(meshSize.x, meshSize.y, meshSize.z);
  const halfExtent = (maxExtent * (1 + config.padding)) / 2;

  const bounds: BoundingBox = {
    min: {
      x: meshCenter.x - halfExtent,
      y: meshCenter.y - halfExtent,
      z: meshCenter.z - halfExtent,
    },
    max: {
      x: meshCenter.x + halfExtent,
      y: meshCenter.y + halfExtent,
      z: meshCenter.z + halfExtent,
    },
  };

  const voxelSize = (halfExtent * 2) / config.resolution;

  return { bounds, voxelSize };
}

/**
 * Compute a signed distance field from a triangle mesh.
 */
export async function computeDistanceField(
  ctx: GPUContext,
  mesh: Mesh,
  config: Partial<DistanceFieldConfig> = {}
): Promise<DistanceField> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { device, queue } = ctx;

  const { bounds: volumeBounds, voxelSize } = computeVolumeBounds(mesh.bounds, cfg);

  // Create output 3D texture
  const texture = device.createTexture({
    label: 'Distance Field',
    size: [cfg.resolution, cfg.resolution, cfg.resolution],
    format: 'r32float',
    dimension: '3d',
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  });

  // Upload mesh data
  const vertexBuffer = createBuffer(
    device,
    mesh.vertices,
    GPUBufferUsage.STORAGE,
    'Mesh Vertices'
  );

  const indexBuffer = createBuffer(
    device,
    mesh.indices,
    GPUBufferUsage.STORAGE,
    'Mesh Indices'
  );

  // Create uniform buffer with volume info
  const uniformData = new Float32Array([
    volumeBounds.min.x, volumeBounds.min.y, volumeBounds.min.z, 0, // min (vec3 + padding)
    volumeBounds.max.x, volumeBounds.max.y, volumeBounds.max.z, 0, // max (vec3 + padding)
    cfg.resolution, mesh.triangleCount, 0, 0, // resolution, triangleCount, padding
  ]);

  const uniformBuffer = createBuffer(
    device,
    uniformData,
    GPUBufferUsage.UNIFORM,
    'Distance Field Uniforms'
  );

  // Create compute pipeline
  const shaderModule = createShaderModule(device, distanceFieldShader, 'Distance Field Shader');

  const pipeline = device.createComputePipeline({
    label: 'Distance Field Pipeline',
    layout: 'auto',
    compute: {
      module: shaderModule,
      entryPoint: 'main',
    },
  });

  // Create bind group
  const bindGroup = device.createBindGroup({
    label: 'Distance Field Bind Group',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: vertexBuffer } },
      { binding: 2, resource: { buffer: indexBuffer } },
      { binding: 3, resource: texture.createView() },
    ],
  });

  // Dispatch compute shader
  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);

  // Dispatch workgroups (8x8x8 threads per workgroup)
  const workgroupSize = 8;
  const workgroupCount = Math.ceil(cfg.resolution / workgroupSize);
  passEncoder.dispatchWorkgroups(workgroupCount, workgroupCount, workgroupCount);

  passEncoder.end();
  queue.submit([commandEncoder.finish()]);

  // Wait for GPU to finish
  await queue.onSubmittedWorkDone();

  // Clean up temporary buffers
  vertexBuffer.destroy();
  indexBuffer.destroy();
  uniformBuffer.destroy();

  return {
    texture,
    resolution: cfg.resolution,
    bounds: volumeBounds,
    voxelSize,
  };
}

/**
 * Read back distance field data from GPU to CPU (for debugging/testing).
 */
export async function readDistanceFieldData(
  ctx: GPUContext,
  df: DistanceField
): Promise<Float32Array> {
  const { device, queue } = ctx;
  const size = df.resolution ** 3;
  const byteSize = size * 4; // f32 = 4 bytes

  // Create staging buffer
  const stagingBuffer = device.createBuffer({
    size: byteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // Copy texture to buffer
  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyTextureToBuffer(
    { texture: df.texture },
    { buffer: stagingBuffer, bytesPerRow: df.resolution * 4, rowsPerImage: df.resolution },
    [df.resolution, df.resolution, df.resolution]
  );
  queue.submit([commandEncoder.finish()]);

  // Map and read
  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(stagingBuffer.getMappedRange().slice(0));
  stagingBuffer.unmap();
  stagingBuffer.destroy();

  return data;
}
