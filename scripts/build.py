#!/usr/bin/env python3
"""Deep Current build step: inject content JSON as an embedded fallback into
index.html so the app works even when the JSON files cannot be fetched
(offline / file://). The JSON files remain the source of truth; fetch is
tried first at runtime.
Usage: python3 scripts/build.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "index.html"

def embed(name, path, tag_id):
    data = json.loads((ROOT / path).read_text())
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # Never allow a literal "</script" inside an inline script block.
    text = text.replace("<", "\\u003c")
    return '<script type="application/json" id="%s">%s</script>' % (tag_id, text)

def main():
    html = HTML.read_text()
    html = html.replace("<!--EMBEDDED_THEMES_JSON-->",
                        embed("themes", "content/themes.json", "embedded-themes"))
    html = html.replace("<!--EMBEDDED_PISCES_JSON-->",
                        embed("pisces", "content/signs/pisces.json", "embedded-pisces"))
    HTML.write_text(html)
    print("injected embedded content into index.html")

if __name__ == "__main__":
    main()
