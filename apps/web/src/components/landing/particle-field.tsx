"use client";

export default function ParticleField() {
  return (
    <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,_rgba(108,99,255,0.35),_transparent_55%),_radial-gradient(circle_at_bottom,_rgba(0,212,170,0.3),_transparent_55%)] motion-safe:animate-[pulse_8s_ease-in-out_infinite]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(15,23,42,0)_0,_rgba(15,23,42,0.85)_70%)]" />
    </div>
  );
}
