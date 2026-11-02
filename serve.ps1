# Minimal static file server for Fretboard Trainer on http://localhost (no admin needed).
# It also keeps the disk copy of each profile's data in data\<name>\ (see js/disk.js, js/disklayout.js):
#   GET    /api/disk                              where the disk copy lives
#   GET    /api/data/<name>/kv.json|profile.json  read a file (empty if none);  PUT replaces it (old one kept as .bak)
#   GET    /api/data/<name>/attempts|runs         every run file of that kind, plus the flat file of earlier versions
#   POST   /api/data/<name>/attempts|runs/<file>.jsonl   append lines to one run file
#   DELETE /api/data/<name>/attempts|runs         keep the files aside as <kind>.bak-<stamp> (reset, import)
# Writes go straight through to the disk (write-through + flush) before the reply.
param([int]$Port = 8137, [switch]$Open)

$root = (Resolve-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path.TrimEnd('\') + '\'
$dataDir = Join-Path $root 'data'
$url = "http://localhost:$Port/"
$maxBody = 64MB
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8'
}
$utf8 = New-Object Text.UTF8Encoding($false)

function Log([string]$msg) { Write-Host ("{0:HH:mm:ss} {1}" -f (Get-Date), $msg) }

function Reply([int]$code, [string]$type, [byte[]]$bytes, [hashtable]$headers = @{}) { @{ code = $code; type = $type; bytes = $bytes; headers = $headers } }
function Text([int]$code, [string]$text) { Reply $code 'text/plain; charset=utf-8' $utf8.GetBytes($text) }

function Start-Listener {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add($url)
  $l.Start()
  $l
}

# Write bytes and make sure they reach the disk before returning.
function Write-Durable([string]$path, [byte[]]$bytes, [IO.FileMode]$mode) {
  $fs = New-Object IO.FileStream($path, $mode, [IO.FileAccess]::Write, [IO.FileShare]::Read, 4096, [IO.FileOptions]::WriteThrough)
  try {
    $fs.Write($bytes, 0, $bytes.Length)
    $fs.Flush($true)
  } finally {
    $fs.Dispose()
  }
}

function Append-Lines([string]$path, [byte[]]$bytes) {
  if ($bytes.Length -eq 0) { return }
  if ($bytes[$bytes.Length - 1] -ne 10) { $bytes += [byte]10 }
  # a line cut short by a crash stays on its own line, where the reader skips it
  if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 0) {
    $r = [IO.File]::OpenRead($path)
    try { [void]$r.Seek(-1, [IO.SeekOrigin]::End); $last = $r.ReadByte() } finally { $r.Dispose() }
    if ($last -ne 10) { $bytes = [byte[]](,[byte]10 + $bytes) }
  }
  Write-Durable $path $bytes ([IO.FileMode]::Append)
}

function Replace-File([string]$path, [byte[]]$bytes) {
  $tmp = "$path.tmp"
  Write-Durable $tmp $bytes ([IO.FileMode]::Create)
  if (Test-Path -LiteralPath $path) { [IO.File]::Replace($tmp, $path, "$path.bak") } else { [IO.File]::Move($tmp, $path) }
}

function Read-Body($req) {
  if ($req.ContentLength64 -gt $maxBody) { return $null }
  $ms = New-Object IO.MemoryStream
  $req.InputStream.CopyTo($ms)
  , $ms.ToArray()
}

function Invoke-Api($req, [string]$path) {
  # another site's page may send requests here (it can't read the answers, but it could write)
  $origin = $req.Headers['Origin']
  if ($origin -and $origin -ne "http://localhost:$Port") { return Text 403 'Forbidden origin' }
  if ($path -eq '/api/disk') {
    return Reply 200 'application/json' $utf8.GetBytes('{"dir":' + (ConvertTo-Json $dataDir) + '}')
  }
  if ($path -notmatch '^/api/data/([a-z0-9_-]{1,32})/(kv\.json|profile\.json|attempts|runs)(?:/((\d{8}-\d{6}-[a-z0-9]{1,16}|other)\.jsonl))?$') { return Text 404 'Unknown API path' }
  $dir = Join-Path $dataDir $Matches[1]
  $kind = $Matches[2]
  $file = $Matches[3]
  $isJson = $kind.EndsWith('.json')
  switch ($req.HttpMethod) {
    'GET' {
      if ($file) { return Text 405 'Read a kind as a whole' }
      # a file not written yet reads as empty
      if ($isJson) {
        $full = Join-Path $dir $kind
        if (Test-Path -LiteralPath $full) { return Reply 200 'text/plain; charset=utf-8' ([IO.File]::ReadAllBytes($full)) }
        return Text 200 ''
      }
      # the flat file of earlier versions first, then one file per run, each ending in a newline
      $parts = @("$dir\$kind.jsonl") + @(Get-ChildItem -LiteralPath "$dir\$kind" -Filter '*.jsonl' -File -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { $_.FullName })
      $ms = New-Object IO.MemoryStream
      foreach ($p in $parts) {
        if (-not (Test-Path -LiteralPath $p)) { continue }
        $b = [IO.File]::ReadAllBytes($p)
        $ms.Write($b, 0, $b.Length)
        if ($b.Length -gt 0 -and $b[$b.Length - 1] -ne 10) { $ms.WriteByte(10) }
      }
      return Reply 200 'text/plain; charset=utf-8' $ms.ToArray()
    }
    'PUT' {
      if (-not $isJson) { return Text 405 'Only the .json files are replaced whole' }
      $body = Read-Body $req
      if ($null -eq $body) { return Text 413 'Too large' }
      [void][IO.Directory]::CreateDirectory($dir)
      Replace-File (Join-Path $dir $kind) $body
      return Text 200 'saved'
    }
    'POST' {
      if (-not $file) { return Text 405 'Append to a run file' }
      $body = Read-Body $req
      if ($null -eq $body) { return Text 413 'Too large' }
      [void][IO.Directory]::CreateDirectory("$dir\$kind")
      Append-Lines "$dir\$kind\$file" $body
      return Text 200 'saved'
    }
    'DELETE' {
      # a reset or an import: the run files and the flat file are kept aside, the newest 3 sets
      if ($isJson -or $file) { return Text 405 'Delete a kind as a whole' }
      foreach ($f in "$kind.bak-*", "$kind.jsonl.bak-*") {
        Get-ChildItem -LiteralPath $dir -Filter $f -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 2 | Remove-Item -Recurse -Force
      }
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
      if (Test-Path -LiteralPath "$dir\$kind") { Move-Item -LiteralPath "$dir\$kind" "$dir\$kind.bak-$stamp" }
      if (Test-Path -LiteralPath "$dir\$kind.jsonl") { Move-Item -LiteralPath "$dir\$kind.jsonl" "$dir\$kind.jsonl.bak-$stamp" -Force }
      return Text 200 'cleared'
    }
  }
  Text 405 'Method not allowed'
}

# Static files answer conditional requests with 304 (ETag from size and modification time), so a
# reload re-reads only files that changed.
function Get-Static($req, [string]$path) {
  if ($path -eq '/') { $path = '/index.html' }
  $full = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
  $inData = $full.StartsWith($dataDir + '\', [StringComparison]::OrdinalIgnoreCase)
  if (-not $inData -and $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
    $item = Get-Item -LiteralPath $full
    $etag = '"{0:x}-{1:x}"' -f $item.Length, $item.LastWriteTimeUtc.Ticks
    $headers = @{ 'ETag' = $etag; 'Last-Modified' = $item.LastWriteTimeUtc.ToString('R') }
    if ($req.Headers['If-None-Match'] -eq $etag) { return Reply 304 '' @() $headers }
    $ext = [IO.Path]::GetExtension($full).ToLower()
    $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    return Reply 200 $type ([IO.File]::ReadAllBytes($full)) $headers
  }
  Text 404 'Not found'
}

# One request. Nothing may escape from here: a browser that cancels a request (a reload
# during a download, say) makes the write and the close fail, and that used to
# stop the whole server.
function Handle-Request($ctx) {
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    $r = if ($path.StartsWith('/api/')) { Invoke-Api $ctx.Request $path } else { Get-Static $ctx.Request $path }
    $res.StatusCode = $r.code
    if ($r.type) { $res.ContentType = $r.type }
    $res.Headers.Add('Cache-Control', 'no-cache')
    if ($r.headers) { foreach ($h in $r.headers.Keys) { $res.Headers[$h] = $r.headers[$h] } }
    if ($r.code -eq 304) { $res.Close(); return }
    $res.ContentLength64 = $r.bytes.Length
    if ($ctx.Request.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($r.bytes, 0, $r.bytes.Length) }
  } catch [System.Net.HttpListenerException], [System.IO.IOException] {
    # the browser went away mid-reply: nothing to do
  } catch {
    Log "Error on $($ctx.Request.HttpMethod) $($ctx.Request.Url.AbsolutePath): $($_.Exception.Message)"
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.Close() } catch { try { $res.Abort() } catch {} }
  }
}

try {
  $listener = Start-Listener
} catch {
  # most likely the server is already running in another window
  Write-Host "Port $Port is already in use: Fretboard Trainer is probably running already."
  if ($Open) { Start-Process $url }
  exit 0
}
Write-Host "Fretboard Trainer running at $url  (close this window or press Ctrl+C to stop)"
Write-Host "Disk copy of your data: $dataDir"
if ($Open) { Start-Process $url }

try {
  while ($true) {
    try {
      if (-not $listener.IsListening) {
        Log 'Listener stopped: restarting it'
        try { $listener.Close() } catch {}
        $listener = Start-Listener
      }
      $task = $listener.GetContextAsync()
      while (-not $task.AsyncWaitHandle.WaitOne(250)) { }
      Handle-Request $task.GetAwaiter().GetResult()
    } catch {
      # keep serving whatever happens; pause a little so a persistent fault doesn't spin
      Log "Server error: $($_.Exception.Message)"
      Start-Sleep -Milliseconds 500
    }
  }
} finally {
  try { $listener.Stop() } catch {}
}
