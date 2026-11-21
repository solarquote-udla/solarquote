/**
 * Vista 3D del layout (revisión del 16 de noviembre, Lenin: "que los
 * paneles se vean levantados", como en Smart Design).
 *
 * Muestra el terreno, los caminos y cada bloque con sus paneles en la
 * estructura en casita de HEXtructure: soportes en V abajo y en A arriba,
 * con el ángulo de montaje del Paso 2. Se gira con el mouse y se acerca
 * con la rueda. Es solo para ver cómo queda: no calcula sombras ni
 * producción.
 *
 * Usa Three.js. Se carga aparte (React.lazy) para no pesar en el resto de
 * la aplicación. Paneles y soportes van como instancias: una planta de
 * decenas de miles de paneles se dibuja con dos objetos.
 *
 * Si el navegador no tiene WebGL, lo dice y no rompe la página.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Punto } from "@/types/api";
import { ANGULO_DEFECTO, encuadre3D, geometriaBloque, type BloqueEscena } from "@/utils/escena3d";

export interface Props {
  terreno: Punto[];
  caminos: Punto[][];
  bloques: BloqueEscena[];
  /** Ángulo de montaje del Paso 2, en grados */
  anguloMontaje: number | null;
  /** Grados del norte en sentido horario desde +Y del plano. Null = arriba. */
  orientacionNorte: number | null;
  alto?: string;
}

const COLOR_PANEL = "#1e3a8a";
const COLOR_SOPORTE = "#9ca3af";
const COLOR_TERRENO = "#b5c99a";
const COLOR_CAMINO = "#9ca3af";

/** Polígono del plano como figura horizontal a la altura `y`. */
function figura(puntos: Punto[], color: string, y: number): THREE.Mesh {
  const forma = new THREE.Shape(puntos.map(([x, py]) => new THREE.Vector2(x, py)));
  const geometria = new THREE.ShapeGeometry(forma);
  // La figura se dibuja en el plano XY; se acuesta para que y del plano sea −z
  geometria.rotateX(-Math.PI / 2);
  const malla = new THREE.Mesh(geometria, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  malla.position.y = y;
  return malla;
}

/** Flecha y letra N en el suelo, hacia el norte real del terreno. */
function indicadorNorte(centro: THREE.Vector3, tamano: number, orientacion: number): THREE.Group {
  const grupo = new THREE.Group();
  const t = (orientacion * Math.PI) / 180;
  const direccion = new THREE.Vector3(Math.sin(t), 0, -Math.cos(t));
  const largo = tamano * 0.15;
  const origen = centro.clone().add(new THREE.Vector3(-tamano * 0.6, 0.05, tamano * 0.6));
  grupo.add(new THREE.ArrowHelper(direccion, origen, largo, 0xdc2626, largo * 0.3, largo * 0.15));

  const lienzo = document.createElement("canvas");
  lienzo.width = 64;
  lienzo.height = 64;
  const ctx = lienzo.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#dc2626";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 32, 34);
  }
  const letra = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lienzo) }));
  letra.position.copy(origen.clone().add(direccion.clone().multiplyScalar(largo * 1.3)));
  letra.scale.setScalar(largo * 0.4);
  grupo.add(letra);
  return grupo;
}

export function Vista3D(props: Props) {
  const { bloques, anguloMontaje, alto = "h-[32rem]" } = props;
  const contenedor = useRef<HTMLDivElement>(null);
  const reiniciar = useRef<() => void>(() => {});
  const [sinWebGL, setSinWebGL] = useState(false);

  // La escena se arma de nuevo solo si cambian los datos, no en cada render:
  // las páginas pasan arreglos nuevos aunque el contenido sea el mismo
  const firma = JSON.stringify({
    terreno: props.terreno,
    caminos: props.caminos,
    bloques: bloques.map((b) => ({ vertices: b.vertices, paneles_largo: b.paneles_largo, paneles_ancho: b.paneles_ancho })),
    anguloMontaje,
    orientacionNorte: props.orientacionNorte,
  });
  const datos = useMemo(() => JSON.parse(firma) as Omit<Props, "alto">, [firma]);

  useEffect(() => {
    const { terreno, caminos, bloques, anguloMontaje, orientacionNorte } = datos;
    const div = contenedor.current;
    if (!div) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      // jsdom o un navegador sin WebGL
      Promise.resolve().then(() => setSinWebGL(true));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor("#e0f2fe");
    div.appendChild(renderer.domElement);

    const escena = new THREE.Scene();
    escena.add(new THREE.HemisphereLight(0xffffff, 0x8d9b6a, 1.2));
    const sol = new THREE.DirectionalLight(0xffffff, 1.6);
    sol.position.set(-1, 2, 0.5);
    escena.add(sol);

    // ─── Terreno y caminos ─────────────────────────────
    if (terreno.length >= 3) escena.add(figura(terreno, COLOR_TERRENO, 0));
    for (const c of caminos) if (c.length >= 3) escena.add(figura(c, COLOR_CAMINO, 0.02));

    // ─── Paneles y soportes, como instancias ───────────
    const angulo = anguloMontaje && anguloMontaje > 0 ? anguloMontaje : ANGULO_DEFECTO;
    const piezas = bloques.map((b) => geometriaBloque(b, angulo));
    const totalPaneles = piezas.reduce((s, p) => s + p.paneles.length, 0);
    const totalSoportes = piezas.reduce((s, p) => s + p.soportes.length, 0);

    const matriz = new THREE.Matrix4();
    if (totalPaneles > 0) {
      const paneles = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 0.04, 1),
        new THREE.MeshStandardMaterial({ color: COLOR_PANEL, metalness: 0.3, roughness: 0.35 }),
        totalPaneles,
      );
      let n = 0;
      const [x, y, z] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (const { paneles: lista } of piezas) {
        for (const p of lista) {
          x.fromArray(p.ejeLargo).multiplyScalar(p.largo);
          y.fromArray(p.normal);
          z.fromArray(p.ejeAncho).multiplyScalar(p.ancho);
          matriz.makeBasis(x, y, z).setPosition(p.centro[0], p.centro[1], p.centro[2]);
          paneles.setMatrixAt(n++, matriz);
        }
      }
      escena.add(paneles);
    }
    if (totalSoportes > 0) {
      const soportes = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1, 6),
        new THREE.MeshStandardMaterial({ color: COLOR_SOPORTE, metalness: 0.6, roughness: 0.4 }),
        totalSoportes,
      );
      let n = 0;
      for (const { soportes: lista } of piezas) {
        for (const s of lista) {
          matriz.makeScale(1, s.alto, 1).setPosition(s.x, s.alto / 2, s.z);
          soportes.setMatrixAt(n++, matriz);
        }
      }
      escena.add(soportes);
    }

    // ─── Cámara ────────────────────────────────────────
    const todos = [...terreno, ...bloques.flatMap((b) => b.vertices)];
    const { centro, tamano } = encuadre3D(todos);
    const objetivo = new THREE.Vector3(...centro);
    escena.add(indicadorNorte(objetivo, tamano, orientacionNorte ?? 0));

    const camara = new THREE.PerspectiveCamera(45, 1, 0.1, tamano * 20);
    const controles = new OrbitControls(camara, renderer.domElement);
    controles.maxPolarAngle = Math.PI / 2 - 0.02; // no pasar bajo el suelo
    const dibujar = () => renderer.render(escena, camara);
    controles.addEventListener("change", dibujar);

    reiniciar.current = () => {
      camara.position.set(objetivo.x - tamano * 0.6, tamano * 0.55, objetivo.z + tamano * 0.75);
      controles.target.copy(objetivo);
      controles.update();
      dibujar();
    };

    const ajustar = () => {
      const ancho = div.clientWidth || 800;
      const altoPx = div.clientHeight || 500;
      renderer.setSize(ancho, altoPx);
      camara.aspect = ancho / altoPx;
      camara.updateProjectionMatrix();
      dibujar();
    };
    const observador = new ResizeObserver(ajustar);
    observador.observe(div);
    ajustar();
    reiniciar.current();

    return () => {
      observador.disconnect();
      controles.dispose();
      escena.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          o.geometry.dispose();
          const materiales = Array.isArray(o.material) ? o.material : [o.material];
          materiales.forEach((m) => {
            if ("map" in m && m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      reiniciar.current = () => {};
    };
  }, [datos]);

  if (sinWebGL) {
    return (
      <div className={`${alto} flex items-center justify-center rounded-xl border border-dashed border-acero-300 bg-superficie p-6 text-center text-sm text-acero-500`}>
        Este navegador no permite la vista 3D (WebGL desactivado). El plano sigue disponible en la otra pestaña.
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={contenedor}
        className={`${alto} w-full overflow-hidden rounded-xl border border-acero-200`}
        role="img"
        aria-label={`Vista 3D del layout: ${bloques.length} bloques`}
      />
      <button
        type="button"
        onClick={() => reiniciar.current()}
        className="absolute right-3 top-3 rounded-lg border border-acero-300 bg-white/90 px-3 py-1 text-xs font-medium text-acero-700 shadow hover:bg-white"
      >
        Centrar vista
      </button>
      <p className="mt-2 text-xs text-acero-500">
        Arrastra para girar, rueda para acercar y clic derecho para desplazar. Paneles sobre soportes en V (abajo) y en A
        (arriba) a {anguloMontaje && anguloMontaje > 0 ? anguloMontaje : ANGULO_DEFECTO}°; las alturas son aproximadas.
      </p>
    </div>
  );
}

export default Vista3D;
