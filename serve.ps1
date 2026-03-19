$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:8080/"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".txt" = "text/plain; charset=utf-8"
}

function Get-ContentType($path) {
  $extension = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  if ($mimeTypes.ContainsKey($extension)) {
    return $mimeTypes[$extension]
  }

  return "application/octet-stream"
}

$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "Serving $root at $prefix"
Write-Host "Press Ctrl+C to stop."

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = $context.Request.Url.AbsolutePath.TrimStart("/")

    if ([string]::IsNullOrWhiteSpace($requestPath)) {
      $requestPath = "index.html"
    }

    $localPath = Join-Path $root $requestPath

    if ((Test-Path $localPath) -and -not (Get-Item $localPath).PSIsContainer) {
      $bytes = [System.IO.File]::ReadAllBytes($localPath)
      $context.Response.ContentType = Get-ContentType $localPath
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $context.Response.StatusCode = 404
      $message = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
      $context.Response.ContentType = "text/plain; charset=utf-8"
      $context.Response.ContentLength64 = $message.Length
      $context.Response.OutputStream.Write($message, 0, $message.Length)
    }

    $context.Response.OutputStream.Close()
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
