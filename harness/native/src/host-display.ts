/**
 * The service board's `Display` over the native host's own slices, read
 * structurally: only the members called here are declared, and no other
 * family's package is imported.
 *
 * - The text panel is the `ui` slice: `createWindow` with the cooked
 *   `/ui/service-board.uikitml`, then `onPanelReady` hands over the element
 *   tree, `applyWindow` shows the window, `setWindowPose` places it and
 *   `setProperties` sets a line's `text`.
 * - The blocks are the `scenes` slice: `build` makes the scene and returns
 *   each node's key, `setNodeActive` shows or hides a node, and the
 *   `interactions` slice's `setWorldPose(key, pose)` moves it.
 *
 * A missing slice never throws: it is logged once and the rest keeps working.
 */
import type { Display, Pose } from "./display.js";
import { SCENE_ID, SCENE_SRC } from "./blocks.js";

/** The box the panel is fitted into, in metres: readable at the board distance without filling the view. */
const PANEL_MAX_METRES = [0.8, 0.62] as const;

export const PANEL_SRC = "/ui/service-board.uikitml";
export const WINDOW_ID = "service-board";

/** One element of the tree `onPanelReady` hands over: `handle` addresses it in `setProperties`, `id` is the markup id. */
export interface PanelNode {
  handle: string;
  id?: string;
  children: PanelNode[];
}

/** The `ui` slice members the board calls. */
export interface UiSliceLike {
  createWindow(windowId: string, config: unknown, options: unknown): void;
  onPanelReady(callback: (windowId: string, panelId: string, tree: PanelNode) => void): () => void;
  setProperties(panelId: string, elementHandle: string, props: Record<string, unknown>): void;
  setWindowPose(windowId: string, pose: { position: readonly number[]; quaternion: readonly number[] }, depthOrder: number): void;
  applyWindow(record: unknown): void;
}

/** The `scenes` slice members the board calls. */
export interface ScenesSliceLike {
  build(def: { id: string; src: string }, visible: boolean): Promise<{ scene: string; nodes: readonly { id: string; key: string }[] }>;
  setNodeActive(node: string, active: boolean): void;
}

/** The `interactions` slice member the board calls. */
export interface InteractionsSliceLike {
  setWorldPose?(targetId: string, pose: { position: readonly number[]; quaternion: readonly number[] }): void;
}

export interface DisplayHosts {
  ui?: UiSliceLike | undefined;
  scenes?: ScenesSliceLike | undefined;
  interactions?: InteractionsSliceLike | undefined;
}

export type DisplayLog = (type: string, fields: Record<string, unknown>) => void;

function findHandles(node: PanelNode, into: Map<string, string>): void {
  if (node.id) into.set(node.id, node.handle);
  for (const child of node.children) findHandles(child, into);
}

/** The record `applyWindow` takes for a shown, world-locked window with no chrome. */
function shownRecord(): Record<string, unknown> {
  return {
    id: WINDOW_ID,
    title: "Service Framework board",
    dockMode: "world-locked",
    minimized: false,
    hidden: false,
    dragging: false,
    region: undefined,
    chrome: { pin: false, dock: false, minimize: false, close: false },
    handMenu: { hand: "left", anchor: "above", anchorDistance: 0.12, offset: [0, 0, 0], palmGate: true, palmAngle: 60 },
    follow: { offset: [0, 0, 0], speed: 1, tolerance: 0, maxAngle: 0 },
  };
}

export class HostDisplay implements Display {
  private panelId: string | null = null;
  private readonly handles = new Map<string, string>();
  private readonly texts = new Map<string, string>();
  private panelPose: Pose | null = null;
  private panelPosed = false;

  private keys: Map<string, string> | null = null;
  private readonly poses = new Map<string, Pose>();
  private readonly shown = new Map<string, boolean>();
  /** What the host was last told, so an unchanged value is not sent again. */
  private readonly sentShown = new Map<string, boolean>();
  private readonly reported = new Set<string>();

  public constructor(private readonly hosts: DisplayHosts, private readonly log: DisplayLog) {}

  /** Create the panel and build the scene. Every failure is logged and leaves the other half working. */
  public open(): void {
    this.openPanel();
    this.openScene();
    if (this.hosts.scenes && !this.hosts.interactions?.setWorldPose) this.missing("interactions.setWorldPose", "blocks will show and hide but not move");
  }

  public setText(line: string, text: string): void {
    this.texts.set(line, text);
    this.writeText(line, text);
  }

  public setPose(block: string, pose: Pose): void {
    this.poses.set(block, pose);
    this.writePose(block, pose);
  }

  public setShown(block: string, shown: boolean): void {
    // A service may assert the same state every tick: only a change reaches the host.
    if (this.shown.get(block) === shown) return;
    this.shown.set(block, shown);
    this.writeShown(block, shown);
  }

  public placePanel(pose: Pose): void {
    this.panelPose = pose;
    this.panelPosed = false;
    this.writePanelPose();
  }

  // --- panel -------------------------------------------------------------------------------
  private openPanel(): void {
    const ui = this.hosts.ui;
    if (!ui) {
      this.missing("ui", "no text panel");
      return;
    }
    try {
      ui.onPanelReady((windowId, panelId, tree) => {
        if (windowId !== WINDOW_ID) return;
        this.panelId = panelId;
        findHandles(tree, this.handles);
        this.log("display", { what: "panel-ready", panelId, elements: this.handles.size });
        this.guard("ui.applyWindow", () => ui.applyWindow(shownRecord()));
        this.writePanelPose();
        for (const [line, text] of this.texts) this.writeText(line, text);
      });
      ui.createWindow(WINDOW_ID, PANEL_SRC, { id: WINDOW_ID, title: "Service Framework board", dockMode: "world-locked", maxWidth: PANEL_MAX_METRES[0], maxHeight: PANEL_MAX_METRES[1], movable: false, closable: false, minimizable: false, pinnable: false, dockable: false });
    } catch (error) {
      this.failed("ui", error);
    }
  }

  private writePanelPose(): void {
    const ui = this.hosts.ui;
    if (!ui || !this.panelId || !this.panelPose || this.panelPosed) return;
    this.panelPosed = true;
    const pose = this.panelPose;
    this.guard("ui.setWindowPose", () => ui.setWindowPose(WINDOW_ID, { position: [...pose.position], quaternion: [...pose.quaternion] }, 0));
  }

  private writeText(line: string, text: string): void {
    const ui = this.hosts.ui;
    const handle = this.handles.get(line);
    if (!ui || !this.panelId || !handle) return;
    this.guard("ui.setProperties", () => ui.setProperties(this.panelId!, handle, { text }));
  }

  // --- scene -------------------------------------------------------------------------------
  private openScene(): void {
    const scenes = this.hosts.scenes;
    if (!scenes) {
      this.missing("scenes", "no blocks");
      return;
    }
    let pending: Promise<{ scene: string; nodes: readonly { id: string; key: string }[] }>;
    try {
      pending = scenes.build({ id: SCENE_ID, src: SCENE_SRC }, true);
    } catch (error) {
      this.failed("scenes.build", error);
      return;
    }
    pending.then(
      (built) => {
        this.keys = new Map(built.nodes.map((n) => [n.id, n.key]));
        this.sentShown.clear();
        this.log("display", { what: "scene-built", scene: built.scene, nodes: built.nodes.length });
        for (const [block, shown] of this.shown) this.writeShown(block, shown);
        for (const [block, pose] of this.poses) this.writePose(block, pose);
      },
      (error: unknown) => this.failed("scenes.build", error),
    );
  }

  private writePose(block: string, pose: Pose): void {
    const move = this.hosts.interactions?.setWorldPose;
    const key = this.keys?.get(block);
    if (!move || !key) return;
    this.guard("interactions.setWorldPose", () => move.call(this.hosts.interactions, key, { position: [...pose.position], quaternion: [...pose.quaternion] }));
  }

  private writeShown(block: string, shown: boolean): void {
    const scenes = this.hosts.scenes;
    const key = this.keys?.get(block);
    if (!scenes || !key || this.sentShown.get(block) === shown) return;
    this.sentShown.set(block, shown);
    this.guard("scenes.setNodeActive", () => scenes.setNodeActive(key, shown));
  }

  // --- reporting ---------------------------------------------------------------------------
  private guard(what: string, run: () => void): void {
    try {
      run();
    } catch (error) {
      this.failed(what, error);
    }
  }

  private missing(slice: string, effect: string): void {
    if (this.reported.has(`missing:${slice}`)) return;
    this.reported.add(`missing:${slice}`);
    this.log("display", { what: "slice-missing", slice, effect });
  }

  private failed(what: string, error: unknown): void {
    if (this.reported.has(`failed:${what}`)) return;
    this.reported.add(`failed:${what}`);
    this.log("display", { what: "call-failed", call: what, error: String((error as Error)?.message ?? error) });
  }
}
