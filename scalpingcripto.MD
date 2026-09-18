# Scalping Cripto BTC — Estrategia Intradía 1H → 15m → 5m

## Pregunta original

> "Quiero hacer unas dos o tres operaciones en scalping intradia basado en temporalidad de 5 y 15 minutos teniendo presente la de 1H. Puedes armar una estrategia lógica para hacer scalping como te indico? Si tienes preguntas házmelas hasta tener el 98% de certeza de lo que te pido"

---

# 1. Parámetros definidos

A partir de las respuestas dadas, la estrategia queda configurada así:

| Parámetro | Configuración |
|---|---:|
| Mercado | BTCUSDT Perpetual Futures |
| Plataforma objetivo | BingX |
| Apalancamiento | 5X |
| Tipo de margen | Isolated |
| Capital total disponible | 6.000 USDT |
| Margen por operación | 3.000 USDT |
| Exposición nominal aproximada | 15.000 USDT |
| Dirección | LONG y SHORT |
| Máximo de operaciones diarias | 2–3 |
| Objetivo inicial de movimiento BTC | +$200 |
| Stop inicial de referencia | -$100 |
| Riesgo máximo por operación | 0,5% del capital |
| Temporalidades | 1H → 15m → 5m |
| Indicadores | EMA 20, EMA 55, EMA 200, VWAP, RSI 14, ADX 14, +DI, -DI |
| Horario | Cualquier hora |
| Filtro de noticias | Sí |

---

# 2. Arquitectura de la estrategia

La estrategia trabaja de arriba hacia abajo:

**1H = dirección principal**

⬇️

**15m = estructura y zona**

⬇️

**5m = gatillo exacto de entrada**

Cada temporalidad tiene una función distinta. No se debe comenzar mirando 5 minutos.

---

# 3. Configuración de TradingView

Agregar los siguientes indicadores:

- EMA 20
- EMA 55
- EMA 200
- VWAP
- RSI 14
- ADX 14
- +DI
- -DI

## Función de cada indicador

**EMA 20:** impulso rápido.

**EMA 55:** tendencia intermedia.

**EMA 200:** régimen principal.

**VWAP:** precio medio ponderado intradía.

**RSI:** momentum.

**ADX:** fuerza de la tendencia.

**+DI / -DI:** dirección dominante.

---

# 4. Paso 1 — Analizar temporalidad 1H

Nunca comenzar en 5 minutos.

Primero definir si el mercado está:

- LONG permitido
- SHORT permitido
- NO OPERAR

## LONG permitido

Preferentemente:

- Precio > EMA20 > EMA55
- Precio sobre EMA200
- Estructura HH + HL
- RSI > 50
- +DI > -DI
- ADX > 20–25 y subiendo

Resultado:

**BUSCAR SOLO LONG**

Esto no significa comprar inmediatamente.

## SHORT permitido

Preferentemente:

- Precio < EMA20 < EMA55
- Estructura LL + LH
- RSI < 50
- -DI > +DI
- ADX > 20–25 y aumentando

Resultado:

**BUSCAR SOLO SHORT**

## NO OPERAR

Ejemplo:

- Precio encima de EMA55 pero debajo de EMA20
- RSI alrededor de 49
- ADX cayendo
- +DI y -DI cruzándose constantemente

Resultado:

**NO OPERAR**

---

# 5. Paso 2 — Analizar temporalidad 15 minutos

En 15m se busca estructura, no la entrada.

## Caso bajista

Si 1H es bajista, buscar:

**LL → rebote → LH**

Es decir:

1. mínimo menor
2. pullback
3. máximo menor

Confirmaciones deseables:

- precio debajo de VWAP
- precio debajo de EMA20/EMA55
- -DI > +DI
- RSI < 50

Cuando esto ocurre:

**SHORT PREPARADO**

Todavía no se entra.

## Caso alcista

Si 1H es alcista, buscar:

**HH → retroceso → HL**

Confirmaciones deseables:

- precio encima de VWAP
- precio encima de EMA20/EMA55
- +DI > -DI
- RSI > 50

Cuando esto ocurre:

**LONG PREPARADO**

Todavía no se entra.

---

# 6. Paso 3 — Entrada en 5 minutos

5m es la temporalidad del gatillo.

## Ejemplo SHORT

BTC sube durante el pullback:

- 77.600
- 77.650
- 77.690
- 77.720

Encuentra resistencia.

Después:

- 77.700
- 77.670
- 77.640

Aquí comienza a interesar.

Buscar al menos 3 de estas 4 confirmaciones:

1. rechazo de resistencia / VWAP / EMA
2. -DI vuelve a superar +DI
3. ADX deja de caer y comienza a aumentar
4. RSI rechaza aproximadamente 50–60 y vuelve a caer

Además:

**debe romper el mínimo local que inició el rebote**

Ese es el gatillo.

---

# 7. Ejemplo completo SHORT

Supongamos:

**BTC = 77.600**

1H:

**bajista**

15m:

**LL + LH**

5m:

pullback hasta 77.700

rechazo

rompe nuevamente 77.600

Planteamiento:

**SHORT:** 77.590

**SL:** 77.690

**TP:** 77.390

Riesgo:

**$100 de movimiento BTC**

Objetivo:

**$200 de movimiento BTC**

Relación aproximada:

**1:2**

---

# 8. Cálculo con 3.000 USDT de margen a 5X

Margen:

**3.000 USDT**

Apalancamiento:

**5X**

Exposición nominal aproximada:

**15.000 USDT**

Si BTC está alrededor de 77.590:

Cantidad BTC aproximada:

15.000 / 77.590 ≈ **0,1933 BTC**

## Pérdida con stop de $100

0,1933 × 100 ≈ **19,33 USDT**

Sobre un capital total de 6.000 USDT:

19,33 / 6.000 ≈ **0,32%**

Esto está por debajo del máximo seleccionado de 0,5%.

## Ganancia con objetivo de $200

0,1933 × 200 ≈ **38,66 USDT brutos**

Hay que descontar:

- comisión de entrada
- comisión de salida
- funding si aplica

Por tanto, la ganancia neta será menor.

---

# 9. Ejemplo LONG

1H:

**alcista**

15m:

**HH → retroceso → HL**

5m:

- precio toca soporte / EMA / VWAP
- aparece rechazo
- +DI > -DI
- ADX empieza a subir
- RSI recupera 50
- BTC rompe máximo local de 5m

Ejemplo:

**Entrada LONG:** 77.600

**SL:** 77.500

**TP:** 77.800

No se compra simplemente porque BTC llegó a 77.500.

Se compra únicamente si aparece confirmación.

---

# 10. Cómo usar correctamente el ADX

ADX no indica dirección.

**ADX alto no significa comprar.**

Puede existir:

**ADX 35 mientras BTC cae con fuerza**

ADX solo indica fuerza de tendencia.

La dirección se obtiene de:

- estructura
- EMA
- VWAP
- +DI
- -DI

## Para SHORT

Preferentemente:

**-DI > +DI + ADX aumentando**

## Para LONG

Preferentemente:

**+DI > -DI + ADX aumentando**

Una señal especialmente interesante aparece cuando:

- ADX cae durante el pullback
- termina el pullback
- ADX vuelve a subir

Esto puede indicar reanudación del impulso.

---

# 11. Cómo usar el RSI

Evitar reglas como:

**RSI 30 = comprar**

El RSI puede permanecer sobrevendido mientras BTC sigue cayendo.

Para esta estrategia interesa especialmente el nivel **50**.

## En tendencia alcista

RSI retrocede hacia:

**40–50**

y vuelve a subir.

Interesante para LONG.

## En tendencia bajista

RSI rebota hacia:

**50–60**

y vuelve a caer.

Interesante para SHORT.

---

# 12. Regla del Stop Loss

Nunca mover el stop alejándolo para evitar una pérdida.

Ejemplo:

LONG:

entrada 77.600

SL 77.500

Si BTC baja:

No hacer:

77.500 → 77.400 → 77.300

Aceptar el stop.

El stop solamente puede moverse:

**a favor de la operación**

Nunca en contra.

---

# 13. Gestión cuando la operación va ganando

Si el objetivo es +$200 y BTC avanza aproximadamente +$100:

No cerrar automáticamente.

Analizar 5m.

Si:

- la estructura sigue favorable
- ADX sigue fuerte
- DI continúa alineado
- no aparece rechazo importante

Mantener TP.

Si aparece:

- rechazo fuerte
- cruce DI contrario
- pérdida de estructura

se puede proteger la operación.

A futuro conviene comparar mediante backtesting:

- TP fijo
- break-even
- salida parcial
- trailing stop

---

# 14. Regla de riesgo

Aunque el stop de $100 sobre una posición nominal de 15.000 USDT genera aproximadamente un riesgo bruto de 0,32%, el límite máximo será:

**0,5% del capital total**

Capital total:

6.000 USDT

0,5% = **30 USDT**

Por tanto:

**pérdida máxima teórica por operación = 30 USDT**

Si una estructura necesita un stop más amplio, se debe reducir el tamaño de posición.

No se debe aumentar el riesgo simplemente para mantener 3.000 USDT de margen.

---

# 15. Tres prohibiciones principales

## Prohibición 1 — Dos stops consecutivos

Después de **2 stops consecutivos**:

**SE TERMINÓ EL TRADING DEL DÍA**

No intentar recuperar inmediatamente las pérdidas.

## Prohibición 2 — No perseguir velas

Si BTC cae $300 violentamente:

No abrir SHORT al final de la caída.

Esperar:

**caída → pullback → LH → rechazo → entrada**

## Prohibición 3 — Noticias

No abrir nuevas posiciones aproximadamente:

**15 minutos antes**

hasta al menos:

**30 minutos después**

de eventos importantes como:

- CPI
- PCE
- NFP
- FOMC
- decisión de tasas
- Powell
- datos macroeconómicos de alta volatilidad

Si la primera reacción es extremadamente violenta, esperar más.

---

# 16. Checklist de 30 segundos

Antes de pulsar LONG o SHORT:

### 1H

¿Alcista, bajista o neutral?

### 15m

¿HH/HL o LL/LH?

### VWAP

¿Estoy del lado correcto?

### 5m

¿Hubo pullback?

### ADX

¿Está recuperando fuerza?

### DI

¿Está del lado de mi operación?

### RSI

¿Confirma momentum?

### Estructura

¿Existe ruptura/rechazo real?

### Stop

¿El SL técnico respeta el riesgo máximo?

### Resultado

Si todo cuadra:

**OPERACIÓN**

Si hay dudas:

**NO OPERAR**

---

# 17. Máximo de operaciones diarias

No buscar tres operaciones obligatoriamente.

Buscar:

**hasta 3 oportunidades A+**

Ejemplo razonable:

- lunes: 1 operación
- martes: 0
- miércoles: 2
- jueves: 1
- viernes: 3

La prioridad es la calidad de la entrada, no la cantidad.

---

# 18. Resumen operativo

## Para LONG

1. 1H alcista
2. 15m HH + HL
3. Precio encima de VWAP
4. Pullback
5. +DI > -DI
6. ADX vuelve a subir
7. RSI recupera 50
8. 5m rompe máximo local
9. Entrada
10. SL técnico
11. TP mínimo 1:2

## Para SHORT

1. 1H bajista
2. 15m LL + LH
3. Precio debajo de VWAP
4. Pullback
5. -DI > +DI
6. ADX vuelve a subir
7. RSI rechaza 50–60
8. 5m rompe mínimo local
9. Entrada
10. SL técnico
11. TP mínimo 1:2

---

# 19. Principio central de la estrategia

La estrategia no intenta adivinar techos o pisos.

Busca:

**tendencia → pullback → confirmación → continuación**

La lógica principal es:

**1H determina la dirección**

**15m determina la estructura**

**5m determina la entrada**

---

# 20. Siguiente evolución recomendada

La siguiente fase lógica es convertir estas reglas en una estrategia o indicador de TradingView en Pine Script que pueda mostrar:

- LONG
- SHORT
- NO OPERAR
- SL
- TP
- alertas
- alineación 1H + 15m + 5m

Después se puede realizar backtesting antes de utilizar capital real.

---

## Nota importante

Esta estrategia es una metodología técnica y de gestión de riesgo. No garantiza ganancias. El apalancamiento amplifica tanto ganancias como pérdidas, por lo que conviene probar primero en simulación o con un tamaño inferior antes de operar con el margen completo.
