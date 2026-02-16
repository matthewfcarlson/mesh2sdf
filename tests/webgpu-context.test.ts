import { describe, it, expect } from 'vitest';
import { WebGPUError, isWebGPUSupported } from '../src/webgpu/context';

describe('WebGPUError', () => {
  it('creates an error with the correct name', () => {
    const err = new WebGPUError('test message');
    expect(err.name).toBe('WebGPUError');
    expect(err.message).toBe('test message');
  });

  it('is an instance of Error', () => {
    const err = new WebGPUError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WebGPUError);
  });

  it('has a stack trace', () => {
    const err = new WebGPUError('stack test');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('stack test');
  });
});

describe('isWebGPUSupported', () => {
  it('returns false in Node.js test environment', () => {
    // Node.js doesn't have navigator.gpu
    expect(isWebGPUSupported()).toBe(false);
  });
});
