/**
 * What the service board draws with, and nothing else. The services in
 * `board.ts` talk to this interface only, so they hold no engine, no scene
 * and no panel code; `host-display.ts` implements it over the native host's
 * slices, and a log-only implementation stands in when a slice is missing.
 */
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export interface Pose {
  readonly position: Vec3;
  readonly quaternion: Quat;
}

/** The ids of the panel's text lines (the `id` of each `span` in `ui/service-board.uikitml`). */
export const LINES = {
  session: "l-session",
  visibility: "l-visibility",
  focus: "l-focus",
  pause: "l-pause",
  fps: "l-fps",
  delta: "l-delta",
  ticks: "l-ticks",
  immersive: "l-cap-immersive",
  handTracking: "l-cap-hand",
  planeDetection: "l-cap-plane",
  passthrough: "l-cap-passthrough",
  telemetry: ["l-tel-1", "l-tel-2", "l-tel-3"],
  io: "l-io",
} as const;

export interface Display {
  /** Set one panel line's text. Called only when the text changed. */
  setText(line: string, text: string): void;
  /** Move a block to a world pose (metres, local-floor space). */
  setPose(block: string, pose: Pose): void;
  /** Show or hide a block. */
  setShown(block: string, shown: boolean): void;
  /** Place the panel at a world pose. Called once, when the viewer's pose is known. */
  placePanel(pose: Pose): void;
}

/** A display that draws nothing. */
export class NullDisplay implements Display {
  setText(): void {}
  setPose(): void {}
  setShown(): void {}
  placePanel(): void {}
}

/** Rotation about +Y by `angle` radians. */
export function quatY(angle: number): Quat {
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [v[0] + qw * tx + (qy * tz - qz * ty), v[1] + qw * ty + (qz * tx - qx * tz), v[2] + qw * tz + (qx * ty - qy * tx)];
}

/** Where the board sits, worked out once from the viewer's pose. */
export interface BoardPlacement {
  readonly panel: Pose;
  /** The row's block poses by id, at rest. */
  block(id: string): Pose;
  /** The direction the viewer faces on the floor plane. */
  readonly forward: readonly [number, number];
  /** The viewer's right on the floor plane: the way the row and the frame-rate bar run. */
  readonly right: readonly [number, number];
}

/** The distance in front of the viewer, in metres. */
export const BOARD_DISTANCE = 1.4;
/** How far below the panel's centre the row of blocks sits, in metres. */
export const ROW_DROP = 0.7;
/** How far above eye height the panel's centre sits, in metres, so the blocks below it are in view too. */
export const PANEL_RAISE = 0.2;
/** The gap between blocks, in metres. */
export const ROW_SPACING = 0.3;

/**
 * Place the board `BOARD_DISTANCE` in front of `head` at eye height, facing
 * the viewer, with the row of `ids` below it. The head is a local-floor pose:
 * +Y up, -Z the way the viewer looks at rest.
 */
export function placeBoard(head: Pose, ids: readonly string[]): BoardPlacement {
  const f = rotate(head.quaternion, [0, 0, -1]);
  const length = Math.hypot(f[0], f[2]);
  const fx = length > 1e-4 ? f[0] / length : 0;
  const fz = length > 1e-4 ? f[2] / length : -1;
  // A panel's +Z faces the viewer, so it turns to point along -forward.
  const facing = quatY(Math.atan2(-fx, -fz));
  const right: readonly [number, number] = [-fz, fx];
  const centre: Vec3 = [head.position[0] + fx * BOARD_DISTANCE, head.position[1] + PANEL_RAISE, head.position[2] + fz * BOARD_DISTANCE];
  const blocks = new Map<string, Pose>();
  ids.forEach((id, i) => {
    const across = (i - (ids.length - 1) / 2) * ROW_SPACING;
    blocks.set(id, { position: [centre[0] + right[0] * across, centre[1] - ROW_DROP, centre[2] + right[1] * across], quaternion: facing });
  });
  return {
    panel: { position: centre, quaternion: facing },
    block: (id) => blocks.get(id) ?? { position: centre, quaternion: facing },
    forward: [fx, fz],
    right,
  };
}
