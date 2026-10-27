export function rulerTicks(length: number, zoom: number) {
  const scale = (96 / 25.4) * zoom;
  const major = zoom < 1 ? 20 : 10;
  const step = zoom < 0.65 ? 5 : zoom < 1 ? 2 : 1;
  const ticks = [];
  for (let value = 0; value <= length; value++) {
    if (value % step !== 0 && value % 5 !== 0 && value !== length) continue;
    ticks.push({
      value,
      position: value * scale,
      size: value % 10 === 0 ? 9 : value % 5 === 0 ? 6 : 3,
    });
  }
  const labels = [];
  for (let value = 0; value <= length; value += major) labels.push(value);
  if (labels.at(-1) !== length) {
    if (length - labels.at(-1)! < major) labels.pop();
    labels.push(length);
  }
  return { scale, ticks, labels };
}
