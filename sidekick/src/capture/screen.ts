import screenshot from "screenshot-desktop";
import sharp from "sharp";
import { config } from "../config";

/**
 * Grab the current screen and return a downscaled JPEG as base64 (no data: prefix).
 * Downscaling keeps Gemini vision tokens (and latency) low while staying readable.
 */
export async function captureFrame(displayId: number | undefined = config.captureDisplay): Promise<string> {
  const png: Buffer = await screenshot(
    displayId === undefined ? { format: "png" } : { format: "png", screen: displayId },
  );
  const jpeg = await sharp(png)
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return jpeg.toString("base64");
}

/** List available displays (id + name) so the user can pick CAPTURE_DISPLAY. */
export async function listDisplays(): Promise<Array<{ id: number; name: string }>> {
  // screenshot-desktop exposes listDisplays() at runtime.
  const fn = (screenshot as unknown as { listDisplays?: () => Promise<Array<{ id: number; name: string }>> })
    .listDisplays;
  return fn ? fn() : [];
}
