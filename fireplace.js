import {
    AmbientLight,
    BoxGeometry,
    BufferGeometry,
    Clock,
    Color,
    ConeGeometry,
    CylinderGeometry,
    Float32BufferAttribute,
    Matrix3,
    DoubleSide,
    Group,
    ACESFilmicToneMapping,
    Mesh,
    MeshStandardMaterial,
    Points,
    PointsMaterial,
    PerspectiveCamera,
    PlaneGeometry,
    PointLight,
    Scene,
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

    const renderer = new WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new Color(0x0b0d13), 1);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

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

    scene.add(new AmbientLight(0xffffff, 0.55));
    const fillLight = new PointLight(0xf4ead9, 2.5, 40, 2);
    fillLight.position.set(0, 4.8, 12.5);
    scene.add(fillLight);
    const fireLight = new PointLight(0xffaa66, 1.6, 12, 2);
    fireLight.position.set(0, 1.1, 1.2 + fireplaceZOffset);
    scene.add(fireLight);

    const floor = new Mesh(
        new PlaneGeometry(14, 10),
        new MeshStandardMaterial({ color: 0x14171e, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    scene.add(floor);

    const fireplace = buildFireplace();
    fireplace.position.z = fireplaceZOffset;
    scene.add(fireplace);

    const stockings = buildMantelStockings(fireplace);
    fireplace.add(stockings);

    const tree = buildTree();
    tree.scale.setScalar(1.5);
    tree.position.set(4.2, -1.2, 2.2);
    scene.add(tree);
    tree.updateMatrixWorld(true);
    const treeLights = buildTreeLights(tree);
    scene.add(treeLights);

    const logLayout = "teepee"; // teepee | cabin
    const { group: logs, logMeshes } = buildLogs(logLayout);
    logs.position.set(0, 0.15, 0.2 + fireplaceZOffset);
    scene.add(logs);
    logs.updateMatrixWorld(true);

    const firePlanes = [];
    let snow = null;
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

    const clock = new Clock();
    const crackle = createCrackleAudio();
    let audioStarted = false;
    let lastTime = 0;

    function updatePointerFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        pointer.set(x, y);
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

    function resize() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const needsResize = canvas.width !== width || canvas.height !== height;
        if (needsResize) {
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
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
            const spreadX = snow.userData.spreadX;
            const spreadY = snow.userData.spreadY;
            const spreadZ = snow.userData.spreadZ;

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
                    x = (Math.random() - 0.5) * spreadX;
                    z = (Math.random() - 0.2) * spreadZ - 2;
                }

                positions.array[i3 + 0] = x;
                positions.array[i3 + 1] = y;
                positions.array[i3 + 2] = z;
            }

            positions.needsUpdate = true;
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
    window.addEventListener(
        "pointerdown",
        () => {
            requestGyroAccess();
            if (!audioStarted) {
                crackle.start();
                audioStarted = true;
            }
        },
        { once: true }
    );
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

    // Snow volume: a loose box in front of the camera / fireplace
    const spreadX = 10;
    const spreadY = 7;
    const spreadZ = 8;

    for (let i = 0; i < SNOW_COUNT; i++) {
        const i3 = i * 3;
        positions.array[i3 + 0] = (Math.random() - 0.5) * spreadX; // x
        positions.array[i3 + 1] = Math.random() * spreadY + 1.5; // y above floor
        positions.array[i3 + 2] = (Math.random() - 0.2) * spreadZ - 2; // z in front of fireplace

        // Slight speed variation per flake
        speeds[i] = 0.3 + Math.random() * 0.4;
    }

    geometry.setAttribute("position", positions);

    const material = new PointsMaterial({
        size: 0.06,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
    });

    const snow = new Points(geometry, material);
    snow.userData.speeds = speeds;
    snow.userData.spreadX = spreadX;
    snow.userData.spreadY = spreadY;
    snow.userData.spreadZ = spreadZ;

    return snow;
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

    return { start };
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
