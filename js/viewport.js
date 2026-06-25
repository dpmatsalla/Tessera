export function clampPan(panX, panY, scaledWidth, scaledHeight, viewportWidth, viewportHeight) {
  const limitX = Math.max(0, (scaledWidth - viewportWidth) / 2);
  const limitY = Math.max(0, (scaledHeight - viewportHeight) / 2);
  return {
    x: Math.max(-limitX, Math.min(limitX, panX)),
    y: Math.max(-limitY, Math.min(limitY, panY)),
  };
}

export function clampZoom(value, minimum = 1, maximum = 4) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function zoomedViewBox(base, zoom, panX, panY, renderedWidth, renderedHeight) {
  const width = base.width / zoom;
  const height = base.height / zoom;
  const centerX = base.x + base.width / 2
    - panX * width / Math.max(1, renderedWidth);
  const centerY = base.y + base.height / 2
    - panY * height / Math.max(1, renderedHeight);
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}
