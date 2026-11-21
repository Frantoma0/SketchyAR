/** Day 28.1: fit the actual decoded image INSIDE the Polaroid photo aperture.
 * Fit is determined by whichever dimension would overflow first. The longer
 * image dimension is never assumed to be the height. Geometry is read-only.
 */
export interface ContainedImageSize { width: number; height: number; scale: number }

export function fitImageInAperture(
  sourceWidth: number, sourceHeight: number,
  apertureWidth: number, apertureHeight: number, padding = 6,
): ContainedImageSize | null {
  if (![sourceWidth, sourceHeight, apertureWidth, apertureHeight, padding]
    .every(Number.isFinite) || sourceWidth <= 0 || sourceHeight <= 0 ||
    apertureWidth <= 0 || apertureHeight <= 0 || padding < 0) return null;
  const availableWidth = apertureWidth - 2 * padding;
  const availableHeight = apertureHeight - 2 * padding;
  if (availableWidth <= 0 || availableHeight <= 0) return null;
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale, scale };
}
