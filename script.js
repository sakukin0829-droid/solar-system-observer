const app = document.getElementById("app");
const canvas = document.getElementById("spaceCanvas");
const homePage = document.getElementById("homePage");
const solarPage = document.getElementById("solarPage");
const enterSolarButton = document.getElementById("enterSolarButton");
const backHomeButton = document.getElementById("backHomeButton");
const modeStatus = document.getElementById("modeStatus");
const modeButtons = document.querySelectorAll("[data-mode]");
const labelLayer = document.getElementById("planetLabels");
const viewButtons = document.querySelectorAll("[data-view]");
const orbitToggle = document.getElementById("orbitToggle");
const labelToggle = document.getElementById("labelToggle");
const scaleModeSelect = document.getElementById("scaleModeSelect");
const orbitSpeedButtons = document.querySelectorAll("[data-orbit-speed]");
const orbitPauseButton = document.getElementById("orbitPauseButton");
const planetInfoCard = document.getElementById("planetInfoCard");
const planetInfoOrder = document.getElementById("planetInfoOrder");
const planetInfoName = document.getElementById("planetInfoName");
const planetInfoType = document.getElementById("planetInfoType");
const planetInfoFeature = document.getElementById("planetInfoFeature");

if (!window.THREE) {
  throw new Error("Three.js 未加载，无法初始化 3D 宇宙场景。");
}

const STATE_HOME = "home3d";
const STATE_TRANSITION = "transitionToSolar";
const STATE_SOLAR = "solar3d";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const transitionDuration = prefersReducedMotion.matches ? 120 : 3800;

let currentState = STATE_HOME;
let transition = null;
let lastFrameTime = performance.now();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x030711, 0.00145);

let renderer = null;
let composer = null;
let bloomPass = null;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x02050d, 1);
  applyRendererColorSpace(renderer);
  if (THREE.ACESFilmicToneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
} catch (error) {
  document.body.classList.add("webgl-unavailable");
  canvas.setAttribute("data-webgl-error", "true");
  console.error("无法创建 WebGL 上下文，Three.js 3D 场景未启动。", error);
}

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1400);
const cameraTarget = new THREE.Vector3();
const homeCamera = {
  position: new THREE.Vector3(0, 6, 78),
  target: new THREE.Vector3(0, -13, -40),
  fov: 72,
};
const galaxyCamera = {
  position: new THREE.Vector3(1.5, 5, 42),
  target: new THREE.Vector3(-2, -8, -82),
  fov: 78,
};
const solarCamera = {
  position: new THREE.Vector3(-24, 10, 58),
  target: new THREE.Vector3(0, -1.2, 0),
  fov: 54,
};
const solarViewPresets = {
  oblique: {
    position: new THREE.Vector3(-24, 10, 58),
    target: new THREE.Vector3(0, -1.2, 0),
    fov: 54,
  },
  top: {
    position: new THREE.Vector3(0, 76, 0.1),
    target: new THREE.Vector3(0, 0, 0),
    fov: 50,
  },
  side: {
    position: new THREE.Vector3(-48, 5.4, 15),
    target: new THREE.Vector3(0, -0.8, 0),
    fov: 48,
  },
  overview: {
    position: new THREE.Vector3(-35, 16, 78),
    target: new THREE.Vector3(0, -1.8, 0),
    fov: 58,
  },
};

const clock = new THREE.Clock();
const starLayers = [];
const nebulaSprites = [];
const planetRecords = [];
const moonRecords = [];
const labelTargets = [];
const orbitRecords = [];
const selectableRecords = [];
const distantGalaxySprites = [];
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const tempVector = new THREE.Vector3();
const cameraTweenStart = {
  position: new THREE.Vector3(),
  target: new THREE.Vector3(),
};
const cameraTweenEnd = {
  position: new THREE.Vector3(),
  target: new THREE.Vector3(),
};
let immersiveStarVolume = null;
let foregroundStarVolume = null;
let transitionStreaks = null;
let projectionGroup = null;
let projectionParticleBelt = null;
let projectionStarCurtain = null;
let projectionRingPlanet = null;
let solarParticleBelt = null;
let milkyWayGroup = null;
let orbitControls = null;
let selectedRecord = null;
let activeView = "oblique";
let scaleMode = "teaching";
let showOrbits = true;
let showLabels = true;
let orbitPaused = false;
let orbitSpeedMultiplier = 4;
const orbitClassroomRate = 2.4;
let cameraTween = null;
let milkyWayBaseRotationZ = -0.16;
let projectionVisibility = 1;
let transitionProgress = 0;
let starPointTexture = null;
const tempWorldPosition = new THREE.Vector3();
const tempProjectedPosition = new THREE.Vector3();

const ambientLight = new THREE.AmbientLight(0x8ba4c7, 0.42);
scene.add(ambientLight);

const solarGroup = new THREE.Group();
solarGroup.name = "solar-system-3d";
solarGroup.position.set(0, -2, 0);
scene.add(solarGroup);

const sunLight = new THREE.PointLight(0xffc86a, 0, 180, 1.6);
sunLight.name = "sun-light";
solarGroup.add(sunLight);

const planetTextureLoader = new THREE.TextureLoader();
const planetTexturePaths = {
  mercury: "assets/planet-textures/mercury-jpl.jpg",
  venus: "assets/planet-textures/venus-jpl.jpg",
  earth: "assets/planet-textures/earth-blue-marble-nasa-4k.jpg",
  earthClouds: "assets/planet-textures/earth-clouds-nasa-alpha-2k.png",
  mars: "assets/planet-textures/mars-jpl.jpg",
  jupiter: "assets/planet-textures/jupiter-jpl.jpg",
  moon: "assets/planet-textures/moon-lroc-color-2k.jpg",
  moonBump: "assets/planet-textures/moon-ldem-1k.jpg",
};
const planetTextureCache = new Map();

function resizeRenderer() {
  if (!renderer) {
    return;
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  if (composer) {
    composer.setSize(width, height);
  }
  if (bloomPass) {
    bloomPass.resolution.set(width, height);
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateCameraPresets();
}

function initialiseBloomPipeline() {
  if (!renderer || !THREE.EffectComposer || !THREE.RenderPass || !THREE.UnrealBloomPass) {
    return;
  }

  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.46,
      0.42,
      0.82,
    );
    composer.addPass(bloomPass);
  } catch (error) {
    composer = null;
    bloomPass = null;
    console.warn("Bloom 后处理初始化失败，已回退到普通 WebGL 渲染。", error);
  }
}

function updateCameraPresets() {
  const isTablet = window.innerWidth < 900;
  const isPhone = window.innerWidth < 560;

  if (isPhone) {
    solarGroup.position.set(0, -1.2, 0);
    solarGroup.scale.setScalar(0.74);
    solarViewPresets.oblique.position.set(-18, 10, 86);
    solarViewPresets.oblique.target.set(0, -1.4, 0);
    solarViewPresets.oblique.fov = 62;
    solarViewPresets.top.position.set(0, 96, 0.1);
    solarViewPresets.top.target.set(0, 0, 0);
    solarViewPresets.top.fov = 58;
    solarViewPresets.side.position.set(-76, 6.5, 22);
    solarViewPresets.side.target.set(0, -1, 0);
    solarViewPresets.side.fov = 58;
    solarViewPresets.overview.position.set(-28, 18, 102);
    solarViewPresets.overview.target.set(0, -1.8, 0);
    solarViewPresets.overview.fov = 66;
  } else if (isTablet) {
    solarGroup.position.set(0, -1.7, 0);
    solarGroup.scale.setScalar(0.94);
    solarViewPresets.oblique.position.set(-22, 11, 74);
    solarViewPresets.oblique.target.set(0, -1.3, 0);
    solarViewPresets.oblique.fov = 58;
    solarViewPresets.top.position.set(0, 86, 0.1);
    solarViewPresets.top.target.set(0, 0, 0);
    solarViewPresets.top.fov = 54;
    solarViewPresets.side.position.set(-62, 6, 18);
    solarViewPresets.side.target.set(0, -1, 0);
    solarViewPresets.side.fov = 54;
    solarViewPresets.overview.position.set(-32, 17, 90);
    solarViewPresets.overview.target.set(0, -1.8, 0);
    solarViewPresets.overview.fov = 62;
  } else {
    solarGroup.position.set(0, -2, 0);
    solarGroup.scale.setScalar(1.06);
    solarViewPresets.oblique.position.set(-24, 10, 58);
    solarViewPresets.oblique.target.set(0, -1.2, 0);
    solarViewPresets.oblique.fov = 54;
    solarViewPresets.top.position.set(0, 76, 0.1);
    solarViewPresets.top.target.set(0, 0, 0);
    solarViewPresets.top.fov = 50;
    solarViewPresets.side.position.set(-48, 5.4, 15);
    solarViewPresets.side.target.set(0, -0.8, 0);
    solarViewPresets.side.fov = 48;
    solarViewPresets.overview.position.set(-35, 16, 78);
    solarViewPresets.overview.target.set(0, -1.8, 0);
    solarViewPresets.overview.fov = 58;
  }
  solarCamera.position.copy(solarViewPresets.oblique.position);
  solarCamera.target.copy(solarViewPresets.oblique.target);
  solarCamera.fov = solarViewPresets.oblique.fov;

  if (currentState === STATE_HOME) {
    copyCameraPose(homeCamera);
  } else if (currentState === STATE_SOLAR && !cameraTween) {
    applySolarView(activeView, 1);
  }
}

function copyCameraPose(pose) {
  camera.position.copy(pose.position);
  cameraTarget.copy(pose.target);
  setCameraFov(pose.fov || camera.fov);
  camera.lookAt(cameraTarget);
  syncOrbitControls();
}

function setCameraFov(fov) {
  if (Math.abs(camera.fov - fov) < 0.01) {
    return;
  }
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

function initialiseCameraControls() {
  if (orbitControls || !THREE.OrbitControls) {
    return;
  }
  orbitControls = new THREE.OrbitControls(camera, canvas);
  orbitControls.enabled = false;
  orbitControls.target.copy(cameraTarget);
  orbitControls.minDistance = 7;
  orbitControls.maxDistance = 160;
  orbitControls.minPolarAngle = 0.08;
  orbitControls.maxPolarAngle = Math.PI - 0.08;
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.1;
}

function syncOrbitControls() {
  if (!orbitControls) {
    return;
  }
  orbitControls.target.copy(cameraTarget);
  orbitControls.sync();
}

function setOrbitControlsEnabled(enabled) {
  if (orbitControls) {
    orbitControls.enabled = enabled;
  }
}

function setActiveViewButton(viewName) {
  viewButtons.forEach((button) => {
    const isActive = button.dataset.view === viewName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function startCameraTween(position, target, fov, duration = 1100) {
  cameraTweenStart.position.copy(camera.position);
  cameraTweenStart.target.copy(cameraTarget);
  cameraTweenEnd.position.copy(position);
  cameraTweenEnd.target.copy(target);
  cameraTween = {
    startTime: performance.now(),
    duration,
    startFov: camera.fov,
    endFov: fov,
  };
  setOrbitControlsEnabled(false);
}

function updateCameraTween(now) {
  if (!cameraTween) {
    return false;
  }

  const rawProgress = THREE.MathUtils.clamp((now - cameraTween.startTime) / cameraTween.duration, 0, 1);
  const progress = easeInOutCubic(rawProgress);
  camera.position.lerpVectors(cameraTweenStart.position, cameraTweenEnd.position, progress);
  cameraTarget.lerpVectors(cameraTweenStart.target, cameraTweenEnd.target, progress);
  setCameraFov(THREE.MathUtils.lerp(cameraTween.startFov, cameraTween.endFov, progress));
  camera.lookAt(cameraTarget);

  if (rawProgress >= 1) {
    cameraTween = null;
    syncOrbitControls();
    setOrbitControlsEnabled(currentState === STATE_SOLAR);
  }
  return true;
}

function applySolarView(viewName, duration = 1000) {
  if (viewName === "follow") {
    if (selectedRecord) {
      focusPlanetRecord(selectedRecord);
    } else {
      showPlanetInfo(null);
    }
    return;
  }

  const preset = solarViewPresets[viewName] || solarViewPresets.oblique;
  activeView = viewName;
  setActiveViewButton(viewName);
  startCameraTween(preset.position, preset.target, preset.fov, duration);
}

function focusPlanetRecord(record) {
  if (!record || !record.mesh) {
    return;
  }

  record.mesh.getWorldPosition(tempWorldPosition);
  const direction = camera.position.clone().sub(tempWorldPosition);
  if (direction.lengthSq() < 0.001) {
    direction.set(0.7, 0.22, 1);
  }
  direction.normalize();
  const visualRadius = Math.max(0.7, (record.radius || 1) * (record.mesh.scale?.x || 1) * solarGroup.scale.x);
  const distance = Math.max(6.5, visualRadius * 7.5 + 4.5);
  const target = tempWorldPosition.clone();
  const position = target.clone().add(direction.multiplyScalar(distance));
  position.y += Math.max(1.2, visualRadius * 1.15);

  activeView = "follow";
  setActiveViewButton("follow");
  startCameraTween(position, target, record.name === "太阳" ? 42 : 38, 1250);
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function createRadialTexture(stops) {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 256;
  canvasTexture.height = 256;
  const ctx = canvasTexture.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach((stop) => gradient.addColorStop(stop.offset, stop.color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvasTexture);
  return applySrgbTexture(texture);
}

function createPlanetTexture(options) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 128;
  const ctx = textureCanvas.getContext("2d");
  const base = ctx.createLinearGradient(0, 0, 256, 128);
  base.addColorStop(0, options.light);
  base.addColorStop(0.44, options.color);
  base.addColorStop(1, options.dark);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 128);

  if (options.bands) {
    options.bands.forEach((band) => {
      ctx.fillStyle = band.color;
      ctx.fillRect(0, band.y, 256, band.height);
    });
  }

  if (options.spots) {
    options.spots.forEach((spot) => {
      ctx.fillStyle = spot.color;
      ctx.beginPath();
      ctx.ellipse(spot.x, spot.y, spot.rx, spot.ry, spot.rotation || 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  return applySrgbTexture(texture);
}

function createSunSurfaceTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 768;
  textureCanvas.height = 384;
  const ctx = textureCanvas.getContext("2d");
  const random = createSeededRandom(110911);

  const base = ctx.createLinearGradient(0, 0, 0, 384);
  base.addColorStop(0, "#f39a25");
  base.addColorStop(0.22, "#f6a72d");
  base.addColorStop(0.5, "#f9ae31");
  base.addColorStop(0.78, "#f5a329");
  base.addColorStop(1, "#ef941f");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 768, 384);

  for (let i = 0; i < 2600; i += 1) {
    const x = random() * 768;
    const y = random() * 384;
    const radius = 1.5 + random() * 4.5;
    const warm = 206 + Math.floor(random() * 49);
    const alpha = 0.045 + random() * 0.12;
    ctx.fillStyle = `rgba(255, ${warm}, ${72 + Math.floor(random() * 55)}, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * (1.2 + random()), radius * 0.58, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 180; i += 1) {
    const y = random() * 384;
    ctx.strokeStyle = `rgba(255, ${180 + Math.floor(random() * 44)}, 78, ${0.08 + random() * 0.11})`;
    ctx.lineWidth = 0.7 + random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 768; x += 32) {
      ctx.lineTo(x, y + Math.sin(x * 0.018 + random() * 4) * (4 + random() * 9));
    }
    ctx.stroke();
  }

  const sunspots = [
    [176, 145, 12, 5, -0.15],
    [462, 232, 17, 7, 0.22],
    [585, 118, 9, 4, -0.48],
  ];
  sunspots.forEach(([x, y, rx, ry, rotation]) => {
    const glow = ctx.createRadialGradient(x, y, 1, x, y, rx * 1.8);
    glow.addColorStop(0, "rgba(70, 28, 10, 0.52)");
    glow.addColorStop(0.32, "rgba(122, 55, 18, 0.34)");
    glow.addColorStop(1, "rgba(255, 143, 31, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 1.8, ry * 1.7, rotation, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(50, 20, 9, 0.44)";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return applySrgbTexture(texture);
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createMercurySurfaceTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 256;
  const ctx = textureCanvas.getContext("2d");
  const random = createSeededRandom(20801);

  const base = ctx.createLinearGradient(0, 0, 512, 256);
  base.addColorStop(0, "#d4cec4");
  base.addColorStop(0.5, "#8f8c86");
  base.addColorStop(1, "#514f4d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 256);

  for (let i = 0; i < 260; i += 1) {
    const x = random() * 512;
    const y = random() * 256;
    const radius = 1.2 + Math.pow(random(), 2.2) * 15;
    const shade = Math.floor(72 + random() * 70);
    ctx.strokeStyle = `rgba(${shade + 35}, ${shade + 33}, ${shade + 29}, ${0.16 + random() * 0.25})`;
    ctx.lineWidth = Math.max(0.65, radius * 0.13);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade - 4}, ${0.06 + random() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x + radius * 0.12, y + radius * 0.1, radius * 0.74, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 36; i += 1) {
    const y = random() * 256;
    const height = 1 + random() * 4;
    ctx.fillStyle = `rgba(255, 246, 224, ${0.03 + random() * 0.045})`;
    ctx.fillRect(0, y, 512, height);
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return applySrgbTexture(texture);
}

function createVenusCloudTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 256;
  const ctx = textureCanvas.getContext("2d");
  const random = createSeededRandom(31027);
  ctx.clearRect(0, 0, 512, 256);

  for (let i = 0; i < 70; i += 1) {
    const y = random() * 256;
    const height = 3 + random() * 12;
    const alpha = 0.08 + random() * 0.12;
    ctx.fillStyle = `rgba(255, ${214 + Math.floor(random() * 24)}, ${148 + Math.floor(random() * 32)}, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(256 + random() * 80 - 40, y, 260 + random() * 120, height, (random() - 0.5) * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return applySrgbTexture(texture);
}

function createEarthCloudTexture() {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = 512;
  maskCanvas.height = 256;
  const maskCtx = maskCanvas.getContext("2d");
  const image = maskCtx.createImageData(maskCanvas.width, maskCanvas.height);

  const smooth = (value) => value * value * (3 - 2 * value);
  const hash = (x, y) => {
    let value = Math.imul(x + 1619, 31337) ^ Math.imul(y + 6971, 1013);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const top = THREE.MathUtils.lerp(hash(x0, y0), hash(x0 + 1, y0), tx);
    const bottom = THREE.MathUtils.lerp(hash(x0, y0 + 1), hash(x0 + 1, y0 + 1), tx);
    return THREE.MathUtils.lerp(top, bottom, ty);
  };
  const fractalNoise = (x, y) => {
    let value = 0;
    let amplitude = 0.56;
    let frequency = 1;
    for (let octave = 0; octave < 5; octave += 1) {
      value += noise(x * frequency, y * frequency) * amplitude;
      frequency *= 2.06;
      amplitude *= 0.48;
    }
    return value;
  };
  const smoothstep = (edge0, edge1, value) => {
    const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  for (let y = 0; y < maskCanvas.height; y += 1) {
    const latitude = y / maskCanvas.height;
    const latitudeFromEquator = Math.abs(latitude - 0.5) * 2;
    for (let x = 0; x < maskCanvas.width; x += 1) {
      const longitude = x / maskCanvas.width;
      const warp = noise(longitude * 3.4 + 11, latitude * 5.2 + 19) - 0.5;
      const largeClouds = fractalNoise(longitude * 5.4 + warp * 0.72, latitude * 8.2);
      const wisps = noise(longitude * 25 + warp * 2.4, latitude * 19 + 7);
      const weatherBand = 0.055 * Math.sin(latitude * Math.PI * 22 + warp * 5.5);
      const polarFade = 1 - smoothstep(0.78, 0.98, latitudeFromEquator);
      const density = largeClouds + weatherBand + (wisps - 0.5) * 0.075;
      const alpha = smoothstep(0.55, 0.73, density) * polarFade * 0.82;
      const index = (y * maskCanvas.width + x) * 4;
      const brightness = Math.round(226 + wisps * 29);
      image.data[index] = brightness;
      image.data[index + 1] = Math.min(255, brightness + 3);
      image.data[index + 2] = 255;
      image.data[index + 3] = Math.round(alpha * 255);
    }
  }
  maskCtx.putImageData(image, 0, 0);

  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 1024;
  textureCanvas.height = 512;
  const ctx = textureCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(maskCanvas, 0, 0, textureCanvas.width, textureCanvas.height);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return applySrgbTexture(texture);
}

function createSaturnBodyTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 768;
  textureCanvas.height = 384;
  const ctx = textureCanvas.getContext("2d");
  const random = createSeededRandom(61211);

  const base = ctx.createLinearGradient(0, 0, 0, 384);
  base.addColorStop(0, "#f4dfad");
  base.addColorStop(0.28, "#d9bd83");
  base.addColorStop(0.5, "#f1d99d");
  base.addColorStop(0.72, "#c9aa70");
  base.addColorStop(1, "#816744");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 768, 384);

  const bands = [
    [34, 18, "rgba(255, 239, 190, 0.34)"],
    [66, 12, "rgba(168, 128, 78, 0.16)"],
    [104, 22, "rgba(255, 231, 172, 0.28)"],
    [148, 9, "rgba(122, 91, 57, 0.18)"],
    [180, 20, "rgba(255, 243, 202, 0.30)"],
    [226, 14, "rgba(147, 111, 71, 0.20)"],
    [274, 18, "rgba(238, 202, 138, 0.22)"],
    [324, 16, "rgba(105, 78, 52, 0.18)"],
  ];
  bands.forEach(([y, height, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, y, 768, height);
  });

  for (let i = 0; i < 190; i += 1) {
    const y = random() * 384;
    const alpha = 0.025 + random() * 0.055;
    ctx.fillStyle = `rgba(255, 248, 222, ${alpha})`;
    ctx.fillRect(0, y, 768, 0.7 + random() * 2.4);
  }

  for (let i = 0; i < 42; i += 1) {
    const x = random() * 768;
    const y = 70 + random() * 245;
    const rx = 18 + random() * 70;
    const ry = 2 + random() * 7;
    ctx.fillStyle = `rgba(108, 83, 58, ${0.035 + random() * 0.055})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (random() - 0.5) * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return applySrgbTexture(texture);
}

function createUranusAtmosphereTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 768;
  textureCanvas.height = 384;
  const ctx = textureCanvas.getContext("2d");
  const random = createSeededRandom(70591);

  const base = ctx.createLinearGradient(0, 0, 0, 384);
  base.addColorStop(0, "#d3ebe7");
  base.addColorStop(0.34, "#add7d6");
  base.addColorStop(0.58, "#8bc7ca");
  base.addColorStop(1, "#5e9fac");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 768, 384);

  for (let i = 0; i < 14; i += 1) {
    const y = 42 + random() * 304;
    const height = 1.1 + random() * 5.4;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.012 + random() * 0.024})`;
    ctx.fillRect(0, y, 768, height);
  }

  [74, 116, 176, 228, 292].forEach((y, index) => {
    ctx.fillStyle = `rgba(235, 255, 252, ${index === 2 ? 0.045 : 0.022})`;
    ctx.fillRect(0, y, 768, 1.2 + index * 0.18);
  });

  for (let i = 0; i < 7; i += 1) {
    ctx.fillStyle = `rgba(58, 129, 148, ${0.012 + random() * 0.02})`;
    ctx.beginPath();
    ctx.ellipse(random() * 768, 80 + random() * 240, 80 + random() * 150, 3 + random() * 8, (random() - 0.5) * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return applySrgbTexture(texture);
}

function createNeptuneAtmosphereTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 768;
  textureCanvas.height = 384;
  const ctx = textureCanvas.getContext("2d");
  const random = createSeededRandom(88433);

  const base = ctx.createLinearGradient(0, 0, 0, 384);
  base.addColorStop(0, "#78a8d7");
  base.addColorStop(0.26, "#4c82bd");
  base.addColorStop(0.56, "#2d639f");
  base.addColorStop(1, "#173f78");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 768, 384);

  for (let i = 0; i < 34; i += 1) {
    const y = 34 + random() * 318;
    ctx.fillStyle = `rgba(220, 241, 255, ${0.025 + random() * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(random() * 768, y, 34 + random() * 136, 2.5 + random() * 9, (random() - 0.5) * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 18; i += 1) {
    const y = 42 + random() * 300;
    ctx.strokeStyle = `rgba(155, 196, 235, ${0.025 + random() * 0.04})`;
    ctx.lineWidth = 1 + random() * 2.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 768; x += 40) {
      ctx.lineTo(x, y + Math.sin(x * 0.016 + random() * 5) * (2 + random() * 6));
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(12, 35, 76, 0.28)";
  ctx.beginPath();
  ctx.ellipse(512, 232, 52, 21, -0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(230, 246, 255, 0.20)";
  ctx.beginPath();
  ctx.ellipse(306, 132, 88, 8, 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(606, 92, 60, 6, -0.16, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return applySrgbTexture(texture);
}

function applyRendererColorSpace(targetRenderer) {
  if ("outputColorSpace" in targetRenderer && THREE.SRGBColorSpace) {
    targetRenderer.outputColorSpace = THREE.SRGBColorSpace;
  } else if ("outputEncoding" in targetRenderer && THREE.sRGBEncoding) {
    targetRenderer.outputEncoding = THREE.sRGBEncoding;
  }
}

function applySrgbTexture(texture) {
  if ("colorSpace" in texture && THREE.SRGBColorSpace) {
    texture.colorSpace = THREE.SRGBColorSpace;
  } else if ("encoding" in texture && THREE.sRGBEncoding) {
    texture.encoding = THREE.sRGBEncoding;
  }
  return texture;
}

function prepareTexture(texture) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1;
  texture.needsUpdate = true;
  return applySrgbTexture(texture);
}

function loadPlanetTexture(path) {
  if (!planetTextureCache.has(path)) {
    const texture = planetTextureLoader.load(path, (loadedTexture) => {
      prepareTexture(loadedTexture);
    });
    planetTextureCache.set(path, prepareTexture(texture));
  }
  return planetTextureCache.get(path);
}

function rememberOpacity(material, baseOpacity = material.opacity ?? 1) {
  material.transparent = true;
  material.userData.baseOpacity = baseOpacity;
  return material;
}

function createStarLayer(name, count, zMin, zMax, spread, size, opacity) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [
    new THREE.Color(0xcbe7ff),
    new THREE.Color(0xffffff),
    new THREE.Color(0xb7c8ff),
    new THREE.Color(0xffdfb6),
  ];

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    const depth = THREE.MathUtils.randFloat(zMin, zMax);
    const depthFactor = THREE.MathUtils.mapLinear(depth, zMin, zMax, 1.25, 0.72);
    const radius = spread * depthFactor * Math.sqrt(Math.random());
    const angle = Math.random() * Math.PI * 2;
    positions[index] = Math.cos(angle) * radius;
    positions[index + 1] = Math.sin(angle) * radius * 0.68 + THREE.MathUtils.randFloatSpread(12);
    positions[index + 2] = depth;

    const color = palette[Math.floor(Math.random() * palette.length)].clone();
    color.multiplyScalar(THREE.MathUtils.randFloat(0.62, 1.08));
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size,
    map: starPointTexture,
    vertexColors: true,
    transparent: true,
    opacity,
    sizeAttenuation: true,
    depthWrite: false,
    alphaTest: 0.02,
  });

  const points = new THREE.Points(geometry, material);
  points.name = name;
  scene.add(points);
  const layer = { name, points, count, zMin, zMax, size, opacity };
  starLayers.push(layer);
  return layer;
}

function createImmersiveStarVolume() {
  const count = 980;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [
    new THREE.Color(0xe6f7ff),
    new THREE.Color(0xffffff),
    new THREE.Color(0xbcd0ff),
    new THREE.Color(0xffe2b6),
  ];

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    const depth = THREE.MathUtils.randFloat(-300, 166);
    const distanceFromCamera = Math.max(12, homeCamera.position.z - depth);
    const viewSpread = Math.max(34, Math.tan(THREE.MathUtils.degToRad(42)) * distanceFromCamera * 0.78);
    const edgeBias = Math.random() < 0.34 ? THREE.MathUtils.randFloat(0.68, 1.08) : Math.sqrt(Math.random()) * 0.72;
    const angle = Math.random() * Math.PI * 2;
    const yFlatten = THREE.MathUtils.randFloat(0.55, 0.82);

    positions[index] = Math.cos(angle) * viewSpread * edgeBias;
    positions[index + 1] = Math.sin(angle) * viewSpread * edgeBias * yFlatten + THREE.MathUtils.randFloatSpread(10);
    positions[index + 2] = depth;

    const closeness = THREE.MathUtils.smoothstep(depth, 0, 166);
    const color = palette[Math.floor(Math.random() * palette.length)].clone();
    color.multiplyScalar(THREE.MathUtils.lerp(0.56, 1.22, closeness) * THREE.MathUtils.randFloat(0.82, 1.08));
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = rememberOpacity(new THREE.PointsMaterial({
    size: 0.82,
    map: starPointTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.02,
  }), 0.78);

  const points = new THREE.Points(geometry, material);
  points.name = "immersive-camera-star-volume";
  scene.add(points);
  immersiveStarVolume = { points, count, zMin: -300, zMax: 166, size: 0.82 };
  return immersiveStarVolume;
}

function createForegroundStarVolume() {
  const count = 120;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    const depth = THREE.MathUtils.randFloat(58, 166);
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.randFloat(28, 92);
    positions[index] = Math.cos(angle) * radius;
    positions[index + 1] = Math.sin(angle) * radius * THREE.MathUtils.randFloat(0.58, 0.92);
    positions[index + 2] = depth;

    const warmth = Math.random() < 0.22;
    const color = new THREE.Color(warmth ? 0xffdfbb : 0xe6f8ff);
    color.multiplyScalar(THREE.MathUtils.randFloat(0.88, 1.35));
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = rememberOpacity(new THREE.PointsMaterial({
    size: 1.2,
    map: starPointTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.58,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.02,
  }), 0.58);

  const points = new THREE.Points(geometry, material);
  points.name = "foreground-passing-star-volume";
  scene.add(points);
  foregroundStarVolume = { points, count, zMin: 58, zMax: 166, size: 1.2 };
  return foregroundStarVolume;
}

function createTransitionStreaks() {
  const count = 190;
  const positions = new Float32Array(count * 2 * 3);
  const colors = new Float32Array(count * 2 * 3);
  const colorNear = new THREE.Color(0xeaf8ff);
  const colorCool = new THREE.Color(0x8fc7ff);

  for (let i = 0; i < count; i += 1) {
    const index = i * 6;
    const depth = THREE.MathUtils.randFloat(-120, 156);
    const distanceFromCamera = Math.max(18, homeCamera.position.z - depth);
    const viewSpread = Math.max(42, Math.tan(THREE.MathUtils.degToRad(45)) * distanceFromCamera * 0.62);
    const angle = Math.random() * Math.PI * 2;
    const radius = viewSpread * THREE.MathUtils.randFloat(0.18, 1.02);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * THREE.MathUtils.randFloat(0.56, 0.84);
    const length = THREE.MathUtils.randFloat(10, 34) * THREE.MathUtils.mapLinear(depth, -120, 156, 0.72, 1.5);

    positions[index] = x;
    positions[index + 1] = y;
    positions[index + 2] = depth;
    positions[index + 3] = x;
    positions[index + 4] = y;
    positions[index + 5] = depth + length;

    const color = colorCool.clone().lerp(colorNear, THREE.MathUtils.randFloat(0.25, 0.85));
    const brightness = THREE.MathUtils.randFloat(0.58, 1.08);
    color.multiplyScalar(brightness);
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
    colors[index + 3] = color.r;
    colors[index + 4] = color.g;
    colors[index + 5] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = rememberOpacity(new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), 0.32);

  transitionStreaks = new THREE.LineSegments(geometry, material);
  transitionStreaks.name = "camera-forward-transition-streaks";
  transitionStreaks.visible = false;
  scene.add(transitionStreaks);
}

function setTransitionStreakOpacity(opacity) {
  if (!transitionStreaks) {
    return;
  }

  const visibleOpacity = THREE.MathUtils.clamp(opacity, 0, 0.32);
  transitionStreaks.visible = visibleOpacity > 0.004;
  transitionStreaks.material.opacity = visibleOpacity;
}

function createProjectionOrbit(parent, name, radiusX, radiusZ, y, color, opacity) {
  const points = [];
  const segments = 256;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radiusX, y, Math.sin(angle) * radiusZ));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = rememberOpacity(new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), opacity);
  const orbit = new THREE.LineLoop(geometry, material);
  orbit.name = name;
  parent.add(orbit);
  return orbit;
}

function createProjectionParticleBelt(parent) {
  const count = 1900;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const colorA = new THREE.Color(0xf2e8ff);
  const colorB = new THREE.Color(0xb890ff);
  const colorC = new THREE.Color(0x92f0ff);

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    const x = THREE.MathUtils.randFloatSpread(112);
    const beltNoise = Math.sin(x * 0.08) * 1.4 + THREE.MathUtils.randFloatSpread(2.1);
    const depth = THREE.MathUtils.randFloat(-10, 12);
    positions[index] = x;
    positions[index + 1] = beltNoise;
    positions[index + 2] = depth + Math.sin(x * 0.035) * 4;

    const color = (Math.random() < 0.58 ? colorA : colorB).clone().lerp(colorC, Math.random() * 0.22);
    color.multiplyScalar(THREE.MathUtils.randFloat(0.62, 1.18));
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = rememberOpacity(new THREE.PointsMaterial({
    size: 0.36,
    map: starPointTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.84,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.02,
  }), 0.84);

  projectionParticleBelt = new THREE.Points(geometry, material);
  projectionParticleBelt.name = "immersive-projection-particle-belt";
  parent.add(projectionParticleBelt);
}

function createProjectionStarCurtain(parent) {
  const count = 720;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const white = new THREE.Color(0xffffff);
  const cool = new THREE.Color(0xc8dcff);

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    positions[index] = THREE.MathUtils.randFloatSpread(132);
    positions[index + 1] = THREE.MathUtils.randFloat(6, 58);
    positions[index + 2] = THREE.MathUtils.randFloat(-28, -8);

    const color = white.clone().lerp(cool, Math.random() * 0.75);
    color.multiplyScalar(THREE.MathUtils.randFloat(0.48, 1.18));
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = rememberOpacity(new THREE.PointsMaterial({
    size: 0.58,
    map: starPointTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.52,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.02,
  }), 0.52);

  projectionStarCurtain = new THREE.Points(geometry, material);
  projectionStarCurtain.name = "projection-wall-star-curtain";
  parent.add(projectionStarCurtain);
}

function createHolographicProjectionStage() {
  projectionGroup = new THREE.Group();
  projectionGroup.name = "near-holographic-cosmic-stage";
  projectionGroup.position.set(-2, -24, -36);
  projectionGroup.rotation.set(-0.03, 0.05, 0);
  projectionGroup.scale.setScalar(1.48);
  scene.add(projectionGroup);

  [14, 21, 30, 40, 52].forEach((radius, index) => {
    createProjectionOrbit(
      projectionGroup,
      `projection-stage-orbit-${index + 1}`,
      radius * 1.18,
      radius * 0.56,
      index * 0.12,
      index % 2 === 0 ? 0xd9d7ff : 0xa6dfff,
      0.18 + index * 0.025
    );
  });

  const horizonGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-78, 0.35, 1.5),
    new THREE.Vector3(80, 0.35, 1.5),
  ]);
  const horizonMaterial = rememberOpacity(new THREE.LineBasicMaterial({
    color: 0xbca0ff,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), 0.34);
  const horizon = new THREE.Line(horizonGeometry, horizonMaterial);
  horizon.name = "projection-horizontal-light-beam";
  projectionGroup.add(horizon);

  createProjectionParticleBelt(projectionGroup);
  createProjectionStarCurtain(projectionGroup);

  projectionRingPlanet = new THREE.Group();
  projectionRingPlanet.name = "near-ringed-hologram-planet";
  projectionRingPlanet.position.set(-23, 4.8, -2);
  projectionGroup.add(projectionRingPlanet);

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 48, 32),
    rememberOpacity(new THREE.MeshBasicMaterial({
      color: 0xfff7ff,
      transparent: true,
      opacity: 0.86,
    }), 0.86)
  );
  planet.name = "projection-ring-planet-core";
  projectionRingPlanet.add(planet);

  const planetGlow = createGlowSprite("projection-ring-planet-glow", 20, [
    { offset: 0, color: "rgba(255, 245, 255, 0.7)" },
    { offset: 0.3, color: "rgba(210, 128, 255, 0.26)" },
    { offset: 1, color: "rgba(210, 128, 255, 0)" },
  ], 0.54);
  projectionRingPlanet.add(planetGlow);

  const ringMaterial = rememberOpacity(new THREE.MeshBasicMaterial({
    color: 0xc47cff,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), 0.7);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 8.2, 128), ringMaterial);
  ring.name = "projection-ring-planet-purple-ring";
  ring.rotation.x = Math.PI / 2.35;
  ring.rotation.y = 0.22;
  projectionRingPlanet.add(ring);

  const miniPlanets = [
    [-7, 0.9, 2.5, 0xff6f7d, 0.8],
    [4, 1.1, 3.8, 0xf4f4ff, 1.35],
    [14, 0.7, 5.1, 0xe9e5ff, 0.78],
    [24, 1.4, 5.8, 0xfff2a6, 1.55],
    [36, 0.8, 4.2, 0x745cff, 0.9],
  ];

  miniPlanets.forEach((entry, index) => {
    const mini = new THREE.Mesh(
      new THREE.SphereGeometry(entry[4], 32, 20),
      rememberOpacity(new THREE.MeshBasicMaterial({
        color: entry[3],
        transparent: true,
        opacity: 0.82,
      }), 0.82)
    );
    mini.name = `projection-mini-planet-${index + 1}`;
    mini.position.set(entry[0], entry[1], entry[2]);
    projectionGroup.add(mini);
  });

  setProjectionOpacity(1);
}

function setProjectionOpacity(opacity) {
  if (!projectionGroup) {
    return;
  }

  const visibleOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  projectionVisibility = visibleOpacity;
  projectionGroup.visible = visibleOpacity > 0.01;
  projectionGroup.traverse((object) => {
    if (!object.material) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material.userData.baseOpacity === undefined) {
        material.userData.baseOpacity = material.opacity ?? 1;
      }
      material.transparent = true;
      material.opacity = material.userData.baseOpacity * visibleOpacity;
    });
  });
}

function createNebulaSprite(name, position, scale, colors, opacity) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createRadialTexture(colors),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sprite.name = name;
  sprite.position.copy(position);
  sprite.scale.set(scale.x, scale.y, 1);
  scene.add(sprite);
  nebulaSprites.push(sprite);
  return sprite;
}

function createDistantGalaxySprite(name, position, scale, rotation, opacity) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createRadialTexture([
      { offset: 0, color: "rgba(255, 239, 196, 0.82)" },
      { offset: 0.18, color: "rgba(142, 190, 230, 0.28)" },
      { offset: 0.52, color: "rgba(96, 119, 166, 0.1)" },
      { offset: 1, color: "rgba(96, 119, 166, 0)" },
    ]),
    transparent: true,
    opacity,
    rotation,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sprite.name = name;
  sprite.position.copy(position);
  sprite.scale.set(scale.x, scale.y, 1);
  rememberOpacity(sprite.material, opacity);
  scene.add(sprite);
  distantGalaxySprites.push(sprite);
  return sprite;
}

function createDistantGalaxyField() {
  const galaxyPositions = [
    [-166, 72, -430, 18, 5, -0.25, 0.16],
    [148, 58, -390, 15, 4, 0.42, 0.14],
    [-92, -64, -360, 13, 4, 0.12, 0.13],
    [112, -78, -330, 16, 5, -0.62, 0.12],
    [42, 88, -455, 10, 3, 0.78, 0.1],
    [-28, -92, -405, 12, 3, -0.38, 0.11],
    [184, 8, -470, 19, 5, 0.22, 0.13],
    [-188, -6, -385, 14, 4, -0.74, 0.12],
  ];

  galaxyPositions.forEach((entry, index) => {
    createDistantGalaxySprite(
      `distant-galaxy-${index + 1}`,
      new THREE.Vector3(entry[0], entry[1], entry[2]),
      new THREE.Vector2(entry[3], entry[4]),
      entry[5],
      entry[6]
    );
  });
}

function createMilkyWayFocus() {
  milkyWayGroup = new THREE.Group();
  milkyWayGroup.name = "milky-way-focus-depth-target";
  milkyWayGroup.position.set(0, 0, -142);
  milkyWayGroup.rotation.set(-0.22, 0.1, milkyWayBaseRotationZ);
  scene.add(milkyWayGroup);

  const positions = [];
  const colors = [];
  const colorCore = new THREE.Color(0xffe6ad);
  const colorArmBlue = new THREE.Color(0x8ed8ff);
  const colorArmWhite = new THREE.Color(0xf6fbff);
  const colorDust = new THREE.Color(0xce8f65);

  for (let i = 0; i < 2300; i += 1) {
    const arm = i % 4;
    const radius = 1.5 + Math.pow(Math.random(), 0.68) * 44;
    const armAngle = arm * Math.PI * 0.5 + radius * 0.18 + THREE.MathUtils.randFloatSpread(0.52 + radius * 0.006);
    const thickness = THREE.MathUtils.randFloatSpread(1.7 + radius * 0.018);
    const x = Math.cos(armAngle) * radius * 1.22 + thickness;
    const y = Math.sin(armAngle) * radius * 0.38 + THREE.MathUtils.randFloatSpread(1.2);
    const z = THREE.MathUtils.randFloatSpread(9);
    positions.push(x, y, z);

    const mix = THREE.MathUtils.clamp(radius / 44, 0, 1);
    const color = colorCore.clone().lerp(Math.random() > 0.45 ? colorArmBlue : colorArmWhite, mix);
    if (Math.random() < 0.18) {
      color.lerp(colorDust, 0.46);
    }
    color.multiplyScalar(THREE.MathUtils.randFloat(0.72, 1.16));
    colors.push(color.r, color.g, color.b);
  }

  for (let i = 0; i < 520; i += 1) {
    const radius = Math.pow(Math.random(), 1.8) * 8.5;
    const angle = Math.random() * Math.PI * 2;
    positions.push(
      Math.cos(angle) * radius * 1.18,
      Math.sin(angle) * radius * 0.5,
      THREE.MathUtils.randFloatSpread(4)
    );
    const color = colorCore.clone().lerp(colorArmWhite, Math.random() * 0.25);
    colors.push(color.r, color.g, color.b);
  }

  for (let i = 0; i < 460; i += 1) {
    const radius = 16 + Math.pow(Math.random(), 0.7) * 58;
    const angle = Math.random() * Math.PI * 2;
    positions.push(
      Math.cos(angle) * radius * THREE.MathUtils.randFloat(0.8, 1.18),
      Math.sin(angle) * radius * THREE.MathUtils.randFloat(0.22, 0.48),
      THREE.MathUtils.randFloatSpread(22)
    );
    const color = colorArmBlue.clone().lerp(colorArmWhite, Math.random() * 0.38);
    color.multiplyScalar(THREE.MathUtils.randFloat(0.34, 0.72));
    colors.push(color.r, color.g, color.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = rememberOpacity(new THREE.PointsMaterial({
    size: 0.72,
    map: starPointTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.02,
  }), 1);
  const galaxyPoints = new THREE.Points(geometry, material);
  galaxyPoints.name = "milky-way-spiral-particles";
  milkyWayGroup.add(galaxyPoints);

  const galaxyHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createRadialTexture([
      { offset: 0, color: "rgba(255, 231, 176, 0.42)" },
      { offset: 0.28, color: "rgba(93, 172, 218, 0.17)" },
      { offset: 0.62, color: "rgba(53, 90, 145, 0.06)" },
      { offset: 1, color: "rgba(53, 90, 145, 0)" },
    ]),
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  galaxyHalo.name = "milky-way-broad-halo";
  galaxyHalo.scale.set(142, 58, 1);
  rememberOpacity(galaxyHalo.material, 0.78);
  milkyWayGroup.add(galaxyHalo);

  const galaxyCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createRadialTexture([
      { offset: 0, color: "rgba(255, 245, 204, 0.95)" },
      { offset: 0.22, color: "rgba(255, 190, 104, 0.45)" },
      { offset: 0.58, color: "rgba(124, 190, 232, 0.12)" },
      { offset: 1, color: "rgba(124, 190, 232, 0)" },
    ]),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  galaxyCore.name = "milky-way-soft-core";
  galaxyCore.scale.set(30, 18, 1);
  rememberOpacity(galaxyCore.material, 0.9);
  milkyWayGroup.add(galaxyCore);

  setMilkyWayFocus(0.34, 0.95);
}

function setMilkyWayFocus(opacity, scale) {
  if (!milkyWayGroup) {
    return;
  }

  milkyWayGroup.visible = opacity > 0.01;
  milkyWayGroup.scale.setScalar(scale);
  milkyWayGroup.traverse((object) => {
    if (!object.material) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material.userData.baseOpacity === undefined) {
        material.userData.baseOpacity = material.opacity ?? 1;
      }
      material.transparent = true;
      material.opacity = material.userData.baseOpacity * opacity;
    });
  });
}

function loadNasaBackdrop() {
  const loader = new THREE.TextureLoader();
  loader.load(
    "assets/universe-bg.jpg",
    (texture) => {
      applySrgbTexture(texture);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      });
      const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(620, 520), material);
      backdrop.name = "nasa-deep-space-backdrop";
      backdrop.position.set(0, 0, -560);
      scene.add(backdrop);
    },
    undefined,
    () => {
      document.body.classList.add("nasa-backdrop-failed");
    }
  );
}

function createOrbit(radius) {
  const curvePoints = [];
  const segments = 192;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    curvePoints.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
  const material = rememberOpacity(new THREE.LineBasicMaterial({
    color: 0xcbd8ff,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), 0.34);
  const orbit = new THREE.LineLoop(geometry, material);
  orbit.name = `orbit-${radius}`;
  orbit.userData.baseRadius = radius;
  solarGroup.add(orbit);
  orbitRecords.push({
    object: orbit,
    teachingDistance: radius,
    currentDistance: radius,
  });
  return orbit;
}

function createSolarParticleBelt() {
  const count = 1500;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const colorA = new THREE.Color(0xe7e1ff);
  const colorB = new THREE.Color(0xb08cff);
  const colorC = new THREE.Color(0x7eeaff);

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    const x = THREE.MathUtils.randFloat(-42, 44);
    const z = THREE.MathUtils.randFloat(-9, 13) + Math.sin(x * 0.08) * 3.4;
    positions[index] = x;
    positions[index + 1] = THREE.MathUtils.randFloat(-1.4, 1.3);
    positions[index + 2] = z;

    const color = (Math.random() < 0.58 ? colorA : colorB).clone().lerp(colorC, Math.random() * 0.2);
    color.multiplyScalar(THREE.MathUtils.randFloat(0.54, 1.12));
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = rememberOpacity(new THREE.PointsMaterial({
    size: 0.22,
    map: starPointTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.54,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.02,
  }), 0.54);

  solarParticleBelt = new THREE.Points(geometry, material);
  solarParticleBelt.name = "solar-system-low-projection-particle-belt";
  solarGroup.add(solarParticleBelt);
}

function createGlowSprite(name, scale, colors, opacity) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createRadialTexture(colors),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sprite.name = name;
  sprite.scale.set(scale, scale, 1);
  rememberOpacity(sprite.material, opacity);
  return sprite;
}

function createSun() {
  const geometry = new THREE.SphereGeometry(4.4, 56, 36);
  const material = new THREE.MeshBasicMaterial({
    map: createSunSurfaceTexture(),
    color: 0xffffff,
    transparent: false,
    depthWrite: true,
  });
  material.userData.baseOpacity = 1;
  material.userData.keepOpaqueAtFullOpacity = true;
  const sun = new THREE.Mesh(geometry, material);
  sun.name = "太阳";
  sun.userData.labelOffset = { offsetX: 0, offsetY: -60 };
  solarGroup.add(sun);

  const plasmaShell = new THREE.Mesh(
    new THREE.SphereGeometry(4.52, 56, 36),
    rememberOpacity(new THREE.MeshBasicMaterial({
      color: 0xffa135,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }), 0.08)
  );
  plasmaShell.name = "太阳色球层微光";
  plasmaShell.userData.rotationSpeed = -0.028;
  sun.add(plasmaShell);

  const innerGlow = createGlowSprite("sun-inner-glow", 20, [
    { offset: 0, color: "rgba(255, 232, 155, 0.82)" },
    { offset: 0.26, color: "rgba(245, 158, 65, 0.34)" },
    { offset: 1, color: "rgba(245, 158, 65, 0)" },
  ], 0.74);
  solarGroup.add(innerGlow);

  const outerGlow = createGlowSprite("sun-outer-glow", 36, [
    { offset: 0, color: "rgba(255, 218, 130, 0.36)" },
    { offset: 0.34, color: "rgba(255, 164, 80, 0.13)" },
    { offset: 1, color: "rgba(255, 164, 80, 0)" },
  ], 0.52);
  solarGroup.add(outerGlow);

  const sunRecord = {
    name: "太阳",
    mesh: sun,
    order: "中心天体",
    type: "恒星",
    feature: "太阳自己发光发热，是太阳系中质量最大的天体，八大行星都围绕它公转。",
    radius: 4.4,
  };
  sun.userData.planetRecord = sunRecord;
  selectableRecords.push(sunRecord);
  createProjectedLabel("太阳", sun, { offsetX: 0, offsetY: -60, className: "is-sun" });

  return sun;
}

function createPlanetShell(planet, radius, shellConfig) {
  const shellMaterial = rememberOpacity(new THREE.MeshPhongMaterial({
    map: shellConfig.map || null,
    color: shellConfig.color || 0xffffff,
    transparent: true,
    opacity: shellConfig.opacity ?? 0.18,
    depthWrite: false,
    side: shellConfig.side || THREE.FrontSide,
    blending: shellConfig.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    shininess: shellConfig.shininess ?? 4,
    specular: shellConfig.specular || 0x26394f,
    alphaTest: shellConfig.alphaTest ?? 0.012,
  }), shellConfig.opacity ?? 0.18);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius * (shellConfig.scale || 1.04), 48, 30),
    shellMaterial,
  );
  shell.name = shellConfig.name || `${planet.name}-atmosphere`;
  shell.userData.rotationSpeed = shellConfig.rotationSpeed || 0;
  planet.add(shell);
  return shell;
}

function createAtmosphereGlow(planet, radius, atmosphereConfig) {
  const baseOpacity = atmosphereConfig.opacity ?? 0.38;
  const material = rememberOpacity(new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(atmosphereConfig.color || 0x7fc7ff) },
      uOpacity: { value: baseOpacity },
      uIntensity: { value: atmosphereConfig.intensity ?? 1.35 },
      uPower: { value: atmosphereConfig.power ?? 2.45 },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uPower;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float facing = abs(dot(normalize(vWorldNormal), viewDirection));
        float rim = pow(clamp(1.0 - facing, 0.0, 1.0), uPower);
        float alpha = rim * uOpacity;
        gl_FragColor = vec4(uColor * (uIntensity * rim), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  }), baseOpacity);
  material.userData.baseUniformOpacity = baseOpacity;

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * (atmosphereConfig.scale || 1.075), 64, 40),
    material,
  );
  atmosphere.name = `${planet.name}-真实薄大气边缘`;
  planet.add(atmosphere);
  return atmosphere;
}

function createMoonOrbitLine(radius) {
  const points = [];
  const segments = 128;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = rememberOpacity(new THREE.LineBasicMaterial({
    color: 0xe7edf6,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), 0.46);
  const orbit = new THREE.LineLoop(geometry, material);
  orbit.name = "月球轨道";
  return orbit;
}

function createMoonSystem(earthRecord, parentPivot, earthPlanet, options) {
  const moonDistance = options.distance || 2.4;
  const moonRadius = options.radius || 0.34;
  const tidallyLocked = options.tidallyLocked !== false;
  // This LROC map places the Moon's near side at the texture center. Rotate it
  // toward Earth once, then keep that yaw fixed while the orbit pivot turns.
  const surfaceYaw = options.surfaceYaw ?? Math.PI;
  const moonPivot = new THREE.Group();
  moonPivot.name = "月球绕地球公转轴";
  moonPivot.position.copy(earthPlanet.position);
  moonPivot.rotation.y = options.angle || 0;
  parentPivot.add(moonPivot);

  const orbit = createMoonOrbitLine(moonDistance);
  moonPivot.add(orbit);
  orbitRecords.push({
    object: orbit,
    isMoonOrbit: true,
  });

  const moonMaterial = rememberOpacity(new THREE.MeshStandardMaterial({
    map: loadPlanetTexture(planetTexturePaths.moon),
    bumpMap: loadPlanetTexture(planetTexturePaths.moonBump),
    bumpScale: 0.035,
    color: 0xf2eee4,
    roughness: 0.92,
    metalness: 0,
    emissive: 0x24282d,
    emissiveIntensity: 0.18,
  }), 1);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(moonRadius, 44, 28), moonMaterial);
  moon.name = "月球";
  moon.position.set(moonDistance, 0.16, 0);
  moon.rotation.y = surfaceYaw;
  moon.renderOrder = 3;
  moon.userData.labelOffset = { offsetX: 38, offsetY: -28 };
  moonPivot.add(moon);

  const reflectedLight = createGlowSprite("月球反射光微晕", 1.46, [
    { offset: 0, color: "rgba(235, 242, 255, 0.34)" },
    { offset: 0.42, color: "rgba(180, 201, 226, 0.14)" },
    { offset: 1, color: "rgba(140, 171, 205, 0)" },
  ], 0.24);
  reflectedLight.renderOrder = 2;
  moon.add(reflectedLight);

  const moonRecord = {
    name: "月球",
    mesh: moon,
    pivot: moonPivot,
    parentRecord: earthRecord,
    orbit,
    orbitSpeed: options.orbitSpeed ?? 0.046,
    rotationSpeed: options.rotationSpeed ?? 0,
    tidallyLocked,
    surfaceYaw,
    order: "地球的天然卫星",
    type: "卫星",
    feature: "月球被地球潮汐锁定：自转周期与公转周期相同，所以近地面始终朝向地球；背面不是永远黑暗的一面。",
    radius: moonRadius,
  };
  moon.userData.planetRecord = moonRecord;
  moonRecords.push(moonRecord);
  selectableRecords.push(moonRecord);
  createProjectedLabel("月球", moon, moon.userData.labelOffset);
  earthRecord.moonSystem = moonRecord;
  return moonRecord;
}

function createRingLayer(name, innerRadius, outerRadius, color, opacity) {
  const material = rememberOpacity(new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), opacity);
  const layer = new THREE.Mesh(new THREE.RingGeometry(innerRadius, outerRadius, 192), material);
  layer.name = name;
  return layer;
}

function createRingLine(name, radius, color, opacity) {
  const points = [];
  const segments = 240;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = rememberOpacity(new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  }), opacity);
  const line = new THREE.Line(geometry, material);
  line.name = name;
  return line;
}

function createSaturnRingDust(innerRadius, outerRadius) {
  const random = createSeededRandom(74991);
  const count = 850;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [
    new THREE.Color(0xf8e8bc),
    new THREE.Color(0xd0b789),
    new THREE.Color(0x99866a),
    new THREE.Color(0xffffff),
  ];

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    const bandBias = random() < 0.58 ? random() * random() : random();
    const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, bandBias);
    const angle = random() * Math.PI * 2;
    positions[index] = Math.cos(angle) * radius;
    positions[index + 1] = Math.sin(angle) * radius;
    positions[index + 2] = (random() - 0.5) * 0.018;

    const color = palette[Math.floor(random() * palette.length)].clone();
    color.multiplyScalar(0.62 + random() * 0.45);
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = rememberOpacity(new THREE.PointsMaterial({
    size: 0.025,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  }), 0.28);
  const dust = new THREE.Points(geometry, material);
  dust.name = "土星光环细碎冰尘";
  return dust;
}

function createSaturnRingSystem(planet, radius) {
  const ringGroup = new THREE.Group();
  ringGroup.name = "土星多层光环";
  ringGroup.rotation.x = Math.PI / 2;
  ringGroup.rotation.y = 0.28;
  ringGroup.rotation.z = -0.08;

  ringGroup.add(createRingLayer("土星C环-半透明内环", radius * 1.34, radius * 1.55, 0x81796c, 0.10));
  ringGroup.add(createRingLayer("土星B环-明亮主环", radius * 1.59, radius * 1.92, 0xc8b894, 0.38));
  ringGroup.add(createRingLayer("土星卡西尼缝-暗带", radius * 1.925, radius * 2.015, 0x0b0c10, 0.64));
  ringGroup.add(createRingLayer("土星A环-外侧主环", radius * 2.02, radius * 2.31, 0x9f8f74, 0.27));
  ringGroup.add(createRingLayer("土星F环-细外环", radius * 2.39, radius * 2.43, 0xcbb997, 0.16));

  const fineRingRadii = [
    1.39, 1.46, 1.52, 1.62, 1.68, 1.74, 1.82, 1.89,
    2.04, 2.10, 2.17, 2.25, 2.30, 2.40,
  ];
  fineRingRadii.forEach((scale, index) => {
    const isBright = index % 3 !== 1;
    ringGroup.add(createRingLine(
      `土星细环带-${index + 1}`,
      radius * scale,
      isBright ? 0xffefc8 : 0x6b604e,
      isBright ? 0.17 : 0.11,
    ));
  });
  ringGroup.add(createSaturnRingDust(radius * 1.33, radius * 2.43));

  planet.add(ringGroup);
  return ringGroup;
}

function createUranusRingSystem(planet, radius) {
  const ringGroup = new THREE.Group();
  ringGroup.name = "天王星暗环";
  ringGroup.rotation.x = Math.PI / 2;
  ringGroup.rotation.y = 0.08;
  ringGroup.rotation.z = -0.35;

  [1.46, 1.62, 1.78].forEach((scale, index) => {
    ringGroup.add(createRingLine(
      `天王星细暗环-${index + 1}`,
      radius * scale,
      0x8ddce0,
      0.06,
    ));
  });

  const material = rememberOpacity(new THREE.MeshBasicMaterial({
    color: 0x9bdfe2,
    transparent: true,
    opacity: 0.018,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), 0.018);
  const faintSheet = new THREE.Mesh(new THREE.RingGeometry(radius * 1.42, radius * 1.84, 128), material);
  faintSheet.name = "天王星淡环面";
  ringGroup.add(faintSheet);
  planet.add(ringGroup);
  return ringGroup;
}

function createPlanet(config) {
  const orbit = createOrbit(config.distance);

  const pivot = new THREE.Group();
  pivot.name = `${config.name}-orbit-pivot`;
  pivot.rotation.y = config.angle;
  solarGroup.add(pivot);

  const texture = config.texturePath ? loadPlanetTexture(config.texturePath) : config.texture;
  const PlanetMaterial = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
  const material = rememberOpacity(new PlanetMaterial({
    map: texture,
    color: config.tint || (config.texturePath ? 0xffffff : config.color),
    roughness: config.roughness ?? 0.78,
    metalness: 0,
    clearcoat: config.clearcoat ?? 0.08,
    clearcoatRoughness: config.clearcoatRoughness ?? 0.72,
    emissive: config.emissive || 0x000000,
    emissiveIntensity: config.emissiveIntensity || 0,
  }), 1);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(config.radius, 64, 40), material);
  planet.name = config.name;
  planet.position.set(config.distance, config.y || 0, 0);
  planet.rotation.z = config.axialTilt || 0;
  planet.userData.labelOffset = config.labelOffset;
  pivot.add(planet);

  const shells = [];
  if (config.clouds) {
    shells.push(createPlanetShell(planet, config.radius, {
      name: `${config.name}-云层`,
      map: config.clouds.map,
      color: config.clouds.color,
      opacity: config.clouds.opacity,
      scale: config.clouds.scale,
      rotationSpeed: config.clouds.rotationSpeed,
    }));
  }

  if (config.atmosphere) {
    shells.push(createAtmosphereGlow(planet, config.radius, config.atmosphere));
  }

  if (config.name === "土星") {
    shells.push(createSaturnRingSystem(planet, config.radius));
  }

  if (config.name === "天王星") {
    shells.push(createUranusRingSystem(planet, config.radius));
  }

  const record = {
    name: config.name,
    pivot,
    mesh: planet,
    orbit,
    orbitSpeed: config.orbitSpeed,
    rotationSpeed: config.rotationSpeed,
    distance: config.distance,
    teachingDistance: config.distance,
    realDistance: config.realDistance || config.distance,
    radius: config.radius,
    teachingRadius: config.radius,
    realRadius: config.realRadius || config.radius,
    order: config.order,
    type: config.type,
    feature: config.feature,
    shells,
  };
  planet.userData.planetRecord = record;
  planetRecords.push(record);
  selectableRecords.push(record);
  if (config.moon) {
    createMoonSystem(record, pivot, planet, config.moon);
  }
  createProjectedLabel(config.name, planet, config.labelOffset);
}

function createProjectedLabel(text, object, options = {}) {
  const label = document.createElement("span");
  label.className = `planet-label ${options.className || ""}`.trim();
  label.textContent = text;
  label.dataset.label = text;
  labelLayer.appendChild(label);
  labelTargets.push({
    element: label,
    object,
    offsetX: options.offsetX ?? 16,
    offsetY: options.offsetY ?? 0,
  });
}

function buildSolarSystem() {
  const sun = createSun();
  sun.userData.rotationSpeed = 0.08;
  createSolarParticleBelt();

  const planetConfigs = [
    {
      name: "水星",
      distance: 6.8,
      realDistance: 6.2,
      radius: 0.42,
      realRadius: 0.24,
      angle: -0.58,
      color: 0xb9b4aa,
      texture: createMercurySurfaceTexture(),
      roughness: 0.92,
      orbitSpeed: 0.017,
      rotationSpeed: 0.12,
      order: "第 1 颗行星",
      type: "类地行星",
      feature: "水星离太阳最近，表面布满撞击坑，昼夜温差很大。",
      labelOffset: { offsetX: 34, offsetY: 4 },
    },
    {
      name: "金星",
      distance: 9.4,
      realDistance: 8.2,
      radius: 0.66,
      realRadius: 0.58,
      angle: -1.02,
      color: 0xd5aa6f,
      texturePath: planetTexturePaths.venus,
      roughness: 0.86,
      clouds: {
        map: createVenusCloudTexture(),
        color: 0xffd89a,
        opacity: 0.30,
        scale: 1.025,
        rotationSpeed: 0.025,
      },
      atmosphere: {
        color: 0xffc77b,
        opacity: 0.14,
        scale: 1.12,
      },
      orbitSpeed: 0.012,
      rotationSpeed: 0.08,
      order: "第 2 颗行星",
      type: "类地行星",
      feature: "金星有非常厚的大气层，是太阳系中最热的行星之一。",
      labelOffset: { offsetX: -46, offsetY: -18 },
    },
    {
      name: "地球",
      distance: 12.1,
      realDistance: 10.4,
      radius: 0.72,
      realRadius: 0.62,
      angle: -0.42,
      color: 0x2b75c2,
      texturePath: planetTexturePaths.earth,
      roughness: 0.74,
      tint: 0xd7e8ff,
      clearcoat: 0.16,
      clearcoatRoughness: 0.48,
      emissive: 0x08234a,
      emissiveIntensity: 0.24,
      axialTilt: -0.4091,
      clouds: {
        map: loadPlanetTexture(planetTexturePaths.earthClouds),
        color: 0xffffff,
        opacity: 0.50,
        scale: 1.012,
        rotationSpeed: 0.036,
      },
      atmosphere: {
        color: 0x4fa9ff,
        opacity: 0.62,
        scale: 1.038,
        power: 3.15,
        intensity: 2.05,
      },
      moon: {
        distance: 2.4,
        radius: 0.34,
        angle: -1.15,
        orbitSpeed: 0.072,
        tidallyLocked: true,
        surfaceYaw: Math.PI,
      },
      orbitSpeed: 0.01,
      rotationSpeed: 0.18,
      order: "第 3 颗行星",
      type: "类地行星",
      feature: "地球有液态水、空气和生命，是我们生活的家园。",
      labelOffset: { offsetX: 26, offsetY: 16 },
    },
    {
      name: "火星",
      distance: 14.8,
      realDistance: 13.7,
      radius: 0.52,
      realRadius: 0.34,
      angle: -1.58,
      color: 0xc16d47,
      texturePath: planetTexturePaths.mars,
      roughness: 0.9,
      orbitSpeed: 0.008,
      rotationSpeed: 0.16,
      order: "第 4 颗行星",
      type: "类地行星",
      feature: "火星呈红色，是因为表面有很多含铁的尘土。",
      labelOffset: { offsetX: -38, offsetY: 13 },
    },
    {
      name: "木星",
      distance: 20.2,
      realDistance: 22.5,
      radius: 1.62,
      realRadius: 1.9,
      angle: 0.42,
      color: 0xc59a72,
      texturePath: planetTexturePaths.jupiter,
      roughness: 0.68,
      atmosphere: {
        color: 0xf3cf9e,
        opacity: 0.20,
        scale: 1.045,
        power: 2.9,
      },
      orbitSpeed: 0.004,
      rotationSpeed: 0.24,
      order: "第 5 颗行星",
      type: "巨行星",
      feature: "木星是太阳系最大的行星，表面能看到明显的云带和大红斑。",
      labelOffset: { offsetX: 40, offsetY: -26 },
    },
    {
      name: "土星",
      distance: 25.7,
      realDistance: 30.2,
      radius: 1.28,
      realRadius: 1.58,
      angle: 2.92,
      color: 0xd4bc82,
      texture: createSaturnBodyTexture(),
      roughness: 0.72,
      atmosphere: {
        color: 0xf1d9a0,
        opacity: 0.20,
        scale: 1.05,
        power: 2.8,
      },
      orbitSpeed: 0.0032,
      rotationSpeed: 0.18,
      order: "第 6 颗行星",
      type: "巨行星",
      feature: "土星最醒目的特征是宽阔光环，光环由大量冰粒和岩石颗粒组成。",
      labelOffset: { offsetX: -46, offsetY: -8 },
    },
    {
      name: "天王星",
      distance: 27.6,
      realDistance: 38.4,
      radius: 0.96,
      realRadius: 0.86,
      angle: 2.25,
      color: 0x88d9d6,
      texture: createUranusAtmosphereTexture(),
      roughness: 0.62,
      axialTilt: -1.72,
      atmosphere: {
        color: 0x9ff2ee,
        opacity: 0.22,
        scale: 1.065,
        power: 2.55,
      },
      orbitSpeed: 0.0024,
      rotationSpeed: 0.11,
      order: "第 7 颗行星",
      type: "冰巨星",
      feature: "天王星呈蓝绿色，并且自转轴倾斜得很厉害，像躺着转动。",
      labelOffset: { offsetX: 38, offsetY: 6 },
    },
    {
      name: "海王星",
      distance: 32.2,
      realDistance: 47.8,
      radius: 0.98,
      realRadius: 0.84,
      angle: 2.65,
      color: 0x3769d4,
      texture: createNeptuneAtmosphereTexture(),
      roughness: 0.58,
      atmosphere: {
        color: 0x78b8ff,
        opacity: 0.28,
        scale: 1.068,
        power: 2.45,
      },
      orbitSpeed: 0.002,
      rotationSpeed: 0.12,
      order: "第 8 颗行星",
      type: "冰巨星",
      feature: "海王星离太阳很远，呈深蓝色，风速非常快。",
      labelOffset: { offsetX: -52, offsetY: 0 },
    },
  ];

  planetConfigs.forEach(createPlanet);
  setSolarOpacity(0);
  solarGroup.visible = false;
}

function showPlanetInfo(record) {
  planetInfoCard.hidden = false;
  if (!record) {
    planetInfoOrder.textContent = "太阳系观察";
    planetInfoName.textContent = "先选择一颗行星";
    planetInfoType.textContent = "点击任意行星后，镜头会靠近并显示简洁信息。";
    planetInfoFeature.textContent = "也可以用“跟随行星视角”按钮观察当前选中的行星。";
    return;
  }

  planetInfoOrder.textContent = record.order || "太阳系天体";
  planetInfoName.textContent = record.name;
  planetInfoType.textContent = `类型：${record.type || "太阳系天体"}`;
  planetInfoFeature.textContent = record.feature || "";
}

function selectPlanetRecord(record) {
  selectedRecord = record;
  showPlanetInfo(record);
  focusPlanetRecord(record);
}

function getPlanetRecordByName(name) {
  return selectableRecords.find((record) => record.name === name);
}

function applyScaleMode(nextMode) {
  scaleMode = nextMode === "real" ? "real" : "teaching";
  planetRecords.forEach((record) => {
    const distance = scaleMode === "real" ? record.realDistance : record.teachingDistance;
    const radius = scaleMode === "real" ? record.realRadius : record.teachingRadius;
    const distanceScale = distance / record.teachingDistance;
    record.distance = distance;
    record.mesh.position.x = distance;
    record.mesh.scale.setScalar(radius / record.teachingRadius);
    if (record.moonSystem) {
      record.moonSystem.pivot.position.x = distance;
    }
    if (record.orbit) {
      record.orbit.scale.set(distanceScale, 1, distanceScale);
      record.orbit.visible = showOrbits;
    }
  });

  modeStatus.textContent = scaleMode === "real"
    ? "已切换为真实比例参考：距离和大小差异更明显，但仍保留课堂可见性。"
    : "已切换为教学比例：便于同时观察八大行星。";

  if (selectedRecord) {
    window.setTimeout(() => focusPlanetRecord(selectedRecord), 80);
  }
}

function setOrbitVisibility(visible) {
  showOrbits = Boolean(visible);
  orbitRecords.forEach((record) => {
    record.object.visible = showOrbits;
  });
}

function setLabelVisibility(visible) {
  showLabels = Boolean(visible);
  app.dataset.labelsVisible = String(showLabels);
}

function updateOrbitPauseButton() {
  orbitPauseButton.textContent = orbitPaused ? "继续公转" : "暂停公转";
  orbitPauseButton.setAttribute("aria-pressed", String(orbitPaused));
}

function updateOrbitSpeedLabel() {
  orbitSpeedButtons.forEach((button) => {
    const isActive = Number(button.dataset.orbitSpeed) === orbitSpeedMultiplier;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function handleViewClick(event) {
  applySolarView(event.currentTarget.dataset.view, 1000);
}

function handleScaleModeChange(event) {
  applyScaleMode(event.currentTarget.value);
}

function handleOrbitSpeedChange(event) {
  orbitSpeedMultiplier = Number(event.currentTarget.dataset.orbitSpeed);
  if (orbitSpeedMultiplier <= 0) {
    orbitPaused = true;
  } else if (orbitPaused) {
    orbitPaused = false;
  }
  updateOrbitSpeedLabel();
  updateOrbitPauseButton();
}

function handleOrbitPauseClick() {
  orbitPaused = !orbitPaused;
  updateOrbitPauseButton();
}

function handleCanvasPointerUp(event) {
  if (currentState !== STATE_SOLAR || cameraTween || orbitControls?.didPointerMove?.()) {
    return;
  }
  if (event.target instanceof Element && event.target.closest(
    "button, input, select, label, .observer-toolbar, .mode-panel, .planet-info-card, .solar-header, .model-note"
  )) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const intersections = raycaster.intersectObjects(selectableRecords.map((record) => record.mesh), false);
  if (!intersections.length) {
    return;
  }

  const record = intersections[0].object.userData.planetRecord;
  if (record) {
    selectPlanetRecord(record);
  }
}

const cameraControl = {
  setView: (viewName) => applySolarView(viewName, 1000),
  focusPlanetByName: (name) => {
    const record = getPlanetRecordByName(name);
    if (record) {
      selectPlanetRecord(record);
    }
  },
  zoom: (direction = 1) => {
    const target = orbitControls?.target || cameraTarget;
    tempVector.copy(camera.position).sub(target).multiplyScalar(direction > 0 ? 0.86 : 1.16);
    camera.position.copy(target).add(tempVector);
    syncOrbitControls();
  },
  rotate: (deltaX = 0, deltaY = 0) => {
    if (!orbitControls) {
      return;
    }
    const gestureSpherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(orbitControls.target));
    gestureSpherical.theta -= deltaX * 0.006;
    gestureSpherical.phi = THREE.MathUtils.clamp(gestureSpherical.phi - deltaY * 0.006, 0.12, Math.PI - 0.12);
    tempVector.setFromSpherical(gestureSpherical).add(orbitControls.target);
    camera.position.copy(tempVector);
    camera.lookAt(orbitControls.target);
    syncOrbitControls();
  },
  handleGesture: (gestureName) => {
    if (gestureName === "open-hand") {
      cameraControl.zoom(1);
    } else if (gestureName === "fist") {
      cameraControl.zoom(-1);
    } else if (gestureName === "double-open") {
      applySolarView("overview", 1000);
    }
  },
};
window.cameraControl = cameraControl;

function setSolarOpacity(opacity) {
  solarGroup.visible = opacity > 0.001;
  solarGroup.traverse((object) => {
    if (!object.material) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material.userData.baseOpacity === undefined) {
        material.userData.baseOpacity = material.opacity ?? 1;
      }
      const keepOpaque = material.userData.keepOpaqueAtFullOpacity && opacity >= 0.999;
      material.transparent = !keepOpaque;
      material.opacity = keepOpaque ? 1 : material.userData.baseOpacity * opacity;
      if (material.userData.keepOpaqueAtFullOpacity) {
        material.depthWrite = keepOpaque;
        material.needsUpdate = true;
      }
      if (material.uniforms?.uOpacity) {
        const uniformBase = material.userData.baseUniformOpacity ?? material.uniforms.uOpacity.value;
        material.userData.baseUniformOpacity = uniformBase;
        material.uniforms.uOpacity.value = uniformBase * opacity;
      }
    });
  });
  sunLight.intensity = 2.65 * opacity;
}

function setPageState(nextState) {
  currentState = nextState;
  app.dataset.state = nextState;
  app.dataset.labelsVisible = String(showLabels);

  const homeVisible = nextState === STATE_HOME || nextState === STATE_TRANSITION;
  const solarVisible = nextState === STATE_SOLAR;

  homePage.setAttribute("aria-hidden", String(!homeVisible));
  solarPage.setAttribute("aria-hidden", String(!solarVisible));
  labelLayer.setAttribute("aria-hidden", String(!solarVisible));
  homePage.hidden = nextState === STATE_SOLAR;
  solarPage.hidden = !solarVisible;
  enterSolarButton.disabled = nextState === STATE_TRANSITION;
}

function showHome() {
  transition = null;
  transitionProgress = 0;
  cameraTween = null;
  setOrbitControlsEnabled(false);
  homePage.style.opacity = "";
  homePage.style.visibility = "";
  setPageState(STATE_HOME);
  setSolarOpacity(0);
  setTransitionStreakOpacity(0);
  setMilkyWayFocus(0.28, 0.92);
  setProjectionOpacity(1);
  copyCameraPose(homeCamera);
  modeStatus.textContent = "模式按钮已预留，后续继续接入学习内容。";
}

function startSolarTransition() {
  if (currentState !== STATE_HOME) {
    return;
  }

  setOrbitControlsEnabled(false);
  transition = {
    startTime: performance.now(),
    duration: transitionDuration,
  };
  setSolarOpacity(0.001);
  setPageState(STATE_TRANSITION);
}

function showSolarSystem() {
  transition = null;
  transitionProgress = 1;
  cameraTween = null;
  setSolarOpacity(1);
  setTransitionStreakOpacity(0);
  setProjectionOpacity(0);
  setMilkyWayFocus(0, 1.55);
  activeView = "oblique";
  setActiveViewButton("oblique");
  copyCameraPose(solarViewPresets.oblique);
  setOrbitControlsEnabled(true);
  setPageState(STATE_SOLAR);
}

function showPlanetIntroMode() {
  modeStatus.textContent = "“认识行星”模式已预留：后续将加入八大行星基础介绍。";
}

function showDistanceMode() {
  modeStatus.textContent = "“距离模型”模式已预留：后续将单独展示行星与太阳的距离关系。";
}

function showSizeMode() {
  modeStatus.textContent = "“大小比较”模式已预留：后续将单独展示行星大小差异。";
}

function showCategoryMode() {
  modeStatus.textContent = "“行星分类”模式已预留：后续将单独展示类地行星与巨行星等分类。";
}

function handleModeClick(event) {
  const mode = event.currentTarget.dataset.mode;

  if (mode === "planet") {
    showPlanetIntroMode();
  } else if (mode === "distance") {
    showDistanceMode();
  } else if (mode === "size") {
    showSizeMode();
  } else if (mode === "category") {
    showCategoryMode();
  }
}

function updateTransition(now) {
  if (!transition) {
    return;
  }

  const rawProgress = Math.min((now - transition.startTime) / transition.duration, 1);
  applyTransitionPose(rawProgress);

  if (rawProgress >= 1) {
    showSolarSystem();
  }
}

function applyTransitionPose(rawProgress) {
  transitionProgress = rawProgress;
  const galaxyLegEnd = 0.62;
  let cameraFov = homeCamera.fov;

  if (rawProgress < galaxyLegEnd) {
    const legProgress = easeInOutCubic(rawProgress / galaxyLegEnd);
    camera.position.lerpVectors(homeCamera.position, galaxyCamera.position, legProgress);
    cameraTarget.lerpVectors(homeCamera.target, galaxyCamera.target, legProgress);
    cameraFov = THREE.MathUtils.lerp(homeCamera.fov, galaxyCamera.fov, legProgress);
  } else {
    const legProgress = easeInOutCubic((rawProgress - galaxyLegEnd) / (1 - galaxyLegEnd));
    camera.position.lerpVectors(galaxyCamera.position, solarCamera.position, legProgress);
    cameraTarget.lerpVectors(galaxyCamera.target, solarCamera.target, legProgress);
    cameraFov = THREE.MathUtils.lerp(galaxyCamera.fov, solarCamera.fov, legProgress);
  }

  const spatialPush = Math.sin(rawProgress * Math.PI);
  camera.position.x += Math.sin(rawProgress * Math.PI * 1.2) * spatialPush * 2.1;
  camera.position.y += Math.sin(rawProgress * Math.PI * 0.85) * spatialPush * 0.85;
  setCameraFov(cameraFov);
  camera.lookAt(cameraTarget);

  const galaxyFocusIn = THREE.MathUtils.smoothstep(rawProgress, 0.08, 0.48);
  const galaxyFocusOut = 1 - THREE.MathUtils.smoothstep(rawProgress, 0.66, 0.92);
  const homeGalaxyFloor = 0.28 * (1 - THREE.MathUtils.smoothstep(rawProgress, 0.08, 0.42));
  const galaxyOpacity = Math.max(homeGalaxyFloor, galaxyFocusIn * galaxyFocusOut * 1.18);
  const galaxyScale = 0.92 + THREE.MathUtils.smoothstep(rawProgress, 0.08, 0.66) * 1.62;
  const streakOpacity = Math.sin(THREE.MathUtils.smoothstep(rawProgress, 0.04, 0.88) * Math.PI) * 0.32;
  const projectionOpacity = 1 - THREE.MathUtils.smoothstep(rawProgress, 0.58, 0.92);

  setMilkyWayFocus(galaxyOpacity, galaxyScale);
  setProjectionOpacity(projectionOpacity);
  setTransitionStreakOpacity(streakOpacity);
  setSolarOpacity(THREE.MathUtils.smoothstep(rawProgress, 0.72, 1));
}

function updateIdleCamera(time) {
  if (currentState === STATE_HOME) {
    setCameraFov(homeCamera.fov + Math.sin(time * 0.1) * 0.35);
    camera.position.set(
      homeCamera.position.x + Math.sin(time * 0.14) * 1.15,
      homeCamera.position.y + Math.sin(time * 0.11) * 0.7,
      homeCamera.position.z + Math.sin(time * 0.08) * 1.55
    );
    cameraTarget.set(
      homeCamera.target.x + Math.sin(time * 0.08) * 1.05,
      homeCamera.target.y + Math.cos(time * 0.07) * 0.45,
      homeCamera.target.z
    );
    camera.lookAt(cameraTarget);
  } else if (currentState === STATE_SOLAR) {
    if (orbitControls && !cameraTween) {
      cameraTarget.copy(orbitControls.target);
    }
  }
}

function updateStars(time) {
  starLayers.forEach((layer, index) => {
    const direction = index % 2 === 0 ? 1 : -1;
    const transitionRush = currentState === STATE_TRANSITION ? transitionProgress : 0;
    const rushByLayer = [18, 46, 112];
    layer.points.rotation.z = direction * time * (0.0012 + index * 0.0008);
    layer.points.position.x = Math.sin(time * (0.08 + index * 0.03)) * (0.35 + index * 0.12);
    layer.points.position.y = Math.cos(time * (0.06 + index * 0.02)) * (0.22 + index * 0.08);
    layer.points.position.z = transitionRush * (rushByLayer[index] || 24);
    layer.points.material.opacity = layer.opacity * (currentState === STATE_SOLAR ? 0.68 : 1);
  });

  const rushEase = currentState === STATE_TRANSITION ? easeInOutCubic(transitionProgress) : 0;

  if (immersiveStarVolume) {
    immersiveStarVolume.points.rotation.z = Math.sin(time * 0.06) * 0.012 + rushEase * 0.055;
    immersiveStarVolume.points.rotation.x = Math.sin(time * 0.04) * 0.006;
    immersiveStarVolume.points.position.z = rushEase * 92;
    immersiveStarVolume.points.material.opacity = immersiveStarVolume.points.material.userData.baseOpacity * (
      currentState === STATE_SOLAR ? 0.48 : 1
    );
  }

  if (foregroundStarVolume) {
    foregroundStarVolume.points.rotation.z = -time * 0.006 - rushEase * 0.08;
    foregroundStarVolume.points.position.z = rushEase * 150;
    foregroundStarVolume.points.material.opacity = foregroundStarVolume.points.material.userData.baseOpacity * (
      currentState === STATE_SOLAR ? 0.22 : 1
    );
  }

  if (transitionStreaks) {
    transitionStreaks.rotation.z = Math.sin(time * 0.2) * 0.025;
    transitionStreaks.position.z = rushEase * 128;
  }

  if (projectionGroup) {
    projectionGroup.rotation.y = 0.05 + Math.sin(time * 0.08) * 0.018;
    projectionGroup.rotation.z = Math.sin(time * 0.06) * 0.012;
  }

  if (projectionParticleBelt) {
    projectionParticleBelt.rotation.y = Math.sin(time * 0.11) * 0.025;
    projectionParticleBelt.position.x = Math.sin(time * 0.18) * 1.2;
    projectionParticleBelt.material.opacity = projectionParticleBelt.material.userData.baseOpacity * (
      0.82 + Math.sin(time * 0.35) * 0.08
    ) * projectionVisibility;
  }

  if (projectionStarCurtain) {
    projectionStarCurtain.position.y = Math.sin(time * 0.12) * 0.75;
  }

  if (projectionRingPlanet) {
    projectionRingPlanet.rotation.y += 0.0035;
    projectionRingPlanet.rotation.z = Math.sin(time * 0.14) * 0.035;
  }

  nebulaSprites.forEach((sprite, index) => {
    sprite.material.opacity = sprite.userData.baseOpacity * (0.82 + Math.sin(time * 0.22 + index) * 0.08);
  });

  distantGalaxySprites.forEach((sprite, index) => {
    sprite.material.opacity = sprite.material.userData.baseOpacity * (0.76 + Math.sin(time * 0.13 + index * 0.7) * 0.08);
  });

  if (milkyWayGroup) {
    milkyWayGroup.rotation.z = milkyWayBaseRotationZ + Math.sin(time * 0.09) * 0.035 + transitionProgress * 0.08;
    milkyWayGroup.rotation.y = 0.08 + Math.sin(time * 0.07) * 0.025;
  }
}

function updateSolarSystem(delta) {
  const solarVisible = currentState === STATE_SOLAR || currentState === STATE_TRANSITION;
  if (!solarVisible) {
    return;
  }

  solarGroup.children.forEach((child) => {
    if (child.name === "太阳") {
      child.rotation.y += delta * child.userData.rotationSpeed;
    }
  });

  const motionScale = orbitPaused ? 0 : orbitSpeedMultiplier * orbitClassroomRate;
  planetRecords.forEach((record) => {
    record.pivot.rotation.y += delta * record.orbitSpeed * motionScale;
    record.mesh.rotation.y += delta * record.rotationSpeed;
    record.shells?.forEach((shell) => {
      if (shell.userData.rotationSpeed) {
        shell.rotation.y += delta * shell.userData.rotationSpeed;
      }
    });
  });

  moonRecords.forEach((record) => {
    record.pivot.rotation.y += delta * record.orbitSpeed * (orbitPaused ? 0 : Math.max(1, motionScale * 0.72));
    if (record.tidallyLocked) {
      record.mesh.rotation.y = record.surfaceYaw;
    } else {
      record.mesh.rotation.y += delta * record.rotationSpeed;
    }
  });

  if (activeView === "follow" && selectedRecord?.mesh && !cameraTween && orbitControls) {
    selectedRecord.mesh.getWorldPosition(tempWorldPosition);
    tempVector.copy(camera.position).sub(cameraTarget);
    cameraTarget.copy(tempWorldPosition);
    orbitControls.target.copy(cameraTarget);
    camera.position.copy(cameraTarget).add(tempVector);
    camera.lookAt(cameraTarget);
  }

  if (solarParticleBelt) {
    solarParticleBelt.rotation.y += delta * 0.018;
    solarParticleBelt.position.x = Math.sin(clock.getElapsedTime() * 0.22) * 0.8;
  }
}

function updateProjectedLabels() {
  const labelsVisible = currentState === STATE_SOLAR && showLabels;
  labelTargets.forEach((target) => {
    if (!labelsVisible) {
      target.element.style.opacity = "0";
      return;
    }

    target.object.getWorldPosition(tempWorldPosition);
    tempProjectedPosition.copy(tempWorldPosition).project(camera);
    const inFront = tempProjectedPosition.z > -1 && tempProjectedPosition.z < 1;
    if (!inFront) {
      target.element.style.opacity = "0";
      return;
    }

    const x = (tempProjectedPosition.x * 0.5 + 0.5) * window.innerWidth + target.offsetX;
    const y = (-tempProjectedPosition.y * 0.5 + 0.5) * window.innerHeight + target.offsetY;
    target.element.style.opacity = "1";
    target.element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  });
}

function renderFrame(now) {
  if (!renderer) {
    return;
  }

  const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  const elapsed = clock.getElapsedTime();

  updateTransition(now);
  const cameraTweenActive = updateCameraTween(now);
  if (!transition && !cameraTweenActive) {
    updateIdleCamera(elapsed);
  }
  if (currentState === STATE_SOLAR && orbitControls && !cameraTweenActive) {
    orbitControls.update();
    cameraTarget.copy(orbitControls.target);
  }
  updateStars(elapsed);
  updateSolarSystem(delta);
  updateProjectedLabels();

  if (composer) {
    composer.render(delta);
  } else {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(renderFrame);
}

function initialiseScene() {
  if (!renderer) {
    showHome();
    return;
  }

  loadNasaBackdrop();
  starPointTexture = createRadialTexture([
    { offset: 0, color: "rgba(255, 255, 255, 1)" },
    { offset: 0.34, color: "rgba(220, 238, 255, 0.78)" },
    { offset: 0.68, color: "rgba(160, 205, 255, 0.22)" },
    { offset: 1, color: "rgba(160, 205, 255, 0)" },
  ]);
  createStarLayer("far-star-depth-layer", 1400, -560, -110, 260, 0.24, 0.58);
  createStarLayer("middle-star-depth-layer", 860, -130, 74, 172, 0.38, 0.72);
  createStarLayer("near-star-depth-layer", 420, 48, 156, 96, 0.64, 0.88);
  createImmersiveStarVolume();
  createForegroundStarVolume();
  createTransitionStreaks();
  createDistantGalaxyField();
  createMilkyWayFocus();

  const blueNebula = createNebulaSprite("far-blue-nebula", new THREE.Vector3(-90, 34, -340), new THREE.Vector2(150, 82), [
    { offset: 0, color: "rgba(70, 150, 210, 0.24)" },
    { offset: 0.44, color: "rgba(45, 90, 145, 0.08)" },
    { offset: 1, color: "rgba(45, 90, 145, 0)" },
  ], 0.44);
  blueNebula.userData.baseOpacity = 0.44;

  const softGoldNebula = createNebulaSprite("middle-soft-gold-nebula", new THREE.Vector3(72, -22, -170), new THREE.Vector2(105, 64), [
    { offset: 0, color: "rgba(244, 189, 108, 0.18)" },
    { offset: 0.42, color: "rgba(144, 84, 60, 0.07)" },
    { offset: 1, color: "rgba(144, 84, 60, 0)" },
  ], 0.32);
  softGoldNebula.userData.baseOpacity = 0.32;

  const tealNebula = createNebulaSprite("near-teal-nebula", new THREE.Vector3(-34, -18, -42), new THREE.Vector2(76, 44), [
    { offset: 0, color: "rgba(112, 213, 218, 0.16)" },
    { offset: 0.48, color: "rgba(56, 108, 140, 0.06)" },
    { offset: 1, color: "rgba(56, 108, 140, 0)" },
  ], 0.26);
  tealNebula.userData.baseOpacity = 0.26;

  const foregroundVeil = createNebulaSprite("foreground-cool-veil", new THREE.Vector3(96, 34, 18), new THREE.Vector2(122, 70), [
    { offset: 0, color: "rgba(126, 204, 232, 0.12)" },
    { offset: 0.48, color: "rgba(56, 96, 148, 0.045)" },
    { offset: 1, color: "rgba(56, 96, 148, 0)" },
  ], 0.18);
  foregroundVeil.userData.baseOpacity = 0.18;

  const depthVeil = createNebulaSprite("left-depth-amber-veil", new THREE.Vector3(-132, -42, -250), new THREE.Vector2(150, 76), [
    { offset: 0, color: "rgba(236, 184, 112, 0.11)" },
    { offset: 0.52, color: "rgba(102, 68, 84, 0.045)" },
    { offset: 1, color: "rgba(102, 68, 84, 0)" },
  ], 0.16);
  depthVeil.userData.baseOpacity = 0.16;

  createHolographicProjectionStage();
  buildSolarSystem();
  initialiseCameraControls();
  initialiseBloomPipeline();
  setOrbitVisibility(showOrbits);
  setLabelVisibility(showLabels);
  updateOrbitSpeedLabel();
  updateOrbitPauseButton();
  resizeRenderer();
  showHome();
  requestAnimationFrame(renderFrame);
}

enterSolarButton.addEventListener("click", startSolarTransition);
backHomeButton.addEventListener("click", showHome);
modeButtons.forEach((button) => button.addEventListener("click", handleModeClick));
viewButtons.forEach((button) => button.addEventListener("click", handleViewClick));
orbitToggle.addEventListener("change", (event) => setOrbitVisibility(event.currentTarget.checked));
labelToggle.addEventListener("change", (event) => setLabelVisibility(event.currentTarget.checked));
scaleModeSelect.addEventListener("change", handleScaleModeChange);
orbitSpeedButtons.forEach((button) => button.addEventListener("click", handleOrbitSpeedChange));
orbitPauseButton.addEventListener("click", handleOrbitPauseClick);
window.addEventListener("pointerup", handleCanvasPointerUp);
window.addEventListener("resize", resizeRenderer);

window.showHome = showHome;
window.startSolarTransition = startSolarTransition;
window.showSolarSystem = showSolarSystem;
window.showPlanetIntroMode = showPlanetIntroMode;
window.showDistanceMode = showDistanceMode;
window.showSizeMode = showSizeMode;
window.showCategoryMode = showCategoryMode;
window.spaceLab = {
  getState: () => currentState,
  debug: {
    renderer: "three.js",
    sceneType: "PerspectiveCamera + OrbitControls + UnrealBloomPass + immersive solar-system observer",
    transitionPath: "near projection stage -> Milky Way focus -> low-angle solar system",
    cameraControl: () => ({
      activeView,
      scaleMode,
      showOrbits,
      showLabels,
      orbitPaused,
      orbitSpeedMultiplier,
      selected: selectedRecord?.name || null,
      bloom: Boolean(composer && bloomPass),
    }),
    planetOrder: ["水星", "金星", "地球", "火星", "木星", "土星", "天王星", "海王星"],
    starLayers: () => starLayers.map((layer) => ({
      name: layer.name,
      count: layer.count,
      zMin: layer.zMin,
      zMax: layer.zMax,
      size: layer.size,
    })),
    immersiveVolumes: () => [
      immersiveStarVolume && {
        name: immersiveStarVolume.points.name,
        count: immersiveStarVolume.count,
        zMin: immersiveStarVolume.zMin,
        zMax: immersiveStarVolume.zMax,
        size: immersiveStarVolume.size,
      },
      foregroundStarVolume && {
        name: foregroundStarVolume.points.name,
        count: foregroundStarVolume.count,
        zMin: foregroundStarVolume.zMin,
        zMax: foregroundStarVolume.zMax,
        size: foregroundStarVolume.size,
      },
    ].filter(Boolean),
    galaxyFocus: () => ({
      hasMilkyWayFocus: Boolean(milkyWayGroup),
      distantGalaxyCount: distantGalaxySprites.length,
      transitionDuration,
    }),
    projectionStage: () => ({
      hasProjectionStage: Boolean(projectionGroup),
      hasParticleBelt: Boolean(projectionParticleBelt),
      hasStarCurtain: Boolean(projectionStarCurtain),
      visibility: projectionVisibility,
    }),
    planets: () => planetRecords.map((planet) => ({
      name: planet.name,
      distance: planet.distance,
      radius: planet.radius,
      type: planet.type,
    })),
  },
};

initialiseScene();

const startupParams = new URLSearchParams(window.location.search);
const startupFocusNames = {
  sun: "太阳",
  mercury: "水星",
  venus: "金星",
  earth: "地球",
  moon: "月球",
  mars: "火星",
  jupiter: "木星",
  saturn: "土星",
  uranus: "天王星",
  neptune: "海王星",
};
if (startupParams.get("auto") === "solar") {
  window.setTimeout(startSolarTransition, 450);
}
if (startupParams.get("preview") === "solar") {
  window.setTimeout(() => {
    showSolarSystem();
    homePage.style.opacity = "0";
    homePage.style.visibility = "hidden";
  }, 450);
  const focusName = startupFocusNames[startupParams.get("focus")];
  if (focusName) {
    window.setTimeout(() => cameraControl.focusPlanetByName(focusName), 900);
  }
}
if (startupParams.get("preview") === "galaxy") {
  window.setTimeout(() => {
    setPageState(STATE_TRANSITION);
    homePage.style.opacity = "0";
    applyTransitionPose(0.54);
  }, 450);
}
