# Builds public/fonts/material-symbols-outlined-subset.woff2 containing only the
# Material Symbols glyphs this app uses. Scans the source for quoted name-like
# tokens and keeps every one that the font actually has a ligature for, so icons
# referenced inside ternaries/variables are caught too.
#
# Usage: python scripts/subset-icons.py
# Requires: pip install fonttools brotli
import glob, re, sys
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = __import__('os').path.dirname(__file__) or '.'
SRC = f'{ROOT}/../node_modules/material-symbols/material-symbols-outlined.woff2'
OUT = f'{ROOT}/../public/fonts/material-symbols-outlined-subset.woff2'
LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789_'

font = TTFont(SRC)
# inline ExtensionSubst so ligature rules can be pruned individually
for lk in font['GSUB'].table.LookupList.Lookup:
    if lk.LookupType == 7:
        lk.LookupType = lk.SubTable[0].ExtensionLookupType
        lk.SubTable = [st.ExtSubTable for st in lk.SubTable]

cmap = font.getBestCmap()
g = lambda ch: cmap[ord(ch)]
available = {}  # ligature sequence -> glyph name
for lk in font['GSUB'].table.LookupList.Lookup:
    for st in lk.SubTable:
        e = getattr(st, 'ExtSubTable', st)
        if not hasattr(e, 'ligatures'):
            continue
        for first, ligs in e.ligatures.items():
            for L in ligs:
                available[tuple([first] + list(L.Component))] = L.LigGlyph

# every quoted name-like string in the source tree, kept only if the font has it
tokens = set()
for f in glob.glob(f'{ROOT}/../app/**/*.*sx', recursive=True) + glob.glob(f'{ROOT}/../components/**/*.tsx', recursive=True) + glob.glob(f'{ROOT}/../lib/**/*.ts', recursive=True):
    tokens.update(re.findall(r"[\'\"]([a-z][a-z0-9_]{2,})[\'\"]", open(f, encoding='utf8').read()))
names = sorted(t for t in tokens if tuple(g(c) for c in t) in available)
print(f'icons used: {len(names)}')

# unicode closure keeps every ligature whose letters exist, so drop unwanted rules explicitly
wanted = {tuple(g(c) for c in n) for n in names}
for lk in font['GSUB'].table.LookupList.Lookup:
    for st in lk.SubTable:
        e = getattr(st, 'ExtSubTable', st)
        if not hasattr(e, 'ligatures'):
            continue
        e.ligatures = {first: [L for L in ligs if tuple([first] + list(L.Component)) in wanted]
                       for first, ligs in e.ligatures.items()
                       if any(tuple([first] + list(L.Component)) in wanted for L in ligs)}

glyphs = {available[tuple(g(c) for c in n)] for n in names}
opts = subset.Options()
opts.flavor = 'woff2'
opts.hinting = False
opts.notdef_outline = True
opts.name_IDs = []
opts.recalc_timestamp = False
opts.layout_features = ['rlig']
s = subset.Subsetter(options=opts)
s.populate(glyphs=list(glyphs), text=LETTERS)
s.subset(font)
font.save(OUT)

# stamp the subset URL in globals.css with the file hash, so browsers never serve a stale icon font
import hashlib
h = hashlib.md5(open(OUT, 'rb').read()).hexdigest()[:10]
css_p = f'{ROOT}/../app/globals.css'
css = open(css_p, encoding='utf8').read()
import re as _re
css2 = _re.sub(r"material-symbols-outlined-subset\.woff2\?v=[0-9a-f]+", f"material-symbols-outlined-subset.woff2?v={h}", css)
if css2 != css:
    open(css_p, 'w', encoding='utf8').write(css2)
    print(f'version stamped: {h}')

# verify every used name still resolves in the subset
out = TTFont(OUT)
ocmap = out.getBestCmap()
og = {c: ocmap[ord(c)] for c in LETTERS if ord(c) in ocmap}
kept = set()
for lk in out['GSUB'].table.LookupList.Lookup:
    for st in lk.SubTable:
        e = getattr(st, 'ExtSubTable', st)
        if hasattr(e, 'ligatures'):
            for first, ligs in e.ligatures.items():
                for L in ligs:
                    kept.add(tuple([first] + list(L.Component)))
broken = [n for n in names if tuple(og[c] for c in n) not in kept]
print('verified ok' if not broken else f'BROKEN: {broken}')
sys.exit(0 if not broken else 1)
