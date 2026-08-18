export type OwnerPaletteIdentity = {
  ownerId: string;
  ownerName: string;
};

type OwnerGradient = {
  dark: string;
  light: string;
};

const PRIMARY_OWNER_GRADIENTS: OwnerGradient[] = [
  {
    dark: "#1E3A8A",
    light: "#93C5FD",
  },
  {
    dark: "#065F46",
    light: "#A7F3D0",
  },
];

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseHexColor(
  value: string,
): [number, number, number] {
  const normalized = value.replace("#", "");

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: ${value}`);
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function interpolateHexColor(
  from: string,
  to: string,
  progress: number,
): string {
  const start = parseHexColor(from);
  const end = parseHexColor(to);
  const ratio = clamp(progress);

  const channels = start.map((channel, index) =>
    Math.round(
      channel +
        (end[index] - channel) * ratio,
    ),
  );

  return `rgb(${channels.join(", ")})`;
}

function getFallbackHue(
  paletteIndex: number,
): number {
  return (
    205 +
    Math.max(0, paletteIndex - PRIMARY_OWNER_GRADIENTS.length) *
      67
  ) % 360;
}

export function buildOwnerPaletteIndex(
  owners: OwnerPaletteIdentity[],
): Map<string, number> {
  const uniqueOwners = new Map<
    string,
    OwnerPaletteIdentity
  >();

  for (const owner of owners) {
    if (!uniqueOwners.has(owner.ownerId)) {
      uniqueOwners.set(owner.ownerId, owner);
    }
  }

  const ordered = [...uniqueOwners.values()].sort(
    (first, second) =>
      first.ownerName.localeCompare(second.ownerName) ||
      first.ownerId.localeCompare(second.ownerId),
  );

  return new Map(
    ordered.map((owner, index) => [
      owner.ownerId,
      index,
    ]),
  );
}

export function getOwnerGradientColor(
  paletteIndex: number,
  progress: number,
): string {
  const gradient =
    PRIMARY_OWNER_GRADIENTS[paletteIndex];

  if (gradient) {
    return interpolateHexColor(
      gradient.dark,
      gradient.light,
      progress,
    );
  }

  const hue = getFallbackHue(paletteIndex);
  const lightness =
    Math.round(38 + clamp(progress) * 30);

  return `hsl(${hue} 58% ${lightness}%)`;
}
