/** True when next/image cannot optimize the host (not in remotePatterns). */
export function imageNeedsUnoptimized(src: string) {
  if (!src || src.startsWith('/')) return false;
  try {
    const host = new URL(src).hostname;
    return !host.includes('cloudinary.com') && !host.includes('unsplash.com');
  } catch {
    return true;
  }
}
