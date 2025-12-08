import {
    AmbientLight,
    BoxGeometry,
    Clock,
    Color,
    CylinderGeometry,
    Matrix3,
    DoubleSide,
    Group,
    Mesh,
    MeshStandardMaterial,
    PerspectiveCamera,
    PlaneGeometry,
    PointLight,
    Scene,
    ShaderMaterial,
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

    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 2.2, 9);
    camera.lookAt(0, 1, 0);

    scene.add(new AmbientLight(0x705040, 0.65));
    const fireLight = new PointLight(0xffaa66, 1.6, 12, 2);
    fireLight.position.set(0, 1.1, 1.2);
    scene.add(fireLight);

    const floor = new Mesh(
        new PlaneGeometry(14, 10),
        new MeshStandardMaterial({ color: 0x0f1016, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    scene.add(floor);

    const fireplace = buildFireplace();
    scene.add(fireplace);

    const logLayout = "teepee"; // teepee | cabin
    const { group: logs, logMeshes } = buildLogs(logLayout);
    logs.position.set(0, 0.15, 0.2);
    scene.add(logs);
    logs.updateMatrixWorld(true);

    const firePlanes = [];

    const firePlane = buildFirePlane();
    firePlane.position.set(0, 0.18, -0.35);
    firePlanes.push(firePlane);
    scene.add(firePlane);

    const logFlames = buildLogFlames(logMeshes);
    logFlames.forEach((flame) => {
        firePlanes.push(flame);
        scene.add(flame);
    });

    const sideFlames = buildLogSideFlames(logMeshes);
    sideFlames.forEach((flame) => {
        firePlanes.push(flame);
        scene.add(flame);
    });

    const clock = new Clock();
    const crackle = createCrackleAudio();
    let audioStarted = false;

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
        firePlanes.forEach((fp) => {
            fp.material.uniforms.u_time.value = t;
            const target = fp.userData.lookAtTarget || camera.position;
            fp.lookAt(target);
        });
        fireLight.intensity = 1.35 + Math.sin(t * 6.0) * 0.15 + Math.sin(t * 11.0) * 0.1;
        renderer.render(scene, camera);
    }

    resize();
    animate();

    // Start audio on first interaction to satisfy autoplay policies.
    window.addEventListener(
        "pointerdown",
        () => {
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

function buildLogSideFlames(logMeshes) {
    const flames = [];
    const offset = new Vector3();
    const normalDir = new Vector3();
    const angles = [Math.PI * 0.5, -Math.PI * 0.5];
    const centerTarget = new Vector3(0, 0.9, 0);
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
            data[i] = (Math.random() * 2 - 1) * 0.08 + slowWobble;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 350;

        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 320;
        band.Q.value = 0.8;

        const gain = ctx.createGain();
        gain.gain.value = 0.25;

        // Gentle amplitude wobble to keep it alive.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.28;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.1;
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
