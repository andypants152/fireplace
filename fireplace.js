document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("fire-canvas");
    if (!window.THREE || !canvas) {
        console.error("three.js or canvas missing.");
        return;
    }

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new THREE.Color(0x0b0d13), 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 1.6, 6);
    camera.lookAt(0, 1, 0);

    scene.add(new THREE.AmbientLight(0x705040, 0.65));
    const fireLight = new THREE.PointLight(0xffaa66, 1.6, 12, 2);
    fireLight.position.set(0, 1.1, 1.2);
    scene.add(fireLight);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 10),
        new THREE.MeshStandardMaterial({ color: 0x0f1016, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    scene.add(floor);

    const fireplace = buildFireplace();
    scene.add(fireplace);

    const logLayout = "teepee"; // teepee | cabin
    const logs = buildLogs(logLayout);
    logs.position.set(0, -0.6, 0.2);
    scene.add(logs);

    const firePlane = buildFirePlane();
    firePlane.position.set(0, 0.35, -0.55);
    scene.add(firePlane);

    const clock = new THREE.Clock();

    function resize() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const needsResize = canvas.width !== width || canvas.height !== height;
        if (needsResize) {
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            firePlane.material.uniforms.u_resolution.value.set(width, height);
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        resize();
        const t = clock.getElapsedTime();
        firePlane.material.uniforms.u_time.value = t;
        fireLight.intensity = 1.35 + Math.sin(t * 6.0) * 0.15 + Math.sin(t * 11.0) * 0.1;
        renderer.render(scene, camera);
    }

    resize();
    animate();
});

function buildFireplace() {
    const group = new THREE.Group();

    const brick = new THREE.MeshStandardMaterial({
        color: 0x7a4233,
        roughness: 0.9,
        metalness: 0.05
    });
    const stone = new THREE.MeshStandardMaterial({
        color: 0x1b1c23,
        roughness: 0.8,
        metalness: 0.02
    });

    const hearth = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.5, 2.2), brick);
    hearth.position.set(0, -1.25, 0);
    group.add(hearth);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.2, 2.2), brick);
    left.position.set(-3.05, 0.2, 0);
    group.add(left);

    const right = left.clone();
    right.position.x = 3.05;
    group.add(right);

    const top = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.6, 2.4), brick);
    top.position.set(0, 2.1, 0);
    group.add(top);

    const back = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.2, 0.35), stone);
    back.position.set(0, 0.4, -1.1);
    group.add(back);

    const innerShelf = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.35, 2.0), stone);
    innerShelf.position.set(0, -0.8, 0.1);
    group.add(innerShelf);

    return group;
}

function buildLogs(layout = "teepee") {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
        color: 0x4a2a17,
        roughness: 0.8,
        metalness: 0.02
    });

    const geo = new THREE.CylinderGeometry(0.22, 0.25, 3, 16, 1, false);

    function addLog(position, rotation) {
        const log = new THREE.Mesh(geo, mat);
        log.position.copy(position);
        log.rotation.set(rotation.x, rotation.y, rotation.z);
        group.add(log);
    }

    if (layout === "cabin") {
        const layerGap = 0.35;
        const offset = 0.55;

        // Bottom layer
        addLog(
            new THREE.Vector3(0, -0.35, offset),
            new THREE.Vector3(0, 0, Math.PI / 2)
        );
        addLog(
            new THREE.Vector3(0, -0.35, -offset),
            new THREE.Vector3(0, 0, Math.PI / 2)
        );

        // Top layer
        addLog(
            new THREE.Vector3(offset, layerGap - 0.35, 0),
            new THREE.Vector3(Math.PI / 2, 0, 0)
        );
        addLog(
            new THREE.Vector3(-offset, layerGap - 0.35, 0),
            new THREE.Vector3(Math.PI / 2, 0, 0)
        );
    } else {
        const tilt = Math.PI / 5;
        const spread = 0.65;

        addLog(
            new THREE.Vector3(-spread, -0.2, 0),
            new THREE.Vector3(Math.PI / 22, 0, -tilt)
        );
        addLog(
            new THREE.Vector3(spread, -0.25, 0),
            new THREE.Vector3(-Math.PI / 18, 0, tilt)
        );
        addLog(
            new THREE.Vector3(0, -0.18, -spread * 0.8),
            new THREE.Vector3(tilt, 0, 0)
        );
        addLog(
            new THREE.Vector3(0, -0.22, spread * 0.85),
            new THREE.Vector3(-tilt * 0.9, 0, 0)
        );
    }

    return group;
}

function buildFirePlane() {
    const geometry = new THREE.PlaneGeometry(3.1, 2.8, 1, 1);
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            u_time: { value: 0 },
            u_resolution: { value: new THREE.Vector2(640, 480) }
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
                vec2 fireMin = vec2(0.08, 0.0);
                vec2 fireMax = vec2(0.92, 0.92);

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

                float body = fbm(flow * 3.4 * resScale + vec2(0.0, t * 0.9));
                float wisps = fbm(fireUV * 10.0 * resScale + vec2(t * 2.8, -t * 2.2));
                float base = 1.15 - fireUV.y;

                vec2 coneCenter = vec2(0.5, -0.05);
                float cone = smoothstep(0.2, 0.0, length((fireUV - coneCenter) * vec2(0.9, 1.6)));
                float edgeTaper = smoothstep(0.0, 0.2, abs(fireUV.x - 0.5));

                float intensity = base + body * 0.9 + wisps * 0.3;
                intensity *= mix(1.0, 0.6, edgeTaper);
                intensity += cone * 0.5;
                intensity = clamp(intensity, 0.0, 1.35);

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

                float flicker = 0.05 * sin(t * 6.0) + 0.07 * sin(t * 11.0);
                color *= 1.0 + flicker;

                float fadeTop = 1.0 - smoothstep(0.82, 1.0, uv.y);
                float fadeBottom = smoothstep(0.0, 0.08, uv.y);
                float fadeSides = smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x);
                float alpha = fadeTop * fadeBottom * fadeSides;
                gl_FragColor = vec4(color, alpha);
            }
        `
    });

    return new THREE.Mesh(geometry, material);
}
