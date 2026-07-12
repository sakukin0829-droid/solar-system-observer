(function () {
  if (!window.THREE || window.THREE.OrbitControls) {
    return;
  }

  const spherical = new THREE.Spherical();
  const sphericalDelta = new THREE.Spherical(1, 0, 0);
  const offset = new THREE.Vector3();
  const panOffset = new THREE.Vector3();
  const rotateStart = new THREE.Vector2();
  const rotateEnd = new THREE.Vector2();
  const rotateDelta = new THREE.Vector2();

  class OrbitControls extends THREE.EventDispatcher {
    constructor(object, domElement) {
      super();
      this.object = object;
      this.domElement = domElement;
      this.enabled = true;
      this.target = new THREE.Vector3();
      this.minDistance = 6;
      this.maxDistance = 170;
      this.minPolarAngle = 0.04;
      this.maxPolarAngle = Math.PI - 0.04;
      this.enableDamping = true;
      this.dampingFactor = 0.12;
      this.rotateSpeed = 0.56;
      this.zoomSpeed = 0.88;
      this.enablePan = false;

      this._state = "none";
      this._scale = 1;
      this._pointerStart = new THREE.Vector2();
      this._pointerMoved = false;

      this._onPointerDown = this._onPointerDown.bind(this);
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
      this._onWheel = this._onWheel.bind(this);

      this.domElement.addEventListener("pointerdown", this._onPointerDown);
      this.domElement.addEventListener("wheel", this._onWheel, { passive: false });
      this.update();
    }

    _onPointerDown(event) {
      if (!this.enabled || event.button !== 0) {
        return;
      }
      this._state = "rotate";
      this._pointerMoved = false;
      this._pointerStart.set(event.clientX, event.clientY);
      rotateStart.set(event.clientX, event.clientY);
      this.domElement.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", this._onPointerMove);
      window.addEventListener("pointerup", this._onPointerUp);
    }

    _onPointerMove(event) {
      if (!this.enabled || this._state !== "rotate") {
        return;
      }
      rotateEnd.set(event.clientX, event.clientY);
      rotateDelta.subVectors(rotateEnd, rotateStart);
      if (rotateEnd.distanceTo(this._pointerStart) > 4) {
        this._pointerMoved = true;
      }

      const height = Math.max(1, this.domElement.clientHeight);
      sphericalDelta.theta -= (2 * Math.PI * rotateDelta.x / height) * this.rotateSpeed;
      sphericalDelta.phi -= (2 * Math.PI * rotateDelta.y / height) * this.rotateSpeed;
      rotateStart.copy(rotateEnd);
      this.dispatchEvent({ type: "change" });
    }

    _onPointerUp(event) {
      this._state = "none";
      this.domElement.releasePointerCapture?.(event.pointerId);
      window.removeEventListener("pointermove", this._onPointerMove);
      window.removeEventListener("pointerup", this._onPointerUp);
      window.setTimeout(() => {
        this._pointerMoved = false;
      }, 0);
    }

    _onWheel(event) {
      if (!this.enabled) {
        return;
      }
      event.preventDefault();
      const zoomScale = Math.pow(0.95, this.zoomSpeed);
      this._scale *= event.deltaY < 0 ? zoomScale : 1 / zoomScale;
      this.dispatchEvent({ type: "change" });
    }

    didPointerMove() {
      return this._pointerMoved;
    }

    update() {
      offset.copy(this.object.position).sub(this.target);
      spherical.setFromVector3(offset);
      spherical.theta += sphericalDelta.theta;
      spherical.phi += sphericalDelta.phi;
      spherical.radius *= this._scale;
      spherical.makeSafe();
      spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, spherical.phi));
      spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, spherical.radius));

      offset.setFromSpherical(spherical);
      this.object.position.copy(this.target).add(offset).add(panOffset);
      this.object.lookAt(this.target);

      if (this.enableDamping) {
        sphericalDelta.theta *= 1 - this.dampingFactor;
        sphericalDelta.phi *= 1 - this.dampingFactor;
        this._scale += (1 - this._scale) * this.dampingFactor;
        panOffset.multiplyScalar(1 - this.dampingFactor);
      } else {
        sphericalDelta.theta = 0;
        sphericalDelta.phi = 0;
        this._scale = 1;
        panOffset.set(0, 0, 0);
      }

      return true;
    }

    sync() {
      sphericalDelta.theta = 0;
      sphericalDelta.phi = 0;
      this._scale = 1;
      panOffset.set(0, 0, 0);
      this.update();
    }

    dispose() {
      this.domElement.removeEventListener("pointerdown", this._onPointerDown);
      this.domElement.removeEventListener("wheel", this._onWheel);
      window.removeEventListener("pointermove", this._onPointerMove);
      window.removeEventListener("pointerup", this._onPointerUp);
    }
  }

  window.THREE.OrbitControls = OrbitControls;
})();
