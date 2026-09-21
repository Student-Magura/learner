import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAPABILITY_STORAGE_KEY,
  detectInitialCapability,
  mediaUrl,
  useMediaCapability,
} from './useMediaCapability';

describe('mediaUrl', () => {
  it('будує маршрут на власному origin', () => {
    expect(mediaUrl('abc123')).toBe('/media/abc123');
  });
});

describe('detectInitialCapability', () => {
  it('без Service Worker одразу fallback', () => {
    expect(detectInitialCapability(false, null)).toBe('fallback');
  });

  it('із Service Worker і без збереженого вердикту — proxy', () => {
    expect(detectInitialCapability(true, null)).toBe('proxy');
  });

  it('поважає збережений вердикт fallback', () => {
    expect(detectInitialCapability(true, 'fallback')).toBe('fallback');
  });

  it('ігнорує сміття в сховищі й пробує proxy', () => {
    expect(detectInitialCapability(true, 'хтозна')).toBe('proxy');
  });
});

describe('useMediaCapability', () => {
  beforeEach(() => localStorage.clear());

  it('markProxyUnsupported перемикає на fallback і запамʼятовує вибір', () => {
    const { result } = renderHook(() => useMediaCapability());
    expect(result.current.capability).toBe('proxy');

    act(() => result.current.markProxyUnsupported());

    expect(result.current.capability).toBe('fallback');
    expect(localStorage.getItem(CAPABILITY_STORAGE_KEY)).toBe('fallback');
  });

  it('після перезапуску не пробує proxy знову', () => {
    localStorage.setItem(CAPABILITY_STORAGE_KEY, 'fallback');
    const { result } = renderHook(() => useMediaCapability());
    expect(result.current.capability).toBe('fallback');
  });
});
