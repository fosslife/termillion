export async function isFontAvailable(font: string): Promise<boolean> {
  try {
    // Try to load font locally first
    const testFont = new FontFace(font, `local("${font}")`);
    await testFont.load();
    document.fonts.add(testFont);
    return true;
  } catch {
    // If local font fails, use canvas method as fallback check
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
}

export async function loadGoogleFont(font: string): Promise<boolean> {
  try {
    // Try loading from Google Fonts
    const fontWithoutSpaces = font.replace(/\s+/g, "+");
    const link = document.createElement("link");
    link.href = `https://fonts.googleapis.com/css2?family=${fontWithoutSpaces}:wght@400;700&display=swap`;
    link.rel = "stylesheet";
    document.head.appendChild(link);

    // Wait for font to load
    await document.fonts.ready;

    // Verify the font loaded
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
