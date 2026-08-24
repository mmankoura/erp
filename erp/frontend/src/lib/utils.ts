import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A v4 UUID that works outside a secure context.
 *
 * `crypto.randomUUID()` is only defined in secure contexts. Dev runs on
 * localhost, which counts as secure, so it works there — but production is
 * served over plain HTTP on a real hostname, where the property is undefined
 * and calling it throws. `crypto.getRandomValues()` carries no such
 * restriction, so it backs the fallback.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10x
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  // No crypto at all. These ids are client-side keys, not security tokens.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}
