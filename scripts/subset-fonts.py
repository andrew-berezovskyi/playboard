"""Optional asset build: python -m pip install fonttools==4.66.1 brotli==1.2.0."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

font_directory = Path(__file__).resolve().parents[1] / "apps/web/public/fonts"
# Latin, Ukrainian/Cyrillic, combining marks, UI punctuation and symbols.
ranges = [(0x0000, 0x024F), (0x0300, 0x036F), (0x0400, 0x052F),
          (0x1E00, 0x1EFF), (0x2000, 0x206F), (0x20A0, 0x20CF),
          (0x2190, 0x21FF), (0x25A0, 0x25FF), (0xFFFD, 0xFFFD)]
unicodes = {code for first, last in ranges for code in range(first, last + 1)}
for source in font_directory.glob("*.woff2"):
    if ".subset." in source.name:
        continue
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "clig", "calt", "locl", "mark", "mkmk"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    font = subset.load_font(str(source), options)
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=unicodes)
    worker.subset(font)
    destination = source.with_name(source.stem + ".subset.woff2")
    subset.save_font(font, str(destination), options)
    with TTFont(destination) as result:
        cmap = result.getBestCmap()
        assert all(ord(character) in cmap for character in "ґҐєЄїЇіІABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
    print(f"{source.name}: {source.stat().st_size} -> {destination.stat().st_size} bytes")
