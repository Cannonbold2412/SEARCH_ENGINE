"use client";

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 800;

function Particles() {
  const mesh = useRef<THREE.Points>(null);
  const mouseRef = useRef(new THREE.Vector2(0, 0));
  const { viewport } = useThree();

  const [positions, colors, originalPositions] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const orig = new Float32Array(PARTICLE_COUNT * 3);

    const violet = new THREE.Color("#6C63FF");
    const teal = new THREE.Color("#00D4AA");
    const white = new THREE.Color("#F0F0FF");

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const x = (Math.random() - 0.5) * 14;
      const y = (Math.random() - 0.5) * 8;
      const z = (Math.random() - 0.5) * 6;

      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
      orig[i3] = x;
      orig[i3 + 1] = y;
      orig[i3 + 2] = z;

      const r = Math.random();
      const color = r < 0.4 ? violet : r < 0.7 ? teal : white;
      col[i3] = color.r;
      col[i3 + 1] = color.g;
      col[i3 + 2] = color.b;
    }
    return [pos, col, orig];
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  useFrame((state) => {
    if (!mesh.current) return;
    const geo = mesh.current.geometry;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const time = state.clock.elapsedTime;

    const mx = mouseRef.current.x * viewport.width * 0.5;
    const my = mouseRef.current.y * viewport.height * 0.5;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const ox = originalPositions[i3];
      const oy = originalPositions[i3 + 1];
      const oz = originalPositions[i3 + 2];

      const dx = Math.sin(time * 0.3 + i * 0.01) * 0.02;
      const dy = Math.cos(time * 0.2 + i * 0.015) * 0.02;

      const distX = arr[i3] - mx;
      const distY = arr[i3 + 1] - my;
      const dist = Math.sqrt(distX * distX + distY * distY);
      const repelRadius = 2;
      let repelX = 0,
        repelY = 0;
      if (dist < repelRadius && dist > 0.01) {
        const force = (1 - dist / repelRadius) * 0.8;
        repelX = (distX / dist) * force;
        repelY = (distY / dist) * force;
      }

      arr[i3] += (ox + dx + repelX - arr[i3]) * 0.04;
      arr[i3 + 1] += (oy + dy + repelY - arr[i3 + 1]) * 0.04;
      arr[i3 + 2] += (oz - arr[i3 + 2]) * 0.02;
    }
    posAttr.needsUpdate = true;

    mesh.current.rotation.y = time * 0.0005;
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Lines() {
  const lineRef = useRef<THREE.LineSegments>(null);

  useFrame((state) => {
    if (!lineRef.current) return;

    const scene = state.scene;
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points | undefined;
    if (!points) return;

    const posAttr = points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const linePositions: number[] = [];
    const maxDist = 0.8;
    const maxLines = 300;
    let lineCount = 0;

    for (let i = 0; i < Math.min(PARTICLE_COUNT, 200) && lineCount < maxLines; i++) {
      for (let j = i + 1; j < Math.min(PARTICLE_COUNT, 200) && lineCount < maxLines; j++) {
        const i3 = i * 3;
        const j3 = j * 3;
        const dx = arr[i3] - arr[j3];
        const dy = arr[i3 + 1] - arr[j3 + 1];
        const dz = arr[i3 + 2] - arr[j3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < maxDist) {
          linePositions.push(arr[i3], arr[i3 + 1], arr[i3 + 2]);
          linePositions.push(arr[j3], arr[j3 + 1], arr[j3 + 2]);
          lineCount++;
        }
      }
    }

    const geo = lineRef.current.geometry;
    const newArr = new Float32Array(linePositions);
    geo.setAttribute("position", new THREE.BufferAttribute(newArr, 3));
    geo.computeBoundingSphere();
  });

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry />
      <lineBasicMaterial color="#6C63FF" transparent opacity={0.12} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}

export default function ParticleField() {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 1.5]} gl={{ antialias: false, alpha: true }} style={{ background: "transparent" }}>
        <Particles />
        <Lines />
      </Canvas>
    </div>
  );
}
