# Vector extraction reference

`DungeonBlitz.as` exercises 18 `Graphics.readGraphicsData` cases without networking: authored shapes, repeated reads, relative transforms, visibility, colors, fills, strokes, bitmaps and cubic paths. `flash32.json` is the Flash 32 reference output.

Compile the class into a disposable SWF with the reviewed game definitions and add its authored shape with `add-authored-shape.cjs`. That shape comes from Ruffle's `simplebutton_symbolclass` test at the pinned upstream commit and retains Ruffle's license. Declare the named timeline child as the source does; a sealed document class must expose it.

Call the fixture's `BlitzGraphicsReadProbe` callback through the guarded private fixture harness, save `{code:0,result:...}`, and compare:

```powershell
node research/native-player/graphics-reference/compare.cjs research/native-player/graphics-reference/flash32.json native-result.json
```

The comparison permits a closed polygon to start at another vertex without changing its edges or winding, and uses a 0.001 matrix tolerance. It does not normalize away missing geometry, changed colors, mutation after reading or erased authored shapes. An older native build returned no authored vectors and fails this reference.
