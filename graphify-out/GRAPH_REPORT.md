# Graph Report - .  (2026-04-26)

## Corpus Check
- Corpus is ~24,797 words - fits in a single context window. You may not need a graph.

## Summary
- 290 nodes · 313 edges · 76 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Core Architecture|App Core Architecture]]
- [[_COMMUNITY_API Route Handlers|API Route Handlers]]
- [[_COMMUNITY_Database & Seeding|Database & Seeding]]
- [[_COMMUNITY_UI Components & Forms|UI Components & Forms]]
- [[_COMMUNITY_AI Agent Pipeline|AI Agent Pipeline]]
- [[_COMMUNITY_Business Analysis & Gaps|Business Analysis & Gaps]]
- [[_COMMUNITY_Clientes & Produccion Pages|Clientes & Produccion Pages]]
- [[_COMMUNITY_Offline-First Architecture|Offline-First Architecture]]
- [[_COMMUNITY_Offline Sync Implementation|Offline Sync Implementation]]
- [[_COMMUNITY_Cierre Page Logic|Cierre Page Logic]]
- [[_COMMUNITY_PedidoForm Component|PedidoForm Component]]
- [[_COMMUNITY_Productos Catalog|Productos Catalog]]
- [[_COMMUNITY_Insumos & Nomina Pages|Insumos & Nomina Pages]]
- [[_COMMUNITY_UI Tabs Component|UI Tabs Component]]
- [[_COMMUNITY_Facturas Page|Facturas Page]]
- [[_COMMUNITY_Offline Banner|Offline Banner]]
- [[_COMMUNITY_UI Table Component|UI Table Component]]
- [[_COMMUNITY_Utils Library|Utils Library]]
- [[_COMMUNITY_Insumos APIs|Insumos APIs]]
- [[_COMMUNITY_CN Utility Pattern|CN Utility Pattern]]
- [[_COMMUNITY_Multi-Model Analysis Tasks|Multi-Model Analysis Tasks]]
- [[_COMMUNITY_Gastos Page|Gastos Page]]
- [[_COMMUNITY_Prisma Seed Scripts|Prisma Seed Scripts]]
- [[_COMMUNITY_App Layout Component|App Layout Component]]
- [[_COMMUNITY_Auth Server Wrapper|Auth Server Wrapper]]
- [[_COMMUNITY_Project README|Project README]]
- [[_COMMUNITY_Agent Rules|Agent Rules]]
- [[_COMMUNITY_Insumos Module|Insumos Module]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Home Page|Home Page]]
- [[_COMMUNITY_Reportes Page|Reportes Page]]
- [[_COMMUNITY_Embarques Page|Embarques Page]]
- [[_COMMUNITY_Pedidos Page|Pedidos Page]]
- [[_COMMUNITY_Dashboard Page|Dashboard Page]]
- [[_COMMUNITY_Offline Page|Offline Page]]
- [[_COMMUNITY_Login Page|Login Page]]
- [[_COMMUNITY_BaseCaja Modal|BaseCaja Modal]]
- [[_COMMUNITY_Embarque Card|Embarque Card]]
- [[_COMMUNITY_Auth Providers|Auth Providers]]
- [[_COMMUNITY_Cliente Form|Cliente Form]]
- [[_COMMUNITY_Offline Queue Hook|Offline Queue Hook]]
- [[_COMMUNITY_Auth Server GetSession|Auth Server GetSession]]
- [[_COMMUNITY_Create Users Script|Create Users Script]]
- [[_COMMUNITY_Nomina Module|Nomina Module]]
- [[_COMMUNITY_Next Config|Next Config]]
- [[_COMMUNITY_Next Env Types|Next Env Types]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next.js Middleware|Next.js Middleware]]
- [[_COMMUNITY_Service Worker|Service Worker]]
- [[_COMMUNITY_NextAuth Route|NextAuth Route]]
- [[_COMMUNITY_App Sidebar|App Sidebar]]
- [[_COMMUNITY_UI Button|UI Button]]
- [[_COMMUNITY_UI Badge|UI Badge]]
- [[_COMMUNITY_UI Input|UI Input]]
- [[_COMMUNITY_UI Card|UI Card]]
- [[_COMMUNITY_UI Label|UI Label]]
- [[_COMMUNITY_UI Select|UI Select]]
- [[_COMMUNITY_UI Dialog|UI Dialog]]
- [[_COMMUNITY_SW Types|SW Types]]
- [[_COMMUNITY_Domain Types|Domain Types]]
- [[_COMMUNITY_Auth Configuration|Auth Configuration]]
- [[_COMMUNITY_CN Helper|CN Helper]]
- [[_COMMUNITY_Prisma Client Singleton|Prisma Client Singleton]]
- [[_COMMUNITY_PostCSS Setup|PostCSS Setup]]
- [[_COMMUNITY_ESLint Setup|ESLint Setup]]
- [[_COMMUNITY_Root Layout Export|Root Layout Export]]
- [[_COMMUNITY_Offline Fallback|Offline Fallback]]
- [[_COMMUNITY_Pedidos API by ID|Pedidos API by ID]]
- [[_COMMUNITY_Search API|Search API]]
- [[_COMMUNITY_Auth NextAuth Handler|Auth NextAuth Handler]]
- [[_COMMUNITY_Globe SVG Asset|Globe SVG Asset]]
- [[_COMMUNITY_File SVG Asset|File SVG Asset]]
- [[_COMMUNITY_Next.js SVG Logo|Next.js SVG Logo]]
- [[_COMMUNITY_Window SVG Asset|Window SVG Asset]]
- [[_COMMUNITY_Vercel SVG Logo|Vercel SVG Logo]]

## God Nodes (most connected - your core abstractions)
1. `GET()` - 20 edges
2. `src/app/(app)/dashboard/page.tsx` - 16 edges
3. `POST()` - 13 edges
4. `src/middleware.ts` - 13 edges
5. `src/app/(app)/reportes/page.tsx` - 7 edges
6. `src/app/(app)/cierre/page.tsx` - 7 edges
7. `src/app/(app)/pedidos/page.tsx` - 7 edges
8. `src/app/(app)/embarques/page.tsx` - 6 edges
9. `src/app/(app)/produccion/page.tsx` - 6 edges
10. `src/app/(app)/layout.tsx` - 5 edges

## Surprising Connections (you probably didn't know these)
- `src/middleware.ts` --references--> `src/app/(app)/insumos/page.tsx`  [INFERRED]
  src/middleware.ts → src/app/(app)/insumos/page.tsx
- `OfflineBanner()` --calls--> `useOnlineStatus()`  [INFERRED]
  src/components/offline-banner.tsx → src/hooks/use-online-status.ts
- `syncOfflineData()` --calls--> `syncPedidos()`  [INFERRED]
  src/lib/db/sync.ts → src/lib/db/offline.ts
- `src/middleware.ts` --references--> `src/app/(auth)/login/page.tsx`  [INFERRED]
  src/middleware.ts → src/app/(auth)/login/page.tsx
- `src/middleware.ts` --references--> `src/app/(app)/dashboard/page.tsx`  [INFERRED]
  src/middleware.ts → src/app/(app)/dashboard/page.tsx

## Hyperedges (group relationships)
- **App Pages Architecture** — dashboard_page, pedidos_page, clientes_page, embarques_page, produccion_page, cierre_page, facturas_page, gastos_page, nomina_page, insumos_page, reportes_page [INFERRED 0.80]
- **API Aggregator Pages** — dashboard_page, reportes_page [INFERRED 0.75]
- **Financial Management Pages** — facturas_page, gastos_page, nomina_page, cierre_page [INFERRED 0.75]
- **Database seeding process** — file_prisma_seed_ts, file_prisma_create_users, file_prisma_seed_js, db_seed_users, db_seed_productos, db_seed_trabajadores, db_seed_configs, db_seed_cliente_demo, db_seed_produccion_demo [INFERRED]
- **Offline-first synchronization architecture** — file_lib_db_offline, file_lib_db_sync, tech_dexie, pattern_offline_first, entity_offline_pedido, entity_offline_cliente, pattern_sync_queue, event_browser_online [INFERRED]
- **Multi-model AI agent pipeline** — task_full_pipeline, task_db_architecture_analysis, task_business_analysis, task_debug_project, task_insumos_module, task_nomina_vs_gastos, task_normalization_analysis, decision_multi_model_pipeline, process_agent_pipeline, agent_role_planner, agent_role_architect, agent_role_project_manager, agent_role_coder, agent_role_tester, agent_role_debugger, agent_role_security, agent_role_reviewer, agent_role_qa [INFERRED]

## Communities

### Community 0 - "App Core Architecture"
Cohesion: 0.14
Nodes (33): API /api/abonos, API /api/cierre, API /api/cierre-dia, api cierre last route, API /api/clientes, api clientes id route, API /api/config, api config BASE_DIA route (+25 more)

### Community 1 - "API Route Handlers"
Cohesion: 0.14
Nodes (4): DELETE(), GET(), POST(), PUT()

### Community 2 - "Database & Seeding"
Cohesion: 0.11
Nodes (23): BASE_DIA config, COM_REPARTIDOR config, COM_SELLADOR config, STOCK_INI_AGUA config, STOCK_INI_BOTELLON config, STOCK_INI_HIELO config, seeded cliente demo, seeded configs (+15 more)

### Community 3 - "UI Components & Forms"
Cohesion: 0.17
Nodes (21): AppSidebar, useAppStore, auth, ClienteForm, EmbarqueCard, OfflineBanner, PedidoForm, Providers (+13 more)

### Community 4 - "AI Agent Pipeline"
Cohesion: 0.18
Nodes (11): ARCHITECT agent, CODER agent, DEBUGGER agent, PLANNER agent, PROJECT_MANAGER agent, QA agent, REVIEWER agent, SECURITY agent (+3 more)

### Community 5 - "Business Analysis & Gaps"
Cohesion: 0.2
Nodes (10): ciclo diario, IQ200 schema normalization, ANALISIS-AGUA-BAMBU-V2.md, auth not configured, non-functional facturas, missing PedidoForm, commission model, embedded payment fields (+2 more)

### Community 6 - "Clientes & Produccion Pages"
Cohesion: 0.28
Nodes (3): fetchClientes(), handleDelete(), handleSubmit()

### Community 7 - "Offline-First Architecture"
Cohesion: 0.22
Nodes (9): OfflineCliente, OfflinePedido, browser online event, offline.ts, sync.ts, dynamic import, offline-first storage, sync queue (+1 more)

### Community 8 - "Offline Sync Implementation"
Cohesion: 0.29
Nodes (3): BambuOfflineDB, syncPedidos(), syncOfflineData()

### Community 9 - "Cierre Page Logic"
Cohesion: 0.4
Nodes (2): calcularNetoCaja(), handleCerrar()

### Community 10 - "PedidoForm Component"
Cohesion: 0.47
Nodes (3): calcularTotal(), getPrecio(), handleSubmit()

### Community 11 - "Productos Catalog"
Cohesion: 0.33
Nodes (6): seeded productos, Agua 19L, Bolsa Agua, Bolsa Hielo, Botellon 20L, Hielo

### Community 12 - "Insumos & Nomina Pages"
Cohesion: 0.6
Nodes (3): crearInsumo(), crearNomina(), fetchData()

### Community 13 - "UI Tabs Component"
Cohesion: 0.4
Nodes (0): 

### Community 14 - "Facturas Page"
Cohesion: 0.67
Nodes (2): fetchFacturas(), registrarAbono()

### Community 15 - "Offline Banner"
Cohesion: 0.5
Nodes (2): OfflineBanner(), useOnlineStatus()

### Community 16 - "UI Table Component"
Cohesion: 0.5
Nodes (0): 

### Community 17 - "Utils Library"
Cohesion: 0.5
Nodes (0): 

### Community 18 - "Insumos APIs"
Cohesion: 0.83
Nodes (4): api compras route, API /api/insumos, API /api/proveedores, src/app/(app)/insumos/page.tsx

### Community 19 - "CN Utility Pattern"
Cohesion: 0.5
Nodes (4): cn.ts, cn className utility, clsx, tailwind-merge

### Community 20 - "Multi-Model Analysis Tasks"
Cohesion: 0.5
Nodes (4): multi-model pipeline, business analysis task, DB architecture analysis task, debug project task

### Community 21 - "Gastos Page"
Cohesion: 1.0
Nodes (2): crearGasto(), fetchGastos()

### Community 22 - "Prisma Seed Scripts"
Cohesion: 0.67
Nodes (1): main()

### Community 23 - "App Layout Component"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "Auth Server Wrapper"
Cohesion: 0.67
Nodes (3): auth-server.ts, next-auth lib, getSession wrapper

### Community 25 - "Project README"
Cohesion: 0.67
Nodes (3): README.md, Next.js project, Geist font

### Community 26 - "Agent Rules"
Cohesion: 0.67
Nodes (3): AGENTS.md, CLAUDE.md, Next.js breaking changes warning

### Community 27 - "Insumos Module"
Cohesion: 0.67
Nodes (3): insumos module, reportes module, insumos module task

### Community 28 - "Root Layout"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Home Page"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Reportes Page"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Embarques Page"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Pedidos Page"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Dashboard Page"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Offline Page"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Login Page"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "BaseCaja Modal"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Embarque Card"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Auth Providers"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Cliente Form"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Offline Queue Hook"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Auth Server GetSession"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Create Users Script"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Nomina Module"
Cohesion: 1.0
Nodes (2): nomina module, nomina vs gastos task

### Community 44 - "Next Config"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Next Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "PostCSS Config"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "ESLint Config"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Next.js Middleware"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Service Worker"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "NextAuth Route"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "App Sidebar"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "UI Button"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "UI Badge"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "UI Input"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "UI Card"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "UI Label"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "UI Select"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "UI Dialog"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "SW Types"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Domain Types"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Auth Configuration"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "CN Helper"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Prisma Client Singleton"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "PostCSS Setup"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "ESLint Setup"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Root Layout Export"
Cohesion: 1.0
Nodes (1): src/app/layout.tsx

### Community 67 - "Offline Fallback"
Cohesion: 1.0
Nodes (1): src/app/offline/page.tsx

### Community 68 - "Pedidos API by ID"
Cohesion: 1.0
Nodes (1): api pedidos id route

### Community 69 - "Search API"
Cohesion: 1.0
Nodes (1): api search route

### Community 70 - "Auth NextAuth Handler"
Cohesion: 1.0
Nodes (1): api auth nextauth route

### Community 71 - "Globe SVG Asset"
Cohesion: 1.0
Nodes (1): globe.svg

### Community 72 - "File SVG Asset"
Cohesion: 1.0
Nodes (1): file icon SVG

### Community 73 - "Next.js SVG Logo"
Cohesion: 1.0
Nodes (1): Next.js logo SVG

### Community 74 - "Window SVG Asset"
Cohesion: 1.0
Nodes (1): window icon SVG

### Community 75 - "Vercel SVG Logo"
Cohesion: 1.0
Nodes (1): Vercel logo SVG

## Knowledge Gaps
- **7 isolated node(s):** `src/app/layout.tsx`, `src/app/offline/page.tsx`, `api cierre last route`, `api embarques id route`, `api pedidos id route` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Root Layout`** (2 nodes): `RootLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Home Page`** (2 nodes): `HomePage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Reportes Page`** (2 nodes): `ReportesPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Embarques Page`** (2 nodes): `EmbarquesPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pedidos Page`** (2 nodes): `PedidosPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Dashboard Page`** (2 nodes): `fetchDashboardData()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Offline Page`** (2 nodes): `OfflinePage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Login Page`** (2 nodes): `LoginPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `BaseCaja Modal`** (2 nodes): `BaseCajaModal()`, `base-caja-modal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Embarque Card`** (2 nodes): `EmbarqueCard()`, `embarque-card.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Providers`** (2 nodes): `Providers()`, `providers.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cliente Form`** (2 nodes): `ClienteForm()`, `cliente-form.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Offline Queue Hook`** (2 nodes): `use-offline-queue.ts`, `useOfflineQueue()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Server GetSession`** (2 nodes): `getSession()`, `auth-server.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Create Users Script`** (2 nodes): `main()`, `create-users.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Nomina Module`** (2 nodes): `nomina module`, `nomina vs gastos task`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Config`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Env Types`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PostCSS Config`** (1 nodes): `postcss.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ESLint Config`** (1 nodes): `eslint.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next.js Middleware`** (1 nodes): `middleware.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Service Worker`** (1 nodes): `sw.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `NextAuth Route`** (1 nodes): `route.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Sidebar`** (1 nodes): `app-sidebar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Button`** (1 nodes): `button.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Badge`** (1 nodes): `badge.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Input`** (1 nodes): `input.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Card`** (1 nodes): `card.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Label`** (1 nodes): `label.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Select`** (1 nodes): `select.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Dialog`** (1 nodes): `dialog.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `SW Types`** (1 nodes): `sw.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Domain Types`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Configuration`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CN Helper`** (1 nodes): `cn.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Prisma Client Singleton`** (1 nodes): `prisma.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PostCSS Setup`** (1 nodes): `postcss.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ESLint Setup`** (1 nodes): `eslint.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Root Layout Export`** (1 nodes): `src/app/layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Offline Fallback`** (1 nodes): `src/app/offline/page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pedidos API by ID`** (1 nodes): `api pedidos id route`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Search API`** (1 nodes): `api search route`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth NextAuth Handler`** (1 nodes): `api auth nextauth route`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Globe SVG Asset`** (1 nodes): `globe.svg`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `File SVG Asset`** (1 nodes): `file icon SVG`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next.js SVG Logo`** (1 nodes): `Next.js logo SVG`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Window SVG Asset`** (1 nodes): `window icon SVG`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vercel SVG Logo`** (1 nodes): `Vercel logo SVG`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `src/middleware.ts` connect `App Core Architecture` to `Insumos APIs`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `src/app/(app)/dashboard/page.tsx` (e.g. with `src/app/(app)/reportes/page.tsx` and `src/middleware.ts`) actually correct?**
  _`src/app/(app)/dashboard/page.tsx` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `src/middleware.ts` (e.g. with `src/app/(auth)/login/page.tsx` and `src/app/(app)/dashboard/page.tsx`) actually correct?**
  _`src/middleware.ts` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `API /api/pedidos` (e.g. with `src/app/sw.ts` and `API /api/clientes`) actually correct?**
  _`API /api/pedidos` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `src/app/layout.tsx`, `src/app/offline/page.tsx`, `api cierre last route` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Core Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
- **Should `API Route Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._