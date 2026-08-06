type ExportSvgAsPngOptions = {
  svg: SVGSVGElement;

  width: number;
  height: number;

  filename: string;

  scale?: number;
  backgroundColor?: string;
};

async function loadSvgImage(
  source: string,
): Promise<HTMLImageElement> {
  return new Promise(
    (resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        resolve(image);
      };

      image.onerror = () => {
        reject(
          new Error(
            "The SVG image could not be loaded.",
          ),
        );
      };

      image.src = source;
    },
  );
}

async function createPngBlob(
  svg: SVGSVGElement,
  width: number,
  height: number,
  scale: number,
  backgroundColor: string,
): Promise<Blob> {
  const clonedSvg =
    svg.cloneNode(
      true,
    ) as SVGSVGElement;

  clonedSvg.setAttribute(
    "xmlns",
    "http://www.w3.org/2000/svg",
  );

  clonedSvg.setAttribute(
    "width",
    String(width),
  );

  clonedSvg.setAttribute(
    "height",
    String(height),
  );

  const serializedSvg =
    new XMLSerializer()
      .serializeToString(
        clonedSvg,
      );

  const svgBlob = new Blob(
    [serializedSvg],
    {
      type: "image/svg+xml;charset=utf-8",
    },
  );

  const sourceUrl =
    URL.createObjectURL(svgBlob);

  try {
    const image =
      await loadSvgImage(
        sourceUrl,
      );

    const canvas =
      document.createElement(
        "canvas",
      );

    canvas.width =
      Math.round(width * scale);

    canvas.height =
      Math.round(height * scale);

    const context =
      canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "The PNG canvas could not be created.",
      );
    }

    context.scale(
      scale,
      scale,
    );

    context.fillStyle =
      backgroundColor;

    context.fillRect(
      0,
      0,
      width,
      height,
    );

    context.drawImage(
      image,
      0,
      0,
      width,
      height,
    );

    return await new Promise<Blob>(
      (resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(
                new Error(
                  "The PNG file could not be created.",
                ),
              );

              return;
            }

            resolve(blob);
          },
          "image/png",
        );
      },
    );
  } finally {
    URL.revokeObjectURL(
      sourceUrl,
    );
  }
}

function downloadBlob(
  blob: Blob,
  filename: string,
) {
  const downloadUrl =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = downloadUrl;
  anchor.download = filename;

  document.body.appendChild(
    anchor,
  );

  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(
      downloadUrl,
    );
  }, 0);
}

export async function exportSvgAsPng({
  svg,
  width,
  height,
  filename,
  scale = 2,
  backgroundColor = "#ffffff",
}: ExportSvgAsPngOptions): Promise<void> {
  const pngBlob =
    await createPngBlob(
      svg,
      width,
      height,
      scale,
      backgroundColor,
    );

  downloadBlob(
    pngBlob,
    filename,
  );
}