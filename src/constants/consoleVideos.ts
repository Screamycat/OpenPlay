export interface BuiltinConsoleVideo {
  id: string;
  label: string;
  path: string;
  isDefault?: boolean;
}

export const DEFAULT_CONSOLE_BOOT_VIDEO =
  "/videos/splash boot/OpenPlay_Console_2K.mp4";

export const DEFAULT_CONSOLE_LOGIN_VIDEO =
  "/videos/login loop/50632-464085910_medium.mp4";

export const BUILTIN_CONSOLE_LOGIN_VIDEOS: BuiltinConsoleVideo[] = [
  {
    id: "preset-1",
    label: "Stardust Drift (Default)",
    path: "/videos/login loop/50632-464085910_medium.mp4",
    isDefault: true,
  },
  {
    id: "preset-2",
    label: "Cosmic Horizon",
    path: "/videos/login loop/15674175_3840_2160_30fps.mp4",
  },
  {
    id: "preset-3",
    label: "Deep Nebula",
    path: "/videos/login loop/17130751_3840_2160_30fps.mp4",
  },
  {
    id: "preset-4",
    label: "Ethereal Waves",
    path: "/videos/login loop/178908-860734672_medium.mp4",
  },
  {
    id: "preset-5",
    label: "Midnight Particles",
    path: "/videos/login loop/27018-361798566_medium.mp4",
  },
  {
    id: "preset-6",
    label: "Aurora Pulse",
    path: "/videos/login loop/29561-375947285_medium.mp4",
  },
  {
    id: "preset-7",
    label: "Starlight Flow",
    path: "/videos/login loop/29575-375947265_medium.mp4",
  },
  {
    id: "preset-8",
    label: "Velvet Prism",
    path: "/videos/login loop/337026_medium.mp4",
  },
  {
    id: "preset-9",
    label: "Ambient Glow",
    path: "/videos/login loop/82170-577893740.mp4",
  },
];
