import React, { useState, useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { MapControls, Html, Stars, Line, Billboard, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { EffectComposer, Bloom, Noise, Glitch } from '@react-three/postprocessing';
import { GlitchMode } from 'postprocessing'; 
import { locations as originalLocations } from './parsedLocations';
import YouTube from 'react-youtube';
import './index.css';

const locations = originalLocations || [];

// --- 設定 ---
const MAP_CONFIG = {
  centerLat: 36.5,
  centerLng: 136.0,
  scale: 3.5 
};

const categoryColors = {
  "祭": "#ff007f", "雪": "#00ffff", "食": "#ffaa00", "緑": "#00ff44",
  "田舎": "#bbaaff", "都市": "#0088ff", "水": "#00d4ff", "火": "#ff4400",
  "伝統": "#ffcc00", "動物": "#ff88aa", "夜": "#8800ff", "神社": "#ff3333",
  "寺": "#cc88ff", "島": "#00eeff", "城": "#aaff00", "温泉": "#ff5588",
  "デフォルト": "#00ffff"
};

const categoryIcons = {
  "": "🌐", "祭": "🏮", "雪": "❄️", "食": "🍣", "緑": "🌲",
  "田舎": "🌾", "都市": "🏙️", "水": "💧", "火": "🔥",
  "伝統": "⛩️", "動物": "🦌", "夜": "🌃", "神社": "⛩️",
  "寺": "🏯", "島": "🏝️", "城": "🏯", "温泉": "♨️",
  "デフォルト": "📍"
};

// --- ユーティリティ ---
function pointInPolygon(point, vs) {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

const convertGeoToVector = (lat, lng, applyScatter = false) => {
  // Use fixed center latitude cosine for consistent shape across all countries
  const latRads = MAP_CONFIG.centerLat * (Math.PI / 180);
  let deltaLng = (lng - MAP_CONFIG.centerLng) * Math.cos(latRads);
  let deltaLat = lat - MAP_CONFIG.centerLat;

  // Compress ONLY overseas locations (dist > 15 covers all of Japan + nearby)
  const dist = Math.sqrt(deltaLng * deltaLng + deltaLat * deltaLat);
  if (dist > 15) {
    const excess = dist - 15;
    const compressedDist = 15 + excess / (1 + excess * 0.08);
    const ratio = compressedDist / dist;
    deltaLng *= ratio;
    deltaLat *= ratio;
  }

  let x = deltaLng * MAP_CONFIG.scale;
  let z = -deltaLat * MAP_CONFIG.scale;

  // Scatter densely packed points (reduced radius for better selectability)
  if (applyScatter) {
    const pseudoRandomX = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453;
    const randX = (pseudoRandomX - Math.floor(pseudoRandomX)) - 0.5;
    const pseudoRandomZ = Math.sin(lng * 12.9898 + lat * 78.233) * 43758.5453;
    const randZ = (pseudoRandomZ - Math.floor(pseudoRandomZ)) - 0.5;
    x += randX * 1.5;
    z += randZ * 1.5;
  }

  return [x, 0, z];
};

const getThumbnailUrl = (videoUrl) => {
  if (!videoUrl) return "";
  const parts = videoUrl.split('/');
  const id = parts[parts.length - 1];
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
};

const createCircleTexture = () => {
   const canvas = document.createElement('canvas');
   canvas.width = 32; canvas.height = 32;
   const ctx = canvas.getContext('2d');
   const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
   grad.addColorStop(0, 'rgba(255,255,255,1)');
   grad.addColorStop(1, 'rgba(255,255,255,0)');
   ctx.fillStyle = grad;
   ctx.fillRect(0,0,32,32);
   return new THREE.CanvasTexture(canvas);
};
const circleTexture = createCircleTexture();

const mapShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
          time: { value: 0 },
          baseColor: { value: new THREE.Color("#008888") },
          effectType: { value: 0.0 }, // 0: default, 1: fire, 2: water, 3: snow, 4: festival
          particleOpacity: { value: 0.8 }
      },
      vertexShader: `
          uniform float time;
          uniform float effectType;
          attribute float aPhase;
          
          void main() {
              vec3 pos = position;
              float pSize = 3.5;

              if (effectType > 0.5 && effectType < 1.5) {
                  // Fire: particles moving up, breaking shape a bit
                  float fireT = time * 2.0 + aPhase * 20.0;
                  pos.y += fract(fireT) * clamp(aPhase, 0.0, 1.0) * 1.5; 
                  pos.x += sin(fireT * 3.0) * 0.05;
                  pSize = 5.0;
              } else if (effectType > 1.5 && effectType < 2.5) {
                  // Water: smooth undulating waves
                  pos.y += sin(pos.x * 2.0 + time * 3.0) * 0.2 + cos(pos.z * 1.5 + time * 2.0) * 0.2;
                  pSize = 4.0;
              } else if (effectType > 2.5 && effectType < 3.5) {
                  // Snow: soft rising, expanding occasionally
                  pos.y += mod(time * 0.3 + aPhase, 1.0) * 0.5;
                  pSize = 3.0 + step(0.9, sin(time * 5.0 + aPhase * 10.0)) * 3.0;
              } else if (effectType > 3.5 && effectType < 4.5) {
                  // Festival: bursting 
                  float beat = fract(time * 2.0);
                  pos += normalize(vec3(sin(aPhase*100.0), 1.0, cos(aPhase*100.0))) * beat * 0.2;
                  pSize = 4.5 * (1.0 - beat + 0.5);
              }

              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              gl_PointSize = pSize * (15.0 / -mvPosition.z);
          }
      `,
      fragmentShader: `
          uniform vec3 baseColor;
          uniform float particleOpacity;
          void main() {
              vec2 xy = gl_PointCoord.xy - vec2(0.5);
              float ll = length(xy);
              if(ll > 0.5) discard;
              float alpha = 1.0 - (ll * 2.0);
              gl_FragColor = vec4(baseColor, alpha * particleOpacity);
          }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
});

// --- カメラドリフト機能 ---
const CameraDrift = ({ hoveredLocation, isIdle }) => {
  const { controls, camera } = useThree();
  const isUserControlling = useRef(false);
  const randomLocRef = useRef(null);
  const zoomDelay = useRef(0);
  
  useEffect(() => {
    if (isIdle && locations.length > 0 && !hoveredLocation) {
      randomLocRef.current = locations[Math.floor(Math.random() * locations.length)];
      zoomDelay.current = 0;
    } else {
      randomLocRef.current = null;
    }
  }, [isIdle, hoveredLocation]);

  useEffect(() => {
    if (!controls) return;
    const onStart = () => { isUserControlling.current = true; };
    const onEnd = () => { isUserControlling.current = false; };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);
    return () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
    };
  }, [controls]);
  
  useFrame((state, delta) => {
    if (!controls) return;
    if (isUserControlling.current || !isIdle) return;
    
    let targetX = 0;
    let targetZ = 0;
    let activeTarget = null;
    
    if (hoveredLocation) {
      const [hx, hy, hz] = convertGeoToVector(hoveredLocation.lat, hoveredLocation.lng, true);
      targetX = hx;
      targetZ = hz;
      activeTarget = new THREE.Vector3(targetX, 0, targetZ);
    } else if (randomLocRef.current) {
      const [rx, ry, rz] = convertGeoToVector(randomLocRef.current.lat, randomLocRef.current.lng, true);
      targetX = rx;
      targetZ = rz;
      activeTarget = new THREE.Vector3(targetX, 0, targetZ);
    }
    
    if (activeTarget) {
      const oldTarget = controls.target.clone();
      controls.target.lerp(activeTarget, 1 - Math.exp(-2 * delta));
      const diff = controls.target.clone().sub(oldTarget);
      
      // Pan camera keeping angle exactly the same
      camera.position.add(diff);
      
      zoomDelay.current += delta;
      if (zoomDelay.current > 1.0) { // wait before zooming in
        const currentDist = camera.position.distanceTo(controls.target);
        const desiredDist = 12; // zoom level
        if (currentDist > desiredDist + 0.1) {
          const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
          const targetDist = THREE.MathUtils.lerp(currentDist, desiredDist, 1 - Math.exp(-0.8 * delta));
          camera.position.copy(controls.target).add(dir.multiplyScalar(targetDist));
        }
      }
    } else {
      const t = state.clock.elapsedTime * 0.04; 
      targetX = Math.sin(t) * 20;
      targetZ = Math.cos(t * 1.5) * 15;
      const worldTarget = new THREE.Vector3(targetX, 0, targetZ);
      
      const oldTarget = controls.target.clone();
      controls.target.lerp(worldTarget, 1 - Math.exp(-2 * delta));
      const diff = controls.target.clone().sub(oldTarget);
      camera.position.add(diff);
    }
  });
  return null;
};

// --- 時系列エフェクト (Timeline / Neural Link) ---
const TimelineEffect = ({ locations }) => {
  const curvePoints = useMemo(() => {
      const sorted = [...locations].sort((a,b) => a.dateValue - b.dateValue);
      const vectors = sorted.map(loc => {
         // Fix: use applyScatter=true to perfectly align with the actual marker locations
         const [x, y, z] = convertGeoToVector(loc.lat, loc.lng, true);
         return new THREE.Vector3(x, 0.05, z);
      });
      
      const pts = [];
      for(let i=0; i<vectors.length-1; i++) {
         const p1 = vectors[i];
         const p2 = vectors[i+1];
         const dist = p1.distanceTo(p2);
         const mid = p1.clone().lerp(p2, 0.5);
         // Neural link: tight, low arcs
         mid.y += Math.min(dist * 0.15, 2.0); 
         const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
         pts.push(...curve.getPoints(20));
      }
      return pts.map(v => [v.x, v.y, v.z]);
  }, [locations]);

  const [drawCount, setDrawCount] = useState(2);
  
  useFrame(() => {
     setDrawCount(c => Math.min(c + 8, curvePoints.length));
  });

  if (curvePoints.length < 2) return null;
  const drawnPoints = curvePoints.slice(0, drawCount);
  const headPos = drawnPoints[drawnPoints.length - 1];

  return (
      <group>
         <Line points={drawnPoints} color="#00ffff" lineWidth={0.8} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
         {headPos && (
           <mesh position={headPos}>
              <sphereGeometry args={[0.08, 16, 16]} />
              <meshBasicMaterial color="#ffffff" blending={THREE.AdditiveBlending} transparent opacity={1.0} />
           </mesh>
         )}
      </group>
  );
};

// --- 世界地図・アジア領域のシルエット ---
const WorldMapShape = ({ activeLocation, globalCategory }) => {
  const [geometry, setGeometry] = useState(null);
  const pointsRef = useRef();
  const instancedMeshRef = useRef();
  const { camera, pointer, raycaster } = useThree();
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const spheresCount = 40;
  const spheresData = useRef(Array.from({length: spheresCount}, () => ({ scale: 0.01, position: new THREE.Vector3(0, -999, 0) })));
  const sphereIndex = useRef(0);
  const toggle = useRef(0);

  useEffect(() => {
    raycaster.params.Points.threshold = 0.15;
  }, [raycaster]);
  
  useEffect(() => {
    const countries = ['JPN', 'TWN', 'KOR', 'IND'];
    Promise.all(countries.map(c => 
      fetch(`https://raw.githubusercontent.com/johan/world.geo.json/master/countries/${c}.geo.json`)
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
    )).then(datasets => {
      const allPolygons = [];
      datasets.forEach(data => {
        if (!data || !data.features) return;
        data.features.forEach(feature => {
          if (feature.geometry.type === 'Polygon') {
             feature.geometry.coordinates.forEach(coords => {
                 allPolygons.push(coords.map(p => convertGeoToVector(p[1], p[0], false)));
             });
          } else if (feature.geometry.type === 'MultiPolygon') {
             feature.geometry.coordinates.forEach(poly => {
                 poly.forEach(coords => {
                     allPolygons.push(coords.map(p => convertGeoToVector(p[1], p[0], false)));
                 });
             });
          }
        });
      });

      const polysWithBbox = allPolygons.map(poly => {
          let pxMin = Infinity, pxMax = -Infinity, pzMin = Infinity, pzMax = -Infinity;
          const flatPoly = poly.map(p => [p[0], p[2]]); // Map to X and Z for 2D intersection
          flatPoly.forEach(p => {
              if (p[0] < pxMin) pxMin = p[0]; if (p[0] > pxMax) pxMax = p[0];
              if (p[1] < pzMin) pzMin = p[1]; if (p[1] > pzMax) pzMax = p[1];
          });
          return { flatPoly, pxMin, pxMax, pzMin, pzMax };
      });

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      polysWithBbox.forEach(p => {
          if(p.pxMin < minX) minX = p.pxMin;
          if(p.pxMax > maxX) maxX = p.pxMax;
          if(p.pzMin < minZ) minZ = p.pzMin;
          if(p.pzMax > maxZ) maxZ = p.pzMax;
      });

      const newPoints = [];
      const stepSize = 0.2; // Point density grid resolution

      for(let x = minX; x <= maxX; x += stepSize) {
          for(let z = minZ; z <= maxZ; z += stepSize) {
              let inside = false;
              for(let pObj of polysWithBbox) {
                  if (x < pObj.pxMin || x > pObj.pxMax || z < pObj.pzMin || z > pObj.pzMax) continue;
                  if (pointInPolygon([x,z], pObj.flatPoly)) {
                      inside = !inside;
                  }
              }
              if (inside) {
                  // Generate an elegant topological height unevenness 
                  const u = x / 5.0; 
                  const v = z / 5.0;
                  const y = (Math.cos(u * Math.PI) + Math.sin(v * Math.PI)) * 0.5;
                  newPoints.push(x, y, z);
              }
          }
      }

      if (newPoints.length > 0) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(newPoints, 3));
          const phases = new Float32Array(newPoints.length / 3);
          for(let i=0; i<phases.length; i++) phases[i] = Math.random();
          geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
          setGeometry(geo);
      }
    });
  }, []);

  const smoothColor = useMemo(() => new THREE.Color("#008888"), []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const t = state.clock.elapsedTime;
    
    let targetColor = new THREE.Color("#008888");
    let dynOpacity = 0.8;
    let isInstant = false;
    let effType = 0.0;

    let targetCategory = null;
    if (activeLocation && activeLocation.categories && activeLocation.categories.length > 0) {
      targetCategory = activeLocation.categories[0];
    } else if (globalCategory) {
      targetCategory = globalCategory;
    }

    if (targetCategory) {
      const cat = targetCategory;
      if (cat === "火") {
        targetColor.setRGB(1.0, 0.1 + Math.random() * 0.4, 0);
        dynOpacity = 0.5 + Math.random() * 0.5;
        effType = 1.0;
        isInstant = true;
      } else if (cat === "水") {
        targetColor.setHSL(0.55 + Math.sin(t) * 0.05, 1.0, 0.5);
        dynOpacity = 0.4 + Math.sin(t * 2) * 0.4;
        effType = 2.0;
      } else if (cat === "雪") {
        targetColor.setRGB(0.8, 0.9, 1.0);
        dynOpacity = 0.3 + (Math.sin(t * 15) > 0.8 ? 0.7 : 0);
        effType = 3.0;
        isInstant = true;
      } else if (cat === "祭") {
        targetColor.setHSL((t * 0.5) % 1.0, 1.0, 0.5);
        dynOpacity = 0.6 + Math.sin(t * 8) * 0.4;
        effType = 4.0;
        isInstant = true;
      } else {
        targetColor.set(categoryColors[cat] || "#008888");
        dynOpacity = 0.6 + Math.sin(t * 3) * 0.3;
        effType = 0.0;
      }
    }

    if (isInstant) {
      smoothColor.copy(targetColor);
    } else {
      smoothColor.lerp(targetColor, 0.05);
    }

    pointsRef.current.material.uniforms.time.value = t;
    pointsRef.current.material.uniforms.baseColor.value.copy(smoothColor);
    pointsRef.current.material.uniforms.effectType.value = effType;
    pointsRef.current.material.uniforms.particleOpacity.value = dynOpacity;

    // Interactive Raycasting for trail spheres
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObject(pointsRef.current, false);
    const intersect = intersections.length > 0 ? intersections[0] : null;

    toggle.current += state.clock.getDelta(); // actually delta is passed as 2nd arg? state doesn't have it if useFrame just has (state)
    const delta = typeof state.clock.getDelta === 'function' ? 0.016 : 0.016; // approx
    
    // Instead of raw delta, we can just use frame count, but let's approximate
    const timeDelta = 0.016; 
    toggle.current += timeDelta;

    if (toggle.current > 0.02 && intersect !== null) {
        const sData = spheresData.current[sphereIndex.current];
        sData.position.copy(intersect.point);
        // Elevate the sphere slightly above the map points to be prominently visible
        sData.position.y += 0.05; 
        sData.scale = 1.0;
        sphereIndex.current = (sphereIndex.current + 1) % spheresCount;
        toggle.current = 0;
    }

    if (instancedMeshRef.current) {
        for(let i=0; i<spheresCount; i++) {
           const sData = spheresData.current[i];
           sData.scale *= 0.98;
           if (sData.scale < 0.01) sData.scale = 0.01;
           
           dummy.position.copy(sData.position);
           dummy.scale.setScalar(sData.scale);
           dummy.updateMatrix();
           instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
        }
        instancedMeshRef.current.instanceMatrix.needsUpdate = true;
        instancedMeshRef.current.material.color.copy(smoothColor);
    }

  });

  return (
    <group position={[0, 0, -0.2]}>
      {geometry && (
        <points ref={pointsRef} geometry={geometry} material={mapShaderMaterial} />
      )}
      <instancedMesh ref={instancedMeshRef} args={[null, null, spheresCount]} visible={geometry !== null}>
         <sphereGeometry args={[0.2, 16, 16]} />
         <meshBasicMaterial color="#00ffff" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  );
};

// --- ホログラムパネルコンポーネント ---
const HologramPanel = ({ videoUrl, hovered, onSelect, data }) => {
  const thumb = getThumbnailUrl(videoUrl);
  // Fail safe for useLoader
  const texture = useLoader(THREE.TextureLoader, thumb || 'https://via.placeholder.com/1x1/00ffff/000000');
  const meshRef = useRef();
  const materialRef = useRef();

  useFrame((state, delta) => {
    if (meshRef.current) {
      const t = state.clock.getElapsedTime();
      meshRef.current.position.y = 1.6 + Math.sin(t * 1.5) * 0.05;
      const targetScale = hovered ? 1 : 0;
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 1 - Math.exp(-6 * delta));
    }
    if (materialRef.current) {
      const baseOpacity = hovered ? 0.9 : 0;
      materialRef.current.opacity = hovered ? baseOpacity + (Math.random() * 0.15 - 0.075) : 0;
    }
  });

  return (
    <group ref={meshRef}>
      <Billboard follow={true}>
        <mesh 
          raycast={() => null}
        >
          <planeGeometry args={[2.4, 1.35]} />
          <meshBasicMaterial 
            ref={materialRef}
            map={texture}
            transparent={true}
            opacity={0.9} 
            color={hovered ? new THREE.Color("white") : new THREE.Color("#00ffcc")} 
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <Line 
          points={[[-1.2, 0.675, 0], [1.2, 0.675, 0], [1.2, -0.675, 0], [-1.2, -0.675, 0], [-1.2, 0.675, 0]]} 
          color="#00ffff" 
          lineWidth={2} 
          transparent
          opacity={hovered ? 1.0 : 0}
          blending={THREE.AdditiveBlending}
        />
      </Billboard>
    </group>
  );
};

// --- マーカー全体 ---
const LocationMarker = ({ data, onSelect, onHoverChange, isTourActive }) => {
  const [hovered, setHover] = useState(false);
  const position = useMemo(() => convertGeoToVector(data.lat, data.lng, true), [data]);
  const markerGroupRef = useRef();
  const ringGroupRef = useRef();
  const coreRef = useRef();
  const glowRef = useRef();

  // Unique phase per marker so each animates differently
  const phase = useMemo(() => data.id * 1.618033, [data.id]);
  const speeds = useMemo(() => ({
    spin: 0.8 + (data.id % 7) * 0.15,
    bob: 1.5 + (data.id % 5) * 0.4,
    ring1: 0.7 + (data.id % 3) * 0.3,
    ring2: 0.5 + (data.id % 4) * 0.25,
    ring3: 0.9 + (data.id % 6) * 0.2,
    pulse: 2.0 + (data.id % 5) * 0.6,
  }), [data.id]);

  const primaryCat = data.categories && data.categories.length > 0 ? data.categories[0] : "";
  const [currentColor, setCurrentColor] = useState(categoryColors[primaryCat] || categoryColors["デフォルト"]);

  const beamParticlesRef = useRef();
  const [beamData] = useState(() => {
    const pts = new Float32Array(30 * 3);
    const phases = new Float32Array(30);
    for(let i=0; i<30; i++) {
        pts[i*3]   = (Math.random() - 0.5) * 0.2;
        pts[i*3+1] = Math.random() * 3.0;
        pts[i*3+2] = (Math.random() - 0.5) * 0.2;
        phases[i] = Math.random();
    }
    return { pts, phases };
  });

  const beamTargetOp = useRef(0);
  const hoverAmt = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const tPhased = t + phase;

    // Smooth hover interpolation
    const hoverTarget = (hovered || isTourActive) ? 1.0 : 0.0;
    hoverAmt.current = THREE.MathUtils.lerp(hoverAmt.current, hoverTarget, 1 - Math.exp(-6 * delta));
    const h = hoverAmt.current;

    if (markerGroupRef.current) {
      // Unique spin speed per marker
      markerGroupRef.current.rotation.y += delta * speeds.spin;
      // Gentle vertical bob unique to each marker
      markerGroupRef.current.position.y = Math.sin(tPhased * speeds.bob) * 0.08;
      // Scale stays 1.0 always - no ugly blocky scale-up
      const s = 1.0 + h * 0.15; // very subtle scale on hover
      markerGroupRef.current.scale.setScalar(s);
    }

    // Core emissive pulse - intensifies on hover
    if (coreRef.current) {
      const basePulse = 4 + Math.sin(tPhased * speeds.pulse) * 2;
      coreRef.current.emissiveIntensity = basePulse + h * 8;
    }

    // Glow sphere breathing
    if (glowRef.current) {
      const breathe = 0.1 + Math.sin(tPhased * speeds.pulse * 0.7) * 0.05;
      glowRef.current.opacity = breathe + h * 0.25;
    }

    // Beam particles
    if (beamParticlesRef.current) {
      beamTargetOp.current = THREE.MathUtils.lerp(beamTargetOp.current, hoverTarget, delta * 8);
      beamParticlesRef.current.material.opacity = beamTargetOp.current;
      
      if (beamTargetOp.current > 0.01) {
          const positions = beamParticlesRef.current.geometry.attributes.position.array;
          for(let i=0; i<30; i++) {
             let y = positions[i*3+1];
             y += delta * (1.0 + beamData.phases[i] * 1.5);
             if(y > 3.0) y = 0;
             positions[i*3+1] = y;

             const baseRadius = 0.05 + beamData.phases[i] * 0.1;
             const r = baseRadius * (1.0 + y * 0.8);
             const angle = y * 5.0 + beamData.phases[i] * Math.PI * 2;
             
             positions[i*3] = Math.cos(angle) * r;
             positions[i*3+2] = Math.sin(angle) * r;
          }
          beamParticlesRef.current.geometry.attributes.position.needsUpdate = true;
      }
    }

    // Rings: unique rotation per marker + expand on hover
    if (ringGroupRef.current) {
      ringGroupRef.current.children[0].rotation.x = tPhased * speeds.ring1;
      ringGroupRef.current.children[0].rotation.z = tPhased * speeds.ring2 * 0.3;
      ringGroupRef.current.children[1].rotation.y = tPhased * speeds.ring2;
      ringGroupRef.current.children[1].rotation.x = tPhased * speeds.ring3 * 0.2;
      ringGroupRef.current.children[2].rotation.z = tPhased * speeds.ring3;
      ringGroupRef.current.children[2].rotation.y = tPhased * speeds.ring1 * 0.4;
      
      // Rings expand smoothly on hover
      const ringScale = 1 + Math.sin(tPhased * speeds.pulse * 0.5) * 0.05 + h * 0.4;
      ringGroupRef.current.scale.setScalar(ringScale);
    }
    
    // Rotate colors every 3 seconds if there are multiple categories
    if (data.categories && data.categories.length > 1) {
      const colorIndex = Math.floor(t / 3) % data.categories.length;
      const cat = data.categories[colorIndex];
      const newColor = categoryColors[cat] || categoryColors["デフォルト"];
      if (newColor !== currentColor) {
          setCurrentColor(newColor);
      }
    }
  });

  const handlePointerOver = (e) => {
    e.stopPropagation();
    setHover(true);
    if (onHoverChange) onHoverChange(data);
    document.body.style.cursor = 'pointer';
  };
  
  const handlePointerOut = (e) => {
    e.stopPropagation();
    setHover(false);
    if (onHoverChange) onHoverChange(null);
    document.body.style.cursor = 'default';
  };

  const markerColor = currentColor;
  const isEffectivelyHovered = hovered || isTourActive;

  return (
    <group position={position}>
      <group ref={markerGroupRef}>
        {/* Core crystal - icosahedron for artistic faceted look */}
        <mesh 
          onClick={(e) => { e.stopPropagation(); onSelect(data); }}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          <icosahedronGeometry args={[0.12, 1]} />
          <meshStandardMaterial ref={coreRef} color={markerColor} emissive={markerColor} emissiveIntensity={6} toneMapped={false} roughness={0.2} metalness={0.8} />
        </mesh>

        {/* Outer glow - high-detail sphere so it's always smooth */}
        <mesh raycast={() => null}>
          <icosahedronGeometry args={[0.22, 3]} />
          <meshBasicMaterial ref={glowRef} color={markerColor} transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>

        {/* Orbital rings - unique rotation per marker */}
        <group ref={ringGroupRef}>
          <group rotation={[Math.PI / 2, phase * 0.5, 0]}>
             <mesh raycast={() => null}>
               <torusGeometry args={[0.28, 0.008, 8, 80]} />
               <meshBasicMaterial color={markerColor} transparent opacity={0.7} blending={THREE.AdditiveBlending} />
             </mesh>
          </group>
          <group rotation={[phase * 0.3, Math.PI / 3, Math.PI / 4]}>
             <mesh raycast={() => null}>
               <torusGeometry args={[0.33, 0.008, 8, 80]} />
               <meshBasicMaterial color={markerColor} transparent opacity={0.5} blending={THREE.AdditiveBlending} />
             </mesh>
          </group>
          <group rotation={[phase * 0.2, -Math.PI / 3, -Math.PI / 4]}>
             <mesh raycast={() => null}>
               <torusGeometry args={[0.38, 0.008, 8, 80]} />
               <meshBasicMaterial color={markerColor} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
             </mesh>
          </group>
        </group>
        
        <points ref={beamParticlesRef} position={[0, 0, 0]} raycast={() => null}>
           <bufferGeometry>
             <bufferAttribute attach="attributes-position" array={beamData.pts} count={30} itemSize={3} />
           </bufferGeometry>
           <pointsMaterial size={0.15} color={markerColor} map={circleTexture} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      </group>

      {/* Optimization: Only render HologramPanel if effectively hovered */}
      {isEffectivelyHovered && (
        <Suspense fallback={null}>
          <HologramPanel 
            videoUrl={data.videoUrl} 
            hovered={isEffectivelyHovered} 
            onSelect={onSelect}
            data={data}
          />
        </Suspense>
      )}

      {isEffectivelyHovered && (
        <Html position={[0, 2.7, 0]} center distanceFactor={10}>
          <div className="tooltip" style={{ pointerEvents: 'none', background: 'rgba(0,0,0,0.8)', padding: '5px 10px', borderRadius: '4px', border: '1px solid #00ffff', color: 'white', whiteSpace: 'nowrap' }}>
            <span style={{ color: markerColor, marginRight: '5px' }}>▶</span>
            {data.name}
          </div>
        </Html>
      )}
    </group>
  );
};

export default function App() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [hoveredLocation, setHoveredLocation] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sequence, setSequence] = useState([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const [clockMode, setClockMode] = useState(0); // 0: off, 1: timeline, 2: camera tour
  const [tourIndex, setTourIndex] = useState(0);
  const idleTimer = useRef(null);

  const allCategories = useMemo(() => {
    return [...new Set(locations.flatMap(l => l.categories || []))].filter(Boolean);
  }, []);

  const resetIdle = () => {
    setIsIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIsIdle(true), 15000);
  };

  useEffect(() => {
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('click', resetIdle);
    window.addEventListener('keydown', resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('click', resetIdle);
      window.removeEventListener('keydown', resetIdle);
    };
  }, []);

  useEffect(() => {
    if (sequence.length > 0 && playbackIndex < sequence.length) {
      setSelectedLocation(sequence[playbackIndex]);
    } else if (sequence.length > 0 && playbackIndex >= sequence.length) {
      setSequence([]);
      setPlaybackIndex(0);
      setSelectedLocation(null);
    }
  }, [sequence, playbackIndex]);

  const playByDate = () => {
    let list = locations.filter(l => !categoryFilter || (l.categories && l.categories.includes(categoryFilter)));
    list.sort((a, b) => a.dateValue - b.dateValue);
    setPlaybackIndex(0);
    setSequence(list);
  };

  const playByCategory = () => {
    let list = locations.filter(l => !categoryFilter || (l.categories && l.categories.includes(categoryFilter)));
    list.sort((a, b) => {
      const gA = a.genre || "";
      const gB = b.genre || "";
      if (gA === gB) return a.dateValue - b.dateValue;
      return gA.localeCompare(gB);
    });
    setPlaybackIndex(0);
    setSequence(list);
  };

  const handleVideoEnd = () => {
    if (sequence.length > 0) {
      setPlaybackIndex(prev => prev + 1);
    }
  };

  const closeModal = () => {
    setSelectedLocation(null);
    setSequence([]);
  };

  const scrollableCategories = useMemo(() => ["", ...allCategories], [allCategories]);
  const lastScrollTime = useRef(0);

  const handleCategoryWheel = (e) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastScrollTime.current > 150) {
      const idx = scrollableCategories.indexOf(categoryFilter);
      if (e.deltaY > 0) {
        const nextIdx = (idx + 1) % scrollableCategories.length;
        setCategoryFilter(scrollableCategories[nextIdx]);
        lastScrollTime.current = now;
      } else if (e.deltaY < 0) {
        const prevIdx = (idx - 1 + scrollableCategories.length) % scrollableCategories.length;
        setCategoryFilter(scrollableCategories[prevIdx]);
        lastScrollTime.current = now;
      }
    }
  };

  const chronoSortedLocations = useMemo(() => {
     return locations
       .filter(loc => !categoryFilter || (loc.categories && loc.categories.includes(categoryFilter)))
       .sort((a,b) => a.dateValue - b.dateValue);
  }, [categoryFilter]);

  useEffect(() => {
    if (clockMode === 2 && chronoSortedLocations.length > 0) {
       setTourIndex(0);
       const interval = setInterval(() => {
          setTourIndex(prev => (prev + 1) % chronoSortedLocations.length);
       }, 4000); // Wait 4 seconds on each point
       return () => clearInterval(interval);
    }
  }, [clockMode, chronoSortedLocations]);

  const activeTourLocation = clockMode === 2 && chronoSortedLocations.length > 0 ? chronoSortedLocations[tourIndex] : null;
  const centralFocus = selectedLocation || activeTourLocation || hoveredLocation;
  
  return (
    <div className="container">
      <Canvas
        dpr={[1, 2]}
        style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 1 }}
        camera={{ position: [0, 20, 25], fov: 45 }}
        gl={{ antialias: true, stencil: false, depth: true }}
      >
        <CameraDrift hoveredLocation={centralFocus} isIdle={isIdle} />
        
        <color attach="background" args={['#010409']} />
        
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={4} />
        <Stars radius={100} depth={20} count={1500} factor={2} saturation={0.5} fade={false} speed={1} />
        
        <Grid 
          position={[0, -0.5, 0]} 
          args={[200, 200]} 
          cellSize={1.0} 
          cellThickness={0.5} 
          cellColor="#002244" 
          sectionSize={5.0} 
          sectionThickness={1.0} 
          sectionColor="#004488" 
          fadeDistance={40} 
          fadeStrength={1} 
        />

        <group>
           <WorldMapShape activeLocation={centralFocus} globalCategory={categoryFilter} />
           
           {clockMode > 0 && (
             <TimelineEffect locations={chronoSortedLocations} />
           )}

           {locations
            .filter(loc => !categoryFilter || (loc.categories && loc.categories.includes(categoryFilter)))
            .map((loc) => (
                <LocationMarker 
                  key={loc.id}  
                  data={loc} 
                  isTourActive={activeTourLocation && activeTourLocation.id === loc.id}
                  onHoverChange={(data) => {
                    if (sequence.length === 0) setHoveredLocation(data);
                  }}
                  onSelect={(data) => {
                    setSequence([]); 
                    setSelectedLocation(data);
                  }} 
                />
           ))}
        </group>

        {/* Temporarily disabled to isolate blur source
        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={0.99} intensity={1.5} mipmapBlur />
          <Noise opacity={0.01} />
        </EffectComposer>
        */}

        <MapControls 
          makeDefault
          enableZoom={true} 
          enablePan={true}
          enableRotate={true}
          minDistance={5} 
          maxDistance={100}
          maxPolarAngle={Math.PI / 2 - 0.05}
          enableDamping={true}
          dampingFactor={0.05}
        />
      </Canvas>

      <motion.div 
        style={{ pointerEvents: 'auto', position: 'absolute', bottom: '30px', left: '30px', zIndex: 10 }}
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        onWheel={handleCategoryWheel}
        title="上下にスクロールしてカテゴリーを変更"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div 
            style={{ 
               width: '64px', height: '64px', borderRadius: '50%',
               background: 'rgba(0,0,0,0.7)', 
               color: '#fff', 
               cursor: 'ns-resize', 
               border: `2px solid ${categoryFilter ? (categoryColors[categoryFilter] || '#00ffff') : '#00ffff'}`, 
               display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px',
               boxShadow: `0 0 15px ${categoryFilter ? (categoryColors[categoryFilter] || '#00ffff') : '#00ffff'}`,
               transition: 'all 0.3s'
            }}
          >
             <AnimatePresence mode="wait">
               <motion.div
                 key={categoryFilter}
                 initial={{ opacity: 0, y: 15 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -15 }}
                 transition={{ duration: 0.15 }}
               >
                 {categoryIcons[categoryFilter] || "📍"} 
               </motion.div>
             </AnimatePresence>
          </div>
          <div style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold', textShadow: '0 0 5px #000', whiteSpace: 'nowrap' }}>
            {categoryFilter === "" ? "全てのカテゴリー" : categoryFilter}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedLocation && (
          <motion.div 
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
            style={{ zIndex: 100 }}
          >
            <motion.div 
              className="modal-content"
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2>
                {sequence.length > 0 && <span style={{ color: "#00ffff", marginRight: '10px' }}>[ 自動再生: {playbackIndex + 1} / {sequence.length} ]</span>}
                {selectedLocation.name} {selectedLocation.dateTitle ? `(${selectedLocation.dateTitle})` : ''}
              </h2>
              <div className="video-wrapper">
                {selectedLocation.videoId ? (
                  <YouTube 
                    videoId={selectedLocation.videoId} 
                    opts={{
                      width: '100%',
                      height: '100%',
                      playerVars: { autoplay: 1 }
                    }}
                    onEnd={handleVideoEnd}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  />
                ) : (
                  <iframe 
                    src={selectedLocation.videoUrl} 
                    title={selectedLocation.name}
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                  ></iframe>
                )}
              </div>
              <p>{selectedLocation.desc}</p>
              <button className="close-btn" onClick={closeModal}>CLOSE</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 右下の時計アイコン (時系列・自動ツアー トグル) */}
      <div 
        onClick={() => setClockMode(prev => (prev + 1) % 3)} 
        style={{
          position: 'absolute', bottom: '30px', right: '30px', zIndex: 10,
          backgroundColor: clockMode === 2 ? 'rgba(70, 0, 255, 0.4)' : clockMode === 1 ? 'rgba(0, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.6)',
          border: '1px solid #00ffff', borderRadius: '50%', padding: '15px', cursor: 'pointer',
          boxShadow: clockMode === 2 ? '0 0 15px rgba(200, 50, 255, 0.6)' : clockMode === 1 ? '0 0 15px rgba(0, 255, 255, 0.5)' : '0 0 10px rgba(0, 100, 255, 0.2)',
          transition: 'all 0.3s',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={clockMode === 2 ? "#e080ff" : "#00ffff"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </div>

    </div>
  );
}
