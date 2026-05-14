import { NextResponse } from 'next/server';
import ytdl from 'youtube-dl-exec';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing YouTube URL' }, { status: 400 });
  }

  try {
    const output: any = await ytdl(url, {
      dumpJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0'
      ]
    });

    const format = output.formats.find((f: any) => f.format_id === '18') || 
                   output.formats.find((f: any) => f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none');
    
    if (!format || !format.url) {
      return NextResponse.json({ error: 'No suitable video format found' }, { status: 404 });
    }
    
    // Fetch the actual video stream
    const videoResponse = await fetch(format.url, {
      headers: {
        'Range': request.headers.get('range') || 'bytes=0-',
      }
    });

    // Create a new response proxying the video stream and headers
    const headers = new Headers(videoResponse.headers);
    headers.set('Access-Control-Allow-Origin', '*'); // Ensure CORS is allowed

    return new NextResponse(videoResponse.body, {
      status: videoResponse.status,
      statusText: videoResponse.statusText,
      headers
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
