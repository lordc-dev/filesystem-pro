/**
 * Hash Utilities (SSOT)
 *
 * Fast non-cryptographic hashing for cache keys and content fingerprinting.
 */

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function fnv1a(str: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function fnv1aBase36(str: string): string {
  return fnv1a(str).toString(36);
}