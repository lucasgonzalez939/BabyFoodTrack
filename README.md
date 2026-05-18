# BabyFoodTrack

Aplicacion web para registrar alimentacion, salud y crecimiento del bebe con almacenamiento local en IndexedDB y respaldo opcional en Supabase.

## Estado del proyecto (review rapido)

### Fortalezas implementadas

- Registro de alimentaciones con tipo biberon/pecho, cantidades y duracion.
- Alimentacion complementaria con alimento, gramos, reaccion y alergenos potenciales.
- Registro de panales con pipi/popo, nivel y notas.
- Registro de crecimiento (peso y altura) con visualizacion de historial.
- Modulo de salud: medicamentos, temperatura, citas y diario.
- Estadisticas, graficos y analisis personalizado.
- Soporte de zona horaria, modo oscuro y notificaciones.
- Migracion automatica de localStorage a IndexedDB con respaldo previo.
- Importacion y exportacion CSV para datos de alimentacion, panales y crecimiento.

### Riesgos detectados

- La exportacion/importacion CSV aun no incluye salud completa (medicamentos, temperatura, citas, diario).
- No existia instalacion PWA (manifest + service worker) antes de este cambio.
- No existia respaldo remoto para recovery por perdida de dispositivo/navegador.

## Novedades incluidas en este cambio

- Manifest PWA y service worker para instalacion y cache offline basica.
- Integracion de respaldo y sincronizacion de estado con Supabase.
- Esquema SQL base para tablas de respaldo en Supabase.
- Mejora del mecanismo de backup para preservar mas datos historicos.

## Requisitos

- Servidor HTTP local o hosting HTTPS (necesario para PWA y service worker).
- Proyecto Supabase (opcional, recomendado para backup remoto).

## Uso local

1. Servir la carpeta del proyecto con cualquier servidor estatico.
2. Abrir la URL en navegador.
3. Para habilitar Supabase, editar supabase-config.js.

## Configurar Supabase

1. Crear proyecto en Supabase.
2. Ejecutar el contenido de supabase-schema.sql en SQL Editor.
3. Editar supabase-config.js:

   - enabled: true
   - url: URL del proyecto
   - anonKey: anon key publica
   - profileId: opcional (si se deja vacio se genera una automaticamente)

4. En la app, ir a Ajustes y usar las acciones de respaldo/sync.

## Instalacion como app

- Con manifest.webmanifest + service-worker.js el navegador puede ofrecer instalar la app.
- En desktop: menu del navegador > Instalar app.
- En Android: Agregar a pantalla de inicio.

## Pendientes recomendados

- Ampliar alimentacion complementaria con catalogo de alimentos, texturas y tracking por ingrediente.
- Permitir campos de alimentos (tipo, cantidad en gramos, reaccion, alergias).
- Incluir salud completa en exportacion/importacion (CSV o JSON completo).
- Agregar autenticacion de usuario para politicas RLS estrictas en Supabase.
- Implementar sincronizacion bidireccional y resolucion de conflictos.
- Agregar restauracion desde respaldo Supabase desde la UI.
- Agregar pruebas automatizadas de migracion y sync.

## Archivos clave

- index.html: UI principal, carga scripts y secciones.
- app.js: logica de negocio y render.
- db.js: capa IndexedDB.
- migration.js: migracion de localStorage a IndexedDB.
- manifest.webmanifest: metadatos de instalacion PWA.
- service-worker.js: cache offline.
- supabase-sync.js: backup y sync de estado a Supabase.
- supabase-schema.sql: esquema SQL para Supabase.
