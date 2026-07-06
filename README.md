# 🐟🤠 Fish Poker

Texas Hold'em para jugar con amigos. Fichas virtuales (nada de dinero real),
sin registro: entrás con un nickname, creás una mesa y compartís el código.
Pensada como PWA: desde el celu se instala con "Agregar a pantalla de inicio".

## Cómo correrla local

```bash
npm run install:all   # instala server + client (solo la primera vez)
npm run build         # compila el cliente
npm start             # sirve todo en http://localhost:3001
```

Para desarrollo con hot-reload: `npm run dev` (Vite en :5173 con proxy al server en :3001).

## Cómo publicarla para jugar con amigos

La app necesita una URL pública con HTTPS (requisito de la PWA y del juego
en tiempo real). Opción recomendada, gratis:

1. Subí este repo a GitHub.
2. Creá una cuenta en [Render](https://render.com) y elegí **New → Blueprint**,
   apuntando al repo: el archivo `render.yaml` ya define todo (build + start).
3. Te da una URL tipo `https://fish-poker.onrender.com` — ese es el link para
   tus amigos. Desde la mesa, el botón **Compartir** ya arma la invitación
   con el código precargado.

> Nota: en el plan gratuito de Render el servidor se duerme tras ~15 min sin
> uso; la primera visita después de eso tarda unos segundos en despertar.
> Las mesas viven en memoria: si el server se reinicia, se pierden las
> partidas en curso (los stacks duran lo que dure la partida).

## Cómo se juega

- El que crea la mesa es el **admin** (⭐): reparte la primera mano, puede
  asignar fichas y es el único que puede finalizar la partida.
- Cada jugador arranca con 10.000 en fichas físicas: 3×1000, 4×750, 4×500,
  4×250 y 10×100. El ganador de cada mano se lleva las fichas apostadas tal
  cual. Los stacks se arrastran mano tras mano hasta que el admin finaliza.
- Reglas según el reglamento oficial de Texas Hold'em (carta quemada antes de
  cada calle, side pots, Escalera Real incluida).
- Y cuando ganás una mano… **Paaasame la salsa!** 🍅

## Stack técnico

React + Vite (cliente) · Node + Express + Socket.io (servidor, estado en
memoria) · PWA con service worker (shell offline, HTML network-first).
