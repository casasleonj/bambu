# Graph Report - /home/cristof/Documents/bambu_demo_multimodelo  (2026-04-28)

## Corpus Check
- 113 files · ~112,161 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 355 nodes · 339 edges · 97 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]

## God Nodes (most connected - your core abstractions)
1. `GET()` - 31 edges
2. `POST()` - 26 edges
3. `DELETE()` - 8 edges
4. `PUT()` - 7 edges
5. `requireAuth()` - 5 edges
6. `requireRole()` - 5 edges
7. `getLimiter()` - 5 edges
8. `fetchData()` - 4 edges
9. `generarPedidosRecurrentes()` - 4 edges
10. `fetchClientes()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `ensureTestData()` --calls--> `POST()`  [INFERRED]
  /home/cristof/Documents/bambu_demo_multimodelo/e2e/full-user-day.spec.ts → /home/cristof/Documents/bambu_demo_multimodelo/src/app/api/trabajadores/route.ts
- `hasVolumeTiers()` --calls--> `GET()`  [INFERRED]
  /home/cristof/Documents/bambu_demo_multimodelo/src/app/(app)/precios/precios-client.tsx → /home/cristof/Documents/bambu_demo_multimodelo/src/app/api/trabajadores/route.ts
- `GET()` --calls--> `getTodayRange()`  [INFERRED]
  /home/cristof/Documents/bambu_demo_multimodelo/src/app/api/trabajadores/route.ts → /home/cristof/Documents/bambu_demo_multimodelo/src/lib/dates.ts
- `getClientIp()` --calls--> `GET()`  [INFERRED]
  /home/cristof/Documents/bambu_demo_multimodelo/src/middleware.ts → /home/cristof/Documents/bambu_demo_multimodelo/src/app/api/trabajadores/route.ts
- `GET()` --calls--> `requireAuth()`  [INFERRED]
  /home/cristof/Documents/bambu_demo_multimodelo/src/app/api/trabajadores/route.ts → /home/cristof/Documents/bambu_demo_multimodelo/src/lib/auth-check.ts

## Hyperedges (group relationships)
- **App Pages Architecture** — dashboard_page, pedidos_page, clientes_page, embarques_page, produccion_page, cierre_page, facturas_page, gastos_page, nomina_page, insumos_page, reportes_page [INFERRED 0.80]
- **API Aggregator Pages** — dashboard_page, reportes_page [INFERRED 0.75]
- **Financial Management Pages** — facturas_page, gastos_page, nomina_page, cierre_page [INFERRED 0.75]
- **Database seeding process** — file_prisma_seed_ts, file_prisma_create_users, file_prisma_seed_js, db_seed_users, db_seed_productos, db_seed_trabajadores, db_seed_configs, db_seed_cliente_demo, db_seed_produccion_demo [INFERRED]
- **Offline-first synchronization architecture** — file_lib_db_offline, file_lib_db_sync, tech_dexie, pattern_offline_first, entity_offline_pedido, entity_offline_cliente, pattern_sync_queue, event_browser_online [INFERRED]
- **Multi-model AI agent pipeline** — task_full_pipeline, task_db_architecture_analysis, task_business_analysis, task_debug_project, task_insumos_module, task_nomina_vs_gastos, task_normalization_analysis, decision_multi_model_pipeline, process_agent_pipeline, agent_role_planner, agent_role_architect, agent_role_project_manager, agent_role_coder, agent_role_tester, agent_role_debugger, agent_role_security, agent_role_reviewer, agent_role_qa [INFERRED]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (8): withAdvisoryLock(), getClientIp(), buildPaginationResponse(), getPaginationParams(), getPrismaPagination(), GET(), POST(), getNextNumero()

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (22): seeded cliente demo, seeded produccion demo, seeded productos, seeded trabajadores, seeded users, prisma.ts, create-users.ts, seed.js (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (21): AppSidebar, useAppStore, auth, ClienteForm, EmbarqueCard, OfflineBanner, PedidoForm, Providers (+13 more)

### Community 3 - "Community 3"
Cohesion: 0.23
Nodes (5): requireAuth(), requireRole(), DELETE(), PUT(), syncWithServer()

### Community 4 - "Community 4"
Cohesion: 0.18
Nodes (11): ARCHITECT agent, CODER agent, DEBUGGER agent, PLANNER agent, PROJECT_MANAGER agent, QA agent, REVIEWER agent, SECURITY agent (+3 more)

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (2): getEffectivePrice(), getPrecio()

### Community 6 - "Community 6"
Cohesion: 0.2
Nodes (10): ciclo diario, IQ200 schema normalization, ANALISIS-AGUA-BAMBU-V2.md, auth not configured, non-functional facturas, missing PedidoForm, commission model, embedded payment fields (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (9): OfflineCliente, OfflinePedido, browser online event, offline.ts, sync.ts, dynamic import, offline-first storage, sync queue (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.29
Nodes (3): cancelEdit(), hasVolumeTiers(), savePrice()

### Community 9 - "Community 9"
Cohesion: 0.32
Nodes (3): fetchClientes(), handleDelete(), handleSubmit()

### Community 10 - "Community 10"
Cohesion: 0.32
Nodes (4): resolverPrecio(), resolverPreciosPedido(), generarPedidosRecurrentes(), getFrecuenciaDias()

### Community 11 - "Community 11"
Cohesion: 0.43
Nodes (4): closeModal(), fetchProveedores(), handleDeactivate(), handleSave()

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (7): BASE_DIA config, COM_REPARTIDOR config, COM_SELLADOR config, STOCK_INI_AGUA config, STOCK_INI_BOTELLON config, STOCK_INI_HIELO config, seeded configs

### Community 13 - "Community 13"
Cohesion: 0.4
Nodes (2): calcularNetoCaja(), handleCerrar()

### Community 14 - "Community 14"
Cohesion: 0.47
Nodes (3): fetchTrabajadores(), handleDelete(), handleSubmit()

### Community 15 - "Community 15"
Cohesion: 0.53
Nodes (4): checkRateLimit(), getLimiter(), getRedisClient(), resetRateLimit()

### Community 16 - "Community 16"
Cohesion: 0.5
Nodes (3): dismissBaseCaja(), ensureTestData(), nav()

### Community 17 - "Community 17"
Cohesion: 0.6
Nodes (3): crearCompra(), crearNomina(), fetchData()

### Community 18 - "Community 18"
Cohesion: 0.4
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 0.4
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (1): BambuOfflineDB

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (2): fetchFacturas(), registrarAbono()

### Community 22 - "Community 22"
Cohesion: 0.5
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 0.5
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 0.5
Nodes (2): OfflineBanner(), useOnlineStatus()

### Community 25 - "Community 25"
Cohesion: 0.5
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 0.5
Nodes (1): getTodayRange()

### Community 27 - "Community 27"
Cohesion: 0.5
Nodes (4): cn.ts, cn className utility, clsx, tailwind-merge

### Community 28 - "Community 28"
Cohesion: 0.5
Nodes (4): multi-model pipeline, business analysis task, DB architecture analysis task, debug project task

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 0.67
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 0.67
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 0.67
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (2): crearGasto(), fetchGastos()

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (2): crearInsumo(), fetchData()

### Community 35 - "Community 35"
Cohesion: 0.67
Nodes (3): auth-server.ts, next-auth lib, getSession wrapper

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (3): README.md, Next.js project, Geist font

### Community 37 - "Community 37"
Cohesion: 0.67
Nodes (3): AGENTS.md, CLAUDE.md, Next.js breaking changes warning

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (3): insumos module, reportes module, insumos module task

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (2): nomina module, nomina vs gastos task

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (0): 

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (0): 

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (0): 

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (0): 

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (0): 

### Community 88 - "Community 88"
Cohesion: 1.0
Nodes (0): 

### Community 89 - "Community 89"
Cohesion: 1.0
Nodes (0): 

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (0): 

### Community 91 - "Community 91"
Cohesion: 1.0
Nodes (0): 

### Community 92 - "Community 92"
Cohesion: 1.0
Nodes (1): globe.svg

### Community 93 - "Community 93"
Cohesion: 1.0
Nodes (1): file icon SVG

### Community 94 - "Community 94"
Cohesion: 1.0
Nodes (1): Next.js logo SVG

### Community 95 - "Community 95"
Cohesion: 1.0
Nodes (1): window icon SVG

### Community 96 - "Community 96"
Cohesion: 1.0
Nodes (1): Vercel logo SVG

## Knowledge Gaps
- **Thin community `Community 39`** (2 nodes): `sw.js`, `getRequestType()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `layout.tsx`, `RootLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `page.tsx`, `HomePage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `reportes-filter.tsx`, `ReportesFilter()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `page.tsx`, `ReportesPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `page.tsx`, `EmbarquesPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `page.tsx`, `PreciosPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `page.tsx`, `buildVentasPorPrecio()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (2 nodes): `page.tsx`, `ClientesPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `page.tsx`, `InsumosPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `page.tsx`, `ProveedoresPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `page.tsx`, `TrabajadoresPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `OfflinePage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `page.tsx`, `LoginPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (2 nodes): `BaseCajaModal()`, `base-caja-modal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (2 nodes): `ConnectivityIndicator()`, `connectivity-indicator.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (2 nodes): `EmbarqueCard()`, `embarque-card.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (2 nodes): `Providers()`, `providers.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (2 nodes): `update-notification.tsx`, `UpdateNotification()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (2 nodes): `ClienteForm()`, `cliente-form.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (2 nodes): `sw-register.tsx`, `ServiceWorkerRegister()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (2 nodes): `use-offline-queue.ts`, `useOfflineQueue()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (2 nodes): `seed.ts`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (2 nodes): `nomina module`, `nomina vs gastos task`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `postcss.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `eslint.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `auth.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `user-flow.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `sw.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `route.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `modal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `button.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `badge.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `input.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `card.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `label.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `select.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `dialog.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `sw.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `next-auth.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `app-store.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `validators.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `prices.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `prisma.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `validators.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (1 nodes): `setup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (1 nodes): `globe.svg`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (1 nodes): `file icon SVG`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (1 nodes): `Next.js logo SVG`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (1 nodes): `window icon SVG`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (1 nodes): `Vercel logo SVG`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GET()` connect `Community 0` to `Community 8`, `Community 26`, `Community 3`, `Community 15`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 0` to `Community 16`, `Community 10`, `Community 3`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `hasVolumeTiers()` connect `Community 8` to `Community 0`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `GET()` (e.g. with `getClientIp()` and `hasVolumeTiers()`) actually correct?**
  _`GET()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `POST()` (e.g. with `ensureTestData()` and `requireAuth()`) actually correct?**
  _`POST()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._