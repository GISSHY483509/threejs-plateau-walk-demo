//main.ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { TPSControls } from './tpsControls';

// --- Renderer / Scene / Camera ---
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(window.innerWidth, window.innerHeight);

// 先頭付近に追記（または既存を置換）
const BASE = import.meta.env.BASE_URL;           // dev:"/", 本番:"/<REPO>/"
const modelUrl = (file: string) => `${BASE}models/${file}`; // public/models 下を指す

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(0, 3, 5);

// --- Controls ---
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.minDistance = 1;
orbitControls.maxDistance = 7;
orbitControls.maxPolarAngle = Math.PI / 2 + 0.35;
orbitControls.minPolarAngle = Math.PI / 2 - 0.8;
orbitControls.update();

const zoomControls = new TrackballControls(camera, renderer.domElement);
zoomControls.noRotate = true;

// --- Lights ---
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// --- Groups / Loader ---
const loader = new GLTFLoader();
const cityGroup = new THREE.Group();
scene.add(cityGroup);

// 歩ける対象（地形＋橋）/ 衝突対象（橋の縦要素だけ）
const walkableTargets: THREE.Object3D[] = [];
const collidableTargets: THREE.Object3D[] = [];

// 見た目調整用
const groundMeshes: THREE.Mesh[] = [];
const buildingMeshes: THREE.Mesh[] = [];

// --- Model list ---
const modelList = [
  {
    name: '地形',
    path: modelUrl('PLATEAU_yokohama_dem.glb'),
    material: new THREE.MeshStandardMaterial({
      color: 0x88aa77,
      transparent: true,
      opacity: 0.6,
      roughness: 1.0,
      metalness: 0.0
    })
  },
  {
    name: '建物',
    path: modelUrl('PLATEAU_yokohama_bldg.glb'),
    material: new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.25,
      wireframe: true
    })
  },
  {
    name: '橋',
    path: modelUrl('PLATEAU_yokohama_bridge.glb'),
    material: new THREE.MeshStandardMaterial({
      color: 0xfffafa,
      transparent: true,
      opacity: 0.6,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide // 裏面抜け対策
    })
  }
];

let tpsControls: TPSControls | undefined;

// --- Load models ---
for (const item of modelList) {
  loader.load(item.path, (gltf) => {
    const model = gltf.scene;
    model.name = item.name;

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = item.material.clone();
      mesh.frustumCulled = false;

      if (item.name === '地形') {
        groundMeshes.push(mesh);
      } else if (item.name === '建物') {
        buildingMeshes.push(mesh);
        // 建物は衝突対象にしない（ご要望通り）
      }
    });

    cityGroup.add(model);

    // レイキャストの歩行対象は地形＋橋
    if (item.name === '地形' || item.name === '橋') walkableTargets.push(model);
    // 衝突対象は橋のみ（後で子メッシュから柱の箱を作成）
    if (item.name === '橋') collidableTargets.push(model);

    rebuildCollisionBoxes(); // 読み込みのたび更新
  });
}

// --- Avatar + TPS controls ---
loader.load(modelUrl('Xbot.glb'), (gltf) => {
  const avatarPivot = new THREE.Group();
  avatarPivot.position.set(0, 50, 0);
  scene.add(avatarPivot);

  const avatarModel = gltf.scene;
  avatarPivot.add(avatarModel);

  const mixer = new THREE.AnimationMixer(avatarModel);
  const animationsMap = new Map<string, THREE.AnimationAction>();
  gltf.animations.forEach((clip) => animationsMap.set(clip.name, mixer.clipAction(clip)));

  tpsControls = new TPSControls(
    avatarPivot,
    mixer,
    animationsMap,
    orbitControls,
    zoomControls,
    camera,
    'agree'
  );

  // 初期スナップ：地形+橋へ
  tpsControls.snapToGround(walkableTargets, new THREE.Vector3(0, 200, 0));
  rebuildCollisionBoxes();
});

// --- 衝突ボックスの再構築（橋の“縦要素”だけを採用） ---
function rebuildCollisionBoxes() {
  if (!tpsControls) return;

  const boxes: THREE.Box3[] = [];
  collidableTargets.forEach((root) => {
    root.updateWorldMatrix(true, true);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      box.getSize(size);
      const x = size.x, y = size.y, z = size.z;

      // 異常/巨大な親箱は除外
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
      if (x > 300 || y > 300 || z > 300) return;

      // “縦要素っぽい”：高い & XZが細い
      const isVerticalSlim = (y > 2.0) && (Math.max(x, z) < 4.5);
      if (!isVerticalSlim) return;

      // 収縮して当たりを弱める
      box.expandByScalar(-0.25); // 0.15〜0.3で調整

      boxes.push(box);

      // // デバッグ可視化（必要なら）
      // const helper = new THREE.Box3Helper(box, 0xff00ff);
      // scene.add(helper);
    });
  });

  tpsControls.setBuildingBoxes(boxes);
}

// --- Loop ---
const clock = new THREE.Clock();
const keyMap: Record<string, boolean> = {};
const keyboardDirection = { x: 0, y: 0 };

window.addEventListener('keydown', (e) => (keyMap[e.code] = true));
window.addEventListener('keyup', (e) => (keyMap[e.code] = false));

function animate() {
  requestAnimationFrame(animate);

  keyboardDirection.x = 0;
  keyboardDirection.y = 0;
  if (keyMap['KeyW']) keyboardDirection.y += 1;
  if (keyMap['KeyS']) keyboardDirection.y -= 1;
  if (keyMap['KeyA']) keyboardDirection.x -= 1;
  if (keyMap['KeyD']) keyboardDirection.x += 1;

  const delta = clock.getDelta();

  if (tpsControls && walkableTargets.length > 0) {
    tpsControls.update(delta, keyboardDirection, walkableTargets);
  }

  // ワイヤ建物の発光アニメ（任意）
  const t = Date.now() * 0.002;
  for (const mesh of buildingMeshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat && mat.emissiveIntensity !== undefined) {
      mat.emissiveIntensity = 0.5 + 0.5 * Math.sin(t + mesh.id % 10);
    }
  }

  renderer.render(scene, camera);
}
animate();

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});