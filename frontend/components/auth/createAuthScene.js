import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Loaded only on desktop. Geometry and studio lighting are generated locally.
export function createAuthScene(
  host,
  { reducedMotion = false, onContextLost } = {},
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  const resources = [];
  // The non-interactive canvas sits behind the centered form. Listen on its
  // page container so gentle parallax never intercepts a form interaction.
  const pointerSurface = host.parentElement;
  let frame = 0;
  let disposed = false;
  let paused = false;
  let inView = true;
  let lastTime = 0;
  let elapsed = 0;
  let observer;
  let resizeObserver;
  const keep = (resource) => {
    resources.push(resource);
    return resource;
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    pointerSurface.removeEventListener("pointermove", pointerMove);
    pointerSurface.removeEventListener("pointerleave", pointerLeave);
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    resources.forEach((resource) => resource.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  const target = new THREE.Vector2();
  const pointer = new THREE.Vector2();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  const sculpture = new THREE.Group();
  let knot;
  let departureStart = null;
  let departureZ = 9;

  function draw(time = 0) {
    frame = 0;
    if (disposed || document.hidden || !inView) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    if (!paused && !reducedMotion) {
      elapsed += dt;
      pointer.lerp(target, 1 - Math.exp(-dt * 4.5));
      sculpture.rotation.x = pointer.y * 0.06;
      sculpture.rotation.y = pointer.x * 0.09;
      knot.rotation.y = 0.3 + Math.sin(elapsed * 0.09) * 0.12;
      knot.rotation.z = -0.35 + Math.sin(elapsed * 0.07) * 0.04;
      knot.position.y = 1.35 + Math.sin(elapsed * 0.35) * 0.035;
    }
    if (departureStart !== null && !reducedMotion) {
      const progress = Math.min((time - departureStart) / 1400, 1);
      const acceleration = progress * progress * progress;
      camera.position.z = departureZ * (1 - acceleration * 0.94);
      camera.rotation.z = -acceleration * 0.18;
      sculpture.rotation.z = acceleration * 0.35;
    }
    renderer.render(scene, camera);
    if (!paused && !reducedMotion) frame = requestAnimationFrame(draw);
  }

  function wake() {
    if (disposed) return;
    cancelAnimationFrame(frame);
    lastTime = 0;
    frame = requestAnimationFrame(draw);
  }
  function visibility() {
    wake();
  }
  function pointerMove(event) {
    if (event.pointerType !== "mouse" || reducedMotion || paused) return;
    const box = host.getBoundingClientRect();
    target.set(
      ((event.clientX - box.left) / box.width - 0.5) * 2,
      ((event.clientY - box.top) / box.height - 0.5) * 2,
    );
  }
  function pointerLeave() {
    target.set(0, 0);
  }
  function contextLost(event) {
    event.preventDefault();
    dispose();
    onContextLost?.();
  }

  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const environment = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(renderer);
    try {
      scene.environment = keep(generator.fromScene(environment, 0.04)).texture;
    } finally {
      environment.dispose();
      generator.dispose();
    }

    const material = keep(
      new THREE.MeshPhysicalMaterial({
        color: 0x96d8b1,
        metalness: 0.45,
        roughness: 0.48,
        clearcoat: 0.3,
        clearcoatRoughness: 0.14,
        iridescence: 0,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [120, 340],
        envMapIntensity: 1,
      }),
    );
    knot = new THREE.Mesh(
      keep(new THREE.TorusKnotGeometry(1.32, 0.43, 192, 32, 2, 3)),
      material,
    );
    knot.rotation.set(0.5, 0.3, -0.35);
    knot.scale.setScalar(0.53);
    knot.position.set(3.15, 1.35, -0.5);
    sculpture.add(knot);
    const loop = new THREE.Mesh(
      keep(new THREE.TorusGeometry(0.88, 0.23, 24, 96)),
      material,
    );
    loop.rotation.set(0.75, -0.55, -0.45);
    loop.position.set(-3.15, -1.15, -0.3);
    sculpture.add(loop);
    const bead = new THREE.Mesh(
      keep(new THREE.SphereGeometry(0.16, 24, 16)),
      material,
    );
    bead.position.set(3.6, -1.4, 0);
    sculpture.add(bead);
    scene.add(sculpture);

    const key = new THREE.DirectionalLight(0xd9fff0, 4);
    key.position.set(-3, 5, 4);
    const rim = new THREE.DirectionalLight(0x46cba0, 5);
    rim.position.set(4, 1, -2);
    const fill = new THREE.DirectionalLight(0xb4e8df, 2);
    fill.position.set(-4, -2, 2);
    scene.add(key, rim, fill, new THREE.AmbientLight(0x86bfa6, 0.25));

    function resize() {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height || disposed) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.position.set(0, 0.1, 9 / Math.min(1, camera.aspect));
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      // Keep the objects in the side gutters as the viewport changes.
      const gutter = Math.max(2.65, camera.aspect * 1.8);
      knot.position.x = gutter;
      loop.position.x = -gutter;
      bead.position.x = gutter + 0.35;
      wake();
    }
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      wake();
    });
    observer.observe(host);
    document.addEventListener("visibilitychange", visibility);
    pointerSurface.addEventListener("pointermove", pointerMove, {
      passive: true,
    });
    pointerSurface.addEventListener("pointerleave", pointerLeave);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    resize();

    return {
      dispose,
      depart() {
        departureStart = performance.now();
        departureZ = camera.position.z;
        wake();
      },
      setPaused(value) {
        paused = value;
        wake();
      },
      setReducedMotion(value) {
        reducedMotion = value;
        target.set(0, 0);
        wake();
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
