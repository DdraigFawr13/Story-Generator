export interface Camera {
  x: number;
  y: number;
}
export function boundCamera(
  camera: Camera,
  columns: number,
  rows: number,
  width: number,
  height: number,
  tileSize: number,
): Camera {
  const halfX = width / tileSize / 2,
    halfY = height / tileSize / 2;
  return {
    x: halfX >= columns / 2 ? columns / 2 : Math.min(columns - halfX, Math.max(halfX, camera.x)),
    y: halfY >= rows / 2 ? rows / 2 : Math.min(rows - halfY, Math.max(halfY, camera.y)),
  };
}
export function tileAt(
  screenX: number,
  screenY: number,
  camera: Camera,
  width: number,
  height: number,
  tileSize: number,
  columns: number,
  rows: number,
): number | null {
  const x = Math.floor(camera.x + (screenX - width / 2) / tileSize),
    y = Math.floor(camera.y + (screenY - height / 2) / tileSize);
  return x < 0 || x >= columns || y < 0 || y >= rows ? null : y * columns + x;
}
