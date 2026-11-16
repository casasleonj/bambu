"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";

/**
 * Observación del pedido en la lista (#635, #780).
 * - Ratón: al pasar el cursor por «📝 Nota» (o su aviso) se lee la nota; al salir se oculta.
 * - Teclado: al enfocar el botón con Tab también se ve.
 * - Táctil o clic: el botón fija o suelta la nota; sirve donde no hay cursor.
 * - El aviso sale siempre pegado al icono; si por el ancho de la pantalla se saldría por un borde, se desplaza en horizontal lo justo para quedar dentro.
 * - Escape cierra. El aviso flota, así la lista no se mueve al pasar el cursor.
 */
export function NotaPedido({ obs, numero }: { obs: string; numero: number }) {
  const [hover, setHover] = useState(false),
    [foco, setFoco] = useState(false),
    [fijada, setFijada] = useState(false);
  const id = useId();
  const aviso = useRef<HTMLParagraphElement>(null);
  const visible = hover || foco || fijada;
  // Mantener el aviso dentro de la pantalla sin alejarlo del icono (#780).
  useLayoutEffect(() => {
    const el = aviso.current;
    if (!el) return;
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    const ancho = document.documentElement.clientWidth;
    let dx = 0;
    if (r.right > ancho - 8) dx = ancho - 8 - r.right;
    if (r.left + dx < 8) dx = 8 - r.left;
    if (dx) el.style.transform = `translateX(${dx}px)`;
  }, [visible]);
  const cerrar = () => {
    setHover(false);
    setFoco(false);
    setFijada(false);
  };
  return (
    <div
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && visible) {
          e.stopPropagation();
          cerrar();
        }
      }}
    >
      <button
        type="button"
        aria-expanded={visible}
        aria-describedby={visible ? id : undefined}
        aria-label={`Observaciones del pedido #${numero}`}
        data-testid={`operacion-nota-${numero}`}
        className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 text-xs font-semibold text-amber-900"
        onClick={() => setFijada((v) => !v)}
        onFocus={(e) => setFoco(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFoco(false)}
      >
        📝 Nota
      </button>
      {visible && (
        <p
          ref={aviso}
          id={id}
          role="tooltip"
          data-testid={`operacion-nota-texto-${numero}`}
          onClick={cerrar}
          className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-1rem)] whitespace-pre-wrap break-words rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-normal text-amber-950 shadow-lg"
        >
          {obs}
        </p>
      )}
    </div>
  );
}
