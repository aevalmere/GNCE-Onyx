/**
 * Image service: Astro's sharp service, plus the sharpening pass it leaves out.
 *
 * Resampling an image always costs high-frequency detail, which is why the
 * standard order is resize THEN unsharp. Astro's built-in service resizes
 * straight into the encoder with no sharpen step, so every rendition lands
 * softer than the source deserves. On the roster portraits (a 260px plate
 * fed from a 544-800px master) the difference is plainly visible at 1:1, not
 * just under a loupe.
 *
 * This wraps the built-in service and adds one unsharp pass after any resize.
 * It changes sharpness only: no contrast stretch, no gamma or colourspace
 * move, no saturation. Portraits stay as shot, which is what DESIGN.md asks
 * for. Anything this cannot handle (SVG, a format sharp will not decode)
 * falls through to Astro's own service untouched.
 *
 * Tuning lives in astro.config.mjs under `image.service.config.sharpen`;
 * `false` there disables the pass and gives back stock Astro behaviour.
 */
import sharpService, { resolveSharpEncoderOptions } from 'astro/assets/services/sharp';
import sharp from 'sharp';

// Mirrors the built-in service's mapping of Astro `fit` to sharp `fit`.
const FIT = {
  fill: 'fill',
  contain: 'inside',
  cover: 'cover',
  none: 'outside',
  'scale-down': 'inside',
  outside: 'outside',
  inside: 'inside',
};

// Mild by design. Sigma is in output pixels, so one value suits every
// rendition: it sharpens what the viewer actually sees rather than scaling
// with how far the image was reduced. Strong enough to undo resample
// softening, well short of haloing an edge.
const DEFAULT_SHARPEN = { sigma: 0.75 };

const ENCODERS = { webp: 'webp', png: 'png', avif: 'avif', jpeg: 'jpeg', jpg: 'jpeg' };

export default {
  ...sharpService,

  async transform(inputBuffer, transform, config) {
    const settings = config.service.config ?? {};
    const sharpen = settings.sharpen === undefined ? DEFAULT_SHARPEN : settings.sharpen;

    // Nothing to add when sharpening is off or the output is vector.
    if (!sharpen || transform.format === 'svg') {
      return sharpService.transform(inputBuffer, transform, config);
    }

    let pipeline;
    let meta;
    try {
      pipeline = sharp(inputBuffer, {
        failOn: 'none',
        pages: -1,
        limitInputPixels: settings.limitInputPixels,
      });
      meta = await pipeline.metadata();
    } catch {
      return sharpService.transform(inputBuffer, transform, config);
    }

    // Rasterising an SVG here would change what Astro decided to do with it,
    // and animations lose their frames through a sharpen. Leave both alone.
    const encoder = ENCODERS[transform.format ?? ''];
    if (meta.format === 'svg' || (meta.pages ?? 1) > 1 || !encoder) {
      return sharpService.transform(inputBuffer, transform, config);
    }

    pipeline.rotate();

    // Same resize rules as the built-in service, so swapping this in changes
    // dimensions for nothing: only the sharpen below is new.
    const { kernel } = settings;
    const width = transform.width ? Math.round(transform.width) : undefined;
    const height = transform.height ? Math.round(transform.height) : undefined;

    if (width && height) {
      pipeline.resize({
        width,
        height,
        kernel,
        fit: transform.fit ? (FIT[transform.fit] ?? 'inside') : undefined,
        position: transform.position,
        withoutEnlargement: true,
      });
    } else if (height) {
      pipeline.resize({ height, kernel, withoutEnlargement: true });
    } else if (width) {
      pipeline.resize({ width, kernel, withoutEnlargement: true });
    }

    if (transform.background) pipeline.flatten({ background: transform.background });

    // The whole point of the wrapper, and only where it is owed. Sharpening
    // pays for detail lost to resampling, so an image that was not actually
    // resampled does not get the pass: `withoutEnlargement` means a request
    // at or above the source size passes the pixels through untouched, and
    // the largest srcset candidate is usually exactly that. Sharpening it
    // anyway would harden an original nobody asked us to change.
    const srcW = meta.width ?? 0;
    const srcH = meta.height ?? 0;
    const shrinks = (width && width < srcW) || (height && height < srcH);
    const reshapes =
      width && height && srcW && srcH && Math.abs(width / height - srcW / srcH) > 0.01;
    if (shrinks || reshapes) pipeline.sharpen(sharpen);

    // Astro's own encoder-option resolver, so quality presets ("high") and
    // the per-format config in astro.config resolve exactly as they would
    // without this wrapper.
    pipeline[encoder](
      resolveSharpEncoderOptions(
        { format: transform.format, quality: transform.quality },
        meta.format,
        settings,
      ),
    );

    try {
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      const needsCopy = 'buffer' in data && data.buffer instanceof SharedArrayBuffer;
      return { data: needsCopy ? new Uint8Array(data) : data, format: info.format };
    } catch {
      // Any encoder surprise: let Astro handle it and log in its own voice.
      return sharpService.transform(inputBuffer, transform, config);
    }
  },
};
