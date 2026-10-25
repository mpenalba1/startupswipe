# startupswipe: el sitio web

El sitio público de StartupSwipe: https://mpenalba1.github.io/startupswipe/

Es HTML estático servido por GitHub Pages desde la raíz de `main`. Las páginas se generan con un script de Node sin
dependencias (`tools/build.mjs`) y **se suben ya generadas**: GitHub Pages no corre nada.

## Qué hay

| Página | Dirección | De dónde sale |
|---|---|---|
| Inicio | `/` y `/es/` | `content/site.mjs` (todos los textos, en inglés y en español) |
| Noticias | `/news/` y `/es/noticias/`, una página por noticia, y un feed Atom en cada una (`feed.xml`) | `content/news/*.md` |
| Prensa | `/press/` y `/es/prensa/`, con un ZIP de todo el arte | `content/site.mjs` y `press/files/` |
| Privacidad, Soporte | `/privacy.html` y `/support.html` (con `#es`) | `content/pages/privacy.html` y `support.html` |
| Encuesta del capítulo I | `/encuesta.html` (sin enlaces, `noindex`) | `content/pages/encuesta.html` |

Privacidad, Soporte y la Encuesta mantienen sus direcciones porque App Store Connect apunta a ellas. Su texto está tal
cual en `content/pages/`; el script solo les pone el marco (cabecera y pie).

## Cómo se cambia algo

1. Edita el texto en `content/` (o el estilo en `assets/css/site.css`).
2. Genera el sitio: `node tools/build.mjs`
3. Míralo en tu compu: `python3 -m http.server 8000` en esta carpeta y abre http://localhost:8000/
4. Haz commit de todo (lo que editaste y lo que se generó) y súbelo.

## Cómo se publica una noticia

1. Crea un archivo en `content/news/`, con la fecha y una palabra clave en el nombre, y el idioma al final:
   `2026-11-02-demo.en.md` y, si va en los dos idiomas, `2026-11-02-demo.es.md`. Los dos archivos con el mismo
   nombre (menos el idioma) quedan unidos: el botón de idioma de una lleva a la otra.
2. Arriba van los datos, entre dos líneas `---`; abajo, el texto:

   ```
   ---
   title: La demo ya está en Steam
   date: 2026-11-02
   lang: es
   slug: demo-en-steam
   summary: Una frase para la lista de noticias y para las redes.
   draft: true
   ---

   El primer párrafo.

   El segundo, con un [enlace](https://store.steampowered.com/) y algo en **negrita**.

   ![Texto que describe la imagen](assets/news/demo.png)
   ```

   - `title`, `date` (año-mes-día) y `lang` (`en` o `es`) son obligatorios.
   - `slug` es la dirección de la noticia (`/es/noticias/demo-en-steam/`): minúsculas, números y guiones. Si no
     está, sale del nombre del archivo.
   - `summary` es opcional; si no está, se usa el primer párrafo.
   - `image` es opcional: una imagen para cuando se comparte el enlace (por ejemplo `assets/news/demo.png`).
   - Con `draft: true` la noticia **no se publica**: no aparece en la lista, ni en el feed, ni en el inicio.
   - El texto admite párrafos, `## subtítulos`, listas con `-`, citas con `>`, imágenes, enlaces, `**negrita**` y
     `*cursiva*`. Las imágenes van en `assets/news/`.
3. Para ver los borradores antes de publicarlos: `node tools/build.mjs --preview` y abre
   http://localhost:8000/_preview/ (la carpeta `_preview/` no se sube).
4. Para publicarla, borra la línea `draft: true`, corre `node tools/build.mjs`, haz commit y súbelo. Las tres
   últimas noticias de cada idioma salen también en el inicio.

Ojo: el repositorio es público, así que un borrador que se sube a GitHub se puede leer en el código aunque no salga en
el sitio. Si es reservado, no lo subas hasta que esté listo.

## Las tiendas

Mientras no haya página en una tienda, su botón dice «Coming soon» / «Próximamente» y no lleva a ningún lado. Cuando
la haya, pon la dirección en `config.stores` de `content/site.mjs` y genera el sitio: el botón pasa a ser un enlace.

## El arte

Todo sale de `StartUpSwipeReload/marketing/` (el arte de Steam, las capturas y los GIF aprobados) y del mismo render
del mundo que usó el arte de Steam (`assets/art/world-dusk.png`, 1300×790 a 1×). El pixel art se muestra siempre a
escala entera y con `image-rendering: pixelated`. El video de arriba es el timelapse de `marketing/promo/public/timelapse`
recomprimido (`assets/video/`). Las fuentes son las del juego (Pixelify Sans y VT323, licencia OFL, en
`assets/fonts/`); el texto largo usa Atkinson Hyperlegible de Google Fonts.

Si el sitio pasa a un dominio propio, cambia `config.siteUrl` en `content/site.mjs` y genera de nuevo.
