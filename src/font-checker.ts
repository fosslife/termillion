export async function isFontAvailable(font: string): Promise<boolean> {
  // Use FontFace API to check if font is available
  const testString = "abcdefghijklmnopqrstuvwxyz0123456789";
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return false;

  // Function to measure width with a specific font
  const measureFont = (fontFamily: string) => {
    context.font = `12px "${fontFamily}"`;
    return context.measureText(testString).width;
  };

  // Get width with a default font
  const defaultWidth = measureFont("monospace");

  // Get width with requested font
  const testWidth = measureFont(font);

  // If widths are different, the font is likely loaded
  return Math.abs(defaultWidth - testWidth) > 0.001;
}

export async function loadGoogleFont(font: string): Promise<boolean> {
  try {
    const fontWithoutSpaces = font.replace(/\s+/g, "+");
    const link = document.createElement("link");
    link.href = `https://fonts.googleapis.com/css2?family=${fontWithoutSpaces}&display=swap`;
    link.rel = "stylesheet";
    document.head.appendChild(link);

    // Wait for font to load
    await document.fonts.ready;

    // Create and check if font loaded
    const testFont = new FontFace(font, `local("${font}")`);
    try {
      await testFont.load();
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}
