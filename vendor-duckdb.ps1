# Downloads a pinned DuckDB-WASM build into vendor/duckdb so the app runs offline.
# Re-run with another -Version to upgrade (then bump the cache name in sw.js).
param([string]$Version = '1.33.1-dev110.0')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$out = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'vendor\duckdb'
New-Item -ItemType Directory -Force $out | Out-Null
$cdn = 'https://cdn.jsdelivr.net/npm'

function Get-Text($url) { (Invoke-WebRequest $url -UseBasicParsing).Content }
function Save-Text($name, $text) { [IO.File]::WriteAllText((Join-Path $out $name), $text, (New-Object Text.UTF8Encoding $false)) }

# ES modules from jsDelivr's +esm bundles, with their absolute imports pointed at the local copies
Save-Text 'tslib.mjs' (Get-Text "$cdn/tslib@2.6.3/+esm")
Save-Text 'flatbuffers.mjs' (Get-Text "$cdn/flatbuffers@24.3.25/+esm")
$arrow = (Get-Text "$cdn/apache-arrow@17.0.0/+esm").Replace('"/npm/flatbuffers@24.3.25/+esm"', '"./flatbuffers.mjs"').Replace('"/npm/tslib@2.6.3/+esm"', '"./tslib.mjs"')
Save-Text 'apache-arrow.mjs' $arrow
$duck = (Get-Text "$cdn/@duckdb/duckdb-wasm@$Version/+esm").Replace('"/npm/apache-arrow@17.0.0/+esm"', '"./apache-arrow.mjs"')
Save-Text 'duckdb-wasm.mjs' $duck

# engine: single-threaded bundle (the threaded one needs cross-origin isolation headers)
foreach ($f in 'duckdb-base.wasm', 'duckdb-browser-base.worker.js') {
  Invoke-WebRequest "$cdn/@duckdb/duckdb-wasm@$Version/dist/$f" -OutFile (Join-Path $out $f) -UseBasicParsing
}

# drop sourcemap references to files we don't ship
Get-ChildItem $out -Include *.mjs, *.js -Recurse | ForEach-Object {
  $t = [IO.File]::ReadAllText($_.FullName)
  $t = [regex]::Replace($t, '(?m)^//# sourceMappingURL=.*$', '')
  [IO.File]::WriteAllText($_.FullName, $t, (New-Object Text.UTF8Encoding $false))
}
# Durability patch: in this build the OPFS file-sync hook is empty, so DuckDB's fsync
# (done by every CHECKPOINT) never reaches the disk and data can be lost when the tab
# closes. Make it flush the file's OPFS access handle.
$worker = Join-Path $out 'duckdb-browser-base.worker.js'
$t = [IO.File]::ReadAllText($worker)
$noop = 'syncFile:(l,r)=>{}'
$flush = 'syncFile:(l,r)=>{let a=k.getFileInfo(l,r);if((a==null?void 0:a.dataProtocol)===3){let h=k._files==null?void 0:k._files.get(a.fileName);h&&typeof h.flush=="function"&&h.flush()}}'
if ($t.Contains($noop)) { [IO.File]::WriteAllText($worker, $t.Replace($noop, $flush), (New-Object Text.UTF8Encoding $false)) }
else { Write-Warning 'syncFile patch not applied: check whether this version still needs it (see js/storage.js flush)' }

Save-Text 'VERSION' "@duckdb/duckdb-wasm@$Version`n"
Get-ChildItem $out | ForEach-Object { '{0,10}  {1}' -f $_.Length, $_.Name }
