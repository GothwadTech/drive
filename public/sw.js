self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data === 'CLAIM' || event.data?.type === 'CLAIM') {
    self.clients.claim();
  }
});


self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/stream/')) {
    event.respondWith(handleStream(event.request));
  }
});

async function handleStream(request) {
  const url = new URL(request.url);
  const fileId = decodeURIComponent(url.pathname.split('/stream/')[1]);
  const rangeHeader = request.headers.get('Range');

  let clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  let matchAttempts = 0;
  while (clients.length === 0 && matchAttempts < 10) {
    await new Promise((r) => setTimeout(r, 50));
    clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    matchAttempts++;
  }

  if (clients.length === 0) {
    return new Response("No active window after SW wakeup", { status: 500 });
  }

  // Pick visible client or fallback to first client
  const client = clients.find((c) => c.visibilityState === 'visible') || clients[0];

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    let controllerRef = null;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(new Response("Stream response timed out", { status: 504 }));
      }
    }, 30000);

    const stream = new ReadableStream({
      start(controller) {
        controllerRef = controller;
      },
      cancel() {
        try {
          messageChannel.port1.postMessage({ type: 'ABORT' });
        } catch (_) {}
      },
    });

    messageChannel.port1.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'HEADER') {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const status = data.status || (rangeHeader ? 206 : 200);
          const contentLength = data.contentLength ?? Math.max(0, data.end - data.start + 1);

          const headers = {
            'Accept-Ranges': 'bytes',
            'Content-Length': contentLength.toString(),
            'Content-Type': data.mimeType || 'application/octet-stream',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*',
          };

          if (status === 206) {
            headers['Content-Range'] = `bytes ${data.start}-${data.end}/${data.totalSize}`;
          }

          resolve(new Response(stream, { status, headers }));
        }
      } else if (data.type === 'CHUNK') {
        if (controllerRef && data.chunk) {
          try {
            controllerRef.enqueue(new Uint8Array(data.chunk));
          } catch (err) {
            console.warn('[SW] Error enqueuing chunk:', err);
          }
        }
      } else if (data.type === 'END') {
        if (controllerRef) {
          try {
            controllerRef.close();
          } catch (_) {}
        }
      } else if (data.type === 'ERROR') {
        if (controllerRef) {
          try {
            controllerRef.error(new Error(data.error || 'Stream error'));
          } catch (_) {}
        }
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(new Response(data.error || 'Stream Error', { status: data.status || 500 }));
        }
      }
    };

    client.postMessage(
      {
        type: 'FETCH_STREAM',
        fileId,
        range: rangeHeader,
      },
      [messageChannel.port2]
    );
  });
}

