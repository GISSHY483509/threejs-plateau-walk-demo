import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

const groundRay = new THREE.Raycaster();
const downDirection = new THREE.Vector3(0, -1, 0);

export class TPSControls {
  private model: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private animationsMap: Map<string, THREE.AnimationAction>;
  private orbitControl: OrbitControls;
  private zoomControls: TrackballControls;
  private camera: THREE.PerspectiveCamera;

  private currentAction: string;
  private y = 100;

  private walkDirection = new THREE.Vector3();
  private rotateAxis = new THREE.Vector3(0, 1, 0);
  private rotateQuat: THREE.Quaternion = new THREE.Quaternion();
  private cameraTarget = new THREE.Vector3();

  private fadeDuration = 0.2;
  private runVelocity = 7;

  // コリジョン
  private buildingBoxes: THREE.Box3[] = [];
  private avatarBox = new THREE.Box3();
  private avatarBoxInflate = 0.02; // 小さめ

  constructor(
    model: THREE.Group,
    mixer: THREE.AnimationMixer,
    animationsMap: Map<string, THREE.AnimationAction>,
    orbitControl: OrbitControls,
    zoomControls: TrackballControls,
    camera: THREE.PerspectiveCamera,
    currentAction: string
  ) {
    this.model = model;
    this.mixer = mixer;
    this.animationsMap = animationsMap;
    this.currentAction = currentAction;
    this.orbitControl = orbitControl;
    this.zoomControls = zoomControls;
    this.camera = camera;

    // 初期アニメ
    this.animationsMap.forEach((value, key) => {
      if (key === currentAction) value.play();
    });

    this.updateTarget();
  }

  /** 歩ける対象（複数）に対して初期スナップ */
  public snapToGround(walkables: THREE.Object3D[], startAt: THREE.Vector3 = new THREE.Vector3(0, 200, 0)) {
    const rayPos = startAt.clone();
    groundRay.set(rayPos, downDirection);
    const hit = groundRay.intersectObjects(walkables, true);
    if (hit.length > 0) {
      this.y = hit[0].point.y;
      this.model.position.set(startAt.x, this.y, startAt.z);
      this.updateTarget();
    }
  }

  /** 衝突用 Box3 群を受け取る */
  public setBuildingBoxes(boxes: THREE.Box3[]) {
    this.buildingBoxes = boxes;
  }

  /** アバターの膝〜頭の高さスライスで交差判定 */
  private intersectsInHeightSlice(a: THREE.Box3, b: THREE.Box3, y: number, knee = 0.45, head = 1.6) {
    const A = a.clone();
    const B = b.clone();
    A.min.y = y - knee; A.max.y = y + head;
    B.min.y = y - knee; B.max.y = y + head;
    return A.intersectsBox(B);
  }

  public update(delta: number, inputDir: { x: number; y: number }, walkables: THREE.Object3D[]) {
    const directionPressed = inputDir.x !== 0 || inputDir.y !== 0;

    // --- 足元の高さ更新（地形＋橋）
    const rayPosition = this.model.position.clone();
    rayPosition.y += 2;
    groundRay.set(rayPosition, downDirection);
    const intersects = groundRay.intersectObjects(walkables, true);
    if (intersects.length > 0) {
      const newY = intersects[0].point.y;
      if (!Number.isNaN(newY)) this.y = newY;
    }

    // --- アニメ切り替え
    const next = directionPressed ? 'run' : 'agree';
    if (this.currentAction !== next) {
      const toPlay = this.animationsMap.get(next);
      const current = this.animationsMap.get(this.currentAction);
      if (current && toPlay) {
        current.fadeOut(this.fadeDuration);
        toPlay.reset().fadeIn(this.fadeDuration).play();
        this.currentAction = next;
      }
    }

    this.mixer.update(delta);

    // --- 走行処理 ---
    if (this.currentAction === 'run') {
      // カメラ基準の前方/右ベクトル
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      camDir.y = 0; camDir.normalize();
      const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();

      // 入力をワールドの移動方向に
      this.walkDirection.set(0, 0, 0)
        .addScaledVector(camDir,  inputDir.y)
        .addScaledVector(right,   inputDir.x);
      if (this.walkDirection.lengthSq() > 0) this.walkDirection.normalize();

      const moveDist = this.runVelocity * delta;

      // 向き
      const moveAngle = Math.atan2(this.walkDirection.x, this.walkDirection.z);
      this.rotateQuat.setFromAxisAngle(this.rotateAxis, moveAngle);
      this.model.quaternion.rotateTowards(this.rotateQuat, 0.2);

      // --- 衝突：次位置のみ判定 ---
      const nextPos = this.model.position.clone();
      nextPos.x += this.walkDirection.x * moveDist;
      nextPos.z += this.walkDirection.z * moveDist;

      this.avatarBox.setFromObject(this.model).expandByScalar(this.avatarBoxInflate);

      let blocked = false;
      const deltaMove = new THREE.Vector3(nextPos.x - this.model.position.x, 0, nextPos.z - this.model.position.z);
      const testBox = this.avatarBox.clone().translate(deltaMove);
      for (const b of this.buildingBoxes) {
        if (this.intersectsInHeightSlice(testBox, b, this.y)) { blocked = true; break; }
      }

      if (!blocked) {
        this.model.position.copy(nextPos);
      } else {
        // スライド（X/Z を個別に）
        const boxX = this.avatarBox.clone().translate(new THREE.Vector3(deltaMove.x, 0, 0));
        let xOK = true;
        for (const b of this.buildingBoxes) { if (this.intersectsInHeightSlice(boxX, b, this.y)) { xOK = false; break; } }
        if (xOK) this.model.position.x = nextPos.x;

        const boxZ = this.avatarBox.clone().translate(new THREE.Vector3(0, 0, deltaMove.z));
        let zOK = true;
        for (const b of this.buildingBoxes) { if (this.intersectsInHeightSlice(boxZ, b, this.y)) { zOK = false; break; } }
        if (zOK) this.model.position.z = nextPos.z;
      }
    }

    // 最終的な接地
    this.model.position.y = this.y;

    // カメラ追従
    this.updateTarget();
  }

  private updateTarget() {
    const cameraOffset = new THREE.Vector3().subVectors(this.camera.position, this.orbitControl.target);
    const modelY = this.model.position.y;
    this.cameraTarget.set(this.model.position.x, modelY + 1, this.model.position.z);
    this.camera.position.copy(this.cameraTarget).add(cameraOffset);
    this.orbitControl.target.copy(this.cameraTarget);
    this.zoomControls.target.copy(this.cameraTarget);
    this.orbitControl.update();
    this.zoomControls.update();
    this.camera.updateProjectionMatrix();
  }
}