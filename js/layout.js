export function containSize(containerWidth, containerHeight, contentRatio) {
  if (containerWidth <= 0 || containerHeight <= 0 || contentRatio <= 0) {
    return { width: 0, height: 0 };
  }

  let width = containerWidth;
  let height = width / contentRatio;

  if (height > containerHeight) {
    height = containerHeight;
    width = height * contentRatio;
  }

  return { width, height };
}
