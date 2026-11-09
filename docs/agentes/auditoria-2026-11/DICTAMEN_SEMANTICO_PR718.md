# Dictamen de contraste semántico · PR #718

**Fecha:** 2026-11-09. **Clasificación:** PREANÁLISIS DOCUMENTADO Y VERIFICADO ESTRUCTURALMENTE; **NO** equivalencia normativa certificada, **NO** autorización de merge.

## 1. Corpus y origen

| Corpus | Cobertura | Alcance real |
|---|---:|---|
| Archivo AGENTS original conservado byte a byte | 798 posiciones | Hash Git de blob: `4182d57064c7f89c2eea39e86d1e0b469179bb06` |
| `revision_fuente_798.csv` | 810 entradas | 354 cláusulas conceptuales; 456 entradas contextuales o históricas pendientes de confirmación |
| `matriz_fuente_798.csv` | 798 posiciones | 530 **filas candidatas**, no 530 obligaciones distintas |
| `obligaciones_atomicas.csv` | 556 entradas preliminares | 354 cláusulas preanalizadas + 202 filas candidatas interpretadas en segunda pasada |
| `clasificacion_candidatas_202.csv` | 202/202 filas | Tipo, significado, condición, excepción, destino y advertencia; **no firma** |
| `contratos-operativos.md` | 354 IDs AB | Catálogo consultable por dominio; **no sustituye el Contexto Maestro ni al código actual** |

Las 556 filas **no demuestran** que existan exactamente 556 obligaciones atómicas. Una fila fuente puede incluir varios deberes, y hay duplicidades narrativas. Los títulos y versiones se han identificado expresamente como tales. La clasificación propuesta no revoca decisiones ni ejecuta instrucciones históricas.

## 2. Autoridad y decisiones

1. **Producto:** Contexto Maestro vigente adoptado, Planes Maestros **aprobados**, decisiones posteriores verificables. No publicar originales privados en este repositorio público.
2. **Revisión limitada con fuentes privadas autorizadas:** se identificó la copia del Contexto Maestro v1.1 disponible en el Proyecto, cuyo encabezado interno dice v1.0. Esa discrepancia de denominación **no** autoriza sustituir la versión vigente definida por el proyecto. El Plan Maestro de Integridad Comercial v1.0 se presenta como `Aprobable` y **no equivale por sí mismo a aprobado**.
3. **Técnica:** `main` SHA `ef0bc0dd0736e3acfd9d9d0bf64ffc5ff62fb44f`, observado el 2026-11-09. ADRs y decisiones posteriores verificables pueden sustituir notas antiguas, pero debe documentarse el alcance exacto.
4. **Investigación #704:** reordenar tres rondas R1+R2 antes de código y R3 después de aprobación del plan/fase es la solución propuesta en PR #718 y su Issue. La autorización de resolver #704 no da aprobación universal de maquetas, datos, CI, migraciones ni merge.
5. **Fuentes de revisión automatizada:** `check_reconciliacion.py`, `check_preanalisis.py` y suite `unittest`. Los PASS de **estructura y procedencia** no sustituyen comprobación semántica o activación conductual.

## 3. Contrastes de mayor riesgo

- **Aprobación UI/UX:** mantener maqueta escritorio/móvil, confirmación/carga/error, aprobación PO expresa y separación de la autorización backend. Original L7 → nuevo AGENTS §4 y protocolo; no hay excepción para cambios visuales triviales.
- **R1/R2/R3:** original L3-L5 y L667-L704 contenía contradicción interna; nuevo protocolo registra sustitución propuesta, no autorización tácita.
- **Transversal monetario:** distinguir valor comercial, entregado, exigible, cobrado, confirmado, nómina causada/pagada, comisiones y efectivo físico. Verificar consumidores de caja, Dashboard, reportes y fecha. `src/lib/cierre-totales.ts` aún tiene supuesto de gastos/comisiones en efectivo, por lo que esta discrepancia está **pendiente de análisis de dominio**, no es norma nueva.
- **Idempotencia:** `Pedido.offlineId` es único, pero `Pago.offlineId` es índice no único; unificar sus constraints rompe el flujo. `Cliente.saldoFavor` y `IngresoSaldoFavor` requieren distinguir dinero recibido, crédito concedido y consumo posterior.
- **Geografía:** destino propio del pedido precede al Negocio y al Cliente en `main`; preservar cinco consumidores de coordenadas, no aplicar en ciego la regla vieja incompleta.
- **Cierre:** no reportar un bypass por `POST /api/cierre-dia` que ya no existe; tampoco afirmar que todos los bypass quedaron excluidos.
- **Historial de PII:** comandos con credenciales de ejemplo y una instrucción de eliminación de negocio en producción son **evidencia histórica**, no tareas para ejecutar.

## 4. Alcance verificable de la auditoría

- **HECHO DOCUMENTAL:** el texto original se reconstruye exactamente; todas las posiciones y las candidatas están localizables. Las 202 candidatas extra tienen primera interpretación y delimitación. 354 contratos conceptuales conservan trazabilidad.
- **REVISIÓN CRÍTICA POR IA:** el catálogo ahora advierte tres divergencias relevantes frente al `main` consultado; no se atribuye a firma humana ni a tests de integración.
- **PENDIENTE DE EQUIVALENCIA FINAL:** constatar la condición/excepción y vigencia **de cada cláusula verdaderamente independiente** con decisiones autorizadas y consumidores; distinguir si un antecedente histórico contiene más de una. Cualquier celda `POR_DETERMINAR`, `PENDIENTE` o `PREANALISIS_IA` debe permanecer visible.
- **PENDIENTE CONDUCTUAL:** pruebas A/B autenticadas para Codex, Claude Code y OpenCode con trazas, negative cases y comparación del comportamiento de descubrimiento.
- **PENDIENTE APROBACIÓN:** revisor de producto autorizado debe firmar expresamente los cambios normativos y la equivalencia; la existencia del PR no reemplaza su aprobación.

## 5. Criterio de cierre

El control de sustitución de `AGENTS.md` solo puede pasar cuando:

1. Cada obligación independiente tenga fuente íntegra, significado, condiciones y excepciones, clasificación definitiva, destino **operativo y accesible** y evidencia, sin falsos positivos de textos históricos.
2. Los cambios normativos tengan autoridad y aprobación trazadas. En particular, un documento llamado «Aprobable» no acredita aprobación.
3. Se hayan ejecutado pruebas de activación y cumplimiento adversarial en agentes reales, con versiones y SHAs registrados.
4. Revisión humana autorizada y CI de PR completos. El check `audit` debe quedar estricto; prohibido convertirlo en `non-blocking` para obtener verde.

**Conclusión:** el inventario y la depuración preliminar están integrados, pero no es correcto publicar un certificado de equivalencia total ni fusionar el PR. Este dictamen no contiene el texto privado del Contexto Maestro o de Planes Maestros.
