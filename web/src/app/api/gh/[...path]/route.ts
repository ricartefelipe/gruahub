import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function upstreamBase(): string {
  const raw =
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    'http://localhost:8080';
  if (raw.startsWith('/')) {
    return 'http://backend:8080';
  }
  return raw.replace(/\/$/, '');
}

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = (ctx.params.path ?? []).join('/');
  if (!path) {
    return NextResponse.json({ title: 'Not Found', status: 404 }, { status: 404 });
  }

  const target = `${upstreamBase()}/api/v1/${path}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json(
      { title: 'Bad Gateway', detail: 'API indisponível', status: 502 },
      { status: 502 }
    );
  }

  const outHeaders = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) outHeaders.set('content-type', contentType);

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, { status: upstream.status, headers: outHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
