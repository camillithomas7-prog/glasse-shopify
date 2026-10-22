#!/usr/bin/env python3
"""Turns ~/glasse-landing (index.html + styles.css + app.js + assets/) into the glassé Shopify theme.

index.html is split by its <!-- SECTION: ... --> markers:
  announcement-bar + header  -> sections/glasse-header.liquid  (every page)
  <main> content + sticky ATC -> snippets/glasse-landing.liquid (home + main product page)
  footer                     -> sections/glasse-footer.liquid  (every page)
  cart drawer                -> snippets/glasse-drawer.liquid  (every page, real Ajax cart)
Run again after every change to the landing: python3 build.py
"""
import pathlib, re, shutil

ROOT = pathlib.Path(__file__).parent
SRC = pathlib.Path.home() / "glasse-landing"
MAX_LIQUID = 130_000  # Shopify silently drops .liquid files over ~140 KB

GENERIC_CSS = """
/* ---- Generic Shopify pages (collection, page, 404, search, customers) ---- */
.dp-page { max-width: 820px; padding: 56px 16px 80px; }
.dp-page h1 { font-size: clamp(2.2rem, 7vw, 3.4rem); margin-bottom: 18px; }
.dp-page h2 { font-size: 1.6rem; margin: 26px 0 10px; }
.dp-page p, .dp-page li { color: var(--muted); }
.dp-page input:not([type=hidden]), .dp-page textarea, .dp-page select { width: 100%; padding: 13px 16px; border-radius: 16px; border: 1.5px solid rgba(59,18,32,.18); font: inherit; background: #fff; margin: 6px 0 12px; }
.dp-page form { display: grid; gap: 4px; text-align: left; }
.dp-btn { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 999px; padding: 14px 26px; font-weight: 700; cursor: pointer; text-decoration: none; background: var(--berry); color: #fff; }
.dp-btn--wide { width: 100%; }
.dp-sec { padding: 56px 16px 80px; }
.dp-sec__head { text-align: center; margin-bottom: 28px; }
.dp-sec__head p { color: var(--muted); margin-top: 8px; }
.dp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.dp-card { display: block; background: #fff; border-radius: var(--r); overflow: hidden; text-decoration: none; box-shadow: var(--shadow); }
.dp-card__media { position: relative; aspect-ratio: 4 / 5; background: var(--cream); }
.dp-card__media img { width: 100%; height: 100%; object-fit: cover; }
.dp-card__badge { position: absolute; top: 12px; left: 12px; background: var(--salmon); color: var(--berry); font-weight: 700; font-size: .78rem; padding: 4px 10px; border-radius: 999px; }
.dp-card__body { padding: 14px 16px 18px; display: grid; gap: 4px; }
.dp-card__cat { font-size: .74rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.dp-card__title { font-size: 1.1rem; }
.dp-card__price { display: flex; gap: 8px; align-items: baseline; }
.dp-card__now { font-weight: 700; }
.dp-card__was { text-decoration: line-through; color: var(--muted); font-size: .9rem; }
.dp-prod { display: grid; gap: 28px; }
@media (min-width: 720px) { .dp-prod { grid-template-columns: 1fr 1fr; align-items: start; } }
.dp-page .rte img { border-radius: 16px; }
"""


def chunk(html, start_marker, end_marker=None):
    a = html.index(start_marker)
    b = html.index(end_marker, a) if end_marker else len(html)
    return html[a:b]


def liquidize(fragment):
    """Local asset paths -> Shopify asset_url."""
    return re.sub(r"assets/([\w.-]+\.(?:webp|png|jpg|svg))", r"{{ '\1' | asset_url }}", fragment)


def main():
    html = (SRC / "index.html").read_text(encoding="utf-8")

    # ---- assets
    for f in (SRC / "assets").iterdir():
        if f.suffix in (".webp", ".png", ".jpg", ".svg"):
            shutil.copy(f, ROOT / "assets" / f.name)
    shutil.copy(SRC / "app.js", ROOT / "assets" / "glasse.js")
    css = (SRC / "styles.css").read_text(encoding="utf-8")
    (ROOT / "assets" / "glasse.css").write_text(css + GENERIC_CSS, encoding="utf-8")

    # ---- header (announcement + header)
    header = chunk(html, "<!-- SECTION: announcement-bar -->", "<main id=\"main\">")
    header = liquidize(header)
    header = header.replace('href="#top"', 'href="{{ routes.root_url }}"')
    # In-page nav anchors: relative on landing pages, via home elsewhere
    header = re.sub(r'href="#(ritual|dose|ingredients|faq)"', r'href="{{ nav_base }}#\1"', header)
    header = header.replace(
        '<p>free shipping over $35',
        '<p>free shipping over {{ settings.free_ship_threshold | times: 100 | money_without_trailing_zeros }}')
    header = ('{%- liquid\n'
              '  assign nav_base = routes.root_url\n'
              '  if template.name == "index" or product.handle == settings.main_product\n'
              '    assign nav_base = ""\n'
              '  endif\n'
              '-%}\n' + header +
              '\n{% schema %}\n{ "name": "glassé header", "settings": [] }\n{% endschema %}\n')
    (ROOT / "sections" / "glasse-header.liquid").write_text(header, encoding="utf-8")

    # ---- landing body (+ sticky ATC)
    main = chunk(html, '<main id="main">', "</main>")
    main = main[len('<main id="main">'):]
    sticky = chunk(html, "<!-- Sticky ATC (mobile) -->", "<!-- SECTION: cart-drawer")
    landing = liquidize(main + "\n" + sticky)
    (ROOT / "snippets" / "glasse-landing.liquid").write_text(landing, encoding="utf-8")

    # ---- footer
    footer = chunk(html, "<!-- SECTION: footer -->", "<!-- Sticky ATC (mobile) -->")
    footer = liquidize(footer)
    links = {
        "Privacy policy": "{{ shop.privacy_policy.url | default: '/policies/privacy-policy' }}",
        "Terms of service": "{{ shop.terms_of_service.url | default: '/policies/terms-of-service' }}",
        "Shipping policy": "{{ shop.shipping_policy.url | default: '/policies/shipping-policy' }}",
        "Refund policy": "{{ shop.refund_policy.url | default: '/policies/refund-policy' }}",
        "Contact": "{{ routes.root_url }}pages/contact",
    }
    for label, url in links.items():
        footer = footer.replace(f'<li><a href="#">{label}</a></li>', f'<li><a href="{url}">{label}</a></li>')
    footer = footer.replace('href="mailto:hello@glasse.co">hello@glasse.co</a>',
                            'href="mailto:{{ settings.support_email }}">{{ settings.support_email }}</a>')
    footer = footer.replace('Distributed by glassé Beauty, Inc. · 228 Park Ave S, New York, NY 10003',
                            'Distributed by {{ settings.legal_name }} · {{ settings.legal_address }}')
    footer += '\n{% schema %}\n{ "name": "glassé footer", "settings": [] }\n{% endschema %}\n'
    (ROOT / "sections" / "glasse-footer.liquid").write_text(footer, encoding="utf-8")

    # ---- cart drawer (demo confirmation view is local-only)
    drawer = chunk(html, "<!-- SECTION: cart-drawer", '<script src="app.js"')
    drawer = re.sub(r"\s*<!-- Order confirmation \(demo\) -->.*?</div>\s*(?=</aside>)", "\n", drawer, flags=re.S)
    drawer = liquidize(drawer)
    drawer = drawer.replace("Add the duo · $39", "Add the duo")
    (ROOT / "snippets" / "glasse-drawer.liquid").write_text(drawer, encoding="utf-8")

    for p in list((ROOT / "snippets").glob("*.liquid")) + list((ROOT / "sections").glob("*.liquid")):
        size = len(p.read_text(encoding="utf-8").encode())
        assert size < MAX_LIQUID, f"{p.name} is {size} bytes"
    print("ok — header %d KB, landing %d KB, footer %d KB, drawer %d KB" % tuple(
        len((ROOT / d).read_text().encode()) // 1024 for d in
        ("sections/glasse-header.liquid", "snippets/glasse-landing.liquid", "sections/glasse-footer.liquid", "snippets/glasse-drawer.liquid")))


if __name__ == "__main__":
    main()
