# Minimal static file server for Fretboard Trainer on http://localhost (no admin needed).
# It also keeps the disk copy of each user's data in data\<user>\ (see js/disk.js):
#   GET  /api/disk                          where the disk copy lives
#   GET  /api/data/<user>/<file>            read kv.json, attempts.jsonl or runs.jsonl (empty if none)
#   POST /api/data/<user>/<file>.jsonl      append lines
#   PUT  /api/data/<user>/<file>            replace the whole file (old one kept as .bak)
# Writes go straight through to the disk (write-through + flush) before the reply.
param([int]$Port = 8137, [switch]$Open)

$root = (Resolve-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path.TrimEnd('\') + '\'
$dataDir = Join-Path $root 'data'
$url = "http://localhost:$Port/"
$maxBody = 64MB
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.wasm' = 'application/wasm'; '.mjs' = 'text/javascript; charset=utf-8'
  '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8'
}
$utf8 = New-Object Text.UTF8Encoding($false)

function Log([string]$msg) { Write-Host ("{0:HH:mm:ss} {1}" -f (Get-Date), $msg) }

function Reply([int]$code, [string]$type, [byte[]]$bytes) { @{ code = $code; type = $type; bytes = $bytes } }
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
  if ($path -eq '/api/disk') {
    return Reply 200 'application/json' $utf8.GetBytes('{"dir":' + (ConvertTo-Json $dataDir) + '}')
  }
  if ($path -notmatch '^/api/data/([a-z0-9_-]{1,32})/(kv\.json|attempts\.jsonl|runs\.jsonl)$') { return Text 404 'Unknown API path' }
  $dir = Join-Path $dataDir $Matches[1]
  $file = $Matches[2]
  $full = Join-Path $dir $file
  switch ($req.HttpMethod) {
    'GET' {
      # a file not written yet reads as empty
      if (Test-Path -LiteralPath $full) { return Reply 200 'text/plain; charset=utf-8' ([IO.File]::ReadAllBytes($full)) }
      return Text 200 ''
    }
    { $_ -in 'POST', 'PUT' } {
      if ($req.HttpMethod -eq 'POST' -and $file -notlike '*.jsonl') { return Text 405 'Only .jsonl files can be appended to' }
      $body = Read-Body $req
      if ($null -eq $body) { return Text 413 'Too large' }
      [void][IO.Directory]::CreateDirectory($dir)
      if ($req.HttpMethod -eq 'POST') { Append-Lines $full $body } else { Replace-File $full $body }
      return Text 200 'saved'
    }
  }
  Text 405 'Method not allowed'
}

function Get-Static([string]$path) {
  if ($path -eq '/') { $path = '/index.html' }
  $full = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
  $inData = $full.StartsWith($dataDir + '\', [StringComparison]::OrdinalIgnoreCase)
  if (-not $inData -and $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
    $ext = [IO.Path]::GetExtension($full).ToLower()
    $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    return Reply 200 $type ([IO.File]::ReadAllBytes($full))
  }
  Text 404 'Not found'
}

# One request. Nothing may escape from here: a browser that cancels a request (a reload
# during the DuckDB download, say) makes the write and the close fail, and that used to
# stop the whole server.
function Handle-Request($ctx) {
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    $r = if ($path.StartsWith('/api/')) { Invoke-Api $ctx.Request $path } else { Get-Static $path }
    $res.StatusCode = $r.code
    $res.ContentType = $r.type
    $res.Headers.Add('Cache-Control', 'no-cache')
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
