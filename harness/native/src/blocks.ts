/**
 * The service board's blocks: one simple mesh each, named. `scene-assets.ts`
 * cooks each to glTF, `scripts/write-scenes.mjs` writes the scene document
 * that places them, and the board addresses them by the same ids. This
 * module holds no engine code.
 */
export type BlockShape =
  | { kind: "box"; size: [number, number, number] }
  | { kind: "sphere"; radius: number }
  | { kind: "cylinder"; radius: number; height: number }
  | { kind: "octahedron"; radius: number }
  | { kind: "torus"; radius: number; tube: number };

export interface BlockSpec {
  /** The node id in the scene document and the asset name. */
  readonly id: string;
  /** What the block means, for the README and the log. */
  readonly meaning: string;
  readonly shape: BlockShape;
  readonly colour: number;
}

export const SCENE_ID = "sf-board";
export const SCENE_FILE = "sf-board.iwsdk.scene.json";
/** The path the host builds the scene from: `/scenes/<name>.iwsdk.scene.json`. */
export const SCENE_SRC = `/scenes/${SCENE_FILE}`;

export const BLOCK_IDS = {
  spin: "sf-spin",
  pulse: "sf-pulse",
  immersive: "sf-cap-immersive",
  handTracking: "sf-cap-hand",
  planeDetection: "sf-cap-plane",
  passthrough: "sf-cap-passthrough",
  io: "sf-io",
  fps: "sf-fps",
  fpsTrack: "sf-fps-track",
} as const;

export const BLOCKS: readonly BlockSpec[] = [
  { id: BLOCK_IDS.spin, meaning: "spins only while renderTick fires", shape: { kind: "box", size: [0.16, 0.16, 0.16] }, colour: 0xff8a1f },
  { id: BLOCK_IDS.pulse, meaning: "hops once a second from the timer channels", shape: { kind: "box", size: [0.16, 0.16, 0.16] }, colour: 0x1fd1c4 },
  { id: BLOCK_IDS.immersive, meaning: "shown while capabilities.immersive is true", shape: { kind: "sphere", radius: 0.09 }, colour: 0x3b82f6 },
  { id: BLOCK_IDS.handTracking, meaning: "shown while capabilities.handTracking is true", shape: { kind: "cylinder", radius: 0.08, height: 0.16 }, colour: 0x22c55e },
  { id: BLOCK_IDS.planeDetection, meaning: "shown while capabilities.planeDetection is true", shape: { kind: "box", size: [0.2, 0.05, 0.2] }, colour: 0xa855f7 },
  { id: BLOCK_IDS.passthrough, meaning: "shown while capabilities.passthrough is true", shape: { kind: "torus", radius: 0.08, tube: 0.03 }, colour: 0xec4899 },
  { id: BLOCK_IDS.io, meaning: "shown for a moment each time a HostIO read completes", shape: { kind: "octahedron", radius: 0.1 }, colour: 0xfacc15 },
  { id: BLOCK_IDS.fps, meaning: "the frame-rate marker: slides along the bar, left end 0 and right end 90 renderTick calls a second", shape: { kind: "box", size: [0.05, 0.11, 0.05] }, colour: 0xf5f5f5 },
  { id: BLOCK_IDS.fpsTrack, meaning: "the frame-rate bar the marker slides along", shape: { kind: "box", size: [0.9, 0.02, 0.02] }, colour: 0x475569 },
];

/** The order of the row, left to right as the viewer sees it. The frame-rate bar sits above the row, not in it. */
export const ROW: readonly string[] = [BLOCK_IDS.spin, BLOCK_IDS.pulse, BLOCK_IDS.immersive, BLOCK_IDS.handTracking, BLOCK_IDS.planeDetection, BLOCK_IDS.passthrough, BLOCK_IDS.io];

/** The frame-rate bar: its length in metres, the rate at its right end, and how far below the panel's centre it sits. */
export const FPS_BAR = { length: 0.9, fullScale: 90, drop: 0.45 } as const;
