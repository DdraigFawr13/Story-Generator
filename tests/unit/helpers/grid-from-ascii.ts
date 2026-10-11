/**
 * Tiny elevation fixtures from text. `~` is sea (−10 m); a digit is that many
 * `scale` metres of land, with 0 meaning 1 m land at the shore.
 */
export function gridFromAscii(rows: string[], scale = 100) {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const elevation = new Int16Array(width * height);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} has ${row.length} columns, not ${width}`);
    for (let x = 0; x < width; x += 1) {
      const ch = row[x]!;
      if (ch === '~') elevation[y * width + x] = -10;
      else if (ch >= '0' && ch <= '9') elevation[y * width + x] = Math.max(1, Number(ch) * scale);
      else throw new Error(`unknown fixture character "${ch}" at ${x},${y}`);
    }
  });
  return { width, height, elevation };
}
