# Scalping Cripto

Aplicación web local en español para visualizar la estrategia de `scalpingcripto.MD` sobre BTC-USDT y ETH-USDT perpetuos de Binance. Solo consulta mercado público: no solicita claves y no envía órdenes.

## iPhone y acceso desde internet

Abre **https://vladimirosanchez-maker.github.io/scalping-lab/** en Safari. Funciona con Wi-Fi o datos móviles, sin mantener el computador encendido. Para dejar un acceso en el iPhone: Compartir → Añadir a pantalla de inicio.

La interfaz está publicada en GitHub Pages y consulta directamente la API pública HTTPS de Binance USD-M desde el navegador. Así evita el rechazo de Binance a las solicitudes desde Cloudflare. No necesita claves ni un computador encendido. Consulta cada 3 segundos mientras está visible; al regresar a Safari recupera la conexión. El servidor Node local también usa Binance. El Worker queda como adaptador opcional, pero la web publicada no depende de él.

Tu capital configurado y diario se guardan en el navegador de cada dispositivo: no se publican en GitHub y no se sincronizan entre computador e iPhone. El sitio no conecta tu cuenta de Binance. La disponibilidad de los datos depende de Binance y de los servicios de alojamiento.

### Actualizar la versión publicada

Los cambios en `main` ejecutan `.github/workflows/pages.yml`: instala dependencias, ejecuta las pruebas, construye `dist/` y publica en GitHub Pages. `deployment.json` contiene únicamente direcciones públicas. La compilación usa rutas relativas para funcionar dentro de `/scalping-lab/`.

```powershell
npm run build:pages
# Si cambias el servidor de mercado, publica también el Worker:
npm run deploy:api
```

Las credenciales de GitHub y Cloudflare permanecen fuera del repositorio. Las capturas, diarios exportados, archivos de sesión, imágenes ajenas al proyecto y dependencias no se incluyen en el sitio.

## Abrir en Windows

Haz doble clic en **Abrir-Scalping.cmd**. Abre `http://127.0.0.1:4173` en tu navegador. Requiere Node.js 22 o superior; las dependencias se instalan en la primera ejecución si faltan. El servidor escucha solo en el equipo local.

Alternativa desde PowerShell en esta carpeta:

```powershell
npm ci
npm start
```

Abre `http://127.0.0.1:4173`. Con este inicio en terminal, Ctrl+C detiene el servidor. La página necesita que el servidor esté activo. Después de reiniciar el equipo o si la dirección deja de responder, ejecuta otra vez **Abrir-Scalping.cmd**. El lanzador de doble clic lo deja en segundo plano; sus registros son `scalping.log` y `scalping-error.log`.

## Uso

1. Empieza por la tarjeta **1H**. El asistente explica cada filtro.
2. Selecciona **15m** para revisar el retroceso; **5m** para la ruptura.
3. Las casillas permiten ocultar EMA 20/55/200, VWAP y marcas de giros. Arrastra el gráfico para explorar. **Rueda hacia arriba: acercar y ensanchar las velas. Rueda hacia abajo: alejar y estrechar las velas.** El zoom se centra en la posición del cursor y se aplica simultáneamente a volumen, RSI y ADX/DI. Sobre el gráfico, la rueda no desplaza la página; fuera de él, funciona normalmente. El precio conserva su ajuste vertical automático y cada indicador su propia escala. La actualización del mercado conserva el zoom. **Centrar** vuelve a las últimas 100 velas.
4. En **Plan de operación**, introduce tu capital total, margen máximo de la operación, riesgo y apalancamiento (selector de **1X a 10X**). Los campos están en la propia calculadora: los resultados se recalculan automáticamente al editar valores válidos, sin pulsar el botón. Si falta un dato o es inválido, se eliminan los resultados anteriores. Puedes editar las comisiones y otros gastos en el desplegable. Introduce dirección, entrada y stop. TP vacío calcula un objetivo para la relación neta configurada. Cada escenario SL/TP muestra precio, resultado bruto, comisiones de entrada y salida, deslizamiento, funding y **neto a ganar o perder**. El SL conserva tu precio técnico. En modo **Calcular con mi margen y apalancamiento** (inicial), el tamaño se obtiene de tu margen × apalancamiento; si excede el presupuesto de riesgo, se muestra una advertencia y se bloquea el checklist. En **Ajustar tamaño al riesgo**, la posición se reduce para respetar el presupuesto, por lo que cambiar el apalancamiento puede mantener el mismo resultado neto y modificar solo el margen utilizado. Verifica manualmente si el TP tiene espacio. “Usar estructura” carga un plan orientativo cuando 1H y 15m están alineados y existe stop de 5m.
5. Revisa las noticias y marca los controles manuales. No existe calendario automático. La verificación de noticias vence a los 30 minutos; el espacio para TP debe verificarse de nuevo en cada cierre de 5m.
6. Registra las operaciones cerradas en **Diario de práctica**, con resultado neto y fecha en Bogotá. Los límites diarios son controles sobre lo que registres, no datos de tu cuenta. El CSV permite guardar una copia.
7. Abre **Aprende la estrategia** para las explicaciones, reglas exactas y diferencias respecto del MD original.

La fila superior de la vela usa **O** (apertura, blanco), **H** (máximo, verde), **L** (mínimo, rojo) y **C** (cierre/actual provisional, verde si supera la apertura, rojo si está por debajo y blanco si coincide). Los precios están en negrilla. Al mover el cursor sobre una vela histórica, se conservan sus valores durante las actualizaciones; al salir del gráfico, vuelve la vela actual.

## Qué muestra

- Velas OHLC de 1H, 15m y 5m, volumen y EMA 20/55/200.
- VWAP de sesión UTC con precio típico y volumen de cada temporalidad.
- RSI 14 y ADX/+DI/−DI 14 de Wilder.
- Giros confirmados (HH, HL, LH, LL), checklist y señal técnica de la última vela cerrada.
- Plan de riesgo con comisiones por lado, deslizamiento estimado, reserva total de funding, redondeo de cantidad y límite de margen.
- Parámetros editables de capital, riesgo, margen, apalancamiento, costes, relación neta, umbral ADX, colchón de stop y límites diarios. Los indicadores y temporalidades permanecen fijos para conservar la estrategia.
- Diario persistente en localStorage de este navegador. Cambiar de navegador u origen (localhost frente a 127.0.0.1) crea un almacenamiento separado.

## Reglas de interpretación

Las expresiones discrecionales del MD se implementan con reglas explícitas. Todos los filtros de 1H y 15m son obligatorios; EMA 200 se exige también para SHORT. La dirección neutral muestra el checklist más cercano sin permitir una señal. Pivotes estrictos 2+2: dos velas a cada lado; una vela que es máximo y mínimo se omite. Las etiquetas se dibujan **en su confirmación**, dos velas después del giro. No son señales históricas de entrada.

El retroceso de 15m debe ser el último giro confirmado y tener antigüedad máxima de 12 velas. En 5m se exige cruce con cierre del extremo previo al giro de retroceso (también de hasta 12 velas), más 3 de 4: rechazo de EMA20/55/VWAP en 6 velas con tolerancia 0,15 ATR, DI alineado, ADX creciente tras una pausa en las dos comparaciones previas y RSI recuperando 50 para LONG o cayendo desde 50–60 para SHORT dentro de las tres velas previas. El ATR se usa solo para tolerancia, no como filtro adicional del MD.

Las señales usan el último cierre de 5m y solo velas de 15m/1H cerradas para ese instante. Se muestran velas abiertas con indicadores provisionales en el gráfico, pero no confirman señales. Se requieren al menos 250 velas cerradas y continuidad en las últimas 220. Se consultan 600 velas por temporalidad cada 3 segundos, con caché local de 2 segundos y agrupación de consultas simultáneas. Los fallos de red, datos de más de 35 segundos y discontinuidades bloquean las señales. No hay sustitución por datos ficticios.

La señal técnica es independiente del checklist final de revisión. Este exige además noticias, espacio para objetivo, límites del diario y plan aceptable calculado para el mismo cierre de 5m y dirección, con entrada a no más de 0,15 ATR del cierre de referencia. No se ejecutan operaciones. No incluye alertas push, backtesting ni evaluación de rentabilidad histórica.

## Cálculo del riesgo

Para cantidad `q`, entrada `E`, stop `S`, comisión/deslizamiento de entrada `a` y salida `b`:

`pérdida prevista = q × (|E − S| + E×a + S×b) + reservaFunding`

En modo riesgo, la cantidad se calcula a partir del presupuesto restante y se limita por margen máximo × apalancamiento. En modo margen se usa min(margen elegido, capital total) × apalancamiento / entrada, sin reducir automáticamente la exposición por riesgo; el presupuesto se evalúa aparte y cualquier exceso bloquea la revisión final. Se redondea hacia abajo según la precisión del contrato. Para TP automático se despeja el precio que alcanza la relación **neta** elegida después de gastos. El stop de estructura se coloca fuera del giro con colchón; no se fuerza a 100 USD. El objetivo no es una predicción de precio ni una garantía de ejecución. La reserva de funding es manual; el funding publicado se muestra como referencia y puede cambiar.

## Verificación

```powershell
npm test
# Con el servidor iniciado y Microsoft Edge instalado:
npm run test:ui
# Prueba específica de rueda, sincronización y conservación del zoom:
npm run test:zoom
# Recalculo automatico y cambios de margen, apalancamiento y precios:
npm run test:calculator
```

Las pruebas de navegador usan un contexto aislado: no escriben en el diario del usuario. Capturas y resultados de verificación quedan en `artifacts/`. Las pruebas de indicadores, riesgo y uso de velas cerradas no requieren internet. Las pruebas del navegador sí consultan el feed de Binance y verifican fallo/recuperación de red.

## Fuentes y atribución

- Estrategia local: [scalpingcripto.MD](./scalpingcripto.MD).
- [Binance API](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Exchange-Information): velas `/fapi/v1/klines`, marca y funding `/fapi/v1/premiumIndex`, especificaciones `/fapi/v1/exchangeInfo`. Consultas GET públicas verificadas en este entorno sin autenticación. Disponibilidad sujeta a Binance y tu red/región.
- [Lightweight Charts™](https://tradingview.github.io/lightweight-charts/) de [TradingView](https://www.tradingview.com/), distribuido bajo Apache 2.0; aviso de la versión 5.2.0 conservado en `NOTICE` y servido en `/NOTICE`.

La estrategia no aporta un historial probado de rentabilidad. La aplicación sirve para análisis y práctica; un stop normal y un presupuesto calculado no garantizan una pérdida máxima real.

## Mercados y vistas guardadas

El selector permite BTC/USDT y ETH/USDT. Cambiar moneda limpia el plan para evitar mezclar precios. El diario comparte los límites diarios entre monedas.

Ajusta el zoom y pulsa **Guardar vista**. Se conserva una vista por moneda y temporalidad en este navegador, incluso tras recargar. Otro clic sustituye la anterior. Se guardan encuadre, escala manual e indicadores visibles. Una vista junto a la última vela sigue el mercado; una histórica conserva su fecha mientras esté en las 600 velas disponibles. Centrar no sobrescribe la vista guardada.

El precio se consulta cada 3 segundos con la página visible; al volver a la pestaña o recuperar internet se reinicia la conexión. Los fallos se reintentan y los datos antiguos bloquean señales. El alojamiento público funciona sin el PC, pero depende de GitHub, Cloudflare, Binance y la conexión del dispositivo.

La migración conserva vistas, diario y parámetros de comisiones del usuario. Los mínimos y pasos de cantidad se leen de LOT_SIZE y MIN_NOTIONAL; la precisión de precio se obtiene de PRICE_FILTER. Las comisiones siguen siendo editables y deben corresponder a la cuenta del usuario.

## Apariencia de indicadores

RSI 14 sobre cierre, SMA 14 blanca y niveles 30/50/70 con relleno violeta. RSI y SMA muestran velas cerradas. SQZMOM_LB usa BB 20/2 y KC 20/1,5 con SMA de True Range y regresión lineal de 20. Se implementa la fórmula corregida publicada por [LazyBear](https://www.tradingview.com/script/nqQ1DT5a-Squeeze-Momentum-Indicator-LazyBear/), respetando el multiplicador BB 2. ADX 14/DI 14 se dibuja blanco en escala izquierda con referencia 23; el momentum usa escala derecha. Los DI siguen calculándose para el asistente. El nivel visual 23 es independiente del umbral configurable de señales; SQZ no añade entradas automáticas. Guardar vista conserva ambas escalas del panel combinado.

El SQZ se dibuja como área continua respecto al cero, con relleno transparente y cuatro tonos según signo e impulso. El logo utiliza la imagen naranja con S azul y velas aportada por el usuario, también en el icono de inicio de iPhone.

## Scalping Cripto: temporalidades y logo

Gráficos: 5m, 15m, 1H, 4H, D (diario), W (semanal) y M (mensual), según las sesiones UTC de Binance. Cada selección conserva su propia vista por moneda. Se consulta la temporalidad visible junto a las tres de la estrategia; la estrategia continúa usando 1H/15m/5m. M utiliza meses de calendario, no bloques de 30 días. El historial mensual puede no alcanzar 200 velas y la EMA 200 queda sin dibujar con aviso explícito.

Logo circular naranja, S azul oscuro en 3D sin sombra proyectada y velas delgadas verdes/rojas. Interpretación de «#d»: 3D, azul de referencia #08285c. Generado con la herramienta integrada de imágenes a partir del logo del usuario, con texto SCALPING CRIPTO. Prompt: círculo naranja sobre transparencia; S azul oscuro con volumen sin sombra, brillo metálico ni reflejos; velas delgadas 3D, cada una roja o verde; nombre inferior SCALPING CRIPTO. Asset final: public/scalping-round.png.
