import {
    AmbientLight,
    Box3,
    BoxGeometry,
    BufferGeometry,
    Clock,
    Color,
    ConeGeometry,
    CircleGeometry,
    CatmullRomCurve3,
    CylinderGeometry,
    Float32BufferAttribute,
    Matrix3,
    DoubleSide,
    ExtrudeGeometry,
    Group,
    ACESFilmicToneMapping,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Points,
    PointsMaterial,
    PerspectiveCamera,
    PlaneGeometry,
    PointLight,
    Scene,
    HemisphereLight,
    TubeGeometry,
    Shape,
    SphereGeometry,
    ShaderMaterial,
    SRGBColorSpace,
    Vector2,
    Vector3,
    WebGLRenderer
} from "three";

document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("fire-canvas");
    if (!canvas) {
        console.error("Canvas missing.");
        return;
    }

    const style = document.createElement("style");
    style.textContent = `
        #rotate-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: none;
            background: rgba(0,0,0,0.9);
            color: #ffffff;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 1.2rem;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            box-sizing: border-box;
        }
        #rotate-overlay span {
            max-width: 20rem;
            line-height: 1.4;
            opacity: 0.9;
        }
    `;
    document.head.appendChild(style);

    let rotateOverlay = null;
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
        rotateOverlay = document.createElement("div");
        rotateOverlay.id = "rotate-overlay";
        const msg = document.createElement("span");
        msg.textContent = "Rotate your phone for the best view of the fireplace.";
        rotateOverlay.appendChild(msg);
        document.body.appendChild(rotateOverlay);
    }

    const renderer = new WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new Color(0x0b0d13), 1);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    const baseExposure = 1.45;
    renderer.toneMappingExposure = baseExposure;

    const fireplaceZOffset = -2;
    const scene = new Scene();
    const cameraTarget = new Vector3(0, 1, fireplaceZOffset);
    const cameraBasePos = new Vector3(0, 2.2, 9);
    const baseToTarget = new Vector3().subVectors(cameraBasePos, cameraTarget);
    const cameraBaseAngle = Math.atan2(baseToTarget.x, baseToTarget.z);
    const cameraOrbitRadius = Math.sqrt(baseToTarget.x * baseToTarget.x + baseToTarget.z * baseToTarget.z);
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.copy(cameraBasePos);
    camera.lookAt(cameraTarget);

    scene.add(new AmbientLight(0xffffff, 0.7));
    const hemiLight = new HemisphereLight(new Color(0x7282a0), new Color(0x1a1c22), 0.32);
    hemiLight.position.set(0, 6, 0);
    scene.add(hemiLight);
    const fillLight = new PointLight(0xf4ead9, 2.5, 40, 2);
    fillLight.position.set(0, 4.8, 12.5);
    scene.add(fillLight);
    const fireLight = new PointLight(0xffaa66, 1.6, 12, 2);
    fireLight.position.set(0, 1.1, 1.2 + fireplaceZOffset);
    scene.add(fireLight);

    const room = buildRoom();
    scene.add(room);

    const floor = new Mesh(
        new PlaneGeometry(18, 16),
        new MeshStandardMaterial({ color: 0x242a38, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    scene.add(floor);

    const fireplace = buildFireplace();
    fireplace.position.z = fireplaceZOffset;
    scene.add(fireplace);

    const stockings = buildMantelStockings(fireplace);
    fireplace.add(stockings);
    const garland = buildMantelGarland(fireplace);
    fireplace.add(garland);
    fireplace.userData.garland = garland;

    const tree = buildTree();
    tree.scale.setScalar(1.5);
    tree.position.set(4.2, -1.2, 2.2);
    scene.add(tree);
    tree.updateMatrixWorld(true);
    const treeStar = buildTreeStar(tree);
    scene.add(treeStar);
    scene.userData.treeStar = treeStar;
    const presents = buildPresents(tree);
    scene.add(presents);
    scene.userData.presents = presents;
    const treeLights = buildTreeLights(tree);
    scene.add(treeLights);

    let rug = null;
    const logLayout = "teepee"; // teepee | cabin
    const { group: logs, logMeshes } = buildLogs(logLayout);
    logs.position.set(0, 0.15, 0.2 + fireplaceZOffset);
    scene.add(logs);
    logs.updateMatrixWorld(true);

    rug = buildRug(fireplaceZOffset);
    scene.add(rug);

    const firePlanes = [];
    let snow = null;
    let winterScene = null;
    const pointer = new Vector2(0, 0);
    const gyroInput = new Vector2(0, 0);
    let gyroEnabled = false;
    let gyroRequested = false;
    const cameraDesired = new Vector3().copy(camera.position);

    const firePlane = buildFirePlane();
    firePlane.position.set(0, 0.18, -0.35 + fireplaceZOffset);
    firePlanes.push(firePlane);
    scene.add(firePlane);

    const logFlames = buildLogFlames(logMeshes);
    logFlames.forEach((flame) => {
        firePlanes.push(flame);
        scene.add(flame);
    });

    const sideFlames = buildLogSideFlames(logMeshes, new Vector3(0, 0.9, fireplaceZOffset));
    sideFlames.forEach((flame) => {
        firePlanes.push(flame);
        scene.add(flame);
    });

    snow = buildSnowSystem();
    scene.add(snow);
    winterScene = buildWinterScene(snow.userData.baseZ);
    scene.add(winterScene);

    const clock = new Clock();
    const crackle = createCrackleAudio();
    let audioStarted = false;
    let audioPlaying = false;
    let lastTime = 0;

    function updatePointerFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        pointer.set(x, y);
    }

    function updateRotateOverlay() {
        if (!rotateOverlay) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const isPortrait = h > w;
        rotateOverlay.style.display = isPortrait ? "flex" : "none";
    }

    function handleDeviceOrientation(e) {
        if (e.gamma === null || e.beta === null) return;
        const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
        const maxGamma = 40; // left/right tilt
        const maxBeta = 30; // forward/back tilt
        const normalizedX = clamp((e.gamma || 0) / maxGamma, -1, 1);
        // Bias beta so level phone keeps camera near base height.
        const normalizedY = clamp(((e.beta || 0) - 50) / maxBeta, -1, 1);
        gyroInput.set(normalizedX, normalizedY);
        gyroEnabled = true;
    }

    function requestGyroAccess() {
        if (gyroRequested) return;
        gyroRequested = true;
        if (typeof DeviceOrientationEvent === "undefined") return;
        const permission = DeviceOrientationEvent.requestPermission;
        if (typeof permission === "function") {
            permission().then((res) => {
                if (res === "granted") {
                    window.addEventListener("deviceorientation", handleDeviceOrientation, true);
                }
            }).catch(() => {});
        } else {
            window.addEventListener("deviceorientation", handleDeviceOrientation, true);
        }
    }

    window.addEventListener("pointermove", updatePointerFromEvent);
    window.addEventListener("pointerdown", updatePointerFromEvent);
    window.addEventListener("resize", updateRotateOverlay);
    window.addEventListener("orientationchange", () => {
        setTimeout(updateRotateOverlay, 200);
    });

    function toggleAudio() {
        requestGyroAccess();
        if (!audioStarted) {
            crackle.start();
            audioStarted = true;
            audioPlaying = true;
            return;
        }
        if (audioPlaying) {
            crackle.stop();
            audioPlaying = false;
        } else {
            crackle.start();
            audioPlaying = true;
        }
    }

    function resize() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const needsResize = canvas.width !== width || canvas.height !== height;
        if (needsResize) {
            renderer.setSize(width, height, false);
            const aspect = width / height;
            camera.aspect = aspect;
            const portraitBoost = Math.max(0, 1 - aspect);
            camera.fov = 50 + portraitBoost * 18; // widen FOV a bit in portrait for better fit
            renderer.toneMappingExposure = baseExposure + portraitBoost * 0.8; // brighten more in portrait
            camera.updateProjectionMatrix();
            firePlanes.forEach((fp) => fp.material.uniforms.u_resolution.value.set(width, height));
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        resize();
        const t = clock.getElapsedTime();
        const delta = t - lastTime;
        lastTime = t;

        // Subtle camera orbit based on pointer/touch position.
        const control = gyroEnabled ? gyroInput : pointer;
        const angleOffset = control.x * 0.22;
        const heightOffset = control.y * 0.5;
        const angle = cameraBaseAngle + angleOffset;
        cameraDesired.set(
            Math.sin(angle) * cameraOrbitRadius + cameraTarget.x,
            cameraBasePos.y + heightOffset,
            Math.cos(angle) * cameraOrbitRadius + cameraTarget.z
        );
        camera.position.lerp(cameraDesired, 0.06);
        camera.lookAt(cameraTarget);

        firePlanes.forEach((fp) => {
            fp.material.uniforms.u_time.value = t;
            const target = fp.userData.lookAtTarget || camera.position;
            fp.lookAt(target);
        });
        fireLight.intensity = 1.35 + Math.sin(t * 6.0) * 0.15 + Math.sin(t * 11.0) * 0.1;
        tree.rotation.y = 0.03 * Math.sin(t * 0.3);
        if (stockings.userData.stockings) {
            stockings.userData.stockings.forEach((s, i) => {
                s.rotation.z = 0.03 * Math.sin(t * 0.8 + i * 0.7);
            });
        }
        if (snow) {
            const positions = snow.geometry.getAttribute("position");
            const speeds = snow.userData.speeds;
            const spreadY = snow.userData.spreadY;
            const windowCenters = snow.userData.windowCenters;
            const windowHalfWidth = snow.userData.windowHalfWidth;
            const windowDepth = snow.userData.windowDepth;
            const baseZ = snow.userData.baseZ;

            for (let i = 0; i < speeds.length; i++) {
                const i3 = i * 3;
                let x = positions.array[i3 + 0];
                let y = positions.array[i3 + 1];
                let z = positions.array[i3 + 2];

                // Fall downward
                y -= speeds[i] * delta;

                // Gentle horizontal drift that depends on time and flake index
                const sway = Math.sin(t * 0.6 + i * 0.37) * 0.25;
                x += sway * delta;

                // If flake goes below the "floor", respawn above
                const floorY = -1.6;
                if (y < floorY) {
                    y = Math.random() * spreadY + 2.0;
                    const center = windowCenters[Math.floor(Math.random() * windowCenters.length)];
                    x = center + (Math.random() - 0.5) * windowHalfWidth * 2;
                    z = baseZ - Math.random() * windowDepth;
                }

                positions.array[i3 + 0] = x;
                positions.array[i3 + 1] = y;
                positions.array[i3 + 2] = z;
            }

            positions.needsUpdate = true;
        }
        if (winterScene && winterScene.userData.trees) {
            winterScene.userData.trees.forEach((tree) => {
                const swayOffset = tree.userData.swayOffset || 0;
                tree.rotation.z = 0.01 * Math.sin(t * 0.4 + swayOffset);
            });
        }
        if (fireplace.userData.garland && fireplace.userData.garland.userData.bulbs) {
            fireplace.userData.garland.userData.bulbs.forEach((bulb) => {
                const phase = bulb.userData.twinklePhase || 0;
                const base = bulb.userData.baseIntensity || 2.0;
                const speed = bulb.userData.twinkleSpeed || 2.0;
                const amp = bulb.userData.twinkleAmp || 0.8;
                const slowPulse = Math.sin(t * 0.35 + phase * 0.5) * (amp * 0.6);
                const fastFlicker = Math.sin(t * speed + phase) * (amp * 0.4);
                const intensity = Math.max(0.3, base + slowPulse + fastFlicker);
                bulb.material.emissiveIntensity = intensity;
                if (bulb.userData.halo) {
                    const s = 1.0 + (intensity - base) * 0.25;
                    bulb.userData.halo.scale.setScalar(1.0 + Math.max(0, s));
                }
            });
        }
        if (rug) {
            const baseY = typeof rug.userData.baseY === "number" ? rug.userData.baseY : rug.position.y;
            rug.userData.baseY = baseY;
            rug.position.y = baseY + Math.sin(t * 0.8) * 0.01;
        }
        if (scene.userData.presents) {
            const time = t;
            scene.userData.presents.children.forEach((gift, idx) => {
                const wobble = 0.01 * Math.sin(time * 0.9 + idx * 0.8);
                gift.rotation.y = (gift.userData.baseRotY || 0) + wobble * 0.05;
            });
        }
        if (scene.userData.treeStar) {
            const starMesh = scene.userData.treeStar.userData.starMesh;
            if (starMesh && starMesh.userData.halo) {
                const halo = starMesh.userData.halo;

                // Pulse the halo with soft breathing motion
                const baseScale = 1.0;
                const pulse = 0.12 * Math.sin(t * 2.0);  // gentle pulse
                const s = baseScale + pulse;

                halo.scale.setScalar(s);

                // Optional slight opacity pulse to match scale:
                if (halo.material && halo.material.transparent) {
                    halo.material.opacity = 0.22 + 0.08 * Math.abs(Math.sin(t * 2.0));
                }
            }
        }
        treeLights.userData.bulbs.forEach((bulb) => {
            const phase = bulb.userData.twinklePhase || 0;
            const base = bulb.userData.baseIntensity || 2.2;
            const speed = bulb.userData.twinkleSpeed || 2.4;
            const amp = bulb.userData.twinkleAmp || 0.9;
            const slowPulse = Math.sin(t * 0.35 + phase * 0.25) * (amp * 0.9);
            const deepFade = Math.sin(t * 0.12 + phase * 0.4) * (amp * 0.6);
            const blend = 0.5 + 0.5 * Math.sin(t * (speed * 1.2) + phase * 0.8);
            bulb.material.emissiveIntensity = Math.max(0.25, base + slowPulse + deepFade);
            if (bulb.userData.colorA && bulb.userData.colorB) {
                const c = bulb.userData.colorA.clone().lerp(bulb.userData.colorB, blend);
                bulb.material.emissive.copy(c);
            }
        });
        treeLights.position.copy(tree.position);
        treeLights.rotation.copy(tree.rotation);
        treeLights.scale.copy(tree.scale);
        renderer.render(scene, camera);
    }

    resize();
    animate();

    // Start audio on first interaction to satisfy autoplay policies.
    window.addEventListener("pointerdown", toggleAudio);
    updateRotateOverlay();
});

function buildFireplace() {
    const group = new Group();

    const brick = new MeshStandardMaterial({
        color: 0x7a4233,
        roughness: 0.9,
        metalness: 0.05
    });
    const stone = new MeshStandardMaterial({
        color: 0x1b1c23,
        roughness: 0.8,
        metalness: 0.02
    });

    const hearth = new Mesh(new BoxGeometry(7.0, 0.55, 3.2), brick);
    hearth.position.set(0, -1.25, 0.3);
    group.add(hearth);

    const left = new Mesh(new BoxGeometry(0.85, 3.3, 2.6), brick);
    left.position.set(-3.2, 0.25, 0);
    group.add(left);

    const right = left.clone();
    right.position.x = 3.2;
    group.add(right);

    const top = new Mesh(new BoxGeometry(6.9, 0.65, 2.6), brick);
    top.position.set(0, 2.15, 0);
    group.add(top);
    group.userData.mantelTop = top;

    const chimneyCap = new Mesh(new BoxGeometry(4.2, 0.35, 2.8), brick);
    chimneyCap.position.set(0, 2.55, 0.25);
    group.add(chimneyCap);

    const chimneyStackHeight = 8;
    const chimneyStack = new Mesh(new BoxGeometry(2.4, chimneyStackHeight, 1.6), brick);
    chimneyStack.position.set(
        0,
        chimneyCap.position.y + (0.35 / 2) + chimneyStackHeight / 2,
        0.1
    );
    group.add(chimneyStack);

    const back = new Mesh(new BoxGeometry(5.6, 3.5, 0.45), stone);
    back.position.set(0, 0.45, -1.2);
    group.add(back);

    const innerShelf = new Mesh(new BoxGeometry(5.8, 0.4, 2.2), stone);
    innerShelf.position.set(0, -0.75, 0.1);
    group.add(innerShelf);

    return group;
}

function buildLogs(layout = "teepee") {
    const group = new Group();
    const mat = new MeshStandardMaterial({
        color: 0x4a2a17,
        roughness: 0.8,
        metalness: 0.02
    });

    const geo = new CylinderGeometry(0.16, 0.18, 1.4, 16, 1, false);
    const logMeshes = [];

    function addLog(position, rotation) {
        const log = new Mesh(geo, mat);
        log.position.copy(position);
        log.rotation.set(rotation.x, rotation.y, rotation.z);
        group.add(log);
        logMeshes.push(log);
    }

    if (layout === "cabin") {
        const baseY = -0.25;
        const layerGap = 0.25;
        const offset = 0.55;

        // Bottom layer
        addLog(
            new Vector3(0, baseY, offset),
            new Vector3(0, 0, Math.PI / 2)
        );
        addLog(
            new Vector3(0, baseY, -offset),
            new Vector3(0, 0, Math.PI / 2)
        );

        // Top layer
        addLog(
            new Vector3(offset, baseY + layerGap, 0),
            new Vector3(Math.PI / 2, 0, 0)
        );
        addLog(
            new Vector3(-offset, baseY + layerGap, 0),
            new Vector3(Math.PI / 2, 0, 0)
        );
    } else {
        const tilt = Math.PI / 5;
        const spread = 0.55;

        addLog(
            new Vector3(-spread, -0.05, 0),
            new Vector3(Math.PI / 22, 0, -tilt)
        );
        addLog(
            new Vector3(spread, -0.08, 0),
            new Vector3(-Math.PI / 18, 0, tilt)
        );
        addLog(
            new Vector3(0, -0.02, -spread * 0.8),
            new Vector3(tilt, 0, 0)
        );
        addLog(
            new Vector3(0, -0.06, spread * 0.85),
            new Vector3(-tilt * 0.9, 0, 0)
        );
    }

    return { group, logMeshes };
}

function buildMantelGarland(fireplace) {
    const group = new Group();
    const top = fireplace.userData.mantelTop;
    if (!top || !top.geometry || !top.geometry.parameters) return group;

    const params = top.geometry.parameters || {};
    const width = params.width || 6.9;
    const depth = params.depth || 2.6;
    const halfW = width / 2;
    const baseY = top.position.y + 0.08;
    const frontZ = top.position.z + depth / 2 + (0.05 + Math.random() * 0.02);

    const anchorCount = 5 + Math.floor(Math.random() * 3); // 5–7 anchors
    const anchors = [];
    for (let i = 0; i < anchorCount; i++) {
        const t = i / (anchorCount - 1);
        const xJitter = (Math.random() - 0.5) * 0.16; // +/-0.08
        const yJitter = (Math.random() - 0.5) * 0.06; // +/-0.03
        const x = -halfW + t * width + xJitter;
        const sag = (i === 0 || i === anchorCount - 1) ? 0 : 0.16 + Math.random() * 0.08;
        const y = baseY - sag + yJitter;
        anchors.push(new Vector3(x, y, frontZ));
    }

    const curve = new CatmullRomCurve3(anchors);
    const vine = new Mesh(
        new TubeGeometry(curve, 120, 0.045, 10, false),
        new MeshStandardMaterial({
            color: 0x294833,
            roughness: 0.9,
            metalness: 0.05
        })
    );
    group.add(vine);

    const leafGeo = new PlaneGeometry(0.25, 0.14);
    const leafBase = new Color(0x3f7a56);
    const curvePoints = curve.getPoints(80);
    for (let i = 4; i < curvePoints.length - 4; i += 4) {
        const t = i / (curvePoints.length - 1);
        const pos = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        const up = new Vector3(0, 1, 0);
        let normal = up.clone().cross(tangent);
        if (normal.lengthSq() < 1e-4) normal = new Vector3(1, 0, 0).cross(tangent);
        normal.normalize();
        const binormal = tangent.clone().cross(normal).normalize();

        const cluster = 2 + Math.floor(Math.random() * 3); // 2–4 leaves
        for (let c = 0; c < cluster; c++) {
            const mat = new MeshStandardMaterial({
                color: leafBase.clone().multiplyScalar(0.85 + Math.random() * 0.3),
                roughness: 0.9,
                metalness: 0.05,
                side: DoubleSide
            });
            const leaf = new Mesh(leafGeo, mat);
            const out = normal.clone().multiplyScalar(0.025 + Math.random() * 0.025);
            const lift = new Vector3(0, 0.02 + Math.random() * 0.04, 0);
            const spread = binormal.clone().multiplyScalar((Math.random() - 0.5) * 0.06);
            leaf.position.copy(pos).add(out).add(lift).add(spread);

            const dir = normal.clone().add(new Vector3(0, 0.2, 0)).normalize();
            leaf.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), dir);
            leaf.rotateOnAxis(dir, (Math.random() - 0.5) * 1.0);
            leaf.rotateOnAxis(tangent, (Math.random() - 0.5) * 0.6);
            group.add(leaf);
        }
    }

    const bulbs = [];
    const bulbGeo = new SphereGeometry(0.055, 10, 10);
    const haloGeo = new SphereGeometry(0.09, 10, 10);
    const palette = [0xfff1b3, 0xffd1b3, 0xffb3d9, 0xb3d9ff, 0xc9ffb3];
    const bulbCount = 10 + Math.floor(Math.random() * 5); // 10–14
    for (let i = 0; i < bulbCount; i++) {
        const baseT = bulbCount === 1 ? 0.5 : i / (bulbCount - 1);
        const jitter = (Math.random() - 0.5) * 0.04; // +/-0.02
        const t = Math.min(1, Math.max(0, baseT + jitter));
        const pos = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        let normal = new Vector3(0, 1, 0).cross(tangent);
        if (normal.lengthSq() < 1e-4) normal = new Vector3(1, 0, 0).cross(tangent);
        normal.normalize();

        const emissive = new Color(palette[Math.floor(Math.random() * palette.length)]);
        const emissiveIntensity = 1.7 + Math.random() * 0.9;
        const bulbMat = new MeshStandardMaterial({
            color: 0x111111,
            emissive,
            emissiveIntensity,
            roughness: 0.3,
            metalness: 0.2
        });
        const bulb = new Mesh(bulbGeo, bulbMat);
        const offset = normal.clone().multiplyScalar(0.05 + Math.random() * 0.015).add(new Vector3(0, 0.03, 0.04));
        bulb.position.copy(pos).add(offset);

        const halo = new Mesh(
            haloGeo,
            new MeshBasicMaterial({
                color: emissive.clone(),
                transparent: true,
                opacity: 0.25,
                depthWrite: false
            })
        );
        halo.scale.setScalar(1);
        bulb.add(halo);
        bulb.userData.halo = halo;
        bulb.userData.twinklePhase = Math.random() * Math.PI * 2;
        bulb.userData.baseIntensity = emissiveIntensity;
        bulb.userData.twinkleSpeed = 1.5 + Math.random() * 1.2;
        bulb.userData.twinkleAmp = 0.7 + Math.random() * 0.5;
        group.add(bulb);
        bulbs.push(bulb);
    }

    group.userData.bulbs = bulbs;
    group.position.y -= 0.03 + Math.random() * 0.02;
    return group;
}

function buildRoomGarlands(roomWidth, roomDepth, roomHeight, backWallZ) {
    const group = new Group();

    const garlandY = (roomHeight - 2.0) - 0.35;
    const backZ = backWallZ + 0.35;
    const leftX = -roomWidth * 0.5 + 0.32;
    const rightX = roomWidth * 0.5 - 0.32;
    const frontZ = (roomDepth * 0.5) - 0.8;
    const sag = 0.85;
    const centerSag = 0.12;
    const cornerInset = 0.6;
    const leftEdge = leftX + cornerInset;
    const rightEdge = rightX - cornerInset;

    const leafGeo = new PlaneGeometry(0.25, 0.14);
    const leafBase = new Color(0x3f7a56);
    const bulbs = [];
    const bulbGeo = new SphereGeometry(0.055, 10, 10);
    const haloGeo = new SphereGeometry(0.09, 10, 10);
    const palette = [0xfff1b3, 0xffd1b3, 0xffb3d9, 0xb3d9ff, 0xc9ffb3];

    function addGarland(anchors, opts = {}) {
        const leafStep = typeof opts.leafStep === "number" ? opts.leafStep : 4;
        const bulbMin = typeof opts.bulbMin === "number" ? opts.bulbMin : 10;
        const bulbMax = typeof opts.bulbMax === "number" ? opts.bulbMax : 14;

        const curve = new CatmullRomCurve3(anchors);
        const vineGeo = new TubeGeometry(curve, 120, 0.045, 10, false);
        const vineMat = new MeshStandardMaterial({
            color: 0x294833,
            roughness: 0.9,
            metalness: 0.05
        });
        const vine = new Mesh(vineGeo, vineMat);
        group.add(vine);

        const curvePoints = curve.getPoints(80);
        for (let i = 4; i < curvePoints.length - 4; i += leafStep) {
            const t = i / (curvePoints.length - 1);
            const pos = curve.getPoint(t);
            const tangent = curve.getTangent(t).normalize();
            const up = new Vector3(0, 1, 0);
            let normal = up.clone().cross(tangent);
            if (normal.lengthSq() < 1e-4) normal = new Vector3(1, 0, 0).cross(tangent);
            normal.normalize();
            const binormal = tangent.clone().cross(normal).normalize();

            const cluster = 2 + Math.floor(Math.random() * 3); // 2–4 leaves
            for (let c = 0; c < cluster; c++) {
                const mat = new MeshStandardMaterial({
                    color: leafBase.clone().multiplyScalar(0.85 + Math.random() * 0.3),
                    roughness: 0.9,
                    metalness: 0.05,
                    side: DoubleSide
                });
                const leaf = new Mesh(leafGeo, mat);
                const out = normal.clone().multiplyScalar(0.025 + Math.random() * 0.025);
                const lift = new Vector3(0, 0.02 + Math.random() * 0.04, 0);
                const spread = binormal.clone().multiplyScalar((Math.random() - 0.5) * 0.06);
                leaf.position.copy(pos).add(out).add(lift).add(spread);

                const dir = normal.clone().add(new Vector3(0, 0.2, 0)).normalize();
                leaf.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), dir);
                leaf.rotateOnAxis(dir, (Math.random() - 0.5) * 1.0);
                leaf.rotateOnAxis(tangent, (Math.random() - 0.5) * 0.6);
                group.add(leaf);
            }
        }

        const bulbRange = Math.max(0, bulbMax - bulbMin);
        const bulbCount = bulbMin + Math.floor(Math.random() * (bulbRange + 1)); // variable count
        for (let i = 0; i < bulbCount; i++) {
            const baseT = bulbCount === 1 ? 0.5 : i / (bulbCount - 1);
            const jitter = (Math.random() - 0.5) * 0.04; // +/-0.02
            const t = Math.min(1, Math.max(0, baseT + jitter));
            const pos = curve.getPoint(t);
            const tangent = curve.getTangent(t).normalize();
            let normal = new Vector3(0, 1, 0).cross(tangent);
            if (normal.lengthSq() < 1e-4) normal = new Vector3(1, 0, 0).cross(tangent);
            normal.normalize();

            const emissive = new Color(palette[Math.floor(Math.random() * palette.length)]);
            const emissiveIntensity = 1.7 + Math.random() * 0.9;
            const bulbMat = new MeshStandardMaterial({
                color: 0x111111,
                emissive,
                emissiveIntensity,
                roughness: 0.3,
                metalness: 0.2
            });
            const bulb = new Mesh(bulbGeo, bulbMat);
            const offset = normal.clone().multiplyScalar(0.05 + Math.random() * 0.015).add(new Vector3(0, 0.03, 0.04));
            bulb.position.copy(pos).add(offset);

            const halo = new Mesh(
                haloGeo,
                new MeshBasicMaterial({
                    color: emissive.clone(),
                    transparent: true,
                    opacity: 0.25,
                    depthWrite: false
                })
            );
            halo.scale.setScalar(1);
            bulb.add(halo);
            bulb.userData.halo = halo;
            bulb.userData.twinklePhase = Math.random() * Math.PI * 2;
            bulb.userData.baseIntensity = emissiveIntensity;
            bulb.userData.twinkleSpeed = 1.5 + Math.random() * 1.2;
            bulb.userData.twinkleAmp = 0.7 + Math.random() * 0.5;
            group.add(bulb);
            bulbs.push(bulb);
        }
    }

    const backAnchors = [
        new Vector3(leftEdge, garlandY, backZ),
        new Vector3(leftEdge * 0.35, garlandY - sag, backZ),
        new Vector3(0, garlandY - centerSag, backZ),
        new Vector3(rightEdge * 0.35, garlandY - sag, backZ),
        new Vector3(rightEdge, garlandY, backZ)
    ];

    const midZ = backZ + (frontZ - backZ) * 0.35;

    const leftAnchors = [
        new Vector3(leftEdge, garlandY, backZ + 0.12),
        new Vector3(leftEdge, garlandY - sag, midZ),
        new Vector3(leftX + 0.18, garlandY - sag * 0.45, frontZ)
    ];

    const rightAnchors = [
        new Vector3(rightEdge, garlandY, backZ + 0.12),
        new Vector3(rightEdge, garlandY - sag, midZ),
        new Vector3(rightX - 0.18, garlandY - sag * 0.45, frontZ)
    ];

    addGarland(backAnchors);
    addGarland(leftAnchors, { leafStep: 8, bulbMin: 6, bulbMax: 9 });
    addGarland(rightAnchors, { leafStep: 8, bulbMin: 6, bulbMax: 9 });

    group.userData.bulbs = bulbs;

    return group;
}

// Build a simple low-poly evergreen tree.
function buildTree() {
    const group = new Group();

    const trunkMat = new MeshStandardMaterial({
        color: 0x5a3b26,
        roughness: 0.85,
        metalness: 0.05
    });
    const foliageMat = new MeshStandardMaterial({
        color: 0x3f6e56,
        roughness: 0.9,
        metalness: 0.04
    });

    const trunkHeight = 0.65;
    const trunk = new Mesh(new CylinderGeometry(0.18, 0.2, trunkHeight, 12), trunkMat);
    trunk.position.y = trunkHeight / 2;
    group.add(trunk);

    const layers = [
        { radius: 1.05, height: 1.2, y: 1.1 },
        { radius: 0.85, height: 1.0, y: 1.9 },
        { radius: 0.65, height: 0.8, y: 2.6 },
        { radius: 0.45, height: 0.6, y: 3.15 }
    ];

    layers.forEach((layer) => {
        const cone = new Mesh(new ConeGeometry(layer.radius, layer.height, 12), foliageMat);
        cone.position.y = layer.y;
        group.add(cone);
    });

    return group;
}

function createStarGeometry(innerRadius, outerRadius, depth) {
    const shape = new Shape();
    const spikes = 5;
    const step = Math.PI / spikes;
    let rot = -Math.PI / 2.0; // start pointing up
    let x = 0;
    let y = 0;

    shape.moveTo(0, -outerRadius);
    for (let i = 0; i < spikes * 2; i++) {
        const r = (i % 2 === 0) ? outerRadius : innerRadius;
        x = Math.cos(rot) * r;
        y = Math.sin(rot) * r;
        shape.lineTo(x, y);
        rot += step;
    }
    shape.closePath();

    const geo = new ExtrudeGeometry(shape, {
        depth: depth,
        bevelEnabled: true,
        bevelThickness: depth * 0.25,
        bevelSize: innerRadius * 0.15,
        bevelSegments: 2,
        bevelOffset: 0
    });

    // Center the star around the origin and orient toward +Z
    geo.center();

    return geo;
}

function buildTreeStar(tree) {
    const group = new Group();

    const starGeo = createStarGeometry(0.18, 0.35, 0.12);
    const starMat = new MeshStandardMaterial({
        color: 0xffc400,
        emissive: new Color(0xffc400),
        emissiveIntensity: 1.35,
        roughness: 0.3,
        metalness: 0.3
    });
    const star = new Mesh(starGeo, starMat);
    group.add(star);

    const halo = new Mesh(
        new SphereGeometry(0.4, 16, 16),
        new MeshBasicMaterial({
            color: 0xffecc7,
            transparent: true,
            opacity: 0.25,
            depthWrite: false
        })
    );
    star.add(halo);
    star.userData.halo = halo;

    const box = new Box3().setFromObject(tree);
    const top = new Vector3(
        (box.min.x + box.max.x) * 0.5,
        box.max.y,
        (box.min.z + box.max.z) * 0.5
    );
    group.position.copy(top);
    star.position.y = -0.001;

    const roomCenter = new Vector3(0, group.position.y, 0);
    const dir = roomCenter.clone().sub(group.position);
    const yaw = Math.atan2(dir.x, dir.z);
    group.rotation.y = yaw * 0.35;

    star.rotation.z = 0.5;

    group.userData.starMesh = star;

    return group;
}

function buildTreeLights(tree) {
    const group = new Group();
    const bulbGeo = new SphereGeometry(0.05, 8, 8);
    const emissiveColors = [0xffa94a, 0xff3b30, 0x4d8cff, 0xffe066];
    const bulbs = [];
    let seed = 1337;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };

    tree.updateMatrixWorld(true);

    tree.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        if (!(child.geometry instanceof ConeGeometry)) return;
        const params = child.geometry.parameters || {};
        const height = params.height || 1;
        const radius = params.radius || 0.6;
        const count = Math.max(4, Math.round(radius * 8));

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + rand() * 0.35;
            const v = 0.2 + rand() * 0.7; // move toward tip
            const yLocal = -height / 2 + v * height;
            const ringRadius = Math.max(0.04, radius * (1 - v));

            const pos = new Vector3(
                Math.cos(angle) * ringRadius,
                yLocal,
                Math.sin(angle) * ringRadius
            );

            pos.applyMatrix4(child.matrixWorld);
            tree.worldToLocal(pos);

            const colorA = new Color(emissiveColors[Math.floor(rand() * emissiveColors.length)]);
            let colorB = colorA;
            while (colorB.equals(colorA)) {
                colorB = new Color(emissiveColors[Math.floor(rand() * emissiveColors.length)]);
            }
            const intensity = 2.2 + rand() * 0.6;

            const mat = new MeshStandardMaterial({
                color: 0x111111,
                emissive: colorA.clone(),
                emissiveIntensity: intensity,
                metalness: 0.02,
                roughness: 0.35
            });
            const bulb = new Mesh(bulbGeo, mat);
            bulb.position.copy(pos);
            bulb.userData.twinklePhase = rand() * Math.PI * 2;
            bulb.userData.baseIntensity = intensity;
            bulb.userData.twinkleSpeed = 1.7 + rand() * 1.6;
            bulb.userData.twinkleAmp = 0.8 + rand() * 0.5;
            bulb.userData.colorA = colorA;
            bulb.userData.colorB = colorB;

            group.add(bulb);
            bulbs.push(bulb);
        }
    });

    group.userData.bulbs = bulbs;
    return group;
}

function buildSnowSystem() {
    const SNOW_COUNT = 400; // adjust for performance if needed

    const geometry = new BufferGeometry();
    const positions = new Float32BufferAttribute(SNOW_COUNT * 3, 3);
    const speeds = new Float32Array(SNOW_COUNT);

    // Snow volume: clustered outside each window
    const windowCenters = [-6.0, 6.0];
    const windowHalfWidth = 2.3;
    const spreadY = 7;
    const windowDepth = 1.4;
    const baseZ = -4.6;

    for (let i = 0; i < SNOW_COUNT; i++) {
        const i3 = i * 3;
        const center = windowCenters[i % windowCenters.length];
        positions.array[i3 + 0] = center + (Math.random() - 0.5) * windowHalfWidth * 2; // x near window
        positions.array[i3 + 1] = Math.random() * spreadY + 1.5; // y above floor
        positions.array[i3 + 2] = baseZ - Math.random() * windowDepth; // just outside behind the back wall

        // Slight speed variation per flake
        speeds[i] = 0.3 + Math.random() * 0.4;
    }

    geometry.setAttribute("position", positions);

    const material = new PointsMaterial({
        size: 0.06,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: true
    });

    const snow = new Points(geometry, material);
    snow.userData.speeds = speeds;
    snow.userData.spreadY = spreadY;
    snow.userData.windowCenters = windowCenters;
    snow.userData.windowHalfWidth = windowHalfWidth;
    snow.userData.windowDepth = windowDepth;
    snow.userData.baseZ = baseZ;
    snow.frustumCulled = false; // keep visible when camera skews past one window

    return snow;
}

function buildWinterScene(baseSnowZ = -4.6) {
    const group = new Group();
    const zOffset = (typeof baseSnowZ === "number" ? baseSnowZ : -4.6) - 1.2;
    group.position.set(0, 0, zOffset);

    const sky = new Mesh(
        new PlaneGeometry(40, 20),
        new ShaderMaterial({
            side: DoubleSide,
            depthWrite: false,
            uniforms: {
                u_topColor: { value: new Color(0x0a1020) },
                u_bottomColor: { value: new Color(0x2f5686) }
            },
            vertexShader: `
                varying vec2 v_uv;
                void main() {
                    v_uv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision mediump float;
                varying vec2 v_uv;
                uniform vec3 u_topColor;
                uniform vec3 u_bottomColor;
                void main() {
                    float g = smoothstep(0.0, 1.0, v_uv.y);
                    vec3 color = mix(u_bottomColor, u_topColor, g);
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        })
    );
    sky.position.set(0, 4.0, 0);
    group.add(sky);

    const moon = new Mesh(
        new CircleGeometry(0.7, 32),
        new MeshStandardMaterial({
            color: 0xf5f0d0,
            emissive: new Color(0xf8eccc),
            emissiveIntensity: 1.2,
            roughness: 0.3,
            metalness: 0.0
        })
    );
    moon.position.set(6.8, 3.6, -0.6);
    group.add(moon);

    const groundGeo = new PlaneGeometry(40, 5, 24, 4);
    const groundPositions = groundGeo.attributes.position;
    const halfWidth = 20;
    for (let i = 0; i < groundPositions.count; i++) {
        const x = groundPositions.getX(i);
        const y = groundPositions.getY(i);
        const curve = 0.25 * (1 - Math.pow(x / halfWidth, 2));
        groundPositions.setY(i, y + curve - 0.1);
    }
    groundPositions.needsUpdate = true;
    groundGeo.computeVertexNormals();

    const ground = new Mesh(
        groundGeo,
        new MeshStandardMaterial({
            color: 0xcfd8e4,
            roughness: 1.0,
            metalness: 0.05
        })
    );
    ground.position.set(0, 0.35, -0.1);
    group.add(ground);

    const treeGroup = new Group();
    const trees = [];
    const treeMat = new MeshStandardMaterial({
        color: 0x0d0f12,
        roughness: 1.0,
        metalness: 0.0
    });
    const treeCount = 12 + Math.floor(Math.random() * 5);
    for (let i = 0; i < treeCount; i++) {
        const height = 1.4 + Math.random() * 1.0;
        const radius = height * 0.35;
        const x = -12 + Math.random() * 24;
        const pine = new Mesh(new ConeGeometry(radius, height, 8), treeMat);
        pine.position.set(x, 1.5 + height / 2 + (Math.random() - 0.5) * 0.05, 0.22 + Math.random() * 0.08);
        pine.rotation.y = Math.random() * Math.PI * 2;
        pine.userData.swayOffset = Math.random() * Math.PI * 2;
        treeGroup.add(pine);
        trees.push(pine);
    }
    group.add(treeGroup);

    group.userData.trees = trees;
    group.userData.zOffset = zOffset;

    return group;
}

function buildRug(fireplaceZOffset) {
    const width = 5.5;
    const height = 3.2;
    const geometry = new PlaneGeometry(width, height, 16, 8);
    const positions = geometry.attributes.position;
    const halfW = width / 2;
    const halfH = height / 2;
    const colors = new Float32Array(positions.count * 3);
    const baseColor = new Color(0xa67658);

    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const edge = Math.max(Math.abs(x) / halfW, Math.abs(y) / halfH);
        const lift = 0.08 * Math.pow(edge, 2.2);
        positions.setZ(i, lift);

        const shade = 1.12 - edge * 0.18;
        colors[i * 3 + 0] = baseColor.r * shade;
        colors[i * 3 + 1] = baseColor.g * shade;
        colors[i * 3 + 2] = baseColor.b * shade;
    }
    positions.needsUpdate = true;
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new MeshStandardMaterial({
        color: baseColor,
        roughness: 0.95,
        metalness: 0.0,
        vertexColors: true
    });

    const rug = new Mesh(geometry, material);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, -1.48, fireplaceZOffset + 4.3);
    rug.userData.baseY = rug.position.y;

    return rug;
}

function buildPresents(tree) {
    const group = new Group();
    const wrapColors = [0xe74c3c, 0x27ae60, 0x2980b9, 0xf1c40f, 0x9b59b6];
    const ribbonColors = [0xffffff, 0xfff4d6, 0x222222];
    const giftCount = 5 + Math.floor(Math.random() * 3); // 5–7

    const bounds = { minX: -8.0, maxX: -4.2, minZ: -0.8, maxZ: 2.6 };

    const gifts = [];
    const placed = [];

    function makePresent(width, height, depth, wrapColor, ribbonColor) {
        const gift = new Group();
        const box = new Mesh(
            new BoxGeometry(width, height, depth),
            new MeshStandardMaterial({
                color: wrapColor,
                roughness: 0.85,
                metalness: 0.05
            })
        );
        gift.add(box);

        const ribbonMat = new MeshStandardMaterial({
            color: ribbonColor,
            roughness: 0.6,
            metalness: 0.2
        });
        const thickness = 0.04;
        const ribbonX = new Mesh(new BoxGeometry(width * 1.02, thickness, thickness), ribbonMat);
        ribbonX.position.y = height / 2 + thickness / 2 + 0.005;
        gift.add(ribbonX);

        const ribbonZ = new Mesh(new BoxGeometry(thickness, thickness, depth * 1.02), ribbonMat);
        ribbonZ.position.y = height / 2 + thickness / 2 + 0.005;
        gift.add(ribbonZ);

        const bow = new Group();
        const bowArmA = new Mesh(new BoxGeometry(0.16, 0.02, 0.06), ribbonMat);
        bowArmA.rotation.y = Math.PI / 4;
        bow.add(bowArmA);
        const bowArmB = new Mesh(new BoxGeometry(0.16, 0.02, 0.06), ribbonMat);
        bowArmB.rotation.y = -Math.PI / 4;
        bow.add(bowArmB);
        bow.position.y = height / 2 + 0.03;
        gift.add(bow);

        return gift;
    }

    for (let i = 0; i < giftCount; i++) {
        const width = 0.6 + Math.random() * 0.6;
        const depth = 0.6 + Math.random() * 0.6;
        const height = 0.4 + Math.random() * 0.6;
        const wrapColor = wrapColors[Math.floor(Math.random() * wrapColors.length)];
        const ribbonColor = ribbonColors[Math.floor(Math.random() * ribbonColors.length)];
        const gift = makePresent(width, height, depth, wrapColor, ribbonColor);

        const radius = 0.5 * Math.max(width, depth);
        let chosenPos = new Vector3();
        let accepted = false;
        let attempt = 0;
        let lastPos = null;
        while (!accepted && attempt < 20) {
            const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
            const nearFire = Math.random() < 0.6;
            const zMin = nearFire ? 0.5 : bounds.minZ;
            const zMax = bounds.maxZ;
            const z = zMin + Math.random() * (zMax - zMin);
            const candidate = new Vector3(x, -1.5 + height / 2 + 0.02, z);
            lastPos = candidate.clone();
            let ok = true;
            for (const p of placed) {
                const minDist = radius + p.radius + 0.15;
                if (candidate.distanceTo(p.pos) < minDist) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                chosenPos.copy(candidate);
                accepted = true;
                break;
            }
            attempt++;
        }
        if (!accepted && lastPos) {
            chosenPos.copy(lastPos);
        }

        chosenPos.x = Math.min(Math.max(chosenPos.x, bounds.minX), bounds.maxX);
        chosenPos.z = Math.min(Math.max(chosenPos.z, bounds.minZ), bounds.maxZ);
        gift.position.copy(chosenPos);

        if (Math.random() < 0.4) {
            gift.rotation.y = (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.12);
        }
        gift.userData.baseRotY = gift.rotation.y;

        group.add(gift);
        placed.push({ pos: chosenPos.clone(), radius, height });
        gifts.push({ gift, height });
    }

    if (gifts.length >= 2 && Math.random() < 0.6) {
        const baseIdx = Math.floor(Math.random() * gifts.length);
        const baseGift = gifts[baseIdx];
        const topWidth = 0.4 + Math.random() * 0.4;
        const topDepth = 0.4 + Math.random() * 0.4;
        const topHeight = 0.25 + Math.random() * 0.35;
        const wrapColor = wrapColors[Math.floor(Math.random() * wrapColors.length)];
        const ribbonColor = ribbonColors[Math.floor(Math.random() * ribbonColors.length)];
        const topGift = makePresent(topWidth, topHeight, topDepth, wrapColor, ribbonColor);
        const gap = 0.03;
        topGift.position.copy(baseGift.gift.position);
        topGift.position.y = baseGift.gift.position.y + baseGift.height / 2 + topHeight / 2 + gap;
        topGift.rotation.y = (Math.random() - 0.5) * 0.3;
        topGift.userData.baseRotY = topGift.rotation.y;
        group.add(topGift);
        gifts.push({ gift: topGift, height: topHeight });
    }

    return group;
}

function buildMantelStockings(fireplace) {
    const group = new Group();
    const top = fireplace.userData.mantelTop;
    if (!top) return group;

    const bodyGeo = new BoxGeometry(0.35, 0.9, 0.18);
    const footGeo = new BoxGeometry(0.35, 0.2, 0.18);
    const colors = [0xc0392b, 0x27ae60, 0x2980b9, 0xd35400];
    const positions = [-2.4, -0.8, 0.8, 2.4];
    const tilts = [-0.08, 0.05, -0.05, 0.08];
    const stockings = [];

    const params = top.geometry.parameters || {};
    const mantleHalfDepth = (params.depth || 2.6) / 2;
    const mantleHalfHeight = (params.height || 0.65) / 2;
    const anchorY = top.position.y - mantleHalfHeight + 0.15;
    const anchorZ = top.position.z + mantleHalfDepth + 0.08;

    positions.forEach((x, idx) => {
        const color = colors[idx % colors.length];
        const mat = new MeshStandardMaterial({
            color,
            roughness: 0.85,
            metalness: 0.03
        });

        const stocking = new Group();
        const body = new Mesh(bodyGeo, mat);
        body.position.set(0, -bodyGeo.parameters.height / 2, 0);
        stocking.add(body);

        const foot = new Mesh(footGeo, mat);
        foot.position.set(footGeo.parameters.width / 2, -bodyGeo.parameters.height + footGeo.parameters.height / 2, 0.02);
        stocking.add(foot);

        stocking.position.set(x, anchorY, anchorZ);
        stocking.rotation.z = tilts[idx % tilts.length];
        group.add(stocking);
        stockings.push(stocking);
    });

    group.userData.stockings = stockings;
    return group;
}

function buildRoom() {
    const group = new Group();

    // Basic materials
    const wallMat = new MeshStandardMaterial({
        color: 0x384255,
        roughness: 0.92,
        metalness: 0.02
    });

    const ceilingMat = new MeshStandardMaterial({
        color: 0x4c5670,
        roughness: 0.9,
        metalness: 0.03
    });

    // Room dimensions (roughly matching your existing floor / fireplace scale)
    const roomWidth = 18;
    const roomDepth = 16;
    const roomHeight = 8;
    const backWallZ = -3.8;
    const wallThickness = 0.4;

    // Window specs (kept in sync with buildBackWallWindows)
    const windowWidth = 2.4;
    const windowHeight = 3.1;
    const windowOffsetX = 6.0;
    const sillHeight = 0.9;

    // Build back wall from segments to leave openings for the windows.
    const wallBottom = -2;
    const wallTop = wallBottom + roomHeight;
    const addWallSegment = (w, h, x, y) => {
        const segment = new Mesh(new BoxGeometry(w, h, wallThickness), wallMat);
        segment.position.set(x, y, backWallZ);
        group.add(segment);
    };

    // Horizontal bands above and below the window cutouts
    const bottomHeight = sillHeight - wallBottom;
    const bottomCenterY = wallBottom + bottomHeight / 2;
    addWallSegment(roomWidth, bottomHeight, 0, bottomCenterY);

    const windowTop = sillHeight + windowHeight;
    const topHeight = wallTop - windowTop;
    const topCenterY = windowTop + topHeight / 2;
    addWallSegment(roomWidth, topHeight, 0, topCenterY);

    // Vertical columns around the window openings
    const wallLeft = -roomWidth / 2;
    const wallRight = roomWidth / 2;
    const leftWindowLeft = -windowOffsetX - windowWidth / 2;
    const leftWindowRight = -windowOffsetX + windowWidth / 2;
    const rightWindowLeft = windowOffsetX - windowWidth / 2;
    const rightWindowRight = windowOffsetX + windowWidth / 2;
    const columnHeight = roomHeight;
    const columnCenterY = wallBottom + columnHeight / 2;

    const leftColumnWidth = leftWindowLeft - wallLeft;
    const leftColumnCenterX = wallLeft + leftColumnWidth / 2;
    addWallSegment(leftColumnWidth, columnHeight, leftColumnCenterX, columnCenterY);

    const middleColumnWidth = rightWindowLeft - leftWindowRight;
    const middleColumnCenterX = leftWindowRight + middleColumnWidth / 2;
    addWallSegment(middleColumnWidth, columnHeight, middleColumnCenterX, columnCenterY);

    const rightColumnWidth = wallRight - rightWindowRight;
    const rightColumnCenterX = rightWindowRight + rightColumnWidth / 2;
    addWallSegment(rightColumnWidth, columnHeight, rightColumnCenterX, columnCenterY);

    // Left wall
    const leftWall = new Mesh(
        new BoxGeometry(roomDepth, roomHeight, wallThickness),
        wallMat
    );
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-roomWidth / 2, roomHeight / 2 - 2.0, -0.5);
    group.add(leftWall);

    // Right wall
    const rightWall = leftWall.clone();
    rightWall.position.x = roomWidth / 2;
    group.add(rightWall);

    // Ceiling
    const ceiling = new Mesh(
        new BoxGeometry(roomWidth, roomDepth, 0.4),
        ceilingMat
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, roomHeight - 2.0, -0.5);
    group.add(ceiling);

    // Add windows into the back wall
    const windows = buildBackWallWindows(backWallZ);
    windows.forEach((w) => group.add(w));

    const ceilingGarlands = buildRoomGarlands(roomWidth, roomDepth, roomHeight, backWallZ);
    group.add(ceilingGarlands);

    return group;
}

function buildBackWallWindows(backWallZ) {
    const windows = [];

    const windowWidth = 2.4;
    const windowHeight = 3.1;
    const windowDepthOffset = 0.05; // sit just inside the room
    const sillHeight = 0.9;
    const frameThickness = 0.1;
    const frameDepth = 0.12;
    const mullionThickness = 0.05;

    const frameMat = new MeshStandardMaterial({
        color: 0xd4d7dd,
        roughness: 0.5,
        metalness: 0.1
    });

    const glassMat = new MeshStandardMaterial({
        color: 0xa0c0ff,
        transparent: true,
        opacity: 0.22,
        roughness: 0.15,
        metalness: 0.6,
        side: DoubleSide
    });

    // Positions for two windows, left and right of the fireplace
    const positions = [
        new Vector3(-6.0, sillHeight + windowHeight / 2, backWallZ + windowDepthOffset),
        new Vector3(6.0, sillHeight + windowHeight / 2, backWallZ + windowDepthOffset)
    ];

    positions.forEach((pos) => {
        const winGroup = new Group();
        winGroup.position.copy(pos);

        // Outer frame as four slim pieces to leave the pane open
        const halfW = windowWidth / 2;
        const halfH = windowHeight / 2;

        const vertical = new BoxGeometry(frameThickness, windowHeight, frameDepth);
        const horizontal = new BoxGeometry(windowWidth, frameThickness, frameDepth);

        const leftFrame = new Mesh(vertical, frameMat);
        leftFrame.position.set(-halfW + frameThickness / 2, 0, 0);
        winGroup.add(leftFrame);

        const rightFrame = new Mesh(vertical, frameMat);
        rightFrame.position.set(halfW - frameThickness / 2, 0, 0);
        winGroup.add(rightFrame);

        const topFrame = new Mesh(horizontal, frameMat);
        topFrame.position.set(0, halfH - frameThickness / 2, 0);
        winGroup.add(topFrame);

        const bottomFrame = new Mesh(horizontal, frameMat);
        bottomFrame.position.set(0, -halfH + frameThickness / 2, 0);
        winGroup.add(bottomFrame);

        // Glass plane, slightly inset
        const glass = new Mesh(
            new PlaneGeometry(windowWidth - frameThickness * 1.5, windowHeight - frameThickness * 1.5),
            glassMat
        );
        glass.position.z = -frameThickness * 0.15;
        winGroup.add(glass);

        // Mullions: 3x2 panes (2 vertical bars, 1 horizontal)
        const cols = 3;
        const rows = 2;
        const paneWidth = (windowWidth - frameThickness * 2) / cols;
        const paneHeight = (windowHeight - frameThickness * 2) / rows;

        // Vertical mullions between columns
        for (let i = 1; i < cols; i++) {
            const x = -windowWidth / 2 + frameThickness + i * paneWidth;
            const vert = new Mesh(
                new BoxGeometry(mullionThickness, windowHeight - frameThickness * 2, frameThickness * 0.7),
                frameMat
            );
            vert.position.set(x, 0, 0);
            winGroup.add(vert);
        }

        // Horizontal mullions between rows
        for (let j = 1; j < rows; j++) {
            const y = -windowHeight / 2 + frameThickness + j * paneHeight;
            const horiz = new Mesh(
                new BoxGeometry(windowWidth - frameThickness * 2, mullionThickness, frameThickness * 0.7),
                frameMat
            );
            horiz.position.set(0, y, 0);
            winGroup.add(horiz);
        }

        // Optional: subtle cool "moonlight" glow from the window
        const sill = new Mesh(
            new BoxGeometry(windowWidth * 1.05, 0.18, 0.4),
            new MeshStandardMaterial({
                color: 0xc0c4cf,
                roughness: 0.9,
                metalness: 0.15
            })
        );
        sill.position.set(0, -windowHeight / 2 - 0.05, 0.1);
        winGroup.add(sill);

        windows.push(winGroup);
    });

    return windows;
}

function buildLogFlames(logMeshes) {
    const flames = [];
    const tip = new Vector3();
    logMeshes.forEach((log) => {
        tip.set(0, 0.7, 0).applyMatrix4(log.matrixWorld);
        const flame = buildFirePlane({
            width: 0.7,
            height: 1.5,
            fireMin: new Vector2(0.2, 0.0),
            fireMax: new Vector2(0.8, 0.9),
            alphaScale: 0.6,
            intensityCap: 0.75,
            coneBoost: 0.18,
            coneSpread: 0.42,
            roundCenter: new Vector2(0.5, 0.05),
            roundScale: new Vector2(0.85, 0.55),
            baseParams: new Vector2(0.6, 0.85),
            fadeTopStart: 0.65,
            fadeTopEnd: 0.9
        });
        flame.position.copy(tip);
        flame.position.y -= 0.1;
        flame.position.z += 0.05;
        flames.push(flame);
    });
    return flames;
}

function buildLogSideFlames(logMeshes, centerTarget = new Vector3(0, 0.9, 0)) {
    const flames = [];
    const offset = new Vector3();
    const normalDir = new Vector3();
    const angles = [Math.PI * 0.5, -Math.PI * 0.5];
    const basis = new Matrix3();

    logMeshes.forEach((log) => {
        basis.setFromMatrix4(log.matrixWorld);
        angles.forEach((a) => {
            const radius = 0.18;
            offset.set(Math.cos(a) * radius, 0.55, Math.sin(a) * radius);
            const worldPos = offset.clone().applyMatrix4(log.matrixWorld);

            // Push the flame outward along the transformed normal so it sits on the surface.
            normalDir.set(Math.cos(a), 0, Math.sin(a)).applyMatrix3(basis).normalize();
            worldPos.add(normalDir.clone().multiplyScalar(0.05));

            const flame = buildFirePlane({
                width: 0.6,
                height: 1.0,
                fireMin: new Vector2(0.18, 0.0),
                fireMax: new Vector2(0.82, 0.85),
                alphaScale: 0.5,
                intensityCap: 0.65,
                coneBoost: 0.16,
                coneSpread: 0.4,
                roundCenter: new Vector2(0.5, 0.08),
                roundScale: new Vector2(0.9, 0.5),
                baseParams: new Vector2(0.55, 0.8),
                fadeTopStart: 0.6,
                fadeTopEnd: 0.85,
                fadeBottomStart: 0.0,
                fadeBottomEnd: 0.08
            });
            flame.position.copy(worldPos);
            flame.userData.lookAtTarget = centerTarget;
            flames.push(flame);
        });
    });

    return flames;
}

function createCrackleAudio() {
    let ctx = null;
    let crackleTimeout = null;
    let rumble = null;

    function start() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (ctx.state === "suspended") {
            ctx.resume();
        }
        if (!rumble) {
            rumble = startRumble();
        }
        if (!crackleTimeout) {
            scheduleCrackle();
        }
    }

    function scheduleCrackle() {
        const interval = 140 + Math.random() * 380; // jittered timing
        crackleTimeout = setTimeout(() => {
            spawnCrackle();
            scheduleCrackle();
        }, interval);
    }

    function spawnCrackle() {
        if (!ctx) return;
        const duration = 0.04 + Math.random() * 0.08;
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const decay = 1 - i / data.length;
            data[i] = (Math.random() * 2 - 1) * decay * 0.5;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 900 + Math.random() * 1100;

        const gain = ctx.createGain();
        gain.gain.value = 0.08 + Math.random() * 0.09;

        noise.connect(filter).connect(gain).connect(ctx.destination);
        noise.start();
        noise.stop(ctx.currentTime + duration + 0.02);
    }

    function startRumble() {
        const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            // Low, slowly changing noise
            const t = i / data.length;
            const slowWobble = Math.sin(t * Math.PI * 2) * 0.03;
            data[i] = (Math.random() * 2 - 1) * 0.12 + slowWobble;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 450;

        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 420;
        band.Q.value = 1.2;

        const gain = ctx.createGain();
        gain.gain.value = 0.5;

        // Gentle amplitude wobble to keep it alive.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.28;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.15;
        lfo.connect(lfoGain).connect(gain.gain);
        lfo.start();

        source.connect(filter).connect(band).connect(gain).connect(ctx.destination);
        source.start();

        return { source, lfo };
    }

    function stop() {
        if (crackleTimeout) {
            clearTimeout(crackleTimeout);
            crackleTimeout = null;
        }
        if (rumble) {
            try { rumble.source.stop(); } catch (e) {}
            try { rumble.lfo.stop(); } catch (e) {}
            rumble = null;
        }
        if (ctx && ctx.state === "running") {
            ctx.suspend();
        }
    }

    return { start, stop };
}

function buildFirePlane(options = {}) {
    const {
        width = 1.9,
        height = 2.6,
        fireMin = new Vector2(0.18, 0.0),
        fireMax = new Vector2(0.82, 0.95),
        alphaScale = 0.5,
        intensityCap = 0.9,
        coneBoost = 0.28,
        coneSpread = 0.55,
        roundCenter = new Vector2(0.5, 0.05),
        roundScale = new Vector2(1.0, 0.6),
        baseParams = new Vector2(0.7, 0.7),
        fadeTopStart = 0.9,
        fadeTopEnd = 1.05,
        fadeBottomStart = 0.0,
        fadeBottomEnd = 0.12
    } = options;

    const geometry = new PlaneGeometry(width, height, 1, 1);
    const material = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
            u_time: { value: 0 },
            u_resolution: { value: new Vector2(640, 480) },
            u_fireMin: { value: fireMin.clone() },
            u_fireMax: { value: fireMax.clone() },
            u_alphaScale: { value: alphaScale },
            u_intensityCap: { value: intensityCap },
            u_coneBoost: { value: coneBoost },
            u_coneSpread: { value: coneSpread },
            u_roundCenter: { value: roundCenter.clone() },
            u_roundScale: { value: roundScale.clone() },
            u_baseParams: { value: baseParams.clone() },
            u_fadeTopStart: { value: fadeTopStart },
            u_fadeTopEnd: { value: fadeTopEnd },
            u_fadeBottomStart: { value: fadeBottomStart },
            u_fadeBottomEnd: { value: fadeBottomEnd }
        },
        vertexShader: `
            varying vec2 v_uv;
            void main() {
                v_uv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            precision mediump float;
            varying vec2 v_uv;
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec2 u_fireMin;
            uniform vec2 u_fireMax;
            uniform float u_alphaScale;
            uniform float u_intensityCap;
            uniform float u_coneBoost;
            uniform float u_coneSpread;
            uniform vec2 u_roundCenter;
            uniform vec2 u_roundScale;
            uniform vec2 u_baseParams;
            uniform float u_fadeTopStart;
            uniform float u_fadeTopEnd;
            uniform float u_fadeBottomStart;
            uniform float u_fadeBottomEnd;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
            }

            float fbm(vec2 p) {
                float v = 0.0;
                float amp = 0.5;
                for (int i = 0; i < 4; i++) {
                    v += amp * noise(p);
                    p *= 2.0;
                    amp *= 0.55;
                }
                return v;
            }

            void main() {
                vec2 uv = v_uv;
                vec2 fireMin = u_fireMin;
                vec2 fireMax = u_fireMax;

                if (uv.x < fireMin.x || uv.x > fireMax.x || uv.y < fireMin.y || uv.y > fireMax.y) {
                    gl_FragColor = vec4(0.0);
                    return;
                }

                vec2 fireUV = (uv - fireMin) / (fireMax - fireMin);
                vec2 resScale = u_resolution / min(u_resolution.x, u_resolution.y);

                float t = u_time;
                vec2 flow = fireUV * vec2(1.0, 1.35);
                flow.y += t * 0.65;
                flow.x += sin(fireUV.y * 8.0 + t * 1.6) * 0.12;

                float body = fbm(flow * 3.0 * resScale + vec2(0.0, t * 0.9));
                float wisps = fbm(fireUV * 8.5 * resScale + vec2(t * 2.5, -t * 2.1));
                float base = u_baseParams.x - fireUV.y * u_baseParams.y;

                vec2 coneCenter = vec2(0.5, -0.05);
                float cone = smoothstep(0.2, 0.0, length((fireUV - coneCenter) * vec2(0.9, 1.6)));
                float edgeTaper = smoothstep(0.0, 0.2, abs(fireUV.x - 0.5));

                float intensity = base + body * 0.75 + wisps * 0.22;
                intensity *= mix(0.85, 0.55, edgeTaper);
                intensity += cone * u_coneBoost;
                intensity = clamp(intensity, 0.0, u_intensityCap);

                vec3 deepRed = vec3(0.35, 0.07, 0.05);
                vec3 ember = vec3(0.85, 0.25, 0.08);
                vec3 orange = vec3(1.0, 0.55, 0.15);
                vec3 yellow = vec3(1.0, 0.86, 0.25);
                vec3 whiteHot = vec3(1.0, 0.97, 0.86);

                float t1 = smoothstep(0.05, 0.45, intensity);
                float t2 = smoothstep(0.3, 0.7, intensity);
                float t3 = smoothstep(0.55, 0.95, intensity);

                vec3 color = mix(deepRed, ember, t1);
                color = mix(color, orange, t2);
                color = mix(color, yellow, t3);
                color = mix(color, whiteHot, smoothstep(0.75, 1.2, intensity));

                float smoke = smoothstep(0.6, 1.0, fireUV.y);
                color *= 1.0 - smoke * 0.35;

                float flicker = 0.035 * sin(t * 6.0) + 0.045 * sin(t * 11.0);
                color *= 1.0 + flicker;

                // Cone-shaped alpha so it rises from a point near the logs.
                float coneMask = 1.0 - smoothstep(0.0, u_coneSpread, abs(fireUV.x - 0.5) / (fireUV.y + 0.1));
                float roundMask = smoothstep(1.2, 0.35, length((fireUV - u_roundCenter) * u_roundScale));

                float fadeTop = 1.0 - smoothstep(u_fadeTopStart, u_fadeTopEnd, uv.y);
                float fadeBottom = smoothstep(u_fadeBottomStart, u_fadeBottomEnd, uv.y);
                float fadeSides = smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x);
                float alpha = fadeTop * fadeBottom * fadeSides * coneMask * roundMask * u_alphaScale;
                gl_FragColor = vec4(color, alpha);
            }
        `
    });

    return new Mesh(geometry, material);
}
