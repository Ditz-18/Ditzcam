// capture.js — canvas rendering, burn timestamp to photo, save

const Capture = (() => {

  const FONT_SIZES = { small: 11, medium: 14, large: 18 };
  const PADDING = 10;
  const LINE_HEIGHT_FACTOR = 1.55;

  function generateId() {
    return `ditz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Draw timestamp overlay onto canvas at given position
  function drawTimestamp(ctx, lines, position, settings, canvasWidth, canvasHeight) {
    const fontSize = FONT_SIZES[settings.timestampFontSize || 'medium'];
    const color = settings.timestampColor || '#ffffff';
    const fontFamily = 'monospace';

    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    const lineHeight = Math.round(fontSize * LINE_HEIGHT_FACTOR);
    const totalHeight = lines.length * lineHeight + PADDING * 2;

    // Measure max line width
    let maxW = 0;
    lines.forEach(l => {
      const m = ctx.measureText(l);
      if (m.width > maxW) maxW = m.width;
    });
    const blockW = maxW + PADDING * 2;

    // Calculate top-left corner of block based on position
    let bx, by;
    const pos = position || 'bottom-right';

    const marginX = 16;
    const marginY = 16;

    if (pos === 'top-left')      { bx = marginX; by = marginY; }
    else if (pos === 'top-center') { bx = (canvasWidth - blockW) / 2; by = marginY; }
    else if (pos === 'top-right')  { bx = canvasWidth - blockW - marginX; by = marginY; }
    else if (pos === 'middle-left') { bx = marginX; by = (canvasHeight - totalHeight) / 2; }
    else if (pos === 'middle-center') { bx = (canvasWidth - blockW) / 2; by = (canvasHeight - totalHeight) / 2; }
    else if (pos === 'middle-right') { bx = canvasWidth - blockW - marginX; by = (canvasHeight - totalHeight) / 2; }
    else if (pos === 'bottom-left') { bx = marginX; by = canvasHeight - totalHeight - marginY; }
    else if (pos === 'bottom-center') { bx = (canvasWidth - blockW) / 2; by = canvasHeight - totalHeight - marginY; }
    else /* bottom-right */ { bx = canvasWidth - blockW - marginX; by = canvasHeight - totalHeight - marginY; }

    // Draw background box
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, blockW, totalHeight, 6)
                  : ctx.rect(bx, by, blockW, totalHeight);
    ctx.fill();

    // Draw lines
    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, bx + PADDING, by + PADDING + fontSize + i * lineHeight);
    });
  }

  // Capture from video element, burn timestamp, return dataUrl + metadata
  async function capturePhoto(videoEl, snapshot, settings) {
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;

    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');

    // Mirror if front camera
    const isFront = settings._isFrontCamera;
    if (isFront) {
      ctx.translate(vw, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(videoEl, 0, 0, vw, vh);
    if (isFront) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    const lines = TimestampEngine.getOverlayLines(snapshot, settings);
    const position = settings.timestampPosition || 'bottom-right';
    drawTimestamp(ctx, lines, position, settings, vw, vh);

    const quality = settings.exportQuality === 'low' ? 0.6
                  : settings.exportQuality === 'medium' ? 0.8
                  : 0.95;

    const dataUrl = canvas.toDataURL('image/jpeg', quality);

    const photoObj = {
      id: generateId(),
      dataUrl,
      takenAt: snapshot.takenAt,
      dateTime: snapshot.dateTime,
      gps: snapshot.gps,
      address: snapshot.address,
      position,
      width: vw,
      height: vh,
      size: Math.round(dataUrl.length * 0.75), // approx bytes
    };

    return photoObj;
  }

  // Draw live preview overlay on canvas for viewfinder
  function drawPreviewOverlay(ctx, lines, position, settings, w, h) {
    drawTimestamp(ctx, lines, position, settings, w, h);
  }

  return {
    capturePhoto,
    drawPreviewOverlay,
    drawTimestamp,
    generateId,
  };
})();
