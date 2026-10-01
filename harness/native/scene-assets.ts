/**
 * The service board's blocks as NAMED SCENE-ASSETS for the native host:
 * simple three.js meshes, cooked to glTF by the conversion pipeline (`rc
 * assets`), one asset per block and placed by the document in `scenes/`. Only
 * the cook runs this module; the harness bundle never imports three.js.
 */
import { AssetType, defineAssets } from "@iwsdk/core";
import { BoxGeometry, CylinderGeometry, Mesh, MeshStandardMaterial, OctahedronGeometry, SphereGeometry, TorusGeometry, type BufferGeometry, type Object3D } from "three";
import { BLOCKS, type BlockShape } from "./src/blocks.js";

void AssetType;

function geometryOf(shape: BlockShape): BufferGeometry {
  switch (shape.kind) {
    case "box":
      return new BoxGeometry(shape.size[0], shape.size[1], shape.size[2]);
    case "sphere":
      return new SphereGeometry(shape.radius, 24, 16);
    case "cylinder":
      return new CylinderGeometry(shape.radius, shape.radius, shape.height, 24);
    case "octahedron":
      return new OctahedronGeometry(shape.radius);
    case "torus":
      return new TorusGeometry(shape.radius, shape.tube, 12, 32);
  }
}

const assets: Record<string, Object3D> = {};
for (const block of BLOCKS) {
  const mesh = new Mesh(geometryOf(block.shape), new MeshStandardMaterial({ color: block.colour, roughness: 0.5, metalness: 0.1 }));
  mesh.name = block.id;
  assets[block.id] = mesh;
}

// IWSDK's typings widen three.js's Object3D with pointer-capture members the cook never reads.
export default defineAssets(assets as never);
