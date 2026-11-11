/** Draws the “starting soon” card that stands in when there's no camera, or in the live waiting room. */
export function drawStreamCard(ctx: CanvasRenderingContext2D, name: string, t: number) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1d2947');
  grad.addColorStop(1, '#0f0f0f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Red halo behind the initial
  ctx.fillStyle = 'rgba(240, 82, 102, 0.24)';
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.42, H * 0.26, 0, Math.PI * 2);
  ctx.fill();
  // Channel initial
  ctx.fillStyle = '#f05266';
  ctx.font = `700 ${Math.round(H * 0.16)}px Roboto, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((name.replace(/^@/, '').charAt(0) || 'V').toUpperCase(), W / 2, H * 0.42);
  // Name + strapline
  ctx.fillStyle = '#fff';
  ctx.font = `500 ${Math.round(H * 0.075)}px Roboto, system-ui, sans-serif`;
  ctx.fillText(name, W / 2, H * 0.78);
  ctx.fillStyle = '#aaaaaa';
  ctx.font = `400 ${Math.round(H * 0.034)}px Roboto, system-ui, sans-serif`;
  ctx.fillText('Live now on Vidora', W / 2, H * 0.885);
  // Pulsing LIVE badge, top right
  const pulse = 2.4 + Math.sin(t / 260) * 1.6;
  ctx.beginPath();
  ctx.arc(W - 96, 46, 8 + pulse, 0, Math.PI * 2);
  ctx.fillStyle = '#f05266';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(H * 0.032)}px Roboto, system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('LIVE', W - 76, 53);
}
